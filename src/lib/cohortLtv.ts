/**
 * Когортний LTV — чиста математика, спільна для сервера і UI.
 *
 * Виділено в окремий модуль, щоб її можна було перевірити тестами: server.ts
 * викликає startServer() на верхньому рівні, тож імпортувати щось із нього
 * означає підняти застосунок.
 */

/** Один клієнт у вигляді, потрібному для розрахунку когорт */
export interface CohortLtvInput {
  /** Дохід по місяцях: { 'YYYY-MM': сума } */
  monthlyRevenue: Record<string, number>;
}

/** Рядок матриці: одна когорта (місяць першої покупки) */
export interface CohortLtvRow {
  /** Місяць першої покупки, 'YYYY-MM' */
  month: string;
  /** Скільки клієнтів у когорті */
  size: number;
  /** Скільки місяців когорта встигла прожити — далі даних ще не існує */
  maxOffset: number;
  /** Накопичений середній дохід на клієнта: { зміщення в місяцях: сума } */
  ltvByOffset: Record<number, number>;
}

export interface CohortLtvHorizon {
  ltv: number;
  /** Скільки когорт дожило до цього горизонту */
  cohorts: number;
  /** Скільки клієнтів вони сумарно охоплюють */
  clients: number;
}

export interface CohortLtvResult {
  rows: CohortLtvRow[];
  horizons: Record<number, CohortLtvHorizon | null>;
}

/** Горизонти (в місяцях), для яких рахуємо зведений LTV */
export const LTV_HORIZONS = [3, 6, 12, 24];

/** Різниця в місяцях між двома мітками 'YYYY-MM' */
export function monthDiff(from: string, to: string): number {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/**
 * Середній накопичений дохід з клієнта через N місяців після ПЕРШОЇ покупки,
 * у розрізі когорт (місяць першої покупки).
 *
 * Чому не просто «дохід ÷ клієнти»: те середнє змішує клієнта, який купує три
 * роки, з клієнтом, який прийшов учора, тож воно завжди занижене і не
 * порівнюване між періодами. Когортна розбивка натомість показує, як росте
 * цінність клієнта з часом і чи стають нові когорти кращими за старі.
 *
 * Когорта потрапляє в горизонт N, лише якщо прожила щонайменше N місяців —
 * інакше свіжі когорти тягнули б середнє вниз просто тому, що не дозріли.
 *
 * @param currentMonth поточний місяць 'YYYY-MM' — визначає, доки когорта дозріла
 */
export function buildCohortLtv(clients: CohortLtvInput[], currentMonth: string): CohortLtvResult {
  const cohorts = new Map<string, { size: number; revenueByOffset: Map<number, number> }>();

  for (const c of clients) {
    const months = Object.keys(c.monthlyRevenue || {}).sort();
    if (months.length === 0) continue;

    const firstMonth = months[0];
    let cohort = cohorts.get(firstMonth);
    if (!cohort) {
      cohort = { size: 0, revenueByOffset: new Map() };
      cohorts.set(firstMonth, cohort);
    }
    cohort.size++;

    for (const m of months) {
      const offset = monthDiff(firstMonth, m);
      if (offset < 0) continue;
      cohort.revenueByOffset.set(offset, (cohort.revenueByOffset.get(offset) || 0) + c.monthlyRevenue[m]);
    }
  }

  const rows: CohortLtvRow[] = Array.from(cohorts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { size, revenueByOffset }]) => {
      // Когорта не може «дозріти» далі за поточний місяць, навіть якщо в даних
      // раптом трапиться покупка з майбутньою датою.
      const maxOffset = Math.max(0, monthDiff(month, currentMonth));
      const ltvByOffset: Record<number, number> = {};
      let cumulative = 0;
      for (let k = 0; k <= maxOffset; k++) {
        cumulative += revenueByOffset.get(k) || 0;
        ltvByOffset[k] = Math.round(cumulative / size);
      }
      return { month, size, maxOffset, ltvByOffset };
    });

  const horizons: Record<number, CohortLtvHorizon | null> = {};
  for (const h of LTV_HORIZONS) {
    const mature = rows.filter(r => r.maxOffset >= h);
    const clients = mature.reduce((s, r) => s + r.size, 0);
    horizons[h] = clients > 0
      ? {
          // Зважуємо за розміром когорти, щоб дрібна когорта не важила як велика
          ltv: Math.round(mature.reduce((s, r) => s + r.ltvByOffset[h] * r.size, 0) / clients),
          cohorts: mature.length,
          clients,
        }
      : null;
  }

  return { rows, horizons };
}

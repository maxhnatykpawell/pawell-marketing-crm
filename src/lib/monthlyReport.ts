/**
 * Місячний звіт — математика без React і без мережі (див. monthlyReport.test.ts).
 *
 * Відрізняється від решти аналітики не глибиною, а питанням. Решта відповідає
 * «хто наші клієнти»: фільтри, тіри, сегменти, зріз за довільний період. Тут
 * питання інше — «що сталось у серпні порівняно з липнем»: закритий місяць,
 * фіксований набір показників і той самий набір щомісяця, щоб два звіти поруч
 * можна було читати як один ряд.
 *
 * Через це звіт НЕ залежить від фільтрів вибірки: місячний звіт про частину
 * бази — це звіт, під яким не можна підписатись, бо читач не бачить, що саме
 * від нього відрізали. Усі числа тут — по всій базі.
 *
 * Джерело даних — `monthlyStats` клієнта: дохід і угоди по месяцях уже лежать
 * у знімку LTV, тож звіт не потребує ні окремої синхронізації, ні звернення до
 * CRM. У знімках старого формату сум по місяцях немає — такий звіт неможливий,
 * і це видно по `hasMonthlyStats`.
 */

import { ClientRecord, MonthStats, getPurchaseMonths } from './clientAnalytics';
import {
  pctChange, sumSpend, computeCac, cacBySource, normalizeSource,
  CacExpenseInput, CurrencyRates, SourceCacResult,
} from './cac';
import { pluralUk } from './plural';

// ── Місяці ────────────────────────────────────────────────────────────────────

const MONTH_NAMES_UK = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
] as const;

/** 'YYYY-MM' → 'Серпень 2026'. Невпізнане віддаємо як є, а не ламаємось */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return month;
  return `${MONTH_NAMES_UK[idx]} ${m[1]}`;
}

/**
 * Місяць у місцевому відмінку: 'у липні 2026'.
 *
 * Потрібен саме він, бо всі порівняння в тексті звучать як «ніж у липні» і
 * «рік тому, у серпні» — з називним відмінком виходить «більше за липень 2026»,
 * що читається як назва документа, а не як речення.
 */
const MONTH_NAMES_UK_IN = [
  'січні', 'лютому', 'березні', 'квітні', 'травні', 'червні',
  'липні', 'серпні', 'вересні', 'жовтні', 'листопаді', 'грудні',
] as const;

export function monthLabelIn(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return month;
  return `${MONTH_NAMES_UK_IN[idx]} ${m[1]}`;
}

/**
 * Зсув на N місяців. Через UTC-дату, а не арифметику над рядком: грудень +1
 * має давати січень наступного року, і цю логіку не варто писати вручну.
 */
export function shiftMonth(month: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Місяць, у якому ми зараз */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Останній ЗАКРИТИЙ місяць — типовий звітний.
 *
 * Поточний місяць за замовчуванням не беремо: звіт за 3 число виглядав би як
 * обвал, і саме так його б і прочитали.
 */
export function lastClosedMonth(now: Date = new Date()): string {
  return shiftMonth(currentMonth(now), -1);
}

const MONTH_NAMES_UK_GEN = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
] as const;

/** 'YYYY-MM-DD' → '28 вересня 2026' — для підпису «станом на» */
export function dayLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return date;
  return `${Number(m[3])} ${MONTH_NAMES_UK_GEN[idx]} ${m[1]}`;
}

/**
 * Де саме зараз місяць: закінчився чи триває, і станом на яке число.
 *
 * Звіт за місяць, що триває, — це нормальний запит: його дивляться 28-го, щоб
 * зрозуміти, з чим закриваються. Ненормально інше — мовчати про те, що місяць
 * неповний, або, навпаки, ховати числа під написом «місяць не закінчився».
 * Тому звіт малюється завжди, але з датою: «станом на 28 вересня».
 */
export interface MonthProgress {
  month: string;
  /** Останній день, за який є сенс рахувати: кінець місяця або сьогодні */
  asOf: string;
  /** Скільки днів місяця вже минуло, включно з сьогоднішнім */
  daysElapsed: number;
  daysInMonth: number;
  /** Місяць ще триває — числа неповні за визначенням */
  partial: boolean;
}

export function monthProgress(month: string, now: Date = new Date()): MonthProgress {
  const { to } = monthBounds(month);
  const today = now.toISOString().slice(0, 10);
  const daysInMonth = Number(to.slice(8, 10));

  // Майбутній місяць теж можливий (стрілка вперед на межі доби) — тоді нуль днів
  if (today < `${month}-01`) {
    return { month, asOf: `${month}-01`, daysElapsed: 0, daysInMonth, partial: true };
  }
  if (today >= to) {
    return { month, asOf: to, daysElapsed: daysInMonth, daysInMonth, partial: false };
  }
  return { month, asOf: today, daysElapsed: Number(today.slice(8, 10)), daysInMonth, partial: true };
}

/**
 * Той самий відрізок попереднього місяця.
 *
 * Для неповного місяця це єдина чесна база: 28 днів вересня треба порівнювати
 * з 28 днями серпня, а не з усім серпнем — інакше кожен звіт, зроблений до
 * кінця місяця, показує падіння, якого немає.
 *
 * Якщо в попередньому місяці менше днів (31 березня → лютий), відрізок
 * обрізається його довжиною.
 */
export function sameSpanPrevMonth(month: string, asOf: string): { from: string; to: string } {
  const prev = shiftMonth(month, -1);
  const prevEnd = monthBounds(prev).to;
  const day = Math.min(Number(asOf.slice(8, 10)), Number(prevEnd.slice(8, 10)));
  return { from: `${prev}-01`, to: `${prev}-${String(day).padStart(2, '0')}` };
}

/** Межі місяця як YYYY-MM-DD — для вибірки витрат, що лежать по днях */
export function monthBounds(month: string): { from: string; to: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return { from: month, to: month };
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

// ── Підготовка ────────────────────────────────────────────────────────────────

/**
 * Клієнт, зведений до того, що потрібно місячному звіту.
 *
 * Готується один раз на звіт: тренд рахує ті самі 12 місяців по тих самих
 * клієнтах, і сортувати ключі `monthlyStats` заново на кожен місяць означало б
 * платити за це дванадцять разів.
 */
export interface PreparedClient {
  id: string;
  name: string;
  /** Місяць першої РЕАЛЬНОЇ активності; null — активності немає взагалі */
  first: string | null;
  stats: Record<string, MonthStats>;
  /** Надходження по місяцях (касово) — див. `ClientRecord.monthlyPaid` */
  paid: Record<string, number>;
}

/** Чи був місяць живим: угода або хоч якийсь рух грошей (у т.ч. повернення) */
function isActive(s: MonthStats | undefined): s is MonthStats {
  return !!s && (s.deals !== 0 || s.revenue !== 0);
}

/**
 * Місяць першої активності.
 *
 * Не `getPurchaseMonths(c)[0]`: у `monthlyStats` трапляються порожні місяці
 * (нуль угод, нуль доходу), і найраніший з них зробив би «постійним» клієнта,
 * який насправді купує вперше.
 */
export function firstActiveMonth(c: ClientRecord): string | null {
  if (c.monthlyStats) {
    let best: string | null = null;
    for (const [m, s] of Object.entries(c.monthlyStats)) {
      if (isActive(s) && (best === null || m < best)) best = m;
    }
    // Саме null, а не найраніший ключ: якщо всі місяці порожні, то першої
    // покупки не було, а `getPurchaseMonths` повернув би ті самі порожні місяці.
    return best;
  }
  // Старий формат: сум немає, але перелік місяців покупок є
  return getPurchaseMonths(c)[0] ?? null;
}

export function prepareClients(clients: ClientRecord[]): PreparedClient[] {
  return clients.map(c => ({
    id: c.id,
    name: c.name,
    first: firstActiveMonth(c),
    stats: c.monthlyStats ?? {},
    paid: c.monthlyPaid ?? {},
  }));
}

/** Чи взагалі є в даних помісячні суми — без них місячний звіт неможливий */
export function hasMonthlyStats(clients: ClientRecord[]): boolean {
  return clients.some(c => !!c.monthlyStats);
}

/** Чи синхронізувались оплати — у старих знімках є лише законтрактоване */
export function hasPaidStats(clients: ClientRecord[]): boolean {
  return clients.some(c => !!c.monthlyPaid);
}

/**
 * Місяці, за які є хоч одна активність — від найновішого.
 *
 * Це список, з якого вибирають звітний місяць: пропонувати порожні місяці
 * означало б пропонувати порожній звіт.
 */
export function availableMonths(clients: ClientRecord[]): string[] {
  const seen = new Set<string>();
  for (const c of clients) {
    if (c.monthlyStats) {
      for (const [m, s] of Object.entries(c.monthlyStats)) if (isActive(s)) seen.add(m);
    } else {
      for (const m of getPurchaseMonths(c)) seen.add(m);
    }
  }
  return [...seen].sort().reverse();
}

// ── Показники місяця ──────────────────────────────────────────────────────────

export interface MonthTotals {
  month: string;
  /** Законтрактовано: сума угод, укладених у місяці */
  revenue: number;
  /**
   * Оплачено: гроші, що надійшли на рахунок у місяці — за будь-які угоди, і
   * нові, і минулих місяців. Тому може бути більшим за `revenue`.
   */
  paid: number;
  deals: number;
  /** Клієнтів з активністю в місяці */
  clients: number;
  /** Дохід ÷ угоди */
  avgCheck: number;
  /** Дохід ÷ активні клієнти */
  arpu: number;
  /** Ті, у кого це перший місяць покупок */
  newClients: number;
  newRevenue: number;
  newDeals: number;
  /** Ті, хто купував і до цього місяця */
  returningClients: number;
  returningRevenue: number;
  returningDeals: number;
}

const EMPTY_TOTALS = (month: string): MonthTotals => ({
  month, revenue: 0, paid: 0, deals: 0, clients: 0, avgCheck: 0, arpu: 0,
  newClients: 0, newRevenue: 0, newDeals: 0,
  returningClients: 0, returningRevenue: 0, returningDeals: 0,
});

function totalsOf(prepared: PreparedClient[], month: string): MonthTotals {
  const t = EMPTY_TOTALS(month);

  for (const c of prepared) {
    // До isActive: доплата за старий контракт — гроші місяця, хоч угоди в ньому й немає
    t.paid += c.paid[month] ?? 0;

    const s = c.stats[month];
    if (!isActive(s)) continue;

    t.clients += 1;
    t.revenue += s.revenue;
    t.deals += s.deals;

    // Перший активний місяць збігається зі звітним — клієнт залучений саме тут
    if (c.first === null || c.first >= month) {
      t.newClients += 1;
      t.newRevenue += s.revenue;
      t.newDeals += s.deals;
    } else {
      t.returningClients += 1;
      t.returningRevenue += s.revenue;
      t.returningDeals += s.deals;
    }
  }

  t.revenue = Math.round(t.revenue);
  t.paid = Math.round(t.paid);
  t.newRevenue = Math.round(t.newRevenue);
  t.returningRevenue = Math.round(t.returningRevenue);
  t.avgCheck = t.deals > 0 ? Math.round(t.revenue / t.deals) : 0;
  t.arpu = t.clients > 0 ? Math.round(t.revenue / t.clients) : 0;
  return t;
}

export function computeMonthTotals(clients: ClientRecord[], month: string): MonthTotals {
  return totalsOf(prepareClients(clients), month);
}

/** Ряд місяців, що закінчується звітним — за зростанням, як читають графік */
export function buildTrend(
  clients: ClientRecord[],
  endMonth: string,
  months = 12,
): MonthTotals[] {
  return trendOf(prepareClients(clients), endMonth, months);
}

function trendOf(prepared: PreparedClient[], endMonth: string, months: number): MonthTotals[] {
  const out: MonthTotals[] = [];
  for (let i = months - 1; i >= 0; i--) out.push(totalsOf(prepared, shiftMonth(endMonth, -i)));
  return out;
}

// ── Рух клієнтів ──────────────────────────────────────────────────────────────

/**
 * Що сталось із клієнтом між попереднім місяцем і звітним.
 *
 *  'new'         — залучений цього місяця (перша покупка тут);
 *  'kept'        — купував і минулого місяця, і цього;
 *  'reactivated' — купував колись, минулого місяця не купував, цього повернувся;
 *  'lost'        — купував минулого місяця, цього не купував.
 *
 * Чотири групи, а не дві, бо «клієнтів стало більше» нічого не означає:
 * зростання на нових і зростання на поверненнях лікуються різним.
 */
export type MovementKind = 'new' | 'kept' | 'reactivated' | 'lost';

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  new:         'Нові',
  kept:        'Залишились',
  reactivated: 'Повернулись',
  lost:        'Перестали купувати',
};

export interface ClientMovement {
  id: string;
  name: string;
  kind: MovementKind;
  /** Дохід і угоди у звітному місяці */
  revenue: number;
  deals: number;
  /** Те саме в попередньому місяці */
  prevRevenue: number;
  prevDeals: number;
  /** Різниця доходу, грн — для 'lost' завжди від'ємна */
  delta: number;
  /** Місяць першої покупки — щоб було видно, наскільки давній це клієнт */
  first: string | null;
}

export interface MovementGroup {
  kind: MovementKind;
  clients: ClientMovement[];
  /** Дохід групи у звітному місяці; для 'lost' — скільки вона давала минулого */
  revenue: number;
  deals: number;
}

export type MovementGroups = Record<MovementKind, MovementGroup>;

function movementsOf(prepared: PreparedClient[], month: string): MovementGroups {
  const prev = shiftMonth(month, -1);
  const rows: ClientMovement[] = [];

  for (const c of prepared) {
    const cur = c.stats[month];
    const pre = c.stats[prev];
    const curActive = isActive(cur);
    const preActive = isActive(pre);
    if (!curActive && !preActive) continue;

    const revenue = curActive ? Math.round(cur.revenue) : 0;
    const prevRevenue = preActive ? Math.round(pre.revenue) : 0;

    const kind: MovementKind = !curActive
      ? 'lost'
      : c.first === null || c.first >= month
        ? 'new'
        : preActive ? 'kept' : 'reactivated';

    rows.push({
      id: c.id,
      name: c.name,
      kind,
      revenue,
      deals: curActive ? cur.deals : 0,
      prevRevenue,
      prevDeals: preActive ? pre.deals : 0,
      delta: revenue - prevRevenue,
      first: c.first,
    });
  }

  const group = (kind: MovementKind): MovementGroup => {
    const clients = rows.filter(r => r.kind === kind);
    // Втрачених ранжуємо за тим, скільки вони давали: саме це і є втрата
    clients.sort((a, b) => (kind === 'lost' ? b.prevRevenue - a.prevRevenue : b.revenue - a.revenue));
    return {
      kind,
      clients,
      revenue: clients.reduce((s, r) => s + (kind === 'lost' ? r.prevRevenue : r.revenue), 0),
      deals: clients.reduce((s, r) => s + (kind === 'lost' ? r.prevDeals : r.deals), 0),
    };
  };

  return {
    new: group('new'),
    kept: group('kept'),
    reactivated: group('reactivated'),
    lost: group('lost'),
  };
}

export function computeMovements(clients: ClientRecord[], month: string): MovementGroups {
  return movementsOf(prepareClients(clients), month);
}

/** Найбільші клієнти місяця — з тим, скільки вони давали місяць тому */
export function topClients(clients: ClientRecord[], month: string, limit = 20): ClientMovement[] {
  return topOf(prepareClients(clients), month, limit);
}

function topOf(prepared: PreparedClient[], month: string, limit: number): ClientMovement[] {
  const m = movementsOf(prepared, month);
  return [...m.new.clients, ...m.kept.clients, ...m.reactivated.clients]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

// ── Утримання ─────────────────────────────────────────────────────────────────

/**
 * Рівень утримання клієнтів за місяць.
 *
 * База — ті, хто був активний МИНУЛОГО місяця: утримати можна лише того, хто
 * вже був. Нових цього місяця в базі немає навмисно, інакше кожен добрий місяць
 * залучення тихо підвищував би «утримання», не утримавши нікого.
 *
 * Два рівні, бо вони відповідають на різні питання:
 *  - по клієнтах (`rate`) — скільком людям ми лишились потрібні;
 *  - по грошах (`revenueRetention`) — скільки з минулого доходу лишилось у цьому
 *    місяці. Може бути більшим за 100 %: ті самі клієнти купили більше.
 */
export interface RetentionStats {
  month: string;
  /** Активні минулого місяця — база утримання */
  base: number;
  /** З них купували й цього місяця */
  kept: number;
  /** З них цього місяця не купували */
  lost: number;
  /** Повернулись після паузи — у базу не входять, бо минулого місяця їх не було */
  reactivated: number;
  /** kept ÷ base, % ; null — минулого місяця активних не було */
  rate: number | null;
  /** lost ÷ base, % — те саме число з іншого боку */
  churn: number | null;
  /**
   * Дохід цього місяця від клієнтів, активних минулого, ділений на весь дохід
   * минулого місяця, %. Грошовий аналог утримання (NRR).
   */
  revenueRetention: number | null;
  /** Частка доходу місяця від постійних клієнтів, % — «дохід, що повторюється» */
  repeatRevenueShare: number;
}

function retentionOf(prepared: PreparedClient[], month: string): RetentionStats {
  const prev = shiftMonth(month, -1);

  let base = 0, kept = 0, lost = 0, reactivated = 0;
  let prevRevenue = 0, keptRevenue = 0;
  let revenue = 0, returningRevenue = 0;

  for (const c of prepared) {
    const cur = c.stats[month];
    const pre = c.stats[prev];
    const curActive = isActive(cur);
    const preActive = isActive(pre);

    if (curActive) {
      revenue += cur.revenue;
      if (c.first !== null && c.first < month) returningRevenue += cur.revenue;
    }

    if (!preActive) {
      // Активний зараз, але не минулого місяця — це або новий, або повернення
      if (curActive && c.first !== null && c.first < month) reactivated += 1;
      continue;
    }

    base += 1;
    prevRevenue += pre.revenue;
    if (curActive) {
      kept += 1;
      keptRevenue += cur.revenue;
    } else {
      lost += 1;
    }
  }

  const share = (part: number, whole: number) =>
    whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

  return {
    month,
    base,
    kept,
    lost,
    reactivated,
    rate: share(kept, base),
    churn: share(lost, base),
    revenueRetention: share(keptRevenue, prevRevenue),
    repeatRevenueShare: share(returningRevenue, revenue) ?? 0,
  };
}

export function computeRetention(clients: ClientRecord[], month: string): RetentionStats {
  return retentionOf(prepareClients(clients), month);
}

// ── Звіт ──────────────────────────────────────────────────────────────────────

/** Зміна показника між звітним місяцем і базовим */
export interface Delta {
  current: number;
  base: number;
  diff: number;
  /** % зміни; null — база нульова, відсоток від нуля не визначений */
  pct: number | null;
}

export function delta(current: number, base: number): Delta {
  return { current, base, diff: current - base, pct: pctChange(current, base) };
}

/**
 * Відсоток зміни зі знаком: '+12.3 %', '−8 %', '—'.
 *
 * Прочерк, а не «+0 %» і не «нове»: коли база нульова, відсоток не існує, і
 * будь-яке число на його місці читач порівняє з іншими відсотками в рядку.
 */
export function formatPct(pct: number | null): string {
  if (pct === null) return '—';
  const abs = Math.abs(pct).toFixed(1).replace(/\.0$/, '');
  // Справжній мінус, а не дефіс: у таблиці поруч із цифрами дефіс губиться
  return `${pct >= 0 ? '+' : '−'}${abs} %`;
}

export interface MonthlyReport {
  month: string;
  /** Попередній місяць — основна база порівняння */
  prevMonth: string;
  /** Той самий місяць рік тому — прибирає сезонність */
  yearAgoMonth: string;
  totals: MonthTotals;
  prevTotals: MonthTotals;
  yearAgoTotals: MonthTotals;
  /** Чи є взагалі дані за місяць рік тому — інакше порівняння безглузде */
  hasYearAgo: boolean;
  /** Останні N місяців, що закінчуються звітним */
  trend: MonthTotals[];
  movements: MovementGroups;
  /** Утримання за місяць — по клієнтах і по грошах */
  retention: RetentionStats;
  /** Утримання попереднього місяця — щоб було видно, куда воно рухається */
  prevRetention: RetentionStats;
  top: ClientMovement[];
  /** Чи є в даних суми по місяцях; false — звіт порахувати неможливо */
  hasMonthlyStats: boolean;
  /** Чи є в даних оплати; false — показуємо лише законтрактоване */
  hasPaid: boolean;
  /** Скільки клієнтів у базі всього — щоб було видно охоплення місяця */
  totalClients: number;
}

export function buildMonthlyReport(
  clients: ClientRecord[],
  month: string,
  opts: { trendMonths?: number; topLimit?: number } = {},
): MonthlyReport {
  const { trendMonths = 12, topLimit = 20 } = opts;
  const prepared = prepareClients(clients);

  const prevMonth = shiftMonth(month, -1);
  const yearAgoMonth = shiftMonth(month, -12);
  const yearAgoTotals = totalsOf(prepared, yearAgoMonth);

  return {
    month,
    prevMonth,
    yearAgoMonth,
    totals: totalsOf(prepared, month),
    prevTotals: totalsOf(prepared, prevMonth),
    yearAgoTotals,
    hasYearAgo: yearAgoTotals.clients > 0,
    trend: trendOf(prepared, month, trendMonths),
    movements: movementsOf(prepared, month),
    retention: retentionOf(prepared, month),
    prevRetention: retentionOf(prepared, prevMonth),
    top: topOf(prepared, month, topLimit),
    hasMonthlyStats: hasMonthlyStats(clients),
    hasPaid: hasPaidStats(clients),
    totalClients: clients.length,
  };
}

// ── Залучення: MQA, конверсія, джерела ─────────────────────────────────────────

/**
 * Агрегати залучення за місяць — те, що віддає /api/keepincrm/history.
 *
 * Описані тут локально, а не взяті з types.ts, з тієї ж причини, з якої cac.ts
 * описує свій `CacExpenseInput`: модуль лишається чистою математикою, яку можна
 * викликати з тесту одним літералом, не тягнучи за собою тип усього застосунку.
 * Поля структурно збігаються з `KeepInCRMPeriodAggregated`.
 */
export interface SourceCount {
  source: string;
  count: number;
}

export interface SourceAgreements {
  source: string;
  count: number;
  totalSum: number;
}

export interface AcquisitionInput {
  /** Усі залучені записи місяця (ліди + клієнти) — знаменник конверсії */
  totalAcquired?: number;
  totalLeads: number;
  /** Скільки із залучених стали клієнтами — це і є MQA */
  totalClients: number;
  totalAgreements?: number;
  totalAgreementsSum?: number;
  acquiredBySource?: SourceCount[];
  clientsBySource?: SourceCount[];
  agreementsBySource?: SourceAgreements[];
}

/**
 * Джерело: скільки принесло і скільки привело.
 *
 * Дохід — сума угод джерела за місяць (з CRM), а не дохід клієнтів джерела за весь
 * час: місячний звіт говорить про місяць. Клієнти — когортні: залучені цього
 * місяця й уже конвертовані, тобто той самий набір, на який рахується CAC.
 */
export interface SourceStat {
  source: string;
  /** Сума угод джерела за місяць, грн */
  revenue: number;
  /** Кількість угод */
  deals: number;
  /** Клієнти когорти місяця з цього джерела (MQA джерела) */
  clients: number;
  /** Усі залучені записи джерела */
  acquired: number;
  /** Частка в доході місяця, % */
  revenueShare: number;
  /** Конверсія джерела: clients ÷ acquired, %; null — залучених не було */
  conversion: number | null;
}

export interface AcquisitionStats {
  month: string;
  /** MQA — клієнти, залучені цього місяця (когорта місяця) */
  mqa: number;
  prevMqa: number;
  mqaChange: number | null;
  /** Усі залучені записи */
  acquired: number;
  prevAcquired: number;
  /** Конверсія залученого в клієнта, % */
  conversion: number | null;
  prevConversion: number | null;
  conversionChange: number | null;
  /** Угоди місяця з CRM — окреме число від угод у помісячних сумах LTV */
  agreements: number | null;
  agreementsSum: number | null;
  sources: SourceStat[];
  /** Сума по джерелах — база для часток у кільцевій діаграмі */
  sourcesRevenue: number;
  /**
   * Чи дозріла когорта місяця. Свіжі ліди не встигли конвертнутись, тому в
   * недозрілому місяці і MQA, і конверсія занижені, а CAC завищений.
   */
  mature: boolean;
}

/**
 * З двох написань того самого джерела лишаємо людське.
 *
 * В угодах джерело приходить машинним («meta_ads»), у клієнтах — таким, як його
 * пишуть люди («Meta Ads»). Зводяться вони в одне джерело, але в таблицю й на
 * кільце має піти те написання, яке читач бачить у CRM і в витратах.
 */
function nicerSourceName(a: string, b: string): string {
  const human = (s: string) => /[\sА-ЯІЇЄҐA-Z]/.test(s);
  if (human(a) && !human(b)) return a;
  if (human(b) && !human(a)) return b;
  return a;
}

/** Зводить назви джерел до порівнюваного вигляду й складає три джерела в одне */
export function computeSources(agg: AcquisitionInput): SourceStat[] {
  const byKey = new Map<string, SourceStat>();

  const touch = (source: string): SourceStat => {
    const key = normalizeSource(source) || source;
    let hit = byKey.get(key);
    if (!hit) {
      hit = { source, revenue: 0, deals: 0, clients: 0, acquired: 0, revenueShare: 0, conversion: null };
      byKey.set(key, hit);
    } else {
      hit.source = nicerSourceName(hit.source, source);
    }
    return hit;
  };

  for (const a of agg.agreementsBySource ?? []) {
    const c = touch(a.source);
    c.revenue += a.totalSum;
    c.deals += a.count;
  }
  for (const s of agg.clientsBySource ?? []) touch(s.source).clients += s.count;
  for (const s of agg.acquiredBySource ?? []) touch(s.source).acquired += s.count;

  const total = [...byKey.values()].reduce((sum, c) => sum + c.revenue, 0);

  return [...byKey.values()]
    .map(c => ({
      ...c,
      revenue: Math.round(c.revenue),
      revenueShare: total > 0 ? Math.round((c.revenue / total) * 1000) / 10 : 0,
      conversion: c.acquired > 0 ? Math.round((c.clients / c.acquired) * 1000) / 10 : null,
    }))
    // За доходом: питання до цієї таблиці завжди «хто приніс більше»
    .sort((a, b) => b.revenue - a.revenue || b.clients - a.clients);
}

/**
 * Наскільки повно місяць покритий добовими знімками CRM.
 *
 * Історія KeepInCRM зберігається по одному документу на день, а сервер, збираючи
 * період, мовчки пропускає дні, яких немає (`docs.filter(d => d.exists)`). Через
 * це місяць, у якому синхронізація не працювала частину днів, дає суму, меншу за
 * фактичну — і жодного сліду про це в числах не лишається.
 *
 * На дашборді це майже не помітно: там дивляться сьогодні й останні дні, які
 * синхронізувались щойно. У місячному звіті — навпаки: чим старіший місяць, тим
 * більше шансів, що частина днів так і не приїхала, а звіт при цьому виглядає
 * як повний. Тому покриття рахується явно й показується поруч із сумами.
 */
export interface MonthCoverage {
  month: string;
  /** Скільки днів місяця мали б мати знімок (для поточного місяця — до сьогодні) */
  expectedDays: number;
  /** Скільки знімків реально є */
  presentDays: number;
  /** Яких дат бракує */
  missingDays: string[];
  /** Найсвіжіша синхронізація серед знімків місяця */
  lastSyncedAt: string | null;
  /** Частка покриття, % */
  percent: number;
  complete: boolean;
}

export function computeCoverage(
  month: string,
  entries: { date: string; lastSyncedAt?: string }[],
  now: Date = new Date(),
): MonthCoverage {
  const { from, to } = monthBounds(month);
  const today = now.toISOString().slice(0, 10);
  // Поточний місяць ще триває: дні, які не настали, пропущеними не рахуються
  const last = to > today ? today : to;

  const expected: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    expected.push(d.toISOString().slice(0, 10));
    if (expected.length > 31) break;
  }

  const present = new Set(entries.map(e => e.date).filter(d => d >= from && d <= last));
  const missingDays = expected.filter(d => !present.has(d));

  const syncedAt = entries
    .map(e => e.lastSyncedAt)
    .filter((v): v is string => !!v)
    .sort();

  return {
    month,
    expectedDays: expected.length,
    presentDays: expected.length - missingDays.length,
    missingDays,
    lastSyncedAt: syncedAt.length > 0 ? syncedAt[syncedAt.length - 1] : null,
    percent: expected.length > 0
      ? Math.round(((expected.length - missingDays.length) / expected.length) * 100)
      : 100,
    complete: missingDays.length === 0,
  };
}

/**
 * Скільки днів когорта «дозріває», перш ніж її конверсію можна вважати усталеною.
 * Те саме число, що на дашборді — див. COHORT_MATURITY_DAYS у cac.ts.
 */
export function isMonthMature(month: string, maturityDays: number, now: Date = new Date()): boolean {
  const end = new Date(`${monthBounds(month).to}T00:00:00Z`);
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return (today.getTime() - end.getTime()) / 86_400_000 >= maturityDays;
}

export function computeAcquisition(
  current: AcquisitionInput,
  prev: AcquisitionInput | null,
  month: string,
  opts: { maturityDays: number; now?: Date },
): AcquisitionStats {
  /** Знімки, зняті до переходу на когортну модель, не мають totalAcquired */
  const acquiredOf = (a: AcquisitionInput) => a.totalAcquired ?? a.totalLeads + a.totalClients;
  const convOf = (a: AcquisitionInput) => {
    const acquired = acquiredOf(a);
    return acquired > 0 ? Math.round((a.totalClients / acquired) * 1000) / 10 : null;
  };

  const acquired = acquiredOf(current);
  const conversion = convOf(current);
  const prevConversion = prev ? convOf(prev) : null;
  const sources = computeSources(current);

  return {
    month,
    mqa: current.totalClients,
    prevMqa: prev?.totalClients ?? 0,
    mqaChange: prev ? pctChange(current.totalClients, prev.totalClients) : null,
    acquired,
    prevAcquired: prev ? acquiredOf(prev) : 0,
    conversion,
    prevConversion,
    conversionChange:
      conversion !== null && prevConversion !== null ? pctChange(conversion, prevConversion) : null,
    agreements: current.totalAgreements ?? null,
    agreementsSum: current.totalAgreementsSum ?? null,
    sources,
    sourcesRevenue: sources.reduce((s, c) => s + c.revenue, 0),
    mature: isMonthMature(month, opts.maturityDays, opts.now),
  };
}

/**
 * Джерела для кільцевої діаграми: найбільші окремо, решта — одним сегментом.
 *
 * Шість сегментів — межа, за якою частки на кільці перестають читатись, а сьомий
 * колір довелось би вигадувати. Тому хвіст згортається в «Інші», а точні числа
 * лишаються в таблиці поруч.
 */
export const OTHER_SOURCE = 'Інші';

export function groupSources(sources: SourceStat[], limit = 5): SourceStat[] {
  const withRevenue = sources.filter(c => c.revenue > 0);
  if (withRevenue.length <= limit + 1) return withRevenue;

  const head = withRevenue.slice(0, limit);
  const tail = withRevenue.slice(limit);

  const other: SourceStat = {
    source: OTHER_SOURCE,
    revenue: tail.reduce((s, c) => s + c.revenue, 0),
    deals: tail.reduce((s, c) => s + c.deals, 0),
    clients: tail.reduce((s, c) => s + c.clients, 0),
    acquired: tail.reduce((s, c) => s + c.acquired, 0),
    revenueShare: Math.round(tail.reduce((s, c) => s + c.revenueShare, 0) * 10) / 10,
    conversion: null,
  };

  return [...head, other];
}

// ── Вивантаження ──────────────────────────────────────────────────────────────

/**
 * Місяць у CSV — по одному рядку на клієнта, включно з тими, хто відпав.
 *
 * Друкований звіт обрізає таблиці до кількох десятків рядків, бо його читають,
 * а не опрацьовують. Хто збирається дзвонити всім, хто перестав купувати, бере
 * саме цей файл.
 *
 * Роздільник — крапка з комою, як у решті вивантажень застосунку: Excel з
 * українською локаллю інакше складає весь рядок в одну клітинку.
 */
export function monthlyReportToCsv(r: MonthlyReport): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    'Клієнт', 'Група', `Дохід ${r.month}`, `Угод ${r.month}`, 'Середній чек',
    `Дохід ${r.prevMonth}`, `Угод ${r.prevMonth}`, 'Зміна доходу', 'Перша покупка',
  ];

  const rows = [
    ...r.movements.new.clients,
    ...r.movements.kept.clients,
    ...r.movements.reactivated.clients,
    ...r.movements.lost.clients,
  ].map(c => [
    c.name,
    MOVEMENT_LABELS[c.kind],
    c.revenue,
    c.deals,
    c.deals > 0 ? Math.round(c.revenue / c.deals) : '',
    c.prevRevenue,
    c.prevDeals,
    c.delta,
    c.first ?? '',
  ]);

  return [header, ...rows].map(row => row.map(esc).join(';')).join('\r\n');
}

// ── Гроші: витрати й CAC місяця ───────────────────────────────────────────────

/**
 * Витрати місяця поруч із доходом того ж місяця.
 *
 * Без цього блоку місячний звіт відповідає лише на «скільки прийшло» — а
 * питання, з яким на нього дивляться, майже завжди «і скільком це коштувало».
 * Витрати лежать по днях і в різних валютах, тож зводяться через ту саму
 * функцію, що й на дашборді (`sumSpend`) — інакше два місця в застосунку
 * показували б різні суми за той самий місяць.
 */
export interface MonthSpend {
  month: string;
  /** Усі витрати місяця, грн */
  total: number;
  /** З них рекламний бюджет, грн */
  ads: number;
  prevTotal: number;
  prevAds: number;
  /** Скільки записів витрат потрапило в місяць — нуль означає «не внесли» */
  count: number;
  byCategory: { category: string; amount: number }[];
  /** Чи були витрати не в гривні — тоді сума залежить від курсу в налаштуваннях */
  hasForeign: boolean;
  /** CAC за рекламним бюджетом: реклама ÷ нові клієнти місяця */
  cac: number | null;
  prevCac: number | null;
  cacChange: number | null;
  /** true, коли CAC знизився — для CAC це покращення, і фарбувати його треба навпаки */
  cacImproved: boolean | null;
  /** Blended CAC: усі витрати відділу ÷ нові клієнти */
  blendedCac: number | null;
  /** Скільки доходу місяця припадає на 1 ₴ усіх витрат */
  revenuePerSpend: number | null;
  /** ДРВ — частка рекламного бюджету в доході місяця, % */
  adShare: number | null;
  /** Вартість одного залученого запису (ліда) — реклама ÷ залучені */
  cpl: number | null;
  /**
   * LTV ÷ CAC. Здоровий бенчмарк — від 3: клієнт має приносити щонайменше втричі
   * більше, ніж коштував. null, коли невідомий будь-який з двох множників.
   */
  ltvToCac: number | null;
  /** Який саме LTV узято в співвідношення — щоб число можна було перевірити */
  ltvBasis: 'LTV 12 міс' | 'ARPU' | null;
  ltv: number | null;
  /** CAC по джерелах — лише там, де зійшлись і витрати, і клієнти */
  bySource: SourceCacResult | null;
}

/**
 * На що ділити витрати.
 *
 * Знаменник приходить ЗЗОВНІ, а не рахується з помісячних сум: на дашборді CAC
 * рахується на когортних клієнтів з CRM (`aggregated.totalClients`), і якщо тут
 * узяти інший знаменник, два екрани покажуть різний CAC за той самий місяць —
 * а вибирати, якому з них вірити, доведеться людям на зустрічі.
 *
 * Коли агрегатів CRM немає, викликач передає нових клієнтів з помісячних сум і
 * каже про це в підписі (`basisLabel`).
 */
export interface SpendBasis {
  /** Клієнти, залучені в місяці — знаменник CAC */
  newClients: number;
  prevNewClients: number;
  /** Усі залучені записи (ліди + клієнти) — знаменник CPL */
  acquired?: number;
  /** Дохід місяця — для ДРВ і доходу на гривню витрат */
  revenue: number;
  /** LTV клієнта для співвідношення LTV/CAC */
  ltv?: number | null;
  ltvBasis?: MonthSpend['ltvBasis'];
  /** Клієнти по джерелах — щоб порахувати CAC по кожному */
  clientsBySource?: SourceCount[];
}

export function computeMonthSpend(
  expenses: CacExpenseInput[],
  month: string,
  basis: SpendBasis,
  rates: CurrencyRates,
): MonthSpend {
  const now = monthBounds(month);
  const before = monthBounds(shiftMonth(month, -1));

  const all = sumSpend(expenses, now.from, now.to, 'all', rates);
  const ads = sumSpend(expenses, now.from, now.to, 'ads', rates);
  const prevAll = sumSpend(expenses, before.from, before.to, 'all', rates);
  const prevAds = sumSpend(expenses, before.from, before.to, 'ads', rates);

  const cac = computeCac({
    spend: ads.total,
    newClients: basis.newClients,
    acquired: basis.acquired ?? basis.newClients,
    prevSpend: prevAds.total,
    prevClients: basis.prevNewClients,
    ltv: basis.ltv ?? null,
  });

  /*
    Нульові витрати дають нульовий CAC — і це саме той нуль, який не можна
    показувати. «0 ₴ за клієнта» читається як «клієнти безплатні», тоді як
    насправді за місяць просто не внесли витрат. Тому без бюджету CAC порожній,
    а скільки витрат у місяці взагалі — видно з `count` і `total`.
  */
  const hasAds = ads.total > 0;
  const hasPrevAds = prevAds.total > 0;
  const paidCac = hasAds ? cac.cac : null;

  return {
    month,
    total: all.total,
    ads: ads.total,
    prevTotal: prevAll.total,
    prevAds: prevAds.total,
    count: all.count,
    byCategory: all.byCategory,
    hasForeign: all.hasForeign,
    cac: paidCac,
    prevCac: hasPrevAds ? cac.prevCac : null,
    cacChange: hasAds && hasPrevAds ? cac.cacChange : null,
    cacImproved: hasAds && hasPrevAds ? cac.cacImproved : null,
    blendedCac: all.total > 0 && basis.newClients > 0
      ? Math.round(all.total / basis.newClients)
      : null,
    revenuePerSpend: all.total > 0 ? Math.round((basis.revenue / all.total) * 10) / 10 : null,
    adShare: basis.revenue > 0 ? Math.round((ads.total / basis.revenue) * 1000) / 10 : null,
    cpl: hasAds ? cac.cpl : null,
    // Співвідношення рахуємо від ПЛАТНОГО CAC: саме його порівнюють із ринком
    ltvToCac: paidCac !== null && paidCac > 0 && basis.ltv ? Math.round((basis.ltv / paidCac) * 10) / 10 : null,
    ltvBasis: basis.ltv ? basis.ltvBasis ?? null : null,
    ltv: basis.ltv ?? null,
    bySource: basis.clientsBySource
      ? cacBySource(ads.bySource, basis.clientsBySource)
      : null,
  };
}

/**
 * Здоров'я співвідношення LTV/CAC.
 *
 * Три — не наша вигадка, а загальноприйнятий поріг: нижче маркетинг з'їдає
 * маржу, значно вище — швидше за все, недоінвестовано в залучення. Повертаємо
 * саме оцінку, а не колір: колір вибирає той, хто малює.
 */
export type LtvToCacVerdict = 'thin' | 'healthy' | 'underinvested';

export function judgeLtvToCac(ratio: number | null): LtvToCacVerdict | null {
  if (ratio === null) return null;
  if (ratio < 3) return 'thin';
  if (ratio > 6) return 'underinvested';
  return 'healthy';
}

export const LTV_TO_CAC_HINTS: Record<LtvToCacVerdict, string> = {
  thin: 'менше 3 — залучення з\'їдає маржу',
  healthy: 'від 3 до 6 — здоровий діапазон',
  underinvested: 'більше 6 — можливо, недоінвестовано в залучення',
};

// ── Підсумок словами ──────────────────────────────────────────────────────────

const uah = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} ₴`;
const num = (n: number) => n.toLocaleString('uk-UA');
const pct = (n: number) => `${Math.abs(n).toFixed(1).replace(/\.0$/, '')} %`;
const share = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

/** «1 клієнт» / «2 клієнти» / «5 клієнтів» — інакше кожен звіт читається як чернетка */
const clientsWord = (n: number) => `${num(n)} ${pluralUk(n, 'клієнт', 'клієнти', 'клієнтів')}`;
const dealsWord = (n: number) => `${num(n)} ${pluralUk(n, 'угода', 'угоди', 'угод')}`;
/** Родовий відмінок — для зворотів «з 2 клієнтів», «із 5 клієнтів» */
const clientsGen = (n: number) => `${num(n)} ${pluralUk(n, 'клієнта', 'клієнтів', 'клієнтів')}`;

/**
 * Звіт словами — те саме, що в таблицях, але прочитане вголос.
 *
 * Потрібне не для краси: таблиця з двадцяти чисел не каже, на чому саме місяць
 * виріс, і кожен читач добудовує цю фразу сам — зазвичай неправильно. Тут вона
 * написана один раз і однаково для всіх.
 *
 * Жодного оцінювання («добре», «погано»): звіт повідомляє, що сталось, а що з
 * цим робити — вирішують люди, які знають контекст місяця.
 */
export function summarizeMonth(
  r: MonthlyReport,
  extra: { acquisition?: AcquisitionStats | null; spend?: MonthSpend | null } = {},
): string[] {
  const t = r.totals;
  const p = r.prevTotals;
  const out: string[] = [];

  /*
    Помісячних сум за місяць може не бути — знімок LTV перераховується окремо й
    за поточний місяць зазвичай відстає. Це не «угод не було»: добові дані CRM
    за той самий місяць уже є, і рядки про залучення нижче лишаються осмисленими.
    Тому замість раннього виходу — один чесний рядок і далі все, що можна сказати.
  */
  const hasLtvMonth = t.clients > 0;
  if (!hasLtvMonth) {
    out.push(
      extra.acquisition && extra.acquisition.acquired > 0
        ? `Помісячних сум LTV за ${monthLabel(r.month).toLowerCase()} ще немає — дохід, угоди й утримання нижче порожні.`
        : `За ${monthLabel(r.month).toLowerCase()} у базі немає жодної угоди.`,
    );
  }

  if (hasLtvMonth) {
  const rev = delta(t.revenue, p.revenue);
  const prevIn = monthLabelIn(r.prevMonth);
  out.push(
    rev.pct === null
      ? `Дохід ${uah(t.revenue)}: ${dealsWord(t.deals)} від ${clientsWord(t.clients)}. ` +
        `У ${prevIn} доходу не було, тож порівнювати нема з чим.`
      : `Дохід ${uah(t.revenue)} — на ${pct(rev.pct)} ${rev.diff >= 0 ? 'більше' : 'менше'}, ` +
        `ніж у ${prevIn} (${uah(p.revenue)}). ` +
        `Угод ${num(t.deals)} проти ${num(p.deals)}, середній чек ${uah(t.avgCheck)} проти ${uah(p.avgCheck)}.`,
  );
  }

  // Касою, а не контрактами: гроші могли прийти й за угоди минулих місяців,
  // тож рядок живе поза перевіркою на угоди місяця
  if (r.hasPaid && (t.paid !== 0 || t.revenue > 0)) {
    const paidDelta = delta(t.paid, p.paid);
    out.push(
      `На рахунок надійшло ${uah(t.paid)}` +
      (t.revenue > 0 ? ` — ${share(t.paid, t.revenue)} % від законтрактованого` : '') +
      (paidDelta.pct !== null ? `; у ${monthLabelIn(r.prevMonth)} — ${uah(p.paid)}.` : '.'),
    );
  }

  if (hasLtvMonth) {

  // Чому саме змінився дохід: нові клієнти чи ті, що вже були
  out.push(
    `Постійні клієнти дали ${share(t.returningRevenue, t.revenue)} % доходу ` +
    `(${clientsWord(t.returningClients)}, ${uah(t.returningRevenue)}), ` +
    `нові — ${share(t.newRevenue, t.revenue)} % (${clientsWord(t.newClients)}, ${uah(t.newRevenue)}).`,
  );

  /*
    Рух — через тире після назви групи, а не дієсловом: «повернулось 1 клієнт»
    неминуче ламає узгодження, а перебирати форми дієслова заради одного рядка
    не варто. Назви груп ті самі, що в таблицях звіту.
  */
  const { reactivated, lost } = r.movements;
  const movement: string[] = [];
  if (reactivated.clients.length > 0) {
    movement.push(
      `${MOVEMENT_LABELS.reactivated.toLowerCase()} — ` +
      `${clientsWord(reactivated.clients.length)} на ${uah(reactivated.revenue)}`,
    );
  }
  if (lost.clients.length > 0) {
    movement.push(
      `${MOVEMENT_LABELS.lost.toLowerCase()} — ${clientsWord(lost.clients.length)} ` +
      `(${uah(lost.revenue)} у ${monthLabelIn(r.prevMonth)})`,
    );
  }
  if (movement.length > 0) {
    out.push(`Рух клієнтів: ${movement.join('; ')}.`);
  }

  /*
    Утримання — окремим рядком і обома мовами: у клієнтах і в грошах. Ці два
    числа розходяться постійно (пішли троє дрібних — утримання впало, дохід ні),
    і саме розходження зазвичай і є новиною.
  */
  const ret = r.retention;
  if (ret.rate !== null) {
    const money = ret.revenueRetention !== null
      ? ` У грошах — ${pct(ret.revenueRetention)} від доходу за ${monthLabel(r.prevMonth).toLowerCase()}.`
      : '';
    out.push(
      `Утримання ${pct(ret.rate)}: з ${clientsGen(ret.base)}, активних у ${monthLabelIn(r.prevMonth)}, ` +
      `купували й цього місяця ${num(ret.kept)}.${money}`,
    );
  }
  }

  // Залучення: MQA, конверсія й найсильніше джерело — якщо агрегати CRM приїхали
  const acq = extra.acquisition;
  if (acq && acq.acquired > 0) {
    const conv = acq.conversion !== null ? `, конверсія в клієнта ${pct(acq.conversion)}` : '';
    const notMature = acq.mature ? '' : ' Когорта місяця ще дозріває, тож обидва числа занижені.';
    out.push(
      `Залучено ${num(acq.acquired)} записів, з них стали клієнтами ${num(acq.mqa)} (MQA)${conv}.` +
      notMature,
    );
    const top = acq.sources.find(c => c.revenue > 0);
    if (top) {
      out.push(
        `Найбільше принесло джерело «${top.source}» — ${uah(top.revenue)} ` +
        `(${top.revenueShare} % від суми угод по джерелах).`,
      );
    }
  }

  // LTV/CAC — одним рядком із порогом, бо саме за поріг його й читають
  const sp = extra.spend;
  if (sp?.ltvToCac !== null && sp?.ltvToCac !== undefined) {
    const verdict = judgeLtvToCac(sp.ltvToCac);
    out.push(
      `LTV/CAC — ${sp.ltvToCac}` +
      `${sp.ltvBasis ? ` (${sp.ltvBasis} ${uah(sp.ltv ?? 0)} на CAC ${uah(sp.cac ?? 0)})` : ''}` +
      `${verdict ? `: ${LTV_TO_CAC_HINTS[verdict]}` : ''}.`,
    );
  }

  const first = r.top[0];
  if (first) {
    out.push(
      `Найбільший клієнт місяця — ${first.name}, ${uah(first.revenue)} ` +
      `(${share(first.revenue, t.revenue)} % доходу).`,
    );
  }

  if (hasLtvMonth && r.hasYearAgo) {
    const yoy = delta(t.revenue, r.yearAgoTotals.revenue);
    if (yoy.pct !== null) {
      out.push(
        `Рік тому, у ${monthLabelIn(r.yearAgoMonth)}, дохід був ` +
        `${uah(r.yearAgoTotals.revenue)} — різниця ${yoy.diff >= 0 ? '+' : '−'}${pct(yoy.pct)}.`,
      );
    }
  }

  return out;
}

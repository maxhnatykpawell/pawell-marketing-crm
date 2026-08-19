/**
 * CAC — вартість залучення клієнта. Чиста математика, без React і без мережі,
 * щоб її можна було перевірити тестами (див. cac.test.ts).
 *
 * Основна формула: CAC = витрати за період / клієнти, залучені за той самий період.
 *
 * Знаменник — саме когортні клієнти з KeepInCRM (`aggregated.totalClients`):
 * це записи, ЗАЛУЧЕНІ в періоді і вже конвертовані в клієнтів. Брати «усіх
 * клієнтів, що з'явились у базі» не можна — частина з них прийшла з когорт
 * минулих місяців, і бюджет цього періоду їх не купував.
 */

export type Currency = 'UAH' | 'USD' | 'EUR';

/** Скільки гривень коштує одна одиниця валюти. UAH завжди 1 і не зберігається. */
export interface CurrencyRates {
  USD: number;
  EUR: number;
}

/**
 * Стартові курси. Це саме дефолти «щоб щось порахувалось», а не джерело істини:
 * курс живе в налаштуваннях витрат і його треба тримати актуальним. Поки в
 * витратах лише гривня, ці числа ні на що не впливають.
 */
export const DEFAULT_CURRENCY_RATES: CurrencyRates = { USD: 42, EUR: 49 };

/** Категорія витрат, яку вважаємо прямим рекламним бюджетом */
export const AD_SPEND_CATEGORY = 'Реклама';

/**
 * Що саме кладемо в чисельник:
 *  - `ads`     — тільки рекламний бюджет (paid CAC, порівнюється з ринком);
 *  - `all`     — усі витрати відділу (blended CAC, чесна собівартість клієнта).
 */
export type CacScope = 'ads' | 'all';

/** Мінімум полів витрати, потрібний для розрахунку */
export interface CacExpenseInput {
  amount: number;
  currency: string;
  category: string;
  source?: string;
  /** YYYY-MM-DD */
  date: string;
}

export function toUAH(amount: number, currency: string, rates: CurrencyRates): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === 'USD') return amount * rates.USD;
  if (currency === 'EUR') return amount * rates.EUR;
  return amount; // UAH і будь-яка невідома валюта — вважаємо гривнею
}

/** Дати зберігаються як YYYY-MM-DD, тому порівняння рядків = порівняння дат */
export function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/**
 * Попередній еквівалентний період — рівно та сама кількість днів, що впритул
 * передує поточному. Повторює логіку сервера (/api/keepincrm/history), інакше
 * зміна CAC рахувалась би відносно не того відрізка, що зміна клієнтів.
 */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const start = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

  const prevTo = new Date(start);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - days + 1);

  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

export interface SpendBreakdown {
  /** Разом у гривні */
  total: number;
  /** Скільки записів витрат потрапило в період */
  count: number;
  bySource: { source: string; amount: number }[];
  byCategory: { category: string; amount: number }[];
  /** Чи є в періоді витрати не в гривні — тоді результат залежить від курсу */
  hasForeign: boolean;
}

/** Сума витрат за період, зведена до гривні */
export function sumSpend(
  expenses: CacExpenseInput[],
  from: string,
  to: string,
  scope: CacScope,
  rates: CurrencyRates,
): SpendBreakdown {
  const bySource = new Map<string, number>();
  const byCategory = new Map<string, number>();
  let total = 0;
  let count = 0;
  let hasForeign = false;

  for (const e of expenses) {
    if (!e.date || !inRange(e.date, from, to)) continue;
    if (scope === 'ads' && e.category !== AD_SPEND_CATEGORY) continue;

    const uah = toUAH(e.amount, e.currency, rates);
    if (e.currency && e.currency !== 'UAH') hasForeign = true;

    total += uah;
    count++;
    const src = e.source || 'Без джерела';
    bySource.set(src, (bySource.get(src) ?? 0) + uah);
    const cat = e.category || 'Без категорії';
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + uah);
  }

  const sorted = <K extends string>(m: Map<string, number>, key: K) =>
    Array.from(m, ([name, amount]) => ({ [key]: name, amount } as any)).sort(
      (a, b) => b.amount - a.amount,
    );

  return {
    total: Math.round(total),
    count,
    bySource: sorted(bySource, 'source'),
    byCategory: sorted(byCategory, 'category'),
    hasForeign,
  };
}

/** % зміни; null коли база нульова — відсоток від нуля не визначений */
export function pctChange(current: number, base: number): number | null {
  if (base === 0) return null;
  return Math.round(((current - base) / base) * 1000) / 10;
}

export interface CacInput {
  /** Витрати періоду в грн */
  spend: number;
  /** Клієнти когорти періоду */
  newClients: number;
  /** Усі залучені записи когорти (ліди + клієнти) — знаменник CPL */
  acquired: number;
  /** Витрати попереднього еквівалентного періоду в грн */
  prevSpend: number;
  /** Клієнти когорти попереднього періоду */
  prevClients: number;
  /** LTV клієнта в грн (когортний на 12 міс або ARPU) — для співвідношення */
  ltv?: number | null;
}

export interface CacResult {
  /** Вартість залучення клієнта, грн. null = за період немає клієнтів */
  cac: number | null;
  /** Вартість залученого запису (ліда), грн. null = нікого не залучено */
  cpl: number | null;
  /** CAC попереднього періоду, грн */
  prevCac: number | null;
  /**
   * Зміна CAC у % відносно попереднього періоду.
   * Увага: для CAC ЗНИЖЕННЯ — це добре, тож знак не можна фарбувати як у виручці.
   */
  cacChange: number | null;
  /** true, коли зміна CAC — покращення (тобто CAC знизився) */
  cacImproved: boolean | null;
  /** LTV / CAC. Здоровий бенчмарк — від 3. null, якщо CAC або LTV невідомі */
  ltvToCac: number | null;
  spend: number;
  newClients: number;
}

export function computeCac(input: CacInput): CacResult {
  const { spend, newClients, acquired, prevSpend, prevClients, ltv } = input;

  // Ділити на нуль не можна, і підставляти нуль теж не можна: «0 ₴ за клієнта»
  // і «клієнтів не було» — різні речі, друге має лишитись порожнім місцем.
  const cac = newClients > 0 ? Math.round(spend / newClients) : null;
  const cpl = acquired > 0 ? Math.round(spend / acquired) : null;
  const prevCac = prevClients > 0 ? Math.round(prevSpend / prevClients) : null;

  const cacChange = cac !== null && prevCac !== null ? pctChange(cac, prevCac) : null;

  return {
    cac,
    cpl,
    prevCac,
    cacChange,
    cacImproved: cacChange === null ? null : cacChange <= 0,
    ltvToCac: cac !== null && cac > 0 && ltv ? Math.round((ltv / cac) * 10) / 10 : null,
    spend,
    newClients,
  };
}

/**
 * Зводить назву джерела до порівнюваного вигляду: у витратах пишуть «Meta Ads»,
 * у CRM може прийти «meta_ads» або «Meta ADS». Без нормалізації розбивка CAC по
 * джерелах мовчки розпалась би на пари «витрати без клієнтів / клієнти без витрат».
 */
export function normalizeSource(s: string): string {
  return s.toLowerCase().replace(/[^a-zа-яїієґ0-9]+/gi, '');
}

export interface SourceCac {
  source: string;
  spend: number;
  clients: number;
  /** null, коли по джерелу є витрати, але ще немає клієнтів */
  cac: number | null;
}

export interface SourceCacResult {
  /** Джерела, де зійшлись і витрати, і клієнти — тільки їм можна вірити */
  matched: SourceCac[];
  /** Витрати на джерела, яких немає в CRM (грн) — CAC по них не порахувати */
  unmatchedSpend: number;
  /** Клієнти з джерел, на які не заведено витрат */
  unmatchedClients: number;
}

export function cacBySource(
  spendBySource: { source: string; amount: number }[],
  clientsBySource: { source: string; count: number }[],
): SourceCacResult {
  const clientsByKey = new Map<string, { source: string; count: number }>();
  for (const c of clientsBySource) {
    const k = normalizeSource(c.source);
    const prev = clientsByKey.get(k);
    clientsByKey.set(k, { source: prev?.source ?? c.source, count: (prev?.count ?? 0) + c.count });
  }

  const matched: SourceCac[] = [];
  const usedKeys = new Set<string>();
  let unmatchedSpend = 0;

  for (const s of spendBySource) {
    const k = normalizeSource(s.source);
    const hit = clientsByKey.get(k);
    if (!hit) {
      unmatchedSpend += s.amount;
      continue;
    }
    usedKeys.add(k);
    matched.push({
      source: hit.source,
      spend: Math.round(s.amount),
      clients: hit.count,
      cac: hit.count > 0 ? Math.round(s.amount / hit.count) : null,
    });
  }

  let unmatchedClients = 0;
  for (const [k, v] of clientsByKey) {
    if (!usedKeys.has(k)) unmatchedClients += v.count;
  }

  matched.sort((a, b) => (a.cac ?? Infinity) - (b.cac ?? Infinity));

  return { matched, unmatchedSpend: Math.round(unmatchedSpend), unmatchedClients };
}

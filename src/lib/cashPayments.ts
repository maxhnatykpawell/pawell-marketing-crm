/**
 * Оплати за ФАКТИЧНОЮ датою платежу (касовий погляд).
 *
 * Статистика угод рахується за датою створення угоди: угода жовтня, оплачена в листопаді,
 * лишається в жовтні. Тут навпаки: гроші належать дню, коли платіж реально надійшов
 * (`at` у /payments KeepInCRM). Це окрема вісь, а не поправка до знімків угод, тож
 * зберігається окремо й не змішується з ними.
 *
 * Чиста логіка без мережі й бази, див. cashPayments.test.ts.
 */

export interface RawCashPayment {
  clientId: string | null;
  /** Дата платежу як прийшла з API (день або повний момент часу) */
  at: string;
  amount: number | null;
}

export interface CashSourceTotal { source: string; count: number; sum: number }

export interface CashDay {
  /** День платежу, YYYY-MM-DD (за Києвом) */
  date: string;
  count: number;
  sum: number;
  bySource: CashSourceTotal[];
}

export interface CashAggregate {
  count: number;
  sum: number;
  bySource: CashSourceTotal[];
  /** 'YYYY-MM' → сума; для динаміки по місяцях */
  byMonth: { month: string; count: number; sum: number }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Назви поля суми, які бачили/можуть бути в API. Порядок = пріоритет. */
export const PAYMENT_AMOUNT_KEYS = ['amount', 'sum', 'total', 'value', 'price', 'paid_amount'] as const;

/** null — поля суми в платежі немає зовсім (не плутати з нульовою сумою) */
export function extractPaymentAmount(p: any): number | null {
  for (const key of PAYMENT_AMOUNT_KEYS) {
    if (p && key in p) {
      const n = parseAmount(p[key]);
      if (n !== null) return n;
    }
  }
  return null;
}

/**
 * День платежу за Києвом. Дата без часу — це вже календарний день (через Date вона б
 * з'їхала на добу назад у поясі позаду UTC); повний момент часу рахуємо за київським годинником.
 */
export function paymentDay(at: string): string | null {
  if (!at) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return at;
  const d = new Date(at);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
}

export interface BucketResult {
  days: CashDay[];
  /** Платежів без придатної дати — у жоден день не потрапили */
  noDate: number;
  /** Платежів без суми: їх видно в кількості, але в суму вносять 0 — про це має знати інтерфейс */
  noAmount: number;
}

/**
 * Згрупувати платежі по днях і джерелах.
 * @param sourceOf джерело за id клієнта; невідоме → «Не вказано»
 */
export function bucketPayments(
  payments: RawCashPayment[],
  sourceOf: (clientId: string) => string | undefined,
): BucketResult {
  const byDay = new Map<string, { count: number; sum: number; src: Map<string, CashSourceTotal> }>();
  let noDate = 0;
  let noAmount = 0;

  for (const p of payments) {
    const day = paymentDay(p.at);
    if (!day) { noDate++; continue; }
    if (p.amount === null) noAmount++;
    const amount = p.amount ?? 0;

    let d = byDay.get(day);
    if (!d) { d = { count: 0, sum: 0, src: new Map() }; byDay.set(day, d); }
    d.count++;
    d.sum += amount;

    const source = (p.clientId && sourceOf(p.clientId)) || 'Не вказано';
    const s = d.src.get(source) ?? { source, count: 0, sum: 0 };
    s.count++;
    s.sum += amount;
    d.src.set(source, s);
  }

  const days = [...byDay.entries()]
    .map(([date, d]) => ({
      date,
      count: d.count,
      sum: round2(d.sum),
      bySource: [...d.src.values()]
        .map(s => ({ ...s, sum: round2(s.sum) }))
        .sort((a, b) => b.sum - a.sum),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { days, noDate, noAmount };
}

/** Звести дні за період у підсумок, джерела й місяці */
export function aggregateCash(days: CashDay[]): CashAggregate {
  let count = 0;
  let sum = 0;
  const src = new Map<string, CashSourceTotal>();
  const months = new Map<string, { count: number; sum: number }>();

  for (const d of days) {
    count += d.count;
    sum += d.sum;
    for (const s of d.bySource) {
      const t = src.get(s.source) ?? { source: s.source, count: 0, sum: 0 };
      t.count += s.count;
      t.sum += s.sum;
      src.set(s.source, t);
    }
    const m = d.date.slice(0, 7);
    const mm = months.get(m) ?? { count: 0, sum: 0 };
    mm.count += d.count;
    mm.sum += d.sum;
    months.set(m, mm);
  }

  return {
    count,
    sum: round2(sum),
    bySource: [...src.values()].map(s => ({ ...s, sum: round2(s.sum) })).sort((a, b) => b.sum - a.sum),
    byMonth: [...months.entries()]
      .map(([month, v]) => ({ month, count: v.count, sum: round2(v.sum) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

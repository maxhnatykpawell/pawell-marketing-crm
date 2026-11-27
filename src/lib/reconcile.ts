/**
 * Звірка знімків із KeepInCRM: порівнює знімки днів «до» і «після» повторної синхронізації
 * й каже, що саме змінилось. Сама звірка (перезапис знімків) відбувається на сервері;
 * тут лише чиста логіка, яку легко перевірити тестами.
 */

export interface SnapshotTotals {
  date: string;
  totalAcquiredToday?: number;
  totalLeadsToday?: number;
  totalClientsToday?: number;
  totalAgreementsToday?: number;
  totalAgreementsSumToday?: number;
}

export interface Totals {
  acquired: number;
  leads: number;
  clients: number;
  agreements: number;
  agreementsSum: number;
}

export interface DayDiff {
  date: string;
  before: Totals | null; // null — знімка за цей день раніше не було
  after: Totals | null;  // null — день не вдалось оновити
  delta: Totals;
}

export interface ReconcileReport {
  from: string;
  to: string;
  days: number;
  /** Днів, у яких хоч щось змінилось */
  changedDays: number;
  /** Днів, які не вдалось оновити (знімок лишився старим) */
  failedDays: string[];
  totalsBefore: Totals;
  totalsAfter: Totals;
  totalsDelta: Totals;
  /** Лише дні зі змінами, від найбільшої розбіжності */
  changes: DayDiff[];
}

const ZERO: Totals = { acquired: 0, leads: 0, clients: 0, agreements: 0, agreementsSum: 0 };

export function totalsOf(s: SnapshotTotals | undefined | null): Totals | null {
  if (!s) return null;
  const leads = s.totalLeadsToday || 0;
  const clients = s.totalClientsToday || 0;
  return {
    // Старі знімки не мали totalAcquiredToday: це ті самі ліди + клієнти
    acquired: s.totalAcquiredToday ?? leads + clients,
    leads,
    clients,
    agreements: s.totalAgreementsToday || 0,
    // Копійки відкидаємо: порівнюємо суми з точністю до 2 знаків, без шуму float
    agreementsSum: Math.round((s.totalAgreementsSumToday || 0) * 100) / 100,
  };
}

function add(a: Totals, b: Totals | null): Totals {
  const x = b ?? ZERO;
  return {
    acquired: a.acquired + x.acquired,
    leads: a.leads + x.leads,
    clients: a.clients + x.clients,
    agreements: a.agreements + x.agreements,
    agreementsSum: Math.round((a.agreementsSum + x.agreementsSum) * 100) / 100,
  };
}

function sub(a: Totals, b: Totals): Totals {
  return {
    acquired: a.acquired - b.acquired,
    leads: a.leads - b.leads,
    clients: a.clients - b.clients,
    agreements: a.agreements - b.agreements,
    agreementsSum: Math.round((a.agreementsSum - b.agreementsSum) * 100) / 100,
  };
}

const isZero = (t: Totals) =>
  t.acquired === 0 && t.leads === 0 && t.clients === 0 && t.agreements === 0 && t.agreementsSum === 0;

/**
 * @param dates   усі дати періоду (YYYY-MM-DD)
 * @param before  знімки до звірки
 * @param after   знімки після звірки
 * @param failed  дати, які не вдалось оновити
 */
export function buildReconcileReport(
  dates: string[],
  before: SnapshotTotals[],
  after: SnapshotTotals[],
  failed: string[] = [],
): ReconcileReport {
  const b = new Map(before.map(s => [s.date, totalsOf(s)]));
  const a = new Map(after.map(s => [s.date, totalsOf(s)]));
  const failedSet = new Set(failed);

  let totalsBefore = ZERO;
  let totalsAfter = ZERO;
  const changes: DayDiff[] = [];

  for (const date of dates) {
    const bt = b.get(date) ?? null;
    // День, що впав, лишається зі старим знімком: «після» для нього = «до», зміни немає
    const at = failedSet.has(date) ? bt : a.get(date) ?? null;
    totalsBefore = add(totalsBefore, bt);
    totalsAfter = add(totalsAfter, at);

    const delta = sub(at ?? ZERO, bt ?? ZERO);
    if (!isZero(delta)) changes.push({ date, before: bt, after: at, delta });
  }

  // Найбільші розбіжності першими: спершу за сумою угод, потім за кількістю записів
  const weight = (d: DayDiff) =>
    Math.abs(d.delta.agreementsSum) + Math.abs(d.delta.acquired) + Math.abs(d.delta.agreements) + Math.abs(d.delta.clients);
  changes.sort((x, y) => weight(y) - weight(x));

  return {
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    days: dates.length,
    changedDays: changes.length,
    failedDays: [...failed],
    totalsBefore,
    totalsAfter,
    totalsDelta: sub(totalsAfter, totalsBefore),
    changes,
  };
}

/** Попередній повний календарний місяць відносно дати YYYY-MM-DD */
export function previousMonthRange(ymd: string): { from: string; to: string } {
  const [y, m] = ymd.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 2, 1));
  const last = new Date(Date.UTC(y, m - 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

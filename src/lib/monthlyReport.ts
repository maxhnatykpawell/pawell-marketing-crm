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
  pctChange, sumSpend, computeCac, CacExpenseInput, CurrencyRates,
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
  }));
}

/** Чи взагалі є в даних помісячні суми — без них місячний звіт неможливий */
export function hasMonthlyStats(clients: ClientRecord[]): boolean {
  return clients.some(c => !!c.monthlyStats);
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
  revenue: number;
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
  month, revenue: 0, deals: 0, clients: 0, avgCheck: 0, arpu: 0,
  newClients: 0, newRevenue: 0, newDeals: 0,
  returningClients: 0, returningRevenue: 0, returningDeals: 0,
});

function totalsOf(prepared: PreparedClient[], month: string): MonthTotals {
  const t = EMPTY_TOTALS(month);

  for (const c of prepared) {
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
  top: ClientMovement[];
  /** Чи є в даних суми по місяцях; false — звіт порахувати неможливо */
  hasMonthlyStats: boolean;
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
    top: topOf(prepared, month, topLimit),
    hasMonthlyStats: hasMonthlyStats(clients),
    totalClients: clients.length,
  };
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
}

export function computeMonthSpend(
  expenses: CacExpenseInput[],
  month: string,
  totals: MonthTotals,
  prevTotals: MonthTotals,
  rates: CurrencyRates,
): MonthSpend {
  const now = monthBounds(month);
  const before = monthBounds(shiftMonth(month, -1));

  const all = sumSpend(expenses, now.from, now.to, 'all', rates);
  const ads = sumSpend(expenses, now.from, now.to, 'ads', rates);
  const prevAll = sumSpend(expenses, before.from, before.to, 'all', rates);
  const prevAds = sumSpend(expenses, before.from, before.to, 'ads', rates);

  // Знаменник — нові клієнти місяця: саме їх купував бюджет цього місяця.
  // `acquired` тут те саме, бо лідів у помісячному знімку немає, і CPL не рахуємо.
  const cac = computeCac({
    spend: ads.total,
    newClients: totals.newClients,
    acquired: totals.newClients,
    prevSpend: prevAds.total,
    prevClients: prevTotals.newClients,
  });

  /*
    Нульові витрати дають нульовий CAC — і це саме той нуль, який не можна
    показувати. «0 ₴ за клієнта» читається як «клієнти безплатні», тоді як
    насправді за місяць просто не внесли витрат. Тому без бюджету CAC порожній,
    а скільки витрат у місяці взагалі — видно з `count` і `total`.
  */
  const perClient = (spend: number) =>
    spend > 0 && totals.newClients > 0 ? Math.round(spend / totals.newClients) : null;

  return {
    month,
    total: all.total,
    ads: ads.total,
    prevTotal: prevAll.total,
    prevAds: prevAds.total,
    count: all.count,
    byCategory: all.byCategory,
    hasForeign: all.hasForeign,
    cac: ads.total > 0 ? cac.cac : null,
    prevCac: prevAds.total > 0 ? cac.prevCac : null,
    cacChange: ads.total > 0 && prevAds.total > 0 ? cac.cacChange : null,
    cacImproved: ads.total > 0 && prevAds.total > 0 ? cac.cacImproved : null,
    blendedCac: perClient(all.total),
    revenuePerSpend: all.total > 0 ? Math.round((totals.revenue / all.total) * 10) / 10 : null,
    adShare: totals.revenue > 0 ? Math.round((ads.total / totals.revenue) * 1000) / 10 : null,
  };
}

// ── Підсумок словами ──────────────────────────────────────────────────────────

const uah = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} ₴`;
const num = (n: number) => n.toLocaleString('uk-UA');
const pct = (n: number) => `${Math.abs(n).toFixed(1).replace(/\.0$/, '')} %`;
const share = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

/** «1 клієнт» / «2 клієнти» / «5 клієнтів» — інакше кожен звіт читається як чернетка */
const clientsWord = (n: number) => `${num(n)} ${pluralUk(n, 'клієнт', 'клієнти', 'клієнтів')}`;
const dealsWord = (n: number) => `${num(n)} ${pluralUk(n, 'угода', 'угоди', 'угод')}`;

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
export function summarizeMonth(r: MonthlyReport): string[] {
  const t = r.totals;
  const p = r.prevTotals;
  const out: string[] = [];

  if (t.clients === 0) {
    return [`За ${monthLabel(r.month).toLowerCase()} у базі немає жодної угоди.`];
  }

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

  const first = r.top[0];
  if (first) {
    out.push(
      `Найбільший клієнт місяця — ${first.name}, ${uah(first.revenue)} ` +
      `(${share(first.revenue, t.revenue)} % доходу).`,
    );
  }

  if (r.hasYearAgo) {
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

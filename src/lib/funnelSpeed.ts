import { normalizeSource } from './cac';

/**
 * Швидкість проходження воронки: лід → клієнт → угода → перша оплата, по джерелах.
 *
 * Історії етапів у KeepInCRM немає, тож усі три переходи виводяться з дат, які в
 * системі вже є:
 *   лід → клієнт     : client.created_at → client.lead_updated_at
 *   клієнт → угода   : момент конверсії  → created_at найпершої угоди клієнта
 *   угода → оплата   : created_at першої угоди → найраніший факт оплати клієнта
 *                      (/payments, дата `at` — лише день, без часу)
 *
 * Джерело — це джерело КЛІЄНТА (client.source), для всіх трьох переходів однакове:
 * так когорта одна, і цифри різних переходів порівнювані між собою.
 *
 * Чому медіана, а не середнє: у таких даних завжди є довгий хвіст («клієнт купив
 * через рік»), і середнє він тягне за собою. Поруч показуємо p75 і частку тих, хто
 * дійшов, — швидкість без частки обманює: канал, де дійшов один із ста, виглядав би
 * «найшвидшим».
 *
 * Цензурування. Свіжа когорта завжди виглядає швидшою: повільні ще не дійшли, а в
 * медіану потрапили лише швидкі. Тому є `minAgeDays` — старти молодші за цей вік
 * з розрахунку виключаються (і лічаться окремо в `tooFresh`).
 */

export type StageKey = 'leadToClient' | 'clientToDeal' | 'dealToPayment';

export const STAGES: { key: StageKey; label: string; from: string; to: string }[] = [
  { key: 'leadToClient',  label: 'Лід → клієнт',   from: 'створення ліда', to: 'конверсія в клієнта' },
  { key: 'clientToDeal',  label: 'Клієнт → угода', from: 'конверсія',      to: 'перша угода' },
  { key: 'dealToPayment', label: 'Угода → оплата', from: 'перша угода',    to: 'перша оплата' },
];

/** Клієнт, створений одразу клієнтом, має lead_updated_at == created_at до мілісекунди */
export const IMMEDIATE_CONVERSION_MS = 1000;

/** Нижче цього розміру вибірки медіана — це швидше анекдот */
export const LOW_SAMPLE = 5;

/** Один клієнт зі стислим слідом його проходу воронкою */
export interface FunnelRecord {
  id: string;
  source: string;
  createdAt: string;
  isLead: boolean;
  /** Коли став клієнтом; null — лише для тих, хто ще лід */
  convertedAt: string | null;
  /** created_at найпершої угоди */
  firstDealAt: string | null;
  /** YYYY-MM-DD найранішої оплати */
  firstPaidDate: string | null;
  /** По угодах клієнта «сплачено > 0», а запису в /payments немає — давні угоди до обліку оплат */
  paidNoDate?: true;
}

export interface StageStat {
  /** Скільки стартували перехід (без виключених) */
  entered: number;
  /** Скільки з них дійшли до кінця переходу */
  reached: number;
  share: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  /** Не враховано: створений одразу клієнтом / кінець раніше за початок / дата масового імпорту / старт надто свіжий */
  immediate: number;
  negative: number;
  bulk: number;
  tooFresh: number;
  /** Лише для оплати: є сума «сплачено», але немає запису оплати з датою */
  unverified: number;
}

export type StageStats = Record<StageKey, StageStat>;

export interface FunnelSpeedParams {
  /** YYYY-MM — межі за місяцем початку переходу (когорта) */
  from: string | null;
  to: string | null;
  minAgeDays: number;
}

export interface FunnelSpeedResult {
  params: FunnelSpeedParams;
  recordsTotal: number;
  overall: StageStats;
  /** Дні масових імпортів і правок — дати подій на ці дні відкинуто */
  bulkDays: BulkDays;
  bySource: { source: string; total: number; stages: StageStats }[];
  byCohort: { month: string; stages: StageStats }[];
}

// ── Дати ─────────────────────────────────────────────────────────────────────

const KYIV_YMD = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** YYYY-MM-DD за київським часом — так само, як і решта звітності */
export function kyivYmd(iso: string): string {
  return KYIV_YMD.format(new Date(iso));
}

const DAY_MS = 86_400_000;

function ymdToDay(ymd: string): number {
  return Date.parse(`${ymd}T00:00:00Z`) / DAY_MS;
}

// ── Статистика ───────────────────────────────────────────────────────────────

/** Перцентиль із лінійною інтерполяцією; масив має бути відсортованим */
export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** «3 год», «1,5 дн.», «27 дн.» — години, поки перехід швидший за добу */
export function formatDuration(days: number | null): string {
  if (days === null) return '—';
  if (days < 1) {
    const hours = days * 24;
    if (hours < 1) return '< 1 год';
    return `${Math.round(hours)} год`;
  }
  if (days < 10) return `${days.toLocaleString('uk-UA', { maximumFractionDigits: 1 })} дн.`;
  return `${Math.round(days).toLocaleString('uk-UA')} дн.`;
}

// ── Масові дні ───────────────────────────────────────────────────────────────

/**
 * Скільки подій одного виду за київський день вважаємо масовими.
 *
 * У живій базі медіана — 11 нових записів на день, а імпорти й масові правки дають
 * сотні й тисячі за добу (3 086 «конверсій» одним днем, 939 «створень» одним днем).
 * Така дата — це момент імпорту чи масової правки, а не момент події в житті
 * клієнта; якщо її взяти до розрахунку, «лід → клієнт» стає «167 днів», хоча це
 * лише різниця між справжнім створенням і днем, коли хтось поправив статус усім.
 * Нормальна доба в базі не доходить і до ста, тож поріг відокремлює їх чисто.
 */
export const BULK_DAY_MIN = 100;

export interface BulkDay { day: string; count: number }

/** Масові дні по трьох видах подій — щоб показати читачеві, що саме відкинуто */
export interface BulkDays {
  created: BulkDay[];
  converted: BulkDay[];
  deals: BulkDay[];
}

type BulkSets = Record<keyof BulkDays, Set<string>>;

function bulkDaysOf(ymds: (string | null)[]): BulkDay[] {
  const counts = new Map<string, number>();
  for (const d of ymds) if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= BULK_DAY_MIN)
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** «Конверсія» без паузи після створення — це клієнт, що ніколи не був лідом */
const isDirectClient = (r: FunnelRecord): boolean =>
  !r.isLead && !!r.convertedAt && Date.parse(r.convertedAt) - Date.parse(r.createdAt) < IMMEDIATE_CONVERSION_MS;

export function findBulkDays(records: FunnelRecord[]): BulkDays {
  return {
    created: bulkDaysOf(records.map(r => kyivYmd(r.createdAt))),
    // Лише справжні конверсії: пряме створення клієнтом датується тим самим днем, що й створення
    converted: bulkDaysOf(records.map(r => (r.convertedAt && !r.isLead && !isDirectClient(r) ? kyivYmd(r.convertedAt) : null))),
    deals: bulkDaysOf(records.map(r => (r.firstDealAt ? kyivYmd(r.firstDealAt) : null))),
  };
}

// ── Етапи ────────────────────────────────────────────────────────────────────

type Outcome =
  | { kind: 'skip' }
  | { kind: 'immediate' }
  | { kind: 'negative' }
  | { kind: 'bulk' }
  | { kind: 'open'; cohort: string; startDay: number }
  | { kind: 'done'; cohort: string; startDay: number; days: number };

/** Що сталось із записом на цьому переході; рахується один раз на запис */
function evaluate(r: FunnelRecord, stage: StageKey, bulk: BulkSets): Outcome {
  if (stage === 'leadToClient') {
    const createdYmd = kyivYmd(r.createdAt);
    const startDay = Date.parse(r.createdAt) / DAY_MS;
    const cohort = createdYmd.slice(0, 7);
    if (r.isLead) return bulk.created.has(createdYmd) ? { kind: 'bulk' } : { kind: 'open', cohort, startDay };
    if (!r.convertedAt) return { kind: 'skip' };
    const ms = Date.parse(r.convertedAt) - Date.parse(r.createdAt);
    if (ms < 0) return { kind: 'negative' };
    if (ms < IMMEDIATE_CONVERSION_MS) return { kind: 'immediate' };
    if (bulk.created.has(createdYmd) || bulk.converted.has(kyivYmd(r.convertedAt))) return { kind: 'bulk' };
    return { kind: 'done', cohort, startDay, days: ms / DAY_MS };
  }

  if (stage === 'clientToDeal') {
    if (r.isLead || !r.convertedAt) return { kind: 'skip' };
    // Створений одразу клієнтом — конверсії не було, відлік переходу не починається:
    // таких клієнтів заводять разом з угодою, і «0 годин» тут завжди, а не швидкість
    const sinceCreated = Date.parse(r.convertedAt) - Date.parse(r.createdAt);
    if (sinceCreated < 0) return { kind: 'negative' };
    if (sinceCreated < IMMEDIATE_CONVERSION_MS) return { kind: 'immediate' };

    const start = Date.parse(r.convertedAt);
    const convYmd = kyivYmd(r.convertedAt);
    if (bulk.converted.has(convYmd)) return { kind: 'bulk' };
    const cohort = convYmd.slice(0, 7);
    if (!r.firstDealAt) return { kind: 'open', cohort, startDay: start / DAY_MS };
    if (bulk.deals.has(kyivYmd(r.firstDealAt))) return { kind: 'bulk' };
    const ms = Date.parse(r.firstDealAt) - start;
    if (ms < 0) return { kind: 'negative' };
    return { kind: 'done', cohort, startDay: start / DAY_MS, days: ms / DAY_MS };
  }

  // dealToPayment — оплата має лише день, тож і рахуємо в календарних днях
  if (!r.firstDealAt) return { kind: 'skip' };
  const startYmd = kyivYmd(r.firstDealAt);
  if (bulk.deals.has(startYmd)) return { kind: 'bulk' };
  const startDay = ymdToDay(startYmd);
  const cohort = startYmd.slice(0, 7);
  if (!r.firstPaidDate) return { kind: 'open', cohort, startDay };
  const days = ymdToDay(r.firstPaidDate) - startDay;
  if (days < 0) return { kind: 'negative' };
  return { kind: 'done', cohort, startDay, days };
}

function emptyStat(): StageStat {
  return {
    entered: 0, reached: 0, share: null, median: null, p75: null, p90: null,
    immediate: 0, negative: 0, bulk: 0, tooFresh: 0, unverified: 0,
  };
}

/** Запис разом із підрахованими наперед результатами трьох переходів */
interface Evaluated {
  paidNoDate: boolean;
  outcomes: Record<StageKey, Outcome>;
}

function evaluateRecord(r: FunnelRecord, bulk: BulkSets): Evaluated {
  return {
    paidNoDate: !!r.paidNoDate,
    outcomes: {
      leadToClient: evaluate(r, 'leadToClient', bulk),
      clientToDeal: evaluate(r, 'clientToDeal', bulk),
      dealToPayment: evaluate(r, 'dealToPayment', bulk),
    },
  };
}

function computeStage(items: Evaluated[], stage: StageKey, nowDay: number, params: FunnelSpeedParams): StageStat {
  const stat = emptyStat();
  const durations: number[] = [];

  for (const it of items) {
    const o = it.outcomes[stage];
    if (o.kind === 'skip') continue;
    if (o.kind === 'immediate') { stat.immediate++; continue; }
    if (o.kind === 'negative') { stat.negative++; continue; }
    if (o.kind === 'bulk') { stat.bulk++; continue; }

    if (params.from && o.cohort < params.from) continue;
    if (params.to && o.cohort > params.to) continue;
    if (nowDay - o.startDay < params.minAgeDays) { stat.tooFresh++; continue; }

    stat.entered++;
    if (o.kind === 'done') {
      stat.reached++;
      durations.push(o.days);
    } else if (stage === 'dealToPayment' && it.paidNoDate) {
      stat.unverified++;
    }
  }

  durations.sort((a, b) => a - b);
  stat.share = stat.entered > 0 ? stat.reached / stat.entered : null;
  stat.median = quantile(durations, 0.5);
  stat.p75 = quantile(durations, 0.75);
  stat.p90 = quantile(durations, 0.9);
  return stat;
}

function computeStages(items: Evaluated[], nowDay: number, params: FunnelSpeedParams): StageStats {
  return {
    leadToClient: computeStage(items, 'leadToClient', nowDay, params),
    clientToDeal: computeStage(items, 'clientToDeal', nowDay, params),
    dealToPayment: computeStage(items, 'dealToPayment', nowDay, params),
  };
}

export function summarizeFunnelSpeed(
  records: FunnelRecord[],
  opts: Partial<FunnelSpeedParams> = {},
  now: Date = new Date(),
): FunnelSpeedResult {
  const params: FunnelSpeedParams = {
    from: opts.from ?? null,
    to: opts.to ?? null,
    minAgeDays: Math.max(0, opts.minAgeDays ?? 0),
  };
  const nowDay = now.getTime() / DAY_MS;

  const bulkDays = findBulkDays(records);
  const bulk: BulkSets = {
    created: new Set(bulkDays.created.map(d => d.day)),
    converted: new Set(bulkDays.converted.map(d => d.day)),
    deals: new Set(bulkDays.deals.map(d => d.day)),
  };

  // Результат кожного запису рахуємо один раз: форматування дат за київським
  // часом дороге, а розбивок по джерелах і місяцях десятки.
  const evaluated = records.map(r => evaluateRecord(r, bulk));

  // Джерела порівнюємо в нормалізованому вигляді («Meta Ads» == «meta_ads»),
  // а показуємо найчастіше написання
  const groups = new Map<string, { names: Map<string, number>; items: Evaluated[] }>();
  records.forEach((r, i) => {
    const key = normalizeSource(r.source) || 'nosource';
    let g = groups.get(key);
    if (!g) { g = { names: new Map(), items: [] }; groups.set(key, g); }
    g.items.push(evaluated[i]);
    g.names.set(r.source, (g.names.get(r.source) ?? 0) + 1);
  });

  const bySource = [...groups.values()]
    .map(g => ({
      source: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      total: g.items.length,
      stages: computeStages(g.items, nowDay, params),
    }))
    .sort((a, b) => b.total - a.total);

  // Когортна розбивка — по місяцю початку КОЖНОГО переходу окремо, тож рядок місяця
  // в одній колонці й у сусідній може стосуватись різних людей. Це свідомо: «коли
  // стартував перехід» — єдине чесне прив'язування.
  const monthSet = new Set<string>();
  for (const it of evaluated) {
    for (const o of Object.values(it.outcomes)) {
      if (o.kind === 'open' || o.kind === 'done') monthSet.add(o.cohort);
    }
  }
  const months = [...monthSet]
    .filter(m => (!params.from || m >= params.from) && (!params.to || m <= params.to))
    .sort()
    .reverse();
  // Місяць, у якому через поріг зрілості не лишилось жодного учасника, — порожній
  // рядок із прочерками; його не показуємо
  const byCohort = months
    .map(month => ({
      month,
      stages: computeStages(evaluated, nowDay, { ...params, from: month, to: month }),
    }))
    .filter(c => Object.values(c.stages).some(s => s.entered > 0));

  return {
    params,
    recordsTotal: records.length,
    overall: computeStages(evaluated, nowDay, params),
    bulkDays,
    bySource,
    byCohort,
  };
}

// ── Збирання записів з «сирих» даних CRM ─────────────────────────────────────

export interface RawClient {
  id: string;
  source: string;
  createdAt: string;
  isLead: boolean;
  leadUpdatedAt: string | null;
}
export interface RawDeal { clientId: string; createdAt: string; paidAmount: number }
export interface RawPayment { clientId: string; at: string }

export interface BuildStats { orphanDeals: number; orphanPayments: number; futurePayments: number }

/** Прибрати мілісекунди — записів десятки тисяч, а точність до секунди нам досить */
const trimIso = (iso: string): string => new Date(iso).toISOString().replace(/\.\d{3}Z$/, 'Z');

const validDate = (s: string | null | undefined): s is string => !!s && !Number.isNaN(Date.parse(s));

/**
 * Оновити набір записів свіжими даними з CRM.
 *
 * Повне вивантаження — понад півтори тисячі запитів при ліміті API 100 на хвилину,
 * тож щодоби тягнемо лише змінене. Тому злиття, а не побудова з нуля:
 *   клієнти  — перезаписуємо їхні власні поля, а накопичені дати угод/оплат лишаємо;
 *   угоди    — найраніша створена лише знижується (нові угоди старішими не стають);
 *   оплати   — завжди ВСІ (їх мало), і перша оплата перераховується для кожного:
 *              оплату можна перенести датою назад або скасувати.
 * Побудова з нуля — це злиття в порожній набір.
 *
 * Чого злиття не бачить: видалених угод і клієнтів, переданих угод. Це лікує
 * регулярне повне вивантаження.
 */
export function mergeFunnelRecords(
  existing: FunnelRecord[],
  clients: RawClient[],
  deals: RawDeal[],
  payments: RawPayment[],
  todayYmd: string,
): { records: FunnelRecord[]; stats: BuildStats } {
  const byId = new Map<string, FunnelRecord>();
  for (const r of existing) byId.set(r.id, { ...r });

  for (const c of clients) {
    if (!validDate(c.createdAt)) continue;
    const prev = byId.get(c.id);
    byId.set(c.id, {
      id: c.id,
      source: c.source || 'Не вказано',
      createdAt: trimIso(c.createdAt),
      isLead: c.isLead,
      // Клієнт без дати конверсії (давній імпорт) — вважаємо створеним клієнтом:
      // з переходу «лід → клієнт» він випаде, а в «клієнт → угода» стартує з дати створення
      convertedAt: c.isLead ? null : trimIso(validDate(c.leadUpdatedAt) ? c.leadUpdatedAt : c.createdAt),
      firstDealAt: prev?.firstDealAt ?? null,
      firstPaidDate: prev?.firstPaidDate ?? null,
      ...(prev?.paidNoDate ? { paidNoDate: true as const } : {}),
    });
  }

  const stats: BuildStats = { orphanDeals: 0, orphanPayments: 0, futurePayments: 0 };
  const paidDealClients = new Set<string>();

  for (const d of deals) {
    const r = byId.get(d.clientId);
    if (!r) { stats.orphanDeals++; continue; }
    if (!validDate(d.createdAt)) continue;
    const at = trimIso(d.createdAt);
    if (!r.firstDealAt || Date.parse(at) < Date.parse(r.firstDealAt)) r.firstDealAt = at;
    if (d.paidAmount > 0) paidDealClients.add(d.clientId);
  }

  // Оплати перераховуємо з нуля — див. пояснення вище
  for (const r of byId.values()) r.firstPaidDate = null;
  for (const p of payments) {
    const r = byId.get(p.clientId);
    if (!r) { stats.orphanPayments++; continue; }
    const day = (p.at || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    // Оплата з датою в майбутньому — це ще не оплата, а обіцянка
    if (day > todayYmd) { stats.futurePayments++; continue; }
    if (!r.firstPaidDate || day < r.firstPaidDate) r.firstPaidDate = day;
  }

  for (const r of byId.values()) {
    if (r.firstPaidDate) delete r.paidNoDate;
    else if (paidDealClients.has(r.id)) r.paidNoDate = true;
  }

  return { records: [...byId.values()], stats };
}

/** Побудова з нуля: усе вивантаження цілком */
export function buildFunnelRecords(
  clients: RawClient[],
  deals: RawDeal[],
  payments: RawPayment[],
  todayYmd: string,
): { records: FunnelRecord[]; stats: BuildStats } {
  return mergeFunnelRecords([], clients, deals, payments, todayYmd);
}

// ── Службові типи обміну клієнта із сервером ─────────────────────────────────

export interface FunnelSpeedMeta {
  /** Початок останнього прогону — від нього наступний тягне лише змінене */
  lastSyncedAt: string;
  /** Початок останнього ПОВНОГО прогону; інкрементальні видалень не бачать */
  lastFullAt: string;
  mode: 'full' | 'incremental';
  clients: number;
  /** Скільки записів отримано в цьому прогоні (в інкрементальному — лише змінені) */
  fetched: { clients: number; deals: number; payments: number };
  /** Угоди й оплати, чиїх клієнтів немає у вивантаженні — про них ми не знаємо джерела */
  orphanDeals: number;
  orphanPayments: number;
  futurePayments: number;
  /** Скільки записів API обіцяв проти скількох ми отримали — розбіжність означає зсув сторінок */
  warning: string | null;
  durationSec: number;
}

/** Стан фонового вивантаження: воно триває хвилини, і відповідь на POST його не чекає */
export interface FunnelSpeedState {
  running: boolean;
  mode: 'full' | 'incremental' | null;
  phase: string;
  done: number;
  total: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export interface FunnelSpeedResponse {
  meta: FunnelSpeedMeta | null;
  result: FunnelSpeedResult | null;
  state: FunnelSpeedState;
}

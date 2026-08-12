/**
 * Фільтрація, сортування і статистика по клієнтах — чиста логіка без React.
 *
 * Винесено з LtvAnalyticsModal, щоб її можна було перевірити тестами і щоб
 * модалка лишалась про рендер, а не про математику.
 */

export interface MonthStats {
  revenue: number;
  deals: number;
}

export interface ClientRecord {
  id: string;
  name: string;
  /** Дохід за весь час */
  revenue: number;
  /** Кількість угод за весь час */
  agreementsCount: number;
  tags: string[];
  lastPurchaseDate?: string;
  /**
   * Дохід і кількість угод по місяцях — дозволяє рахувати аналітику за довільний
   * період без повторного вивантаження з CRM.
   */
  monthlyStats?: Record<string, MonthStats>;
  /** Старий формат знімків: лише перелік місяців, без сум */
  purchaseMonths?: string[];
}

/** Період аналітики з місячною точністю — дрібнішої в даних немає */
export interface MonthRange {
  from: string; // 'YYYY-MM'
  to: string;   // 'YYYY-MM'
}

/** Місяці покупок, з підтримкою знімків старого формату */
export function getPurchaseMonths(c: ClientRecord): string[] {
  if (c.monthlyStats) return Object.keys(c.monthlyStats).sort();
  return [...(c.purchaseMonths ?? [])].sort();
}

export interface RfmSegment {
  label: string;
  color: string;
  icon: string;
}

// ── Новий чи постійний ────────────────────────────────────────────────────────

/**
 * Хто зробив замовлення: клієнт, якого щойно залучили, чи той, що повернувся.
 *
 * 'unknown' — не «щось середнє», а «даних не вистачає»: у клієнта немає жодного
 * місяця покупки, тож сказати, коли він з'явився, неможливо. Такі рядки
 * рахуються окремо, щоб не роздувати ні один із двох осмислених боків.
 */
export type CustomerKind = 'new' | 'returning' | 'unknown';

export const CUSTOMER_KINDS: CustomerKind[] = ['new', 'returning', 'unknown'];

export const CUSTOMER_KIND_LABELS: Record<CustomerKind, string> = {
  new:       'Новий',
  returning: 'Постійний',
  unknown:   'Без історії',
};

export interface CustomerKindStyle {
  /** Заголовок боку в картці — множина, бо там мова про групу */
  title: string;
  /** Класи Tailwind для бейджа в таблиці */
  badge: string;
  /** Колір великого числа в картці */
  text: string;
  /** Колір сегмента смужки */
  bar: string;
  /** Тло вибраного боку */
  soft: string;
  border: string;
}

export const CUSTOMER_KIND_STYLES: Record<CustomerKind, CustomerKindStyle> = {
  returning: {
    title: 'Постійні клієнти',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    text: 'text-emerald-700', bar: 'bg-emerald-500', soft: 'bg-emerald-50/70', border: 'border-emerald-100',
  },
  new: {
    title: 'Нові клієнти',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    text: 'text-purple-700', bar: 'bg-purple-500', soft: 'bg-purple-50/70', border: 'border-purple-100',
  },
  unknown: {
    title: 'Без історії',
    badge: 'bg-gray-50 text-gray-500 border-gray-200',
    text: 'text-gray-500', bar: 'bg-gray-300', soft: 'bg-gray-50', border: 'border-gray-100',
  },
};

/**
 * Новий чи постійний — відносно ПОЧАТКУ вибраного періоду.
 *
 * Правило одне: клієнт постійний, якщо він уже купував до того, як почалось
 * те, на що ви зараз дивитесь.
 *
 *  - є період: постійний = перша покупка сталась ДО period.from. Тобто в періоді
 *    він приходить уже не вперше, і будь-яке його замовлення тут — повторне.
 *  - весь час: «до» не існує, тож межею стає сама перша покупка — постійний
 *    той, хто купував більше одного разу.
 *
 * Обидві гілки відповідають на одне питання й тому дають узгоджені числа:
 * «новий» ніколи не означає «купував і раніше».
 */
export function classifyCustomer(
  months: string[],
  totalDeals: number,
  period: MonthRange | null,
): CustomerKind {
  if (months.length === 0) return 'unknown';
  if (period) return months[0] < period.from ? 'returning' : 'new';
  // Дві покупки в одному місяці — теж повернення, тому дивимось і на угоди
  return Math.max(totalDeals, months.length) > 1 ? 'returning' : 'new';
}

/** Клієнт із похідними полями, порахованими один раз */
export interface EnrichedClient extends ClientRecord {
  /** Дохід у вибраному періоді (без періоду — за весь час) */
  periodRevenue: number;
  /** Угоди у вибраному періоді (без періоду — за весь час) */
  periodDeals: number;
  /** Середній чек у періоді: periodRevenue ÷ periodDeals */
  avgCheck: number;
  /**
   * Днів від останньої покупки — завжди відносно СЬОГОДНІ й за весь час.
   * Це факт про теперішній стан клієнта, а не про період, тому не звужується:
   * інакше «сплячий» клієнт виглядав би свіжим лише тому, що ви дивитесь
   * на місяць, у якому він купував.
   */
  recencyDays: number | null;
  /**
   * Місяць ПЕРШОЇ покупки за весь час. Теж не звужується періодом: когорта —
   * це походження клієнта, і воно не змінюється від того, який зріз ви відкрили.
   */
  cohortMonth: string | null;
  /** Чи була у клієнта хоч одна угода у вибраному періоді */
  inPeriod: boolean;
  /** Новий чи постійний — відносно початку періоду; див. classifyCustomer */
  customerKind: CustomerKind;
  rfm: RfmSegment;
}

// ── RFM ───────────────────────────────────────────────────────────────────────

/**
 * Пороги RFM. Винесені в об'єкт, бо «3 угоди за 90 днів» осмислене для швидких
 * продажів і безглузде для довгого циклу — це має бути налаштовним, а не вшитим.
 */
export interface RfmThresholds {
  championDeals: number;
  championDays: number;
  loyalDeals: number;
  loyalDays: number;
  dormantDays: number;
  newDays: number;
}

export const DEFAULT_RFM_THRESHOLDS: RfmThresholds = {
  championDeals: 3,
  championDays: 90,
  loyalDeals: 2,
  loyalDays: 180,
  dormantDays: 180,
  newDays: 60,
};

export const RFM_LABELS = ['Чемпіон', 'Лояльний', 'Сплячий', 'Новий', 'Зона ризику', 'Звичайний'] as const;

/**
 * Пороги в тому порядку, в якому їх перевіряє getRfmSegment.
 *
 * Порядок тут не косметичний: перше правило, що спрацювало, забирає клієнта,
 * тож «Чемпіон» завжди виграє в «Лояльного». Панель налаштувань показує рядки
 * саме в цьому порядку — інакше неможливо зрозуміти, чому клієнт із трьома
 * угодами не потрапив у сегмент, який ви щойно розширили.
 */
export const RFM_RULES: {
  label: typeof RFM_LABELS[number];
  /** Пороги, які впливають на це правило; пусто — для «Звичайного» */
  fields: { key: keyof RfmThresholds; label: string; unit: string }[];
  describe: (t: RfmThresholds) => string;
}[] = [
  {
    label: 'Чемпіон',
    fields: [
      { key: 'championDeals', label: 'від угод', unit: 'угод' },
      { key: 'championDays', label: 'купував не пізніше', unit: 'днів' },
    ],
    describe: t => `від ${t.championDeals} угод і покупка за останні ${t.championDays} днів`,
  },
  {
    label: 'Лояльний',
    fields: [
      { key: 'loyalDeals', label: 'від угод', unit: 'угод' },
      { key: 'loyalDays', label: 'купував не пізніше', unit: 'днів' },
    ],
    describe: t => `від ${t.loyalDeals} угод і покупка за останні ${t.loyalDays} днів`,
  },
  {
    label: 'Сплячий',
    fields: [{ key: 'dormantDays', label: 'не купував понад', unit: 'днів' }],
    describe: t => `від ${t.loyalDeals} угод, але не купував понад ${t.dormantDays} днів`,
  },
  {
    label: 'Зона ризику',
    fields: [],
    describe: t => `рівно 1 угода і не купував понад ${t.dormantDays} днів`,
  },
  {
    label: 'Новий',
    fields: [{ key: 'newDays', label: 'перша покупка за', unit: 'днів' }],
    describe: t => `рівно 1 угода за останні ${t.newDays} днів`,
  },
  {
    label: 'Звичайний',
    fields: [],
    describe: () => 'усі, хто не підійшов під жодне правило вище',
  },
];

/**
 * Суперечності в порогах, які зрозумілі лише як текст.
 *
 * Пороги перевіряються по черзі, тож «розширив сегмент, а він порожній» —
 * найчастіша пастка при налаштуванні: правило вище просто забирає клієнтів
 * раніше. Замість того щоб мовчки віддати порожній сегмент, називаємо причину.
 */
export function checkRfmThresholds(t: RfmThresholds): string[] {
  const warnings: string[] = [];

  for (const [key, value] of Object.entries(t)) {
    if (!Number.isFinite(value) || value < 1) {
      warnings.push(`«${key}» має бути додатним числом — зараз ${value}.`);
    }
  }

  if (t.championDeals < t.loyalDeals) {
    warnings.push(
      `Чемпіону треба менше угод (${t.championDeals}), ніж Лояльному (${t.loyalDeals}) — ` +
      'тоді Лояльний недосяжний, бо Чемпіон забирає всіх раніше.',
    );
  }
  if (t.championDays > t.loyalDays) {
    warnings.push(
      `Чемпіон допускає давнішу покупку (${t.championDays} дн.), ніж Лояльний (${t.loyalDays} дн.) — ` +
      'Лояльний лишиться майже порожнім.',
    );
  }
  if (t.dormantDays < t.loyalDays) {
    warnings.push(
      `Сплячий починається раніше (${t.dormantDays} дн.), ніж закінчується Лояльний (${t.loyalDays} дн.) — ` +
      'у проміжку клієнти дістаються Лояльному, і Сплячий звузиться.',
    );
  }
  if (t.newDays > t.dormantDays) {
    warnings.push(
      `Новий тягнеться далі (${t.newDays} дн.), ніж поріг Сплячого (${t.dormantDays} дн.) — ` +
      'клієнти з однією угодою підуть у Зону ризику замість Нового.',
    );
  }

  return warnings;
}

/** Скільки клієнтів у кожному сегменті — щоб пороги налаштовувати по числах, а не наосліп */
export function countByRfm(clients: EnrichedClient[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const label of RFM_LABELS) counts[label] = 0;
  for (const c of clients) counts[c.rfm.label] = (counts[c.rfm.label] ?? 0) + 1;
  return counts;
}

/**
 * Пороги з довільного джерела — зі спільного стану, який пишуть інші люди
 * й інші версії застосунку. Кожне поле або проходить перевірку, або
 * замінюється значенням за замовчуванням; часткові об'єкти доповнюються.
 */
export function sanitizeRfmThresholds(raw: unknown): RfmThresholds {
  if (!raw || typeof raw !== 'object') return DEFAULT_RFM_THRESHOLDS;
  const v = raw as Record<string, unknown>;
  const out = { ...DEFAULT_RFM_THRESHOLDS };
  for (const key of Object.keys(DEFAULT_RFM_THRESHOLDS) as (keyof RfmThresholds)[]) {
    const n = v[key];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1) out[key] = Math.round(n);
  }
  return out;
}

/** Вигляд кожного сегмента — один опис на застосунок, щоб бейдж у таблиці
    й бейдж у налаштуваннях не розійшлись кольорами */
export const RFM_STYLES: Record<string, RfmSegment> = {
  'Чемпіон':      { label: 'Чемпіон',     color: 'bg-amber-100 text-amber-800 border-amber-200',       icon: '👑' },
  'Лояльний':     { label: 'Лояльний',    color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: '🌟' },
  'Сплячий':      { label: 'Сплячий',     color: 'bg-blue-100 text-blue-800 border-blue-200',          icon: '💤' },
  'Новий':        { label: 'Новий',       color: 'bg-purple-100 text-purple-800 border-purple-200',    icon: '🆕' },
  'Зона ризику':  { label: 'Зона ризику', color: 'bg-red-100 text-red-800 border-red-200',             icon: '🚨' },
  'Звичайний':    { label: 'Звичайний',   color: 'bg-gray-100 text-gray-700 border-gray-200',          icon: '🙂' },
};

export function getRfmSegment(
  client: ClientRecord,
  recencyDays: number | null,
  t: RfmThresholds = DEFAULT_RFM_THRESHOLDS,
): RfmSegment {
  if (recencyDays === null) return RFM_STYLES['Звичайний'];
  const n = client.agreementsCount;

  if (n >= t.championDeals && recencyDays <= t.championDays) return RFM_STYLES['Чемпіон'];
  if (n >= t.loyalDeals && recencyDays <= t.loyalDays)        return RFM_STYLES['Лояльний'];
  if (n >= t.loyalDeals && recencyDays > t.dormantDays)       return RFM_STYLES['Сплячий'];
  if (n === 1 && recencyDays > t.dormantDays)                 return RFM_STYLES['Зона ризику'];
  if (n === 1 && recencyDays <= t.newDays)                    return RFM_STYLES['Новий'];

  return RFM_STYLES['Звичайний'];
}

// ── Збагачення ────────────────────────────────────────────────────────────────

/**
 * @param period якщо заданий — дохід, угоди й середній чек рахуються лише за
 *        місяці в цьому діапазоні. Знімки старого формату не мають помісячних
 *        сум, тож для них показники лишаються за весь час (див. hasMonthlyStats).
 */
export function enrichClients(
  clients: ClientRecord[],
  now: Date = new Date(),
  thresholds: RfmThresholds = DEFAULT_RFM_THRESHOLDS,
  period: MonthRange | null = null,
): EnrichedClient[] {
  return clients.map(c => {
    let recencyDays: number | null = null;
    if (c.lastPurchaseDate) {
      const t = new Date(c.lastPurchaseDate).getTime();
      if (!isNaN(t)) recencyDays = Math.floor((now.getTime() - t) / 86_400_000);
    }

    const months = getPurchaseMonths(c);

    let periodRevenue = c.revenue;
    let periodDeals = c.agreementsCount;
    let inPeriod = true;

    if (period) {
      if (c.monthlyStats) {
        periodRevenue = 0;
        periodDeals = 0;
        for (const [m, s] of Object.entries(c.monthlyStats)) {
          if (m >= period.from && m <= period.to) {
            periodRevenue += s.revenue;
            periodDeals += s.deals;
          }
        }
        inPeriod = periodDeals > 0;
      } else {
        // Старий формат: сум по місяцях немає, але самі місяці є — принаймні
        // можемо сказати, чи була активність у періоді.
        inPeriod = months.some(m => m >= period.from && m <= period.to);
      }
    }

    return {
      ...c,
      periodRevenue,
      periodDeals,
      avgCheck: periodDeals > 0 ? Math.round(periodRevenue / periodDeals) : 0,
      recencyDays,
      cohortMonth: months.length > 0 ? months[0] : null,
      inPeriod,
      customerKind: classifyCustomer(months, c.agreementsCount, period),
      rfm: getRfmSegment(c, recencyDays, thresholds),
    };
  });
}

// ── Фільтри ───────────────────────────────────────────────────────────────────

export type RecencyBucket = 'lt30' | '30_90' | '90_180' | 'gt180' | 'never';

export const RECENCY_LABELS: Record<RecencyBucket, string> = {
  lt30:    'до 30 днів',
  '30_90': '30–90 днів',
  '90_180':'90–180 днів',
  gt180:   'понад 180 днів',
  never:   'без покупок',
};

export interface ClientFilters {
  /** Клієнт має містити ХОЧА Б ОДИН із цих тегів */
  tagsInclude: string[];
  /** Клієнт не має містити ЖОДНОГО з цих тегів */
  tagsExclude: string[];
  /** Показувати лише ці RFM-сегменти; порожній масив = всі */
  rfm: string[];
  revenueMin: number | null;
  revenueMax: number | null;
  dealsMin: number | null;
  dealsMax: number | null;
  avgCheckMin: number | null;
  avgCheckMax: number | null;
  recency: RecencyBucket[];
  /** Місяць першої покупки 'YYYY-MM' */
  cohortMonth: string | null;
  /** Пошук по назві клієнта */
  search: string;
}

export const EMPTY_FILTERS: ClientFilters = {
  tagsInclude: [],
  tagsExclude: [],
  rfm: [],
  revenueMin: null,
  revenueMax: null,
  dealsMin: null,
  dealsMax: null,
  avgCheckMin: null,
  avgCheckMax: null,
  recency: [],
  cohortMonth: null,
  search: '',
};

export function recencyBucket(days: number | null): RecencyBucket {
  if (days === null) return 'never';
  if (days < 30) return 'lt30';
  if (days < 90) return '30_90';
  if (days <= 180) return '90_180';
  return 'gt180';
}

/** Скільки фільтрів зараз активні — для лічильника і кнопки «скинути» */
export function countActiveFilters(f: ClientFilters): number {
  let n = 0;
  if (f.tagsInclude.length) n++;
  if (f.tagsExclude.length) n++;
  if (f.rfm.length) n++;
  if (f.revenueMin !== null || f.revenueMax !== null) n++;
  if (f.dealsMin !== null || f.dealsMax !== null) n++;
  if (f.avgCheckMin !== null || f.avgCheckMax !== null) n++;
  if (f.recency.length) n++;
  if (f.cohortMonth) n++;
  if (f.search.trim()) n++;
  return n;
}

const inRange = (v: number, min: number | null, max: number | null) =>
  (min === null || v >= min) && (max === null || v <= max);

export function applyFilters(clients: EnrichedClient[], f: ClientFilters): EnrichedClient[] {
  const search = f.search.trim().toLowerCase();
  const include = f.tagsInclude.map(t => t.toLowerCase());
  const exclude = f.tagsExclude.map(t => t.toLowerCase());

  return clients.filter(c => {
    const tags = c.tags.map(t => t.toLowerCase());

    // Клієнти без жодної угоди в періоді до вибірки не потрапляють
    if (!c.inPeriod) return false;
    if (include.length && !include.some(t => tags.includes(t))) return false;
    if (exclude.length && exclude.some(t => tags.includes(t))) return false;
    if (f.rfm.length && !f.rfm.includes(c.rfm.label)) return false;
    if (!inRange(c.periodRevenue, f.revenueMin, f.revenueMax)) return false;
    if (!inRange(c.periodDeals, f.dealsMin, f.dealsMax)) return false;
    if (!inRange(c.avgCheck, f.avgCheckMin, f.avgCheckMax)) return false;
    if (f.recency.length && !f.recency.includes(recencyBucket(c.recencyDays))) return false;
    if (f.cohortMonth && c.cohortMonth !== f.cohortMonth) return false;
    if (search && !c.name.toLowerCase().includes(search)) return false;

    return true;
  });
}

// ── Сортування ────────────────────────────────────────────────────────────────

export type SortKey = 'revenue' | 'deals' | 'avgCheck' | 'recency' | 'name' | 'cohort';
export type SortDir = 'asc' | 'desc';

export const SORT_LABELS: Record<SortKey, string> = {
  revenue:  'Дохід',
  deals:    'Кількість угод',
  avgCheck: 'Середній чек',
  recency:  'Давність покупки',
  name:     'Назва',
  cohort:   'Когорта',
};

export function sortClients(clients: EnrichedClient[], key: SortKey, dir: SortDir): EnrichedClient[] {
  const sign = dir === 'asc' ? 1 : -1;

  return [...clients].sort((a, b) => {
    switch (key) {
      case 'revenue':  return (a.periodRevenue - b.periodRevenue) * sign;
      case 'deals':    return (a.periodDeals - b.periodDeals) * sign;
      case 'avgCheck': return (a.avgCheck - b.avgCheck) * sign;
      case 'name':     return a.name.localeCompare(b.name, 'uk') * sign;
      case 'recency': {
        // Клієнти без дати покупки завжди в кінці, незалежно від напрямку —
        // інакше вони витісняли б осмислені рядки з початку списку.
        if (a.recencyDays === null && b.recencyDays === null) return 0;
        if (a.recencyDays === null) return 1;
        if (b.recencyDays === null) return -1;
        return (a.recencyDays - b.recencyDays) * sign;
      }
      case 'cohort': {
        if (!a.cohortMonth && !b.cohortMonth) return 0;
        if (!a.cohortMonth) return 1;
        if (!b.cohortMonth) return -1;
        return a.cohortMonth.localeCompare(b.cohortMonth) * sign;
      }
    }
  });
}

// ── Довідники для контролів ───────────────────────────────────────────────────

/** Усі теги з лічильниками, від найпоширенішого */
export function collectTags(clients: ClientRecord[]): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  for (const c of clients) {
    // Один клієнт рахується за тег один раз, навіть якщо тег дубльований
    for (const tag of new Set(c.tags)) {
      map.set(tag, (map.get(tag) || 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'uk'));
}

/** Усі когорти (місяці першої покупки), від найновішої */
export function collectCohortMonths(clients: EnrichedClient[]): { month: string; count: number }[] {
  const map = new Map<string, number>();
  for (const c of clients) {
    if (c.cohortMonth) map.set(c.cohortMonth, (map.get(c.cohortMonth) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

// ── Розподіл доходу ───────────────────────────────────────────────────────────

export interface RevenueDistribution {
  count: number;
  total: number;
  mean: number;
  median: number;
  p90: number;
  /** Частка загального доходу, яку дають 10 % найбільших клієнтів (0–100) */
  top10Share: number;
  /** Скільки саме клієнтів потрапило в ці 10 % — «10 %» від малої вибірки це одиниці */
  top10Count: number;
  /** Поріг входу в топ-10 %: дохід найменшого з них. Нижче цього — вже не топ */
  top10Threshold: number;
  buckets: { from: number; to: number | null; count: number }[];
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Розподіл доходу по клієнтах.
 *
 * Саме лише середнє приховує найважливіше: ARPU 47 тис. однаково описує і «всі
 * приносять приблизно стільки», і «один приносить мільйон, решта — нуль».
 * Медіана й частка топ-10 % розрізняють ці два випадки.
 */
export function computeDistribution(clients: EnrichedClient[], bucketCount = 6): RevenueDistribution {
  const count = clients.length;
  if (count === 0) {
    return {
      count: 0, total: 0, mean: 0, median: 0, p90: 0,
      top10Share: 0, top10Count: 0, top10Threshold: 0, buckets: [],
    };
  }

  const sorted = clients.map(c => c.periodRevenue).sort((a, b) => a - b);
  const total = sorted.reduce((s, v) => s + v, 0);

  const topCount = Math.max(1, Math.round(count * 0.1));
  const topRevenue = sorted.slice(count - topCount).reduce((s, v) => s + v, 0);

  const p90 = quantile(sorted, 0.9);
  // Верхню межу гістограми беремо по p90, інакше один викид розтягує всі стовпці
  // в нуль, і картинка перестає щось показувати.
  const upper = p90 > 0 ? p90 : (sorted[sorted.length - 1] || 1);
  const step = upper / bucketCount;

  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    from: Math.round(i * step),
    to: Math.round((i + 1) * step),
    count: 0,
  })) as { from: number; to: number | null; count: number }[];
  buckets.push({ from: Math.round(upper), to: null, count: 0 });

  for (const v of sorted) {
    if (v >= upper) { buckets[bucketCount].count++; continue; }
    const idx = step > 0 ? Math.min(bucketCount - 1, Math.floor(v / step)) : 0;
    buckets[idx].count++;
  }

  return {
    count,
    total,
    mean: Math.round(total / count),
    median: Math.round(quantile(sorted, 0.5)),
    p90: Math.round(p90),
    top10Share: total > 0 ? Math.round((topRevenue / total) * 1000) / 10 : 0,
    top10Count: topCount,
    top10Threshold: sorted[count - topCount],
    buckets,
  };
}

// ── Нові й постійні клієнти ───────────────────────────────────────────────────

export interface CustomerMixBucket {
  kind: CustomerKind;
  clients: number;
  deals: number;
  revenue: number;
  /** Частки від усієї вибірки, 0–100 з одним знаком */
  clientsShare: number;
  dealsShare: number;
  revenueShare: number;
  /** Середній чек боку: revenue ÷ deals */
  avgCheck: number;
}

export interface CustomerMix {
  new: CustomerMixBucket;
  returning: CustomerMixBucket;
  unknown: CustomerMixBucket;
  totalClients: number;
  totalDeals: number;
  totalRevenue: number;
  /**
   * Відносно чого рахувалась новизна:
   *  'period'   — перша покупка до початку вибраного періоду;
   *  'lifetime' — періоду немає, тож межа це друга покупка за весь час.
   */
  basis: 'period' | 'lifetime';
}

const share = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

/**
 * Скільки замовлень і доходу дають нові клієнти, а скільки — постійні.
 *
 * Рахується по замовленнях у періоді, а мітка береться з classifyCustomer —
 * тому «85 % замовлень від постійних» і «постійних клієнтів у списку 40» завжди
 * про одних і тих самих людей, а не про два різні визначення.
 *
 * Клієнти без жодного місяця покупки не діляться навпіл і не приписуються до
 * нових: вони йдуть у unknown і видимі окремо, інакше частки тихо брехали б.
 */
export function computeCustomerMix(
  clients: EnrichedClient[],
  period: MonthRange | null,
): CustomerMix {
  const acc: Record<CustomerKind, { clients: number; deals: number; revenue: number }> = {
    new:       { clients: 0, deals: 0, revenue: 0 },
    returning: { clients: 0, deals: 0, revenue: 0 },
    unknown:   { clients: 0, deals: 0, revenue: 0 },
  };

  for (const c of clients) {
    const b = acc[c.customerKind];
    b.clients += 1;
    b.deals += c.periodDeals;
    b.revenue += c.periodRevenue;
  }

  const totalClients = clients.length;
  const totalDeals = acc.new.deals + acc.returning.deals + acc.unknown.deals;
  const totalRevenue = acc.new.revenue + acc.returning.revenue + acc.unknown.revenue;

  const bucket = (kind: CustomerKind): CustomerMixBucket => {
    const b = acc[kind];
    return {
      kind,
      ...b,
      clientsShare: share(b.clients, totalClients),
      dealsShare: share(b.deals, totalDeals),
      revenueShare: share(b.revenue, totalRevenue),
      avgCheck: b.deals > 0 ? Math.round(b.revenue / b.deals) : 0,
    };
  };

  return {
    new: bucket('new'),
    returning: bucket('returning'),
    unknown: bucket('unknown'),
    totalClients,
    totalDeals,
    totalRevenue,
    basis: period ? 'period' : 'lifetime',
  };
}

// ── Тіри клієнтів ─────────────────────────────────────────────────────────────

export type TierId = 1 | 2 | 3 | 4;

export interface TierMeta {
  id: TierId;
  label: string;
  /** Яку частку клієнтів-платників забирає тір */
  sharePct: number;
  hint: string;
  /** Класи Tailwind для бейджа в таблиці */
  badge: string;
  /** Колір смужки в картці розподілу */
  bar: string;
}

/**
 * Межі тірів — за часткою КІЛЬКОСТІ платників, не за сумою.
 *
 * Так «Tier 1» лишається зрозумілим («десята частина клієнтів, найбільші»)
 * незалежно від того, наскільки перекошений дохід. Поділ за накопиченою сумою
 * (класичний ABC) при перекосі дає Tier 1 з одного клієнта, і тір перестає
 * бути придатним для роботи — з ним нічого не сплануєш.
 */
export const TIERS: TierMeta[] = [
  { id: 1, label: 'Tier 1', sharePct: 10, hint: 'топ-10 % за доходом',   badge: 'bg-amber-100 text-amber-800 border-amber-200',       bar: 'bg-amber-500' },
  { id: 2, label: 'Tier 2', sharePct: 20, hint: 'наступні 20 %',          badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', bar: 'bg-emerald-500' },
  { id: 3, label: 'Tier 3', sharePct: 30, hint: 'наступні 30 %',          badge: 'bg-blue-100 text-blue-800 border-blue-200',          bar: 'bg-blue-500' },
  { id: 4, label: 'Tier 4', sharePct: 40, hint: 'решта платників',        badge: 'bg-gray-100 text-gray-600 border-gray-200',          bar: 'bg-gray-400' },
];

/** Накопичені межі: Tier 1 — до 10 %, Tier 2 — до 30 %, Tier 3 — до 60 %, далі Tier 4 */
const TIER_CUTS: { tier: TierId; upTo: number }[] = [
  { tier: 1, upTo: 0.1 },
  { tier: 2, upTo: 0.3 },
  { tier: 3, upTo: 0.6 },
];

export interface TieredClient extends EnrichedClient {
  /** null — клієнт без доходу в періоді, він поза тірами */
  tier: TierId | null;
}

export interface TierStat {
  tier: TierId;
  count: number;
  revenue: number;
  /** Частка загального доходу вибірки, 0–100 */
  revenueShare: number;
  /** Поріг входу — дохід найменшого клієнта тіру */
  minRevenue: number;
  maxRevenue: number;
  avgRevenue: number;
}

export interface TierBreakdown {
  clients: TieredClient[];
  stats: TierStat[];
  /** Скільки платників розподілено по тірах */
  rankedCount: number;
  /** Клієнти з нульовим доходом у періоді — у тіри не потрапляють */
  zeroRevenueCount: number;
  /** Загальний дохід вибірки — база для revenueShare */
  total: number;
}

/**
 * Розкласти клієнтів на Tier 1–4 за доходом у періоді.
 *
 * Клієнти з нульовим доходом до тірів не входять узагалі. Інакше при
 * перекошених даних три нижні тіри складались би з самих нулів і не
 * розрізняли б нікого: «Tier 3: 0 ₴» нічого не каже про клієнта.
 *
 * Однакові суми не розриваються межею тіру — два клієнти з тим самим доходом
 * в різних тірах виглядають як помилка, навіть коли межа проходить рівно між ними.
 */
export function assignTiers(clients: EnrichedClient[]): TierBreakdown {
  const earners = clients
    .filter(c => c.periodRevenue > 0)
    .sort((a, b) => b.periodRevenue - a.periodRevenue);

  const n = earners.length;
  const tierOf = new Map<string, TierId>();

  let start = 0;
  for (const { tier, upTo } of TIER_CUTS) {
    if (start >= n) break;
    // Хоча б один клієнт на тір, поки платники не скінчились
    let end = Math.min(n, Math.max(start + 1, Math.round(n * upTo)));
    while (end < n && earners[end].periodRevenue === earners[end - 1].periodRevenue) end++;
    for (let i = start; i < end; i++) tierOf.set(earners[i].id, tier);
    start = end;
  }
  for (let i = start; i < n; i++) tierOf.set(earners[i].id, 4);

  const total = earners.reduce((s, c) => s + c.periodRevenue, 0);

  const stats: TierStat[] = [];
  for (const { id } of TIERS) {
    const members = earners.filter(c => tierOf.get(c.id) === id);
    if (members.length === 0) continue;
    const revenue = members.reduce((s, c) => s + c.periodRevenue, 0);
    stats.push({
      tier: id,
      count: members.length,
      revenue,
      revenueShare: total > 0 ? Math.round((revenue / total) * 1000) / 10 : 0,
      // members відсортовані за спаданням разом з earners
      minRevenue: members[members.length - 1].periodRevenue,
      maxRevenue: members[0].periodRevenue,
      avgRevenue: Math.round(revenue / members.length),
    });
  }

  return {
    // Порядок вхідного списку зберігаємо: він заданий сортуванням таблиці
    clients: clients.map(c => ({ ...c, tier: tierOf.get(c.id) ?? null })),
    stats,
    rankedCount: n,
    zeroRevenueCount: clients.length - n,
    total,
  };
}

// ── Розбиття на частини для сховища ───────────────────────────────────────────

/**
 * Розбити список на частини фіксованого розміру.
 *
 * Потрібно, бо документ Firestore обмежений 1 МіБ, і кількатисячний список
 * клієнтів у нього не влазить — знімок падав би цілком, разом з агрегатами.
 * Порожній вхід дає порожній масив частин, а не одну порожню частину:
 * кількість частин використовується для прибирання застарілих документів,
 * і зайва частина лишала б у сховищі порожній документ.
 */
export function chunkList<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('Розмір частини має бути додатним');
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Розбити список так, щоб кожна частина лишалась у межах байтового бюджету.
 *
 * Фіксована кількість тут не працює: клієнт із 48 місяцями покупок і вісьмома
 * тегами важить у сім разів більше за клієнта з двома місяцями й одним тегом,
 * тож будь-яке «безпечне» число або марнує місце, або вилітає за ліміт.
 *
 * Елемент, що сам по собі більший за бюджет, кладеться в окрему частину:
 * розділити його ми не можемо, і мовчки викидати — гірше, ніж перевищити.
 */
export function chunkBySize<T>(items: T[], maxBytes: number): T[][] {
  if (maxBytes < 1) throw new Error('Бюджет має бути додатним');

  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;

  for (const item of items) {
    const bytes = JSON.stringify(item).length;

    if (current.length > 0 && currentBytes + bytes > maxBytes) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(item);
    currentBytes += bytes;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

// ── Експорт ───────────────────────────────────────────────────────────────────

/**
 * CSV поточної вибірки. Роздільник — крапка з комою: українська локаль Excel
 * очікує саме його, інакше все злипається в одну колонку.
 */
export function clientsToCsv(clients: (EnrichedClient & { tier?: TierId | null })[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    'Клієнт', 'Tier', 'Дохід за період', 'Угод за період', 'Середній чек',
    'Дохід за весь час', 'Угод за весь час',
    'Остання покупка', 'Днів тому', 'Когорта', 'Тип клієнта', 'RFM', 'Теги',
  ];
  const rows = clients.map(c => [
    c.name,
    c.tier ? `Tier ${c.tier}` : '',
    c.periodRevenue,
    c.periodDeals,
    c.avgCheck,
    c.revenue,
    c.agreementsCount,
    c.lastPurchaseDate ? c.lastPurchaseDate.slice(0, 10) : '',
    c.recencyDays ?? '',
    c.cohortMonth ?? '',
    CUSTOMER_KIND_LABELS[c.customerKind],
    c.rfm.label,
    c.tags.join(', '),
  ]);

  return [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n');
}

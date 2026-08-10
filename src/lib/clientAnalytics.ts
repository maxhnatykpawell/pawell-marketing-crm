/**
 * Фільтрація, сортування і статистика по клієнтах — чиста логіка без React.
 *
 * Винесено з LtvAnalyticsModal, щоб її можна було перевірити тестами і щоб
 * модалка лишалась про рендер, а не про математику.
 */

export interface ClientRecord {
  id: string;
  name: string;
  revenue: number;
  agreementsCount: number;
  tags: string[];
  lastPurchaseDate?: string;
  purchaseMonths?: string[];
}

export interface RfmSegment {
  label: string;
  color: string;
  icon: string;
}

/** Клієнт із похідними полями, порахованими один раз */
export interface EnrichedClient extends ClientRecord {
  /** Середній чек: дохід ÷ кількість угод */
  avgCheck: number;
  /** Днів від останньої покупки; null якщо дати немає */
  recencyDays: number | null;
  /** Місяць першої покупки 'YYYY-MM'; null якщо немає дат */
  cohortMonth: string | null;
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

const RFM_STYLES: Record<string, RfmSegment> = {
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

export function enrichClients(
  clients: ClientRecord[],
  now: Date = new Date(),
  thresholds: RfmThresholds = DEFAULT_RFM_THRESHOLDS,
): EnrichedClient[] {
  return clients.map(c => {
    let recencyDays: number | null = null;
    if (c.lastPurchaseDate) {
      const t = new Date(c.lastPurchaseDate).getTime();
      if (!isNaN(t)) recencyDays = Math.floor((now.getTime() - t) / 86_400_000);
    }

    const months = [...(c.purchaseMonths ?? [])].sort();

    return {
      ...c,
      avgCheck: c.agreementsCount > 0 ? Math.round(c.revenue / c.agreementsCount) : 0,
      recencyDays,
      cohortMonth: months.length > 0 ? months[0] : null,
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

    if (include.length && !include.some(t => tags.includes(t))) return false;
    if (exclude.length && exclude.some(t => tags.includes(t))) return false;
    if (f.rfm.length && !f.rfm.includes(c.rfm.label)) return false;
    if (!inRange(c.revenue, f.revenueMin, f.revenueMax)) return false;
    if (!inRange(c.agreementsCount, f.dealsMin, f.dealsMax)) return false;
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
      case 'revenue':  return (a.revenue - b.revenue) * sign;
      case 'deals':    return (a.agreementsCount - b.agreementsCount) * sign;
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
    return { count: 0, total: 0, mean: 0, median: 0, p90: 0, top10Share: 0, buckets: [] };
  }

  const sorted = clients.map(c => c.revenue).sort((a, b) => a - b);
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
    buckets,
  };
}

// ── Експорт ───────────────────────────────────────────────────────────────────

/**
 * CSV поточної вибірки. Роздільник — крапка з комою: українська локаль Excel
 * очікує саме його, інакше все злипається в одну колонку.
 */
export function clientsToCsv(clients: EnrichedClient[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = ['Клієнт', 'Дохід', 'Угод', 'Середній чек', 'Остання покупка', 'Днів тому', 'Когорта', 'RFM', 'Теги'];
  const rows = clients.map(c => [
    c.name,
    c.revenue,
    c.agreementsCount,
    c.avgCheck,
    c.lastPurchaseDate ? c.lastPurchaseDate.slice(0, 10) : '',
    c.recencyDays ?? '',
    c.cohortMonth ?? '',
    c.rfm.label,
    c.tags.join(', '),
  ]);

  return [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n');
}

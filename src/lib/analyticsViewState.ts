/**
 * Збереження вибору в розширеній аналітиці між сеансами.
 *
 * Фільтри, період і сортування — це налаштування робочого місця, а не разова дія:
 * закрив модалку, відкрив назад — має лишитись те саме, інакше кожен захід
 * починається зі складання фільтрів наново.
 */

import { ClientFilters, EMPTY_FILTERS, SortKey, SortDir, TierId } from './clientAnalytics';

const STORAGE_KEY = 'pawell_ltv_analytics_view';

export interface AnalyticsView {
  filters: ClientFilters;
  /** Період з місячною точністю; null = за весь час */
  period: { key: string; from: string | null; to: string | null };
  sortKey: SortKey;
  sortDir: SortDir;
  limit: number;
  tab: 'clients' | 'funnel' | 'cohorts';
  /** Показувати лише цей тір; null = усі */
  tierFocus: TierId | null;
}

export const DEFAULT_VIEW: AnalyticsView = {
  filters: EMPTY_FILTERS,
  period: { key: 'all', from: null, to: null },
  sortKey: 'revenue',
  sortDir: 'desc',
  limit: 100,
  tab: 'clients',
  tierFocus: null,
};

const SORT_KEYS: SortKey[] = ['revenue', 'deals', 'avgCheck', 'recency', 'name', 'cohort'];
const TABS: AnalyticsView['tab'][] = ['clients', 'funnel', 'cohorts'];
const TIER_IDS: TierId[] = [1, 2, 3, 4];

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && !isNaN(v) ? v : null;

/**
 * Зібрати збережений стан, ігноруючи все, чого не впізнали.
 *
 * Читаємо чуже минуле: формат міг змінитись між версіями, а localStorage може
 * містити будь-що. Тому не довіряємо жодному полю — кожне або проходить
 * перевірку, або замінюється значенням за замовчуванням.
 */
export function parseView(raw: unknown): AnalyticsView {
  if (!raw || typeof raw !== 'object') return DEFAULT_VIEW;
  const v = raw as Record<string, any>;
  const f = (v.filters ?? {}) as Record<string, any>;
  const p = (v.period ?? {}) as Record<string, any>;

  return {
    filters: {
      ...EMPTY_FILTERS,
      tagsInclude: strArray(f.tagsInclude),
      tagsExclude: strArray(f.tagsExclude),
      rfm: strArray(f.rfm),
      recency: strArray(f.recency) as ClientFilters['recency'],
      revenueMin: numOrNull(f.revenueMin),
      revenueMax: numOrNull(f.revenueMax),
      dealsMin: numOrNull(f.dealsMin),
      dealsMax: numOrNull(f.dealsMax),
      avgCheckMin: numOrNull(f.avgCheckMin),
      avgCheckMax: numOrNull(f.avgCheckMax),
      cohortMonth: typeof f.cohortMonth === 'string' ? f.cohortMonth : null,
      search: typeof f.search === 'string' ? f.search : '',
    },
    period: {
      key: typeof p.key === 'string' ? p.key : 'all',
      from: typeof p.from === 'string' ? p.from : null,
      to: typeof p.to === 'string' ? p.to : null,
    },
    sortKey: SORT_KEYS.includes(v.sortKey) ? v.sortKey : DEFAULT_VIEW.sortKey,
    sortDir: v.sortDir === 'asc' ? 'asc' : 'desc',
    limit: typeof v.limit === 'number' && v.limit > 0 ? v.limit : DEFAULT_VIEW.limit,
    tab: TABS.includes(v.tab) ? v.tab : DEFAULT_VIEW.tab,
    tierFocus: TIER_IDS.includes(v.tierFocus) ? v.tierFocus : null,
  };
}

export function loadView(): AnalyticsView {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseView(JSON.parse(raw)) : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveView(view: AnalyticsView): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    // Приватний режим або переповнене сховище — не привід ламати аналітику
  }
}

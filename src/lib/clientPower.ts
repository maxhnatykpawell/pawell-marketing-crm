/**
 * Тірування клієнтів Pawell Power: 5 питань по 1–3 бали, сума визначає тір.
 *
 * Методика з документа «Тірування клієнтів Pawell Power». Окремо від старих
 * «Тірів клієнтів» (clientAnalytics.TIERS), які ділять клієнтів за ДОХОДОМ у
 * гривнях, — тут тір складається з п'яти ознак, і дохід лише одна з них.
 *
 * ── Звідки беруться бали ─────────────────────────────────────────────────────
 *  • Оборот за весь час     — рахується сам: місце клієнта серед усіх клієнтів.
 *  • Як часто купує         — рахується сам із помісячної історії покупок.
 *  • Потенціал на рік       — вводиться вручну (у CRM його немає).
 *  • Контракт               — вводиться вручну.
 *  • Глибина акаунта        — вводиться вручну (кількість контактів).
 *
 * Поки ручні ознаки не заповнені, тір усе одно показується, але як ПОПЕРЕДНІЙ:
 * відсутні ознаки рахуються мінімумом (1 бал). Тобто попередній тір — це
 * «щонайменше стільки», і заповнення ознак його лише підвищує.
 *
 * ── Межі ─────────────────────────────────────────────────────────────────────
 * Документ обіцяє «4 питання, 4–12 балів», а в таблиці їх п'ять. Прийнято п'ять,
 * тож сума 5–15, а межі перераховано (див. TIER1_MIN / TIER2_MIN нижче).
 *
 * Чиста логіка без React і мережі: clientPower.test.ts.
 */

import type { ClientRecord } from './clientAnalytics';

export type PowerCriterion = 'revenue' | 'potential' | 'frequency' | 'contract' | 'depth';
export type PowerScore = 1 | 2 | 3;
export type PowerTier = 1 | 2 | 3;

export const POWER_CRITERIA: PowerCriterion[] = ['revenue', 'potential', 'frequency', 'contract', 'depth'];

export const POWER_CRITERION_LABELS: Record<PowerCriterion, string> = {
  revenue: 'Оборот за весь час',
  potential: 'Потенціал на рік',
  frequency: 'Як часто купує',
  contract: 'Контракт',
  depth: 'Глибина акаунта',
};

/** Які ознаки вводяться вручну */
export const MANUAL_CRITERIA: PowerCriterion[] = ['potential', 'contract', 'depth'];

/** Сума балів (5–15): від якої межі починається тір */
export const TIER1_MIN = 12;
export const TIER2_MIN = 9;
export const MAX_SCORE = 15;
export const MIN_SCORE = 5;

/** Частки клієнтів за оборотом: топ-10 % — 3 бали, до 40 % — 2, решта — 1 */
export const REVENUE_TOP_SHARE = 0.10;
export const REVENUE_MID_SHARE = 0.40;

/** Частки нашої річної виручки для потенціалу: <1 % — 1, 1–5 % — 2, >5 % — 3 */
export const POTENTIAL_LOW_PCT = 1;
export const POTENTIAL_HIGH_PCT = 5;

/** «Щомісяця» = купував щонайменше у стількох частках місяців свого вікна (до 12 місяців) */
export const MONTHLY_SHARE = 0.8;
/** і вікно має бути не коротшим, інакше «щомісяця» за два місяці — випадковість */
export const MONTHLY_MIN_SPAN = 4;

export type ContractSize = 'none' | 'small' | 'medium' | 'large';
export const CONTRACT_SIZES: ContractSize[] = ['none', 'small', 'medium', 'large'];
export const CONTRACT_LABELS: Record<ContractSize, string> = {
  none: 'Немає контракту',
  small: 'Малий (~2 млн)',
  medium: 'Середній (~10 млн)',
  large: 'Великий (~100 млн)',
};

/** Що вводиться вручну для клієнта */
export interface ClientPowerInput {
  /** Скільки клієнт може купувати на рік, ₴ */
  potentialUah?: number | null;
  contractSize?: ContractSize | null;
  /** Контакти, з якими в нас добрі стосунки (знають нас, відповідають, спілкувались за 3 місяці) */
  contacts?: number | null;
  /** Повний акаунт: 5+ контактів щонайменше з 3 ланок (керівництво, технічна, закупівлі/експлуатація) */
  fullAccount?: boolean;
  /** Купує за рамковим договором — це «щомісяця» незалежно від історії покупок */
  framework?: boolean;
}

export interface PowerResult {
  scores: Record<PowerCriterion, PowerScore | null>;
  /** Ознаки, яких не оцінено (їх бал у сумі — мінімум) */
  missing: PowerCriterion[];
  /** Сума балів; відсутні ознаки враховано як 1 */
  score: number;
  /** Усі п'ять ознак оцінено — тір остаточний */
  complete: boolean;
  /** null — клієнт без обороту: ранжувати нема за чим */
  tier: PowerTier | null;
  fullAccount: boolean;
  /** Чому саме такий бал — для підказки в інтерфейсі */
  notes: Partial<Record<PowerCriterion, string>>;
}

// ── Контекст: що залежить від усіх клієнтів одразу ────────────────────────────

export interface PowerContext {
  /** id → частка клієнтів, що мають оборот не менший (0..1); менше — вищий клієнт */
  revenueShare: Map<string, number>;
  rankedCount: number;
  /** Наша виручка за останні 12 місяців; null — помісячних даних немає */
  annualRevenue: number | null;
  /** Поточний місяць 'YYYY-MM' (кінець 12-місячного вікна) */
  currentMonth: string;
}

export const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export const monthsBetween = (from: string, to: string): number => {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
};

/**
 * Рахується по ВСІХ клієнтах, а не по відфільтрованих: «топ-10 % за оборотом» —
 * це місце в усій базі, і воно не повинно змінюватись від того, який фільтр
 * зараз відкритий.
 *
 * Однакові обороти мають однакове місце (змагальна нумерація), тож двоє клієнтів
 * з рівною сумою не опиняться по різні боки межі лише через порядок у списку.
 */
export function buildPowerContext(clients: ClientRecord[], now: Date = new Date()): PowerContext {
  const currentMonth = monthKey(now);

  const ranked = clients.filter(c => c.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  const revenueShare = new Map<string, number>();
  let rank = 0;
  let prev: number | null = null;
  ranked.forEach((c, i) => {
    if (prev === null || c.revenue !== prev) rank = i + 1;
    prev = c.revenue;
    revenueShare.set(c.id, rank / ranked.length);
  });

  const hasMonthly = clients.some(c => c.monthlyStats);
  let annualRevenue: number | null = null;
  if (hasMonthly) {
    const from = addMonths(currentMonth, -11);
    annualRevenue = 0;
    for (const c of clients) {
      for (const [m, s] of Object.entries(c.monthlyStats ?? {})) {
        if (m >= from && m <= currentMonth) annualRevenue += s.revenue || 0;
      }
    }
  }

  return { revenueShare, rankedCount: ranked.length, annualRevenue, currentMonth };
}

// ── Окремі ознаки ─────────────────────────────────────────────────────────────

function scoreRevenue(c: ClientRecord, ctx: PowerContext): { s: PowerScore | null; note: string } {
  const share = ctx.revenueShare.get(c.id);
  if (share === undefined) return { s: null, note: 'Немає обороту' };
  const pct = Math.round(share * 100);
  const where = `в топ-${Math.max(pct, 1)}% за оборотом`;
  if (share <= REVENUE_TOP_SHARE) return { s: 3, note: `Клієнт ${where}` };
  if (share <= REVENUE_MID_SHARE) return { s: 2, note: `Клієнт ${where}` };
  return { s: 1, note: `Клієнт ${where}: нижче за топ-40%` };
}

function scoreFrequency(
  c: ClientRecord, ctx: PowerContext, input: ClientPowerInput,
): { s: PowerScore; note: string } {
  if (input.framework) return { s: 3, note: 'Рамковий договір' };

  // Місяці з покупками: нові формати знімків дають суми, старі — лише перелік місяців
  const stats = c.monthlyStats;
  const months = stats
    ? Object.entries(stats).filter(([, s]) => (s.deals ?? 0) > 0 || (s.revenue ?? 0) > 0)
    : (c.purchaseMonths ?? []).map(m => [m, { deals: 1, revenue: 0 }] as [string, { deals: number; revenue: number }]);

  if (months.length === 0) {
    // Дат немає зовсім — лишається лише кількість угод
    return c.agreementsCount >= 2
      ? { s: 2, note: `${c.agreementsCount} угод (дат покупок немає)` }
      : { s: 1, note: 'Одна покупка' };
  }

  const sorted = months.map(([m]) => m).sort();
  const first = sorted[0];
  const windowStart = first > addMonths(ctx.currentMonth, -11) ? first : addMonths(ctx.currentMonth, -11);
  const span = monthsBetween(windowStart, ctx.currentMonth) + 1;
  const inWindow = months.filter(([m]) => m >= windowStart && m <= ctx.currentMonth);
  const purchasedMonths = new Set(inWindow.map(([m]) => m)).size;
  const deals = inWindow.reduce((n, [, s]) => n + (s.deals || 1), 0);

  if (span >= MONTHLY_MIN_SPAN && purchasedMonths / span >= MONTHLY_SHARE) {
    return { s: 3, note: `Купує щомісяця: ${purchasedMonths} з ${span} міс.` };
  }
  if (deals >= 2) return { s: 2, note: `Кілька разів: ${deals} покупок за ${span} міс.` };
  return { s: 1, note: 'Купує разово' };
}

function scorePotential(input: ClientPowerInput, ctx: PowerContext): { s: PowerScore | null; note: string } {
  const p = input.potentialUah;
  if (p === null || p === undefined || !(p >= 0)) return { s: null, note: 'Не оцінено' };
  if (!ctx.annualRevenue || ctx.annualRevenue <= 0) return { s: null, note: 'Невідома річна виручка — нема з чим порівняти' };
  const pct = (p / ctx.annualRevenue) * 100;
  const label = `${pct.toLocaleString('uk-UA', { maximumFractionDigits: 1 })}% нашої виручки за 12 міс.`;
  if (pct > POTENTIAL_HIGH_PCT) return { s: 3, note: `Потенціал ${label}` };
  if (pct >= POTENTIAL_LOW_PCT) return { s: 2, note: `Потенціал ${label}` };
  return { s: 1, note: `Потенціал ${label}` };
}

function scoreContract(input: ClientPowerInput): { s: PowerScore | null; note: string } {
  switch (input.contractSize) {
    case 'large': return { s: 3, note: CONTRACT_LABELS.large };
    case 'medium': return { s: 2, note: CONTRACT_LABELS.medium };
    case 'small': return { s: 1, note: CONTRACT_LABELS.small };
    case 'none': return { s: 1, note: CONTRACT_LABELS.none };
    default: return { s: null, note: 'Не оцінено' };
  }
}

function scoreDepth(input: ClientPowerInput): { s: PowerScore | null; note: string } {
  const n = input.contacts;
  if (n === null || n === undefined || !(n >= 0)) return { s: null, note: 'Не оцінено' };
  if (n >= 5) return { s: 3, note: `${n} контактів` };
  if (n >= 2) return { s: 2, note: `${n} контакти` };
  return { s: 1, note: n === 1 ? '1 контакт' : 'Немає добрих контактів' };
}

// ── Підсумок ──────────────────────────────────────────────────────────────────

export function tierOfScore(score: number, fullAccount: boolean): PowerTier {
  // Tier 1 — не лише сума, а й обов'язково повний акаунт; без нього найвищий — Tier 2
  if (score >= TIER1_MIN && fullAccount) return 1;
  if (score >= TIER2_MIN) return 2;
  return 3;
}

export function computePower(
  client: ClientRecord, input: ClientPowerInput | undefined, ctx: PowerContext,
): PowerResult {
  const inp = input ?? {};
  const rev = scoreRevenue(client, ctx);
  const freq = scoreFrequency(client, ctx, inp);
  const pot = scorePotential(inp, ctx);
  const con = scoreContract(inp);
  const dep = scoreDepth(inp);

  const scores: Record<PowerCriterion, PowerScore | null> = {
    revenue: rev.s, potential: pot.s, frequency: freq.s, contract: con.s, depth: dep.s,
  };
  const notes: PowerResult['notes'] = {
    revenue: rev.note, potential: pot.note, frequency: freq.note, contract: con.note, depth: dep.note,
  };
  const missing = POWER_CRITERIA.filter(k => scores[k] === null);
  const score = POWER_CRITERIA.reduce((sum, k) => sum + (scores[k] ?? 1), 0);
  const fullAccount = !!inp.fullAccount;

  return {
    scores, missing, score,
    complete: missing.length === 0,
    // Клієнт без обороту не ранжуємо: його «1 бал» за оборот — не оцінка, а відсутність даних
    tier: rev.s === null ? null : tierOfScore(score, fullAccount),
    fullAccount,
    notes,
  };
}

/** Результат для всіх клієнтів одразу — один прохід, а не на кожен рядок */
export function computeAllPower(
  clients: ClientRecord[], inputs: Record<string, ClientPowerInput>, now: Date = new Date(),
): Map<string, PowerResult> {
  const ctx = buildPowerContext(clients, now);
  const out = new Map<string, PowerResult>();
  for (const c of clients) out.set(c.id, computePower(c, inputs[c.id], ctx));
  return out;
}

// ── Підписи ───────────────────────────────────────────────────────────────────

export interface PowerTierMeta {
  id: PowerTier;
  label: string;
  /** Хто веде і як часто на зв'язку — з документа */
  owner: string;
  cadence: string;
  gets: string;
  range: string;
  badge: string;
  bar: string;
}

export const POWER_TIERS: PowerTierMeta[] = [
  {
    id: 1, label: 'Tier 1 — Стратегічні', range: `${TIER1_MIN}–${MAX_SCORE} б. + повний акаунт`,
    owner: 'Персональний менеджер + CGO/CEO', cadence: 'щотижня',
    gets: 'Пріоритет у виробництві, кастомні конфігурації',
    badge: 'bg-amber-100 text-amber-800 border-amber-200', bar: 'bg-amber-500',
  },
  {
    id: 2, label: 'Tier 2 — Ключові', range: `${TIER2_MIN}–${TIER1_MIN - 1} б.`,
    owner: 'Персональний менеджер', cadence: 'раз на 2 тижні',
    gets: 'Швидкі КП, консультація R&D, задача — поглибити акаунт',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', bar: 'bg-emerald-500',
  },
  {
    id: 3, label: 'Tier 3 — Базові', range: `${MIN_SCORE}–${TIER2_MIN - 1} б.`,
    owner: 'Відділ продажів загалом', cadence: 'раз на місяць–квартал',
    gets: 'Каталог і стандартні умови',
    badge: 'bg-blue-100 text-blue-800 border-blue-200', bar: 'bg-blue-500',
  },
];

export const POWER_TIER_BY_ID: Record<PowerTier, PowerTierMeta> =
  Object.fromEntries(POWER_TIERS.map(t => [t.id, t])) as Record<PowerTier, PowerTierMeta>;

// ── Валідація ручного вводу ───────────────────────────────────────────────────

export const MAX_POTENTIAL_UAH = 1e12;
export const MAX_CONTACTS = 500;

/**
 * Привести довільний ввід до ClientPowerInput. Використовується і сервером (довіряти
 * тілу запиту не можна), і клієнтом (збережене в базі міг писати хтось інший).
 * Усе, чого не впізнали, відкидається — а не перетворюється на нуль.
 */
export function sanitizePowerInput(raw: unknown): ClientPowerInput {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: ClientPowerInput = {};

  if (typeof r.potentialUah === 'number' && isFinite(r.potentialUah) && r.potentialUah >= 0 && r.potentialUah <= MAX_POTENTIAL_UAH) {
    out.potentialUah = Math.round(r.potentialUah);
  }
  if (typeof r.contractSize === 'string' && (CONTRACT_SIZES as string[]).includes(r.contractSize)) {
    out.contractSize = r.contractSize as ContractSize;
  }
  if (typeof r.contacts === 'number' && Number.isInteger(r.contacts) && r.contacts >= 0 && r.contacts <= MAX_CONTACTS) {
    out.contacts = r.contacts;
  }
  if (r.framework === true) out.framework = true;
  // Повний акаунт — це 5+ контактів; без них ознака нічого не означає
  if (r.fullAccount === true && (out.contacts ?? 0) >= 5) out.fullAccount = true;
  return out;
}

/** Порожній ввід — запис можна не зберігати */
export const isEmptyPowerInput = (i: ClientPowerInput): boolean => Object.keys(i).length === 0;

// ── Зведення для інтерфейсу ──────────────────────────────────────────────────

/** Додати результат до клієнтів; ті, кого немає в мапі, лишаються без нього */
export function attachPower<T extends { id: string }>(
  clients: T[], power: Map<string, PowerResult>,
): (T & { power?: PowerResult })[] {
  return clients.map(c => ({ ...c, power: power.get(c.id) }));
}

export interface PowerSummaryRow {
  tier: PowerTier;
  count: number;
  /** Дохід цих клієнтів за вибраний період */
  revenue: number;
  /** Частка від доходу всіх клієнтів із тіром (0..1) */
  share: number;
  /** Скільки з них мають неповну оцінку (тір попередній) */
  incomplete: number;
}

export interface PowerSummary {
  rows: PowerSummaryRow[];
  /** Клієнти без тіру (без обороту) */
  unranked: number;
  /** Клієнти з неповною оцінкою — їм бракує ручних ознак */
  incompleteTotal: number;
  total: number;
}

export function summarizePower(
  clients: { periodRevenue: number; power?: PowerResult }[],
): PowerSummary {
  const rows: PowerSummaryRow[] = POWER_TIERS.map(t => ({ tier: t.id, count: 0, revenue: 0, share: 0, incomplete: 0 }));
  let unranked = 0;
  let incompleteTotal = 0;

  for (const c of clients) {
    const p = c.power;
    if (!p || p.tier === null) { unranked++; continue; }
    const row = rows[p.tier - 1];
    row.count++;
    row.revenue += c.periodRevenue;
    if (!p.complete) { row.incomplete++; incompleteTotal++; }
  }
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  for (const r of rows) r.share = totalRevenue > 0 ? r.revenue / totalRevenue : 0;

  return { rows, unranked, incompleteTotal, total: clients.length };
}

/** Чи потрапляє клієнт під фокус тірування */
export function matchesPowerFocus(p: PowerResult | undefined, focus: PowerTier | 'incomplete' | null): boolean {
  if (focus === null) return true;
  if (!p || p.tier === null) return false;
  return focus === 'incomplete' ? !p.complete : p.tier === focus;
}

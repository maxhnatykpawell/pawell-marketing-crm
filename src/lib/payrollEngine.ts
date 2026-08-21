/**
 * Модульний рушій зарплатних документів.
 *
 * Шаблон посади = набір секцій і модулів. Кожен модуль — це один рядок у
 * документі: або число, яке вводить керівник, або обчислення поверх інших
 * модулів. Формула зарплати більше не зашита в код: її описує шаблон, тому
 * нову посаду з іншими КПІ можна додати без правок у компонентах.
 *
 * Файл навмисно не імпортує нічого з React — рушій має лишатися чистим,
 * щоб на ньому працювали і форма, і список документів, і тести.
 */

// ── Типи ────────────────────────────────────────────────────────────────────

export type PayrollModuleKind =
  /** Число, яке вводять у документі (дні, ліди, сума) */
  | 'input'
  /** Стала з шаблону — однакова в кожному документі */
  | 'constant'
  /** Ставка × кількість: 150 ₴ за 1 лід */
  | 'rate'
  /** Відсоток від бази: 19% від «Сума» */
  | 'percent'
  /** Тарифна сітка: виконав план ≥100% → 5000 ₴ */
  | 'tiers'
  /** Вільний вираз над іншими модулями */
  | 'formula';

/**
 * Роль визначає, куди потрапляє сума модуля.
 * `info` — модуль рахується і доступний у формулах, але не рухає підсумок
 * (робочі дні, оклад за годину, відсоток виконання плану).
 */
export type PayrollModuleRole = 'income' | 'deduction' | 'info';

/** Поріг тарифної сітки: від якого значення діє яка сума */
export interface PayrollTier {
  from: number;
  amount: number;
}

export interface PayrollModule {
  id: string;
  /** Ідентифікатор для формул: латиниця, цифри, підкреслення */
  key: string;
  label: string;
  kind: PayrollModuleKind;
  role: PayrollModuleRole;
  sectionId: string;
  order: number;
  /** Одиниця для підказки: «лід», «день», «год» */
  unit?: string;
  hint?: string;

  /** input: початкове значення в новому документі */
  defaultValue?: number;

  /** constant: сума */
  value?: number;

  /** rate: скільки платити за одну одиницю */
  rate?: number;

  /**
   * rate: взяти ставку з іншого модуля замість числа `rate`.
   * Так «відпрацьовані дні × оклад за день» лишається одним рядком, а оклад
   * за день перераховується сам, коли змінюється ставка чи робочі дні.
   */
  rateSource?: string;

  /**
   * rate / tiers: звідки брати кількість.
   * Порожньо — модуль має власне поле вводу в документі.
   */
  source?: string;

  /** percent: ключ модуля-бази або псевдозмінна INCOME / DEDUCTIONS */
  base?: string;
  /** percent: сам відсоток, якщо він фіксований у шаблоні */
  percent?: number;
  /** percent: true — відсоток із шаблону, false — вводять у документі */
  fixedPercent?: boolean;

  /** tiers: пороги, порядок не важливий — рушій сортує сам */
  tiers?: PayrollTier[];

  /** formula: вираз, напр. `(leadsBonus + planBonus) * 0.15` */
  formula?: string;
}

export type PayrollSectionTone = 'neutral' | 'income' | 'deduction';

export interface PayrollSection {
  id: string;
  title: string;
  order: number;
  tone?: PayrollSectionTone;
}

export interface PayrollTemplate {
  id: string;
  /** Назва посади: «Таргетолог», «SMM», «Керівник відділу» */
  name: string;
  description?: string;
  sections: PayrollSection[];
  modules: PayrollModule[];
  archived?: boolean;
  updatedAt?: string;
}

/** Прив'язка людини до шаблону з індивідуальними правками поверх нього */
export interface PayrollAssignment {
  templateId: string;
  /** Модулі, які є тільки в цієї людини */
  extraModules?: PayrollModule[];
  /** Модулі шаблону, вимкнені для цієї людини */
  disabledModuleIds?: string[];
  /** Точкові заміни полів модуля шаблону (інша ставка, інший поріг) */
  overrides?: Record<string, Partial<PayrollModule>>;
}

export interface PayrollIssue {
  key: string;
  message: string;
}

export interface PayrollEvaluation {
  /** Ключ модуля → сума, яку він дає */
  amounts: Record<string, number>;
  /** Ключ модуля → число, що керує обчисленням (введена кількість, відсоток) */
  raw: Record<string, number>;
  income: number;
  deductions: number;
  balance: number;
  issues: PayrollIssue[];
}

/** Псевдозмінні, доступні у формулах нарівні з ключами модулів */
export const INCOME_VAR = 'INCOME';
export const DEDUCTIONS_VAR = 'DEDUCTIONS';
export const BALANCE_VAR = 'BALANCE';
export const PSEUDO_VARS = [INCOME_VAR, DEDUCTIONS_VAR, BALANCE_VAR];

// ── Формульна мова ──────────────────────────────────────────────────────────

type Token =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string };

type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'un'; op: string; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'cond'; c: Node; a: Node; b: Node }
  | { t: 'call'; name: string; args: Node[] };

// Довші оператори стоять першими: інакше «>=» розпадеться на «>» і «=»
const OPERATORS = ['>=', '<=', '==', '!=', '&&', '||', '>', '<', '+', '-', '*', '/', '(', ')', ',', '?', ':', '!'];

const ID_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/;
const NUM_RE = /^\d+(?:\.\d+)?/;

class FormulaError extends Error {}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let rest = src;
  while (rest.length > 0) {
    const ws = rest.match(/^\s+/);
    if (ws) {
      rest = rest.slice(ws[0].length);
      continue;
    }
    const numMatch = rest.match(NUM_RE);
    if (numMatch) {
      out.push({ t: 'num', v: Number(numMatch[0]) });
      rest = rest.slice(numMatch[0].length);
      continue;
    }
    const idMatch = rest.match(ID_RE);
    if (idMatch) {
      out.push({ t: 'id', v: idMatch[0] });
      rest = rest.slice(idMatch[0].length);
      continue;
    }
    const op = OPERATORS.find((o) => rest.startsWith(o));
    if (op) {
      out.push({ t: 'op', v: op });
      rest = rest.slice(op.length);
      continue;
    }
    throw new FormulaError(`незрозумілий символ «${rest[0]}»`);
  }
  return out;
}

const FUNCTIONS: Record<string, { arity: number | 'any'; fn: (args: number[]) => number }> = {
  min: { arity: 'any', fn: (a) => (a.length ? Math.min(...a) : 0) },
  max: { arity: 'any', fn: (a) => (a.length ? Math.max(...a) : 0) },
  round: { arity: 1, fn: (a) => Math.round(a[0]) },
  floor: { arity: 1, fn: (a) => Math.floor(a[0]) },
  ceil: { arity: 1, fn: (a) => Math.ceil(a[0]) },
  abs: { arity: 1, fn: (a) => Math.abs(a[0]) },
  if: { arity: 3, fn: (a) => (a[0] ? a[1] : a[2]) },
  clamp: { arity: 3, fn: (a) => Math.min(Math.max(a[0], a[1]), a[2]) },
  pow: { arity: 2, fn: (a) => Math.pow(a[0], a[1]) },
  sqrt: { arity: 1, fn: (a) => (a[0] < 0 ? 0 : Math.sqrt(a[0])) },
};

/** Список функцій для підказки в редакторі */
export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS);

/**
 * Рекурсивний спуск. Пріоритети згори вниз:
 * `?:` → `||` → `&&` → порівняння → `+ -` → `* /` → унарні → первинні.
 */
function parseTokens(tokens: Token[]): Node {
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const isOp = (v: string): boolean => {
    const tk = tokens[pos];
    return !!tk && tk.t === 'op' && tk.v === v;
  };
  const eat = (v: string): boolean => {
    if (isOp(v)) {
      pos++;
      return true;
    }
    return false;
  };
  const expect = (v: string) => {
    if (!eat(v)) throw new FormulaError(`очікувався «${v}»`);
  };

  const parseExpr = (): Node => parseTernary();

  const parseTernary = (): Node => {
    const c = parseOr();
    if (eat('?')) {
      const a = parseExpr();
      expect(':');
      const b = parseExpr();
      return { t: 'cond', c, a, b };
    }
    return c;
  };

  const parseBinary = (ops: string[], next: () => Node): Node => {
    let left = next();
    for (;;) {
      const op = ops.find((o) => isOp(o));
      if (!op) return left;
      pos++;
      left = { t: 'bin', op, a: left, b: next() };
    }
  };

  const parseOr = (): Node => parseBinary(['||'], parseAnd);
  const parseAnd = (): Node => parseBinary(['&&'], parseCompare);
  const parseCompare = (): Node => parseBinary(['>=', '<=', '==', '!=', '>', '<'], parseSum);
  const parseSum = (): Node => parseBinary(['+', '-'], parseProduct);
  const parseProduct = (): Node => parseBinary(['*', '/'], parseUnary);

  const parseUnary = (): Node => {
    if (eat('-')) return { t: 'un', op: '-', a: parseUnary() };
    if (eat('+')) return parseUnary();
    if (eat('!')) return { t: 'un', op: '!', a: parseUnary() };
    return parsePrimary();
  };

  const parsePrimary = (): Node => {
    const tk = peek();
    if (!tk) throw new FormulaError('вираз обірвався');
    if (tk.t === 'num') {
      pos++;
      return { t: 'num', v: tk.v };
    }
    if (tk.t === 'id') {
      pos++;
      if (isOp('(')) {
        const name = tk.v.toLowerCase();
        const spec = FUNCTIONS[name];
        if (!spec) throw new FormulaError(`невідома функція «${tk.v}»`);
        pos++;
        const args: Node[] = [];
        if (!eat(')')) {
          do {
            args.push(parseExpr());
          } while (eat(','));
          expect(')');
        }
        if (spec.arity !== 'any' && args.length !== spec.arity) {
          throw new FormulaError(`«${tk.v}» очікує ${spec.arity} арг., а не ${args.length}`);
        }
        return { t: 'call', name, args };
      }
      return { t: 'var', name: tk.v };
    }
    if (eat('(')) {
      const inner = parseExpr();
      expect(')');
      return inner;
    }
    throw new FormulaError(`несподіване «${tk.v}»`);
  };

  const node = parseExpr();
  if (pos < tokens.length) {
    const tk = tokens[pos];
    throw new FormulaError(`зайве «${String(tk.v)}» у кінці виразу`);
  }
  return node;
}

const parseCache = new Map<string, Node | string>();

/** Розбирає вираз. Повертає `{ node }` або `{ error }` — без винятків назовні. */
export function parseFormula(src: string): { node?: Node; error?: string } {
  const cached = parseCache.get(src);
  if (cached !== undefined) {
    return typeof cached === 'string' ? { error: cached } : { node: cached };
  }
  try {
    const node = parseTokens(tokenize(src));
    parseCache.set(src, node);
    return { node };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    parseCache.set(src, message);
    return { error: message };
  }
}

function collectVars(node: Node, out: Set<string>): void {
  switch (node.t) {
    case 'var':
      out.add(node.name);
      break;
    case 'un':
      collectVars(node.a, out);
      break;
    case 'bin':
      collectVars(node.a, out);
      collectVars(node.b, out);
      break;
    case 'cond':
      collectVars(node.c, out);
      collectVars(node.a, out);
      collectVars(node.b, out);
      break;
    case 'call':
      node.args.forEach((a) => collectVars(a, out));
      break;
    default:
      break;
  }
}

/** Змінні, які згадує вираз (з суфіксом `.n`, якщо він був) */
export function formulaVars(src: string): string[] {
  const { node } = parseFormula(src);
  if (!node) return [];
  const out = new Set<string>();
  collectVars(node, out);
  return [...out];
}

function evalNode(node: Node, scope: (name: string) => number): number {
  switch (node.t) {
    case 'num':
      return node.v;
    case 'var':
      return scope(node.name);
    case 'un': {
      const a = evalNode(node.a, scope);
      return node.op === '-' ? -a : a ? 0 : 1;
    }
    case 'cond':
      return evalNode(node.c, scope) ? evalNode(node.a, scope) : evalNode(node.b, scope);
    case 'call':
      return FUNCTIONS[node.name].fn(node.args.map((a) => evalNode(a, scope)));
    case 'bin': {
      const a = evalNode(node.a, scope);
      // Ліниві && і ||: щоб `days > 0 && base / days > 100` не чіпало другу гілку
      if (node.op === '&&') return a && evalNode(node.b, scope) ? 1 : 0;
      if (node.op === '||') return a || evalNode(node.b, scope) ? 1 : 0;
      const b = evalNode(node.b, scope);
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        // Ділення на нуль у зарплаті — це порожня клітинка, а не Infinity
        case '/': return b === 0 ? 0 : a / b;
        case '>': return a > b ? 1 : 0;
        case '<': return a < b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '==': return a === b ? 1 : 0;
        case '!=': return a !== b ? 1 : 0;
        default: return 0;
      }
    }
    default:
      return 0;
  }
}

// ── Модулі ──────────────────────────────────────────────────────────────────

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Чи має модуль власне поле вводу в документі */
export function hasOwnInput(m: PayrollModule): boolean {
  switch (m.kind) {
    case 'input':
      return true;
    case 'rate':
    case 'tiers':
      return !m.source;
    case 'percent':
      return !m.fixedPercent;
    default:
      return false;
  }
}

/** Тарифна сітка: найвищий поріг, який не перевищує значення */
export function tierAmount(tiers: PayrollTier[] | undefined, value: number): number {
  if (!tiers || tiers.length === 0) return 0;
  const sorted = [...tiers].sort((a, b) => num(b.from) - num(a.from));
  const hit = sorted.find((t) => value >= num(t.from));
  return hit ? num(hit.amount) : 0;
}

/** Ключі, від яких залежить модуль (без суфікса `.n`) */
export function moduleDeps(m: PayrollModule): string[] {
  const deps = new Set<string>();
  const add = (rawRef?: string) => {
    if (!rawRef) return;
    const key = rawRef.split('.')[0];
    if (key) deps.add(key);
  };
  if (m.kind === 'formula') formulaVars(m.formula || '').forEach(add);
  if (m.kind === 'rate' || m.kind === 'tiers') add(m.source);
  if (m.kind === 'rate') add(m.rateSource);
  if (m.kind === 'percent') add(m.base);
  deps.delete(m.key);
  return [...deps];
}

/**
 * Складає ефективний набір модулів для людини: шаблон + індивідуальні правки.
 * Вимкнені прибираються, `overrides` накладаються поверх, `extraModules` — у кінець.
 */
export function resolveModules(
  template: PayrollTemplate | null | undefined,
  assignment?: PayrollAssignment | null
): PayrollModule[] {
  if (!template) return [];
  const disabled = new Set(assignment?.disabledModuleIds || []);
  const overrides = assignment?.overrides || {};
  const base = template.modules
    .filter((m) => !disabled.has(m.id))
    // id і key лишаються від шаблону: інакше правка ставки розірве посилання у формулах
    .map((m) => (overrides[m.id] ? { ...m, ...overrides[m.id], id: m.id, key: m.key } : m));
  return [...base, ...(assignment?.extraModules || [])].sort((a, b) => a.order - b.order);
}

/** Шаблон із застосованими індивідуальними правками — саме його кладемо у знімок */
export function resolveTemplate(
  template: PayrollTemplate | null | undefined,
  assignment?: PayrollAssignment | null
): PayrollTemplate | null {
  if (!template) return null;
  return { ...template, modules: resolveModules(template, assignment) };
}

/**
 * Топологічний порядок обчислення.
 *
 * INCOME / DEDUCTIONS / BALANCE — теж вузли графа, і це не формальність:
 * без них податок «19% від суми» рахувався б у порядку оголошення й міг
 * узяти суму до того, як порахуються бонуси, оголошені нижче.
 *
 * Модулі в циклі повертаються в `cycles`, щоб форма показала їх як помилку,
 * а не зациклилась.
 */
function topoOrder(modules: PayrollModule[]): { order: string[]; cycles: Set<string> } {
  const byKey = new Map(modules.map((m) => [m.key, m]));
  const order: string[] = [];
  const cycles = new Set<string>();
  const state = new Map<string, 'visiting' | 'done'>();

  const depsOf = (key: string): string[] => {
    if (key === INCOME_VAR) return modules.filter((m) => m.role === 'income').map((m) => m.key);
    if (key === DEDUCTIONS_VAR) return modules.filter((m) => m.role === 'deduction').map((m) => m.key);
    if (key === BALANCE_VAR) return [INCOME_VAR, DEDUCTIONS_VAR];
    const m = byKey.get(key);
    return m ? moduleDeps(m) : [];
  };

  const known = (key: string): boolean => byKey.has(key) || PSEUDO_VARS.includes(key);

  const visit = (key: string, stack: string[]): void => {
    const st = state.get(key);
    if (st === 'done') return;
    if (st === 'visiting') {
      // Позначаємо весь цикл, а не лише замикальну ланку
      const from = stack.indexOf(key);
      stack.slice(from === -1 ? 0 : from).forEach((k) => cycles.add(k));
      return;
    }
    if (!known(key)) return;
    state.set(key, 'visiting');
    for (const dep of depsOf(key)) {
      if (known(dep)) visit(dep, [...stack, key]);
    }
    state.set(key, 'done');
    order.push(key);
  };

  modules.forEach((m) => visit(m.key, []));
  PSEUDO_VARS.forEach((v) => visit(v, []));
  return { order, cycles };
}

/**
 * Рахує документ: суми модулів, підсумки й перелік проблем.
 *
 * `values` — числа, введені в документі, за ключем модуля.
 */
export function evaluateModules(
  modules: PayrollModule[],
  values: Record<string, number> | undefined
): PayrollEvaluation {
  const vals = values || {};
  const amounts: Record<string, number> = {};
  const raw: Record<string, number> = {};
  const issues: PayrollIssue[] = [];

  const seen = new Set<string>();
  const usable: PayrollModule[] = [];
  for (const m of modules) {
    if (!m.key) {
      issues.push({ key: m.id, message: `Модуль «${m.label}» без ключа` });
      continue;
    }
    if (seen.has(m.key)) {
      issues.push({ key: m.key, message: `Ключ «${m.key}» повторюється — рахується перший` });
      continue;
    }
    seen.add(m.key);
    usable.push(m);
  }

  const byKey = new Map(usable.map((m) => [m.key, m]));
  const { order, cycles } = topoOrder(usable);
  cycles.forEach((key) => {
    if (PSEUDO_VARS.includes(key)) return; // цикл уже названо через конкретні модулі
    const via = byKey.get(key)?.label || key;
    issues.push({ key, message: `«${via}» посилається сам на себе по колу` });
  });

  const incomeKeys = usable.filter((m) => m.role === 'income').map((m) => m.key);
  const deductionKeys = usable.filter((m) => m.role === 'deduction').map((m) => m.key);
  const sumOf = (keys: string[]) => keys.reduce((s, k) => s + (amounts[k] || 0), 0);

  const scope = (name: string): number => {
    if (name === INCOME_VAR) return sumOf(incomeKeys);
    if (name === DEDUCTIONS_VAR) return sumOf(deductionKeys);
    if (name === BALANCE_VAR) return sumOf(incomeKeys) - sumOf(deductionKeys);
    const [key, suffix] = name.split('.');
    const table = suffix === 'n' ? raw : amounts;
    return table[key] || 0;
  };

  for (const key of order) {
    const m = byKey.get(key);
    if (!m) continue;
    if (cycles.has(key)) {
      raw[key] = 0;
      amounts[key] = 0;
      continue;
    }

    const own = hasOwnInput(m) ? num(vals[key]) : 0;

    switch (m.kind) {
      case 'input': {
        raw[key] = own;
        amounts[key] = own;
        break;
      }
      case 'constant': {
        const v = num(m.value);
        raw[key] = v;
        amounts[key] = v;
        break;
      }
      case 'rate': {
        const qty = m.source ? scope(m.source) : own;
        const perUnit = m.rateSource ? scope(m.rateSource) : num(m.rate);
        raw[key] = qty;
        amounts[key] = qty * perUnit;
        break;
      }
      case 'percent': {
        const pct = m.fixedPercent ? num(m.percent) : own;
        raw[key] = pct;
        if (!m.base) {
          issues.push({ key, message: `«${m.label}» не має бази для відсотка` });
          amounts[key] = 0;
        } else {
          amounts[key] = (scope(m.base) * pct) / 100;
        }
        break;
      }
      case 'tiers': {
        const n = m.source ? scope(m.source) : own;
        raw[key] = n;
        amounts[key] = tierAmount(m.tiers, n);
        break;
      }
      case 'formula': {
        const src = (m.formula || '').trim();
        if (!src) {
          raw[key] = 0;
          amounts[key] = 0;
          break;
        }
        const { node, error } = parseFormula(src);
        if (!node) {
          issues.push({ key, message: `«${m.label}»: ${error}` });
          raw[key] = 0;
          amounts[key] = 0;
          break;
        }
        const unknown = formulaVars(src).filter((v) => {
          const head = v.split('.')[0];
          return !byKey.has(head) && !PSEUDO_VARS.includes(head);
        });
        if (unknown.length) {
          issues.push({
            key,
            message: `«${m.label}»: немає модуля ${unknown.map((u) => `«${u}»`).join(', ')}`,
          });
        }
        const v = evalNode(node, scope);
        raw[key] = Number.isFinite(v) ? v : 0;
        amounts[key] = raw[key];
        break;
      }
      default: {
        raw[key] = 0;
        amounts[key] = 0;
      }
    }

    if (!Number.isFinite(amounts[key])) amounts[key] = 0;
  }

  const income = sumOf(incomeKeys);
  const deductions = sumOf(deductionKeys);
  return { amounts, raw, income, deductions, balance: income - deductions, issues };
}

/** Значення за замовчуванням для нового документа за шаблоном */
export function initialValues(modules: PayrollModule[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of modules) {
    if (!hasOwnInput(m)) continue;
    if (typeof m.defaultValue === 'number') out[m.key] = m.defaultValue;
  }
  return out;
}

/** Короткий опис правила модуля для підказки в інтерфейсі */
export function describeModule(m: PayrollModule, byKey?: Map<string, PayrollModule>): string {
  const nameOf = (key?: string) => {
    if (!key) return '—';
    if (key === INCOME_VAR) return 'Нараховано';
    if (key === DEDUCTIONS_VAR) return 'Відрахування';
    if (key === BALANCE_VAR) return 'Баланс';
    return byKey?.get(key.split('.')[0])?.label || key;
  };
  switch (m.kind) {
    case 'input':
      return m.unit ? `Вводиться вручну, ${m.unit}` : 'Вводиться вручну';
    case 'constant':
      return `Стала: ${num(m.value).toLocaleString('uk-UA')} ₴`;
    case 'rate': {
      const perUnit = m.rateSource ? `«${nameOf(m.rateSource)}»` : `${num(m.rate).toLocaleString('uk-UA')} ₴`;
      return `${perUnit} за 1 ${m.unit || 'од.'}` + (m.source ? ` × «${nameOf(m.source)}»` : '');
    }
    case 'percent':
      return `${m.fixedPercent ? `${num(m.percent)}%` : '% з документа'} від «${nameOf(m.base)}»`;
    case 'tiers': {
      const count = m.tiers?.length || 0;
      const word = count === 1 ? 'поріг' : count >= 2 && count <= 4 ? 'пороги' : 'порогів';
      return `${count} ${word}` + (m.source ? ` за «${nameOf(m.source)}»` : '');
    }
    case 'formula':
      return m.formula ? `= ${m.formula}` : 'Формула не задана';
    default:
      return '';
  }
}

/** Перевірка ключа: у формулах він має бути звичайним ідентифікатором */
export function isValidKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !PSEUDO_VARS.includes(key);
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ъ: '', ё: 'e',
};

/** Робить із назви модуля придатний ключ, унікальний серед `taken` */
export function suggestKey(label: string, taken: Iterable<string>): string {
  const words = label
    .toLowerCase()
    .split(/\s+/)
    .map((w) =>
      [...w]
        .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
        .join('')
        .replace(/[^a-z0-9]/g, '')
    )
    .filter(Boolean);
  let stem = words[0] || 'field';
  words.slice(1, 3).forEach((w) => {
    stem += w.charAt(0).toUpperCase() + w.slice(1);
  });
  if (!/^[a-z_]/i.test(stem)) stem = `f${stem}`;
  const used = new Set(taken);
  if (!used.has(stem)) return stem;
  let i = 2;
  while (used.has(`${stem}${i}`)) i++;
  return `${stem}${i}`;
}

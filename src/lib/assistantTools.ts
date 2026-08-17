/**
 * Інструменти асистента — що він може дізнатись і що може запропонувати зробити.
 *
 * Тут немає ні express, ні genai: сервер лише підставляє дані й віддає опис
 * інструментів моделі. Завдяки цьому найважливіше — хто що має право бачити —
 * перевіряється тестами, а не на живих людях.
 *
 * Головне рішення файлу: асистент НЕ шукає цифри в тексті, він викликає ті самі
 * дані, з яких малюється інтерфейс. Модель, яка «пам'ятає» ARPU, рано чи пізно
 * назве торішній; модель, яка щоразу питає, — не може розійтись з дашбордом.
 */

import type { AppState, AccessRights, Card } from '../types';

export interface AssistantUser {
  userId: string;
  name: string;
  role: 'admin' | 'member';
}

/**
 * Типові права. Свідомо збігаються з тими, що в App.tsx: якщо асистент рахуватиме
 * доступ інакше за інтерфейс, він стане обхідним каналом до чужих даних.
 */
export const DEFAULT_ALLOWED_VIEWS = [
  'dashboard', 'projects', 'processes', 'board', 'content',
  'events', 'calendar', 'regulations', 'profile', 'payroll',
];

/** Вкладки, закриті для всіх, крім адмінів, незалежно від allowedViews */
export const ADMIN_ONLY_VIEWS = ['expenses'];

export function resolveRights(state: AppState, user: AssistantUser): AccessRights {
  const defaults: AccessRights = { canEdit: true, allowedViews: [...DEFAULT_ALLOWED_VIEWS] };
  if (user.role === 'admin') return defaults;

  const record = state.users?.find(u => u.id === user.userId);
  const group = state.userGroups?.find(g => g.id === record?.groupId);
  return record?.customRights || group?.rights || defaults;
}

export function canUseView(rights: AccessRights, user: AssistantUser, view: string): boolean {
  if (ADMIN_ONLY_VIEWS.includes(view)) return user.role === 'admin';
  return rights.allowedViews.includes(view);
}

// ── Опис інструментів ─────────────────────────────────────────────────────────

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema параметрів — у форматі, який приймає Gemini */
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Вкладка, доступ до якої обов'язковий для цього інструмента */
  requiresView?: string;
  /** Потрібне право редагування */
  requiresEdit?: boolean;
  /**
   * Інструмент змінює дані. Такі НІКОЛИ не виконуються на сервері: вони
   * повертаються користувачу як пропозиція, і рішення лишається за людиною.
   */
  writes?: boolean;
}

const CARD_LIMIT_DEFAULT = 20;
const CARD_LIMIT_MAX = 50;

export const TOOLS: ToolSpec[] = [
  {
    name: 'search_cards',
    description:
      'Знайти завдання (картки) на дошці за текстом, виконавцем, списком, проєктом чи простроченням. ' +
      'Використовуй для будь-яких питань про задачі: що горить, що в роботі, що на комусь висить.',
    requiresView: 'board',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Текст у назві або описі картки' },
        assigneeName: { type: 'string', description: "Ім'я виконавця або його частина" },
        onlyMine: { type: 'boolean', description: 'Лише картки того, хто питає' },
        onlyOverdue: { type: 'boolean', description: 'Лише прострочені (дедлайн у минулому й не виконані)' },
        listTitle: { type: 'string', description: 'Назва колонки на дошці' },
        projectTitle: { type: 'string', description: 'Назва проєкту' },
        includeCompleted: { type: 'boolean', description: 'Включати виконані. За замовчуванням ні' },
        limit: { type: 'number', description: `Скільки максимум повернути (до ${CARD_LIMIT_MAX})` },
      },
    },
  },
  {
    name: 'get_board_overview',
    description:
      'Зведення по дошці: скільки карток у кожній колонці, скільки прострочених і скільки без виконавця. ' +
      'Використовуй для питань «як справи загалом», «де затик».',
    requiresView: 'board',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_projects',
    description: 'Список проєктів зі статусом, дедлайном, керівниками і кількістю завдань.',
    requiresView: 'projects',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: "Фільтр: planning, active, on-hold або completed" },
      },
    },
  },
  {
    name: 'get_team',
    description: "Список людей у команді: ім'я, роль, посадові обов'язки. Потрібен, щоб зіставити ім'я з виконавцем.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_key_metrics',
    description:
      'Ключові цифри компанії: показники дашборда, свіжий зріз KeepInCRM (ліди, клієнти, конверсія, угоди) ' +
      'і зведений LTV. Використовуй для будь-яких питань про цифри й результати.',
    requiresView: 'dashboard',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_expenses_summary',
    description: 'Витрати за період: загальна сума та розбивка по категоріях і джерелах.',
    requiresView: 'expenses',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Початок періоду, YYYY-MM-DD' },
        to: { type: 'string', description: 'Кінець періоду, YYYY-MM-DD' },
      },
    },
  },

  // ── Дії. Не виконуються тут — лише пропонуються ────────────────────────────
  {
    name: 'propose_create_card',
    description:
      'Запропонувати створення нового завдання. Виконає його людина після підтвердження — ' +
      'не обіцяй, що картку вже створено.',
    requiresView: 'board',
    requiresEdit: true,
    writes: true,
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Назва завдання' },
        listTitle: { type: 'string', description: 'У яку колонку. Якщо не вказано — перша на дошці' },
        description: { type: 'string', description: 'Опис завдання' },
        assigneeName: { type: 'string', description: "Ім'я виконавця" },
        deadline: { type: 'string', description: 'Дедлайн, YYYY-MM-DD' },
      },
      required: ['title'],
    },
  },
  {
    name: 'propose_update_card',
    description:
      'Запропонувати зміну наявного завдання: дедлайн, виконавець, колонка, позначка виконання. ' +
      'cardId бери з результатів search_cards. Виконає людина після підтвердження.',
    requiresView: 'board',
    requiresEdit: true,
    writes: true,
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'Ідентифікатор картки з search_cards' },
        title: { type: 'string', description: 'Нова назва' },
        deadline: { type: 'string', description: 'Новий дедлайн, YYYY-MM-DD' },
        assigneeName: { type: 'string', description: "Ім'я нового виконавця" },
        listTitle: { type: 'string', description: 'Перенести в колонку' },
        isCompleted: { type: 'boolean', description: 'Позначити виконаним або зняти позначку' },
      },
      required: ['cardId'],
    },
  },
];

/**
 * Інструменти, доступні конкретній людині.
 *
 * Права застосовуються тут, а не проханням у промті: інструкцію «не показуй
 * чуже» модель може обійти вигадливим запитом, а відсутній інструмент — ні.
 * Те, чого немає в цьому списку, для моделі просто не існує.
 */
export function availableTools(rights: AccessRights, user: AssistantUser): ToolSpec[] {
  return TOOLS.filter(t => {
    if (t.requiresView && !canUseView(rights, user, t.requiresView)) return false;
    if (t.requiresEdit && !rights.canEdit) return false;
    return true;
  });
}

export const isWriteTool = (name: string): boolean => !!TOOLS.find(t => t.name === name)?.writes;

// ── Контекст виконання ────────────────────────────────────────────────────────

export interface LtvAggregates {
  ltv?: number;
  totalLTVRevenue?: number;
  uniqueClientsCount?: number;
}

export interface ToolContext {
  state: AppState;
  /** Агрегати LTV лежать окремим документом, тож приходять готовими ззовні */
  ltv?: LtvAggregates | null;
  now: Date;
  user: AssistantUser;
  rights: AccessRights;
}

const norm = (s: unknown): string => String(s ?? '').trim().toLowerCase();

/** Пошук людини за іменем: точний збіг, далі входження. Порожній вхід — нікого */
export function findUserByName(state: AppState, name: string) {
  const n = norm(name);
  if (!n) return undefined;
  const users = state.users || [];
  return users.find(u => norm(u.name) === n) || users.find(u => norm(u.name).includes(n));
}

const findListByTitle = (state: AppState, title: string) => {
  const n = norm(title);
  if (!n) return undefined;
  const lists = state.lists || [];
  return lists.find(l => norm(l.title) === n) || lists.find(l => norm(l.title).includes(n));
};

const isOverdue = (c: Card, now: Date): boolean =>
  !!c.deadline && new Date(c.deadline) < now && !c.isCompleted;

/** Компактний опис картки — рівно те, що потрібно для відповіді, без описів на кілограм */
function summarizeCard(c: Card, state: AppState, now: Date) {
  const list = state.lists?.find(l => l.id === c.listId);
  const assignee = c.assigneeId ? state.users?.find(u => u.id === c.assigneeId) : null;
  const project = c.projectId ? state.projects?.find(p => p.id === c.projectId) : null;
  const subtasks = c.subtasks || [];

  return {
    id: c.id,
    title: c.title,
    list: list?.title ?? null,
    project: project?.title ?? null,
    assignee: assignee?.name ?? null,
    deadline: c.deadline ?? null,
    overdue: isOverdue(c, now),
    completed: !!c.isCompleted,
    subtasks: subtasks.length ? `${subtasks.filter(s => s.completed).length}/${subtasks.length}` : null,
    // Опис врізаємо: моделі вистачає суті, а повний текст роздуває кожну відповідь
    description: c.description ? c.description.slice(0, 200) : null,
  };
}

// ── Виконання читальних інструментів ──────────────────────────────────────────

/**
 * Виконати читальний інструмент.
 *
 * Права перевіряються ще раз тут, а не лише при складанні списку: модель може
 * назвати інструмент, якого їй не давали, і це не має нічого коштувати.
 */
export function runReadTool(name: string, args: Record<string, any>, ctx: ToolContext): unknown {
  const spec = TOOLS.find(t => t.name === name);
  if (!spec) return { error: `Невідомий інструмент: ${name}` };
  if (spec.writes) return { error: 'Цей інструмент змінює дані й тут не виконується' };
  if (spec.requiresView && !canUseView(ctx.rights, ctx.user, spec.requiresView)) {
    return { error: 'Недостатньо прав для цих даних' };
  }

  const { state, now } = ctx;

  switch (name) {
    case 'search_cards': {
      const limit = Math.min(Math.max(1, Number(args.limit) || CARD_LIMIT_DEFAULT), CARD_LIMIT_MAX);
      const q = norm(args.query);
      const assignee = args.assigneeName ? findUserByName(state, args.assigneeName) : undefined;
      const list = args.listTitle ? findListByTitle(state, args.listTitle) : undefined;
      const project = args.projectTitle
        ? state.projects?.find(p => norm(p.title).includes(norm(args.projectTitle)))
        : undefined;

      // Про неіснуючу людину чи колонку кажемо прямо: інакше модель побачить
      // порожній список і впевнено доповість, що завдань немає.
      if (args.assigneeName && !assignee) return { error: `Не знайдено людину: ${args.assigneeName}` };
      if (args.listTitle && !list) return { error: `Не знайдено колонку: ${args.listTitle}` };

      let cards = (state.cards || []).filter(c => {
        if (!args.includeCompleted && c.isCompleted) return false;
        if (args.onlyOverdue && !isOverdue(c, now)) return false;
        if (args.onlyMine && c.assigneeId !== ctx.user.userId) return false;
        if (assignee && c.assigneeId !== assignee.id) return false;
        if (list && c.listId !== list.id) return false;
        if (project && c.projectId !== project.id) return false;
        if (q && !norm(c.title).includes(q) && !norm(c.description).includes(q)) return false;
        return true;
      });

      // Спершу прострочені, далі за дедлайном; без дедлайну — в кінці
      cards = cards.sort((a, b) => {
        const ao = isOverdue(a, now) ? 0 : 1;
        const bo = isOverdue(b, now) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline);
      });

      return {
        total: cards.length,
        shown: Math.min(cards.length, limit),
        cards: cards.slice(0, limit).map(c => summarizeCard(c, state, now)),
      };
    }

    case 'get_board_overview': {
      const cards = state.cards || [];
      return {
        lists: (state.lists || [])
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(l => {
            const inList = cards.filter(c => c.listId === l.id);
            return {
              title: l.title,
              total: inList.length,
              active: inList.filter(c => !c.isCompleted).length,
              overdue: inList.filter(c => isOverdue(c, now)).length,
              unassigned: inList.filter(c => !c.assigneeId && !c.isCompleted).length,
            };
          }),
        totalCards: cards.length,
        totalOverdue: cards.filter(c => isOverdue(c, now)).length,
      };
    }

    case 'get_projects': {
      const cards = state.cards || [];
      return (state.projects || [])
        .filter(p => !args.status || p.status === args.status)
        .map(p => ({
          title: p.title,
          status: p.status,
          deadline: p.deadline ?? null,
          managers: (p.managerIds || [])
            .map(id => state.users?.find(u => u.id === id)?.name)
            .filter(Boolean),
          cards: cards.filter(c => c.projectId === p.id).length,
          openCards: cards.filter(c => c.projectId === p.id && !c.isCompleted).length,
        }));
    }

    case 'get_team':
      return (state.users || []).map(u => ({
        name: u.name,
        role: u.role ?? null,
        duties: u.operationalDuties ?? null,
        isYou: u.id === ctx.user.userId,
      }));

    case 'get_key_metrics': {
      const k = state.keepincrm;
      return {
        metrics: (state.metrics || []).map(m => ({ title: m.title, value: m.value, trend: m.trend ?? null })),
        keepincrm: k
          ? {
              date: k.date,
              acquired: k.totalAcquiredToday ?? null,
              leads: k.totalLeadsToday,
              clients: k.totalClientsToday,
              conversionRate: k.conversionRateToday,
              agreements: k.totalAgreementsToday ?? null,
              agreementsSum: k.totalAgreementsSumToday ?? null,
              syncedAt: k.lastSyncedAt,
              syncError: k.lastSyncError ?? null,
            }
          : null,
        ltv: ctx.ltv
          ? {
              ltv: ctx.ltv.ltv ?? null,
              totalRevenue: ctx.ltv.totalLTVRevenue ?? null,
              clients: ctx.ltv.uniqueClientsCount ?? null,
            }
          : null,
      };
    }

    case 'get_expenses_summary': {
      const from = typeof args.from === 'string' ? args.from : null;
      const to = typeof args.to === 'string' ? args.to : null;
      const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);

      const rows = (state.expenses || []).filter(e => inRange(e.date));
      const sumBy = (key: 'category' | 'source') => {
        const map = new Map<string, number>();
        for (const e of rows) {
          const k = (e[key] as string) || 'Без категорії';
          map.set(k, (map.get(k) || 0) + e.amount);
        }
        return Array.from(map, ([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
      };

      return {
        period: { from, to },
        count: rows.length,
        total: rows.reduce((s, e) => s + e.amount, 0),
        byCategory: sumBy('category'),
        bySource: sumBy('source'),
      };
    }

    default:
      return { error: `Інструмент ${name} не має реалізації` };
  }
}

// ── Дії, які пропонуються людині ──────────────────────────────────────────────

export interface ProposedAction {
  tool: 'propose_create_card' | 'propose_update_card';
  /** Готовий до застосування набір полів — імена вже перетворені на ідентифікатори */
  payload: Record<string, any>;
  /** Опис українською для кнопки підтвердження */
  summary: string;
}

/**
 * Перетворити виклик моделі на конкретну дію.
 *
 * Імена людей і колонок розв'язуються тут, на сервері, а не в браузері: якщо
 * виконавця чи колонки не існує, це має спливти зараз — інакше користувач
 * підтвердить дію, а вона тихо застосується не туди.
 */
export function prepareAction(
  name: string,
  args: Record<string, any>,
  ctx: ToolContext,
): ProposedAction | { error: string } {
  const spec = TOOLS.find(t => t.name === name);
  if (!spec?.writes) return { error: `Невідома дія: ${name}` };
  if (spec.requiresView && !canUseView(ctx.rights, ctx.user, spec.requiresView)) {
    return { error: 'Недостатньо прав для цієї дії' };
  }
  if (!ctx.rights.canEdit) return { error: 'У вас немає прав на редагування' };

  const { state } = ctx;

  const resolveAssignee = (nameArg: unknown) => {
    if (nameArg === undefined || nameArg === null || nameArg === '') return { ok: true as const, id: undefined };
    const found = findUserByName(state, String(nameArg));
    return found
      ? { ok: true as const, id: found.id, name: found.name }
      : { ok: false as const, error: `Не знайдено виконавця: ${nameArg}` };
  };

  const resolveList = (titleArg: unknown) => {
    if (titleArg === undefined || titleArg === null || titleArg === '') return { ok: true as const, id: undefined };
    const found = findListByTitle(state, String(titleArg));
    return found
      ? { ok: true as const, id: found.id, title: found.title }
      : { ok: false as const, error: `Не знайдено колонку: ${titleArg}` };
  };

  if (name === 'propose_create_card') {
    const title = String(args.title ?? '').trim();
    if (!title) return { error: 'Не вказано назву завдання' };

    const assignee = resolveAssignee(args.assigneeName);
    if (!assignee.ok) return { error: assignee.error };

    const listArg = resolveList(args.listTitle);
    if (!listArg.ok) return { error: listArg.error };

    // Без явної колонки кладемо в найпершу — туди ж, куди кладе кнопка «додати»
    const fallback = (state.lists || []).slice().sort((a, b) => a.order - b.order)[0];
    const listId = listArg.id ?? fallback?.id;
    if (!listId) return { error: 'На дошці немає жодної колонки' };
    const listTitle = listArg.title ?? fallback?.title ?? '';

    const parts = [`Створити завдання «${title}» у колонці «${listTitle}»`];
    if (assignee.name) parts.push(`виконавець ${assignee.name}`);
    if (args.deadline) parts.push(`дедлайн ${args.deadline}`);

    return {
      tool: 'propose_create_card',
      payload: {
        title,
        listId,
        description: typeof args.description === 'string' ? args.description : '',
        assigneeId: assignee.id ?? null,
        deadline: typeof args.deadline === 'string' ? args.deadline : null,
      },
      summary: parts.join(', '),
    };
  }

  // propose_update_card
  const card = (state.cards || []).find(c => c.id === args.cardId);
  if (!card) return { error: 'Картку не знайдено. Спершу знайди її через search_cards' };

  const assignee = resolveAssignee(args.assigneeName);
  if (!assignee.ok) return { error: assignee.error };

  const listArg = resolveList(args.listTitle);
  if (!listArg.ok) return { error: listArg.error };

  const updates: Record<string, any> = {};
  const changes: string[] = [];

  if (typeof args.title === 'string' && args.title.trim()) {
    updates.title = args.title.trim();
    changes.push(`назва → «${updates.title}»`);
  }
  if (typeof args.deadline === 'string') {
    updates.deadline = args.deadline;
    changes.push(`дедлайн → ${args.deadline}`);
  }
  if (assignee.id) {
    updates.assigneeId = assignee.id;
    changes.push(`виконавець → ${assignee.name}`);
  }
  if (listArg.id) {
    updates.listId = listArg.id;
    changes.push(`колонка → «${listArg.title}»`);
  }
  if (typeof args.isCompleted === 'boolean') {
    updates.isCompleted = args.isCompleted;
    changes.push(args.isCompleted ? 'позначити виконаним' : 'зняти позначку виконання');
  }

  if (changes.length === 0) return { error: 'Не вказано жодної зміни' };

  return {
    tool: 'propose_update_card',
    payload: { cardId: card.id, updates },
    summary: `Змінити «${card.title}»: ${changes.join(', ')}`,
  };
}

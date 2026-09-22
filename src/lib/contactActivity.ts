/**
 * Частота контакту: нормалізація й агрегація дотиків до клієнтів.
 *
 * У публічному API KeepInCRM дзвінків немає (є clients, agreements, tasks,
 * payments, sources, users…), тож дотики збираються з двох боків:
 *
 *   1) PUSH — тригер «Робота з дзвінками» у KeepInCRM з дією «Відправка
 *      Webhook» стукає на наш роут у момент дзвінка. Єдине джерело справжніх
 *      дзвінків: напрямок, чи підняли, тривалість.
 *   2) PULL — /tasks із категоріями-контактами («Дзвінок», «Зустріч» тощо).
 *      Ловить те, що сейли фіксують руками, і працює без телефонії.
 *
 * Тут лежить усе, що не торкається мережі й бази: обидва джерела зводяться до
 * одного типу події, а потім рахуються показники. Сервер лишає собі тільки
 * введення-виведення — саме тому ці функції можна перевірити тестами.
 */

import { addDaysToYmd, daysBetweenYmd } from './recurrence';

export type ContactKind = 'call' | 'task';
export type ContactDirection = 'in' | 'out' | 'unknown';

/** Один дотик до клієнта — дзвінок або виконане завдання-контакт */
export interface ContactEvent {
  /** Детермінований id: `call_<id>` або `task_<id>` */
  id: string;
  /** Київський день події — статистику читають по робочих днях Києва */
  date: string;
  at: string;
  kind: ContactKind;
  direction: ContactDirection;
  /** Дзвінок підняли / завдання виконане */
  successful: boolean;
  durationSec: number;
  userId: string | null;
  userName: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  title: string;
  origin: 'webhook' | 'tasks';
}

export interface ContactActivityUser {
  userName: string;
  /** Усі дотики: дзвінки + завдання-контакти */
  contacts: number;
  calls: number;
  tasks: number;
  successful: number;
  successRate: number;
  incoming: number;
  outgoing: number;
  durationSec: number;
  /** Скільком різним клієнтам торкались */
  clients: number;
  /** Днів, у які був хоч один дотик */
  activeDays: number;
  /** Дотиків на календарний день періоду */
  perDay: number;
  /** Дотиків на робочий день — лише по днях, коли сейл працював */
  perActiveDay: number;
  lastAt: string | null;
}

export interface ContactActivityClient {
  clientId: string | null;
  clientName: string;
  touches: number;
  calls: number;
  successful: number;
  lastAt: string;
  /** Днів з останнього дотику */
  daysSince: number;
  /** Хто саме контактував */
  reps: string[];
}

export interface ContactActivityDay {
  date: string;
  calls: number;
  tasks: number;
  successful: number;
}

export interface ContactActivityTotals {
  contacts: number;
  calls: number;
  tasks: number;
  successful: number;
  successRate: number;
  incoming: number;
  outgoing: number;
  durationSec: number;
  /** Скільки сейлів мали хоч один дотик */
  reps: number;
  clients: number;
  periodDays: number;
  /** Головний показник частоти: дотиків на сейла за день */
  perRepPerDay: number;
  /** Частота з боку клієнта: дотиків на одного клієнта за період */
  touchesPerClient: number;
}

export interface ContactAggregate {
  totals: ContactActivityTotals;
  byUser: ContactActivityUser[];
  byClient: ContactActivityClient[];
  daily: ContactActivityDay[];
}

export const UNKNOWN_USER = 'Без відповідального';
export const UNKNOWN_CLIENT = 'Невідомий клієнт';

/**
 * Категорії завдань, які за замовчуванням вважаємо контактом.
 *
 * Зразок, а не список: перелік категорій у кожного акаунта свій, і жорсткий
 * список означав би «нічого не враховуємо» до першого налаштування.
 */
export const CONTACT_TASK_PATTERN = /дзвін|звон|call|телефон|зустр|meeting|контакт|перегов/i;

/** Статус завдання, який означає «зроблено» */
export const DONE_STATUS_PATTERN = /викон|заверш|закри|done|complete|closed|success/i;

/**
 * Перше непорожнє значення з переліку ключів.
 *
 * Тіло вебхука в KeepInCRM складає користувач руками, а документований опис
 * завдання — це лише id і title, хоча API віддає більше. Тому жодне поле не
 * фіксоване: перебираємо всі назви, які зустрічаються.
 */
export function pickFirst(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export function asBool(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return /^(1|true|yes|y|так|answered|success)$/i.test(v.trim());
  return false;
}

export function asNum(v: any): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

/** Ім'я з поля, яке може бути рядком або об'єктом {name|person|title} */
export function asName(v: any): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object') {
    const n = pickFirst(v, ['name', 'person', 'title', 'full_name', 'fullname']);
    if (typeof n === 'string') return n.trim();
  }
  return '';
}

export function asIdString(v: any): string | null {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (v && typeof v === 'object') {
    const id = pickFirst(v, ['id']);
    if (id !== undefined && id !== null) return String(id);
  }
  return null;
}

/**
 * Київський день моменту.
 *
 * Календарний день беремо саме київський: зміна сейла закінчується о 18:00 за
 * Києвом, а не за UTC, тож вечірній дзвінок мусить лягти в той самий день, у
 * який його зробили.
 */
export function kyivDateOf(at: string | Date, fallbackToday: string): string {
  const d = at instanceof Date ? at : new Date(at);
  if (isNaN(d.getTime())) return fallbackToday;
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
}

/**
 * Напрямок дзвінка. KeepInCRM надсилає income/outcome, телефонії —
 * incoming/outgoing або in/out. Вихідний перевіряємо першим: у «incoming»
 * теж є «in», тож зворотний порядок склеїв би напрямки.
 */
export function asDirection(v: any): ContactDirection {
  const s = String(v ?? '').toLowerCase();
  if (/out|вих/.test(s)) return 'out';
  if (/in|вх/.test(s)) return 'in';
  return 'unknown';
}

/**
 * Чи це справжній календарний день у форматі YYYY-MM-DD.
 *
 * Перевірки самої форми не досить: «2026-13-99» їй відповідає, але такого дня
 * немає, і далі він тихо перетворюється на сміттєвий період. Тому дату ще й
 * складаємо назад — якщо не збіглась, її вигадали.
 */
export function isValidYmd(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Список київських днів у діапазоні [from, to] включно */
export function dayList(from: string, to: string): string[] {
  const days: string[] = [];
  let cur = from;
  // Захист від перевернутого діапазону: порожній список чесніший за безкінечний
  while (cur <= to && days.length < 4000) {
    days.push(cur);
    cur = addDaysToYmd(cur, 1);
  }
  return days;
}

/**
 * Чи вважати завдання з такою категорією контактом.
 *
 * @param configured значення KEEPINCRM_CONTACT_TASK_CATEGORIES — точний список
 *        через кому. Потрібен, коли зразок бере лишнє: «Дзвінок постачальнику»
 *        не є контактом із клієнтом.
 */
export function contactCategoryMatcher(configured?: string | null): (name: string) => boolean {
  const raw = (configured || '').trim();
  if (!raw) return (name: string) => !!name && CONTACT_TASK_PATTERN.test(name);
  const allow = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return (name: string) => allow.includes(name.trim().toLowerCase());
}

/**
 * Привести тіло вебхука дзвінка до події контакту.
 * null — якщо це не об'єкт: краще відкинути, ніж записати порожній дотик.
 *
 * @param now момент, яким підміняємо відсутній або зіпсований час дзвінка
 */
export function normalizeCallEvent(raw: any, now: Date = new Date()): ContactEvent | null {
  if (!raw || typeof raw !== 'object') return null;

  const atRaw = pickFirst(raw, [
    'created_at', 'started_at', 'call_at', 'happened_at', 'datetime', 'date', 'time',
  ]);
  const parsed = atRaw ? new Date(atRaw) : now;
  const at = isNaN(parsed.getTime()) ? now.toISOString() : parsed.toISOString();
  const today = kyivDateOf(now, now.toISOString().slice(0, 10));

  const userName = asName(pickFirst(raw, [
    'user', 'manager', 'responsible', 'main_responsible',
    'user_name', 'manager_name', 'responsible_name', 'employee',
  ]));
  const clientName = asName(pickFirst(raw, [
    'client', 'client_name', 'person', 'contact', 'contact_name', 'lead',
  ]));
  const phone = String(pickFirst(raw, [
    'phone', 'client_phone', 'external_number', 'contact_number', 'from', 'to',
  ]) ?? '').trim();

  const externalId = pickFirst(raw, [
    'id', 'call_id', 'callId', 'uuid', 'universal_call_id', 'general_call_id',
  ]);

  // Без власного id дзвінок все одно мусить лишитись один: два звернення з
  // однаковим часом, номером і менеджером — це повтор вебхука, а не другий
  // дзвінок. Тому id збираємо з самих даних, а не з випадкового значення.
  const id = externalId
    ? `call_${String(externalId)}`.replace(/[^\w.-]/g, '_')
    : `call_${at.slice(0, 19)}_${phone || userName || 'anon'}`.replace(/[^\w.-]/g, '_');

  return {
    id,
    date: kyivDateOf(at, today),
    at,
    kind: 'call',
    direction: asDirection(pickFirst(raw, ['call_type', 'type', 'direction'])),
    successful: asBool(pickFirst(raw, ['is_answered', 'answered', 'is_answer', 'success'])),
    durationSec: Math.max(0, Math.round(asNum(pickFirst(raw, [
      'duration', 'duration_sec', 'talk_time', 'billsec', 'seconds',
    ])))),
    userId: asIdString(pickFirst(raw, ['user_id', 'manager_id', 'responsible_id', 'user'])),
    userName: userName || UNKNOWN_USER,
    clientId: asIdString(pickFirst(raw, ['client_id', 'clientId', 'client'])),
    clientName: clientName || phone || UNKNOWN_CLIENT,
    clientPhone: phone,
    title: '',
    origin: 'webhook',
  };
}

/** Довідники KeepInCRM, якими доповнюємо завдання: id → назва або обʼєкт */
export interface TaskLookups {
  categoryById: Map<string, string>;
  statusById: Map<string, any>;
  userById: Map<string, string>;
}

/**
 * Привести завдання KeepInCRM до події контакту.
 * null — якщо категорія завдання не є контактом.
 *
 * Подію ставимо на день виконання, коли він відомий: дотик стався тоді, коли
 * сейл подзвонив, а не коли завдання поставили. Оскільки id детермінований,
 * завдання, виконане наступного дня, при ре-синхронізації переїде на свій день,
 * а не задвоїться.
 */
export function normalizeTaskEvent(
  task: any,
  lookups: TaskLookups,
  isContact: (category: string) => boolean,
  today: string,
): ContactEvent | null {
  if (!task || typeof task !== 'object') return null;

  const category = asName(task.category)
    || lookups.categoryById.get(String(pickFirst(task, ['category_id']) ?? '')) || '';
  if (!isContact(category)) return null;

  const status = task.status ?? lookups.statusById.get(String(pickFirst(task, ['status_id']) ?? ''));
  const statusLabel = `${asName(status)} ${String(status?.kind ?? '')}`;

  const completedAt = pickFirst(task, ['completed_at', 'closed_at', 'done_at', 'finished_at']);
  const createdAt = pickFirst(task, ['created_at', 'inserted_at']);
  const chosen = completedAt ?? createdAt;
  const parsed = chosen ? new Date(chosen) : null;
  const at = parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : `${today}T00:00:00.000Z`;

  const userId = asIdString(pickFirst(task, ['user_id', 'user']));
  const clientId = asIdString(pickFirst(task, ['client_id', 'client']));

  return {
    id: `task_${String(pickFirst(task, ['id']) ?? at)}`.replace(/[^\w.-]/g, '_'),
    date: kyivDateOf(at, today),
    at,
    kind: 'task',
    // Завдання не знає, куди дзвонили — напрямок лишається невідомим,
    // щоб не видавати здогад за факт.
    direction: 'unknown',
    successful: DONE_STATUS_PATTERN.test(statusLabel) || !!completedAt,
    durationSec: 0,
    userId,
    userName: asName(task.user) || (userId ? lookups.userById.get(userId) ?? '' : '') || UNKNOWN_USER,
    clientId,
    clientName: asName(task.client) || UNKNOWN_CLIENT,
    clientPhone: '',
    title: asName(pickFirst(task, ['title', 'name'])) || category,
    origin: 'tasks',
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Відсоток з одним знаком; нуль знаменника = 0, а не NaN */
const rate = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : 0);

/** Середнє з одним знаком; нуль знаменника = 0 */
const per = (total: number, over: number) => (over > 0 ? round1(total / over) : 0);

/**
 * Порахувати показники активності за набором подій.
 *
 * @param today київський день, від якого рахуємо «днів з останнього контакту»
 */
export function aggregateContactEvents(
  events: ContactEvent[],
  from: string,
  to: string,
  today: string,
): ContactAggregate {
  const days = dayList(from, to);
  const daily = new Map<string, ContactActivityDay>(
    days.map(d => [d, { date: d, calls: 0, tasks: 0, successful: 0 }]),
  );

  interface UserAcc {
    userName: string; calls: number; tasks: number; successful: number;
    incoming: number; outgoing: number; durationSec: number;
    clients: Set<string>; days: Set<string>; lastAt: string | null;
  }
  interface ClientAcc {
    clientId: string | null; clientName: string; touches: number; calls: number;
    successful: number; lastAt: string; reps: Set<string>;
  }

  const users = new Map<string, UserAcc>();
  const clients = new Map<string, ClientAcc>();

  let calls = 0, tasks = 0, successful = 0, incoming = 0, outgoing = 0, durationSec = 0;

  for (const e of events) {
    const isCall = e.kind === 'call';
    if (isCall) calls++; else tasks++;
    if (e.successful) successful++;
    if (e.direction === 'in') incoming++;
    if (e.direction === 'out') outgoing++;
    durationSec += e.durationSec || 0;

    const d = daily.get(e.date);
    if (d) {
      if (isCall) d.calls++; else d.tasks++;
      if (e.successful) d.successful++;
    }

    // Клієнта склеюємо за id, а без нього — за телефоном: той самий номер без
    // картки в CRM інакше розпався б на окремі «клієнти» на кожен дзвінок.
    const clientKey = e.clientId || e.clientPhone || e.clientName || UNKNOWN_CLIENT;
    const uKey = e.userName || UNKNOWN_USER;

    let u = users.get(uKey);
    if (!u) {
      u = {
        userName: uKey, calls: 0, tasks: 0, successful: 0, incoming: 0, outgoing: 0,
        durationSec: 0, clients: new Set(), days: new Set(), lastAt: null,
      };
      users.set(uKey, u);
    }
    if (isCall) u.calls++; else u.tasks++;
    if (e.successful) u.successful++;
    if (e.direction === 'in') u.incoming++;
    if (e.direction === 'out') u.outgoing++;
    u.durationSec += e.durationSec || 0;
    u.clients.add(clientKey);
    u.days.add(e.date);
    if (!u.lastAt || e.at > u.lastAt) u.lastAt = e.at;

    let c = clients.get(clientKey);
    if (!c) {
      c = {
        clientId: e.clientId, clientName: e.clientName || UNKNOWN_CLIENT,
        touches: 0, calls: 0, successful: 0, lastAt: e.at, reps: new Set(),
      };
      clients.set(clientKey, c);
    }
    c.touches++;
    if (isCall) c.calls++;
    if (e.successful) c.successful++;
    if (e.at > c.lastAt) c.lastAt = e.at;
    if (e.userName) c.reps.add(e.userName);
    // Ім'я з картки клієнта витісняє номер телефону: дзвінок міг прийти раніше,
    // ніж завдання, у якому клієнт уже названий.
    if ((c.clientName === UNKNOWN_CLIENT || c.clientName === e.clientPhone)
        && e.clientName && e.clientName !== e.clientPhone) {
      c.clientName = e.clientName;
    }
    if (!c.clientId && e.clientId) c.clientId = e.clientId;
  }

  // Дільник і показник — різні числа: ділити на нуль не можна, але й видавати
  // порожній період за однодобовий не варто.
  const periodDays = days.length;
  const divisor = periodDays || 1;

  const byUser = [...users.values()]
    .map(u => {
      const contacts = u.calls + u.tasks;
      return {
        userName: u.userName,
        contacts,
        calls: u.calls,
        tasks: u.tasks,
        successful: u.successful,
        successRate: rate(u.successful, contacts),
        incoming: u.incoming,
        outgoing: u.outgoing,
        durationSec: u.durationSec,
        clients: u.clients.size,
        activeDays: u.days.size,
        perDay: per(contacts, divisor),
        perActiveDay: per(contacts, u.days.size),
        lastAt: u.lastAt,
      };
    })
    .sort((a, b) => b.contacts - a.contacts || a.userName.localeCompare(b.userName, 'uk'));

  const byClient = [...clients.values()]
    .map(c => ({
      clientId: c.clientId,
      clientName: c.clientName,
      touches: c.touches,
      calls: c.calls,
      successful: c.successful,
      lastAt: c.lastAt,
      daysSince: Math.max(0, daysBetweenYmd(kyivDateOf(c.lastAt, today), today)),
      reps: [...c.reps],
    }))
    .sort((a, b) => b.touches - a.touches || a.clientName.localeCompare(b.clientName, 'uk'));

  const contacts = calls + tasks;

  return {
    totals: {
      contacts,
      calls,
      tasks,
      successful,
      successRate: rate(successful, contacts),
      incoming,
      outgoing,
      durationSec,
      reps: users.size,
      clients: clients.size,
      periodDays,
      perRepPerDay: per(contacts, divisor * (users.size || 1)),
      touchesPerClient: per(contacts, clients.size),
    },
    byUser,
    byClient,
    daily: days.map(d => daily.get(d)!),
  };
}

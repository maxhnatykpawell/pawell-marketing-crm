/**
 * Чат — чиста логіка, спільна для сервера і UI.
 *
 * Тут навмисно немає ні React, ні мережі: правила доступу до розмови і розбір
 * згадок мають працювати однаково на обох кінцях. Якби сервер розбирав @-згадки
 * інакше, ніж їх підсвічує інтерфейс, людина отримувала б сповіщення не там, де
 * бачила своє ім'я виділеним.
 */

/**
 * Згадки переїхали в lib/mentions: тепер їх читають не лише в чаті, а й у
 * коментарях до карток. Реекспорт лишає всі наявні імпорти на місці.
 */
export { parseMentions } from './mentions';
export type { MentionUser } from './mentions';

export type ChatConversationKind = 'channel' | 'dm';

/** Мінімум полів розмови, потрібний цій логіці */
export interface ConversationLike {
  id: string;
  kind: ChatConversationKind;
  memberIds: string[] | null;
}

/**
 * Ідентифікатор особистої розмови будується з двох id за сталим правилом.
 *
 * Це робить створення листування ідемпотентним: якщо двоє одночасно натиснуть
 * «написати» одне одному, вийде та сама розмова, а не дві половини діалогу.
 */
export function dmConversationId(userA: string, userB: string): string {
  return 'dm_' + [userA, userB].sort().join('__');
}

/** Двоє учасників особистої розмови з її id; null, якщо це не dm-формат */
export function dmMembers(conversationId: string): [string, string] | null {
  if (!conversationId.startsWith('dm_')) return null;
  const parts = conversationId.slice(3).split('__');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

/**
 * Чи має користувач доступ до розмови.
 *
 * Канал із memberIds === null відкритий усій команді — це загальні кімнати.
 * Канал зі списком і будь-яке особисте листування бачать лише учасники.
 */
export function canAccess(conv: ConversationLike, userId: string): boolean {
  if (conv.memberIds === null) return conv.kind === 'channel';
  return conv.memberIds.includes(userId);
}

/** Кому доставляти подію про нове повідомлення: null = всім підключеним */
export function recipientsOf(conv: ConversationLike): string[] | null {
  return conv.memberIds === null ? null : [...conv.memberIds];
}

/** Текст для списку розмов: один рядок без переносів і без хвоста */
export function previewOf(text: string, limit = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? flat.slice(0, limit - 1) + '…' : flat;
}

export interface MessageLike {
  id: string;
  authorId: string;
  createdAt: string;
}

/**
 * Скільки повідомлень людина ще не бачила.
 *
 * Власні повідомлення не рахуються: побачити «1 непрочитане» одразу після того,
 * як сам щось написав, — це не сповіщення, а шум.
 */
export function unreadCount(
  messages: MessageLike[],
  lastReadAt: string | null | undefined,
  myUserId: string,
): number {
  return messages.filter(
    m => m.authorId !== myUserId && (!lastReadAt || m.createdAt > lastReadAt),
  ).length;
}

/** Чи показувати аватар і ім'я, чи це продовження серії від тієї ж людини */
export function startsNewGroup(
  msg: MessageLike,
  prev: MessageLike | null,
  gapMinutes = 5,
): boolean {
  if (!prev) return true;
  if (prev.authorId !== msg.authorId) return true;
  const gap = new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime();
  return !(gap >= 0) || gap > gapMinutes * 60000;
}

/** Мітка дня для роздільника в стрічці */
export function dayKey(iso: string): string {
  // Локальна дата, а не зріз UTC-рядка: інакше повідомлення між північчю й 03:00 за
  // Києвом потрапляло б у «вчора» і день у стрічці розривався посеред ночі
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso.slice(0, 10) : toKey(d);
}

export function dayLabel(iso: string, today = new Date()): string {
  const key = dayKey(iso);
  const todayKey = toKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (key === todayKey) return 'Сьогодні';
  if (key === toKey(yesterday)) return 'Вчора';

  const d = new Date(iso);
  return isNaN(d.getTime())
    ? key
    : d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

function toKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Вставити нове повідомлення в стрічку.
 *
 * Стрічка приходить двома шляхами — історією з сервера і подіями через SSE, —
 * тож те саме повідомлення легко отримати двічі: власне щойно надіслане
 * повертається ще й потоком. Дублікати відсікаємо за id, порядок тримаємо за часом.
 */
export function mergeMessage<T extends MessageLike>(list: T[], msg: T): T[] {
  const idx = list.findIndex(m => m.id === msg.id);
  if (idx !== -1) {
    const copy = [...list];
    copy[idx] = msg;
    return copy;
  }
  // Майже завжди повідомлення найновіше — перевіряємо хвіст, а не сортуємо все
  if (list.length === 0 || list[list.length - 1].createdAt <= msg.createdAt) {
    return [...list, msg];
  }
  return [...list, msg].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Порядок розмов: спершу ті, де щойно писали */
export function sortConversations<T extends { lastMessageAt?: string; createdAt: string }>(
  list: T[],
): T[] {
  return [...list].sort(
    (a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt),
  );
}

// ── Сповіщення та лічильники ─────────────────────────────────────────────────

export type NotifyLevel = 'all' | 'mentions' | 'none';

export function isNotifyLevel(v: unknown): v is NotifyLevel {
  return v === 'all' || v === 'mentions' || v === 'none';
}

/**
 * Скільки показувати на значку розмови.
 *
 * «none» — нічого; «mentions» — лише згадки (в особистому листуванні кожне
 * повідомлення адресоване людині, тож воно рахується як згадка).
 */
export function badgeCount(
  c: { kind: ChatConversationKind; unread: number; mentionUnread?: number; notify?: NotifyLevel },
): number {
  const level = c.notify ?? 'all';
  if (level === 'none') return 0;
  if (level === 'mentions') return c.kind === 'dm' ? c.unread : Math.min(c.mentionUnread ?? 0, c.unread);
  return c.unread;
}

/** Кому слати пуш про повідомлення, враховуючи вибір кожного для цієї розмови */
export function filterByNotify(
  userIds: string[],
  levelOf: (userId: string) => NotifyLevel,
  isDm: boolean,
): string[] {
  return userIds.filter(id => {
    const level = levelOf(id);
    if (level === 'none') return false;
    if (level === 'mentions') return isDm;
    return true;
  });
}

// ── Реакції ──────────────────────────────────────────────────────────────────

/** Скільки різних емодзі дозволено на одному повідомленні */
export const MAX_REACTION_KINDS = 20;

/** Додати/зняти реакцію людини; порожні емодзі прибираємо, щоб не копичити сміття */
export function toggleReaction(
  reactions: Record<string, string[]> | undefined,
  emoji: string,
  userId: string,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [e, ids] of Object.entries(reactions ?? {})) next[e] = [...ids];
  const list = next[emoji] ?? [];
  next[emoji] = list.includes(userId) ? list.filter(id => id !== userId) : [...list, userId];
  if (next[emoji].length === 0) delete next[emoji];
  return next;
}

// ── Вкладення ────────────────────────────────────────────────────────────────

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;

export function isImageName(name: string): boolean {
  return IMAGE_EXT.test(name);
}

/** Вкладенням може бути лише наш файл: чужу адресу в чаті ніхто не підсовує */
export function isOwnUploadUrl(url: unknown): url is string {
  return typeof url === 'string'
    && url.startsWith('/uploads/')
    && !url.includes('..')
    && url.length < 500;
}

// ── Чернетки ─────────────────────────────────────────────────────────────────

export function draftKey(conversationId: string): string {
  return 'pawell_chat_draft_' + conversationId;
}

/** Розділ списку: канали й особисте листування лежать окремо, як у Slack */
export function splitSections<T extends { kind: ChatConversationKind }>(list: T[]): { channels: T[]; dms: T[] } {
  return {
    channels: list.filter(c => c.kind === 'channel'),
    dms: list.filter(c => c.kind === 'dm'),
  };
}

/**
 * Підпис часу в списку розмов: сьогодні — година, вчора — «Вчора»,
 * протягом тижня — день тижня, давніше — дата.
 */
export function listTimeLabel(iso: string | undefined, now = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  if (dayKey(iso) === toKey(now)) {
    return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(iso) === toKey(yesterday)) return 'Вчора';
  const days = (now.getTime() - d.getTime()) / 86400000;
  if (days < 6) return d.toLocaleDateString('uk-UA', { weekday: 'short' });
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

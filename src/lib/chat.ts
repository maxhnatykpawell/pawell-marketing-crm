/**
 * Чат — чиста логіка, спільна для сервера і UI.
 *
 * Тут навмисно немає ні React, ні мережі: правила доступу до розмови і розбір
 * згадок мають працювати однаково на обох кінцях. Якби сервер розбирав @-згадки
 * інакше, ніж їх підсвічує інтерфейс, людина отримувала б сповіщення не там, де
 * бачила своє ім'я виділеним.
 */

export type ChatConversationKind = 'channel' | 'dm';

/** Мінімум полів розмови, потрібний цій логіці */
export interface ConversationLike {
  id: string;
  kind: ChatConversationKind;
  memberIds: string[] | null;
}

/** Мінімум полів користувача, потрібний для згадок */
export interface MentionUser {
  id: string;
  name: string;
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

/**
 * Розбір @-згадок.
 *
 * Імена бувають із пробілом («Марія Коваль»), тому шукаємо не «слово після @»,
 * а найдовше ім'я зі списку команди, що збігається з текстом після @. Інакше
 * «@Марія Коваль» знаходило б неіснуючого користувача «Марія».
 */
export function parseMentions(text: string, users: MentionUser[]): string[] {
  if (!text || users.length === 0) return [];

  // Довші імена перевіряємо першими, щоб «Марія Коваль» вигравала над «Марія»
  const byLength = [...users].sort((a, b) => b.name.length - a.name.length);
  const found = new Set<string>();
  const lower = text.toLowerCase();

  for (let i = 0; i < lower.length; i++) {
    if (lower[i] !== '@') continue;
    // Згадка починається на межі слова: пошта на кшталт mail@example.com — не згадка
    if (i > 0 && /[\wа-яїієґ]/i.test(lower[i - 1])) continue;

    for (const u of byLength) {
      const name = u.name.toLowerCase();
      if (!name) continue;
      if (lower.startsWith(name, i + 1)) {
        found.add(u.id);
        i += name.length;
        break;
      }
    }
  }

  return [...found];
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
  return iso.slice(0, 10);
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

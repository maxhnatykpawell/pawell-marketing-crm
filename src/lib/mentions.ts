/**
 * @-згадки: розбір, підсвітка й автодоповнення.
 *
 * Тут навмисно немає ні React, ні мережі: згадки читають у трьох місцях —
 * сервер (кому слати сповіщення), перегляд (кого підсвітити) і поле вводу
 * (кого підказати). Якби кожне місце шукало імена по-своєму, людина бачила б
 * своє ім'я виділеним там, де сповіщення не прийде, — і навпаки.
 *
 * Тому пошук один: findMentions. Решта — це його різні прочитання.
 */

/** Мінімум полів користувача, потрібний для згадок */
export interface MentionUser {
  id: string;
  name: string;
}

/** Знайдена згадка: позиція в тексті разом із «собачкою» */
export interface MentionHit {
  /** Індекс символу '@' */
  index: number;
  /** Довжина разом із '@' */
  length: number;
  userId: string;
}

/** Шматок тексту для перегляду: userId === null — звичайний текст */
export interface MentionSegment {
  text: string;
  userId: string | null;
}

/**
 * Символ, після якого '@' уже не починає згадку.
 *
 * Потрібен, щоб пошта на кшталт max@pawell.com не перетворювалась на згадку
 * користувача з іменем «Pawell».
 */
const WORD_CHAR = /[\wа-яїієґ'’]/i;

/**
 * Усі згадки в тексті, зліва направо, без перекриттів.
 *
 * Імена бувають складені («Марія Коваль»), тому шукаємо не «слово після @», а
 * найдовше ім'я команди, що збігається з текстом після '@'. Інакше «@Марія
 * Коваль» знаходило б неіснуючу «Марію», а справжня згадка лишалась би без
 * сповіщення.
 */
export function findMentions(text: string, users: MentionUser[]): MentionHit[] {
  if (!text || users.length === 0) return [];

  // Довші імена перевіряємо першими, щоб «Марія Коваль» вигравала над «Марія»
  const byLength = [...users].filter(u => u.name).sort((a, b) => b.name.length - a.name.length);
  if (byLength.length === 0) return [];

  const hits: MentionHit[] = [];
  const lower = text.toLowerCase();

  for (let i = 0; i < lower.length; i++) {
    if (lower[i] !== '@') continue;
    // Згадка починається на межі слова
    if (i > 0 && WORD_CHAR.test(lower[i - 1])) continue;

    for (const u of byLength) {
      const name = u.name.toLowerCase();
      if (lower.startsWith(name, i + 1)) {
        hits.push({ index: i, length: name.length + 1, userId: u.id });
        i += name.length;
        break;
      }
    }
  }

  return hits;
}

/** Кого згадали — без повторів, у порядку першої появи */
export function parseMentions(text: string, users: MentionUser[]): string[] {
  const seen = new Set<string>();
  for (const hit of findMentions(text, users)) seen.add(hit.userId);
  return [...seen];
}

/**
 * Розкласти текст на звичайні шматки й згадки — для підсвітки.
 *
 * Повертає щонайменше один шматок на непорожній текст, тож той, хто це
 * малює, може не розрізняти «є згадки» і «немає».
 */
export function splitMentions(text: string, users: MentionUser[]): MentionSegment[] {
  if (!text) return [];

  const hits = findMentions(text, users);
  if (hits.length === 0) return [{ text, userId: null }];

  const parts: MentionSegment[] = [];
  let pos = 0;

  for (const hit of hits) {
    if (hit.index > pos) parts.push({ text: text.slice(pos, hit.index), userId: null });
    parts.push({ text: text.slice(hit.index, hit.index + hit.length), userId: hit.userId });
    pos = hit.index + hit.length;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), userId: null });

  return parts;
}

/**
 * Що людина зараз друкує після '@' наприкінці рядка; null — зараз не згадка.
 *
 * Підказку показуємо лише поки згадку набирають: дописав людину й пішов далі —
 * список має зникнути, а не висіти над полем до кінця речення.
 */
export function mentionQueryAt(text: string): string | null {
  const m = text.match(/@([^@\n]*)$/);
  return m ? m[1] : null;
}

/** Підставити обране ім'я замість недодрукованої згадки наприкінці рядка */
export function applyMention(text: string, name: string): string {
  return text.replace(/@([^@\n]*)$/, `@${name} `);
}

/**
 * Кого підказати під набране.
 *
 * Порожній запит (щойно набране '@') показує початок списку — так людина
 * бачить, кого взагалі можна покликати, ще не знаючи імен.
 */
export function suggestMentions<T extends MentionUser>(
  users: T[],
  query: string | null,
  limit = 5,
): T[] {
  if (query === null) return [];
  const q = query.trim().toLowerCase();
  return users.filter(u => u.name.toLowerCase().includes(q)).slice(0, limit);
}

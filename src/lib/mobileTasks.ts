/**
 * Логіка списку задач для мобільної версії: групування за терміном, фільтри,
 * підписи дедлайнів. Без React і без побічних ефектів — щоб її можна було
 * перевірити тестом (див. mobileTasks.test.ts).
 *
 * Дати рахуємо за «ключами днів» (YYYY-MM-DD, як і в lib/gantt), а не за
 * Date: так «сьогодні» не з'їжджає на день через часовий пояс.
 */

import { toDayKey, todayKey } from './gantt';

export type TaskBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'done';

/** Порядок і назви груп на екрані — від найтерміновішого до найвіддаленішого */
export const BUCKETS: { key: TaskBucket; label: string }[] = [
  { key: 'overdue', label: 'Прострочені' },
  { key: 'today', label: 'Сьогодні' },
  { key: 'tomorrow', label: 'Завтра' },
  { key: 'week', label: 'Цього тижня' },
  { key: 'later', label: 'Пізніше' },
  { key: 'none', label: 'Без терміну' },
  { key: 'done', label: 'Виконані' },
];

export interface TaskLike {
  id: string;
  title: string;
  deadline: string | null;
  isCompleted?: boolean;
  assigneeId: string | null;
  order: number;
}

/** Кількість днів від ключа a до ключа b (b − a) */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function bucketOf(card: TaskLike, today: string = todayKey()): TaskBucket {
  if (card.isCompleted) return 'done';
  const key = toDayKey(card.deadline);
  if (!key) return 'none';
  const diff = daysBetween(today, key);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'week';
  return 'later';
}

export interface TaskFilter {
  /** Лише задачі цієї людини; null — усі */
  assigneeId?: string | null;
  query?: string;
  /** Показувати виконані (за замовчуванням — ні) */
  includeDone?: boolean;
}

export function filterTasks<T extends TaskLike>(cards: readonly T[], f: TaskFilter): T[] {
  const q = (f.query || '').trim().toLowerCase();
  return cards.filter(c => {
    if (!f.includeDone && c.isCompleted) return false;
    if (f.assigneeId && c.assigneeId !== f.assigneeId) return false;
    if (q && !c.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

export interface TaskGroup<T> { key: TaskBucket; label: string; cards: T[] }

/** Розкладає задачі по групах; порожні групи не повертає. Усередині — за терміном, далі за порядком на дошці. */
export function groupTasks<T extends TaskLike>(cards: readonly T[], today: string = todayKey()): TaskGroup<T>[] {
  const byBucket = new Map<TaskBucket, T[]>();
  for (const c of cards) {
    const b = bucketOf(c, today);
    if (!byBucket.has(b)) byBucket.set(b, []);
    byBucket.get(b)!.push(c);
  }
  return BUCKETS
    .filter(b => byBucket.has(b.key))
    .map(b => ({
      key: b.key,
      label: b.label,
      cards: byBucket.get(b.key)!.sort((x, y) => {
        const dx = toDayKey(x.deadline) || '9999-99-99';
        const dy = toDayKey(y.deadline) || '9999-99-99';
        return dx === dy ? x.order - y.order : dx < dy ? -1 : 1;
      }),
    }));
}

/** Підрахунок для чипів-фільтрів над списком */
export function countByBucket(cards: readonly TaskLike[], today: string = todayKey()): Record<TaskBucket, number> {
  const out: Record<TaskBucket, number> = { overdue: 0, today: 0, tomorrow: 0, week: 0, later: 0, none: 0, done: 0 };
  for (const c of cards) out[bucketOf(c, today)]++;
  return out;
}

const MONTHS_SHORT = ['січ', 'лют', 'бер', 'квіт', 'трав', 'черв', 'лип', 'серп', 'вер', 'жовт', 'лист', 'груд'];

/** Короткий підпис терміну: «Сьогодні», «Завтра», «Вчора», «3 дн. тому», «24 лист» */
export function deadlineLabel(deadline: string | null, today: string = todayKey()): string {
  const key = toDayKey(deadline);
  if (!key) return '';
  const diff = daysBetween(today, key);
  if (diff === 0) return 'Сьогодні';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчора';
  if (diff < 0 && diff >= -14) return `${-diff} дн. тому`;
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

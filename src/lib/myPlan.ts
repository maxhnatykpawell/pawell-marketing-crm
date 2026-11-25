/**
 * Особистий план роботи: усе, що лежить на людині, одним списком.
 *
 * Це і задачі, де вона відповідальна, і підзавдання, куди її призначили в чужих
 * (або власних) задачах. Групування за терміном — те саме, що в мобільних
 * задачах (lib/mobileTasks), щоб «Сьогодні» й «Цього тижня» означали скрізь одне.
 *
 * Без React і побічних ефектів — щоб це можна було перевірити тестом.
 */

import type { TaskLike } from './mobileTasks';

export interface PlanSubtaskLike {
  id: string;
  title: string;
  completed: boolean;
  assigneeId?: string | null;
  deadline?: string | null;
}

export interface PlanCardLike {
  id: string;
  title: string;
  deadline: string | null;
  isCompleted?: boolean;
  assigneeId: string | null;
  order: number;
  subtasks?: PlanSubtaskLike[];
}

export interface PlanItem extends TaskLike {
  kind: 'card' | 'subtask';
  cardId: string;
  /** Для підзавдання — id підзавдання всередині картки */
  subtaskId?: string;
  /** Для підзавдання — назва задачі, у якій воно лежить */
  parentTitle?: string;
  /** У підзавдання немає власного терміну, взято термін задачі */
  inheritedDeadline?: boolean;
  /** Для задачі — скільки її підзавдань ще не виконано (усього й моїх) */
  openSubtasks?: number;
  mySubtasks?: number;
}

/**
 * Збирає невиконані пункти плану для людини.
 *
 * Правила, щоб не було дублів і шуму:
 *  - виконані задачі й підзавдання не показуємо;
 *  - підзавдання виконаної задачі не показуємо;
 *  - моє підзавдання в моїй же задачі окремим рядком лише тоді, коли в нього
 *    свій термін; інакше воно вже враховано в самій задачі (лічильник «мої»);
 *  - підзавдання без терміну бере термін задачі, і це позначено.
 */
export function buildPlanItems(cards: readonly PlanCardLike[], userId: string): PlanItem[] {
  const items: PlanItem[] = [];

  for (const card of cards) {
    if (card.isCompleted) continue;
    const mine = card.assigneeId === userId;
    const subs = card.subtasks || [];
    const myOpenSubs = subs.filter(s => s.assigneeId === userId && !s.completed);

    if (mine) {
      items.push({
        id: `card:${card.id}`,
        kind: 'card',
        cardId: card.id,
        title: card.title,
        deadline: card.deadline,
        isCompleted: false,
        assigneeId: card.assigneeId,
        order: card.order,
        openSubtasks: subs.filter(s => !s.completed).length,
        mySubtasks: myOpenSubs.length,
      });
    }

    for (const st of myOpenSubs) {
      if (mine && !st.deadline) continue;
      items.push({
        id: `sub:${card.id}:${st.id}`,
        kind: 'subtask',
        cardId: card.id,
        subtaskId: st.id,
        parentTitle: card.title,
        title: st.title,
        deadline: st.deadline || card.deadline,
        inheritedDeadline: !st.deadline,
        isCompleted: false,
        assigneeId: userId,
        order: card.order,
      });
    }
  }

  return items;
}

export interface PlanSummary {
  tasks: number;
  subtasks: number;
  overdue: number;
  today: number;
}

export function summarizePlan(items: readonly PlanItem[], bucketOfItem: (i: PlanItem) => string): PlanSummary {
  let tasks = 0, subtasks = 0, overdue = 0, today = 0;
  for (const i of items) {
    if (i.kind === 'card') tasks++; else subtasks++;
    const b = bucketOfItem(i);
    if (b === 'overdue') overdue++;
    if (b === 'today') today++;
  }
  return { tasks, subtasks, overdue, today };
}

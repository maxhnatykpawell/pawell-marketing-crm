/**
 * Проєкти, до яких давно ніхто не торкався.
 *
 * Задача рідко «зупиняється» явно — вона просто перестає рухатись, і помічають
 * це вже тоді, коли дедлайн проєкту позаду. Тут рахується одна річ: коли
 * востаннє в проєкті хоч щось відбувалось. Якщо мовчать усі незавершені
 * задачі, і мовчать довше за поріг — відповідальному варто про це сказати.
 *
 * «Увага до задачі» — це будь-яка зміна картки: її перенесли, перейменували,
 * переставили дати, закрили підзадачу, залишили коментар. Усе це пише
 * updatedAt, тож окремого поняття активності заводити не довелось.
 *
 * Рішення живе тут, окремо від розсилки: сказати, які проєкти замовкли, можна
 * без Telegram, бази й крона — а отже, і перевірити це можна звичайним тестом.
 */
import { Card, Project } from '../types';

/** Скільки повних діб минуло від дати до моменту. */
export function daysSince(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 0;
  return Math.floor((now.getTime() - then) / 86400000);
}

/**
 * Коли до задачі востаннє торкались.
 *
 * Коментар рахуємо нарівні зі зміною картки: обговорення — це теж увага, а в
 * старих картках, які ще жодного разу не редагували після оновлення, він може
 * бути єдиним слідом життя.
 */
export function lastTouchedAt(card: Pick<Card, 'updatedAt' | 'comments'>): string | null {
  const stamps = [
    ...(card.updatedAt ? [card.updatedAt] : []),
    ...(card.comments || []).map(c => c.createdAt).filter(Boolean),
  ];
  if (stamps.length === 0) return null;
  return stamps.reduce((latest, s) => (s > latest ? s : latest));
}

export interface IdleProject {
  project: Project;
  /** Найсвіжіший слід життя серед незавершених задач */
  lastTouchedAt: string;
  /** Скільки діб проєкт мовчить */
  days: number;
  /** Скільки незавершених задач стоїть */
  taskCount: number;
  /** Кому казати: власник, а якщо його немає — менеджери */
  recipientIds: string[];
}

/** Кому адресувати новину про проєкт. */
export function idleRecipients(project: Pick<Project, 'ownerId' | 'managerIds'>): string[] {
  if (project.ownerId) return [project.ownerId];
  return [...new Set((project.managerIds || []).filter(Boolean))];
}

/**
 * Проєкти, які мовчать довше за поріг.
 *
 * Умови навмисно жорсткі — сповіщення, яке приходить дарма, вимикають разом з
 * усіма іншими:
 *
 * — завершений проєкт і проєкт на паузі не турбуємо: там тиша очікувана;
 * — рахуємо лише незавершені задачі, бо проєкт, де все зроблено, не занедбаний;
 * — проєкт без жодної незавершеної задачі пропускаємо: нема про що нагадувати;
 * — задача без жодного сліду життя робить проєкт «невідомим», а не «занедбаним»:
 *   краще промовчати, ніж збрехати;
 * — і, нагадавши раз, мовчимо ще один такий самий період — інакше нагадування
 *   приходило б щодня, доки проєкт не зрушить.
 */
export function findIdleProjects(
  projects: Project[],
  cards: Card[],
  now: Date,
  idleDays: number,
): IdleProject[] {
  if (!(idleDays > 0)) return [];
  const result: IdleProject[] = [];

  for (const project of projects) {
    if (project.status === 'completed' || project.status === 'on-hold') continue;

    const open = cards.filter(c => c.projectId === project.id && !c.isCompleted);
    if (open.length === 0) continue;

    const touches = open.map(lastTouchedAt);
    if (touches.some(t => !t)) continue;

    // Найсвіжіший слід і визначає тишу: якщо хоч одну задачу рухали вчора,
    // проєкт живий, хай навіть решта стоїть місяцями.
    const latest = (touches as string[]).reduce((a, b) => (b > a ? b : a));
    const days = daysSince(latest, now);
    if (days < idleDays) continue;

    if (project.lastIdleNotifiedAt && daysSince(project.lastIdleNotifiedAt, now) < idleDays) continue;

    const recipientIds = idleRecipients(project);
    if (recipientIds.length === 0) continue;

    result.push({ project, lastTouchedAt: latest, days, taskCount: open.length, recipientIds });
  }

  return result;
}

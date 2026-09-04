/**
 * Доступ до проєктів.
 *
 * Проєкт може бути відкритим або закритим, і вирішує це один-єдиний факт —
 * чи додали до нього когось поіменно. Порожній список учасників означає
 * «проєкт спільний, бачать усі»: інакше після оновлення вся команда враз
 * втратила б доступ до всього, що вже є в системі, і працювати стало б
 * неможливо, доки адмін не пройде руками кожен проєкт. Щойно до проєкту
 * додали першого учасника — він закривається, і це свідомий жест людини, а не
 * побічний ефект оновлення.
 *
 * Доступ мають адміністратор, власник, менеджери й учасники. Менеджери
 * потрапляють сюди без окремої дії: людина, яка веде проєкт, очевидно має його
 * бачити, і змушувати адміна дублювати її ще й в учасниках — зайвий крок, у
 * якому легко помилитись.
 *
 * Правило живе тут, а не в компонентах, бо його питають з різних боків:
 * список проєктів, дошка, діаграма Ганта, календар і асистент. Один опис —
 * один набір відповідей.
 */
import { AppState, Card, Project } from '../types';

/** Кого питаємо про доступ. Роль 'admin' відмикає все. */
export interface AccessSubject {
  userId: string;
  role?: string;
}

/** Частина проєкту, якої достатньо, щоб відповісти про доступ. */
type ProjectAccessFields = Pick<Project, 'ownerId' | 'managerIds' | 'memberIds'>;

/**
 * Чи закритий проєкт.
 *
 * Дивимось лише на memberIds: власник і менеджери є майже в кожного проєкту з
 * історії, тож рахувати їх ознакою закритості означало б закрити геть усе.
 */
export function isProjectRestricted(project: ProjectAccessFields): boolean {
  return (project.memberIds?.length ?? 0) > 0;
}

/** Усі, хто має доступ поіменно, без повторів і в передбачуваному порядку. */
export function projectAccessIds(project: ProjectAccessFields): string[] {
  const ids = [
    ...(project.ownerId ? [project.ownerId] : []),
    ...(project.managerIds || []),
    ...(project.memberIds || []),
  ];
  return [...new Set(ids.filter(Boolean))];
}

export function canAccessProject(project: ProjectAccessFields, subject: AccessSubject): boolean {
  if (subject.role === 'admin') return true;
  if (!isProjectRestricted(project)) return true;
  return projectAccessIds(project).includes(subject.userId);
}

/**
 * Хто змінює склад доступу: адміністратор і власник.
 *
 * У проєкта з власником менеджера тут немає навмисно: менеджер веде роботу,
 * але роздавати доступ — рішення того, чий це проєкт.
 *
 * Проєкт без власника — нічий, і його налаштовує будь-хто з менеджерів. Так
 * зроблено заради проєктів, створених до появи власників: інакше вони
 * назавжди лишились би без способу змінити доступ, бо власника нема кому
 * призначити. Менеджер і без того може такий проєкт перейменувати й видалити,
 * тож нового рівня довіри тут не з'являється.
 */
export function canManageProjectAccess(project: ProjectAccessFields, subject: AccessSubject): boolean {
  if (subject.role === 'admin') return true;
  if (project.ownerId) return project.ownerId === subject.userId;
  return (project.managerIds || []).includes(subject.userId);
}

export function accessibleProjects<T extends ProjectAccessFields>(projects: T[], subject: AccessSubject): T[] {
  return projects.filter(p => canAccessProject(p, subject));
}

/**
 * Картки, які людині видно.
 *
 * Картка без проєкту — спільна робота дошки, її бачать усі: закривати треба
 * проєкти, а не дошку. Картка, що посилається на видалений проєкт, теж
 * лишається видимою — сирота не має тихо зникати з дошки разом із проєктом,
 * якого вже немає.
 */
export function accessibleCards<C extends Pick<Card, 'projectId'>>(
  cards: C[],
  projects: (ProjectAccessFields & { id: string })[],
  subject: AccessSubject,
): C[] {
  const closed = new Set(
    projects.filter(p => !canAccessProject(p, subject)).map(p => p.id),
  );
  if (closed.size === 0) return cards;
  return cards.filter(c => !c.projectId || !closed.has(c.projectId));
}

/**
 * Стан застосунку очима конкретної людини.
 *
 * Викликається один раз — там, де стан лягає в контекст, — і далі кожен
 * компонент читає вже звужений список. Так закритий проєкт зникає одразу
 * звідусіль: з проєктів, дошки, діаграми, календаря й головної, — і жоден
 * новий екран не доведеться згадувати окремо.
 *
 * Решта стану лишається як є: люди, теги, події й налаштування до проєктів не
 * прив'язані.
 */
export function scopeStateToUser<T extends Pick<AppState, 'projects' | 'cards'>>(
  state: T,
  subject: AccessSubject,
): T {
  const projects = state.projects || [];
  const visible = accessibleProjects(projects, subject);
  if (visible.length === projects.length) return state;
  return {
    ...state,
    projects: visible,
    cards: accessibleCards(state.cards || [], projects, subject),
  };
}

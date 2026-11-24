/**
 * Власний порядок колонок-етапів для окремого проєкту.
 *
 * Колонки (List) спільні для всієї дошки, а їхній «шаблонний» порядок задає
 * поле order. Проєкт може мати власний порядок — масив id колонок. Він
 * зберігається в проєкті й не впливає ні на дошку, ні на інші проєкти.
 */

interface OrderedList { id: string; order: number }

/** Колонки у порядку проєкту. Невідомі id ігноруються, нові колонки (яких немає в списку) йдуть у кінець за шаблонним порядком. */
export function applyProjectListOrder<T extends OrderedList>(lists: readonly T[], projectOrder?: readonly string[] | null): T[] {
  const base = [...lists].sort((a, b) => a.order - b.order);
  if (!projectOrder || projectOrder.length === 0) return base;
  const rank = new Map(projectOrder.map((id, i) => [id, i]));
  const known = base.filter(l => rank.has(l.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const rest = base.filter(l => !rank.has(l.id));
  return [...known, ...rest];
}

/** Новий порядок id після перетягування колонки `draggedId` на місце `targetId`. */
export function reorderListIds(currentIds: string[], draggedId: string, targetId: string): string[] {
  const from = currentIds.indexOf(draggedId);
  const to = currentIds.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return currentIds;
  const next = [...currentIds];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

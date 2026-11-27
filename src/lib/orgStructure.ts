/**
 * Структура відділу: чиста логіка дерева посад.
 *
 * Тут немає React і мережі — лише те, що можна перевірити тестом: побудова
 * дерева, захист від циклів при перетягуванні, колір гілки, видалення без
 * втрати підлеглих.
 */
import type { OrgPosition } from '../types';

export interface OrgNode {
  position: OrgPosition;
  children: OrgNode[];
  /** Глибина від кореня гілки: корінь = 0 */
  depth: number;
}

export const BRANCH_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04', '#475569'];

const byOrder = (a: OrgPosition, b: OrgPosition) =>
  a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * Будує ліс гілок. Посада, чий батько зник (видалений в іншій вкладці, битий
 * запис), не губиться, а стає вершиною власної гілки — краще побачити її
 * зайвим коренем, ніж не побачити взагалі.
 */
export function buildForest(positions: OrgPosition[]): OrgNode[] {
  const ids = new Set(positions.map(p => p.id));
  const kids = new Map<string | null, OrgPosition[]>();
  for (const p of positions) {
    const key = p.parentId && ids.has(p.parentId) && p.parentId !== p.id ? p.parentId : null;
    const list = kids.get(key) ?? [];
    list.push(p);
    kids.set(key, list);
  }
  const seen = new Set<string>();
  const make = (p: OrgPosition, depth: number): OrgNode => {
    seen.add(p.id);
    const children = (kids.get(p.id) ?? [])
      .filter(c => !seen.has(c.id)) // страховка від циклу в даних
      .sort(byOrder)
      .map(c => make(c, depth + 1));
    return { position: p, children, depth };
  };
  const roots = (kids.get(null) ?? []).sort(byOrder).map(r => make(r, 0));
  // Цикл без кореня (A→B→A) не досяжний зверху — піднімаємо його вручну
  for (const p of [...positions].sort(byOrder)) {
    if (!seen.has(p.id)) roots.push(make(p, 0));
  }
  return roots;
}

/** id посади і всіх її підлеглих на будь-якій глибині */
export function subtreeIds(positions: OrgPosition[], rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of positions) {
      if (p.parentId && out.has(p.parentId) && !out.has(p.id)) {
        out.add(p.id);
        grew = true;
      }
    }
  }
  return out;
}

/**
 * Чи можна підпорядкувати `id` посаді `newParentId` (null — зробити вершиною).
 * Не можна: самій собі й власному підлеглому — вийшов би цикл.
 */
export function canReparent(positions: OrgPosition[], id: string, newParentId: string | null): boolean {
  if (newParentId === null) return true;
  if (!positions.some(p => p.id === id) || !positions.some(p => p.id === newParentId)) return false;
  return !subtreeIds(positions, id).has(newParentId);
}

/** Колір гілки: власний, інакше найближчого предка, інакше перший зі стандартних */
export function branchColor(positions: OrgPosition[], id: string): string {
  const byId = new Map(positions.map(p => [p.id, p]));
  let cur = byId.get(id);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    if (cur.color) return cur.color;
    guard.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return BRANCH_COLORS[0];
}

/** Наступний order серед братів — нова посада йде в кінець рівня */
export function nextOrder(positions: OrgPosition[], parentId: string | null): number {
  const siblings = positions.filter(p => (p.parentId ?? null) === parentId);
  return siblings.length ? Math.max(...siblings.map(p => p.order)) + 1 : 0;
}

/**
 * Що змінити в інших посадах, коли видаляють `id`: його підлеглі піднімаються
 * на рівень вище (до батька видаленого), а не пропадають разом із ним.
 */
export function reparentOnDelete(
  positions: OrgPosition[],
  id: string,
): { id: string; parentId: string | null; order: number }[] {
  const target = positions.find(p => p.id === id);
  if (!target) return [];
  const newParent = target.parentId ?? null;
  let order = nextOrder(positions.filter(p => p.id !== id), newParent);
  return positions
    .filter(p => p.parentId === id)
    .sort(byOrder)
    .map(p => ({ id: p.id, parentId: newParent, order: order++ }));
}

/**
 * Зсув посади на одну позицію серед посад того ж рівня. Повертає нові `order`
 * для всіх братів (перенумерованих підряд), або [] — якщо рухатись нікуди.
 * Нумерація підряд потрібна, бо в старих записів `order` може збігатись.
 */
export function moveAmongSiblings(
  positions: OrgPosition[],
  id: string,
  dir: -1 | 1,
): { id: string; order: number }[] {
  const target = positions.find(p => p.id === id);
  if (!target) return [];
  const parentId = target.parentId ?? null;
  const siblings = positions.filter(p => (p.parentId ?? null) === parentId).sort(byOrder);
  const from = siblings.findIndex(p => p.id === id);
  const to = from + dir;
  if (to < 0 || to >= siblings.length) return [];
  const next = [...siblings];
  [next[from], next[to]] = [next[to], next[from]];
  return next.map((p, i) => ({ id: p.id, order: i }));
}

/** Скільки документів прикріплено до посади — для значка на картці */
export function docCount(p: Pick<OrgPosition, 'regulations' | 'instructions'>): number {
  return (p.regulations?.length ?? 0) + (p.instructions?.length ?? 0);
}

/** Скільки посад усього в піддереві, без самої посади */
export function descendantCount(node: OrgNode): number {
  return node.children.reduce((n, c) => n + 1 + descendantCount(c), 0);
}

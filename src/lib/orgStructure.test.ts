import assert from 'node:assert/strict';
import type { OrgPosition } from '../types';
import {
  buildForest, subtreeIds, canReparent, branchColor, nextOrder, reparentOnDelete, moveAmongSiblings, docCount, descendantCount, BRANCH_COLORS,
} from './orgStructure';

const pos = (id: string, parentId: string | null, order = 0, extra: Partial<OrgPosition> = {}): OrgPosition => ({
  id, title: id, parentId, userId: null, order,
  regulations: [], instructions: [], createdAt: '2026-01-01T00:00:00Z', ...extra,
});

//        head            (окрема гілка) design
//       /    \                              |
//    smm    seo                          art
//     |
//   copy
const all = [pos('head', null), pos('smm', 'head', 0), pos('seo', 'head', 1), pos('copy', 'smm'), pos('design', null, 1), pos('art', 'design')];

const forest = buildForest(all);
assert.deepEqual(forest.map(n => n.position.id), ['head', 'design']);
assert.deepEqual(forest[0].children.map(n => n.position.id), ['smm', 'seo']);
assert.equal(forest[0].children[0].children[0].depth, 2);
assert.equal(descendantCount(forest[0]), 3);

// порядок серед братів береться з order, а не з порядку в масиві
assert.deepEqual(buildForest([pos('r', null), pos('b', 'r', 2), pos('a', 'r', 1)])[0].children.map(n => n.position.id), ['a', 'b']);

// осиротіла посада стає вершиною гілки, а не зникає
assert.deepEqual(buildForest([pos('x', 'gone')]).map(n => n.position.id), ['x']);

// цикл у даних не підвішує побудову й нічого не губить
const cyc = buildForest([pos('a', 'b'), pos('b', 'a')]);
assert.equal(cyc.length, 1);
assert.equal(descendantCount(cyc[0]), 1);

assert.deepEqual([...subtreeIds(all, 'smm')].sort(), ['copy', 'smm']);

assert.equal(canReparent(all, 'smm', 'seo'), true);
assert.equal(canReparent(all, 'smm', 'copy'), false); // власному підлеглому
assert.equal(canReparent(all, 'smm', 'smm'), false);  // самому собі
assert.equal(canReparent(all, 'copy', null), true);
assert.equal(canReparent(all, 'smm', 'nope'), false);

// колір: власний → найближчого предка → типовий
const colored = [pos('r', null, 0, { color: '#111111' }), pos('c', 'r'), pos('g', 'c', 0, { color: '#222222' }), pos('h', 'g'), pos('free', null)];
assert.equal(branchColor(colored, 'c'), '#111111');
assert.equal(branchColor(colored, 'h'), '#222222');
assert.equal(branchColor(colored, 'free'), BRANCH_COLORS[0]);

assert.equal(nextOrder(all, 'head'), 2);
assert.equal(nextOrder(all, 'seo'), 0);
assert.equal(nextOrder(all, null), 2);

// видалення smm: copy піднімається до head і стає після seo
assert.deepEqual(reparentOnDelete(all, 'smm'), [{ id: 'copy', parentId: 'head', order: 2 }]);
// видалення кореня: підлеглі стають самостійними гілками
assert.deepEqual(reparentOnDelete(all, 'design'), [{ id: 'art', parentId: null, order: 1 }]);
assert.deepEqual(reparentOnDelete(all, 'unknown'), []);

// зсув серед братів: smm(0) ↔ seo(1)
assert.deepEqual(moveAmongSiblings(all, 'smm', 1), [{ id: 'seo', order: 0 }, { id: 'smm', order: 1 }]);
assert.deepEqual(moveAmongSiblings(all, 'smm', -1), []); // уже перший
assert.deepEqual(moveAmongSiblings(all, 'seo', 1), []);  // уже останній
assert.deepEqual(moveAmongSiblings(all, 'copy', 1), []); // єдиний на рівні
// однакові order у старих записах не ламають зсув
const ties = [pos('r', null), pos('a', 'r', 0, { createdAt: '2026-01-01T00:00:01Z' }), pos('b', 'r', 0, { createdAt: '2026-01-01T00:00:02Z' })];
assert.deepEqual(moveAmongSiblings(ties, 'a', 1), [{ id: 'b', order: 0 }, { id: 'a', order: 1 }]);

assert.equal(docCount({ regulations: [{ id: '1', name: 'a', url: 'u', kind: 'link' }], instructions: [] }), 1);

console.log('orgStructure tests passed');

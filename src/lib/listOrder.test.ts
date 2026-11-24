import assert from 'node:assert/strict';
import { applyProjectListOrder, reorderListIds } from './listOrder';

const lists = [{ id: 'a', order: 0 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }];
const ids = (l: { id: string }[]) => l.map(x => x.id).join('');

assert.equal(ids(applyProjectListOrder(lists)), 'abc');
assert.equal(ids(applyProjectListOrder(lists, [])), 'abc');
assert.equal(ids(applyProjectListOrder(lists, ['c', 'a', 'b'])), 'cab');
// видалена колонка ігнорується, нова йде в кінець
assert.equal(ids(applyProjectListOrder(lists, ['c', 'x', 'a'])), 'cab');
// вхідний масив не мутується
assert.equal(ids(lists), 'abc');

assert.deepEqual(reorderListIds(['a', 'b', 'c'], 'a', 'c'), ['b', 'c', 'a']);
assert.deepEqual(reorderListIds(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b']);
assert.deepEqual(reorderListIds(['a', 'b'], 'a', 'zz'), ['a', 'b']);

console.log('listOrder tests passed');

import { visibleProjectLists, projectListTitle } from './listOrder';
{
  const ls = [{ id: 'a', order: 0 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }];
  const idsOf = (l: { id: string }[]) => l.map(x => x.id).join('');
  assert.equal(idsOf(visibleProjectLists(ls, { hiddenListIds: ['b'] })), 'ac');
  assert.equal(idsOf(visibleProjectLists(ls, { listOrder: ['c', 'a', 'b'], hiddenListIds: ['a'] })), 'cb');
  assert.equal(idsOf(visibleProjectLists(ls, null)), 'abc');
  assert.equal(projectListTitle({ id: 'a', title: 'В роботі' }, { listTitles: { a: 'У виробництві' } }), 'У виробництві');
  assert.equal(projectListTitle({ id: 'a', title: 'В роботі' }, { listTitles: { a: '  ' } }), 'В роботі');
  assert.equal(projectListTitle({ id: 'a', title: 'В роботі' }, null), 'В роботі');
  console.log('listOrder project-scope tests passed');
}

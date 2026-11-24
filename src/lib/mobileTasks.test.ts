import assert from 'node:assert/strict';
import { bucketOf, filterTasks, groupTasks, countByBucket, deadlineLabel, daysBetween } from './mobileTasks';

const TODAY = '2026-11-24';
const mk = (id: string, deadline: string | null, extra: Partial<{ isCompleted: boolean; assigneeId: string | null; order: number; title: string }> = {}) => ({
  id, title: extra.title ?? id, deadline, isCompleted: extra.isCompleted, assigneeId: extra.assigneeId ?? null, order: extra.order ?? 0,
});

// ── дні між ключами, включно з переходом місяця й року
assert.equal(daysBetween('2026-11-24', '2026-11-25'), 1);
assert.equal(daysBetween('2026-11-30', '2026-12-01'), 1);
assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
assert.equal(daysBetween('2026-11-24', '2026-11-20'), -4);

// ── кошики
assert.equal(bucketOf(mk('a', '2026-11-23T00:00:00.000Z'), TODAY), 'overdue');
assert.equal(bucketOf(mk('a', '2026-11-24T00:00:00.000Z'), TODAY), 'today');
assert.equal(bucketOf(mk('a', '2026-11-25'), TODAY), 'tomorrow');
assert.equal(bucketOf(mk('a', '2026-11-26'), TODAY), 'week');
assert.equal(bucketOf(mk('a', '2026-12-01'), TODAY), 'week');   // рівно +7 днів
assert.equal(bucketOf(mk('a', '2026-12-02'), TODAY), 'later');  // +8
assert.equal(bucketOf(mk('a', null), TODAY), 'none');
// виконана задача — завжди «Виконані», навіть прострочена
assert.equal(bucketOf(mk('a', '2026-01-01', { isCompleted: true }), TODAY), 'done');

// ── фільтри
const cards = [
  mk('1', '2026-11-24', { assigneeId: 'me', title: 'Подарунки для команди' }),
  mk('2', null, { assigneeId: 'other', title: 'Дерева виконавців' }),
  mk('3', '2026-11-20', { assigneeId: 'me', isCompleted: true, title: 'Готово' }),
];
assert.deepEqual(filterTasks(cards, { assigneeId: 'me' }).map(c => c.id), ['1']);                    // виконані приховано
assert.deepEqual(filterTasks(cards, { assigneeId: 'me', includeDone: true }).map(c => c.id), ['1', '3']);
assert.deepEqual(filterTasks(cards, { query: '  ДЕРЕВА ' }).map(c => c.id), ['2']);                  // регістр і пробіли
assert.deepEqual(filterTasks(cards, {}).map(c => c.id), ['1', '2']);

// ── групи: порядок груп, порожні відсутні, сортування всередині
const g = groupTasks([
  mk('later', '2027-01-01'),
  mk('t2', '2026-11-24', { order: 2 }),
  mk('t1', '2026-11-24', { order: 1 }),
  mk('over', '2026-11-10'),
  mk('none', null),
], TODAY);
assert.deepEqual(g.map(x => x.key), ['overdue', 'today', 'later', 'none']);
assert.deepEqual(g.find(x => x.key === 'today')!.cards.map(c => c.id), ['t1', 't2']);
assert.equal(g[0].label, 'Прострочені');

// ── лічильники
const n = countByBucket([mk('a', '2026-11-24'), mk('b', '2026-11-24'), mk('c', null)], TODAY);
assert.equal(n.today, 2); assert.equal(n.none, 1); assert.equal(n.overdue, 0);

// ── підписи
assert.equal(deadlineLabel('2026-11-24', TODAY), 'Сьогодні');
assert.equal(deadlineLabel('2026-11-25', TODAY), 'Завтра');
assert.equal(deadlineLabel('2026-11-23', TODAY), 'Вчора');
assert.equal(deadlineLabel('2026-11-20', TODAY), '4 дн. тому');
assert.equal(deadlineLabel('2026-12-05', TODAY), '5 груд');
assert.equal(deadlineLabel('2026-09-01', TODAY), '1 вер');   // давно минуле — дата, а не «80 дн. тому»
assert.equal(deadlineLabel(null, TODAY), '');

console.log('mobileTasks tests passed');

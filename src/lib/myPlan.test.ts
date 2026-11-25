import assert from 'node:assert/strict';
import { buildPlanItems, summarizePlan } from './myPlan';
import { bucketOf, groupTasks } from './mobileTasks';

const ME = 'me';
const TODAY = '2026-11-25';
const card = (id: string, extra: any = {}) => ({
  id, title: id, deadline: null, assigneeId: null, order: 0, subtasks: [], ...extra,
});

const cards = [
  // моя задача з моїм підзавданням без терміну (не дублюється) і з терміном (окремий рядок)
  card('A', {
    assigneeId: ME, deadline: '2026-11-30',
    subtasks: [
      { id: 'a1', title: 'без терміну', completed: false, assigneeId: ME },
      { id: 'a2', title: 'зі строком', completed: false, assigneeId: ME, deadline: '2026-11-25' },
      { id: 'a3', title: 'чуже', completed: false, assigneeId: 'other' },
      { id: 'a4', title: 'зроблене', completed: true, assigneeId: ME, deadline: '2026-11-20' },
    ],
  }),
  // чужа задача, де мене призначили на підзавдання без терміну: бере термін задачі
  card('B', {
    assigneeId: 'other', deadline: '2026-11-26',
    subtasks: [{ id: 'b1', title: 'допомогти', completed: false, assigneeId: ME }],
  }),
  // виконана задача: нічого не показуємо, навіть моє підзавдання
  card('C', {
    assigneeId: ME, isCompleted: true,
    subtasks: [{ id: 'c1', title: 'x', completed: false, assigneeId: ME }],
  }),
  // чужа без моїх підзавдань
  card('D', { assigneeId: 'other', subtasks: [{ id: 'd1', title: 'y', completed: false, assigneeId: 'other' }] }),
];

const items = buildPlanItems(cards, ME);
assert.deepEqual(items.map(i => i.id), ['card:A', 'sub:A:a2', 'sub:B:b1']);

const a = items.find(i => i.id === 'card:A')!;
assert.equal(a.mySubtasks, 2);       // a1 і a2 — обидва мої й невиконані
assert.equal(a.openSubtasks, 3);     // a1, a2, a3

const b1 = items.find(i => i.id === 'sub:B:b1')!;
assert.equal(b1.deadline, '2026-11-26');
assert.equal(b1.inheritedDeadline, true);
assert.equal(b1.parentTitle, 'B');

// групування з існуючою логікою: підзавдання a2 — сьогодні, b1 — завтра
const g = groupTasks(items, TODAY);
assert.deepEqual(g.map(x => x.key), ['today', 'tomorrow', 'week']);
assert.deepEqual(g.find(x => x.key === 'today')!.cards.map(c => c.id), ['sub:A:a2']);

const s = summarizePlan(items, i => bucketOf(i, TODAY));
assert.deepEqual(s, { tasks: 1, subtasks: 2, overdue: 0, today: 1 });

console.log('myPlan tests passed');

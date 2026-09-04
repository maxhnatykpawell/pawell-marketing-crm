import { doneListIds, isCardDone, projectProgress } from './projectProgress';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

const list = (id: string, order: number, boardId?: string) => ({ id, order, boardId } as any);
const card = (over: any = {}) => ({ listId: 'todo', ...over } as any);

/** Одна дошка: Треба → В роботі → Готово */
const lists = [list('todo', 0, 'b1'), list('doing', 1, 'b1'), list('done', 2, 'b1')];

console.log('\nОстанні колонки');
check('одна дошка — одна остання колонка', [...doneListIds(lists)], ['done']);
check('у кожної дошки своя остання',
  [...doneListIds([...lists, list('x', 0, 'b2'), list('y', 5, 'b2')])].sort(), ['done', 'y']);
// Порядок у масиві не гарантований — останню шукаємо за order, а не за позицією
check('порядок у масиві не важить',
  [...doneListIds([list('done', 2, 'b1'), list('todo', 0, 'b1'), list('doing', 1, 'b1')])], ['done']);
check('списки без boardId — одна спільна дошка',
  [...doneListIds([list('a', 0), list('b', 1)])], ['b']);
check('колонок немає', [...doneListIds([])], []);

console.log('\nЧи задача зроблена');
const doneIds = doneListIds(lists);
check('галочка', isCardDone(card({ isCompleted: true }), doneIds), true);
check('лежить у останній колонці', isCardDone(card({ listId: 'done' }), doneIds), true);
// Саме це плитка й губила: галочка стоїть, а картка ще в роботі
check('галочка поза останньою колонкою',
  isCardDone(card({ listId: 'doing', isCompleted: true }), doneIds), true);
check('ні галочки, ні останньої колонки', isCardDone(card({ listId: 'doing' }), doneIds), false);
check('isCompleted: false не скасовує останню колонку',
  isCardDone(card({ listId: 'done', isCompleted: false }), doneIds), true);

console.log('\nПрогрес проєкту');
check('задач немає', projectProgress([], doneIds), { total: 0, done: 0, percent: 0 });
check('нічого не зроблено',
  projectProgress([card(), card()], doneIds), { total: 2, done: 0, percent: 0 });
check('половина галочками',
  projectProgress([card({ isCompleted: true }), card()], doneIds), { total: 2, done: 1, percent: 50 });
check('половина колонкою',
  projectProgress([card({ listId: 'done' }), card()], doneIds), { total: 2, done: 1, percent: 50 });
check('обидва способи разом',
  projectProgress([card({ isCompleted: true }), card({ listId: 'done' }), card()], doneIds),
  { total: 3, done: 2, percent: 67 });
check('усе зроблено',
  projectProgress([card({ isCompleted: true }), card({ listId: 'done' })], doneIds),
  { total: 2, done: 2, percent: 100 });

console.log('\nОкруглення не бреше');
// 199 із 200 — це ще не завершений проєкт, хоч Math.round і каже 100
const many = (done: number, total: number) => Array.from({ length: total },
  (_, i) => card({ isCompleted: i < done }));
check('майже все — не 100%', projectProgress(many(199, 200), doneIds).percent, 99);
check('одна з великої купи — не 0%', projectProgress(many(1, 500), doneIds).percent, 1);
check('справді все — рівно 100%', projectProgress(many(200, 200), doneIds).percent, 100);
check('справді нічого — рівно 0%', projectProgress(many(0, 200), doneIds).percent, 0);

if (failures) { console.log(`\n❌ Провалено перевірок: ${failures}`); process.exit(1); }
console.log('\n✅ Усі перевірки пройдено');

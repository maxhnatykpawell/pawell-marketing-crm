import { dedupeById } from './dedupeById';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

console.log('\nДедуплікація за id');

// Саме так виглядає зсув сторінок: id 100 лишився в кінці сторінки 1 і прийшов знову на початку сторінки 2
const drifted = [{ id: 102 }, { id: 101 }, { id: 100 }, { id: 100 }, { id: 99 }];
const r = dedupeById(drifted);
check('повтор на межі сторінок прибрано', r.items.map(x => x.id), [102, 101, 100, 99]);
check('кількість прибраних', r.removed, 1);
check('без повторів — без змін', dedupeById([{ id: 1 }, { id: 2 }]).removed, 0);
check('числовий і рядковий id — той самий запис', dedupeById([{ id: 5 }, { id: '5' }]).items.length, 1);
check('перше входження виграє', dedupeById([{ id: 1, v: 'a' }, { id: 1, v: 'b' }]).items[0], { id: 1, v: 'a' });
check('записи без id не чіпаємо', dedupeById([{ x: 1 }, { x: 1 }, { id: null }, { id: null }]).items.length, 4);
check('порожній список', dedupeById([]), { items: [], removed: 0 });

if (failures > 0) { console.log(`\n❌ Провалено: ${failures}`); process.exit(1); }
console.log('\n✅ Усі перевірки пройдено');

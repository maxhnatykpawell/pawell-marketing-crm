import { avgCheckChange, formatChange, sharePct } from './dashboardMetrics';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

console.log('\nСередній чек: зміна');
// Було 100 угод на 1 000 000 (чек 10 000); стало 120 угод на 1 080 000 (чек 9 000): −10 %
check('сума +8 %, кількість +20 % → чек −10 %', avgCheckChange(8, 20), -10);
// Сума виросла, а чек упав — саме те, що ховав старий бейдж
check('сума росте, а чек падає', (avgCheckChange(8, 20) ?? 0) < 0, true);
check('однаково — чек не змінився', avgCheckChange(15, 15), 0);
check('кількість та сума виросли вдвічі', avgCheckChange(100, 100), 0);
check('дорожчі угоди при тій самій кількості', avgCheckChange(25, 0), 25);
check('нема зміни суми — не гадаємо', avgCheckChange(null, 10), null);
check('нема зміни кількості — не гадаємо', avgCheckChange(10, undefined), null);
check('кількість упала до нуля — не ділимо', avgCheckChange(10, -100), null);

console.log('\nПідписи');
check('ріст', formatChange(8.4), '+8,4 %');
check('спад зі справжнім мінусом', formatChange(-6.8), '−6,8 %');
check('нуль без знака', formatChange(0), '0 %');
check('ціле без хвоста', formatChange(12), '+12 %');
check('частка', sharePct(1, 3), 33.3);
check('частка від нуля', sharePct(5, 0), 0);

if (failures > 0) { console.log(`\n❌ Провалено: ${failures}`); process.exit(1); }
console.log('\n✅ Усі перевірки пройдено');

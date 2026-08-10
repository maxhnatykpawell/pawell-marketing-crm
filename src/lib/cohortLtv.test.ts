import { buildCohortLtv, monthDiff } from './cohortLtv';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`);
    failures++;
  }
}

console.log('\nmonthDiff');
check('той самий місяць', monthDiff('2026-03', '2026-03'), 0);
check('через рік', monthDiff('2025-03', '2026-03'), 12);
check('через межу року', monthDiff('2025-11', '2026-02'), 3);

console.log('\nНакопичення всередині когорти');
{
  // Двоє клієнтів, обидва вперше купили в січні.
  // A: 100 у січні, 50 у березні. B: 200 у січні.
  const r = buildCohortLtv([
    { monthlyRevenue: { '2026-01': 100, '2026-03': 50 } },
    { monthlyRevenue: { '2026-01': 200 } },
  ], '2026-06');

  const jan = r.rows.find(x => x.month === '2026-01')!;
  check('одна когорта', r.rows.length, 1);
  check('розмір когорти', jan.size, 2);
  check('M0 = (100+200)/2', jan.ltvByOffset[0], 150);
  check('M1 без покупок — накопичене не падає', jan.ltvByOffset[1], 150);
  check('M2 = (300+50)/2', jan.ltvByOffset[2], 175);
  check('M3 тримає накопичене', jan.ltvByOffset[3], 175);
  check('дозріла до червня', jan.maxOffset, 5);
}

console.log('\nКогорта визначається ПЕРШОЮ покупкою');
{
  // Клієнт уперше купив у лютому, потім у травні — має бути в лютневій когорті,
  // а травнева покупка лягти на зміщення 3, а не створити нову когорту.
  const r = buildCohortLtv([
    { monthlyRevenue: { '2026-05': 500, '2026-02': 100 } },
  ], '2026-05');

  check('когорта одна', r.rows.map(x => x.month), ['2026-02']);
  check('M0 = перша покупка', r.rows[0].ltvByOffset[0], 100);
  check('M3 = накопичено обидві', r.rows[0].ltvByOffset[3], 600);
}

console.log('\nЗрілість: незріла когорта не потрапляє в горизонт');
{
  // Стара когорта прожила 12+ міс, свіжа — лише 1 міс.
  const r = buildCohortLtv([
    { monthlyRevenue: { '2025-01': 1000 } },
    { monthlyRevenue: { '2026-05': 10 } },
  ], '2026-06');

  check('LTV-3 рахує лише стару когорту', r.horizons[3]?.cohorts, 1);
  check('LTV-12 рахує лише стару когорту', r.horizons[12]?.ltv, 1000);
  check('LTV-24 ще недосяжний', r.horizons[24], null);
  check('свіжа когорта не обрізає горизонт', r.horizons[12]?.clients, 1);
}

console.log('\nЗважування за розміром когорти');
{
  // Когорта A: 3 клієнти по 100. Когорта B: 1 клієнт на 900.
  // Незважене середнє дало б (100+900)/2 = 500; зважене = (300+900)/4 = 300.
  const r = buildCohortLtv([
    { monthlyRevenue: { '2025-01': 100 } },
    { monthlyRevenue: { '2025-01': 100 } },
    { monthlyRevenue: { '2025-01': 100 } },
    { monthlyRevenue: { '2025-02': 900 } },
  ], '2026-06');

  check('зважене за розміром, не просте середнє', r.horizons[12]?.ltv, 300);
  check('охоплює всіх 4 клієнтів', r.horizons[12]?.clients, 4);
}

console.log('\nКрайні випадки');
{
  check('порожній вхід', buildCohortLtv([], '2026-06').rows, []);
  check('порожні горизонти при відсутності даних', buildCohortLtv([], '2026-06').horizons[12], null);
  check(
    'клієнт без покупок ігнорується',
    buildCohortLtv([{ monthlyRevenue: {} }], '2026-06').rows,
    [],
  );
  // Покупка з датою в майбутньому не повинна дати від'ємний maxOffset і порожню матрицю
  const future = buildCohortLtv([{ monthlyRevenue: { '2026-12': 100 } }], '2026-06');
  check('майбутня дата не ламає рядок', future.rows[0].maxOffset, 0);
  check('майбутня дата: M0 присутній', future.rows[0].ltvByOffset[0], 100);
}

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

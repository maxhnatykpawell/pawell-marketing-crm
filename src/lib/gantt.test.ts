import {
  toDayKey, toLocalDate, toStoredDate, addDays, diffDays, rangeLength, isWeekend, dayKeysBetween,
  rangeOf, spanOf, timelineBounds, shiftRange, resizeRange, rangeFromDrag, rangeToFields,
  elapsedShare, isOverdue, groupDays, shiftSchedulables,
} from './gantt';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

console.log('\nДати з бази');
check('повний ISO ріжеться до дня', toDayKey('2026-09-02T00:00:00.000Z'), '2026-09-02');
// Головна пастка: парсинг через Date зсунув би дату на добу в мінусових поясах
check('опівніч UTC лишається тим самим днем', toDayKey('2026-01-01T00:00:00.000Z'), '2026-01-01');
check('готовий ключ проходить як є', toDayKey('2026-09-02'), '2026-09-02');
check('порожнє — це відсутність дати', toDayKey(null), null);
check('сміття не стає датою', toDayKey('колись'), null);
check('назад у базу — повний ISO', toStoredDate('2026-09-02'), '2026-09-02T00:00:00.000Z');
// Підписи форматуються за місцевим часом — дата має лишитись тим самим числом
check('дата для підпису — місцева', [
  toLocalDate('2026-09-02').getFullYear(),
  toLocalDate('2026-09-02').getMonth(),
  toLocalDate('2026-09-02').getDate(),
], [2026, 8, 2]);

console.log('\nАрифметика днів');
check('через межу місяця', addDays('2026-08-31', 1), '2026-09-01');
check('назад через межу року', addDays('2027-01-01', -1), '2026-12-31');
check('високосний лютий', addDays('2028-02-28', 1), '2028-02-29');
check('різниця днів', diffDays('2026-09-02', '2026-09-05'), 3);
check('різниця назад', diffDays('2026-09-05', '2026-09-02'), -3);
// Перехід на літній час у Києві: доба «коротша», але ключі рахуються в UTC
check('переведення годинника не з\'їдає день', diffDays('2026-03-28', '2026-03-30'), 2);
check('одноденний відрізок — це один день', rangeLength({ start: '2026-09-02', end: '2026-09-02' }), 1);
check('відрізок на тиждень', rangeLength({ start: '2026-09-01', end: '2026-09-07' }), 7);
check('субота — вихідний', isWeekend('2026-09-05'), true);
check('понеділок — робочий', isWeekend('2026-09-07'), false);
check('дні відрізка включно з краями', dayKeysBetween('2026-09-01', '2026-09-03'),
  ['2026-09-01', '2026-09-02', '2026-09-03']);

console.log('\nВідрізок задачі');
check('початок і дедлайн', rangeOf({ startDate: '2026-09-01', deadline: '2026-09-04' }),
  { start: '2026-09-01', end: '2026-09-04' });
// Старі картки мають лише дедлайн — без цього половина дошки не потрапила б на діаграму
check('сам дедлайн — одноденна смужка', rangeOf({ deadline: '2026-09-04' }),
  { start: '2026-09-04', end: '2026-09-04' });
check('сам початок — теж одноденна', rangeOf({ startDate: '2026-09-04' }),
  { start: '2026-09-04', end: '2026-09-04' });
check('дати навпаки — відрізок розвертається', rangeOf({ startDate: '2026-09-09', deadline: '2026-09-02' }),
  { start: '2026-09-02', end: '2026-09-09' });
check('без дат — не планована', rangeOf({}), null);

console.log('\nЗведення відрізків');
check('охоплює всі', spanOf([
  { start: '2026-09-05', end: '2026-09-06' },
  { start: '2026-09-01', end: '2026-09-02' },
  null,
]), { start: '2026-09-01', end: '2026-09-06' });
check('нема з чого зводити', spanOf([null, undefined]), null);

console.log('\nМежі шкали');
{
  const bounds = timelineBounds([{ start: '2026-09-10', end: '2026-09-12' }], '2026-09-11', 2);
  check('поля з боків', { start: bounds.start, end: bounds.end }, { start: '2026-09-08', end: '2026-09-14' });
  check('кількість днів', bounds.days.length, 7);
}
{
  // Сьогодні завжди в кадрі: діаграма без поточного дня не показує, чи встигаємо
  const bounds = timelineBounds([{ start: '2026-12-01', end: '2026-12-02' }], '2026-09-11', 0);
  check('сьогодні лишається на шкалі', bounds.start, '2026-09-11');
}
check('порожній проєкт показує околиці сьогодні',
  timelineBounds([], '2026-09-11', 3).days.length, 7);

console.log('\nПересування смужки');
check('зсув уперед', shiftRange({ start: '2026-09-01', end: '2026-09-03' }, 2),
  { start: '2026-09-03', end: '2026-09-05' });
check('зсув назад', shiftRange({ start: '2026-09-01', end: '2026-09-03' }, -1),
  { start: '2026-08-31', end: '2026-09-02' });
check('нульовий зсув нічого не змінює', shiftRange({ start: '2026-09-01', end: '2026-09-03' }, 0),
  { start: '2026-09-01', end: '2026-09-03' });

console.log('\nРозтягування за край');
check('лівий край вліво', resizeRange({ start: '2026-09-03', end: '2026-09-05' }, 'start', -2),
  { start: '2026-09-01', end: '2026-09-05' });
check('правий край вправо', resizeRange({ start: '2026-09-03', end: '2026-09-05' }, 'end', 2),
  { start: '2026-09-03', end: '2026-09-07' });
// Краї не перестрибують один одного — від'ємної тривалості не буває
check('лівий край упирається в правий', resizeRange({ start: '2026-09-03', end: '2026-09-05' }, 'start', 10),
  { start: '2026-09-05', end: '2026-09-05' });
check('правий край упирається в лівий', resizeRange({ start: '2026-09-03', end: '2026-09-05' }, 'end', -10),
  { start: '2026-09-03', end: '2026-09-03' });

console.log('\nМалювання протягуванням');
check('вправо', rangeFromDrag('2026-09-02', '2026-09-04'), { start: '2026-09-02', end: '2026-09-04' });
check('вліво — теж відрізок', rangeFromDrag('2026-09-04', '2026-09-02'), { start: '2026-09-02', end: '2026-09-04' });
check('клік без протягування — один день', rangeFromDrag('2026-09-02', '2026-09-02'),
  { start: '2026-09-02', end: '2026-09-02' });

console.log('\nЗсув групи (зведена смужка картки)');
{
  const subtasks = [
    { id: 'a', startDate: '2026-09-01T00:00:00.000Z', deadline: '2026-09-03T00:00:00.000Z' },
    { id: 'b', deadline: '2026-09-05T00:00:00.000Z' },
    { id: 'c' },
  ];
  const moved = shiftSchedulables(subtasks, 2);
  check('відрізок їде цілим', { start: moved[0].startDate, end: moved[0].deadline },
    { start: '2026-09-03T00:00:00.000Z', end: '2026-09-05T00:00:00.000Z' });
  // Сам дедлайн — одноденна смужка, тож зсув ставить обидві дати
  check('одна дата теж їде', { start: moved[1].startDate, end: moved[1].deadline },
    { start: '2026-09-07T00:00:00.000Z', end: '2026-09-07T00:00:00.000Z' });
  check('незапланована лишається незапланованою', moved[2], { id: 'c' });
  check('нульовий зсув не чіпає нічого', shiftSchedulables(subtasks, 0), subtasks);
}

console.log('\nЗапис у поля');
check('відрізок у поля картки', rangeToFields({ start: '2026-09-02', end: '2026-09-04' }),
  { startDate: '2026-09-02T00:00:00.000Z', deadline: '2026-09-04T00:00:00.000Z' });
check('зняти планування', rangeToFields(null), { startDate: null, deadline: null });

console.log('\nПрогрес і прострочення');
{
  const range = { start: '2026-09-01', end: '2026-09-04' };
  check('ще не почалось', elapsedShare(range, '2026-08-30'), 0);
  check('перший день — чверть', elapsedShare(range, '2026-09-01'), 0.25);
  check('останній день — повністю', elapsedShare(range, '2026-09-04'), 1);
  check('після кінця не більше за одиницю', elapsedShare(range, '2026-09-20'), 1);
  check('дедлайн позаду — прострочено', isOverdue(range, '2026-09-05', false), true);
  check('виконане не прострочене', isOverdue(range, '2026-09-05', true), false);
  check('в межах строку — не прострочено', isOverdue(range, '2026-09-04', false), false);
}

console.log('\nЗаголовок шкали');
{
  const days = dayKeysBetween('2026-08-30', '2026-09-03');
  check('по місяцях', groupDays(days, 'month'),
    [{ index: 0, span: 2, key: '2026-08-30' }, { index: 2, span: 3, key: '2026-09-01' }]);
}
{
  // 2026-09-07 — понеділок: новий тиждень починається саме з нього
  const days = dayKeysBetween('2026-09-05', '2026-09-09');
  check('по тижнях, від понеділка', groupDays(days, 'week'),
    [{ index: 0, span: 2, key: '2026-09-05' }, { index: 2, span: 3, key: '2026-09-07' }]);
}
check('порожня шкала — порожній заголовок', groupDays([], 'month'), []);

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

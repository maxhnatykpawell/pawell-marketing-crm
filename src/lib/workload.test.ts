import {
  toWorkloadTasks, workingDaysOf, spreadMinutes, dailyLoad, loadLevel,
  summarize, overlapsWith, formatMinutes, durationLabel,
  DEFAULT_DAILY_CAPACITY_MINUTES, WorkloadTask,
} from './workload';
import { dayKeysBetween } from './gantt';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

/** Картка так, як вона лежить у базі: дати повним ISO */
const card = (over: any = {}) => ({
  id: 'c1', title: 'Задача', startDate: null, deadline: null, ...over,
});
const iso = (day: string) => `${day}T00:00:00.000Z`;

const task = (id: string, start: string, end: string, minutes = 0, isCompleted = false): WorkloadTask =>
  ({ id, title: id, range: { start, end }, minutes, isCompleted });

// 2026-09-07 — понеділок, 2026-09-12 — субота, 2026-09-13 — неділя

console.log('\nКартки → задачі діаграми');
check('відрізок з двох дат',
  toWorkloadTasks([card({ startDate: iso('2026-09-07'), deadline: iso('2026-09-09') })])[0].range,
  { start: '2026-09-07', end: '2026-09-09' });
// Картки, створені до планування, мають лише дедлайн — вони теж мають бути видні
check('лише дедлайн — одноденна смужка',
  toWorkloadTasks([card({ deadline: iso('2026-09-09') })])[0].range,
  { start: '2026-09-09', end: '2026-09-09' });
check('без дат — не потрапляє на шкалу', toWorkloadTasks([card({})]).length, 0);
check('оцінка переноситься',
  toWorkloadTasks([card({ deadline: iso('2026-09-09'), estimatedMinutes: 120 })])[0].minutes, 120);
check('без оцінки — нуль',
  toWorkloadTasks([card({ deadline: iso('2026-09-09') })])[0].minutes, 0);
check('від\'ємна оцінка не робить день легшим',
  toWorkloadTasks([card({ deadline: iso('2026-09-09'), estimatedMinutes: -60 })])[0].minutes, 0);

console.log('\nПорядок рядків');
const sorted = toWorkloadTasks([
  card({ id: 'c', startDate: iso('2026-09-09'), deadline: iso('2026-09-10') }),
  card({ id: 'a', startDate: iso('2026-09-07'), deadline: iso('2026-09-11') }),
  card({ id: 'b', startDate: iso('2026-09-07'), deadline: iso('2026-09-08') }),
]);
check('раніший початок вище, коротша задача вище', sorted.map(t => t.id), ['b', 'a', 'c']);

console.log('\nРобочі дні відрізка');
check('тиждень без вихідних',
  workingDaysOf({ start: '2026-09-07', end: '2026-09-11' }).length, 5);
// «З п'ятниці по понеділок» — це два дні роботи, а не чотири
check('вихідні всередині не рахуються',
  workingDaysOf({ start: '2026-09-11', end: '2026-09-14' }), ['2026-09-11', '2026-09-14']);
check('відрізок цілком у вихідних береться як є',
  workingDaysOf({ start: '2026-09-12', end: '2026-09-13' }), ['2026-09-12', '2026-09-13']);

console.log('\nРозмазування оцінки');
const spread = spreadMinutes({ start: '2026-09-07', end: '2026-09-08' }, 240);
check('240 хв на два дні', [...spread.values()], [120, 120]);
const overWeekend = spreadMinutes({ start: '2026-09-11', end: '2026-09-14' }, 240);
check('вихідні не отримують хвилин', [...overWeekend.keys()], ['2026-09-11', '2026-09-14']);
check('усі хвилини лишились у буднях', [...overWeekend.values()].reduce((a, b) => a + b, 0), 240);

console.log('\nВага дня');
const week = dayKeysBetween('2026-09-07', '2026-09-13');
const loads = dailyLoad([
  task('a', '2026-09-07', '2026-09-09', 360),   // 3 дні по 2 год
  task('b', '2026-09-08', '2026-09-08', 480),   // цілий день у вівторок
  task('c', '2026-09-09', '2026-09-11'),        // без оцінки
], week);
check('понеділок — одна задача', [loads[0].tasks, Math.round(loads[0].minutes)], [1, 120]);
check('вівторок — дві задачі', [loads[1].tasks, Math.round(loads[1].minutes)], [2, 600]);
check('середа — дві задачі, одна без оцінки',
  [loads[2].tasks, Math.round(loads[2].minutes), loads[2].unestimated], [2, 120, 1]);
check('п\'ятниця — лише задача без оцінки',
  [loads[4].tasks, Math.round(loads[4].minutes), loads[4].unestimated], [1, 0, 1]);
// Задача «висить» і у вихідні, але роботу на них не переносимо
check('субота порожня', [loads[5].tasks, loads[5].minutes], [0, 0]);
check('день поза шкалою нічого не ламає',
  dailyLoad([task('x', '2025-01-01', '2025-01-02', 60)], week).every(d => d.tasks === 0), true);

console.log('\nРівень завантаження');
check('порожній день', loadLevel(0), 'free');
check('пів дня', loadLevel(240), 'ok');
check('рівно норма', loadLevel(480), 'tight');
check('понад норму', loadLevel(481), 'over');
check('майже норма — вже тісно', loadLevel(400), 'tight');
check('три чверті — ще спокійно', loadLevel(360), 'ok');
check('своя норма', loadLevel(300, 240), 'over');
check('норма з константи', DEFAULT_DAILY_CAPACITY_MINUTES, 480);

console.log('\nЗведення');
const tasks = [
  task('a', '2026-09-07', '2026-09-09', 360),
  task('b', '2026-09-08', '2026-09-08', 480),
  task('c', '2026-09-09', '2026-09-11'),
];
const sum = summarize(tasks, dailyLoad(tasks, week));
check('усього годин', Math.round(sum.totalMinutes), 840);
check('найважчий день — вівторок', sum.peakDay?.key, '2026-09-08');
check('пік одночасних задач', sum.maxConcurrent, 2);
check('днів понад норму', sum.overloadedDays, 1);
check('задач без оцінки', sum.unestimatedTasks, 1);
check('порожня шкала — піку немає', summarize([], dailyLoad([], week)).peakDay, null);

console.log('\nЗ чим перетинається');
check('накладається краєм', overlapsWith(tasks[0], tasks).map(t => t.id), ['b', 'c']);
check('дотик в один день теж перетин', overlapsWith(tasks[2], tasks).map(t => t.id), ['a']);
check('сама з собою не перетинається',
  overlapsWith(task('a', '2026-09-07', '2026-09-09'), [task('a', '2026-09-07', '2026-09-09')]).length, 0);
check('розведені в часі не перетинаються',
  overlapsWith(task('x', '2026-09-01', '2026-09-02'), [task('x', '2026-09-01', '2026-09-02'), task('y', '2026-09-05', '2026-09-06')]).length, 0);

console.log('\nПідписи');
check('години й хвилини', formatMinutes(150), '2 год 30 хв');
check('рівні години', formatMinutes(120), '2 год');
check('менше години', formatMinutes(45), '45 хв');
check('дробове округлюється', formatMinutes(119.6), '2 год');
check('нуль — прочерк', formatMinutes(0), '—');
check('один день', durationLabel({ start: '2026-09-07', end: '2026-09-07' }), '1 день');
check('три дні', durationLabel({ start: '2026-09-07', end: '2026-09-09' }), '3 дні');
check('сім днів', durationLabel({ start: '2026-09-07', end: '2026-09-13' }), '7 днів');

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

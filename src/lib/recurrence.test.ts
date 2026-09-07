import {
  validateSchedule, toCronExpression, isDue, nextRunAt,
  describeSchedule, describeNextRun, calendarDay, daysInMonth,
  RecurrenceSchedule,
} from './recurrence';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

const s = (over: Partial<RecurrenceSchedule>): RecurrenceSchedule =>
  ({ mode: 'daily', time: '09:00', ...over } as RecurrenceSchedule);

/** Мить за київським часом — усі розклади живуть саме в ньому */
const kyiv = (iso: string) => new Date(iso);

console.log('\nПеревірка розкладу');
check('щоденний — усе гаразд', validateSchedule(s({})), null);
check('порожній розклад', validateSchedule(null), 'Розклад не заданий');
check('час не той', validateSchedule(s({ time: '9:00' })), 'Час має бути у форматі ГГ:ХХ');
check('25 година', validateSchedule(s({ time: '25:00' })), 'Час має бути у форматі ГГ:ХХ');
check('тиждень без днів', validateSchedule(s({ mode: 'weekly', days: [] })), 'Оберіть хоча б один день тижня');
check('тиждень із днем 7', validateSchedule(s({ mode: 'weekly', days: [7] })), 'Некоректний день тижня');
check('місяць без числа', validateSchedule(s({ mode: 'monthly' })), 'Число місяця — від 1 до 31');
check('місяць 32 числа', validateSchedule(s({ mode: 'monthly', dayOfMonth: 32 })), 'Число місяця — від 1 до 31');
check('інтервал 0 днів', validateSchedule(s({ mode: 'interval', intervalDays: 0 })), 'Інтервал — від 1 до 365 днів');
check('інтервал 3 дні', validateSchedule(s({ mode: 'interval', intervalDays: 3 })), null);

console.log('\nCron-вираз будильника');
check('щодня', toCronExpression(s({ time: '09:30' })), '30 9 * * *');
check('по Пн і Пт', toCronExpression(s({ mode: 'weekly', time: '08:00', days: [5, 1] })), '0 8 * * 1,5');
check('15 числа', toCronExpression(s({ mode: 'monthly', time: '10:00', dayOfMonth: 15 })), '0 10 15 * *');
// 31 числа cron сам по собі пропустив би короткі місяці — тому будимось ширше
check('31 числа будиться з 28-го', toCronExpression(s({ mode: 'monthly', time: '10:00', dayOfMonth: 31 })), '0 10 28,29,30,31 * *');
check('кожні N днів будиться щодня', toCronExpression(s({ mode: 'interval', time: '07:15', intervalDays: 5 })), '15 7 * * *');

console.log('\nЧи час створювати картку');
// 2026-09-07 — понеділок
check('щодня — завжди', isDue(s({}), kyiv('2026-09-07T06:00:00Z')), true);
check('щопонеділка в понеділок', isDue(s({ mode: 'weekly', days: [1] }), kyiv('2026-09-07T06:00:00Z')), true);
check('щопонеділка у вівторок', isDue(s({ mode: 'weekly', days: [1] }), kyiv('2026-09-08T06:00:00Z')), false);
check('15 числа — 15-го', isDue(s({ mode: 'monthly', dayOfMonth: 15 }), kyiv('2026-09-15T06:00:00Z')), true);
check('15 числа — 16-го', isDue(s({ mode: 'monthly', dayOfMonth: 15 }), kyiv('2026-09-16T06:00:00Z')), false);
// Ось заради чого isDue взагалі існує: «31 числа» має спрацювати і в лютому
check('31 числа в лютому — 28-го', isDue(s({ mode: 'monthly', dayOfMonth: 31 }), kyiv('2026-02-28T07:00:00Z')), true);
check('31 числа в лютому — 27-го ще ні', isDue(s({ mode: 'monthly', dayOfMonth: 31 }), kyiv('2026-02-27T07:00:00Z')), false);
check('31 числа у високосному 2028 — 28-го ще ні', isDue(s({ mode: 'monthly', dayOfMonth: 31 }), kyiv('2028-02-28T07:00:00Z')), false);
check('31 числа у високосному 2028 — 29-го', isDue(s({ mode: 'monthly', dayOfMonth: 31 }), kyiv('2028-02-29T07:00:00Z')), true);
check('30 числа в лютому — 28-го', isDue(s({ mode: 'monthly', dayOfMonth: 30 }), kyiv('2026-02-28T07:00:00Z')), true);
check('31 числа в березні — 31-го', isDue(s({ mode: 'monthly', dayOfMonth: 31 }), kyiv('2026-03-31T06:00:00Z')), true);

console.log('\nКожні N днів рахуються від останнього створення');
const every3 = s({ mode: 'interval', intervalDays: 3 });
check('ще жодного разу — час', isDue(every3, kyiv('2026-09-07T06:00:00Z'), null), true);
check('минув день — рано', isDue(every3, kyiv('2026-09-08T06:00:00Z'), '2026-09-07T06:00:00Z'), false);
check('минуло два — рано', isDue(every3, kyiv('2026-09-09T06:00:00Z'), '2026-09-07T06:00:00Z'), false);
check('минуло три — час', isDue(every3, kyiv('2026-09-10T06:00:00Z'), '2026-09-07T06:00:00Z'), true);
// Сервер міг лежати тиждень — пропущений інтервал не має блокувати наступний
check('сервер лежав тиждень — час', isDue(every3, kyiv('2026-09-20T06:00:00Z'), '2026-09-07T06:00:00Z'), true);

console.log('\nКиївський календар, а не серверний');
// 23:30 UTC — у Києві вже наступна доба, і саме її має бачити розклад
check('пізній вечір UTC — у Києві вже завтра', calendarDay(kyiv('2026-09-07T22:30:00Z')).ymd, '2026-09-08');
check('ранок UTC — той самий день', calendarDay(kyiv('2026-09-07T06:00:00Z')).ymd, '2026-09-07');
check('щовівторка о 01:30 за Києвом', isDue(s({ mode: 'weekly', days: [2] }), kyiv('2026-09-07T22:30:00Z')), true);

console.log('\nДовжина місяця');
check('лютий 2026', daysInMonth(2026, 2), 28);
check('лютий 2028', daysInMonth(2028, 2), 29);
check('вересень', daysInMonth(2026, 9), 30);
check('грудень', daysInMonth(2026, 12), 31);

console.log('\nНаступний запуск');
const at = (d: Date | null) => (d ? d.toISOString() : null);
// 2026-09-07 08:00 за Києвом = 05:00 UTC; розклад на 09:00 — ще сьогодні
check('сьогодні пізніше', at(nextRunAt(s({ time: '09:00' }), kyiv('2026-09-07T05:00:00Z'))), '2026-09-07T06:00:00.000Z');
check('сьогодні вже минуло — завтра', at(nextRunAt(s({ time: '09:00' }), kyiv('2026-09-07T07:00:00Z'))), '2026-09-08T06:00:00.000Z');
check('щоп’ятниці з понеділка', at(nextRunAt(s({ mode: 'weekly', days: [5], time: '09:00' }), kyiv('2026-09-07T07:00:00Z'))), '2026-09-11T06:00:00.000Z');
check('31 числа з 1 лютого', at(nextRunAt(s({ mode: 'monthly', dayOfMonth: 31, time: '09:00' }), kyiv('2026-02-01T07:00:00Z'))), '2026-02-28T07:00:00.000Z');
check('кожні 3 дні після вчорашнього', at(nextRunAt(s({ mode: 'interval', intervalDays: 3, time: '09:00' }), kyiv('2026-09-08T07:00:00Z'), '2026-09-07T06:00:00Z')), '2026-09-10T06:00:00.000Z');
check('зламаний розклад — ніколи', nextRunAt(s({ mode: 'weekly', days: [] }), kyiv('2026-09-07T07:00:00Z')), null);

console.log('\nОпис розкладу');
check('щодня', describeSchedule(s({ time: '09:00' })), 'щодня о 09:00');
check('один день тижня', describeSchedule(s({ mode: 'weekly', days: [1], time: '09:00' })), 'щопонеділка о 09:00');
check('кілька днів', describeSchedule(s({ mode: 'weekly', days: [5, 1], time: '09:00' })), 'по Пн, Пт о 09:00');
check('усі сім днів — це щодня', describeSchedule(s({ mode: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], time: '09:00' })), 'щодня о 09:00');
check('щомісяця', describeSchedule(s({ mode: 'monthly', dayOfMonth: 15, time: '09:00' })), 'щомісяця 15 числа о 09:00');
check('кожні 2 дні', describeSchedule(s({ mode: 'interval', intervalDays: 2, time: '09:00' })), 'кожні 2 дні о 09:00');
check('кожні 5 днів', describeSchedule(s({ mode: 'interval', intervalDays: 5, time: '09:00' })), 'кожні 5 днів о 09:00');
check('кожні 21 день', describeSchedule(s({ mode: 'interval', intervalDays: 21, time: '09:00' })), 'кожні 21 день о 09:00');
check('інтервал в один день — це щодня', describeSchedule(s({ mode: 'interval', intervalDays: 1, time: '09:00' })), 'щодня о 09:00');
check('зламаний розклад описується чесно', describeSchedule(s({ mode: 'weekly', days: [] })), 'розклад не налаштований');

console.log('\nОпис наступного запуску');
check('сьогодні', describeNextRun(kyiv('2026-09-07T06:00:00Z'), kyiv('2026-09-07T05:00:00Z')), 'сьогодні о 09:00');
check('завтра', describeNextRun(kyiv('2026-09-08T06:00:00Z'), kyiv('2026-09-07T07:00:00Z')), 'завтра о 09:00');
check('за кілька днів', describeNextRun(kyiv('2026-09-11T06:00:00Z'), kyiv('2026-09-07T07:00:00Z')), '11.09 о 09:00');
check('нікуди — прочерк', describeNextRun(null), '—');

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

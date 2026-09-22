import {
  pickFirst, asBool, asNum, asName, asIdString, asDirection, dayList,
  contactCategoryMatcher, normalizeCallEvent, normalizeTaskEvent,
  aggregateContactEvents, kyivDateOf, isValidYmd,
  ContactEvent, TaskLookups, UNKNOWN_USER, UNKNOWN_CLIENT,
} from './contactActivity';

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

console.log('\npickFirst');
check('перше непорожнє', pickFirst({ a: '', b: null, c: 'x' }, ['a', 'b', 'c']), 'x');
check('false — це значення, а не порожнеча', pickFirst({ a: false }, ['a']), false);
check('нуль — це значення', pickFirst({ a: 0 }, ['a']), 0);
check('нічого не знайшли', pickFirst({ a: 1 }, ['z']), undefined);
check('не обʼєкт', pickFirst(null, ['a']), undefined);

console.log('\nasBool / asNum / asName / asIdString');
check('рядок "true"', asBool('true'), true);
check('рядок "1"', asBool('1'), true);
check('рядок "так"', asBool('так'), true);
check('рядок "false"', asBool('false'), false);
check('порожній рядок', asBool(''), false);
check('число 1', asBool(1), true);
check('число 0', asBool(0), false);
check('кома як десятковий розділювач', asNum('12,5'), 12.5);
check('сміття → 0', asNum('abc'), 0);
check('імʼя з рядка', asName('  Олег  '), 'Олег');
check('імʼя з обʼєкта name', asName({ name: 'Ірина' }), 'Ірина');
check('імʼя з обʼєкта person', asName({ person: 'Петро' }), 'Петро');
check('імʼя з нічого', asName(undefined), '');
check('id з числа', asIdString(42), '42');
check('id з обʼєкта', asIdString({ id: 7, name: 'x' }), '7');
check('id з порожнього рядка', asIdString('  '), null);

console.log('\nasDirection');
// «incoming» містить «in», тому вихідний перевіряється першим — інакше
// «outcome» і «outgoing» ловились би як вхідні
check('income', asDirection('income'), 'in');
check('outcome', asDirection('outcome'), 'out');
check('incoming', asDirection('incoming'), 'in');
check('outgoing', asDirection('outgoing'), 'out');
check('in', asDirection('in'), 'in');
check('out', asDirection('out'), 'out');
check('вихідний українською', asDirection('вихідний'), 'out');
check('невідоме', asDirection('whatever'), 'unknown');
check('порожнє', asDirection(undefined), 'unknown');

console.log('\ndayList');
check('один день', dayList('2026-09-10', '2026-09-10'), ['2026-09-10']);
check('через межу місяця', dayList('2026-08-30', '2026-09-02'),
  ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
check('перевернутий діапазон — порожньо', dayList('2026-09-10', '2026-09-01'), []);

console.log('\nisValidYmd');
check('звичайний день', isValidYmd('2026-09-22'), true);
check('29 лютого високосного року', isValidYmd('2024-02-29'), true);
// Форма правильна, а дня не існує — саме на цьому перевірка форми й ламалась:
// з «2026-13-99» виходив сміттєвий період замість відмови
check('13-й місяць', isValidYmd('2026-13-01'), false);
check('99-те число', isValidYmd('2026-12-99'), false);
check('31 лютого', isValidYmd('2026-02-31'), false);
check('29 лютого невисокосного', isValidYmd('2026-02-29'), false);
check('інший формат', isValidYmd('22.09.2026'), false);
check('текст', isValidYmd('казна-що'), false);
check('не рядок', isValidYmd(20260922), false);
check('порожньо', isValidYmd(undefined), false);

console.log('\nkyivDateOf');
// 22:30 UTC — це вже наступна доба в Києві (UTC+3), і дзвінок мусить лягти
// в той день, у який його зробили за київським годинником
check('вечір UTC → наступний київський день', kyivDateOf('2026-09-10T22:30:00Z', '2026-01-01'), '2026-09-11');
check('ранок UTC → той самий день', kyivDateOf('2026-09-10T06:00:00Z', '2026-01-01'), '2026-09-10');
check('зіпсована дата → запасний день', kyivDateOf('не дата', '2026-05-05'), '2026-05-05');

console.log('\ncontactCategoryMatcher');
{
  const byPattern = contactCategoryMatcher(null);
  check('«Дзвінок» — контакт', byPattern('Дзвінок'), true);
  check('«Вихідний дзвінок» — контакт', byPattern('Вихідний дзвінок'), true);
  check('«Зустріч» — контакт', byPattern('Зустріч'), true);
  check('«Call client» — контакт', byPattern('Call client'), true);
  check('«Підготувати КП» — не контакт', byPattern('Підготувати КП'), false);
  check('порожня категорія — не контакт', byPattern(''), false);

  const byList = contactCategoryMatcher('Дзвінок, Зустріч');
  check('точний список: «Дзвінок»', byList('Дзвінок'), true);
  check('точний список без регістру', byList('дзвінок'), true);
  check('точний список відкидає «Дзвінок постачальнику»', byList('Дзвінок постачальнику'), false);
}

console.log('\nnormalizeCallEvent');
const now = new Date('2026-09-22T09:00:00Z');
{
  const e = normalizeCallEvent({
    id: 991,
    call_type: 'outcome',
    is_answered: true,
    duration: '125',
    manager: { id: 5, name: 'Олег' },
    client: { id: 77, name: 'ТОВ Ромашка' },
    phone: '+380501112233',
    created_at: '2026-09-20T13:45:00Z',
  }, now)!;
  check('id з зовнішнього id', e.id, 'call_991');
  check('київський день', e.date, '2026-09-20');
  check('напрямок', e.direction, 'out');
  check('підняли', e.successful, true);
  check('тривалість числом', e.durationSec, 125);
  check('сейл', e.userName, 'Олег');
  check('клієнт', e.clientName, 'ТОВ Ромашка');
  check('id клієнта', e.clientId, '77');
  check('джерело', e.origin, 'webhook');
  check('тип', e.kind, 'call');
}
{
  // Той самий дзвінок, надісланий двічі без власного id: id мусить збігтись,
  // інакше повтор вебхука задвоїв би статистику
  const payload = {
    call_type: 'income', answered: 'false',
    manager_name: 'Ірина', phone: '+380671234567',
    started_at: '2026-09-21T08:00:00Z',
  };
  const a = normalizeCallEvent(payload, now)!;
  const b = normalizeCallEvent(payload, now)!;
  check('повтор дає той самий id', a.id === b.id, true);
  // Двокрапки й плюс у id не виживають: id — ключ документа, тож усе, крім
  // w . -, замінюється на підкреслення. Головне, що заміна детермінована.
  check('id зібраний з даних', a.id, 'call_2026-09-21T08_00_00__380671234567');
  check('вхідний', a.direction, 'in');
  check('не підняли', a.successful, false);
}
{
  const e = normalizeCallEvent({}, now)!;
  check('без сейла — заглушка', e.userName, UNKNOWN_USER);
  check('без клієнта — заглушка', e.clientName, UNKNOWN_CLIENT);
  check('без часу — момент обробки', e.date, '2026-09-22');
  check('тривалість за замовчуванням', e.durationSec, 0);
}
{
  const e = normalizeCallEvent({ phone: '+380931112233' }, now)!;
  check('без імені клієнта підставляємо номер', e.clientName, '+380931112233');
}
check('не обʼєкт → null', normalizeCallEvent('дзвінок', now), null);
check('null → null', normalizeCallEvent(null, now), null);
{
  const e = normalizeCallEvent({ created_at: 'не дата', phone: '1' }, now)!;
  check('зіпсований час → момент обробки', e.date, '2026-09-22');
}
{
  const e = normalizeCallEvent({ duration: -50, phone: '1' }, now)!;
  check('відʼємна тривалість не проходить', e.durationSec, 0);
}

console.log('\nnormalizeTaskEvent');
const lookups: TaskLookups = {
  categoryById: new Map([['3', 'Дзвінок'], ['4', 'Підготувати КП']]),
  statusById: new Map([
    ['10', { id: 10, name: 'Виконано', kind: 'done' }],
    ['11', { id: 11, name: 'В роботі', kind: 'open' }],
  ]),
  userById: new Map([['5', 'Олег'], ['6', 'Ірина']]),
};
const isContact = contactCategoryMatcher(null);
{
  const e = normalizeTaskEvent({
    id: 501, title: 'Передзвонити', category_id: 3, status_id: 10,
    user_id: 5, client_id: 77,
    created_at: '2026-09-19T10:00:00Z',
    completed_at: '2026-09-20T15:00:00Z',
  }, lookups, isContact, '2026-09-22')!;
  check('id завдання', e.id, 'task_501');
  // Завдання створили 19-го, а виконали 20-го: дотик стався 20-го
  check('день — день виконання', e.date, '2026-09-20');
  check('виконане', e.successful, true);
  check('сейл з довідника', e.userName, 'Олег');
  check('напрямок невідомий', e.direction, 'unknown');
  check('тип', e.kind, 'task');
  check('джерело', e.origin, 'tasks');
}
{
  const e = normalizeTaskEvent({
    id: 502, category_id: 3, status_id: 11, user_id: 6,
    created_at: '2026-09-21T10:00:00Z',
  }, lookups, isContact, '2026-09-22')!;
  check('невиконане — день створення', e.date, '2026-09-21');
  check('невиконане не результативне', e.successful, false);
}
check('не та категорія → null',
  normalizeTaskEvent({ id: 503, category_id: 4 }, lookups, isContact, '2026-09-22'), null);
check('без категорії → null',
  normalizeTaskEvent({ id: 504 }, lookups, isContact, '2026-09-22'), null);
{
  const e = normalizeTaskEvent({
    id: 505, category: { name: 'Зустріч' }, status: { name: 'Завершено', kind: 'done' },
    user: { name: 'Марта' }, client: { person: 'ФОП Іванов' },
    created_at: '2026-09-22T08:00:00Z',
  }, lookups, isContact, '2026-09-22')!;
  check('категорія з вкладеного обʼєкта пройшла', e.title, 'Зустріч');
  check('сейл з вкладеного обʼєкта', e.userName, 'Марта');
  check('клієнт з поля person', e.clientName, 'ФОП Іванов');
  check('статус з вкладеного обʼєкта', e.successful, true);
}

console.log('\naggregateContactEvents');
const ev = (over: Partial<ContactEvent>): ContactEvent => ({
  id: 'x', date: '2026-09-20', at: '2026-09-20T10:00:00.000Z', kind: 'call',
  direction: 'out', successful: true, durationSec: 0, userId: null,
  userName: 'Олег', clientId: null, clientName: 'Клієнт', clientPhone: '',
  title: '', origin: 'webhook', ...over,
});

{
  const events: ContactEvent[] = [
    ev({ id: '1', date: '2026-09-20', at: '2026-09-20T09:00:00.000Z', userName: 'Олег',  clientId: 'c1', durationSec: 60 }),
    ev({ id: '2', date: '2026-09-20', at: '2026-09-20T11:00:00.000Z', userName: 'Олег',  clientId: 'c2', durationSec: 120, successful: false }),
    ev({ id: '3', date: '2026-09-21', at: '2026-09-21T09:00:00.000Z', userName: 'Олег',  clientId: 'c1', kind: 'task', direction: 'unknown' }),
    ev({ id: '4', date: '2026-09-21', at: '2026-09-21T10:00:00.000Z', userName: 'Ірина', clientId: 'c3', direction: 'in' }),
  ];
  const agg = aggregateContactEvents(events, '2026-09-20', '2026-09-22', '2026-09-22');

  check('усього дотиків', agg.totals.contacts, 4);
  check('з них дзвінків', agg.totals.calls, 3);
  check('з них завдань', agg.totals.tasks, 1);
  check('результативних', agg.totals.successful, 3);
  check('результативність %', agg.totals.successRate, 75);
  check('вхідних', agg.totals.incoming, 1);
  check('вихідних', agg.totals.outgoing, 2);
  check('тривалість сумарно', agg.totals.durationSec, 180);
  check('сейлів', agg.totals.reps, 2);
  check('клієнтів', agg.totals.clients, 3);
  check('днів у періоді', agg.totals.periodDays, 3);
  // 4 дотики / (3 дні × 2 сейли) = 0.666… → 0.7
  check('частота: дотиків на сейла за день', agg.totals.perRepPerDay, 0.7);
  check('дотиків на клієнта', agg.totals.touchesPerClient, 1.3);

  check('сейли за спаданням дотиків', agg.byUser.map(u => u.userName), ['Олег', 'Ірина']);
  const oleg = agg.byUser[0];
  check('дотиків у Олега', oleg.contacts, 3);
  check('дзвінків у Олега', oleg.calls, 2);
  check('завдань у Олега', oleg.tasks, 1);
  check('різних клієнтів у Олега', oleg.clients, 2);
  check('активних днів у Олега', oleg.activeDays, 2);
  // 3 дотики на 3 календарні дні періоду, але на 2 робочі дні
  check('на календарний день', oleg.perDay, 1);
  check('на робочий день', oleg.perActiveDay, 1.5);
  check('останній дотик Олега', oleg.lastAt, '2026-09-21T09:00:00.000Z');

  const c1 = agg.byClient.find(c => c.clientId === 'c1')!;
  check('дотиків до c1', c1.touches, 2);
  check('з них дзвінків', c1.calls, 1);
  check('днів з останнього контакту', c1.daysSince, 1);
  check('хто контактував', c1.reps, ['Олег']);

  check('днів у щоденному ряді', agg.daily.length, 3);
  check('перший день', agg.daily[0], { date: '2026-09-20', calls: 2, tasks: 0, successful: 1 });
  // День без подій усе одно присутній: пропуск у ряді — це теж інформація
  check('порожній день не зникає', agg.daily[2], { date: '2026-09-22', calls: 0, tasks: 0, successful: 0 });
}

{
  const agg = aggregateContactEvents([], '2026-09-01', '2026-09-03', '2026-09-03');
  check('порожньо: дотиків 0', agg.totals.contacts, 0);
  check('порожньо: відсоток 0, не NaN', agg.totals.successRate, 0);
  check('порожньо: частота 0, не NaN', agg.totals.perRepPerDay, 0);
  check('порожньо: на клієнта 0, не NaN', agg.totals.touchesPerClient, 0);
  check('порожньо: сейлів немає', agg.byUser, []);
  check('порожньо: дні все одно є', agg.daily.length, 3);
}

{
  // Той самий номер без картки в CRM не має розпадатись на окремих «клієнтів»
  const events: ContactEvent[] = [
    ev({ id: '1', clientId: null, clientPhone: '+380501112233', clientName: '+380501112233', at: '2026-09-20T09:00:00.000Z' }),
    ev({ id: '2', clientId: null, clientPhone: '+380501112233', clientName: 'ТОВ Ромашка',   at: '2026-09-20T12:00:00.000Z' }),
  ];
  const agg = aggregateContactEvents(events, '2026-09-20', '2026-09-20', '2026-09-20');
  check('номер склеїв дотики в одного клієнта', agg.totals.clients, 1);
  check('дотиків у клієнта', agg.byClient[0].touches, 2);
  check('імʼя витіснило номер', agg.byClient[0].clientName, 'ТОВ Ромашка');
}

{
  // Подія поза межами періоду не потрапляє в щоденний ряд, але й не ламає нічого
  const agg = aggregateContactEvents(
    [ev({ id: '1', date: '2026-08-01', at: '2026-08-01T09:00:00.000Z' })],
    '2026-09-01', '2026-09-02', '2026-09-02',
  );
  check('подія поза періодом: у сумі є', agg.totals.contacts, 1);
  check('подія поза періодом: у ряді днів немає', agg.daily.map(d => d.calls), [0, 0]);
}

{
  // Перевернутий діапазон не має видаватись за однодобовий період
  const agg = aggregateContactEvents([], '2026-09-10', '2026-09-01', '2026-09-10');
  check('перевернутий діапазон: днів 0', agg.totals.periodDays, 0);
  check('перевернутий діапазон: ряд днів порожній', agg.daily, []);
  check('перевернутий діапазон: частота 0, не NaN', agg.totals.perRepPerDay, 0);
}

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

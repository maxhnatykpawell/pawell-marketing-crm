import assert from 'node:assert/strict';
import {
  dayOf, addDayKey, taskWindow, eventWindow, plainText, buildTaskEvent, buildEventItemEvent,
  taskCalendarOwner, resourceHash, validateMeeting, buildMeeting, isEmail,
  encryptSecret, decryptSecret, linkId,
} from './googleCalendar';

// ── Дати ─────────────────────────────────────────────────────────────────────
assert.equal(dayOf('2026-12-01T00:00:00.000Z'), '2026-12-01');
assert.equal(dayOf('2026-12-01'), '2026-12-01');
assert.equal(dayOf('2026-02-31T00:00:00.000Z'), null, 'неіснуюча дата');
assert.equal(dayOf(''), null);
assert.equal(dayOf(null), null);
assert.equal(dayOf('вчора'), null);
assert.equal(addDayKey('2026-12-31', 1), '2027-01-01');
assert.equal(addDayKey('2028-02-28', 1), '2028-02-29', 'високосний рік');

// Дедлайн без початку — один день; Google-кінець виключний
assert.deepEqual(taskWindow({ deadline: '2026-12-05T00:00:00.000Z' }), { start: '2026-12-05', endExclusive: '2026-12-06' });
// Початок і дедлайн — обидва включно
assert.deepEqual(taskWindow({ startDate: '2026-12-01T00:00:00.000Z', deadline: '2026-12-03T00:00:00.000Z' }), { start: '2026-12-01', endExclusive: '2026-12-04' });
// Початок пізніше за дедлайн — віримо дедлайну
assert.deepEqual(taskWindow({ startDate: '2026-12-10T00:00:00.000Z', deadline: '2026-12-03T00:00:00.000Z' }), { start: '2026-12-03', endExclusive: '2026-12-04' });
assert.deepEqual(taskWindow({ startDate: '2026-12-10T00:00:00.000Z' }), { start: '2026-12-10', endExclusive: '2026-12-11' });
assert.equal(taskWindow({}), null);
assert.deepEqual(eventWindow({ startDate: '2026-11-10T00:00:00.000Z', endDate: '2026-11-12T00:00:00.000Z' }), { start: '2026-11-10', endExclusive: '2026-11-13' });

// ── Текст ────────────────────────────────────────────────────────────────────
assert.equal(plainText('<p>Привіт&nbsp;<b>світ</b></p><p>Рядок 2</p>'), 'Привіт світ\nРядок 2');
assert.equal(plainText(null), '');
assert.equal(plainText('x'.repeat(2000), 100).length, 100);

// ── Задачі ───────────────────────────────────────────────────────────────────
const card = { id: 'c1', title: 'Підготувати банер', description: '<p>Макет у Figma</p>', deadline: '2026-12-05T00:00:00.000Z', assigneeId: 'u1', projectId: 'p1' };
assert.equal(taskCalendarOwner(card), 'u1');
assert.equal(taskCalendarOwner({ ...card, isCompleted: true }), null, 'виконану прибираємо');
assert.equal(taskCalendarOwner({ ...card, assigneeId: null }), null, 'без виконавця календаря немає');
assert.equal(taskCalendarOwner({ ...card, deadline: null }), null, 'без дати — не подія');

const ev = buildTaskEvent(card, { appUrl: 'https://crm.test/', projectTitle: 'Black Friday' })!;
assert.equal(ev.summary, 'Підготувати банер');
assert.deepEqual(ev.start, { date: '2026-12-05' });
assert.deepEqual(ev.end, { date: '2026-12-06' });
assert.match(ev.description!, /Проєкт: Black Friday/);
assert.match(ev.description!, /Макет у Figma/);
assert.match(ev.description!, /https:\/\/crm\.test\/\?card=c1/, 'посилання без подвійного слеша');
assert.equal(ev.transparency, 'transparent');
assert.deepEqual(ev.extendedProperties, { private: { pawell: 'card', pawellId: 'c1' } });
assert.equal(buildTaskEvent({ ...card, deadline: null }), null);
assert.equal(buildTaskEvent({ ...card, title: '' })!.summary, 'Без назви');

// Відбиток: переміщення картки (інші поля) його не змінює, зміна дати — змінює
const h1 = resourceHash(buildTaskEvent(card)!);
assert.equal(h1, resourceHash(buildTaskEvent({ ...card, projectId: 'other' } as any)!), 'проєкт без titleу не в відбитку без ctx');
assert.notEqual(h1, resourceHash(buildTaskEvent({ ...card, deadline: '2026-12-06T00:00:00.000Z' })!));
assert.notEqual(h1, resourceHash(buildTaskEvent({ ...card, title: 'Інша' })!));

// ── Події ────────────────────────────────────────────────────────────────────
const e2 = buildEventItemEvent({ id: 'e1', title: 'Виставка', startDate: '2026-11-10T00:00:00.000Z', endDate: '2026-11-12T00:00:00.000Z', location: 'Київ', websiteUrl: 'https://expo.test' })!;
assert.equal(e2.location, 'Київ');
assert.deepEqual(e2.end, { date: '2026-11-13' });
assert.match(e2.description!, /expo\.test/);
assert.equal(buildEventItemEvent({ id: 'e2', title: 'x' }), null);

// ── Міти ─────────────────────────────────────────────────────────────────────
const m = { title: 'Планерка', start: '2026-12-01T10:00:00+02:00', end: '2026-12-01T10:30:00+02:00', attendeeEmails: ['a@x.com'], withMeet: true };
assert.equal(validateMeeting(m), null);
assert.match(validateMeeting({ ...m, title: '  ' })!, /назва/i);
assert.match(validateMeeting({ ...m, end: m.start })!, /пізніше/);
assert.match(validateMeeting({ ...m, start: 'abc' })!, /час/);
assert.match(validateMeeting({ ...m, end: '2026-12-03T10:00:00+02:00' })!, /довший/);
assert.match(validateMeeting({ ...m, attendeeEmails: ['not-an-email'] })!, /Некоректна адреса/);
assert.match(validateMeeting({ ...m, attendeeEmails: Array(51).fill('a@x.com') })!, /Забагато/);
assert.equal(isEmail('a@b.co'), true);
assert.equal(isEmail('a b@c.com'), false);

const built = buildMeeting({ ...m, attendeeEmails: ['A@X.com', 'a@x.com', 'b@y.org'] }, 'req-1', 'Europe/Kyiv');
assert.deepEqual(built.attendees, [{ email: 'a@x.com' }, { email: 'b@y.org' }], 'дублі без урахування регістру прибрано');
assert.equal(built.start.dateTime, '2026-12-01T08:00:00.000Z');
assert.equal((built.conferenceData as any).createRequest.requestId, 'req-1');
assert.equal(buildMeeting({ ...m, withMeet: false }, 'r', 'Europe/Kyiv').conferenceData, undefined, 'без Meet — без конференції');

// ── Шифрування токенів ───────────────────────────────────────────────────────
const enc = encryptSecret('1//refresh-token', 'secret-A');
assert.ok(!enc.includes('refresh-token'), 'у відкритому вигляді токена немає');
assert.equal(decryptSecret(enc, 'secret-A'), '1//refresh-token');
assert.equal(decryptSecret(enc, 'secret-B'), null, 'інший секрет не розшифрує');
assert.equal(decryptSecret(enc.slice(0, -4) + 'AAAA', 'secret-A'), null, 'зіпсоване не проходить автентифікацію');
assert.equal(decryptSecret('сміття', 'secret-A'), null);
assert.notEqual(encryptSecret('x', 's'), encryptSecret('x', 's'), 'кожне шифрування з новим IV');

// ── Ключі звʼязків ───────────────────────────────────────────────────────────
assert.equal(linkId('u1', 'card', 'c1'), linkId('u1', 'card', 'c1'));
assert.notEqual(linkId('u1', 'card', 'c1'), linkId('u2', 'card', 'c1'));
assert.ok(/^[0-9a-f]{40}$/.test(linkId('u/1', 'card', '../x')), 'небезпечні символи в id не потрапляють у ключ');

console.log('googleCalendar tests passed');

/**
 * Перевірка інтеграції з Google Calendar без справжнього Google: сервер тут
 * справжній, а «Google» — підміна fetch у пам'яті. База — тимчасовий файл.
 */
import express from 'express';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'node:assert/strict';
import { registerGoogleCalendar } from '../google-calendar-server';

process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csecret';
process.env.GOOGLE_REDIRECT_URI = 'https://crm.test/api/google/callback';
process.env.PUBLIC_APP_URL = 'https://crm.test';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcal-smoke-'));

// ── «CRM-база» ────────────────────────────────────────────────────────────────
const db: Record<string, Record<string, any>> = { cards: {}, events: {}, projects: { p1: { id: 'p1', title: 'Black Friday' } } };
const users = [
  { id: 'u1', name: 'Олег', email: 'oleg@x.com' },
  { id: 'u2', name: 'Марія', email: 'maria@x.com' },
  { id: 'u3', name: 'Без пошти' },
];

// ── «Google» ──────────────────────────────────────────────────────────────────
interface GEvent { id: string; [k: string]: any }
const cal: Record<string, Record<string, GEvent>> = {};   // userId → eventId → подія
const refreshTokens: Record<string, string> = {};         // refresh → userId
let calls: { method: string; url: string; user: string; body?: any }[] = [];
let revoked: string[] = [];
let n = 0;
/** Підкручування поведінки: наприклад, один 401 чи 500 */
const hooks = { fail401Once: false, fail500Times: 0, patch404: false, invalidGrant: false, noHangout: false };

const jsonRes = (status: number, body: any) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

(globalThis as any).fetch = async (input: any, init: any = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.href ?? input.url);
  const method = (init.method || 'GET').toUpperCase();
  const form = init.body instanceof URLSearchParams ? init.body : null;
  const body = !form && init.body ? JSON.parse(init.body) : undefined;

  if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/token') {
    if (form!.get('grant_type') === 'authorization_code') {
      const code = form!.get('code')!;
      if (!code.startsWith('code-')) return jsonRes(400, { error: 'invalid_grant' });
      const user = code.slice(5);
      const refresh = `rt-${user}-${++n}`;
      refreshTokens[refresh] = user;
      const scope = code.endsWith('-noscope') ? 'openid email' : 'openid email https://www.googleapis.com/auth/calendar.events';
      return jsonRes(200, { access_token: `at-${user}-${++n}`, refresh_token: code.endsWith('-norefresh') ? undefined : refresh, expires_in: 3600, scope });
    }
    // refresh_token
    if (hooks.invalidGrant) return jsonRes(400, { error: 'invalid_grant' });
    const user = refreshTokens[form!.get('refresh_token')!];
    if (!user) return jsonRes(400, { error: 'invalid_grant' });
    return jsonRes(200, { access_token: `at-${user}-${++n}`, expires_in: 3600 });
  }
  if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/revoke') {
    revoked.push(form!.get('token')!);
    return jsonRes(200, {});
  }
  if (url.pathname === '/v1/userinfo') {
    const user = String(init.headers.Authorization).split('-')[1];
    return jsonRes(200, { email: `${user}@gmail.test` });
  }

  if (url.origin === 'https://www.googleapis.com' && url.pathname.startsWith('/calendar/v3/calendars/primary/events')) {
    const user = String(init.headers.Authorization).split(' ')[1].split('-')[1];
    calls.push({ method, url: url.pathname + url.search, user, body });
    if (hooks.fail401Once) { hooks.fail401Once = false; return jsonRes(401, { error: { message: 'expired' } }); }
    if (hooks.fail500Times > 0) { hooks.fail500Times--; return jsonRes(503, { error: { message: 'backend' } }); }
    const events = (cal[user] ||= {});
    const id = decodeURIComponent(url.pathname.split('/events/')[1] ?? '');

    if (method === 'POST') {
      const ev: GEvent = { ...body, id: `ev${++n}`, htmlLink: 'https://calendar.google.com/e/x' };
      if (body.conferenceData && !hooks.noHangout) ev.hangoutLink = 'https://meet.google.com/abc-defg-hij';
      events[ev.id] = ev;
      return jsonRes(200, ev);
    }
    if (method === 'GET') return events[id] ? jsonRes(200, { ...events[id], hangoutLink: 'https://meet.google.com/late-link' }) : jsonRes(404, {});
    if (method === 'PATCH') {
      if (hooks.patch404) { hooks.patch404 = false; delete events[id]; return jsonRes(404, { error: { message: 'Not Found' } }); }
      if (!events[id]) return jsonRes(404, {});
      events[id] = { ...events[id], ...body };
      return jsonRes(200, events[id]);
    }
    if (method === 'DELETE') {
      if (!events[id]) return jsonRes(410, {});
      delete events[id];
      return jsonRes(204, null);
    }
  }
  return jsonRes(404, { error: 'unmocked ' + url });
};

// ── Сервер ────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).user = { userId: String(req.header('x-user') || 'u1'), role: 'member' }; next(); });
const gcal = registerGoogleCalendar(app, {
  requireAuth: (_req, _res, next) => next(),
  getFirestore: () => null,
  getUsers: async () => users,
  getEntity: async (type, id) => db[type][id] ?? null,
  listEntitiesForUser: async (type, userId) =>
    Object.values(db[type]).filter((x: any) => (type === 'cards' ? x.assigneeId === userId : (x.assigneeIds || []).includes(userId))),
  jwtSecret: 'test-secret',
  localDir: dir,
  retryDelayMs: 1,
});
const server = http.createServer(app).listen(0);
const port = (server.address() as any).port;

async function api(user: string, method: string, url: string, body?: any) {
  const res = await fetch(`http://127.0.0.1:${port}${url}`, {
    method, redirect: 'manual',
    headers: { 'content-type': 'application/json', 'x-user': user },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, json, location: res.headers.get('location') };
}
// Вбудований fetch підмінений, тому для запитів до власного сервера беремо справжній
const realFetch = (globalThis as any).fetch;
const _fetch = realFetch;
(globalThis as any).fetch = async (input: any, init?: any) => {
  const s = typeof input === 'string' ? input : input.href ?? input.url;
  if (String(s).startsWith(`http://127.0.0.1:${port}`)) return nodeFetch(input, init);
  return _fetch(input, init);
};
const nodeFetch = (await import('node:http')).default && ((input: any, init: any = {}) => new Promise<Response>((resolve, reject) => {
  const u = new URL(typeof input === 'string' ? input : input.href);
  const req = http.request(u, { method: init.method, headers: init.headers }, r => {
    const chunks: Buffer[] = [];
    r.on('data', c => chunks.push(c));
    r.on('end', () => resolve(new Response([301, 302, 303].includes(r.statusCode!) ? null : Buffer.concat(chunks), {
      status: r.statusCode, headers: r.headers as any,
    })));
  });
  req.on('error', reject);
  if (init.body) req.write(init.body);
  req.end();
}));

const tick = (ms = 120) => new Promise(r => setTimeout(r, ms));
const reset = () => { calls = []; };
const eventsOf = (u: string) => Object.values(cal[u] ?? {});

/** Підключити акаунт через повний OAuth-потік */
async function connect(user: string, suffix = '') {
  const c = await api(user, 'POST', '/api/google/connect');
  const state = new URL(c.json.url).searchParams.get('state')!;
  return api(user, 'GET', `/api/google/callback?code=code-${user}${suffix}&state=${encodeURIComponent(state)}`);
}

const card = (id: string, extra: any = {}) => ({
  id, title: 'Задача ' + id, description: '<p>Опис</p>', listId: 'l1', order: 0,
  assigneeId: 'u1', deadline: '2026-12-05T00:00:00.000Z', projectId: 'p1', ...extra,
});
const save = (c: any) => { db.cards[c.id] = c; };

(async () => {
  // ── 0. Нічого не підключено: хуки не роблять нічого ─────────────────────────
  save(card('c0'));
  gcal.onEntityChanged('cards', 'c0');
  await tick();
  assert.equal(calls.length, 0, 'без підключених акаунтів жодних звернень до Google');

  // ── 1. OAuth ────────────────────────────────────────────────────────────────
  let st = await api('u1', 'GET', '/api/google/status');
  assert.equal(st.json.configured, true);
  assert.equal(st.json.connected, false);
  assert.equal(st.json.redirectUri, 'https://crm.test/api/google/callback');

  const conn = await api('u1', 'POST', '/api/google/connect');
  const authUrl = new URL(conn.json.url);
  assert.equal(authUrl.origin + authUrl.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(authUrl.searchParams.get('access_type'), 'offline');
  assert.equal(authUrl.searchParams.get('prompt'), 'consent');
  assert.ok(authUrl.searchParams.get('scope')!.includes('calendar.events'));
  assert.ok(!authUrl.searchParams.get('scope')!.includes('auth/calendar '), 'не просимо доступ до всього календаря');

  // Підроблений state — відмова, акаунт не підключається
  let r = await api('u1', 'GET', '/api/google/callback?code=code-u1&state=forged');
  assert.match(r.location!, /google=error&reason=state/);
  // state, виданий для іншої мети, теж не годиться
  const jwt = (await import('jsonwebtoken')).default;
  r = await api('u1', 'GET', `/api/google/callback?code=code-u1&state=${jwt.sign({ userId: 'u1' }, 'test-secret')}`);
  assert.match(r.location!, /reason=state/);
  r = await api('u1', 'GET', '/api/google/callback?error=access_denied');
  assert.match(r.location!, /google=denied/);

  // Людина зняла галочку календаря / Google не віддав refresh-токен
  assert.match((await connect('u1', '-noscope')).location!, /reason=scope/);
  assert.match((await connect('u1', '-norefresh')).location!, /reason=norefresh/);
  assert.equal((await api('u1', 'GET', '/api/google/status')).json.connected, false);

  // ── 2. Підключення + наповнення наявними задачами ───────────────────────────
  save(card('c1'));
  save(card('c-done', { isCompleted: true }));
  save(card('c-nodate', { deadline: null }));
  save(card('c-other', { assigneeId: 'u2' }));
  save(card('c-old', { deadline: '2020-01-01T00:00:00.000Z' }));
  r = await connect('u1');
  assert.match(r.location!, /google=connected/);
  await tick(400);
  st = await api('u1', 'GET', '/api/google/status');
  assert.equal(st.json.connected, true);
  assert.equal(st.json.email, 'u1@gmail.test');
  assert.ok(!JSON.stringify(st.json).includes('rt-'), 'токен у відповідь не потрапляє');
  assert.ok(!fs.readFileSync(path.join(dir, 'google.json'), 'utf8').includes('rt-u1'), 'у файлі токен лише зашифрований');

  const titles = eventsOf('u1').map(e => e.summary).sort();
  assert.deepEqual(titles, ['Задача c0', 'Задача c1'], 'перенесено лише актуальні задачі свого виконавця з датою');
  const e1 = eventsOf('u1').find(e => e.summary === 'Задача c1')!;
  assert.deepEqual(e1.start, { date: '2026-12-05' });
  assert.deepEqual(e1.end, { date: '2026-12-06' });
  assert.match(e1.description, /Проєкт: Black Friday/);
  assert.match(e1.description, /https:\/\/crm\.test\/\?card=c1/);

  // ── 3. Зміни: відбиток, дата, колонка ──────────────────────────────────────
  reset();
  save(card('c1', { listId: 'l2', order: -5 }));        // лише переніс між колонками
  gcal.onEntityChanged('cards', 'c1');
  await tick();
  assert.equal(calls.length, 0, 'перенос між колонками не чіпає Google');

  save(card('c1', { deadline: '2026-12-09T00:00:00.000Z' }));
  gcal.onEntityChanged('cards', 'c1');
  await tick();
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 1, 'зміна дати — PATCH, а не новий дубль');
  assert.equal(eventsOf('u1').length, 2, 'дубля немає');
  assert.equal(eventsOf('u1').find(e => e.summary === 'Задача c1')!.start.date, '2026-12-09');
  assert.equal(calls.find(c => c.method === 'PATCH')!.body.start.dateTime, null, 'PATCH очищає dateTime');

  // Швидка послідовність правок не породжує дубль
  reset();
  for (let i = 0; i < 5; i++) { save(card('c1', { title: 'Нова назва ' + i })); gcal.onEntityChanged('cards', 'c1'); }
  await tick(300);
  assert.equal(eventsOf('u1').filter(e => e.summary.startsWith('Нова назва')).length, 1, 'одна подія після серії правок');
  assert.equal(eventsOf('u1').find(e => e.summary.startsWith('Нова назва'))!.summary, 'Нова назва 4', 'остання правка перемогла');

  // Подію видалили в самому Google: створюємо наново
  hooks.patch404 = true;
  save(card('c1', { title: 'Після 404' }));
  gcal.onEntityChanged('cards', 'c1');
  await tick(200);
  assert.equal(eventsOf('u1').filter(e => e.summary === 'Після 404').length, 1);

  // ── 4. Передача іншому виконавцю ───────────────────────────────────────────
  await connect('u2');
  await tick(300);
  const before2 = eventsOf('u2').length;
  save(card('c1', { title: 'Після 404', assigneeId: 'u2' }));
  gcal.onEntityChanged('cards', 'c1');
  await tick(250);
  assert.ok(!eventsOf('u1').some(e => e.summary === 'Після 404'), 'зі старого календаря прибрано');
  assert.equal(eventsOf('u2').filter(e => e.summary === 'Після 404').length, 1, 'у новому з’явилось');
  assert.ok(eventsOf('u2').length > before2 - 1);

  // Виконаєш — зникає; повернув — з'являється
  save(card('c1', { title: 'Після 404', assigneeId: 'u2', isCompleted: true }));
  gcal.onEntityChanged('cards', 'c1');
  await tick();
  assert.ok(!eventsOf('u2').some(e => e.summary === 'Після 404'), 'виконану прибрано');
  save(card('c1', { title: 'Після 404', assigneeId: 'u2', isCompleted: false }));
  gcal.onEntityChanged('cards', 'c1');
  await tick();
  assert.ok(eventsOf('u2').some(e => e.summary === 'Після 404'));

  // Видалили картку — подія зникає
  delete db.cards.c1;
  gcal.onEntityChanged('cards', 'c1');
  await tick();
  assert.ok(!eventsOf('u2').some(e => e.summary === 'Після 404'), 'видалену задачу прибрано з календаря');

  // ── 5. Події (виставки) для кількох виконавців ──────────────────────────────
  db.events.e1 = { id: 'e1', title: 'Виставка', startDate: '2026-11-10T00:00:00.000Z', endDate: '2026-11-12T00:00:00.000Z', assigneeIds: ['u1', 'u2', 'u3'], location: 'Київ' };
  gcal.onEntityChanged('events', 'e1');
  await tick(250);
  for (const u of ['u1', 'u2']) {
    const ev = eventsOf(u).find(e => e.summary === 'Виставка')!;
    assert.ok(ev, 'подія є в календарі ' + u);
    assert.deepEqual(ev.end, { date: '2026-11-13' });
  }
  db.events.e1.assigneeIds = ['u2'];
  gcal.onEntityChanged('events', 'e1');
  await tick(250);
  assert.ok(!eventsOf('u1').some(e => e.summary === 'Виставка'), 'зняли з події — зникла з календаря');
  assert.ok(eventsOf('u2').some(e => e.summary === 'Виставка'));

  // ── 6. Стійкість до збоїв Google ───────────────────────────────────────────
  // Один 401 (токен протух) — оновлюємо токен і повторюємо
  reset();
  hooks.fail401Once = true;
  save(card('c2', { assigneeId: 'u1', title: 'Після 401' }));
  gcal.onEntityChanged('cards', 'c2');
  await tick(250);
  assert.ok(eventsOf('u1').some(e => e.summary === 'Після 401'), 'після 401 запит повторено');

  // 503 двічі — повтори з паузою
  hooks.fail500Times = 2;
  save(card('c3', { assigneeId: 'u1', title: 'Після 503' }));
  gcal.onEntityChanged('cards', 'c3');
  await tick(300);
  assert.ok(eventsOf('u1').some(e => e.summary === 'Після 503'), 'після 5xx запит повторено');

  // ── 7. Налаштування: вимкнули задачі — календар очистився ──────────────────
  r = await api('u1', 'PUT', '/api/google/prefs', { syncTasks: false });
  assert.equal(r.json.syncTasks, false);
  await tick(300);
  assert.ok(!eventsOf('u1').some(e => e.summary === 'Після 401'), 'вимкнули — дзеркало прибрано');
  reset();
  save(card('c4', { assigneeId: 'u1', title: 'Не має потрапити' }));
  gcal.onEntityChanged('cards', 'c4');
  await tick();
  assert.equal(calls.length, 0, 'з вимкненою синхронізацією нічого не пишемо');
  await api('u1', 'PUT', '/api/google/prefs', { syncTasks: true });
  await tick(400);
  assert.ok(eventsOf('u1').some(e => e.summary === 'Не має потрапити'), 'увімкнули — наповнилось знову');

  // ── 8. Міти ─────────────────────────────────────────────────────────────────
  reset();
  const start = '2026-12-01T10:00:00+02:00';
  const end = '2026-12-01T10:45:00+02:00';
  r = await api('u1', 'POST', '/api/google/meetings', {
    title: 'Планерка', description: 'Обговорення', start, end,
    attendeeUserIds: ['u2', 'u3', 'u1', 'ghost'], extraEmails: ['client@ext.org', 'MARIA@x.com'], withMeet: true,
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.meetLink, 'https://meet.google.com/abc-defg-hij');
  assert.deepEqual(r.json.skipped, ['Без пошти'], 'про користувача без пошти повідомлено');
  assert.equal(r.json.invited, 2, 'Марія (без дубля) і зовнішній; сам організатор не запрошується');
  const mc = calls.find(c => c.method === 'POST')!;
  assert.match(mc.url, /conferenceDataVersion=1/);
  assert.match(mc.url, /sendUpdates=all/);
  assert.deepEqual(mc.body.attendees.map((a: any) => a.email).sort(), ['client@ext.org', 'maria@x.com']);
  assert.equal(mc.body.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
  assert.equal(mc.body.start.dateTime, '2026-12-01T08:00:00.000Z');

  // Без Meet — без конференції
  reset();
  r = await api('u1', 'POST', '/api/google/meetings', { title: 'Без meet', start, end, withMeet: false });
  assert.equal(r.status, 200);
  assert.equal(calls[0].body.conferenceData, undefined);
  assert.match(calls[0].url, /conferenceDataVersion=0/);

  // Посилання зʼявилось із затримкою — другий запит
  hooks.noHangout = true;
  r = await api('u1', 'POST', '/api/google/meetings', { title: 'Затримка', start, end, withMeet: true });
  assert.equal(r.json.meetLink, 'https://meet.google.com/late-link');
  hooks.noHangout = false;

  // Валідація
  assert.equal((await api('u1', 'POST', '/api/google/meetings', { title: '', start, end })).status, 400);
  assert.equal((await api('u1', 'POST', '/api/google/meetings', { title: 'x', start: end, end: start })).status, 400);
  assert.equal((await api('u1', 'POST', '/api/google/meetings', { title: 'x', start, end, extraEmails: ['не-пошта'] })).status, 400);
  // Не підключений — 409 з кодом
  r = await api('u3', 'POST', '/api/google/meetings', { title: 'x', start, end });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'not_connected');

  // ── 9. Відкликаний доступ ──────────────────────────────────────────────────
  hooks.invalidGrant = true;
  tokenCacheBust();
  save(card('c5', { assigneeId: 'u1', title: 'Після відкликання' }));
  gcal.onEntityChanged('cards', 'c5');
  await tick(200);
  st = await api('u1', 'GET', '/api/google/status');
  assert.equal(st.json.needsReconnect, true, 'доступ відкликано — позначено, що треба підключити знову');
  assert.equal((await api('u1', 'POST', '/api/google/meetings', { title: 'x', start, end })).status, 409);
  assert.equal((await api('u1', 'POST', '/api/google/sync')).status, 409);
  hooks.invalidGrant = false;
  // Повторне підключення знімає позначку
  await connect('u1');
  await tick(300);
  st = await api('u1', 'GET', '/api/google/status');
  assert.equal(st.json.needsReconnect, false);

  // ── 10. Відключення: дзеркало прибрано, міти лишились, токен відкликано ────
  const meetingsBefore = eventsOf('u1').filter(e => e.extendedProperties?.private?.pawell === 'meeting').length;
  assert.ok(meetingsBefore >= 1);
  revoked = [];
  r = await api('u1', 'DELETE', '/api/google/connection');
  assert.equal(r.status, 200);
  assert.equal(revoked.length, 1, 'токен відкликано в Google');
  assert.deepEqual(eventsOf('u1').filter(e => ['card', 'event'].includes(e.extendedProperties?.private?.pawell)), [], 'копії задач прибрано');
  assert.equal(eventsOf('u1').filter(e => e.extendedProperties?.private?.pawell === 'meeting').length, meetingsBefore, 'справжні міти лишились');
  st = await api('u1', 'GET', '/api/google/status');
  assert.equal(st.json.connected, false);
  const file = JSON.parse(fs.readFileSync(path.join(dir, 'google.json'), 'utf8'));
  assert.ok(!Object.values(file.links as Record<string, any>).some((l: any) => l.userId === 'u1'), 'звʼязків не лишилось');
  assert.equal((await api('u1', 'DELETE', '/api/google/connection')).status, 200, 'повторне відключення безпечне');

  console.log('google smoke: усе пройшло');
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch(e => {
  console.error('FAIL:', e);
  server.close();
  process.exit(1);
});

/** Змусити сервер взяти новий токен (імітація спливання access-токена) */
function tokenCacheBust() {
  // Кеш токенів у модулі; найпростіше — дочекатись 401: наступний запит поверне його
  hooks.fail401Once = true;
}

/**
 * Перевірка шару записів у справжньому api.ts: порядок, відкат, офлайн-черга.
 * fetch і localStorage підмінені — мережі й бази тут немає.
 */
import assert from 'node:assert/strict';

// ── Підміна середовища браузера (до імпорту api) ─────────────────────────────
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};
let online = true;
Object.defineProperty(globalThis, 'navigator', { value: { get onLine() { return online; } }, configurable: true });
store.set('auth_token', 'tok');

interface Call { url: string; method: string; body: any }
let calls: Call[] = [];
/** Поведінка підміненого сервера; кожен тест її задає */
let handler: (c: Call) => Promise<Response> | Response = () => new Response('{}', { status: 200 });
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const c: Call = { url, method: (init.method || 'GET').toUpperCase(), body: init.body ? JSON.parse(init.body) : undefined };
  calls.push(c);
  return handler(c);
};

const api = await import('../api');
const { createEntity, updateEntity, deleteEntity, processOfflineQueue, pendingWrites, onWriteError, fetchStateMerged } = api;

const queue = () => JSON.parse(store.get('offline_queue') || '[]');
const ok = () => new Response('{}', { status: 200 });
const status = (n: number) => new Response('{}', { status: n });
const netFail = () => { throw new TypeError('Load failed'); }; // саме так пише Safari
const reset = () => { calls = []; store.delete('offline_queue'); online = true; handler = ok; };

let errors: any[] = [];
onWriteError(e => errors.push(e));
const card = (id: string) => ({ id, title: 'Задача ' + id });

// ── 1. Успішне створення ─────────────────────────────────────────────────────
reset();
await createEntity('cards', card('a1'));
assert.equal(calls.length, 1);
assert.equal(calls[0].url, '/api/entity/cards');
assert.equal(pendingWrites.unsettledCount, 0, 'підтверджений запис більше не «в дорозі»');

// ── 2. Головна помилка: застаріла відповідь сервера не стирає нову задачу ────
reset();
{
  let releaseCreate!: () => void;
  const gate = new Promise<void>(r => { releaseCreate = r; });
  handler = async c => {
    if (c.url === '/api/state') return new Response(JSON.stringify({ cards: [card('old')], lists: [] }), { status: 200 });
    await gate; // сервер ще «пише» нову задачу
    return ok();
  };
  const saving = createEntity('cards', card('new1'));          // задача вже на екрані
  const merged = await fetchStateMerged();                     // а «старий» стан уже прийшов
  assert.deepEqual(merged!.cards.map((c: any) => c.id), ['old', 'new1'], 'задача пережила опитування');
  releaseCreate();
  await saving;
}

// ── 3. Помилка сервера: сповіщення, відкат, жодних «привидів» ────────────────
reset();
errors = [];
handler = c => (c.method === 'POST' ? status(500) : ok());
await assert.rejects(createEntity('cards', card('bad')));
assert.equal(errors.length, 1);
assert.equal(errors[0].status, 500);
assert.match(errors[0].message, /Не вдалось створити задачу/);
{
  const started = pendingWrites.fetchStart();
  const merged = pendingWrites.overlay({ cards: [] } as any, started);
  assert.equal(merged.cards.length, 0, 'невдала задача не накладається — відкат');
}
calls = [];
await assert.rejects(updateEntity('cards', 'bad', { estimatedMinutes: 30 }));
assert.equal(calls.length, 0, 'зміна необ’єкта, якого не створено, на сервер не йде (інакше — привид)');
assert.equal(errors.length, 1, 'і другого повідомлення немає');

// ── 4. Порядок: зміна не обганяє створення ───────────────────────────────────
reset();
{
  const seen: string[] = [];
  handler = async c => {
    seen.push(c.method);
    if (c.method === 'POST') await new Promise(r => setTimeout(r, 40)); // створення повільне
    return ok();
  };
  const a = createEntity('cards', card('ord'));
  const b = updateEntity('cards', 'ord', { title: 'нова' });
  const c = deleteEntity('cards', 'ord');
  await Promise.all([a, b, c]);
  assert.deepEqual(seen, ['POST', 'PUT', 'DELETE']);
}

// ── 5. Різні обʼєкти не чекають одне на одного ───────────────────────────────
reset();
{
  const started: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  handler = async c => { started.push(c.body?.id ?? c.url); if (c.body?.id === 'slow') await gate; return ok(); };
  const slow = createEntity('cards', card('slow'));
  await createEntity('cards', card('fast'));
  assert.ok(started.includes('fast'), 'швидкий не чекав повільного');
  release();
  await slow;
}

// ── 6. Немає звʼязку (Safari: TypeError «Load failed») → черга, а не втрата ──
reset();
errors = [];
handler = netFail;
await createEntity('cards', card('off1'));                      // не кидає: запис відкладено
assert.equal(queue().length, 1, 'запит у черзі');
assert.equal(pendingWrites.unsettledCount, 1, 'запис лишається «в дорозі»');
assert.equal(errors.length, 0, 'це не помилка — просто немає зв’язку');
{
  const merged = pendingWrites.overlay({ cards: [] } as any, pendingWrites.fetchStart());
  assert.deepEqual(merged.cards.map((c: any) => c.id), ['off1'], 'відкладена задача видна');
}

// Зв'язок повернувся, але створення ще в черзі: зміна має стати в чергу слідом
handler = ok;
calls = [];
await updateEntity('cards', 'off1', { title: 'змінено офлайн' });
assert.equal(calls.length, 0, 'зміна не обігнала створення');
assert.deepEqual(queue().map((q: any) => q.options.method), ['POST', 'PUT']);
assert.ok(!JSON.stringify(queue()).includes('tok'), 'токен у чергу не потрапляє');

// ── 7. Відправка черги: по порядку, з актуальним токеном ─────────────────────
calls = [];
store.set('auth_token', 'fresh');
const sent = await processOfflineQueue();
assert.equal(sent, 2);
assert.deepEqual(calls.map(c => c.method), ['POST', 'PUT']);
assert.equal(queue().length, 0);
assert.equal(pendingWrites.unsettledCount, 0, 'після відправки все підтверджено');
store.set('auth_token', 'tok');

// ── 8. Дві одночасні відправки не дублюють запити ────────────────────────────
reset();
handler = netFail;
await createEntity('cards', card('dup1'));
handler = async () => { await new Promise(r => setTimeout(r, 30)); return ok(); };
calls = [];
const [r1, r2] = await Promise.all([processOfflineQueue(), processOfflineQueue()]);
assert.equal(calls.length, 1, 'запит пішов один раз');
assert.equal(r1, r2);

// ── 9. Запис, доданий під час відправки черги, не губиться ───────────────────
reset();
handler = netFail;
await createEntity('cards', card('q1'));
await createEntity('cards', card('q2'));
{
  let injected = false;
  handler = async c => {
    if (!injected) {
      injected = true;
      handler = netFail;                                      // зв'язок знову зник
      await createEntity('cards', card('late'));               // і ще один запис у цей момент
    }
    return ok();
  };
  // перший запит пройде, під час нього додається 'late', на другому зв'язок падає
  await processOfflineQueue();
  const left = queue().map((q: any) => q.options.body.id);
  assert.deepEqual(left, ['q2', 'late'], 'нерозіслане й нове лишились у черзі');
}

// ── 10. Невдача при відправці: 4xx — відкидаємо й повідомляємо; 5xx — лишаємо ─
reset();
errors = [];
handler = netFail;
await createEntity('cards', card('rej'));
await updateEntity('cards', 'rej', { title: 'x' });
await createEntity('cards', card('keep'));
handler = c => (c.body?.id === 'rej' ? status(400) : ok());
await processOfflineQueue();
assert.equal(errors.length, 1, 'про відхилене створення повідомлено');
assert.equal(errors[0].status, 400);
assert.deepEqual(queue(), [], 'відхилене прибрано, зміна «привида» не відправлена, решта пішла');

reset();
errors = [];
handler = netFail;
await createEntity('cards', card('srv1'));
await createEntity('cards', card('srv2'));
handler = () => status(503);
calls = [];
await processOfflineQueue();
assert.equal(calls.length, 1, 'після збою сервера далі не йдемо — порядок важливий');
assert.equal(queue().length, 2, 'запити не загубились через мить збою');
assert.equal(queue()[0].attempts, 1);
assert.equal(errors.length, 0);
// Безнадійний запит врешті відкидається
for (let i = 0; i < 4; i++) await processOfflineQueue();
assert.equal(errors.length, 1, 'після кількох невдач користувач дізнається');
assert.equal(queue().length, 1, 'перший прибрано, другий чекає');
handler = ok;
await processOfflineQueue();
assert.equal(queue().length, 0);

// ── 11. Повна синхронізація стану: дублі в черзі схлопуються ─────────────────
reset();
handler = netFail;
await api.syncState({ users: [], lists: [], cards: [{ id: 'v1' }], tags: [], contentPlans: [] } as any);
await api.syncState({ users: [], lists: [], cards: [{ id: 'v2' }], tags: [], contentPlans: [] } as any);
assert.equal(queue().length, 1, 'лишається найновіша');
assert.equal(queue()[0].options.body.cards[0].id, 'v2');

// ── 12. Пошкоджена черга не ламає застосунок ─────────────────────────────────
reset();
store.set('offline_queue', '{ не json');
handler = ok;
assert.equal(await processOfflineQueue(), 0);
handler = netFail;
await createEntity('cards', card('afterbad'));
assert.equal(queue().length, 1);

console.log('apiWrites tests passed');
process.exit(0);

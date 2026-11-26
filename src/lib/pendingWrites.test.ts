import assert from 'node:assert/strict';
import { PendingWrites, describeQueued, writeErrorMessage } from './pendingWrites';

const card = (id: string, extra: any = {}) => ({ id, title: 't' + id, ...extra });
const server = (cards: any[] = [], extra: any = {}) => ({ cards, lists: [], ...extra });

// ── Головний сценарій: опитування, що почалось ДО створення, не стирає задачу ──
{
  const pw = new PendingWrites();
  const started = pw.fetchStart();            // відповідь «застаріла» — запит пішов раніше
  const op = pw.begin('create', 'cards', 'c1', card('c1'));
  // Запис ще в дорозі, а стара відповідь сервера (без картки) вже прийшла
  const merged = pw.overlay(server([card('a')]), started);
  assert.deepEqual(merged.cards.map((c: any) => c.id), ['a', 'c1'], 'нова задача пережила застаріле опитування');

  // Запис підтвердився, але відповідь на опитування (що почалось до цього) приходить ще пізніше
  pw.settle(op);
  const merged2 = pw.overlay(server([card('a')]), started);
  assert.deepEqual(merged2.cards.map((c: any) => c.id), ['a', 'c1'], 'і після підтвердження, якщо опитування почалось раніше');
}

// ── Опитування, що почалось ПІСЛЯ підтвердження, вже бачить задачу на сервері ──
{
  const pw = new PendingWrites();
  const op = pw.begin('create', 'cards', 'c1', card('c1'));
  pw.settle(op);
  const started = pw.fetchStart();
  // Сервер відповів без c1 — значить її хтось видалив; накладати не можна
  const merged = pw.overlay(server([card('a')]), started);
  assert.deepEqual(merged.cards.map((c: any) => c.id), ['a'], 'чуже видалення після нашого запису не скасовуємо');
}

// ── Якщо сервер уже має обʼєкт, його версія не перезаписується нашою ─────────
{
  const pw = new PendingWrites();
  const started = pw.fetchStart();
  pw.begin('create', 'cards', 'c1', card('c1', { title: 'наша' }));
  const merged = pw.overlay(server([card('c1', { title: 'серверна' })]), started);
  assert.equal(merged.cards.length, 1, 'без дубля');
  assert.equal(merged.cards[0].title, 'серверна');
}

// ── Оновлення накладаються поверх свіжого стану, не втрачаючи чужих полів ────
{
  const pw = new PendingWrites();
  const started = pw.fetchStart();
  pw.begin('update', 'cards', 'c1', { title: 'нова назва' });
  const merged = pw.overlay(server([card('c1', { title: 'стара', deadline: '2026-01-01' })]), started);
  assert.equal(merged.cards[0].title, 'нова назва');
  assert.equal(merged.cards[0].deadline, '2026-01-01', 'чужі поля лишились');
}

// ── Оновлення неіснуючого обʼєкта нічого не створює ──────────────────────────
{
  const pw = new PendingWrites();
  const started = pw.fetchStart();
  pw.begin('update', 'cards', 'ghost', { estimatedMinutes: 30 });
  const merged = pw.overlay(server([]), started);
  assert.equal(merged.cards.length, 0, 'не створює «привида» з одним полем');
}

// ── Видалення не воскресає зі застарілою відповіддю ──────────────────────────
{
  const pw = new PendingWrites();
  const started = pw.fetchStart();
  pw.begin('delete', 'cards', 'c1');
  const merged = pw.overlay(server([card('c1'), card('c2')]), started);
  assert.deepEqual(merged.cards.map((c: any) => c.id), ['c2']);
}

// ── Порядок: створив → змінив → видалив ──────────────────────────────────────
{
  const pw = new PendingWrites();
  const started = pw.fetchStart();
  pw.begin('create', 'cards', 'c1', card('c1'));
  pw.begin('update', 'cards', 'c1', { title: 'змінена' });
  let merged = pw.overlay(server([]), started);
  assert.equal(merged.cards[0].title, 'змінена');
  pw.begin('delete', 'cards', 'c1');
  merged = pw.overlay(server([]), started);
  assert.equal(merged.cards.length, 0);
}

// ── Невдалий запис більше не накладається: локальна зміна відкочується ───────
{
  const pw = new PendingWrites();
  const started = pw.fetchStart();
  const op = pw.begin('create', 'cards', 'c1', card('c1'));
  pw.fail(op);
  const merged = pw.overlay(server([card('a')]), started);
  assert.deepEqual(merged.cards.map((c: any) => c.id), ['a'], 'задача, яку не вдалось зберегти, зникає разом із повідомленням про помилку');
}

// ── Вхід не мутується; без записів повертається той самий обʼєкт ─────────────
{
  const pw = new PendingWrites();
  const s = server([card('a')]);
  assert.equal(pw.overlay(s, pw.fetchStart()), s);
  const started = pw.fetchStart();
  pw.begin('create', 'cards', 'c1', card('c1'));
  const merged = pw.overlay(s, started);
  assert.equal(s.cards.length, 1, 'оригінал не змінено');
  assert.notEqual(merged, s);
}

// ── Колекції, яких у відповіді немає, створюються ────────────────────────────
{
  const pw = new PendingWrites();
  const started = pw.fetchStart();
  pw.begin('create', 'tags', 't1', { id: 't1', name: 'x' });
  const merged: any = pw.overlay({ cards: [] } as any, started);
  assert.deepEqual(merged.tags, [{ id: 't1', name: 'x' }]);
}

// ── Повна синхронізація стану блокує підміну ─────────────────────────────────
{
  const pw = new PendingWrites();
  const before = pw.fetchStart();
  const sync = pw.begin('state', 'state', 'state');
  assert.equal(pw.stateSyncInFlight(before), true, 'поки йде');
  pw.settle(sync);
  assert.equal(pw.stateSyncInFlight(before), true, 'завершилась після початку завантаження — відповідь застаріла');
  assert.equal(pw.stateSyncInFlight(pw.fetchStart()), false, 'нове завантаження вже безпечне');
}
{
  const pw = new PendingWrites();
  pw.begin('state', 'state', 'state', undefined, 1000);
  assert.equal(pw.stateSyncInFlight(pw.fetchStart(), 1000 + 60_000), true);
  assert.equal(pw.stateSyncInFlight(pw.fetchStart(), 1000 + 3 * 60_000), false, 'завислий запис не блокує вічно');
}

// ── Офлайн-черга ─────────────────────────────────────────────────────────────
{
  const pw = new PendingWrites();
  const op = pw.begin('create', 'cards', 'c1', card('c1'));
  assert.equal(pw.hasQueuedFor('cards', 'c1'), false);
  op.queueId = 'q1';
  assert.equal(pw.hasQueuedFor('cards', 'c1'), true, 'наступні записи цього обʼєкта мають іти в чергу слідом');
  assert.equal(pw.byQueueId('q1'), op);
  pw.settle(op);
  assert.equal(pw.hasQueuedFor('cards', 'c1'), false);
}

assert.deepEqual(
  describeQueued({ id: 'q', url: '/api/entity/cards', options: { method: 'POST', body: { id: 'c1', title: 'x' } } }),
  { kind: 'create', type: 'cards', id: 'c1', data: { id: 'c1', title: 'x' }, queueId: 'q' },
);
assert.deepEqual(
  describeQueued({ id: 'q', url: '/api/entity/cards/c1', options: { method: 'PUT', body: { title: 'y' } } }),
  { kind: 'update', type: 'cards', id: 'c1', data: { title: 'y' }, queueId: 'q' },
);
assert.equal(describeQueued({ id: 'q', url: '/api/entity/cards/c1', options: { method: 'DELETE' } })?.kind, 'delete');
assert.equal(describeQueued({ id: 'q', url: '/api/state', options: { method: 'POST', body: {} } })?.kind, 'state');
assert.equal(describeQueued({ id: 'q', url: '/api/other', options: { method: 'POST' } }), null);
assert.equal(describeQueued({ id: 'q', url: '/api/entity/cards', options: { method: 'POST', body: {} } }), null, 'створення без id не відновлюємо');

// ── Тексти помилок ───────────────────────────────────────────────────────────
assert.match(writeErrorMessage('create', 'cards', 500), /створити задачу.*код 500/);
assert.match(writeErrorMessage('update', 'cards', 401), /Увійдіть знову/);
assert.match(writeErrorMessage('delete', 'lists', null), /видалити список.*немає звʼязку/);
assert.match(writeErrorMessage('update', 'weird', 403), /немає прав/);

console.log('pendingWrites tests passed');

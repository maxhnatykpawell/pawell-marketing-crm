import assert from 'node:assert/strict';
import { parseSubscription, chatPushTargets, chatPushPayload } from './push';

// ── підписка
const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'P', auth: 'A' }, extra: 'x' };
assert.deepEqual(parseSubscription(good), { endpoint: good.endpoint, keys: { p256dh: 'P', auth: 'A' } }); // зайве відкинуто
assert.equal(parseSubscription(null), null);
assert.equal(parseSubscription({}), null);
assert.equal(parseSubscription({ ...good, endpoint: 'http://insecure.example/x' }), null);   // лише https
assert.equal(parseSubscription({ ...good, endpoint: 'not a url' }), null);
assert.equal(parseSubscription({ ...good, keys: { p256dh: 'P' } }), null);                    // немає auth
assert.equal(parseSubscription({ ...good, endpoint: 'https://x.example/' + 'a'.repeat(3000) }), null);

// ── кому слати
const all = ['u1', 'u2', 'u3', 'u4'];
// відкритий канал: усі, крім автора
assert.deepEqual(chatPushTargets({ recipients: null, allUserIds: all, authorId: 'u1', mentioned: [] }), ['u2', 'u3', 'u4']);
// закрита розмова: лише учасники
assert.deepEqual(chatPushTargets({ recipients: ['u1', 'u3'], allUserIds: all, authorId: 'u1', mentioned: [] }), ['u3']);
// DM: співрозмовник
assert.deepEqual(chatPushTargets({ recipients: ['u2', 'u4'], allUserIds: all, authorId: 'u2', mentioned: [] }), ['u4']);
// згаданих пропускаємо: вони отримають окреме сповіщення
assert.deepEqual(chatPushTargets({ recipients: null, allUserIds: all, authorId: 'u1', mentioned: ['u3'] }), ['u2', 'u4']);
// сам собі не шлемо, навіть якщо згадав себе
assert.deepEqual(chatPushTargets({ recipients: null, allUserIds: all, authorId: 'u1', mentioned: ['u1'] }), ['u2', 'u3', 'u4']);

// ── текст
const dm = chatPushPayload({ conversationId: 'c1', kind: 'dm', authorName: 'Ірина', text: 'Привіт!\nЗазирни в задачу' });
assert.equal(dm.title, 'Ірина');
assert.equal(dm.body, 'Привіт! Зазирни в задачу');   // переноси згладжено
assert.equal(dm.tag, 'chat-c1');
assert.equal(dm.url, '/?view=chat&chat=c1');
const ch = chatPushPayload({ conversationId: 'general', kind: 'channel', channelTitle: 'Загальний', authorName: 'Марек', text: 'x'.repeat(300) });
assert.equal(ch.title, 'Марек · Загальний');
assert.equal(ch.body.length, 120);
assert.ok(ch.body.endsWith('…'));

console.log('push tests passed');

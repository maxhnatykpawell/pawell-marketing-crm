import express from 'express';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'node:assert/strict';
import { registerChatRoutes } from '../chat-server';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-smoke-'));
const pushes: { users: string[]; payload: any }[] = [];
const notes: any[] = [];

const users = [
  { id: 'u1', name: 'Олег Іваненко' },
  { id: 'u2', name: 'Марія Коваль' },
  { id: 'u3', name: 'Іван Шевчук' },
];

const app = express();
app.use(express.json());
const requireAuth: express.RequestHandler = (req, _res, next) => {
  const id = String(req.header('x-user') || 'u1');
  (req as any).user = { userId: id, role: id === 'u1' ? 'admin' : 'member' };
  next();
};

registerChatRoutes(app, {
  requireAuth,
  getFirestore: () => null, // жодного Firestore: лише тимчасовий файл
  getUsers: async () => users,
  sendTelegram: async () => ({ success: true }),
  saveNotification: async n => { notes.push(n); },
  pushToUsers: async (ids, payload) => { pushes.push({ users: ids, payload }); return ids.length; },
  localDir: dir,
});

const server = http.createServer(app).listen(0);
const port = (server.address() as any).port;

async function call(user: string, method: string, url: string, body?: any) {
  const res = await fetch(`http://127.0.0.1:${port}${url}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-user': user },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
const tick = () => new Promise(r => setTimeout(r, 80));

(async () => {
  // Канал із трьох
  let r = await call('u1', 'POST', '/api/chat/conversations', { kind: 'channel', title: 'реклама', memberIds: ['u2', 'u3'] });
  assert.equal(r.status, 200);
  const ch = r.json.conversation.id;

  // u3 вимикає сповіщення, u2 — лише згадки
  assert.equal((await call('u3', 'PUT', `/api/chat/conversations/${ch}/notify`, { level: 'none' })).status, 200);
  assert.equal((await call('u2', 'PUT', `/api/chat/conversations/${ch}/notify`, { level: 'mentions' })).status, 200);
  assert.equal((await call('u2', 'PUT', `/api/chat/conversations/${ch}/notify`, { level: 'bogus' })).status, 400);

  // Звичайне повідомлення: пуш нікому (u2 лише згадки, u3 вимкнено)
  r = await call('u1', 'POST', '/api/chat/messages', { conversationId: ch, text: 'всім привіт' });
  assert.equal(r.status, 200);
  await tick();
  assert.deepEqual(pushes.at(-1)?.users, [], 'пуш має бути порожнім для тих, хто обмежив сповіщення');

  // Згадка u2: лічильник згадок + дзвіночок
  r = await call('u1', 'POST', '/api/chat/messages', { conversationId: ch, text: 'Марія Коваль, глянь це *терміново*' });
  const mentionMsg = r.json.message;
  // Парсер знаходить @-згадки: перевіримо з @
  r = await call('u1', 'POST', '/api/chat/messages', { conversationId: ch, text: '@Марія Коваль глянь' });
  await tick();
  assert.deepEqual(r.json.message.mentions, ['u2']);
  let list = (await call('u2', 'GET', '/api/chat/conversations')).json.conversations;
  let mine = list.find((c: any) => c.id === ch);
  assert.equal(mine.notify, 'mentions');
  assert.equal(mine.mentionUnread, 1, 'лічильник згадок');
  assert.ok(mine.unread >= 3);
  assert.ok(notes.some(n => n.userId === 'u2' && n.link === `/?view=chat&chat=${ch}`), 'дзвіночок із посиланням на розмову');

  // Прочитано — лічильник згадок обнуляється
  await call('u2', 'POST', '/api/chat/read', { conversationId: ch });
  list = (await call('u2', 'GET', '/api/chat/conversations')).json.conversations;
  assert.equal(list.find((c: any) => c.id === ch).mentionUnread, 0);

  // Відповідь: цитата береться з бази, а не від клієнта
  r = await call('u2', 'POST', '/api/chat/messages', { conversationId: ch, text: 'ок', replyToId: mentionMsg.id, replyTo: { preview: 'ПІДРОБКА' } });
  assert.equal(r.json.message.replyTo.id, mentionMsg.id);
  assert.ok(!r.json.message.replyTo.preview.includes('ПІДРОБКА'));
  assert.ok(r.json.message.replyTo.preview.includes('терміново'));

  // Вкладення: чужі адреси відсікаються, зображення визначається за ім'ям
  r = await call('u2', 'POST', '/api/chat/messages', {
    conversationId: ch, text: '',
    attachments: [
      { name: 'фото.png', url: '/uploads/a.png', isImage: false },
      { name: 'x.png', url: 'https://evil.test/x.png' },
      { name: 'p', url: '/uploads/../server.ts' },
      { name: 'звіт.pdf', url: '/uploads/z.pdf' },
    ],
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.message.attachments, [
    { name: 'фото.png', url: '/uploads/a.png', isImage: true },
    { name: 'звіт.pdf', url: '/uploads/z.pdf', isImage: false },
  ]);
  const fileMsg = r.json.message;
  // Порожнє без файлів — відмова
  assert.equal((await call('u2', 'POST', '/api/chat/messages', { conversationId: ch, text: '  ' })).status, 400);
  // Превʼю розмови для вкладення
  list = (await call('u1', 'GET', '/api/chat/conversations')).json.conversations;
  assert.match(list.find((c: any) => c.id === ch).lastMessagePreview, /фото\.png \+1/);

  // Реакції: додати, ще один, зняти
  r = await call('u1', 'POST', `/api/chat/messages/${fileMsg.id}/reactions`, { conversationId: ch, emoji: '👍' });
  assert.deepEqual(r.json.message.reactions, { '👍': ['u1'] });
  r = await call('u3', 'POST', `/api/chat/messages/${fileMsg.id}/reactions`, { conversationId: ch, emoji: '👍' });
  assert.deepEqual(r.json.message.reactions, { '👍': ['u1', 'u3'] });
  r = await call('u1', 'POST', `/api/chat/messages/${fileMsg.id}/reactions`, { conversationId: ch, emoji: '👍' });
  r = await call('u3', 'POST', `/api/chat/messages/${fileMsg.id}/reactions`, { conversationId: ch, emoji: '👍' });
  assert.deepEqual(r.json.message.reactions, {}, 'знята реакція не «воскресає»');
  assert.equal((await call('u1', 'POST', `/api/chat/messages/${fileMsg.id}/reactions`, { conversationId: ch, emoji: 'x'.repeat(40) })).status, 400);
  const hist = (await call('u1', 'GET', `/api/chat/messages?conversationId=${ch}`)).json.messages;
  assert.deepEqual(hist.find((m: any) => m.id === fileMsg.id).reactions, {});

  // Керування каналом: тема — будь-який учасник; назва — лише власник
  assert.equal((await call('u2', 'PATCH', `/api/chat/conversations/${ch}`, { topic: 'Рекламні кампанії' })).status, 200);
  assert.equal((await call('u2', 'PATCH', `/api/chat/conversations/${ch}`, { title: 'зламав' })).status, 403);
  assert.equal((await call('u1', 'PATCH', `/api/chat/conversations/${ch}`, { title: 'ads' })).json.conversation.title, 'ads');

  // Чужа людина не бачить закритий канал
  users.push({ id: 'u4', name: 'Стороння Особа' });
  assert.equal((await call('u4', 'PATCH', `/api/chat/conversations/${ch}`, { topic: 'x' })).status, 403);
  assert.equal((await call('u4', 'POST', `/api/chat/conversations/${ch}/archive`)).status, 403);

  // Додати учасника: тільки відомі користувачі
  r = await call('u1', 'POST', `/api/chat/conversations/${ch}/members`, { userIds: ['u4', 'ghost'] });
  assert.deepEqual(r.json.conversation.memberIds.sort(), ['u1', 'u2', 'u3', 'u4']);

  // Прибрати учасника: учасник не може прибрати чужого, але може вийти сам
  assert.equal((await call('u2', 'DELETE', `/api/chat/conversations/${ch}/members/u3`)).status, 403);
  assert.equal((await call('u4', 'DELETE', `/api/chat/conversations/${ch}/members/u4`)).status, 200);
  assert.equal((await call('u1', 'DELETE', `/api/chat/conversations/${ch}/members/u3`)).status, 200);
  assert.equal((await call('u3', 'GET', `/api/chat/messages?conversationId=${ch}`)).status, 403, 'прибраний більше не читає історію');

  // Загальний канал: не архівується, не перейменовується, з нього не виходять
  list = (await call('u2', 'GET', '/api/chat/conversations')).json.conversations;
  assert.ok(list.some((c: any) => c.id === 'general'));
  assert.equal((await call('u1', 'POST', '/api/chat/conversations/general/archive')).status, 400);
  assert.equal((await call('u1', 'PATCH', '/api/chat/conversations/general', { title: 'x' })).status, 403);
  assert.equal((await call('u2', 'DELETE', '/api/chat/conversations/general/members/u2')).status, 400);

  // Архівація власником
  assert.equal((await call('u2', 'POST', `/api/chat/conversations/${ch}/archive`)).status, 403);
  assert.equal((await call('u1', 'POST', `/api/chat/conversations/${ch}/archive`)).status, 200);
  list = (await call('u1', 'GET', '/api/chat/conversations')).json.conversations;
  assert.ok(!list.some((c: any) => c.id === ch), 'архівований канал зникає зі списку');

  // DM: пуш іде при режимі «лише згадки», бо в особистих усе адресоване людині
  r = await call('u1', 'POST', '/api/chat/conversations', { kind: 'dm', peerId: 'u2' });
  const dm = r.json.conversation.id;
  await call('u2', 'PUT', `/api/chat/conversations/${dm}/notify`, { level: 'mentions' });
  pushes.length = 0;
  await call('u1', 'POST', '/api/chat/messages', { conversationId: dm, text: 'привіт' });
  await tick();
  assert.deepEqual(pushes.at(-1)?.users, ['u2']);
  assert.match(pushes.at(-1)!.payload.url, new RegExp(`chat=${encodeURIComponent(dm)}`));

  // Редагування видаленого заборонено
  const m1 = (await call('u1', 'POST', '/api/chat/messages', { conversationId: dm, text: 'тест' })).json.message;
  await call('u1', 'DELETE', `/api/chat/messages/${m1.id}?conversationId=${dm}`);
  assert.equal((await call('u1', 'PUT', `/api/chat/messages/${m1.id}`, { conversationId: dm, text: 'знову' })).status, 400);

  console.log('chat smoke: усе пройшло');
  fs.rmSync(dir, { recursive: true, force: true });
  (server as any).closeAllConnections?.();
  server.close();
  // Пауза перед виходом: миттєвий exit під час закриття сокетів на Windows дає службову помилку libuv
  setTimeout(() => process.exit(0), 200);
})().catch(e => {
  console.error('FAIL:', e);
  server.close();
  process.exit(1);
});

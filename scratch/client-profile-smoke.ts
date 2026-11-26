import express from 'express';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'node:assert/strict';
import { registerClientProfileRoutes } from '../client-profile-server';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-smoke-'));
const app = express();
app.use(express.json());
registerClientProfileRoutes(app, {
  requireAuth: (req, _res, next) => { (req as any).user = { userId: 'u1' }; next(); },
  getFirestore: () => null,
  getUsers: async () => [{ id: 'u1', name: 'Олег' }, { id: 'u2', name: 'Марія' }],
  localDir: dir,
});
const server = http.createServer(app).listen(0);
const port = (server.address() as any).port;

async function call(method: string, url: string, body?: any) {
  const res = await fetch(`http://127.0.0.1:${port}${url}`, {
    method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
}

(async () => {
  assert.deepEqual((await call('GET', '/api/client-profiles')).json, { items: {} });

  // Призначення: автора й час ставить сервер, зайві поля відкидаються
  let r = await call('PUT', '/api/client-profiles/c1', { responsibleUserId: 'u2', updatedBy: 'Хакер', evil: 1 });
  assert.equal(r.status, 200);
  assert.equal(r.json.item.responsibleUserId, 'u2');
  assert.equal(r.json.item.updatedBy, 'Олег', 'автора визначає сервер');
  assert.equal(r.json.item.evil, undefined);

  // Відповідальним може бути лише користувач команди
  r = await call('PUT', '/api/client-profiles/c2', { responsibleUserId: 'stranger' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /Невідомий користувач/);
  assert.deepEqual((await call('GET', '/api/client-profiles')).json.items.c2, undefined, 'нічого не збережено');

  // Зміна відповідального замінює, а не накопичує
  await call('PUT', '/api/client-profiles/c1', { responsibleUserId: 'u1' });
  let all = (await call('GET', '/api/client-profiles')).json.items;
  assert.equal(all.c1.responsibleUserId, 'u1');

  // Порожній профіль прибирає призначення (знову діє те, що в KeepInCRM)
  r = await call('PUT', '/api/client-profiles/c1', {});
  assert.equal(r.json.item, null);
  all = (await call('GET', '/api/client-profiles')).json.items;
  assert.deepEqual(all, {});

  // Сміття на вході — теж порожній профіль, а не помилка й не запис
  r = await call('PUT', '/api/client-profiles/c3', { responsibleUserId: 123 });
  assert.equal(r.json.item, null);

  // Небезпечний id клієнта
  assert.equal((await call('PUT', '/api/client-profiles/' + encodeURIComponent('a/b'), { responsibleUserId: 'u1' })).status, 400);
  assert.equal((await call('PUT', '/api/client-profiles/' + encodeURIComponent('../x'), { responsibleUserId: 'u1' })).status, 400);

  console.log('client profile smoke: усе пройшло');
  fs.rmSync(dir, { recursive: true, force: true });
  (server as any).closeAllConnections?.();
  server.close();
  // Пауза перед виходом: миттєвий exit під час закриття сокетів на Windows дає службову помилку libuv
  setTimeout(() => process.exit(0), 200);
})().catch(e => { console.error('FAIL:', e); server.close(); process.exit(1); });

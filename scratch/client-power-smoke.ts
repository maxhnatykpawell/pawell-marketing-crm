import express from 'express';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'node:assert/strict';
import { registerClientPowerRoutes } from '../client-power-server';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'power-smoke-'));
const app = express();
app.use(express.json());
registerClientPowerRoutes(app, {
  requireAuth: (req, _res, next) => { (req as any).user = { userId: 'u1' }; next(); },
  getFirestore: () => null,
  getUserName: async id => (id === 'u1' ? 'Олег' : null),
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
  assert.deepEqual((await call('GET', '/api/client-power')).json, { items: {} });

  // Збереження: усе зайве відкидається, підпис автора ставить сервер
  let r = await call('PUT', '/api/client-power/c1', {
    potentialUah: 2_000_000, contractSize: 'large', contacts: 6, fullAccount: true, framework: true,
    evil: '<script>', updatedBy: 'Хакер', updatedAt: '2000-01-01',
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.item.updatedBy, 'Олег', 'автора визначає сервер, а не тіло запиту');
  assert.notEqual(r.json.item.updatedAt, '2000-01-01');
  assert.equal(r.json.item.evil, undefined);
  assert.equal(r.json.item.fullAccount, true);

  // Контакти — довідка, а «повний акаунт» — окрема позначка, що від них не залежить
  r = await call('PUT', '/api/client-power/c2', { contacts: 3, fullAccount: true });
  assert.equal(r.json.item.fullAccount, true);
  assert.equal(r.json.item.contacts, 3);

  // Некоректні значення відкидаються, а не стають нулем
  r = await call('PUT', '/api/client-power/c3', { potentialUah: -1, contacts: 'багато', contractSize: 'huge' });
  assert.equal(r.json.item, null, 'порожня оцінка — запису немає');

  let all = (await call('GET', '/api/client-power')).json.items;
  assert.deepEqual(Object.keys(all).sort(), ['c1', 'c2']);

  // Нова оцінка ЗАМІНЮЄ стару повністю: прибране поле не лишається
  r = await call('PUT', '/api/client-power/c1', { contacts: 2 });
  assert.equal(r.json.item.potentialUah, undefined);
  assert.equal(r.json.item.contractSize, undefined);
  assert.equal(r.json.item.contacts, 2);

  // Порожня оцінка видаляє запис
  await call('PUT', '/api/client-power/c2', {});
  all = (await call('GET', '/api/client-power')).json.items;
  assert.deepEqual(Object.keys(all), ['c1']);

  // Небезпечний id клієнта
  assert.equal((await call('PUT', '/api/client-power/' + encodeURIComponent('a/b'), { contacts: 1 })).status, 400);
  assert.equal((await call('PUT', '/api/client-power/' + encodeURIComponent('../x'), { contacts: 1 })).status, 400);

  console.log('client power smoke: усе пройшло');
  fs.rmSync(dir, { recursive: true, force: true });
  (server as any).closeAllConnections?.();
  server.close();
  // Пауза перед виходом: миттєвий exit під час закриття сокетів на Windows дає службову помилку libuv
  setTimeout(() => process.exit(0), 200);
})().catch(e => { console.error('FAIL:', e); server.close(); process.exit(1); });

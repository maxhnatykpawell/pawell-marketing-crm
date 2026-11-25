/**
 * Web Push: сповіщення на пристрій, навіть коли застосунок закритий.
 *
 * Як це влаштовано:
 *  - Браузер/телефон видає підписку (адреса пуш-сервісу + ключі). Ми зберігаємо її
 *    за користувачем і шлемо туди через бібліотеку web-push, підписуючи запити
 *    ключами VAPID (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY у змінних середовища).
 *  - Без ключів усе вимикається тихо: сервер працює, клієнт бачить enabled=false.
 *  - Підписка, яку пуш-сервіс відхилив як неіснуючу (404/410: застосунок
 *    видалили, дозвіл забрали), стирається, щоб не копичити сміття.
 *  - Одна підписка = один пристрій. Ідентифікатор виводимо з адреси, тож коли
 *    на спільному пристрої заходить інша людина, підписка просто переходить до неї.
 *
 * Сховище те саме, що й у чату: Firestore, а без нього — локальний файл.
 */

import { Express, Request, RequestHandler } from 'express';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import * as webpushModule from 'web-push';
import type admin from 'firebase-admin';
import { parseSubscription, type PushPayload } from './src/lib/push';

export interface PushDeps {
  requireAuth: RequestHandler;
  getFirestore: () => admin.firestore.Firestore | null;
  /** Куди складати файл, коли Firestore не налаштований */
  localDir: string;
}

interface StoredSub {
  id: string;
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  createdAt: string;
}

// web-push — CommonJS-пакет: у збірці (esbuild) і під tsx експорт лежить у різних місцях
const webpush: typeof import('web-push') = (webpushModule as any).default ?? webpushModule;

const COLLECTION = 'crm_push_subscriptions';
const subId = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex').slice(0, 40);

// ── Стан модуля: його задає registerPushRoutes ───────────────────────────────

let configured = false;
let deps: PushDeps | null = null;

export function isPushEnabled(): boolean {
  return configured;
}

/** Підключає ключі з середовища. Повертає false, якщо їх немає. */
function configureVapid(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@pawell.com', pub, priv);
    return true;
  } catch (e: any) {
    console.error('[push] некоректні VAPID-ключі:', e.message);
    return false;
  }
}

// ── Сховище ──────────────────────────────────────────────────────────────────

function localFile(): string {
  return path.join(deps!.localDir, 'push-subscriptions.json');
}

async function listAll(): Promise<StoredSub[]> {
  const db = deps!.getFirestore();
  if (db) {
    const snap = await db.collection(COLLECTION).get();
    return snap.docs.map(d => d.data() as StoredSub);
  }
  try {
    return JSON.parse(fs.readFileSync(localFile(), 'utf8'));
  } catch {
    return [];
  }
}

async function save(sub: StoredSub): Promise<void> {
  const db = deps!.getFirestore();
  if (db) {
    await db.collection(COLLECTION).doc(sub.id).set(sub);
    return;
  }
  const all = (await listAll()).filter(s => s.id !== sub.id);
  all.push(sub);
  fs.mkdirSync(deps!.localDir, { recursive: true });
  fs.writeFileSync(localFile(), JSON.stringify(all, null, 2));
}

async function remove(id: string): Promise<void> {
  const db = deps!.getFirestore();
  if (db) {
    await db.collection(COLLECTION).doc(id).delete();
    return;
  }
  const all = (await listAll()).filter(s => s.id !== id);
  fs.writeFileSync(localFile(), JSON.stringify(all, null, 2));
}

// ── Відправка ────────────────────────────────────────────────────────────────

/**
 * Надіслати пуш усім пристроям вказаних користувачів.
 * Ніколи не кидає помилку: пуш — додаток до основної дії (повідомлення вже збережене).
 * Повертає, скільки пристроїв прийняли сповіщення.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  if (!configured || !deps || userIds.length === 0) return 0;
  try {
    const wanted = new Set(userIds);
    const subs = (await listAll()).filter(s => wanted.has(s.userId));
    const body = JSON.stringify(payload);
    let delivered = 0;

    await Promise.all(subs.map(async s => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, {
          TTL: 60 * 60,          // якщо пристрій офлайн понад годину, сповіщення вже нічого не варте
          urgency: 'high',
        });
        delivered++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await remove(s.id).catch(() => {});
        } else {
          console.error('[push] не вдалося надіслати:', e?.statusCode || e?.message);
        }
      }
    }));
    return delivered;
  } catch (e: any) {
    console.error('[push] помилка розсилки:', e.message);
    return 0;
  }
}

// ── Маршрути ─────────────────────────────────────────────────────────────────

export function registerPushRoutes(app: Express, d: PushDeps): void {
  deps = d;
  configured = configureVapid();
  console.log(configured
    ? '🔔 Web Push увімкнено'
    : '🔕 Web Push вимкнено: немає VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');

  const me = (req: Request) => (req as any).user as { userId: string };

  /** Публічний ключ потрібен браузеру, щоб підписатися. Секретом він не є. */
  app.get('/api/push/key', d.requireAuth, (_req, res) => {
    res.json({ enabled: configured, publicKey: configured ? process.env.VAPID_PUBLIC_KEY : null });
  });

  app.post('/api/push/subscribe', d.requireAuth, async (req, res) => {
    if (!configured) { res.status(503).json({ error: 'Пуш-сповіщення не налаштовані на сервері' }); return; }
    const parsed = parseSubscription(req.body?.subscription);
    if (!parsed) { res.status(400).json({ error: 'Некоректна підписка' }); return; }
    try {
      await save({
        id: subId(parsed.endpoint),
        userId: me(req).userId,
        endpoint: parsed.endpoint,
        keys: parsed.keys,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
        createdAt: new Date().toISOString(),
      });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/push/unsubscribe', d.requireAuth, async (req, res) => {
    const endpoint = String(req.body?.endpoint || '');
    if (!endpoint) { res.status(400).json({ error: 'Не вказано endpoint' }); return; }
    try {
      // Видаляємо лише власну підписку: чужу за адресою зачепити не можна
      const id = subId(endpoint);
      const mine = (await listAll()).find(s => s.id === id && s.userId === me(req).userId);
      if (mine) await remove(id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Тестове сповіщення собі: щоб на місці перевірити, що все дійшло */
  app.post('/api/push/test', d.requireAuth, async (req, res) => {
    if (!configured) { res.status(503).json({ error: 'Пуш-сповіщення не налаштовані на сервері' }); return; }
    const delivered = await sendPushToUsers([me(req).userId], {
      title: 'PAWELL',
      body: 'Сповіщення працюють. Так ви побачите нові повідомлення.',
      url: '/',
      tag: 'push-test',
    });
    res.json({ delivered });
  });
}

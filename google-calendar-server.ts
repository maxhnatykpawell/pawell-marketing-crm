/**
 * Інтеграція з Google Calendar: CRM → календар кожного користувача.
 *
 * ── Модель ───────────────────────────────────────────────────────────────────
 * Кожен підключає власний акаунт Google (OAuth). Сервер зберігає refresh-токен
 * (зашифрованим) і від імені людини:
 *   • створює міти з Google Meet та запрошує учасників;
 *   • дзеркалить у її календар задачі з датою, де вона виконавець, і події, де
 *     вона призначена.
 * Напрямок один — із CRM у Google. Правка дзеркальної події в Google назад не
 * повертається й буде перезаписана при наступній зміні задачі.
 *
 * ── Як дзеркало лишається вірним ─────────────────────────────────────────────
 * Синхронізація чіпляється до маршрутів /api/entity (onEntityChanged), тож
 * працює для будь-якого клієнта й не вимагає правок у ~60 місцях інтерфейсу.
 *  • Звʼязок «користувач + обʼєкт → id події Google» лежить у базі. Без нього
 *    кожна зміна створювала б дубль.
 *  • Відбиток вмісту (hash): якщо календарно значущого не змінилось — у Google
 *    не ходимо. Перетягування картки між колонками міняє лише order/listId.
 *  • Записи одного обʼєкта виконуються по черзі (serial), інакше швидка
 *    послідовність правок створила б дубль події.
 *  • Збій Google ніколи не ламає збереження в CRM: синхронізація йде у фоні й
 *    лише логуються помилки; повторити можна кнопкою «Синхронізувати зараз».
 *
 * ── Безпека ──────────────────────────────────────────────────────────────────
 *  • Запитуємо лише scope calendar.events (події), а не весь календар.
 *  • Параметр state — підписаний JWT на 10 хвилин із userId: callback не має
 *    заголовка Authorization, тож інакше будь-хто міг би «підключити» свій
 *    Google до чужого акаунта CRM.
 *  • Refresh-токен шифрується (AES-256-GCM), у відповідях API його немає.
 */

import { Express, Request, Response, RequestHandler } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import type admin from 'firebase-admin';

import {
  taskCalendarOwner, buildTaskEvent, buildEventItemEvent, resourceHash, validateMeeting,
  buildMeeting, encryptSecret, decryptSecret, linkId, isEmail, eventWindow, taskWindow,
  type GoogleEventResource, type CardLike, type EventLike,
} from './src/lib/googleCalendar';

// ── Залежності від server.ts ──────────────────────────────────────────────────

export interface GoogleUser {
  id: string;
  name: string;
  email?: string;
}

export interface GoogleDeps {
  requireAuth: RequestHandler;
  getFirestore: () => admin.firestore.Firestore | null;
  getUsers: () => Promise<GoogleUser[]>;
  /** Один обʼєкт за id (без читання всього стану) */
  getEntity: (type: 'cards' | 'events' | 'projects', id: string) => Promise<any | null>;
  /** Обʼєкти, повʼязані з людиною: задачі, де вона виконавець; події, де вона призначена */
  listEntitiesForUser: (type: 'cards' | 'events', userId: string) => Promise<any[]>;
  jwtSecret: string;
  localDir: string;
  /** Для тестів: пауза між повторами при 429/5xx */
  retryDelayMs?: number;
}

export interface GoogleCalendarApi {
  /** Викликати після збереження/видалення картки чи події. Не кидає і не блокує. */
  onEntityChanged: (type: string, id: string) => void;
  isConfigured: () => boolean;
}

// ── Налаштування ──────────────────────────────────────────────────────────────

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const CAL_BASE = 'https://www.googleapis.com/calendar/v3';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
const REQUIRED_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const TEAM_TZ = 'Europe/Kyiv';

const ACCOUNTS = 'crm_google_accounts';
const LINKS = 'crm_google_links';

/** Скільки задач максимум підтягуємо при першому підключенні / «Синхронізувати зараз» */
const BACKFILL_LIMIT = 300;
/** Давніші за стільки днів завершені періоди при початковому наповненні не переносимо */
const BACKFILL_PAST_DAYS = 30;
const MEETINGS_PER_HOUR = 30;
const HTTP_TIMEOUT_MS = 15_000;

const env = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirect: process.env.GOOGLE_REDIRECT_URI || '',
  appUrl: process.env.PUBLIC_APP_URL || '',
  tokenKey: process.env.GOOGLE_TOKEN_KEY || '',
});

// ── Типи сховища ──────────────────────────────────────────────────────────────

interface Account {
  userId: string;
  email: string;
  refreshTokenEnc: string;
  connectedAt: string;
  syncTasks: boolean;
  syncEvents: boolean;
  /** Доступ відкликано або токен недійсний — треба підключити знову */
  needsReconnect?: boolean;
  lastSyncAt?: string;
  lastError?: string;
}

interface Link {
  id: string;
  userId: string;
  type: 'card' | 'event';
  entityId: string;
  eventId: string;
  hash: string;
}

interface LocalFile {
  accounts: Record<string, Account>;
  links: Record<string, Link>;
}

/** Firestore не приймає undefined у документах */
const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function assertSafeId(id: string, what: string): void {
  if (!id || id.includes('/') || id.includes('..') || id.length > 200) {
    throw new Error(`Некоректний ідентифікатор ${what}`);
  }
}

function makeStore(deps: GoogleDeps) {
  const file = path.join(deps.localDir, 'google.json');
  const read = (): LocalFile => {
    try {
      if (fs.existsSync(file)) {
        const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
        return { accounts: d.accounts ?? {}, links: d.links ?? {} };
      }
    } catch { /* побитий файл не має валити сервер */ }
    return { accounts: {}, links: {} };
  };
  const write = (d: LocalFile) => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
    fs.renameSync(tmp, file);
  };

  return {
    async getAccount(userId: string): Promise<Account | null> {
      assertSafeId(userId, 'користувача');
      const db = deps.getFirestore();
      if (db) {
        const doc = await db.collection(ACCOUNTS).doc(userId).get();
        return doc.exists ? (doc.data() as Account) : null;
      }
      return read().accounts[userId] ?? null;
    },
    async saveAccount(a: Account): Promise<void> {
      assertSafeId(a.userId, 'користувача');
      const db = deps.getFirestore();
      if (db) { await db.collection(ACCOUNTS).doc(a.userId).set(clean(a)); return; }
      const d = read(); d.accounts[a.userId] = a; write(d);
    },
    async deleteAccount(userId: string): Promise<void> {
      assertSafeId(userId, 'користувача');
      const db = deps.getFirestore();
      if (db) { await db.collection(ACCOUNTS).doc(userId).delete(); return; }
      const d = read(); delete d.accounts[userId]; write(d);
    },
    async countAccounts(): Promise<number> {
      const db = deps.getFirestore();
      if (db) {
        const snap = await db.collection(ACCOUNTS).count().get();
        return snap.data().count;
      }
      return Object.keys(read().accounts).length;
    },

    async getLink(userId: string, type: string, entityId: string): Promise<Link | null> {
      const id = linkId(userId, type, entityId);
      const db = deps.getFirestore();
      if (db) {
        const doc = await db.collection(LINKS).doc(id).get();
        return doc.exists ? (doc.data() as Link) : null;
      }
      return read().links[id] ?? null;
    },
    async saveLink(l: Link): Promise<void> {
      const db = deps.getFirestore();
      if (db) { await db.collection(LINKS).doc(l.id).set(clean(l)); return; }
      const d = read(); d.links[l.id] = l; write(d);
    },
    async deleteLink(id: string): Promise<void> {
      const db = deps.getFirestore();
      if (db) { await db.collection(LINKS).doc(id).delete(); return; }
      const d = read(); delete d.links[id]; write(d);
    },
    async listLinksByEntity(type: string, entityId: string): Promise<Link[]> {
      assertSafeId(entityId, 'обʼєкта');
      const db = deps.getFirestore();
      if (db) {
        const snap = await db.collection(LINKS).where('type', '==', type).where('entityId', '==', entityId).get();
        return snap.docs.map(d => d.data() as Link);
      }
      return Object.values(read().links).filter(l => l.type === type && l.entityId === entityId);
    },
    async listLinksByUser(userId: string): Promise<Link[]> {
      assertSafeId(userId, 'користувача');
      const db = deps.getFirestore();
      if (db) {
        const snap = await db.collection(LINKS).where('userId', '==', userId).get();
        return snap.docs.map(d => d.data() as Link);
      }
      return Object.values(read().links).filter(l => l.userId === userId);
    },
  };
}

// ── Помилки ───────────────────────────────────────────────────────────────────

class GoogleHttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
/** Немає чинного доступу: людина не підключена, відкликала доступ або токен зіпсований */
class GoogleAuthError extends Error {}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Реєстрація ────────────────────────────────────────────────────────────────

export function registerGoogleCalendar(app: Express, deps: GoogleDeps): GoogleCalendarApi {
  const store = makeStore(deps);
  const { requireAuth } = deps;
  const me = (req: Request) => (req as any).user as { userId: string; role: string };

  const isConfigured = () => !!(env().clientId && env().clientSecret);
  const tokenKey = () => env().tokenKey || deps.jwtSecret;

  // Адреса застосунку для посилань у подіях і для redirect_uri
  let seenOrigin = '';
  const originOf = (u: string) => { try { return new URL(u).origin; } catch { return ''; } };
  const requestOrigin = (req: Request) => {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0];
    return `${proto}://${req.get('host')}`;
  };
  const redirectUri = (req: Request) => env().redirect || `${requestOrigin(req)}/api/google/callback`;
  const appUrl = () => env().appUrl || originOf(env().redirect) || seenOrigin || null;

  // ── Токени доступу ──────────────────────────────────────────────────────────

  const tokenCache = new Map<string, { token: string; exp: number }>();
  const refreshing = new Map<string, Promise<string | null>>();

  async function markNeedsReconnect(userId: string, reason: string) {
    tokenCache.delete(userId);
    const acct = await store.getAccount(userId);
    if (acct && !acct.needsReconnect) await store.saveAccount({ ...acct, needsReconnect: true, lastError: reason });
  }

  async function getAccessToken(userId: string): Promise<string | null> {
    const cached = tokenCache.get(userId);
    if (cached && cached.exp - 60_000 > Date.now()) return cached.token;

    // Паралельні запити діляться одним оновленням токена
    const running = refreshing.get(userId);
    if (running) return running;

    const job = (async () => {
      const acct = await store.getAccount(userId);
      if (!acct || acct.needsReconnect) return null;
      const refresh = decryptSecret(acct.refreshTokenEnc, tokenKey());
      if (!refresh) {
        await markNeedsReconnect(userId, 'Не вдалось розшифрувати токен — підключіть Google знову');
        return null;
      }
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env().clientId,
          client_secret: env().clientSecret,
          refresh_token: refresh,
          grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        // invalid_grant — доступ відкликано або токен прострочено остаточно
        if (body.error === 'invalid_grant') {
          await markNeedsReconnect(userId, 'Доступ до календаря відкликано — підключіть Google знову');
          return null;
        }
        throw new GoogleHttpError(res.status, body.error_description || body.error || 'Помилка оновлення токена');
      }
      tokenCache.set(userId, { token: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 });
      return body.access_token as string;
    })().finally(() => refreshing.delete(userId));

    refreshing.set(userId, job);
    return job;
  }

  /**
   * Запит до Calendar API від імені користувача. Один повтор при 401 (токен міг
   * протухнути), кілька повторів із паузою при 429 та 5xx.
   */
  async function calendarApi(
    userId: string, method: string, pathname: string,
    opts: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<{ status: number; body: any }> {
    const url = new URL(CAL_BASE + pathname);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);

    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await getAccessToken(userId);
      if (!token) throw new GoogleAuthError('Google не підключено або доступ відкликано');

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });

      if (res.status === 401) {
        tokenCache.delete(userId);
        if (attempt === 0) continue;
        throw new GoogleAuthError('Google не прийняв токен');
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt < 3) { await sleep((deps.retryDelayMs ?? 500) * 2 ** attempt); continue; }
      }
      const body = res.status === 204 ? null : await res.json().catch(() => null);
      return { status: res.status, body };
    }
    throw new GoogleHttpError(503, 'Google Calendar недоступний');
  }

  const failMessage = (r: { status: number; body: any }) =>
    r.body?.error?.message ? `Google: ${r.body.error.message}` : `Google відповів ${r.status}`;

  // ── Дзеркало: один обʼєкт ───────────────────────────────────────────────────

  /** Записи одного обʼєкта — строго по черзі (інакше швидкі правки породили б дубль події) */
  const chains = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = chains.get(key) ?? Promise.resolve();
    const result = prev.then(task);
    const tail = result.then(() => undefined, () => undefined);
    chains.set(key, tail);
    tail.then(() => { if (chains.get(key) === tail) chains.delete(key); });
    return result;
  }

  /** Створити або оновити дзеркальну подію. Повертає, чи довелось іти в Google. */
  async function upsertMirror(
    userId: string, type: 'card' | 'event', entityId: string, res: GoogleEventResource,
  ): Promise<boolean> {
    const hash = resourceHash(res);
    let link = await store.getLink(userId, type, entityId);
    if (link && link.hash === hash) return false;

    if (link) {
      // start/end із dateTime: null — на випадок, якщо подію в Google перетворили на «з часом»
      const patch = {
        ...res,
        start: { date: res.start.date, dateTime: null },
        end: { date: res.end.date, dateTime: null },
      };
      const r = await calendarApi(userId, 'PATCH', `/calendars/primary/events/${encodeURIComponent(link.eventId)}`, { body: patch });
      if (r.status >= 200 && r.status < 300) {
        await store.saveLink({ ...link, hash });
        return true;
      }
      // Подію видалили в самому Google — створюємо наново
      if (r.status !== 404 && r.status !== 410) throw new GoogleHttpError(r.status, failMessage(r));
      await store.deleteLink(link.id);
    }

    const r = await calendarApi(userId, 'POST', '/calendars/primary/events', { body: res });
    if (r.status < 200 || r.status >= 300 || !r.body?.id) throw new GoogleHttpError(r.status, failMessage(r));
    await store.saveLink({ id: linkId(userId, type, entityId), userId, type, entityId, eventId: r.body.id, hash });
    return true;
  }

  /**
   * Прибрати дзеркальну подію. Звʼязок видаляємо, лише якщо подію справді
   * прибрано (або доступу вже немає): при тимчасовому збої Google звʼязок
   * лишається, і подію приберемо при наступній синхронізації, а не загубимо.
   */
  async function removeMirror(link: Link): Promise<void> {
    try {
      const r = await calendarApi(link.userId, 'DELETE', `/calendars/primary/events/${encodeURIComponent(link.eventId)}`);
      if (!(r.status >= 200 && r.status < 300) && r.status !== 404 && r.status !== 410) {
        throw new GoogleHttpError(r.status, failMessage(r));
      }
    } catch (e) {
      if (!(e instanceof GoogleAuthError)) throw e;
      // Доступу немає — подію все одно не прибрати, звʼязок тримати нема сенсу
    }
    await store.deleteLink(link.id);
  }

  async function syncCard(cardId: string): Promise<void> {
    const card = (await deps.getEntity('cards', cardId)) as CardLike | null;
    const owner = card ? taskCalendarOwner(card) : null;

    // Збій прибирання зі старого календаря не повинен блокувати новий: запам'ятовуємо
    // помилку, доробляємо решту й кидаємо її наприкінці (звʼязок лишився — повторимо)
    let removalError: unknown = null;
    for (const l of await store.listLinksByEntity('card', cardId)) {
      if (l.userId !== owner) {
        try { await removeMirror(l); } catch (e) { removalError ??= e; }
      }
    }

    if (card && owner) {
      const acct = await store.getAccount(owner);
      if (acct && !acct.needsReconnect && acct.syncTasks) {
        const project = card.projectId ? await deps.getEntity('projects', card.projectId) : null;
        const res = buildTaskEvent(card, { appUrl: appUrl(), projectTitle: project?.title ?? null });
        if (res) await upsertMirror(owner, 'card', card.id, res);
      }
    }
    if (removalError) throw removalError;
  }

  async function syncEvent(eventId: string): Promise<void> {
    const ev = (await deps.getEntity('events', eventId)) as EventLike | null;
    const targets = new Set<string>(ev && eventWindow(ev) ? (ev.assigneeIds ?? []) : []);

    let firstError: unknown = null;
    for (const l of await store.listLinksByEntity('event', eventId)) {
      if (!targets.has(l.userId)) {
        try { await removeMirror(l); } catch (e) { firstError ??= e; }
      }
    }

    const res = ev ? buildEventItemEvent(ev, { appUrl: appUrl() }) : null;
    if (ev && res) {
      // Збій в одного виконавця не має лишати без події решту команди
      for (const userId of targets) {
        try {
          const acct = await store.getAccount(userId);
          if (!acct || acct.needsReconnect || !acct.syncEvents) continue;
          await upsertMirror(userId, 'event', ev.id, res);
        } catch (e) { firstError ??= e; }
      }
    }
    if (firstError) throw firstError;
  }

  // ── Хук для server.ts ───────────────────────────────────────────────────────

  // Поки ніхто не підключив календар, кожне збереження задачі не має коштувати
  // жодного читання бази — тому «чи є підключені» кешуємо на короткий час
  let anyAccounts = { value: false, at: 0 };
  const hasAccounts = async (): Promise<boolean> => {
    if (Date.now() - anyAccounts.at < 30_000) return anyAccounts.value;
    anyAccounts = { value: (await store.countAccounts()) > 0, at: Date.now() };
    return anyAccounts.value;
  };
  const invalidateAccounts = () => { anyAccounts = { value: true, at: Date.now() }; };

  function onEntityChanged(type: string, id: string): void {
    if ((type !== 'cards' && type !== 'events') || !isConfigured() || !id) return;
    void (async () => {
      if (!(await hasAccounts())) return;
      await serial(`${type}:${id}`, () => (type === 'cards' ? syncCard(id) : syncEvent(id)));
    })().catch(e => console.error(`[gcal] ${type}/${id}:`, e?.message || e));
  }

  // ── Наповнення й повна звірка для однієї людини ─────────────────────────────

  const syncing = new Set<string>();

  async function reconcileUser(userId: string): Promise<{ synced: number; failed: number }> {
    if (syncing.has(userId)) return { synced: 0, failed: 0 };
    syncing.add(userId);
    let synced = 0;
    let failed = 0;
    let lastError: string | undefined;
    try {
      const threshold = new Date(Date.now() - BACKFILL_PAST_DAYS * 86400_000).toISOString().slice(0, 10);

      const cards = (await deps.listEntitiesForUser('cards', userId)) as CardLike[];
      const events = (await deps.listEntitiesForUser('events', userId)) as EventLike[];

      const cardIds = new Set<string>();
      for (const c of cards) {
        if (taskCalendarOwner(c) !== userId) continue;
        const w = taskWindow(c);
        if (w && w.endExclusive > threshold) cardIds.add(c.id);
        if (cardIds.size >= BACKFILL_LIMIT) break;
      }
      const eventIds = new Set<string>();
      for (const ev of events) {
        const w = eventWindow(ev);
        if (w && w.endExclusive > threshold) eventIds.add(ev.id);
      }
      // Усе, що вже в календарі, теж перевіряємо: його могли виконати, видалити чи передати іншому
      for (const l of await store.listLinksByUser(userId)) {
        (l.type === 'card' ? cardIds : eventIds).add(l.entityId);
      }

      for (const id of cardIds) {
        try { await serial(`cards:${id}`, () => syncCard(id)); synced++; }
        catch (e: any) { failed++; lastError = e?.message; if (e instanceof GoogleAuthError) break; }
      }
      for (const id of eventIds) {
        try { await serial(`events:${id}`, () => syncEvent(id)); synced++; }
        catch (e: any) { failed++; lastError = e?.message; if (e instanceof GoogleAuthError) break; }
      }
    } finally {
      syncing.delete(userId);
      const acct = await store.getAccount(userId);
      if (acct) {
        await store.saveAccount({
          ...acct,
          lastSyncAt: new Date().toISOString(),
          // Помилку не затираємо, якщо вона про відкликаний доступ
          lastError: failed > 0 ? (lastError || 'Частину не вдалось синхронізувати') : (acct.needsReconnect ? acct.lastError : undefined),
        });
      }
    }
    return { synced, failed };
  }

  async function removeAllMirrors(userId: string, only?: 'card' | 'event'): Promise<void> {
    for (const l of await store.listLinksByUser(userId)) {
      if (only && l.type !== only) continue;
      try { await removeMirror(l); } catch (e: any) { console.error('[gcal] прибирання:', e?.message || e); }
    }
  }

  // ── OAuth ───────────────────────────────────────────────────────────────────

  app.get('/api/google/status', requireAuth, async (req, res) => {
    try {
      const acct = await store.getAccount(me(req).userId);
      res.json({
        configured: isConfigured(),
        connected: !!acct,
        email: acct?.email ?? null,
        needsReconnect: !!acct?.needsReconnect,
        syncTasks: acct?.syncTasks ?? true,
        syncEvents: acct?.syncEvents ?? true,
        lastSyncAt: acct?.lastSyncAt ?? null,
        lastError: acct?.lastError ?? null,
        syncing: syncing.has(me(req).userId),
        // Адреса, яку треба вписати в Google Cloud як «Authorized redirect URI»
        redirectUri: redirectUri(req),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/google/connect', requireAuth, (req, res) => {
    if (!isConfigured()) {
      res.status(503).json({ error: 'Інтеграцію з Google не налаштовано на сервері (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)' });
      return;
    }
    if (!env().appUrl && !env().redirect) seenOrigin = requestOrigin(req);
    const state = jwt.sign({ purpose: 'google-oauth', userId: me(req).userId }, deps.jwtSecret, { expiresIn: '10m' });
    const url = new URL(AUTH_URL);
    url.search = new URLSearchParams({
      client_id: env().clientId,
      redirect_uri: redirectUri(req),
      response_type: 'code',
      scope: SCOPES.join(' '),
      // offline + consent: інакше Google може не видати refresh-токен повторно
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    }).toString();
    res.json({ url: url.toString() });
  });

  app.get('/api/google/callback', async (req, res) => {
    const back = (q: string) => res.redirect(`/?view=profile&${q}`);
    try {
      if (req.query.error) return back('google=denied');

      let userId: string;
      try {
        const payload = jwt.verify(String(req.query.state || ''), deps.jwtSecret) as any;
        if (payload.purpose !== 'google-oauth' || !payload.userId) throw new Error('bad state');
        userId = String(payload.userId);
      } catch {
        return back('google=error&reason=state');
      }

      const code = String(req.query.code || '');
      if (!code) return back('google=error&reason=code');

      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env().clientId,
          client_secret: env().clientSecret,
          redirect_uri: redirectUri(req),
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      const tokens: any = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokens.access_token) {
        console.error('[gcal] обмін коду не вдався:', tokens.error_description || tokens.error);
        return back('google=error&reason=exchange');
      }
      // Людина могла зняти галочку доступу до календаря на екрані згоди
      if (!String(tokens.scope || '').split(' ').includes(REQUIRED_SCOPE)) return back('google=error&reason=scope');
      if (!tokens.refresh_token) return back('google=error&reason=norefresh');

      const info: any = await (await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      })).json().catch(() => ({}));

      const existing = await store.getAccount(userId);
      await store.saveAccount({
        userId,
        email: String(info.email || ''),
        refreshTokenEnc: encryptSecret(tokens.refresh_token, tokenKey()),
        connectedAt: new Date().toISOString(),
        syncTasks: existing?.syncTasks ?? true,
        syncEvents: existing?.syncEvents ?? true,
      });
      tokenCache.set(userId, { token: tokens.access_token, exp: Date.now() + (tokens.expires_in ?? 3600) * 1000 });
      invalidateAccounts();

      // Наповнення у фоні: людина не чекає, поки перенесуться всі її задачі
      reconcileUser(userId).catch(e => console.error('[gcal] наповнення:', e?.message || e));
      return back('google=connected');
    } catch (e: any) {
      console.error('[gcal] callback:', e?.message || e);
      return back('google=error&reason=server');
    }
  });

  app.put('/api/google/prefs', requireAuth, async (req, res) => {
    try {
      const { userId } = me(req);
      const acct = await store.getAccount(userId);
      if (!acct) { res.status(409).json({ error: 'Google не підключено' }); return; }
      const next = { ...acct };
      const turnedOff: ('card' | 'event')[] = [];
      let turnedOn = false;

      if (typeof req.body?.syncTasks === 'boolean' && req.body.syncTasks !== acct.syncTasks) {
        next.syncTasks = req.body.syncTasks;
        if (next.syncTasks) turnedOn = true; else turnedOff.push('card');
      }
      if (typeof req.body?.syncEvents === 'boolean' && req.body.syncEvents !== acct.syncEvents) {
        next.syncEvents = req.body.syncEvents;
        if (next.syncEvents) turnedOn = true; else turnedOff.push('event');
      }
      await store.saveAccount(next);
      res.json({ success: true, syncTasks: next.syncTasks, syncEvents: next.syncEvents });

      // Вимкнули — прибираємо вже перенесене; ввімкнули — наповнюємо
      void (async () => {
        for (const t of turnedOff) await removeAllMirrors(userId, t);
        if (turnedOn) await reconcileUser(userId);
      })().catch(e => console.error('[gcal] prefs:', e?.message || e));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/google/sync', requireAuth, async (req, res) => {
    try {
      const { userId } = me(req);
      const acct = await store.getAccount(userId);
      if (!acct) { res.status(409).json({ error: 'Google не підключено' }); return; }
      if (acct.needsReconnect) { res.status(409).json({ error: 'Потрібно підключити Google знову' }); return; }
      if (syncing.has(userId)) { res.json({ started: false, syncing: true }); return; }
      reconcileUser(userId).catch(e => console.error('[gcal] sync:', e?.message || e));
      res.json({ started: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/google/connection', requireAuth, async (req, res) => {
    try {
      const { userId } = me(req);
      const acct = await store.getAccount(userId);
      if (!acct) { res.json({ success: true }); return; }

      // Спершу прибираємо наші дзеркальні події, поки токен ще чинний; міти, які
      // людина створила, лишаються — це справжні зустрічі, а не копії
      await removeAllMirrors(userId);

      const refresh = decryptSecret(acct.refreshTokenEnc, tokenKey());
      if (refresh) {
        await fetch(REVOKE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refresh }),
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        }).catch(() => { /* відкликання — це ввічливість, а не умова */ });
      }
      tokenCache.delete(userId);
      // Залишки звʼязків (якщо прибрати не вдалось) без акаунта нікому не потрібні
      for (const l of await store.listLinksByUser(userId)) await store.deleteLink(l.id);
      await store.deleteAccount(userId);
      invalidateAccounts();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Міти ────────────────────────────────────────────────────────────────────

  const meetingLog = new Map<string, number[]>();

  app.post('/api/google/meetings', requireAuth, async (req, res) => {
    try {
      const { userId } = me(req);
      const acct = await store.getAccount(userId);
      if (!acct || acct.needsReconnect) {
        res.status(409).json({ error: 'Спочатку підключіть Google Календар', code: 'not_connected' });
        return;
      }

      // Не більше N мітів на годину: це розсилає листи стороннім людям
      const now = Date.now();
      const recent = (meetingLog.get(userId) ?? []).filter(t => now - t < 3600_000);
      if (recent.length >= MEETINGS_PER_HOUR) {
        res.status(429).json({ error: 'Забагато мітів за годину. Спробуйте пізніше.' });
        return;
      }

      const b = req.body ?? {};
      const users = await deps.getUsers();
      const skipped: string[] = [];
      const emails: string[] = [];

      for (const id of Array.isArray(b.attendeeUserIds) ? b.attendeeUserIds.slice(0, 100) : []) {
        const u = users.find(x => x.id === String(id));
        // Себе не запрошуємо: пошта в CRM може відрізнятись від Google-акаунта, і тоді
        // організатор отримав би запрошення на власну зустріч
        if (!u || u.id === userId) continue;
        if (u.email && isEmail(u.email)) emails.push(u.email.trim());
        else skipped.push(u.name);
      }
      for (const e of Array.isArray(b.extraEmails) ? b.extraEmails.slice(0, 100) : []) emails.push(String(e).trim());

      // Організатор і так на зустрічі; запрошувати себе листом не треба
      const attendeeEmails = [...new Set(emails.map(e => e.toLowerCase()))].filter(e => e !== acct.email.toLowerCase());

      const input = {
        title: String(b.title ?? ''),
        description: b.description ? String(b.description) : undefined,
        start: String(b.start ?? ''),
        end: String(b.end ?? ''),
        attendeeEmails,
        withMeet: b.withMeet !== false,
      };
      const problem = validateMeeting(input);
      if (problem) { res.status(400).json({ error: problem }); return; }

      const resource = buildMeeting(input, randomUUID(), TEAM_TZ);
      const r = await calendarApi(userId, 'POST', '/calendars/primary/events', {
        query: { conferenceDataVersion: input.withMeet ? '1' : '0', sendUpdates: 'all' },
        body: resource,
      });
      if (r.status < 200 || r.status >= 300) {
        res.status(502).json({ error: failMessage(r) });
        return;
      }
      meetingLog.set(userId, [...recent, now]);

      let event = r.body;
      // Посилання Meet іноді зʼявляється із затримкою — один повторний запит
      if (input.withMeet && !event.hangoutLink) {
        await sleep(deps.retryDelayMs ?? 1200);
        const again = await calendarApi(userId, 'GET', `/calendars/primary/events/${encodeURIComponent(event.id)}`, {
          query: { conferenceDataVersion: '1' },
        });
        if (again.status === 200 && again.body) event = again.body;
      }

      res.json({
        id: event.id,
        htmlLink: event.htmlLink ?? null,
        meetLink: event.hangoutLink ?? null,
        invited: attendeeEmails.length,
        skipped,
      });
    } catch (e: any) {
      if (e instanceof GoogleAuthError) {
        res.status(409).json({ error: 'Потрібно підключити Google знову', code: 'not_connected' });
        return;
      }
      console.error('[gcal] міт:', e?.message || e);
      res.status(500).json({ error: 'Не вдалось створити міт' });
    }
  });

  return { onEntityChanged, isConfigured };
}

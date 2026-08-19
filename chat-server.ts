/**
 * Чат: зберігання, доставка в реальному часі, згадки.
 *
 * ── Чому SSE, а не опитування ────────────────────────────────────────────────
 * Решта системи оновлюється так: раз на 30 с клієнт питає /api/status і, якщо
 * щось змінилось, перетягує ВЕСЬ стан. Для чату це не годиться двічі: 30 секунд
 * затримки — це не розмова, а кожне повідомлення змушувало б усі вкладки
 * перезавантажувати картки, витрати і події.
 *
 * Тому чат живе повністю окремо від глобального стану: власні колекції, власні
 * запити і власний канал доставки — SSE. Сервер тримає відкриті з'єднання і сам
 * штовхає нове повідомлення тим, кому воно призначене. У простої не витрачається
 * жодного читання Firestore.
 *
 * ── Чому це безпечно саме тут ────────────────────────────────────────────────
 * Підписники лежать у пам'яті процесу. Це вимагає, щоб сервер був один — і він
 * один: node-cron розклади й вкладення на диску контейнера вже цього вимагають.
 * Якщо колись з'явиться друга копія сервера, знадобиться спільна шина (Redis
 * pub/sub); місце, яке доведеться змінити, — це publish() і більше нічого.
 *
 * ── Чому повідомлення в підколекції ──────────────────────────────────────────
 * crm_chat_conversations/{id}/messages/{msgId}, а не пласка колекція з полем
 * conversationId. Пласка вимагала б складеного індексу (conversationId + сорт за
 * часом), який Firestore не створює сам: перший же запит упав би з помилкою і
 * посиланням «створіть індекс вручну». У підколекції сортування за одним полем
 * покриває автоматичний індекс — нічого налаштовувати руками не треба.
 */

import { Express, Request, Response, RequestHandler } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type admin from 'firebase-admin';

import {
  canAccess, recipientsOf, parseMentions, previewOf, dmMembers, dmConversationId,
  sortConversations,
} from './src/lib/chat';
import type { ChatConversation, ChatMessage } from './src/types';

// ── Залежності, які дає server.ts ─────────────────────────────────────────────

export interface ChatUser {
  id: string;
  name: string;
  telegramChatId?: string | null;
}

export interface ChatDeps {
  requireAuth: RequestHandler;
  getFirestore: () => admin.firestore.Firestore | null;
  getUsers: () => Promise<ChatUser[]>;
  sendTelegram: (chatId: string, text: string) => Promise<{ success: boolean; error?: string }>;
  /** Створити сповіщення в дзвіночку (той самий механізм, що й для задач) */
  saveNotification: (item: {
    id: string; userId: string; title: string; message: string; read: boolean; createdAt: string;
  }) => Promise<void>;
  /** Куди складати локальний файл, коли Firestore не налаштований */
  localDir: string;
}

const CONVERSATIONS = 'crm_chat_conversations';
const MESSAGES = 'messages';
const READS = 'crm_chat_reads';

/** Скільки повідомлень віддаємо за один запит історії */
const PAGE_SIZE = 50;
const MAX_TEXT_LENGTH = 4000;

/** Канал, який має існувати завжди — інакше новачок відкриває порожнечу */
const GENERAL: ChatConversation = {
  id: 'general',
  kind: 'channel',
  title: 'Загальний',
  memberIds: null,
  createdBy: 'system',
  createdAt: '2020-01-01T00:00:00.000Z',
};

// ── SSE-хаб ───────────────────────────────────────────────────────────────────

interface SseClient {
  userId: string;
  res: Response;
}

const clients = new Set<SseClient>();

/** Одноразові квитки на підключення до потоку (див. коментар у /ticket) */
const tickets = new Map<string, { userId: string; expiresAt: number }>();
const TICKET_TTL_MS = 60_000;

function writeEvent(res: Response, event: string, data: unknown): boolean {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Розіслати подію. userIds === null означає «всім підключеним» — так виглядає
 * відкритий канал, доступний усій команді.
 */
function publish(userIds: string[] | null, event: string, data: unknown): void {
  for (const c of [...clients]) {
    if (userIds && !userIds.includes(c.userId)) continue;
    if (!writeEvent(c.res, event, data)) {
      clients.delete(c);
    }
  }
}

/**
 * Пульс. Проксі й мобільні оператори рвуть з'єднання, яке довго мовчить, а
 * рядок-коментар для SSE — це найдешевше, чим можна показати, що воно живе.
 */
let heartbeat: ReturnType<typeof setInterval> | null = null;
function startHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    for (const c of [...clients]) {
      try {
        c.res.write(': ping\n\n');
      } catch {
        clients.delete(c);
      }
    }
    const now = Date.now();
    for (const [key, t] of tickets) if (t.expiresAt < now) tickets.delete(key);
  }, 25_000);
  // Не тримати процес живим лише заради пульсу
  heartbeat.unref?.();
}

// ── Сховище: Firestore або локальний файл ─────────────────────────────────────

interface LocalChatFile {
  conversations: ChatConversation[];
  messages: Record<string, ChatMessage[]>;
  reads: Record<string, Record<string, string>>;
}

function makeStore(deps: ChatDeps) {
  const localFile = path.join(deps.localDir, 'chat.json');

  const readLocal = (): LocalChatFile => {
    try {
      if (fs.existsSync(localFile)) return JSON.parse(fs.readFileSync(localFile, 'utf-8'));
    } catch { /* побитий файл не має валити чат */ }
    return { conversations: [], messages: {}, reads: {} };
  };

  const writeLocal = (data: LocalChatFile) => {
    const tmp = localFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, localFile);
  };

  return {
    async listConversations(): Promise<ChatConversation[]> {
      const db = deps.getFirestore();
      if (db) {
        const snap = await db.collection(CONVERSATIONS).get();
        return snap.docs.map(d => d.data() as ChatConversation);
      }
      return readLocal().conversations;
    },

    async getConversation(id: string): Promise<ChatConversation | null> {
      const db = deps.getFirestore();
      if (db) {
        const doc = await db.collection(CONVERSATIONS).doc(id).get();
        return doc.exists ? (doc.data() as ChatConversation) : null;
      }
      return readLocal().conversations.find(c => c.id === id) ?? null;
    },

    async saveConversation(conv: ChatConversation): Promise<void> {
      const db = deps.getFirestore();
      if (db) {
        await db.collection(CONVERSATIONS).doc(conv.id).set(conv, { merge: true });
        return;
      }
      const data = readLocal();
      const i = data.conversations.findIndex(c => c.id === conv.id);
      if (i === -1) data.conversations.push(conv);
      else data.conversations[i] = { ...data.conversations[i], ...conv };
      writeLocal(data);
    },

    /** Історія: сторінка від найновіших до старіших, `before` — курсор за часом */
    async listMessages(conversationId: string, before?: string): Promise<ChatMessage[]> {
      const db = deps.getFirestore();
      if (db) {
        let q = db.collection(CONVERSATIONS).doc(conversationId).collection(MESSAGES)
          .orderBy('createdAt', 'desc')
          .limit(PAGE_SIZE);
        if (before) q = q.startAfter(before);
        const snap = await q.get();
        // Клієнту віддаємо в хронологічному порядку — так його читає стрічка
        return snap.docs.map(d => d.data() as ChatMessage).reverse();
      }
      const all = readLocal().messages[conversationId] ?? [];
      const filtered = before ? all.filter(m => m.createdAt < before) : all;
      return filtered.slice(-PAGE_SIZE);
    },

    async getMessage(conversationId: string, id: string): Promise<ChatMessage | null> {
      const db = deps.getFirestore();
      if (db) {
        const doc = await db.collection(CONVERSATIONS).doc(conversationId)
          .collection(MESSAGES).doc(id).get();
        return doc.exists ? (doc.data() as ChatMessage) : null;
      }
      return (readLocal().messages[conversationId] ?? []).find(m => m.id === id) ?? null;
    },

    async saveMessage(msg: ChatMessage): Promise<void> {
      const db = deps.getFirestore();
      if (db) {
        await db.collection(CONVERSATIONS).doc(msg.conversationId)
          .collection(MESSAGES).doc(msg.id).set(msg, { merge: true });
        return;
      }
      const data = readLocal();
      const list = data.messages[msg.conversationId] ?? [];
      const i = list.findIndex(m => m.id === msg.id);
      if (i === -1) list.push(msg);
      else list[i] = { ...list[i], ...msg };
      data.messages[msg.conversationId] = list;
      writeLocal(data);
    },

    /**
     * Скільки нових повідомлень у розмові після мітки прочитання.
     * У Firestore це агрегатний запит: він коштує одне читання незалежно від
     * того, скільки повідомлень порахував.
     */
    async countSince(conversationId: string, since: string, exceptAuthor: string): Promise<number> {
      const db = deps.getFirestore();
      if (db) {
        const snap = await db.collection(CONVERSATIONS).doc(conversationId)
          .collection(MESSAGES)
          .where('createdAt', '>', since)
          .count()
          .get();
        // Агрегат не вміє «крім автора» без складеного індексу; свої повідомлення
        // вже відсічені тим, що надсилання одразу зсуває мітку прочитання.
        return snap.data().count;
      }
      return (readLocal().messages[conversationId] ?? [])
        .filter(m => m.createdAt > since && m.authorId !== exceptAuthor).length;
    },

    async getReads(userId: string): Promise<Record<string, string>> {
      const db = deps.getFirestore();
      if (db) {
        const doc = await db.collection(READS).doc(userId).get();
        return doc.exists ? ((doc.data()?.lastReadAt as Record<string, string>) ?? {}) : {};
      }
      return readLocal().reads[userId] ?? {};
    },

    async setRead(userId: string, conversationId: string, at: string): Promise<void> {
      const db = deps.getFirestore();
      if (db) {
        await db.collection(READS).doc(userId).set(
          { userId, lastReadAt: { [conversationId]: at } },
          { merge: true },
        );
        return;
      }
      const data = readLocal();
      data.reads[userId] = { ...(data.reads[userId] ?? {}), [conversationId]: at };
      writeLocal(data);
    },
  };
}

// ── Реєстрація маршрутів ──────────────────────────────────────────────────────

export function registerChatRoutes(app: Express, deps: ChatDeps): void {
  const store = makeStore(deps);
  const { requireAuth } = deps;

  /** Вміст токена: лише userId, email і роль — імені в ньому немає */
  const me = (req: Request) => (req as any).user as { userId: string; role: string };

  /** Розмови, доступні цій людині (загальний канал добудовуємо, якщо його ще нема) */
  async function visibleConversations(userId: string): Promise<ChatConversation[]> {
    const all = await store.listConversations();
    if (!all.some(c => c.id === GENERAL.id)) {
      await store.saveConversation(GENERAL);
      all.push(GENERAL);
    }
    return all.filter(c => !c.archived && canAccess(c, userId));
  }

  // ── Потік ───────────────────────────────────────────────────────────────────

  /**
   * Квиток на підключення до потоку.
   *
   * EventSource у браузері не вміє надсилати заголовок Authorization, тож токен
   * довелося б класти в URL — а URL осідає в логах сервера й проксі. Замість
   * цього видаємо одноразовий квиток на 60 секунд: навіть якщо він десь
   * запишеться, він уже нічого не відкриє.
   */
  app.post('/api/chat/ticket', requireAuth, (req, res) => {
    const ticket = randomUUID();
    tickets.set(ticket, { userId: me(req).userId, expiresAt: Date.now() + TICKET_TTL_MS });
    res.json({ ticket });
  });

  app.get('/api/chat/stream', (req, res) => {
    const ticket = String(req.query.ticket || '');
    const entry = tickets.get(ticket);
    tickets.delete(ticket); // одноразовий
    if (!entry || entry.expiresAt < Date.now()) {
      res.status(401).json({ error: 'Invalid or expired ticket' });
      return;
    }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Nginx і подібні проксі інакше буферизують потік і він «залипає»
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    // Ретрай на випадок обриву — браузер перепідключиться сам
    res.write('retry: 3000\n\n');

    const client: SseClient = { userId: entry.userId, res };
    clients.add(client);
    startHeartbeat();
    writeEvent(res, 'ready', { at: new Date().toISOString() });

    req.on('close', () => {
      clients.delete(client);
    });
  });

  // ── Розмови ─────────────────────────────────────────────────────────────────

  app.get('/api/chat/conversations', requireAuth, async (req, res) => {
    try {
      const { userId } = me(req);
      const convs = await visibleConversations(userId);
      const reads = await store.getReads(userId);

      const withUnread = await Promise.all(convs.map(async c => {
        const lastRead = reads[c.id];
        // Рахуємо лише там, де точно є що рахувати — тиха розмова не коштує запиту
        const needsCount = !!c.lastMessageAt
          && c.lastMessageAuthorId !== userId
          && (!lastRead || c.lastMessageAt > lastRead);
        const unread = needsCount
          ? await store.countSince(c.id, lastRead ?? '', userId)
          : 0;
        const peers = c.kind === 'dm' ? (c.memberIds ?? []).filter(id => id !== userId) : [];
        return { ...c, unread, peerId: peers[0] ?? null };
      }));

      res.json({ conversations: sortConversations(withUnread) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Створити канал або відкрити особисте листування */
  app.post('/api/chat/conversations', requireAuth, async (req, res) => {
    try {
      const { userId } = me(req);
      const { kind, title, memberIds, peerId } = req.body ?? {};

      if (kind === 'dm') {
        if (!peerId || peerId === userId) {
          res.status(400).json({ error: 'Потрібен співрозмовник' });
          return;
        }
        const id = dmConversationId(userId, peerId);
        const existing = await store.getConversation(id);
        if (existing) {
          res.json({ conversation: existing });
          return;
        }
        const conv: ChatConversation = {
          id,
          kind: 'dm',
          title: '',
          memberIds: dmMembers(id)!,
          createdBy: userId,
          createdAt: new Date().toISOString(),
        };
        await store.saveConversation(conv);
        publish(conv.memberIds, 'conversation', conv);
        res.json({ conversation: conv });
        return;
      }

      const name = String(title ?? '').trim();
      if (!name) {
        res.status(400).json({ error: 'Потрібна назва каналу' });
        return;
      }
      // Приватний канал завжди містить автора, інакше він створить кімнату,
      // до якої сам не має доступу
      const members = Array.isArray(memberIds) && memberIds.length
        ? [...new Set([...memberIds.map(String), userId])]
        : null;

      const conv: ChatConversation = {
        id: randomUUID(),
        kind: 'channel',
        title: name.slice(0, 80),
        memberIds: members,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };
      await store.saveConversation(conv);
      publish(recipientsOf(conv), 'conversation', conv);
      res.json({ conversation: conv });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Повідомлення ────────────────────────────────────────────────────────────

  app.get('/api/chat/messages', requireAuth, async (req, res) => {
    try {
      const { userId } = me(req);
      const conversationId = String(req.query.conversationId || '');
      const conv = await store.getConversation(conversationId);
      if (!conv || !canAccess(conv, userId)) {
        res.status(403).json({ error: 'Немає доступу до цієї розмови' });
        return;
      }
      const before = req.query.before ? String(req.query.before) : undefined;
      const messages = await store.listMessages(conversationId, before);
      res.json({ messages, hasMore: messages.length === PAGE_SIZE });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/chat/messages', requireAuth, async (req, res) => {
    try {
      const author = me(req);
      const { conversationId, text } = req.body ?? {};
      const body = String(text ?? '').trim();
      if (!body) {
        res.status(400).json({ error: 'Порожнє повідомлення' });
        return;
      }
      if (body.length > MAX_TEXT_LENGTH) {
        res.status(400).json({ error: 'Повідомлення задовге' });
        return;
      }

      const conv = await store.getConversation(String(conversationId));
      if (!conv || !canAccess(conv, author.userId)) {
        res.status(403).json({ error: 'Немає доступу до цієї розмови' });
        return;
      }

      const users = await deps.getUsers();
      const now = new Date().toISOString();
      const msg: ChatMessage = {
        id: randomUUID(),
        conversationId: conv.id,
        authorId: author.userId,
        text: body,
        createdAt: now,
        mentions: parseMentions(body, users),
      };

      await store.saveMessage(msg);
      await store.saveConversation({
        ...conv,
        lastMessageAt: now,
        lastMessagePreview: previewOf(body),
        lastMessageAuthorId: author.userId,
      });
      // Автор щойно все бачив — інакше він сам собі створить непрочитане
      await store.setRead(author.userId, conv.id, now);

      publish(recipientsOf(conv), 'message', msg);

      // Ім'я беремо зі списку користувачів, а не з токена: у JWT лежать лише
      // userId, email і роль — імені там немає
      const authorName = users.find(u => u.id === author.userId)?.name ?? 'Колега';

      // Сповіщення — лише тим, кого назвали поіменно (рішення: без шуму)
      notifyMentions(msg, conv, { userId: author.userId, name: authorName }, users).catch(err =>
        console.error('[chat] mention notify failed:', err),
      );

      res.json({ message: msg });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/chat/messages/:id', requireAuth, async (req, res) => {
    try {
      const { userId } = me(req);
      const { conversationId, text } = req.body ?? {};
      const body = String(text ?? '').trim();
      if (!body) {
        res.status(400).json({ error: 'Порожнє повідомлення' });
        return;
      }

      const conv = await store.getConversation(String(conversationId));
      if (!conv || !canAccess(conv, userId)) {
        res.status(403).json({ error: 'Немає доступу до цієї розмови' });
        return;
      }
      const existing = await store.getMessage(conv.id, req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Повідомлення не знайдено' });
        return;
      }
      // Редагувати чуже не може ніхто, включно з адміністратором: підміна слів
      // у чужій репліці — це не модерація
      if (existing.authorId !== userId) {
        res.status(403).json({ error: 'Можна редагувати лише свої повідомлення' });
        return;
      }

      const users = await deps.getUsers();
      const updated: ChatMessage = {
        ...existing,
        text: body.slice(0, MAX_TEXT_LENGTH),
        editedAt: new Date().toISOString(),
        mentions: parseMentions(body, users),
      };
      await store.saveMessage(updated);
      publish(recipientsOf(conv), 'message', updated);
      res.json({ message: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/chat/messages/:id', requireAuth, async (req, res) => {
    try {
      const user = me(req);
      const conv = await store.getConversation(String(req.query.conversationId || ''));
      if (!conv || !canAccess(conv, user.userId)) {
        res.status(403).json({ error: 'Немає доступу до цієї розмови' });
        return;
      }
      const existing = await store.getMessage(conv.id, req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Повідомлення не знайдено' });
        return;
      }
      if (existing.authorId !== user.userId && user.role !== 'admin') {
        res.status(403).json({ error: 'Можна видаляти лише свої повідомлення' });
        return;
      }

      // Порожня заглушка, а не зникнення: інакше відповіді на це повідомлення
      // повисають у повітрі
      const removed: ChatMessage = {
        ...existing,
        text: '',
        mentions: [],
        deletedAt: new Date().toISOString(),
      };
      await store.saveMessage(removed);
      // Якщо прибрали саме останнє повідомлення, його текст досі стоїть у списку
      // розмов — інакше видалене висіло б там і далі
      if (conv.lastMessageAt === existing.createdAt) {
        await store.saveConversation({ ...conv, lastMessagePreview: 'Повідомлення видалено' });
      }
      publish(recipientsOf(conv), 'message', removed);
      res.json({ message: removed });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/chat/read', requireAuth, async (req, res) => {
    try {
      const { userId } = me(req);
      const { conversationId, at } = req.body ?? {};
      const conv = await store.getConversation(String(conversationId));
      if (!conv || !canAccess(conv, userId)) {
        res.status(403).json({ error: 'Немає доступу до цієї розмови' });
        return;
      }
      await store.setRead(userId, conv.id, String(at || new Date().toISOString()));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Згадки ──────────────────────────────────────────────────────────────────

  async function notifyMentions(
    msg: ChatMessage,
    conv: ChatConversation,
    author: { userId: string; name: string },
    users: ChatUser[],
  ): Promise<void> {
    const mentioned = (msg.mentions ?? []).filter(id => id !== author.userId);
    if (mentioned.length === 0) return;

    const where = conv.kind === 'dm' ? 'особистих повідомленнях' : `каналі «${conv.title}»`;

    for (const userId of mentioned) {
      const user = users.find(u => u.id === userId);
      if (!user) continue;
      // Згадка в закритій розмові не має витікати тому, хто її не бачить
      if (!canAccess(conv, userId)) continue;

      await deps.saveNotification({
        id: randomUUID(),
        userId,
        title: `${author.name} згадав(ла) вас у чаті`,
        message: previewOf(msg.text, 140),
        read: false,
        createdAt: new Date().toISOString(),
      });

      if (user.telegramChatId) {
        const text = `💬 *${author.name}* згадав(ла) вас у ${where}:\n\n${previewOf(msg.text, 300)}`;
        await deps.sendTelegram(user.telegramChatId, text);
      }
    }
  }
}

/** Скільки людей зараз тримають відкритий потік — для діагностики */
export function chatStreamStats(): { connections: number; users: number } {
  return {
    connections: clients.size,
    users: new Set([...clients].map(c => c.userId)).size,
  };
}

import dotenv from 'dotenv';
import path from 'path';
// Load .env.local first (highest priority), then .env as fallback
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import cron from 'node-cron';
import { GoogleGenAI } from '@google/genai';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import admin from 'firebase-admin';


// ── Firebase Init ─────────────────────────────────────────────────────────────

let firestoreDb: admin.firestore.Firestore | null = null;

function initFirebase(): admin.firestore.Firestore | null {
  if (firestoreDb) return firestoreDb;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  try {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    }
    firestoreDb = admin.firestore();
    console.log('✅ Firebase Firestore connected.');
    return firestoreDb;
  } catch (err) {
    console.error('❌ Firebase init error:', err);
    return null;
  }
}

// ── Storage Abstraction ───────────────────────────────────────────────────────

const dbFile = path.join(process.cwd(), 'data.json');
const authFile = path.join(process.cwd(), 'auth.json');
const CRM_COLLECTION = 'crm';
const STATE_DOC = 'state';
const AUTH_DOC = 'auth';

const INITIAL_APP_STATE = {
  users: [
    { id: 'u1', name: 'Max Hnatyk', avatar: 'https://ui-avatars.com/api/?name=Max+Hnatyk&background=random', email: 'admin@pawell.com' },
    { id: 'u2', name: 'Alice Smith', avatar: 'https://ui-avatars.com/api/?name=Alice+Smith&background=random' },
    { id: 'u3', name: 'Bob Johnson', avatar: 'https://ui-avatars.com/api/?name=Bob+Johnson&background=random' }
  ],
  metrics: [
    { id: 'm1', title: 'Охоплення аудиторії', value: '124.5K', trend: '+12%', trendPositive: true },
    { id: 'm2', title: 'Лідів (MQL)', value: '840', trend: '+5%', trendPositive: true },
    { id: 'm3', title: 'Бюджет використано', value: '$4,250', trend: '-2%', trendPositive: false },
    { id: 'm4', title: 'Вартість ліда (CPA)', value: '$5.05', trend: '-8%', trendPositive: true }
  ],
  boards: [{ id: 'b1', title: 'Основна дошка' }],
  lists: [
    { id: 'l1', title: 'To Do', order: 0, boardId: 'b1' },
    { id: 'l2', title: 'In Progress', order: 1, boardId: 'b1' },
    { id: 'l3', title: 'Done', order: 2, boardId: 'b1' }
  ],
  tags: [
    { id: 't1', name: 'Bug', color: '#ef4444' },
    { id: 't2', name: 'Feature', color: '#3b82f6' },
    { id: 't3', name: 'Urgent', color: '#f97316' }
  ],
  cards: [],
  contentPlans: [],
  contentPlanChannels: [
    { name: 'Instagram', color: '#fce7f3' },
    { name: 'Telegram', color: '#e0f2fe' },
    { name: 'LinkedIn', color: '#dbeafe' },
    { name: 'YouTube', color: '#fee2e2' },
    { name: 'TikTok', color: '#f1f5f9' },
    { name: 'Blog', color: '#fef3c7' },
    { name: 'Facebook', color: '#e0e7ff' }
  ],
  contentPlanStatuses: ['Ідея', 'В роботі', 'На погодженні', 'Заплановано', 'Опубліковано', 'Відхилено'],
  contentPlanColumns: [
    { id: 'focus', title: 'Фокус на 2 тижні / Тема', visible: true },
    { id: 'channel', title: 'Канал', visible: true },
    { id: 'description', title: 'Короткий опис', visible: true },
    { id: 'assignee', title: 'Відповідальний', visible: true },
    { id: 'status', title: 'Статус', visible: true },
    { id: 'tags', title: 'Теги', visible: true },
    { id: 'publishDate', title: 'Дата', visible: true },
    { id: 'engagement', title: 'Охоплення/Взаємодія', visible: true }
  ],
  events: [],
  lastModified: new Date().toISOString(),
};

// ── State DB ──────────────────────────────────────────────────────────────────

async function getDb(): Promise<any> {
  const db = initFirebase();
  if (db) {
    const doc = await db.collection(CRM_COLLECTION).doc(STATE_DOC).get();
    if (doc.exists) return doc.data();
    // First time: check if local file exists for migration
    if (fs.existsSync(dbFile)) {
      console.log('📦 Migrating local data.json → Firestore...');
      const localData = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
      const dataWithTs = { ...localData, lastModified: new Date().toISOString() };
      await db.collection(CRM_COLLECTION).doc(STATE_DOC).set(dataWithTs);
      console.log('✅ Migration complete. Local file kept as backup.');
      return dataWithTs;
    }
    // Fresh start
    await db.collection(CRM_COLLECTION).doc(STATE_DOC).set(INITIAL_APP_STATE);
    return INITIAL_APP_STATE;
  }

  // Fallback: local file
  if (fs.existsSync(dbFile)) return JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
  fs.writeFileSync(dbFile, JSON.stringify(INITIAL_APP_STATE, null, 2));
  return INITIAL_APP_STATE;
}

async function saveDb(data: any): Promise<void> {
  const payload = { ...data, lastModified: new Date().toISOString() };
  const db = initFirebase();
  if (db) {
    await db.collection(CRM_COLLECTION).doc(STATE_DOC).set(payload);
    return;
  }
  fs.writeFileSync(dbFile, JSON.stringify(payload, null, 2));
}

// ── Auth DB ───────────────────────────────────────────────────────────────────

interface AuthCredential {
  userId: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'member';
}

interface AuthDbType { credentials: AuthCredential[]; }

async function getAuthDb(): Promise<AuthDbType> {
  const db = initFirebase();
  if (db) {
    const doc = await db.collection(CRM_COLLECTION).doc(AUTH_DOC).get();
    if (doc.exists) return doc.data() as AuthDbType;
    // Migrate local auth.json if exists
    if (fs.existsSync(authFile)) {
      console.log('📦 Migrating local auth.json → Firestore...');
      const localAuth = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
      await db.collection(CRM_COLLECTION).doc(AUTH_DOC).set(localAuth);
      console.log('✅ Auth migration complete.');
      return localAuth;
    }
    return { credentials: [] };
  }
  if (fs.existsSync(authFile)) return JSON.parse(fs.readFileSync(authFile, 'utf-8'));
  return { credentials: [] };
}

async function saveAuthDb(authData: AuthDbType): Promise<void> {
  const db = initFirebase();
  if (db) {
    await db.collection(CRM_COLLECTION).doc(AUTH_DOC).set(authData);
    return;
  }
  fs.writeFileSync(authFile, JSON.stringify(authData, null, 2));
}

// ── JWT Config ────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'pawell-crm-secret-key-change-in-production';
const JWT_EXPIRES = '7d';

interface JWTPayload { userId: string; email: string; role: 'admin' | 'member'; }

// ── Bootstrap: create first admin if no credentials exist ─────────────────────

async function bootstrapAdmin() {
  const authDb = await getAuthDb();
  if (authDb.credentials.length === 0) {
    const appState = await getDb();
    const firstUser = appState.users?.[0];
    if (firstUser) {
      const tempPassword = 'admin123';
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const email = 'admin@pawell.com';
      authDb.credentials.push({ userId: firstUser.id, email, passwordHash, role: 'admin' });
      appState.users[0].email = email;
      await saveDb(appState);
      await saveAuthDb(authDb);
      console.log('\n╔══════════════════════════════════════════════╗');
      console.log('║       ПЕРШИЙ ЗАПУСК — ОБЛІКОВІ ДАНІ         ║');
      console.log('╠══════════════════════════════════════════════╣');
      console.log(`║  Email:    ${email.padEnd(34)}║`);
      console.log(`║  Пароль:   ${tempPassword.padEnd(34)}║`);
      console.log(`║  Юзер:     ${firstUser.name.padEnd(34)}║`);
      console.log('╚══════════════════════════════════════════════╝');
      console.log('  ⚠️  Змініть пароль після першого входу!\n');
    }
  }
}

// ── Auth Middleware ───────────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    (req as any).user = payload;
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as JWTPayload;
  if (!user || user.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return; }
  next();
}

// ── Telegram / AI Reports ─────────────────────────────────────────────────────

async function generateAndSendDailyReport(state: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = '-5182383955';
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!token || !chatId) { return { success: false, error: 'missing_telegram_credentials' }; }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = (d?: string) => { if (!d) return false; const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() === today.getTime(); };
  const isOverdue = (d?: string) => { if (!d) return false; const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() < today.getTime(); };
  const isSoon = (d?: string) => { if (!d) return false; const x = new Date(d); x.setHours(0,0,0,0); const diff = Math.ceil((x.getTime() - today.getTime()) / 86400000); return diff > 0 && diff <= 3; };

  const allTasks = state.cards || [];
  const tasksToday = allTasks.filter((c: any) => isToday(c.deadline));
  const tasksOverdue = allTasks.filter((c: any) => isOverdue(c.deadline));
  const tasksSoon = allTasks.filter((c: any) => isSoon(c.deadline));
  const urgentTasks = allTasks.filter((c: any) => {
    const tags = state.tags || [];
    const cardTags = c.tagIds?.map((id: string) => tags.find((t: any) => t.id === id)?.name?.toLowerCase()).filter(Boolean) || [];
    return cardTags.some((t: string) => t.includes('urgent') || t.includes('важливо') || t.includes('терміново'));
  });
  const eventsToday = (state.events || []).filter((e: any) => isToday(e.startDate));
  const contentToday = (state.contentPlans || []).filter((c: any) => isToday(c.publishDate));

  let messageText = '';

  if (geminiApiKey) {
    try {
      const dbInfoForAI = {
        date: today.toLocaleDateString('uk-UA'),
        tasksDueToday: tasksToday.map((t: any) => ({ title: t.title, assignee: state.users.find((u: any) => u.id === t.assigneeId)?.name || 'Не призначено' })),
        tasksOverdue: tasksOverdue.map((t: any) => ({ title: t.title, assignee: state.users.find((u: any) => u.id === t.assigneeId)?.name || 'Не призначено' })),
        tasksDueSoon: tasksSoon.map((t: any) => ({ title: t.title, deadline: new Date(t.deadline).toLocaleDateString('uk-UA'), assignee: state.users.find((u: any) => u.id === t.assigneeId)?.name || 'Не призначено' })),
        urgentTasks: urgentTasks.map((t: any) => ({ title: t.title, assignee: state.users.find((u: any) => u.id === t.assigneeId)?.name || 'Не призначено' })),
        eventsToday: eventsToday.map((e: any) => ({ title: e.title })),
        contentToday: contentToday.map((c: any) => ({ title: c.focus || c.description }))
      };
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const prompt = `Ти персональний ШІ-менеджер відділу маркетингу. Твій вайб — це класний, сучасний керівник, який тримає все під контролем без зайвого стресу та метушні. Сформуй ранковий звіт-дайджест для відправки в робочий Telegram-чат команди.\n      \n      Дані на сьогодні (${dbInfoForAI.date}):\n      ${JSON.stringify(dbInfoForAI, null, 2)}\n      \n      ВИМОГИ ДО ФОРМАТУ (ОБОВ'ЯЗКОВО ДОТРИМУЙСЯ ЇХ, НЕ ЗМІНЮЙ СТРУКТУРУ):\n      - Пиши з використанням Telegram Markdown (жирний шрифт).\n      - Емодзі можуть бути, але в міру.\n      - На початку — один абсурдний мотиваційний жарт.\n\n      СТРУКТУРА:\n      [Абсурдна мотиваційна фраза дня]\n      📊 *Звіт на сьогодні (${dbInfoForAI.date})*\n      🎯 *Задачі (Дедлайн сьогодні):*\n      ⚠️ *Протерміновані задачі:*\n      🗓 *Події/Контент сьогодні:*\n      🔥 *Наближається дедлайн (Наступні 3 дні):*\n\n      Не вигадуй дані, бери тільки з JSON.`;
      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      messageText = response.text || '';
    } catch (err) { console.error('Gemini error, fallback template', err); }
  }

  if (!messageText) {
    messageText = '📋 *Звіт на сьогодні:*\n\n';
    if (eventsToday.length > 0) { messageText += '🗓 *Події:*\n'; eventsToday.forEach((e: any) => { messageText += `🔹 ${e.title}\n`; }); messageText += '\n'; }
    if (tasksToday.length > 0) { messageText += '✅ *Задачі (сьогодні):*\n'; tasksToday.forEach((c: any) => { const a = state.users.find((u: any) => u.id === c.assigneeId)?.name || 'Не призначено'; messageText += `🔹 ${c.title} — 👤 ${a}\n`; }); messageText += '\n'; }
    if (tasksOverdue.length > 0) { messageText += '⚠️ *Протерміновані:*\n'; tasksOverdue.forEach((c: any) => { const a = state.users.find((u: any) => u.id === c.assigneeId)?.name || 'Не призначено'; messageText += `🔹 ${c.title} — 👤 ${a}\n`; }); }
    if (contentToday.length > 0) { messageText += '📱 *Контент:*\n'; contentToday.forEach((c: any) => { messageText += `🔹 ${c.focus || c.description || 'Без назви'}\n`; }); }
    if (!tasksToday.length && !eventsToday.length && !contentToday.length && !tasksOverdue.length) messageText = 'На сьогодні немає задач. Гарного дня!';
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: 'Markdown' })
    });
    return { success: true };
  } catch (e) { return { success: false, error: 'request_failed' }; }
}

function setupTelegramCron() {
  cron.schedule('0 8 * * *', async () => {
    const state = await getDb();
    generateAndSendDailyReport(state);
  });
  console.log('📅 Telegram daily cron scheduled (08:00).');
}

// ── Main Server ───────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Init Firebase & bootstrap
  initFirebase();
  await bootstrapAdmin();
  setupTelegramCron();

  // ── Auth Routes ──────────────────────────────────────────────────────────────

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) { res.status(400).json({ error: 'Email та пароль обов\'язкові' }); return; }
    const authDb = await getAuthDb();
    const cred = authDb.credentials.find(c => c.email.toLowerCase() === email.toLowerCase());
    if (!cred) { res.status(401).json({ error: 'Невірний email або пароль' }); return; }
    const valid = await bcrypt.compare(password, cred.passwordHash);
    if (!valid) { res.status(401).json({ error: 'Невірний email або пароль' }); return; }
    const appState = await getDb();
    const user = appState.users?.find((u: any) => u.id === cred.userId);
    if (!user) { res.status(404).json({ error: 'Користувача не знайдено' }); return; }
    const payload: JWTPayload = { userId: cred.userId, email: cred.email, role: cred.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, user: { userId: cred.userId, email: cred.email, role: cred.role, name: user.name, avatar: user.avatar } });
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    const jwtUser = (req as any).user as JWTPayload;
    const appState = await getDb();
    const user = appState.users?.find((u: any) => u.id === jwtUser.userId);
    if (!user) { res.status(404).json({ error: 'Користувача не знайдено' }); return; }
    res.json({ userId: jwtUser.userId, email: jwtUser.email, role: jwtUser.role, name: user.name, avatar: user.avatar });
  });

  app.post('/api/auth/change-password', requireAuth, async (req, res) => {
    const jwtUser = (req as any).user as JWTPayload;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) { res.status(400).json({ error: 'Усі поля обов\'язкові' }); return; }
    if (newPassword.length < 6) { res.status(400).json({ error: 'Пароль мінімум 6 символів' }); return; }
    const authDb = await getAuthDb();
    const credIdx = authDb.credentials.findIndex(c => c.userId === jwtUser.userId);
    if (credIdx === -1) { res.status(404).json({ error: 'Обліковий запис не знайдено' }); return; }
    const valid = await bcrypt.compare(currentPassword, authDb.credentials[credIdx].passwordHash);
    if (!valid) { res.status(401).json({ error: 'Поточний пароль невірний' }); return; }
    authDb.credentials[credIdx].passwordHash = await bcrypt.hash(newPassword, 10);
    await saveAuthDb(authDb);
    res.json({ success: true });
  });

  app.post('/api/auth/set-user-credentials', requireAuth, requireAdmin, async (req, res) => {
    const { userId, email, password, role } = req.body;
    if (!userId || !email || !password) { res.status(400).json({ error: 'userId, email та password обов\'язкові' }); return; }
    if (password.length < 6) { res.status(400).json({ error: 'Пароль мінімум 6 символів' }); return; }
    const appState = await getDb();
    const user = appState.users?.find((u: any) => u.id === userId);
    if (!user) { res.status(404).json({ error: 'Користувача не знайдено' }); return; }
    const authDb = await getAuthDb();
    const emailExists = authDb.credentials.find(c => c.email.toLowerCase() === email.toLowerCase() && c.userId !== userId);
    if (emailExists) { res.status(409).json({ error: 'Цей email вже використовується' }); return; }
    const passwordHash = await bcrypt.hash(password, 10);
    const newCred: AuthCredential = { userId, email, passwordHash, role: role || 'member' };
    const existingIdx = authDb.credentials.findIndex(c => c.userId === userId);
    if (existingIdx >= 0) authDb.credentials[existingIdx] = newCred;
    else authDb.credentials.push(newCred);
    await saveAuthDb(authDb);
    user.email = email;
    await saveDb(appState);
    res.json({ success: true });
  });

  app.post('/api/auth/reset-user-password', requireAuth, requireAdmin, async (req, res) => {
    const { userId } = req.body;
    if (!userId) { res.status(400).json({ error: 'userId обов\'язковий' }); return; }
    const authDb = await getAuthDb();
    const credIdx = authDb.credentials.findIndex(c => c.userId === userId);
    if (credIdx === -1) { res.status(404).json({ error: 'Обліковий запис не знайдено' }); return; }
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const tempPassword = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    authDb.credentials[credIdx].passwordHash = await bcrypt.hash(tempPassword, 10);
    await saveAuthDb(authDb);
    res.json({ success: true, tempPassword });
  });

  app.get('/api/auth/list', requireAuth, requireAdmin, async (req, res) => {
    const authDb = await getAuthDb();
    res.json(authDb.credentials.map(c => ({ userId: c.userId, email: c.email, role: c.role })));
  });

  // ── App State Routes ─────────────────────────────────────────────────────────

  app.get('/api/state', requireAuth, async (req, res) => {
    res.json(await getDb());
  });

  app.post('/api/state', requireAuth, async (req, res) => {
    await saveDb(req.body);
    res.json({ success: true });
  });

  app.post('/api/test-notification', requireAuth, async (req, res) => {
    try {
      const state = await getDb();
      const result = await generateAndSendDailyReport(state);
      if (result.success) res.json({ success: true });
      else res.status(500).json({ success: false, error: result.error });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  // ── Upload ───────────────────────────────────────────────────────────────────

  const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, UPLOADS_DIR); },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      cb(null, `${base}-${Date.now()}${ext}`);
    }
  });
  const upload = multer({ storage });

  app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    res.json({ id: req.file.filename, name: req.file.originalname, url: `/uploads/${encodeURIComponent(req.file.filename)}` });
  });

  // ── Vite / Static ────────────────────────────────────────────────────────────

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}\n`);
  });
}

startServer();

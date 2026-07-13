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

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const dbFile = path.join(DATA_DIR, 'data.json');
const authFile = path.join(DATA_DIR, 'auth.json');
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
  processes: [],
  events: [],
  lastModified: new Date().toISOString(),
};

const ATOMIC_COLLECTIONS = ['users', 'userGroups', 'lists', 'cards', 'tags', 'contentPlans', 'events', 'projects', 'metrics', 'boards', 'processes', 'notifications'];
const SETTINGS_DOC = 'settings';

const DEFAULT_NOTIFICATION_TEMPLATES = {
  taskAssigned: '🎯 *Тобі призначено нову задачу!*\n\n📌 *{{taskTitle}}*\n📅 Дедлайн: {{deadline}}\n🗂 Проєкт: {{projectName}}',
  taskOverdue: '⚠️ *Задача протермінована!*\n\n📌 *{{taskTitle}}*\n📅 Дедлайн був: {{deadline}}\n⏰ Прострочено на {{daysOverdue}} дн.',
  dailyDigestHeader: '📋 *Твої задачі на сьогодні, {{assigneeName}}!*\n\n',
  dailyDigestItem: '🔹 *{{taskTitle}}* — до {{deadline}}\n',
};

const DEFAULT_PERSONAL_NOTIFICATIONS = {
  enabled: true,
  notifyOnAssign: true,
  notifyOnOverdue: true,
  dailyDigestEnabled: true,
  dailyDigestTime: '08:30',
  templates: DEFAULT_NOTIFICATION_TEMPLATES,
};

async function updateLastModified() {
  const db = initFirebase();
  if (db) {
    try {
      await db.collection(CRM_COLLECTION).doc('status').set({ lastModified: new Date().toISOString() });
    } catch (err) {
      console.error('Failed to update status', err);
    }
  }
}

async function getDb(): Promise<any> {
  const db = initFirebase();
  if (db) {
    const stateDocRef = db.collection(CRM_COLLECTION).doc(STATE_DOC);
    const stateDoc = await stateDocRef.get();
    
    if (stateDoc.exists) {
      console.log('📦 Migrating legacy state doc to atomic collections...');
      const legacyData = stateDoc.data() as any;
      
      const settings = {
        contentPlanChannels: legacyData.contentPlanChannels || INITIAL_APP_STATE.contentPlanChannels,
        contentPlanStatuses: legacyData.contentPlanStatuses || INITIAL_APP_STATE.contentPlanStatuses,
        contentPlanColumns: legacyData.contentPlanColumns || INITIAL_APP_STATE.contentPlanColumns,
        aiReportSchedule: legacyData.aiReportSchedule || '0 8 * * *',
        announcements: legacyData.announcements || []
      };
      await db.collection(CRM_COLLECTION).doc(SETTINGS_DOC).set(settings);
      
      for (const colName of ATOMIC_COLLECTIONS) {
        const items = legacyData[colName] || [];
        for (let i = 0; i < items.length; i += 400) {
          const batch = db.batch();
          const chunk = items.slice(i, i + 400);
          for (const item of chunk) {
            if (!item.id) continue;
            const ref = db.collection('crm_' + colName).doc(item.id);
            batch.set(ref, item);
          }
          await batch.commit();
        }
      }
      
      await db.collection(CRM_COLLECTION).doc('state_backup_legacy').set(legacyData);
      await stateDocRef.delete();
      console.log('✅ Migration to atomic collections complete.');
    }
    
    const state: any = {};
    const settingsDoc = await db.collection(CRM_COLLECTION).doc(SETTINGS_DOC).get();
    if (settingsDoc.exists) {
      Object.assign(state, settingsDoc.data());
    } else {
      Object.assign(state, {
        contentPlanChannels: INITIAL_APP_STATE.contentPlanChannels,
        contentPlanStatuses: INITIAL_APP_STATE.contentPlanStatuses,
        contentPlanColumns: INITIAL_APP_STATE.contentPlanColumns,
        aiReportSchedule: '0 8 * * *',
        announcements: []
      });
    }
    
    for (const colName of ATOMIC_COLLECTIONS) {
      try {
        const snap = await db.collection('crm_' + colName).get();
        state[colName] = snap.docs.map(d => d.data());
      } catch (e) {
        state[colName] = [];
      }
    }
    
    return state;
  }

  // Fallback: local file
  if (fs.existsSync(dbFile)) return JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
  fs.writeFileSync(dbFile, JSON.stringify(INITIAL_APP_STATE, null, 2));
  return INITIAL_APP_STATE;
}

async function saveDb(data: any): Promise<void> {
  const db = initFirebase();
  if (db) {
    // With atomic updates, saveDb is rarely called for full state, but we can implement it as a fallback sync
    const settings = {
      contentPlanChannels: data.contentPlanChannels || [],
      contentPlanStatuses: data.contentPlanStatuses || [],
      contentPlanColumns: data.contentPlanColumns || [],
      aiReportSchedule: data.aiReportSchedule || '0 8 * * *',
      announcements: data.announcements || []
    };
    await db.collection(CRM_COLLECTION).doc(SETTINGS_DOC).set(settings);
    
    for (const colName of ATOMIC_COLLECTIONS) {
      const items = data[colName] || [];
      for (const item of items) {
        if (!item.id) continue;
        await db.collection('crm_' + colName).doc(item.id).set(item);
      }
    }
    return;
  }
  
  const payload = { ...data, lastModified: new Date().toISOString() };
  const tmpFile = dbFile + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2));
  fs.renameSync(tmpFile, dbFile);
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
  const tmpFile = authFile + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(authData, null, 2));
  fs.renameSync(tmpFile, authFile);
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
      const tempPassword = 'Admin2025!';
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
  const chatId = process.env.TELEGRAM_CHAT_ID || '-5182383955';
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!token || !chatId) { return { success: false, error: 'missing_telegram_credentials' }; }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = (d?: string) => { if (!d) return false; const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() === today.getTime(); };
  const isOverdue = (d?: string) => { if (!d) return false; const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() < today.getTime(); };
  const isSoon = (d?: string) => { if (!d) return false; const x = new Date(d); x.setHours(0,0,0,0); const diff = Math.ceil((x.getTime() - today.getTime()) / 86400000); return diff > 0 && diff <= 3; };

  const boards = state.boards || [];
  const existingBoardIds = boards.map((b: any) => b.id);
  
  const lists = state.lists || [];
  // Only consider lists that belong to an existing board (or have no boardId which shouldn't happen, but just in case)
  const validLists = lists.filter((l: any) => !l.boardId || existingBoardIds.includes(l.boardId));
  const validListIds = validLists.map((l: any) => l.id);
  
  const excludedListIds = validLists.filter((l: any) => l.excludeFromAI).map((l: any) => l.id);
  
  // Only consider cards that belong to a valid list, are not in an excluded list, and are not completed
  const allTasks = (state.cards || []).filter((c: any) => 
    validListIds.includes(c.listId) && 
    !excludedListIds.includes(c.listId) && 
    !c.isCompleted
  );
  
  const tasksToday = allTasks.filter((c: any) => isToday(c.deadline));
  const tasksOverdue = allTasks.filter((c: any) => isOverdue(c.deadline));
  const tasksSoon = allTasks.filter((c: any) => isSoon(c.deadline));
  const urgentTasks = allTasks.filter((c: any) => {
    if (!isToday(c.deadline) && !isOverdue(c.deadline) && !isSoon(c.deadline)) return false;
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

  if (messageText.length > 4000) {
    messageText = messageText.substring(0, 4000) + '\n\n... (Текст обрізано, бо він перевищує ліміти Telegram)';
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: 'Markdown' })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('Telegram API rejected message:', errText);
      return { success: false, error: 'Telegram API Error' };
    }
    return { success: true };
  } catch (e) { return { success: false, error: 'request_failed' }; }
}

let currentCronTask: any = null;

function setupTelegramCron(scheduleExpr: string = '0 8 * * *') {
  if (currentCronTask) {
    currentCronTask.stop();
  }
  
  if (!scheduleExpr) return;
  
  try {
    currentCronTask = cron.schedule(scheduleExpr, async () => {
      const state = await getDb();
      generateAndSendDailyReport(state);
    }, {
      timezone: 'Europe/Kyiv'
    });
    console.log(`📅 Telegram daily cron scheduled (${scheduleExpr}).`);
  } catch (err) {
    console.error(`❌ Invalid cron expression: ${scheduleExpr}`, err);
  }
}

// ── Announcement Cron Management ─────────────────────────────────────────────

interface AnnouncementRecord {
  id: string;
  label: string;
  text: string;
  time: string;    // "HH:mm"
  days: number[];  // 0=Sun,1=Mon,...,6=Sat
  enabled: boolean;
  createdAt: string;
}

const announcementCronTasks = new Map<string, any>();

async function sendAnnouncementToTelegram(text: string): Promise<{ success: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || '-5182383955';
  if (!token || !chatId) return { success: false, error: 'missing_telegram_credentials' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('Telegram API rejected announcement:', errText);
      return { success: false, error: 'telegram_api_error' };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: 'request_failed' };
  }
}

function buildAnnouncementCron(time: string, days: number[]): string {
  const [h, m] = time.split(':').map(Number);
  // days: 0=Sun,1=Mon,...,6=Sat — node-cron uses same convention
  const dayStr = days.length === 7 || days.length === 0 ? '*' : days.join(',');
  return `${m} ${h} * * ${dayStr}`;
}

function setupAnnouncementCrons(announcements: AnnouncementRecord[]) {
  // Stop all existing announcement crons
  announcementCronTasks.forEach(task => task.stop());
  announcementCronTasks.clear();

  for (const ann of announcements) {
    if (!ann.enabled || !ann.time || !ann.days?.length) continue;
    try {
      const cronExpr = buildAnnouncementCron(ann.time, ann.days);
      const task = cron.schedule(cronExpr, async () => {
        console.log(`📣 Sending announcement "${ann.label}"...`);
        await sendAnnouncementToTelegram(ann.text);
      }, { timezone: 'Europe/Kyiv' });
      announcementCronTasks.set(ann.id, task);
      console.log(`📣 Announcement cron "${ann.label}" scheduled: ${cronExpr}`);
    } catch (err) {
      console.error(`❌ Invalid cron for announcement "${ann.label}":`, err);
    }
  }
}
// ── Personal Notifications ───────────────────────────────────────────────────

function fillTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((t, [k, v]) => t.replace(new RegExp(`{{${k}}}`, 'g'), v || ''), template);
}

async function sendPersonalTelegramMessage(chatId: string, text: string): Promise<{ success: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return { success: false, error: 'missing_credentials' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Telegram personal message error (chatId: ${chatId}):`, errText);
      return { success: false, error: errText };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function notifyCardAssigned(state: any, cardId: string, assigneeId: string): Promise<void> {
  const settings = state.personalNotifications || DEFAULT_PERSONAL_NOTIFICATIONS;
  if (!settings.enabled || !settings.notifyOnAssign) return;

  const card = (state.cards || []).find((c: any) => c.id === cardId);
  const assignee = (state.users || []).find((u: any) => u.id === assigneeId);
  if (!card || !assignee?.telegramChatId) return;

  const project = card.projectId ? (state.projects || []).find((p: any) => p.id === card.projectId) : null;
  const deadline = card.deadline ? new Date(card.deadline).toLocaleDateString('uk-UA') : 'не вказано';

  const text = fillTemplate(settings.templates?.taskAssigned || DEFAULT_NOTIFICATION_TEMPLATES.taskAssigned, {
    taskTitle: card.title,
    assigneeName: assignee.name,
    deadline,
    projectName: project?.title || 'без проєкту',
  });

  await sendPersonalTelegramMessage(assignee.telegramChatId, text);
  console.log(`📨 Assigned notification sent to ${assignee.name} (chatId: ${assignee.telegramChatId})`);
}

async function sendDailyPersonalDigests(state: any): Promise<void> {
  const settings = state.personalNotifications || DEFAULT_PERSONAL_NOTIFICATIONS;
  if (!settings.enabled || !settings.dailyDigestEnabled) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = (d?: string) => { if (!d) return false; const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() === today.getTime(); };
  const isOverdue = (d?: string) => { if (!d) return false; const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() < today.getTime(); };

  const validListIds = (state.lists || []).map((l: any) => l.id);
  const allCards = (state.cards || []).filter((c: any) => validListIds.includes(c.listId) && !c.isCompleted);

  const templates = settings.templates || DEFAULT_NOTIFICATION_TEMPLATES;
  const headerTpl = templates.dailyDigestHeader || DEFAULT_NOTIFICATION_TEMPLATES.dailyDigestHeader;
  const itemTpl = templates.dailyDigestItem || DEFAULT_NOTIFICATION_TEMPLATES.dailyDigestItem;

  const usersWithTelegram = (state.users || []).filter((u: any) => u.telegramChatId);

  for (const user of usersWithTelegram) {
    const userCards = allCards.filter((c: any) => c.assigneeId === user.id);
    const todayCards = userCards.filter((c: any) => isToday(c.deadline));
    const overdueCards = userCards.filter((c: any) => isOverdue(c.deadline));

    if (todayCards.length === 0 && overdueCards.length === 0) continue;

    let msg = fillTemplate(headerTpl, { assigneeName: user.name });

    if (todayCards.length > 0) {
      msg += '✅ *Сьогодні:*\n';
      todayCards.forEach((c: any) => {
        msg += fillTemplate(itemTpl, { taskTitle: c.title, deadline: 'сьогодні' });
      });
      msg += '\n';
    }
    if (overdueCards.length > 0) {
      msg += '⚠️ *Протерміновані:*\n';
      overdueCards.forEach((c: any) => {
        const dl = c.deadline ? new Date(c.deadline).toLocaleDateString('uk-UA') : '—';
        msg += fillTemplate(itemTpl, { taskTitle: c.title, deadline: dl });
      });
    }

    if (msg.length > 4000) msg = msg.substring(0, 4000) + '\n...';
    await sendPersonalTelegramMessage(user.telegramChatId, msg);
    console.log(`📨 Daily digest sent to ${user.name}`);
  }
}

async function sendOverduePersonalNotifications(state: any): Promise<void> {
  const settings = state.personalNotifications || DEFAULT_PERSONAL_NOTIFICATIONS;
  if (!settings.enabled || !settings.notifyOnOverdue) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = (d?: string) => { if (!d) return false; const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() < today.getTime(); };

  const validListIds = (state.lists || []).map((l: any) => l.id);
  const overdueCards = (state.cards || []).filter((c: any) =>
    validListIds.includes(c.listId) && !c.isCompleted && isOverdue(c.deadline) && c.assigneeId
  );

  const templates = settings.templates || DEFAULT_NOTIFICATION_TEMPLATES;
  const tpl = templates.taskOverdue || DEFAULT_NOTIFICATION_TEMPLATES.taskOverdue;

  for (const card of overdueCards) {
    const assignee = (state.users || []).find((u: any) => u.id === card.assigneeId);
    if (!assignee?.telegramChatId) continue;

    const deadlineDate = new Date(card.deadline);
    const daysOverdue = Math.ceil((today.getTime() - deadlineDate.getTime()) / 86400000);
    const deadline = deadlineDate.toLocaleDateString('uk-UA');

    const text = fillTemplate(tpl, {
      taskTitle: card.title,
      deadline,
      daysOverdue: String(daysOverdue),
    });

    await sendPersonalTelegramMessage(assignee.telegramChatId, text);
    console.log(`📨 Overdue notification sent to ${assignee.name} for task "${card.title}"`);
  }
}

let personalDigestCronTask: any = null;
let overdueNotifCronTask: any = null;

function setupPersonalNotificationCrons(settings: any) {
  // Stop existing
  if (personalDigestCronTask) { personalDigestCronTask.stop(); personalDigestCronTask = null; }
  if (overdueNotifCronTask) { overdueNotifCronTask.stop(); overdueNotifCronTask = null; }

  if (!settings?.enabled) return;

  // Daily digest cron
  if (settings.dailyDigestEnabled && settings.dailyDigestTime) {
    const [h, m] = settings.dailyDigestTime.split(':').map(Number);
    const expr = `${m} ${h} * * *`;
    try {
      personalDigestCronTask = cron.schedule(expr, async () => {
        console.log('📅 Running personal daily digests...');
        const state = await getDb();
        await sendDailyPersonalDigests(state);
      }, { timezone: 'Europe/Kyiv' });
      console.log(`📅 Personal digest cron scheduled at ${settings.dailyDigestTime}.`);
    } catch (err) { console.error('❌ Invalid digest cron expression:', err); }
  }

  // Overdue notifications — run 5 minutes after digest
  if (settings.notifyOnOverdue && settings.dailyDigestTime) {
    const [h, m] = settings.dailyDigestTime.split(':').map(Number);
    const mOverdue = (m + 5) % 60;
    const hOverdue = m + 5 >= 60 ? h + 1 : h;
    const expr = `${mOverdue} ${hOverdue} * * *`;
    try {
      overdueNotifCronTask = cron.schedule(expr, async () => {
        console.log('📅 Running overdue personal notifications...');
        const state = await getDb();
        await sendOverduePersonalNotifications(state);
      }, { timezone: 'Europe/Kyiv' });
      console.log(`📅 Overdue notifications cron scheduled.`);
    } catch (err) { console.error('❌ Invalid overdue cron:', err); }
  }
}

// ── Main Server ───────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '50mb' }));

  const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Init Firebase & bootstrap
  initFirebase();
  await bootstrapAdmin();
  const initialState = await getDb();
  setupTelegramCron(initialState.aiReportSchedule || '0 8 * * *');
  setupAnnouncementCrons(initialState.announcements || []);
  setupPersonalNotificationCrons(initialState.personalNotifications || DEFAULT_PERSONAL_NOTIFICATIONS);

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
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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

  app.post('/api/auth/invite', requireAuth, requireAdmin, async (req, res) => {
    const { userId } = req.body;
    if (!userId) { res.status(400).json({ error: 'userId обов\'язковий' }); return; }
    const appState = await getDb();
    const user = appState.users?.find((u: any) => u.id === userId);
    if (!user) { res.status(404).json({ error: 'Користувача не знайдено' }); return; }
    
    // Create an invite token valid for 7 days
    const token = jwt.sign({ inviteUserId: userId }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  });

  app.post('/api/auth/accept-invite', async (req, res) => {
    const { token, email, password } = req.body;
    if (!token || !email || !password) { res.status(400).json({ error: 'Усі поля обов\'язкові' }); return; }
    if (password.length < 6) { res.status(400).json({ error: 'Пароль мінімум 6 символів' }); return; }
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { inviteUserId: string };
      const userId = decoded.inviteUserId;
      
      const appState = await getDb();
      const user = appState.users?.find((u: any) => u.id === userId);
      if (!user) { res.status(404).json({ error: 'Користувача не знайдено' }); return; }
      
      const authDb = await getAuthDb();
      const emailExists = authDb.credentials.find(c => c.email.toLowerCase() === email.toLowerCase() && c.userId !== userId);
      if (emailExists) { res.status(409).json({ error: 'Цей email вже використовується' }); return; }
      
      const passwordHash = await bcrypt.hash(password, 10);
      const newCred: AuthCredential = { userId, email, passwordHash, role: 'member' };
      const existingIdx = authDb.credentials.findIndex(c => c.userId === userId);
      if (existingIdx >= 0) authDb.credentials[existingIdx] = newCred;
      else authDb.credentials.push(newCred);
      
      await saveAuthDb(authDb);
      
      // Update user object email in db
      user.email = email;
      await saveDb(appState);
      
      // Automatically log them in
      const payload: JWTPayload = { userId: newCred.userId, email: newCred.email, role: newCred.role };
      const authToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
      res.json({ token: authToken, user: { userId: newCred.userId, email: newCred.email, role: newCred.role, name: user.name, avatar: user.avatar } });
    } catch (e) {
      res.status(400).json({ error: 'Недійсне або прострочене посилання' });
    }
  });

  // ── App State Routes ─────────────────────────────────────────────────────────

  app.get('/api/state', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(await getDb());
  });

  app.post('/api/state', requireAuth, async (req, res) => {
    const oldState = await getDb();
    await saveDb(req.body);
    
    // Check if AI schedule changed
    if (req.body.aiReportSchedule && req.body.aiReportSchedule !== oldState.aiReportSchedule) {
      setupTelegramCron(req.body.aiReportSchedule);
    }
    // Re-setup announcement crons if changed
    if (req.body.announcements) {
      setupAnnouncementCrons(req.body.announcements);
    }
    // Re-setup personal notification crons if changed
    if (req.body.personalNotifications) {
      setupPersonalNotificationCrons(req.body.personalNotifications);
    }
    
    res.json({ success: true });
  });

  app.get('/api/state', requireAuth, async (req, res) => {
    try {
      const state = await getDb();
      res.json(state);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/status', requireAuth, async (req, res) => {
    try {
      const db = initFirebase();
      if (db) {
        const doc = await db.collection(CRM_COLLECTION).doc('status').get();
        if (doc.exists) {
          return res.json({ lastModified: doc.data()?.lastModified || new Date().toISOString() });
        }
      }
      res.json({ lastModified: new Date().toISOString() });
    } catch (e: any) {
      res.json({ lastModified: new Date().toISOString() });
    }
  });

  app.post('/api/test-notification', requireAuth, async (req, res) => {
    try {
      const state = await getDb();
      const result = await generateAndSendDailyReport(state);
      if (result.success) res.json({ success: true });
      else res.status(500).json({ success: false, error: result.error });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  // ── Announcements CRUD ───────────────────────────────────────────────────────

  app.get('/api/announcements', requireAuth, requireAdmin, async (req, res) => {
    try {
      const state = await getDb();
      res.json(state.announcements || []);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/announcements', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { label, text, time, days, enabled } = req.body;
      if (!label || !text || !time || !days) {
        res.status(400).json({ error: 'label, text, time, days are required' }); return;
      }
      const state = await getDb();
      const newAnn: AnnouncementRecord = {
        id: `ann_${Date.now()}`,
        label, text, time,
        days: days as number[],
        enabled: enabled !== false,
        createdAt: new Date().toISOString()
      };
      state.announcements = [...(state.announcements || []), newAnn];
      await saveDb(state);
      setupAnnouncementCrons(state.announcements);
      res.json(newAnn);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/announcements/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const state = await getDb();
      const idx = (state.announcements || []).findIndex((a: AnnouncementRecord) => a.id === id);
      if (idx === -1) { res.status(404).json({ error: 'Announcement not found' }); return; }
      state.announcements[idx] = { ...state.announcements[idx], ...req.body, id };
      await saveDb(state);
      setupAnnouncementCrons(state.announcements);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/announcements/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const state = await getDb();
      state.announcements = (state.announcements || []).filter((a: AnnouncementRecord) => a.id !== id);
      await saveDb(state);
      // Stop cron for this announcement
      const task = announcementCronTasks.get(id);
      if (task) { task.stop(); announcementCronTasks.delete(id); }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/announcements/:id/test', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const state = await getDb();
      const ann = (state.announcements || []).find((a: AnnouncementRecord) => a.id === id);
      if (!ann) { res.status(404).json({ error: 'Announcement not found' }); return; }
      const result = await sendAnnouncementToTelegram(ann.text);
      if (result.success) res.json({ success: true });
      else res.status(500).json({ success: false, error: result.error });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Upload ───────────────────────────────────────────────────────────────────

  const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, UPLOADS_DIR); },
    filename: (req, file, cb) => {
      // Decode from latin1 to utf8 to fix Cyrillic characters which break extension parsing
      const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const ext = path.extname(decodedName);
      const base = path.basename(decodedName, ext);
      cb(null, `${base}-${Date.now()}${ext}`);
    }
  });
  const upload = multer({ storage });

  app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    const decodedName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    res.json({ id: req.file.filename, name: decodedName, url: `/uploads/${encodeURIComponent(req.file.filename)}` });
  });

  app.post('/api/estimate-time', requireAuth, async (req, res) => {
    const { title, description } = req.body;
    if (!title) { res.status(400).json({ error: 'Title is required' }); return; }
    
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      // Fallback if no AI is configured
      return res.json({ estimatedMinutes: 60 });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const prompt = `You are a productivity AI. Estimate the time in minutes it takes to complete the following task.
Title: ${title}
Description: ${description || 'No description provided.'}

Reply ONLY with a number representing the estimated minutes. Do not include any text, punctuation, or explanation. For example: 45`;
      
      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const text = response.text || '';
      const match = text.match(/\d+/);
      const minutes = match ? parseInt(match[0], 10) : 60;
      
      res.json({ estimatedMinutes: minutes });
    } catch (err) {
      console.error('Gemini estimation error:', err);
      res.json({ estimatedMinutes: 60 });
    }
  });

  app.post('/api/entity/:type', requireAuth, async (req, res) => {
    try {
      const { type } = req.params;
      const data = req.body;
      console.log(`[entity] POST /${type}`, data?.id || '(no id)');
      const db = initFirebase();
      if (db) {
        if (!data.id) return res.status(400).json({ error: 'Missing ID' });
        await db.collection('crm_' + type).doc(data.id).set(data);
      } else {
        // Fallback for local files: read, append, save
        const state = await getDb();
        if (!state[type]) state[type] = [];
        // Avoid duplicate IDs
        state[type] = state[type].filter((item: any) => item.id !== data.id);
        state[type].push(data);
        await saveDb(state);
      }
      await updateLastModified();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/entity/:type/:id', requireAuth, async (req, res) => {
    try {
      const { type, id } = req.params;
      const updates = req.body;
      const db = initFirebase();
      if (db) {
        await db.collection('crm_' + type).doc(id).set(updates, { merge: true });
      } else {
        const state = await getDb();
        if (state[type]) {
          state[type] = state[type].map((item: any) => item.id === id ? { ...item, ...updates } : item);
          await saveDb(state);
        }
      }
      await updateLastModified();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/entity/:type/:id', requireAuth, async (req, res) => {
    try {
      const { type, id } = req.params;
      const db = initFirebase();
      if (db) {
        await db.collection('crm_' + type).doc(id).delete();
      } else {
        const state = await getDb();
        if (state[type]) {
          state[type] = state[type].filter((item: any) => item.id !== id);
          await saveDb(state);
        }
      }
      await updateLastModified();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/review-plan', requireAuth, async (req, res) => {
    const { title, description, subtasks } = req.body;
    if (!title) { res.status(400).json({ error: 'Title is required' }); return; }
    
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Gemini API key is not configured' });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const prompt = `Ти — мудрий і досвідчений менеджер проектів та маркетолог. Твоя мета — перевірити повноту задачі та оцінити її складність.
Користувач надав назву задачі, її опис та список підзадач (кроків), які він збирається виконати. 
Проаналізуй їх. Чи є "білі плями"? Чи не надто узагальнені кроки? Які важливі проміжні етапи пропущено (наприклад, погодження бюджету, аналітика, тестування, узгодження з іншим відділом тощо)?

Також, оціни загальну складність задачі (включаючи нові кроки) у Story Points (SP) від 1 до 5 за такими критеріями:
- 1 SP: Займає до 1 години. Рутинна, повністю зрозуміла задача без ризиків.
- 2 SP: Займає 1–3 години. Потребує трохи фокусу, алгоритм дій відомий.
- 3 SP: Займає 4–8 годин (до 1 дня). Потребує аналітики, креативу або узгоджень.
- 4 SP: Займає 2–3 дні. Багатоетапна задача, залежить від інших, висока складність.
- 5 SP: Займає від тижня. Висока невизначеність, стратегічна важливість (Епік).

Задача: ${title}
Опис: ${description || 'Не вказано'}
Існуючі підзадачі:
${subtasks && subtasks.length > 0 ? subtasks.map((s: any) => '- ' + s.title).join('\n') : 'Немає жодної підзадачі'}

ОБОВ'ЯЗКОВО поверни відповідь у форматі JSON (БЕЗ жодних Markdown-розміток, тільки чистий JSON), з ТРЬОМА полями:
1. "explanation" (рядок) — твій коментар як мудрого менеджера. Що не так, які білі плями знайдено.
2. "newSubtasks" (масив рядків) — список НОВИХ конкретних підзадач. В кінці кожної підзадачі обов'язково вказуй у дужках очікуваний результат, наприклад: "(результат - документ)".
3. "storyPoints" (число) — твоя оцінка задачі (від 1 до 5) згідно з критеріями.

Приклад виводу:
{
  "explanation": "Чудовий старт, але ви пропустили етап дослідження конкурентів та погодження бюджету.",
  "newSubtasks": ["Зробити зріз по 3 головних конкурентах (результат - таблиця порівняння)"],
  "storyPoints": 3
}`;
      
      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const text = response.text || '{}';
      // Очищення тексту від можливих маркдаун-тегів (на випадок, якщо ШІ їх все ж додасть)
      const cleanText = text.replace(/```json\n?|\n?```/gi, '').trim();
      const result = JSON.parse(cleanText);
      
      res.json(result);
    } catch (err) {
      console.error('Gemini review error:', err);
      res.status(500).json({ error: 'Failed to analyze plan' });
    }
  });

  // ── Personal Notification Endpoints ────────────────────────────────────────

  // Notify that a card was assigned (called from frontend)
  app.post('/api/notify/card-assigned', requireAuth, async (req, res) => {
    try {
      const { cardId, assigneeId } = req.body;
      if (!cardId || !assigneeId) { res.status(400).json({ error: 'cardId and assigneeId required' }); return; }
      const state = await getDb();
      await notifyCardAssigned(state, cardId, assigneeId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Send test personal notification to a specific user
  app.post('/api/notify/test-personal/:userId', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const state = await getDb();
      const user = (state.users || []).find((u: any) => u.id === userId);
      if (!user) { res.status(404).json({ error: 'User not found' }); return; }
      if (!user.telegramChatId) { res.status(400).json({ error: 'User has no Telegram Chat ID set' }); return; }
      const result = await sendPersonalTelegramMessage(
        user.telegramChatId,
        `👋 *Привіт, ${user.name}!*\n\nЦе тестове сповіщення від Pawell CRM.\nTelegram-сповіщення успішно налаштовані ✅`
      );
      if (result.success) res.json({ success: true });
      else res.status(500).json({ success: false, error: result.error });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Manually trigger overdue notifications (admin only)
  app.post('/api/notify/send-overdue', requireAuth, requireAdmin, async (req, res) => {
    try {
      const state = await getDb();
      await sendOverduePersonalNotifications(state);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Manually trigger personal digests (admin only)
  app.post('/api/notify/send-digests', requireAuth, requireAdmin, async (req, res) => {
    try {
      const state = await getDb();
      await sendDailyPersonalDigests(state);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
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

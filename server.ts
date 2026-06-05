import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import cron from 'node-cron';
import { GoogleGenAI } from '@google/genai';

async function generateAndSendDailyReport(state: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = '-5182383955';
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!token || !chatId) {
    console.log('Telegram bot token or chat ID not set. Notifications disabled.');
    return { success: false, error: 'missing_telegram_credentials' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isToday = (dateString: string | undefined) => {
    if (!dateString) return false;
    const d = new Date(dateString);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  };

  const isOverdue = (dateString: string | undefined) => {
    if (!dateString) return false;
    const d = new Date(dateString);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  };

  const isSoon = (dateString: string | undefined) => {
    if (!dateString) return false;
    const d = new Date(dateString);
    d.setHours(0, 0, 0, 0);
    const diffTime = d.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 3; // within 3 days
  };

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
        tasksDueToday: tasksToday.map((t: any) => ({
          title: t.title,
          assignee: state.users.find((u: any) => u.id === t.assigneeId)?.name || 'Не призначено'
        })),
        tasksOverdue: tasksOverdue.map((t: any) => ({
          title: t.title,
          assignee: state.users.find((u: any) => u.id === t.assigneeId)?.name || 'Не призначено'
        })),
        tasksDueSoon: tasksSoon.map((t: any) => ({
          title: t.title,
          deadline: new Date(t.deadline).toLocaleDateString('uk-UA'),
          assignee: state.users.find((u: any) => u.id === t.assigneeId)?.name || 'Не призначено'
        })),
        urgentTasks: urgentTasks.map((t: any) => ({
          title: t.title,
          assignee: state.users.find((u: any) => u.id === t.assigneeId)?.name || 'Не призначено'
        })),
        eventsToday: eventsToday.map((e: any) => ({ title: e.title })),
        contentToday: contentToday.map((c: any) => ({ title: c.focus || c.description }))
      };

      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const prompt = `Ти персональний ШІ-менеджер відділу маркетингу. Твій вайб — це класний, сучасний керівник, який тримає все під контролем без зайвого стресу та метушні. Сформуй ранковий звіт-дайджест для відправки в робочий Telegram-чат команди.
      
      Дані на сьогодні (${dbInfoForAI.date}):
      ${JSON.stringify(dbInfoForAI, null, 2)}
      
      ВИМОГИ ДО ФОРМАТУ (ОБОВ'ЯЗКОВО ДОТРИМУЙСЯ ЇХ, НЕ ЗМІНЮЙ СТРУКТУРУ):
      - Пиши з використанням Telegram Markdown (жирний шрифт).
      - Емодзі можуть бути, але в міру (не в кожному рядку, тільки для створення дружньої атмосфери класного менеджера та легких акцентів).
      - На самому початку звіту (перед усім іншим) має бути один максимально абсурдний, сюрреалістичний та трохи дивний мотиваційний жарт-цитата (щодня різний). Щось в стилі пост-іронії про роботу або життя.

      СТРУКТУРА:
      [Абсурдна мотиваційна фраза дня]
      
      📊 *Звіт на сьогодні (${dbInfoForAI.date})*

      🎯 *Задачі (Дедлайн сьогодні):*
      (список виконаних/запланованих задач на сьогодні з JSON. Напиши "- {Назва задачі} — 👤 {Відповідальний}")
      
      ⚠️ *Протерміновані задачі:*
      (якщо є - списком, якщо немає - пропусти або похвали команду в стилі "Ви неймовірні, боргів немає!")

      🗓 *Події/Контент сьогодні:*
      (зустрічі, події, пости - якщо є)

      🔥 *Наближається дедлайн (Наступні 3 дні):*
      (нагадай про задачі з tasksDueSoon/urgentTasks списком - якщо є)

      Не вигадуй дані та таски, бери тільки з JSON. Не додавай зайвих роздумів наприкінці, пиши виключно за шаблоном.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      messageText = response.text || '';
    } catch (err) {
      console.error('Gemini error, fallback to normal template', err);
    }
  }

  // Fallback if no Gemini or error
  if (!messageText) {
    messageText = '📋 *Звіт на сьогодні:*\n\n';

    if (eventsToday.length > 0) {
      messageText += '🗓 *Події/Зустрічі:*\n';
      eventsToday.forEach((e: any) => { messageText += `🔹 ${e.title}\n`; });
      messageText += '\n';
    }

    if (tasksToday.length > 0) {
      messageText += '✅ *Задачі (Дедлайн сьогодні):*\n';
      tasksToday.forEach((c: any) => {
        const assignee = state.users.find((u: any) => u.id === c.assigneeId)?.name || 'Не призначено';
        messageText += `🔹 ${c.title} — 👤 ${assignee}\n`;
      });
      messageText += '\n';
    }

    if (tasksOverdue.length > 0) {
      messageText += '⚠️ *Протерміновані задачі:*\n';
      tasksOverdue.forEach((c: any) => {
        const assignee = state.users.find((u: any) => u.id === c.assigneeId)?.name || 'Не призначено';
        messageText += `🔹 ${c.title} — 👤 ${assignee}\n`;
      });
    }

    if (contentToday.length > 0) {
      messageText += '📱 *Контент до публікації:*\n';
      contentToday.forEach((c: any) => {
        messageText += `🔹 ${c.focus || c.description || 'Без назви'}\n`;
      });
    }

    if (tasksToday.length === 0 && eventsToday.length === 0 && contentToday.length === 0 && tasksOverdue.length === 0) {
       messageText = 'На сьогодні немає запланованих задач чи подій. Гарного дня!';
    }
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'Markdown'
      })
    });
    console.log('Daily Telegram notification sent.');
    return { success: true };
  } catch (e) {
    console.error('Failed to send Telegram notification', e);
    return { success: false, error: 'request_failed' };
  }
}

function setupTelegramCron(dbGetter: () => any) {
  cron.schedule('0 8 * * *', async () => {
    generateAndSendDailyReport(dbGetter());
  });
  console.log('Telegram daily notification cron job scheduled.');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  
  app.use('/uploads', express.static(UPLOADS_DIR));

  const dbFile = path.join(process.cwd(), 'data.json');
  
  const getDb = () => {
    if (fs.existsSync(dbFile)) {
      return JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
    }
    const INITIAL_DATA = {
      users: [
        { id: 'u1', name: 'Max Hnatyk', avatar: 'https://ui-avatars.com/api/?name=Max+Hnatyk&background=random' },
        { id: 'u2', name: 'Alice Smith', avatar: 'https://ui-avatars.com/api/?name=Alice+Smith&background=random' },
        { id: 'u3', name: 'Bob Johnson', avatar: 'https://ui-avatars.com/api/?name=Bob+Johnson&background=random' }
      ],
      metrics: [
        { id: 'm1', title: 'Охоплення аудиторії', value: '124.5K', trend: '+12%', trendPositive: true },
        { id: 'm2', title: 'Лідів (MQL)', value: '840', trend: '+5%', trendPositive: true },
        { id: 'm3', title: 'Бюджет використано', value: '$4,250', trend: '-2%', trendPositive: false },
        { id: 'm4', title: 'Вартість ліда (CPA)', value: '$5.05', trend: '-8%', trendPositive: true }
      ],
      boards: [
        { id: 'b1', title: 'Основна дошка' }
      ],
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
      events: []
    };
    fs.writeFileSync(dbFile, JSON.stringify(INITIAL_DATA, null, 2));
    return INITIAL_DATA;
  };

  setupTelegramCron(getDb);

  app.post('/api/test-notification', async (req, res) => {
    try {
      const result = await generateAndSendDailyReport(getDb());
      if (result.success) {
        res.json({ success: true, message: 'Notification sent successfully' });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (e: any) {
      console.error('Test notification check error:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/state', (req, res) => {
    res.json(getDb());
  });

  app.post('/api/state', (req, res) => {
    fs.writeFileSync(dbFile, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      cb(null, `${base}-${Date.now()}${ext}`);
    }
  });
  const upload = multer({ storage });

  app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // Encode filename for safe URL resolution
    const url = `/uploads/${encodeURIComponent(req.file.filename)}`;
    res.json({ id: req.file.filename, name: req.file.originalname, url });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

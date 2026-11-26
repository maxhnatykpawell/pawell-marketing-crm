/**
 * Google Calendar — чиста логіка: що саме і як потрапляє в календар.
 *
 * Тут немає ні мережі, ні бази, ні React (див. googleCalendar.test.ts). Усе, що
 * залежить від Google чи сховища, живе в google-calendar-server.ts; тут лише
 * правила, які мають бути однаковими й передбачуваними.
 *
 * Напрямок один: CRM → Google. Правка події в самому Google назад у CRM не
 * повертається, а при наступній зміні задачі в CRM буде перезаписана.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { isEmail } from './email';

export { isEmail };

// ── Дати ─────────────────────────────────────────────────────────────────────

const DAY_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * День зі збереженого значення. Дати в CRM зберігаються як «ГГГГ-ММ-ДДT00:00:00.000Z»
 * (див. toStoredDate), тож день — це перші десять символів, а не локальна дата:
 * інакше в часовому поясі західніше за UTC задача з'їхала б на день назад.
 */
export function dayOf(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(DAY_RE);
  if (!m) return null;
  const day = m[0];
  // Відсікаємо неіснуючі дати на кшталт 2026-02-31
  const d = new Date(day + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().startsWith(day) ? day : null;
}

export function addDayKey(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Період на весь день. Google вважає кінець дня ВИКЛЮЧНИМ, а в CRM обидві дати
 * включно — звідси +1 день до кінця.
 */
export interface AllDayWindow {
  start: string;
  /** Виключний кінець (Google) */
  endExclusive: string;
}

export function taskWindow(card: { startDate?: string | null; deadline?: string | null }): AllDayWindow | null {
  const start = dayOf(card.startDate);
  const end = dayOf(card.deadline);
  if (!start && !end) return null;
  // Початок пізніше за дедлайн — дані суперечливі; вірімо дедлайну
  if (start && end && start <= end) return { start, endExclusive: addDayKey(end, 1) };
  const only = (end ?? start) as string;
  return { start: only, endExclusive: addDayKey(only, 1) };
}

export function eventWindow(ev: { startDate?: string | null; endDate?: string | null }): AllDayWindow | null {
  const start = dayOf(ev.startDate);
  const end = dayOf(ev.endDate);
  if (!start && !end) return null;
  if (start && end && start <= end) return { start, endExclusive: addDayKey(end, 1) };
  const only = (start ?? end) as string;
  return { start: only, endExclusive: addDayKey(only, 1) };
}

// ── Текст ────────────────────────────────────────────────────────────────────

/** Опис задачі може бути розміткою редактора: у календарі потрібен чистий текст */
export function plainText(input: string | null | undefined, limit = 1000): string {
  if (!input) return '';
  const text = input
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}

// ── Ресурси подій Google ─────────────────────────────────────────────────────

export interface GoogleEventResource {
  summary: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: { email: string }[];
  conferenceData?: unknown;
  extendedProperties?: { private: Record<string, string> };
  source?: { title: string; url: string };
  reminders?: { useDefault: boolean };
  transparency?: 'transparent' | 'opaque';
}

export interface CardLike {
  id: string;
  title: string;
  description?: string;
  startDate?: string | null;
  deadline?: string | null;
  assigneeId?: string | null;
  isCompleted?: boolean;
  projectId?: string | null;
}

export interface EventLike {
  id: string;
  title: string;
  description?: string;
  startDate?: string | null;
  endDate?: string | null;
  assigneeIds?: string[];
  websiteUrl?: string;
  location?: string;
  boothInfo?: string;
  goals?: string;
}

export interface BuildContext {
  /** Адреса застосунку для посилання назад; без неї посилання не додаємо */
  appUrl?: string | null;
  projectTitle?: string | null;
}

/** Мітка, за якою відрізняємо наші події від власних подій людини */
export const SYNC_MARK = 'pawell';

/**
 * Задача потрапляє в календар виконавця, лише якщо вона ще актуальна:
 * є дата, є виконавець і її не виконано. Виконану прибираємо — календар
 * показує, що попереду, а не архів.
 */
export function taskCalendarOwner(card: CardLike): string | null {
  if (card.isCompleted) return null;
  if (!card.assigneeId) return null;
  if (!taskWindow(card)) return null;
  return card.assigneeId;
}

export function buildTaskEvent(card: CardLike, ctx: BuildContext = {}): GoogleEventResource | null {
  const win = taskWindow(card);
  if (!win) return null;
  const lines: string[] = [];
  if (ctx.projectTitle) lines.push(`Проєкт: ${ctx.projectTitle}`);
  const body = plainText(card.description);
  if (body) lines.push(body);
  if (ctx.appUrl) lines.push(`Відкрити в CRM: ${ctx.appUrl.replace(/\/+$/, '')}/?card=${encodeURIComponent(card.id)}`);

  return {
    summary: (card.title || 'Без назви').slice(0, 300),
    ...(lines.length ? { description: lines.join('\n\n') } : {}),
    start: { date: win.start },
    end: { date: win.endExclusive },
    // Задача — нагадування, а не зайнятий час: не блокує слоти для зустрічей
    transparency: 'transparent',
    reminders: { useDefault: true },
    extendedProperties: { private: { [SYNC_MARK]: 'card', pawellId: card.id } },
    ...(ctx.appUrl ? { source: { title: 'PAWELL CRM', url: ctx.appUrl } } : {}),
  };
}

export function buildEventItemEvent(ev: EventLike, ctx: BuildContext = {}): GoogleEventResource | null {
  const win = eventWindow(ev);
  if (!win) return null;
  const lines: string[] = [];
  const body = plainText(ev.description);
  if (body) lines.push(body);
  if (ev.boothInfo) lines.push(`Стенд: ${plainText(ev.boothInfo, 300)}`);
  if (ev.goals) lines.push(`Цілі: ${plainText(ev.goals, 500)}`);
  if (ev.websiteUrl) lines.push(`Сайт: ${ev.websiteUrl}`);

  return {
    summary: (ev.title || 'Подія').slice(0, 300),
    ...(lines.length ? { description: lines.join('\n\n') } : {}),
    ...(ev.location ? { location: ev.location.slice(0, 300) } : {}),
    start: { date: win.start },
    end: { date: win.endExclusive },
    reminders: { useDefault: true },
    extendedProperties: { private: { [SYNC_MARK]: 'event', pawellId: ev.id } },
    ...(ctx.appUrl ? { source: { title: 'PAWELL CRM', url: ctx.appUrl } } : {}),
  };
}

/**
 * Відбиток вмісту події. Перетягування картки між колонками змінює лише order
 * і listId — на календар це не впливає, тож без порівняння відбитків ми б
 * даремно смикали Google на кожне таке переміщення.
 */
export function resourceHash(res: GoogleEventResource): string {
  const pick = {
    summary: res.summary,
    description: res.description ?? '',
    location: res.location ?? '',
    start: res.start,
    end: res.end,
  };
  return createHash('sha1').update(JSON.stringify(pick)).digest('hex');
}

// ── Міти ─────────────────────────────────────────────────────────────────────

export interface MeetingInput {
  title: string;
  description?: string;
  /** ISO зі зсувом, напр. 2026-12-01T10:00:00+02:00 */
  start: string;
  end: string;
  /** Email учасників (CRM-користувачі та сторонні) */
  attendeeEmails: string[];
  withMeet: boolean;
}

export const MAX_MEETING_ATTENDEES = 50;
export const MAX_MEETING_HOURS = 24;

/** Повертає текст помилки або null, якщо все гаразд */
export function validateMeeting(input: Partial<MeetingInput>): string | null {
  if (!input.title || !String(input.title).trim()) return 'Потрібна назва міту';
  if (String(input.title).length > 300) return 'Назва задовга';
  const s = Date.parse(input.start ?? '');
  const e = Date.parse(input.end ?? '');
  if (isNaN(s) || isNaN(e)) return 'Некоректний час міту';
  if (e <= s) return 'Кінець має бути пізніше за початок';
  if (e - s > MAX_MEETING_HOURS * 3600_000) return `Міт довший за ${MAX_MEETING_HOURS} год`;
  const emails = input.attendeeEmails ?? [];
  if (emails.length > MAX_MEETING_ATTENDEES) return `Забагато учасників (максимум ${MAX_MEETING_ATTENDEES})`;
  const bad = emails.find(x => !isEmail(x));
  if (bad) return `Некоректна адреса: ${String(bad).slice(0, 60)}`;
  return null;
}

export function buildMeeting(input: MeetingInput, requestId: string, timeZone: string): GoogleEventResource {
  const emails = [...new Set(input.attendeeEmails.map(e => e.trim().toLowerCase()))];
  return {
    summary: input.title.trim().slice(0, 300),
    ...(input.description?.trim() ? { description: input.description.trim().slice(0, 4000) } : {}),
    start: { dateTime: new Date(input.start).toISOString(), timeZone },
    end: { dateTime: new Date(input.end).toISOString(), timeZone },
    ...(emails.length ? { attendees: emails.map(email => ({ email })) } : {}),
    ...(input.withMeet
      ? { conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } } }
      : {}),
    reminders: { useDefault: true },
    extendedProperties: { private: { [SYNC_MARK]: 'meeting' } },
  };
}

// ── Токени: шифрування у спокої ──────────────────────────────────────────────

/**
 * Refresh-токен дає доступ до чужого календаря, тож у базі він лежить
 * зашифрованим (AES-256-GCM). Ключ виводиться із секрету сервера: витік самої
 * бази без секрету токенів не відкриває.
 */
function keyFrom(secret: string): Buffer {
  return createHash('sha256').update('pawell-google-token:' + secret).digest();
}

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

/** null — якщо значення зіпсоване або секрет змінився (токен тоді просто треба видати знову) */
export function decryptSecret(value: string, secret: string): string | null {
  try {
    const [v, iv, tag, data] = value.split('.');
    if (v !== 'v1') return null;
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Ідентифікатор звʼязку «користувач + обʼєкт»: придатний як ключ документа (без «/») */
export function linkId(userId: string, type: string, entityId: string): string {
  return createHash('sha1').update(`${userId}|${type}|${entityId}`).digest('hex');
}

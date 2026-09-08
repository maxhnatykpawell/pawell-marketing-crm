/**
 * Розклади повторюваних задач.
 *
 * Живуть тут, а не в server.ts, з однієї причини: те саме правило має однаково
 * відповідати на два різні питання. Сервер питає «чи створювати картку саме
 * зараз», інтерфейс — «коли це станеться наступного разу». Якби ці відповіді
 * рахувались у двох місцях, вони б розійшлись, і людина бачила б у списку одну
 * дату, а картку отримувала в іншу.
 *
 * Cron сам по собі на це не здатен: «кожні 3 дні» він не вміє, а «31 числа» в
 * лютому просто мовчки пропускає. Тому cron тут лише будильник — він приводить
 * нас до потрібної години, а рішення ухвалює isDue().
 */

import { daysWord } from './plural';

export type RecurrenceMode = 'daily' | 'weekly' | 'monthly' | 'interval';

export interface RecurrenceSchedule {
  mode: RecurrenceMode;
  /** "HH:mm" за часом команди */
  time: string;
  /** weekly: 0=Нд, 1=Пн … 6=Сб */
  days?: number[];
  /** monthly: 1–31. У коротких місяцях 29–31 зсуваються на останній день */
  dayOfMonth?: number;
  /** interval: кожні N днів, рахуючи від останнього створення */
  intervalDays?: number;
}

/** Часовий пояс команди — той самий, з яким заплановані решта cron-задач */
export const TEAM_TIMEZONE = 'Europe/Kyiv';

export const WEEKDAY_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** Форми на кшталт «щопонеділка» — для опису розкладу одним рядком */
const WEEKDAY_EVERY = [
  'щонеділі', 'щопонеділка', 'щовівторка', 'щосереди',
  'щочетверга', 'щоп’ятниці', 'щосуботи',
];

// ── Час і календар ───────────────────────────────────────────────────────────

/** Скільки мілісекунд зсув пояса в конкретну мить (з урахуванням літнього часу) */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  // formatToParts дає настінний час пояса; прочитаний як UTC, він відрізняється
  // від справжньої миті рівно на зсув
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export interface CalendarDay {
  year: number;
  month: number;   // 1–12
  day: number;
  weekday: number; // 0=Нд … 6=Сб
  /** "YYYY-MM-DD" — зручно порівнювати рядками */
  ymd: string;
}

/** Який календарний день зараз у заданому поясі */
export function calendarDay(date: Date, timeZone: string = TEAM_TIMEZONE): CalendarDay {
  const shifted = new Date(date.getTime() + timeZoneOffsetMs(date, timeZone));
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  return {
    year, month, day,
    weekday: shifted.getUTCDay(),
    ymd: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

/** Мить, що відповідає «YYYY-MM-DD о HH:mm» у заданому поясі */
export function zonedInstant(ymd: string, time: string, timeZone: string = TEAM_TIMEZONE): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  return new Date(guess - timeZoneOffsetMs(new Date(guess), timeZone));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDaysToYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + delta));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

/** Скільки цілих діб між двома календарними днями */
export function daysBetweenYmd(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

// ── Перевірка й cron ─────────────────────────────────────────────────────────

/** Що не так із розкладом; null — усе гаразд */
export function validateSchedule(s: RecurrenceSchedule | undefined | null): string | null {
  if (!s) return 'Розклад не заданий';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time || '')) return 'Час має бути у форматі ГГ:ХХ';
  switch (s.mode) {
    case 'daily':
      return null;
    case 'weekly':
      if (!s.days?.length) return 'Оберіть хоча б один день тижня';
      if (s.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return 'Некоректний день тижня';
      return null;
    case 'monthly':
      if (!Number.isInteger(s.dayOfMonth) || s.dayOfMonth! < 1 || s.dayOfMonth! > 31) return 'Число місяця — від 1 до 31';
      return null;
    case 'interval':
      if (!Number.isInteger(s.intervalDays) || s.intervalDays! < 1 || s.intervalDays! > 365) return 'Інтервал — від 1 до 365 днів';
      return null;
    default:
      return 'Невідомий тип розкладу';
  }
}

/**
 * Cron-вираз, який будить перевірку.
 *
 * Він навмисно ширший за сам розклад: «кожні 3 дні» будиться щодня, «31 числа»
 * — у всі дні з 28-го. Точне рішення ухвалює isDue(), і саме тому короткий
 * лютий не з'їдає щомісячну задачу.
 */
export function toCronExpression(s: RecurrenceSchedule): string {
  const [hh, mm] = s.time.split(':').map(Number);
  switch (s.mode) {
    case 'weekly': {
      const days = [...new Set(s.days || [])].sort((a, b) => a - b);
      return `${mm} ${hh} * * ${days.join(',')}`;
    }
    case 'monthly':
      return s.dayOfMonth! <= 28
        ? `${mm} ${hh} ${s.dayOfMonth} * *`
        : `${mm} ${hh} 28,29,30,31 * *`;
    default:
      return `${mm} ${hh} * * *`;
  }
}

/**
 * Чи випадає розклад саме на цю мить.
 *
 * lastRunAt потрібен лише режиму «кожні N днів» — решта режимів прив'язані до
 * календаря, а не до попереднього запуску.
 */
export function isDue(
  s: RecurrenceSchedule,
  now: Date,
  lastRunAt?: string | null,
  timeZone: string = TEAM_TIMEZONE,
): boolean {
  if (validateSchedule(s)) return false;
  const today = calendarDay(now, timeZone);

  switch (s.mode) {
    case 'daily':
      return true;
    case 'weekly':
      return (s.days || []).includes(today.weekday);
    case 'monthly': {
      const target = Math.min(s.dayOfMonth!, daysInMonth(today.year, today.month));
      return today.day === target;
    }
    case 'interval': {
      if (!lastRunAt) return true;
      const last = calendarDay(new Date(lastRunAt), timeZone);
      return daysBetweenYmd(last.ymd, today.ymd) >= s.intervalDays!;
    }
    default:
      return false;
  }
}

/**
 * Коли розклад спрацює наступного разу; null — ніколи (розклад некоректний).
 *
 * Рахується перебором днів, а не формулою: днів мало, а формула для «31 числа
 * в лютому» і «кожні N днів від останнього запуску» вийшла б довшою за цикл.
 */
export function nextRunAt(
  s: RecurrenceSchedule,
  from: Date = new Date(),
  lastRunAt?: string | null,
  timeZone: string = TEAM_TIMEZONE,
): Date | null {
  if (validateSchedule(s)) return null;
  let ymd = calendarDay(from, timeZone).ymd;
  for (let i = 0; i < 400; i++) {
    const candidate = zonedInstant(ymd, s.time, timeZone);
    if (candidate.getTime() > from.getTime() && isDue(s, candidate, lastRunAt, timeZone)) return candidate;
    ymd = addDaysToYmd(ymd, 1);
  }
  return null;
}

// ── Опис людською мовою ──────────────────────────────────────────────────────

/** Розклад одним рядком — те, що видно у списку правил */
export function describeSchedule(s: RecurrenceSchedule): string {
  if (validateSchedule(s)) return 'розклад не налаштований';
  const at = `о ${s.time}`;
  switch (s.mode) {
    case 'daily':
      return `щодня ${at}`;
    case 'weekly': {
      const days = [...new Set(s.days || [])].sort((a, b) => a - b);
      if (days.length === 7) return `щодня ${at}`;
      if (days.length === 1) return `${WEEKDAY_EVERY[days[0]]} ${at}`;
      return `по ${days.map(d => WEEKDAY_SHORT[d]).join(', ')} ${at}`;
    }
    case 'monthly':
      return `щомісяця ${s.dayOfMonth} числа ${at}`;
    case 'interval':
      return s.intervalDays === 1
        ? `щодня ${at}`
        : `кожні ${s.intervalDays} ${daysWord(s.intervalDays!)} ${at}`;
    default:
      return 'розклад не налаштований';
  }
}

/** «сьогодні о 09:00» / «завтра о 09:00» / «12.05 о 09:00» */
export function describeNextRun(next: Date | null, now: Date = new Date(), timeZone: string = TEAM_TIMEZONE): string {
  if (!next) return '—';
  const today = calendarDay(now, timeZone);
  const target = calendarDay(next, timeZone);
  const diff = daysBetweenYmd(today.ymd, target.ymd);
  const time = new Intl.DateTimeFormat('uk-UA', { timeZone, hour: '2-digit', minute: '2-digit' }).format(next);
  if (diff === 0) return `сьогодні о ${time}`;
  if (diff === 1) return `завтра о ${time}`;
  const date = new Intl.DateTimeFormat('uk-UA', { timeZone, day: '2-digit', month: '2-digit' }).format(next);
  return `${date} о ${time}`;
}

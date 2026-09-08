/**
 * Навантаження однієї людини по днях.
 *
 * Діаграма показує, коли задачі йдуть, але не відповідає на головне питання
 * планування: чи це взагалі влазить у тиждень. Три смужки поруч виглядають
 * однаково і тоді, коли це три півгодинні дрібниці, і тоді, коли це три дні
 * роботи, втиснуті в один. Тому поруч зі смужками рахується вага дня.
 *
 * Математика дат лишається в lib/gantt — тут тільки те, що з неї випливає.
 */

import { DayRange, dayKeysBetween, isWeekend, rangeOf, rangeLength } from './gantt';
import { daysWord } from './plural';

/** Скільки людина реально встигає за день — 8 годин, як і тижнева норма в команді */
export const DEFAULT_DAILY_CAPACITY_MINUTES = 480;

export interface WorkloadTask {
  id: string;
  title: string;
  range: DayRange;
  /** Оцінка в хвилинах; 0 — задача без оцінки */
  minutes: number;
  isCompleted: boolean;
}

/** Картка в тому вигляді, в якому вона потрапляє на діаграму */
export interface SchedulableCard {
  id: string;
  title: string;
  startDate?: string | null;
  deadline?: string | null;
  estimatedMinutes?: number;
  isCompleted?: boolean;
}

/**
 * Картки → задачі діаграми.
 *
 * Без жодної дати задача на шкалі не існує — її нема куди покласти, і
 * вигадувати їй дати не можна. Такі просто не потрапляють сюди, а скільки їх —
 * рахує окремо інтерфейс, щоб людина не думала, що список повний.
 */
export function toWorkloadTasks(cards: SchedulableCard[]): WorkloadTask[] {
  const tasks: WorkloadTask[] = [];
  for (const card of cards) {
    const range = rangeOf(card);
    if (!range) continue;
    tasks.push({
      id: card.id,
      title: card.title,
      range,
      minutes: Math.max(0, card.estimatedMinutes || 0),
      isCompleted: !!card.isCompleted,
    });
  }
  // Раніший початок вище; за однакового початку коротша задача вище — так
  // видно, що встигає закінчитись всередині довгої
  return tasks.sort((a, b) =>
    a.range.start.localeCompare(b.range.start) || a.range.end.localeCompare(b.range.end),
  );
}

/**
 * Робочі дні відрізка.
 *
 * Оцінку розмазуємо тільки по буднях: задача «з п'ятниці по понеділок» — це
 * два дні роботи, а не чотири, і рахувати вихідні означало б занизити
 * навантаження саме тих днів, які людина планує. Якщо відрізок цілком
 * припадає на вихідні (аврал буває), беремо його як є — інакше вийшов би
 * нуль робочих днів і ділення на нуль.
 */
export function workingDaysOf(range: DayRange): string[] {
  const all = dayKeysBetween(range.start, range.end);
  const working = all.filter(key => !isWeekend(key));
  return working.length > 0 ? working : all;
}

/** Скільки хвилин задачі припадає на кожен її робочий день */
export function spreadMinutes(range: DayRange, minutes: number): Map<string, number> {
  const days = workingDaysOf(range);
  const perDay = minutes / days.length;
  const out = new Map<string, number>();
  for (const key of days) out.set(key, perDay);
  return out;
}

export interface DayLoad {
  key: string;
  /** Скільки задач іде в цей день */
  tasks: number;
  /** Сумарна оцінка, хвилин */
  minutes: number;
  /** Скільки із задач дня — без оцінки: вага дня занижена рівно на них */
  unestimated: number;
}

/**
 * Вага кожного дня шкали.
 *
 * Задача рахується в дні, коли вона триває, включно з вихідними: вона й
 * справді «висить» у суботу. А от хвилини у вихідні не додаються — див.
 * workingDaysOf.
 */
export function dailyLoad(tasks: WorkloadTask[], days: string[]): DayLoad[] {
  const loads = new Map<string, DayLoad>();
  for (const key of days) loads.set(key, { key, tasks: 0, minutes: 0, unestimated: 0 });

  for (const task of tasks) {
    for (const key of dayKeysBetween(task.range.start, task.range.end)) {
      const day = loads.get(key);
      if (!day) continue;
      day.tasks++;
      if (task.minutes === 0) day.unestimated++;
    }
    if (task.minutes > 0) {
      for (const [key, minutes] of spreadMinutes(task.range, task.minutes)) {
        const day = loads.get(key);
        if (day) day.minutes += minutes;
      }
    }
  }

  return days.map(key => loads.get(key)!);
}

export type LoadLevel = 'free' | 'ok' | 'tight' | 'over';

/**
 * Наскільки день важкий.
 *
 * «tight» — це не помилка, а попередження: день заповнений під зав'язку, і
 * будь-яка дрібниця зверху вже не влізе.
 */
export function loadLevel(minutes: number, capacity: number = DEFAULT_DAILY_CAPACITY_MINUTES): LoadLevel {
  if (minutes <= 0) return 'free';
  if (minutes > capacity) return 'over';
  if (minutes > capacity * 0.75) return 'tight';
  return 'ok';
}

export interface WorkloadSummary {
  /** Сумарна оцінка по всіх днях шкали, хвилин */
  totalMinutes: number;
  /** Найважчий день; null — якщо на шкалі порожньо */
  peakDay: DayLoad | null;
  /** Найбільше задач одночасно */
  maxConcurrent: number;
  /** Скільки днів вийшли за норму */
  overloadedDays: number;
  /** Скільки задач лишились без оцінки — на стільки картина неповна */
  unestimatedTasks: number;
}

export function summarize(
  tasks: WorkloadTask[],
  loads: DayLoad[],
  capacity: number = DEFAULT_DAILY_CAPACITY_MINUTES,
): WorkloadSummary {
  let peakDay: DayLoad | null = null;
  let totalMinutes = 0;
  let maxConcurrent = 0;
  let overloadedDays = 0;

  for (const day of loads) {
    totalMinutes += day.minutes;
    if (day.tasks > maxConcurrent) maxConcurrent = day.tasks;
    if (day.minutes > capacity) overloadedDays++;
    // За однакової ваги пріоритет має день, де більше задач: саме там
    // найімовірніше щось загубиться
    if (!peakDay || day.minutes > peakDay.minutes ||
        (day.minutes === peakDay.minutes && day.tasks > peakDay.tasks)) {
      peakDay = day;
    }
  }

  return {
    totalMinutes,
    peakDay: peakDay && (peakDay.tasks > 0 || peakDay.minutes > 0) ? peakDay : null,
    maxConcurrent,
    overloadedDays,
    unestimatedTasks: tasks.filter(t => t.minutes === 0).length,
  };
}

/**
 * Задачі, що йдуть одночасно із заданою.
 *
 * Потрібно для відповіді «з чим саме це перетинається»: сама діаграма показує
 * перетин, але коли смужок багато, знайти сусіда очима важко.
 */
export function overlapsWith(task: WorkloadTask, tasks: WorkloadTask[]): WorkloadTask[] {
  return tasks.filter(other =>
    other.id !== task.id &&
    other.range.start <= task.range.end &&
    task.range.start <= other.range.end,
  );
}

/** «2 год 30 хв» / «45 хв» / «—» */
export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded <= 0) return '—';
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m} хв`;
  if (m === 0) return `${h} год`;
  return `${h} год ${m} хв`;
}

/** Скільки днів триває задача — для підпису на смужці */
export function durationLabel(range: DayRange): string {
  const days = rangeLength(range);
  return `${days} ${daysWord(days)}`;
}

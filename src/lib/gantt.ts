/**
 * Математика діаграми Ганта.
 *
 * Планування — це робота з днями, а не з моментами часу: «з 3 по 7 вересня»
 * не має ні годин, ні часового поясу. Тому всередині все живе рядками
 * 'YYYY-MM-DD' (далі — ключ дня), а не об'єктами Date: рядки не з'їжджають на
 * добу назад, коли на сервері UTC, а в людини Київ, і порівнюються звичайним
 * `<`.
 *
 * У базі дати лишаються повним ISO — так їх пише решта застосунку (дедлайни
 * карток, телеграм-нагадування), і міняти формат заради діаграми означало б
 * зачепити все інше. Переклад в обидва боки — `toDayKey` / `toStoredDate`.
 */

/** Відрізок планування: обидві дати включно. */
export interface DayRange {
  start: string;
  end: string;
}

/** Те, що можна покласти на діаграму: картка або пункт переліку. */
export interface Schedulable {
  startDate?: string | null;
  deadline?: string | null;
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})/;

/** Ключ дня → Date в UTC-опівночі. Тільки для арифметики й днів тижня. */
export function parseDayKey(key: string): Date {
  const m = DAY_KEY.exec(key);
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function keyFromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Будь-яка дата з бази → ключ дня.
 *
 * ISO-рядок ріжемо, а не парсимо: `new Date('2026-09-02T00:00:00.000Z')` у
 * поясі на захід від Гринвіча дав би 1 вересня, і смужка поїхала б на день.
 */
export function toDayKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    // Локальні частини: «сьогодні» в людини, а не в UTC.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const m = DAY_KEY.exec(value.trim());
  return m ? m[0].slice(0, 10) : null;
}

/**
 * Ключ дня → Date у місцевому поясі.
 *
 * Тільки для підписів: date-fns форматує за місцевим часом, тож UTC-опівніч
 * у поясі на захід від Гринвіча підписалася б учорашнім числом.
 */
export function toLocalDate(key: string): Date {
  const m = DAY_KEY.exec(key);
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Ключ дня → те, що лягає в базу (повний ISO, як і решта дат). */
export function toStoredDate(key: string): string {
  return `${key}T00:00:00.000Z`;
}

export function todayKey(now: Date = new Date()): string {
  return toDayKey(now) as string;
}

export function addDays(key: string, days: number): string {
  const date = parseDayKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return keyFromUtc(date);
}

/** Скільки днів від `from` до `to` (від'ємне — якщо `to` раніше). */
export function diffDays(from: string, to: string): number {
  return Math.round((parseDayKey(to).getTime() - parseDayKey(from).getTime()) / 86400000);
}

/** Тривалість відрізка в днях; одноденний відрізок — це 1. */
export function rangeLength(range: DayRange): number {
  return diffDays(range.start, range.end) + 1;
}

export function isWeekend(key: string): boolean {
  const day = parseDayKey(key).getUTCDay();
  return day === 0 || day === 6;
}

export function dayKeysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const total = diffDays(start, end);
  for (let i = 0; i <= total; i++) out.push(addDays(start, i));
  return out;
}

/**
 * Відрізок задачі.
 *
 * Якщо стоїть лише дедлайн — а так виглядають усі картки, створені до
 * планування — показуємо одноденну смужку в день дедлайну. Інакше половина
 * дошки просто не потрапила б на діаграму.
 */
export function rangeOf(item: Schedulable | null | undefined): DayRange | null {
  if (!item) return null;
  const start = toDayKey(item.startDate);
  const end = toDayKey(item.deadline);
  if (start && end) return start <= end ? { start, end } : { start: end, end: start };
  if (start) return { start, end: start };
  if (end) return { start: end, end };
  return null;
}

/** Найменший відрізок, що вкриває всі задані. */
export function spanOf(ranges: (DayRange | null | undefined)[]): DayRange | null {
  let span: DayRange | null = null;
  for (const range of ranges) {
    if (!range) continue;
    if (!span) { span = { ...range }; continue; }
    if (range.start < span.start) span.start = range.start;
    if (range.end > span.end) span.end = range.end;
  }
  return span;
}

/**
 * Межі шкали.
 *
 * `anchor` (зазвичай сьогодні) завжди всередині: діаграма, на якій не видно
 * поточного дня, не показує, чи встигаємо. Поля з боків дають місце, щоб
 * відтягнути смужку далі, не чекаючи перерахунку шкали.
 */
export function timelineBounds(
  ranges: (DayRange | null | undefined)[],
  anchor: string,
  pad = 3,
): { start: string; end: string; days: string[] } {
  const span = spanOf([...ranges, { start: anchor, end: anchor }])!;
  const start = addDays(span.start, -pad);
  const end = addDays(span.end, pad);
  return { start, end, days: dayKeysBetween(start, end) };
}

export function shiftRange(range: DayRange, days: number): DayRange {
  if (!days) return range;
  return { start: addDays(range.start, days), end: addDays(range.end, days) };
}

/**
 * Тягнемо за край смужки.
 *
 * Краї не перестрибують один одного: відрізок коротший за день — це не
 * «мінус два дні роботи», а просто зіпсована дата, тож упираємось в один день.
 */
export function resizeRange(range: DayRange, edge: 'start' | 'end', days: number): DayRange {
  if (!days) return range;
  if (edge === 'start') {
    const start = addDays(range.start, days);
    return { start: start > range.end ? range.end : start, end: range.end };
  }
  const end = addDays(range.end, days);
  return { start: range.start, end: end < range.start ? range.start : end };
}

/** Смужка, яку малюють протягуванням по порожньому рядку. */
export function rangeFromDrag(anchor: string, current: string): DayRange {
  return anchor <= current ? { start: anchor, end: current } : { start: current, end: anchor };
}

/** Відрізок → поля картки/пункту так, як вони зберігаються. */
export function rangeToFields(range: DayRange | null): { startDate: string | null; deadline: string | null } {
  if (!range) return { startDate: null, deadline: null };
  return { startDate: toStoredDate(range.start), deadline: toStoredDate(range.end) };
}

/**
 * Зсуває всі заплановані елементи на однакову кількість днів.
 *
 * Так рухається зведена смужка картки: власних дат у неї немає, вона —
 * охоплення підзадач, тож «переставити задачу на тиждень пізніше» означає
 * зсунути кожну підзадачу. Незаплановані лишаються незапланованими: у них
 * немає що зсувати, і вигадувати їм дати через сусідів не можна.
 */
export function shiftSchedulables<T extends Schedulable>(items: T[], days: number): T[] {
  if (!days) return items;
  return items.map(item => {
    const range = rangeOf(item);
    if (!range) return item;
    return { ...item, ...rangeToFields(shiftRange(range, days)) };
  });
}

/** Частина відрізка, що вже позаду: скільки з запланованого часу минуло. */
export function elapsedShare(range: DayRange, today: string): number {
  const total = rangeLength(range);
  const done = diffDays(range.start, today) + 1;
  if (done <= 0) return 0;
  if (done >= total) return 1;
  return done / total;
}

/** Прострочено — кінець позаду, а роботу не закрито. */
export function isOverdue(range: DayRange, today: string, completed: boolean): boolean {
  return !completed && range.end < today;
}

export interface DaySegment {
  /** Індекс першого дня сегмента в масиві днів шкали */
  index: number;
  /** Скільки днів займає */
  span: number;
  /** Ключ першого дня — з нього роблять підпис */
  key: string;
}

/**
 * Групує дні шкали для верхнього рядка заголовка: по місяцях або по тижнях
 * (тиждень починається з понеділка).
 */
export function groupDays(days: string[], by: 'month' | 'week'): DaySegment[] {
  const segments: DaySegment[] = [];
  days.forEach((key, index) => {
    const previous = segments[segments.length - 1];
    const isNew = by === 'month'
      ? !previous || key.slice(0, 7) !== previous.key.slice(0, 7)
      : !previous || parseDayKey(key).getUTCDay() === 1;
    if (isNew) segments.push({ index, span: 1, key });
    else previous.span++;
  });
  return segments;
}

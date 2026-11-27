/**
 * Накладання попереднього періоду на графік поточного.
 *
 * Дні двох періодів зіставляються за зсувом від початку: перший день поточного
 * проти першого дня попереднього, і так далі. Так 1–7 жовтня лягає на 24–30
 * вересня, і лінії порівнюються «день до дня», а не «дата до дати».
 */

const DAY_MS = 86400000;

const toUtc = (ymd: string) => new Date(ymd + 'T00:00:00Z').getTime();

/** Скільки днів від `from` до `date`; від'ємне, якщо дата раніше */
export function dayOffset(from: string, date: string): number {
  return Math.round((toUtc(date) - toUtc(from)) / DAY_MS);
}

/** Дата через `days` днів від `ymd` */
export function shiftDay(ymd: string, days: number): string {
  return new Date(toUtc(ymd) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Префікс полів попереднього періоду в рядку графіка */
export const PREV = 'prev_';

export type OverlayRow<T> = Partial<T> & {
  /** Дата поточного періоду, до якої прив'язано рядок */
  date: string;
  /** Дата попереднього періоду, що лежить на цьому ж місці */
  prevDate: string;
} & Record<string, unknown>;

/**
 * Рядки графіка: по одному на кожен зсув, де є дані хоч одного з періодів.
 * Поля поточного періоду лишаються як були, поля попереднього отримують
 * префікс `prev_` — так обидві лінії малюються з одного набору рядків.
 * День без знімка в одному з періодів дає порожнє значення (розрив лінії),
 * а не нуль: «даних немає» і «було нуль» — різні речі.
 */
export function overlayRows<T extends { date: string }>(
  current: T[],
  previous: T[],
  from: string,
  prevFrom: string,
  keys: (keyof T & string)[],
): OverlayRow<T>[] {
  const byOffset = new Map<number, OverlayRow<T>>();
  const row = (offset: number): OverlayRow<T> => {
    let r = byOffset.get(offset);
    if (!r) {
      r = { date: shiftDay(from, offset), prevDate: shiftDay(prevFrom, offset) } as OverlayRow<T>;
      byOffset.set(offset, r);
    }
    return r;
  };

  for (const e of current) Object.assign(row(dayOffset(from, e.date)), e);
  for (const e of previous) {
    const r = row(dayOffset(prevFrom, e.date));
    for (const k of keys) (r as Record<string, unknown>)[PREV + k] = e[k];
  }

  return [...byOffset.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

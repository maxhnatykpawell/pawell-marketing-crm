/**
 * Сигнал «таск закрито» — щоб святкування жило в одному місці.
 *
 * Закрити картку можна трьома шляхами: чекбоксом на дошці, кнопкою в модалці
 * і масовим «позначити виконаними». Вішати анімацію на кожен — це три копії,
 * які розійдуться при першій же зміні. Тому всі три штовхають один сигнал.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Скільки часу після спалаху ігнорувати повторні виклики.
 *
 * Масове закриття десяти карток — це одна подія для людини, а не десять:
 * десять накладених спалахів дали б суцільну стіну з конфеті замість свята.
 * Тим же вікном гаситься подвійний виклик у StrictMode.
 */
const COOLDOWN_MS = 400;

let lastFiredAt = 0;

/** Запустити святкування. Повторні виклики в межах вікна ігноруються. */
export function celebrate(now: number = Date.now()): void {
  if (now - lastFiredAt < COOLDOWN_MS) return;
  lastFiredAt = now;
  listeners.forEach(l => l());
}

/** Підписатись на сигнал; повертає функцію відписки */
export function onCelebrate(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Лише для тестів — скинути вікно між перевірками */
export function resetCelebrateCooldown(): void {
  lastFiredAt = 0;
}

/**
 * Рух у мобільному інтерфейсі: єдині криві, пружини й правила.
 *
 * Чому окремо. Якщо кожен екран підбирає свою тривалість і криву, інтерфейс «смикається»:
 * одна панель виїжджає за 150 мс, інша за 400. Тут усе, що задає характер руху, а компоненти
 * лише беруть звідси значення.
 *
 * Принципи:
 *  • рухаємо лише transform і opacity: вони йдуть на відеокарті й не змушують перераховувати
 *    верстку, тож плавно навіть на слабкому телефоні;
 *  • вхід довший за вихід: панель, що з'являється, має «приземлитись», а та, що зникає,
 *    не повинна затримувати людину;
 *  • рух пояснює зв'язок (екран виїжджає звідти, куди вів дотик), а не прикрашає;
 *  • якщо в системі ввімкнено «менше руху», лишається лише проявлення (MotionConfig у оболонці).
 *
 * Чиста логіка без React: motion.test.ts.
 */

/** Криві: out — швидкий старт і м'яке гальмування (для появи), inOut — для переходів між станами */
export const EASE = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
  in: [0.4, 0, 1, 1] as [number, number, number, number],
};

/** Пружини: ui — дотики й перемикачі, sheet — нижні панелі, push — екран, що виїжджає збоку */
export const SPRING = {
  ui: { type: 'spring', stiffness: 460, damping: 32, mass: 0.8 } as const,
  sheet: { type: 'spring', stiffness: 380, damping: 40 } as const,
  push: { type: 'spring', stiffness: 360, damping: 38, mass: 0.9 } as const,
};

/** Тривалості, с */
export const DUR = { fast: 0.15, base: 0.24, slow: 0.36, exit: 0.2 } as const;

/**
 * Напрямок переходу між вкладками: −1 — нова ліворуч, 1 — праворуч, 0 — та сама.
 * Нова вкладка «приїжджає» з того боку, де вона стоїть у нижній навігації.
 */
export function tabDirection<T>(order: readonly T[], from: T, to: T): -1 | 0 | 1 {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a === -1 || b === -1 || a === b) return 0;
  return b > a ? 1 : -1;
}

/**
 * Чи закривати панель після жесту «потягнути».
 * Досить або потягнути достатньо далеко, або різко смикнути (навіть недалеко): так робить
 * і система, тому жест відчувається «як належить».
 */
export function shouldDismiss(offset: number, velocity: number, distance = 110, speed = 520): boolean {
  if (offset <= 0) return false;
  return offset > distance || (velocity > speed && offset > 20);
}

/** Затримка елемента у каскаді: перші кілька з'являються по черзі, решта разом з останнім */
export function staggerDelay(index: number, step = 0.035, maxSteps = 8): number {
  return Math.min(Math.max(index, 0), maxSteps) * step;
}

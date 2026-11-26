/**
 * Коли показувати заставку з логотипом.
 *
 * Правило: один раз за сеанс вкладки, тобто при запуску застосунку (в тому числі з головного
 * екрана телефона), а не після кожного оновлення сторінки чи входу. Той, хто працює цілий
 * день, не повинен щоразу чекати анімацію.
 *
 *   • full  — повна анімація;
 *   • short — коротке м'яке з'явлення (людина просила менше руху в системі);
 *   • none  — нічого.
 *
 * ?splash=1 в адресі показує заставку знову в будь-якому випадку: так її можна переглянути
 * чи показати колегам, не відкриваючи нову вкладку.
 *
 * Чиста логіка без DOM: splash.test.ts.
 */

export const SPLASH_STORAGE_KEY = 'pawell_splash_seen';

export type SplashMode = 'full' | 'short' | 'none';

export interface SplashContext {
  /** window.location.search */
  search: string;
  /** Чи вже показували в цьому сеансі */
  seen: boolean;
  /** prefers-reduced-motion: reduce */
  reducedMotion: boolean;
}

export function decideSplash({ search, seen, reducedMotion }: SplashContext): SplashMode {
  const forced = new URLSearchParams(search).get('splash') === '1';
  if (seen && !forced) return 'none';
  return reducedMotion ? 'short' : 'full';
}

/** Скільки показувати (мс) і скільки триває зникнення */
export const SPLASH_TIMING = {
  /** Анімація логотипа триває ~2,6 с; ще трохи тримаємо кадр, щоб його встигли побачити */
  fullMs: 3000,
  shortMs: 900,
  exitMs: 450,
} as const;

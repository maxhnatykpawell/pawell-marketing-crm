/**
 * Форма знімка /api/keepincrm/ltv.
 *
 * Раніше цей опис жив у props модалки — і тому був відомий лише їй. Тепер його
 * читають сторінка аналітики і PDF-звіт, тож він виділений окремо: два місця,
 * які показують одні й ті самі числа, мають описувати їх однаково.
 */

import { CohortLtvRow, CohortLtvHorizon } from './cohortLtv';

/** Один етап воронки в агрегатах синхронізації */
export interface StageStat {
  stage: string;
  count: number;
  /** Скільки днів у середньому висять угоди, що зараз на цьому етапі */
  avgOpenDays: number;
  /** Скільки днів у середньому минало від створення до закриття */
  avgCycleDays: number;
}

export interface LtvSnapshot {
  totalLTVRevenue: number;
  uniqueClientsCount: number;
  /** ARPU за весь час — довідкове число поруч з когортним LTV */
  ltv: number;
  stageStats?: StageStat[];
  /** Помилка останньої синхронізації, якщо вона впала */
  lastSyncError?: string | null;
  cohortLtv?: {
    rows: CohortLtvRow[];
    horizons: Record<number, CohortLtvHorizon | null>;
  };
  /** Діапазон, яким обмежено вивантаження; null = за весь час */
  scopedTo?: { from: string | null; to: string | null } | null;
}

/**
 * Чим показувати сторінку, поки знімок не приїхав.
 *
 * Порожній знімок замість null навмисно: інакше кожне звернення до полів у
 * розмітці мусило б окремо перевіряти наявність даних, і будь-яке забуте
 * місце падало б уже в браузері користувача.
 */
export const EMPTY_LTV_SNAPSHOT: LtvSnapshot = {
  totalLTVRevenue: 0,
  uniqueClientsCount: 0,
  ltv: 0,
};

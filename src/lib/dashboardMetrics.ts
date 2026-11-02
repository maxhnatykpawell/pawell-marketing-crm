/**
 * Показники головної панелі — чиста логіка без React (див. dashboardMetrics.test.ts).
 */

/**
 * Зміна середнього чека з відомих змін суми та кількості угод.
 *
 * Раніше біля середнього чека стояла зміна СУМИ угод: картка називалась «Середній
 * чек», а бейдж показував інше число, і при більшій кількості дрібніших угод вони
 * розходились навіть у знаку. Середнє чек = сума ÷ кількість, тож його зміна
 * виводиться точно: (1 + Δсуми) ÷ (1 + Δкількості) − 1. Без жодного з двох
 * відсотків — null: гадати не можна.
 */
export function avgCheckChange(sumChange: number | null | undefined, countChange: number | null | undefined): number | null {
  if (sumChange == null || countChange == null) return null;
  const denom = 1 + countChange / 100;
  if (denom <= 0) return null;
  return Math.round(((1 + sumChange / 100) / denom - 1) * 1000) / 10;
}

/** «+8,4 %» / «−6,8 %» / «0 %»; справжній мінус, бо дефіс у колонці цифр губиться */
export function formatChange(pct: number): string {
  const abs = Math.abs(pct).toLocaleString('uk-UA', { maximumFractionDigits: 1 });
  if (pct === 0) return '0 %';
  return `${pct > 0 ? '+' : '−'}${abs} %`;
}

/** Частка від цілого, % з одним знаком; нульове ціле не ділимо */
export function sharePct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

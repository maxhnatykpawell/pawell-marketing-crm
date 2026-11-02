/**
 * Підписи для індикатора синхронізації — чиста логіка без React (див. syncActivity.test.ts).
 */
import type { KeepInCRMSyncStatus } from '../api';

export function isSyncBusy(s: KeepInCRMSyncStatus | null): boolean {
  return !!s && (s.running || s.ltv.running || s.today);
}

/** «2 хв 05 с» / «45 с» — скільки вже йде прогін */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return min > 0 ? `${min} хв ${String(sec).padStart(2, '0')} с` : `${sec} с`;
}

/** За який період рахується LTV: без меж — «за весь час» */
export function describeRange(range: { from: string | null; to: string | null } | null): string {
  if (!range || (!range.from && !range.to)) return 'за весь час';
  return `${range.from ?? '…'} — ${range.to ?? '…'}`;
}

/** Хто запустив: це пояснює, чому «я нічого не натискав, а воно йде» */
export function describeTrigger(trigger: 'manual' | 'cron' | 'startup' | null): string {
  switch (trigger) {
    case 'manual':  return 'запущено вручну';
    case 'cron':    return 'запущено за розкладом (щодоби о 03:00)';
    case 'startup': return 'запущено під час старту сервера';
    default:        return '';
  }
}

/**
 * Чи треба перераховувати LTV одразу після старту сервера.
 *
 * Раніше розрахунок за весь час запускався на КОЖЕН старт — тобто на кожен деплой чи
 * рестарт хостингу сервер знову тягнув усі угоди з CRM, хоча знімок міг бути
 * готовий кілька годин тому. Тепер спершу дивимось, що вже є.
 *
 * Правило одне: старт потрібен лише тоді, коли пропущено нічний прогін (щодоби о
 * 03:00 за Києвом) або знімка немає взагалі. Усе інше — чекаємо звичайного cron.
 *
 * Чиста логіка без мережі й бази, див. startupSync.test.ts.
 */
import { kyivYmd, kyivDayBounds } from './kyivTime';

/** Година нічного прогону LTV — та сама, що в cron `0 3 * * *` */
export const LTV_NIGHTLY_HOUR = 3;

/** Скільки чекати після збою, перш ніж повторювати на старті: щоб зациклений рестарт не бив у CRM */
export const LTV_RETRY_AFTER_ERROR_MS = 60 * 60 * 1000;

export interface LtvMeta {
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
  lastSyncErrorAt?: string | null;
}

export interface StartupDecision {
  run: boolean;
  /** Людське пояснення — йде в лог і в інтерфейс */
  reason: string;
}

/** Останній момент, коли нічний прогін МАВ спрацювати (03:00 Києва): сьогодні або вчора */
export function lastNightlySlot(now: Date): Date {
  const slotOf = (ymd: string) => new Date(new Date(kyivDayBounds(ymd).gteq).getTime() + LTV_NIGHTLY_HOUR * 3600_000);

  const today = kyivYmd(now);
  const todaySlot = slotOf(today);
  if (now.getTime() >= todaySlot.getTime()) return todaySlot;

  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return slotOf(d.toISOString().slice(0, 10));
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function decideStartupLtv(meta: LtvMeta | null | undefined, now: Date = new Date()): StartupDecision {
  const synced = meta?.lastSyncedAt ? new Date(meta.lastSyncedAt) : null;
  if (!synced || isNaN(synced.getTime())) {
    return { run: true, reason: 'знімка LTV ще немає' };
  }

  // Остання спроба впала: повторюємо, але не одразу — рестарти йдуть підряд, а CRM не безмежна
  if (meta?.lastSyncError) {
    const failedAt = meta.lastSyncErrorAt ? new Date(meta.lastSyncErrorAt) : null;
    const ago = failedAt && !isNaN(failedAt.getTime()) ? now.getTime() - failedAt.getTime() : Infinity;
    return ago >= LTV_RETRY_AFTER_ERROR_MS
      ? { run: true, reason: 'остання синхронізація впала, а знімок застарів' }
      : { run: false, reason: `остання спроба впала менш як годину тому (${fmt(meta.lastSyncErrorAt!)}) — повторимо за розкладом` };
  }

  const slot = lastNightlySlot(now);
  if (synced.getTime() < slot.getTime()) {
    return { run: true, reason: `пропущено нічний прогін ${fmt(slot.toISOString())}, останній розрахунок ${fmt(meta!.lastSyncedAt!)}` };
  }

  return { run: false, reason: `знімок свіжий (${fmt(meta!.lastSyncedAt!)}) — чекаємо нічного прогону о ${String(LTV_NIGHTLY_HOUR).padStart(2, '0')}:00` };
}

import { useEffect, useRef, useState } from 'react';
import { getKeepInCRMSyncStatus, KeepInCRMSyncStatus } from '../api';
import { isSyncBusy } from '../lib/syncActivity';

/**
 * Що зараз синхронізується на сервері.
 *
 * Стан живе на сервері, а не в тій вкладці, що натиснула кнопку: нічний прогін,
 * кнопка в іншій вкладці чи в іншого адміністратора інакше лишались би невидимими,
 * і єдиним слідом була б відмова «вже виконується».
 *
 * Опитуємо рідко, поки нічого не йде, і частіше, поки щось іде. У схованій
 * вкладці не опитуємо взагалі — повертаючись, перший запит робиться одразу.
 */
const IDLE_MS = 15_000;
const BUSY_MS = 2_000;

export function useSyncActivity(enabled = true): {
  status: KeepInCRMSyncStatus | null;
  /** Миттєво перечитати — після запуску синхронізації, не чекаючи наступного тіку */
  refresh: () => Promise<void>;
} {
  const [status, setStatus] = useState<KeepInCRMSyncStatus | null>(null);
  const busyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);

  const refreshRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    aliveRef.current = true;
    if (!enabled) return () => { aliveRef.current = false; };

    const schedule = () => {
      if (!aliveRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(tick, busyRef.current ? BUSY_MS : IDLE_MS);
    };

    const load = async () => {
      try {
        const s = await getKeepInCRMSyncStatus();
        if (!aliveRef.current) return;
        busyRef.current = isSyncBusy(s);
        setStatus(s);
      } catch { /* мережа кліпнула — наступний тік спробує знову */ }
    };

    const tick = async () => {
      if (document.visibilityState === 'visible') await load();
      schedule();
    };

    refreshRef.current = async () => { await load(); schedule(); };

    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    void tick();

    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  return { status, refresh: () => refreshRef.current() };
}

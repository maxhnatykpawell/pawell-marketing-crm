import { useCallback, useEffect, useRef, useState } from 'react';
import { getFunnelSpeed, getFunnelSpeedStatus, triggerFunnelSpeedSync } from '../../api';
import type { FunnelSpeedResponse, FunnelSpeedState } from '../../lib/funnelSpeed';

/**
 * Швидкість воронки з сервера: підсумок за період + хід фонового вивантаження.
 *
 * Живе в AnalyticsView, а не у вкладці: цей самий підсумок потрібен і друкованому
 * звіту, який можна запустити з будь-якої вкладки.
 *
 * Поки вивантаження йде (це до двадцяти хвилин), раз на кілька секунд питаємо
 * лише його стан — важкий підсумок не смикаємо, а перечитуємо один раз, коли воно
 * завершилось.
 */

const POLL_MS = 4000;

const IDLE: FunnelSpeedState = {
  running: false, mode: null, phase: '', done: 0, total: 0, startedAt: null, finishedAt: null, error: null,
};

export function useFunnelSpeed(
  range: { from: string; to: string } | null,
  minAgeDays: number,
) {
  const from = range?.from ?? null;
  const to = range?.to ?? null;

  const [response, setResponse] = useState<FunnelSpeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<FunnelSpeedState>(IDLE);

  // Відповідь на застарілий запит (період встигли змінити) не має затирати свіжішу
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const r = await getFunnelSpeed({ from, to, minAgeDays });
      if (id !== requestId.current) return;
      setResponse(r);
      setSyncState(r.state);
      setError(null);
    } catch (e: any) {
      if (id === requestId.current) setError(e.message || 'Не вдалось завантажити швидкість воронки');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [from, to, minAgeDays]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!syncState.running) return;
    const timer = setInterval(async () => {
      try {
        const st = await getFunnelSpeedStatus();
        setSyncState(st);
        if (!st.running) load();
      } catch { /* мережа смикнулась — наступне опитування все виправить */ }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [syncState.running, load]);

  const startSync = useCallback(async (full: boolean) => {
    await triggerFunnelSpeedSync(full);
    setSyncState({ ...IDLE, running: true, mode: full ? 'full' : null, phase: 'Підготовка' });
  }, []);

  return { response, loading, error, syncState, startSync, reload: load };
}

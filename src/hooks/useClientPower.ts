import { useCallback, useEffect, useRef, useState } from 'react';
import { ClientPowerRecord, getClientPower, saveClientPower } from '../api';
import { ClientPowerInput, isEmptyPowerInput, sanitizePowerInput } from '../lib/clientPower';

/**
 * Ручні оцінки клієнтів (потенціал, контракт, глибина акаунта).
 *
 * Оцінка видна одразу, ще до відповіді сервера; якщо сервер її не прийняв —
 * повертаємо попереднє значення й кажемо про це. Оцінки команда змінює
 * спільно, тому при поверненні на вкладку підтягуємо свіжі.
 */
export function useClientPower() {
  const [items, setItems] = useState<Record<string, ClientPowerRecord>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Поточні оцінки для синхронного читання «що було до правки» — з оновлення стану це було б надто пізно
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const load = useCallback(async () => {
    try {
      const raw = await getClientPower();
      // Читаємо чуже: у базі міг лишитись старий формат чи сміття
      const clean: Record<string, ClientPowerRecord> = {};
      for (const [id, r] of Object.entries(raw)) {
        clean[id] = { ...sanitizePowerInput(r), updatedAt: r.updatedAt, updatedBy: r.updatedBy };
      }
      setItems(clean);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Не вдалось завантажити оцінки клієнтів');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const save = useCallback(async (clientId: string, input: ClientPowerInput): Promise<void> => {
    const next = sanitizePowerInput(input);
    const before = itemsRef.current[clientId];
    setItems(prev => {
      const copy = { ...prev };
      if (isEmptyPowerInput(next)) delete copy[clientId];
      else copy[clientId] = next;
      return copy;
    });
    try {
      const saved = await saveClientPower(clientId, next);
      setItems(prev => {
        const copy = { ...prev };
        if (saved) copy[clientId] = saved; else delete copy[clientId];
        return copy;
      });
    } catch (e) {
      setItems(prev => {
        const copy = { ...prev };
        if (before) copy[clientId] = before; else delete copy[clientId];
        return copy;
      });
      throw e;
    }
  }, []);

  return { items, loading, error, save, reload: load };
}

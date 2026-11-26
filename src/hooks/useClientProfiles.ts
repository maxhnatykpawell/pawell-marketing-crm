import { useCallback, useEffect, useRef, useState } from 'react';
import { getClientProfiles, saveClientProfile } from '../api';
import { ClientProfile, ClientProfileRecord, isEmptyClientProfile, sanitizeClientProfile } from '../lib/clientProfile';

/**
 * Наші дані про клієнтів поверх KeepInCRM (відповідальний).
 *
 * Зміна видна одразу, ще до відповіді сервера; якщо сервер її не прийняв — повертаємо
 * попереднє значення й кидаємо помилку, щоб інтерфейс про це сказав. Призначення команда
 * змінює спільно, тож при поверненні на вкладку підтягуємо свіжі.
 */
export function useClientProfiles() {
  const [items, setItems] = useState<Record<string, ClientProfileRecord>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Поточні значення для синхронного читання «що було до правки» — з оновлення стану це було б надто пізно
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const load = useCallback(async () => {
    try {
      const raw = await getClientProfiles();
      // Читаємо чуже: у базі міг лишитись старий формат чи сміття
      const clean: Record<string, ClientProfileRecord> = {};
      for (const [id, r] of Object.entries(raw)) {
        const p = sanitizeClientProfile(r);
        if (!isEmptyClientProfile(p)) clean[id] = { ...p, updatedAt: r.updatedAt, updatedBy: r.updatedBy };
      }
      setItems(clean);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Не вдалось завантажити відповідальних');
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

  const save = useCallback(async (clientId: string, profile: ClientProfile): Promise<void> => {
    const next = sanitizeClientProfile(profile);
    const before = itemsRef.current[clientId];
    setItems(prev => {
      const copy = { ...prev };
      if (isEmptyClientProfile(next)) delete copy[clientId];
      else copy[clientId] = next;
      return copy;
    });
    try {
      const saved = await saveClientProfile(clientId, next);
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

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, UserSearch } from 'lucide-react';
import { ClientNamesState, getClientNamesStatus, startClientNamesSync } from '../../api';
import { pluralUk } from '../../lib/plural';

/**
 * Підказка адміністратору: у частини клієнтів замість назви показано номер.
 *
 * Причина — KeepInCRM інколи не віддає ім'я клієнта разом з угодою. Кнопка запускає
 * довантаження назв: сервер питає CRM про самих клієнтів, а список після завершення
 * оновлюється сам. Звичайним користувачам блок не показується — вони нічого не можуть із цим зробити.
 */
export default function ClientNamesBanner({
  unnamed, onDone,
}: {
  /** Скільки клієнтів зараз показано з номером замість назви */
  unnamed: number;
  /** Назви довантажено — треба перечитати список клієнтів */
  onDone: () => void;
}) {
  const [state, setState] = useState<ClientNamesState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ resolved: number; unresolved: number } | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const running = !!state?.running;

  // Прогін міг початись раніше (автоматично після синхронізації) — підхоплюємо його
  useEffect(() => {
    getClientNamesStatus().then(setState).catch(() => { /* банер без стану — просто кнопка */ });
  }, []);

  // Поки йде прогін, опитуємо стан; коли закінчився — оновлюємо список клієнтів
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      try {
        const s = await getClientNamesStatus();
        setState(s);
        if (!s.running) {
          setResult({ resolved: s.resolved, unresolved: s.unresolved });
          if (s.error) setError(s.error);
          onDoneRef.current();
        }
      } catch { /* тимчасова помилка мережі: спробуємо на наступному тіку */ }
    }, 2000);
    return () => clearInterval(t);
  }, [running]);

  const start = async () => {
    setStarting(true);
    setError(null);
    setResult(null);
    try {
      await startClientNamesSync();
      setState(await getClientNamesStatus());
    } catch (e: any) {
      setError(e.message || 'Не вдалось запустити');
    } finally {
      setStarting(false);
    }
  };

  if (unnamed === 0 && !result && !running) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3">
      <UserSearch className="w-5 h-5 text-amber-600 shrink-0" />
      <div className="flex-1 min-w-[220px] text-sm text-amber-900">
        {running ? (
          <>
            Підтягуємо назви з KeepInCRM{state?.phase ? ` · ${state.phase.toLowerCase()}` : ''}
            {state && state.total > 0 ? ` (${state.done} з ${state.total})` : ''}…
          </>
        ) : result && unnamed === 0 ? (
          <>Готово: назви клієнтів підтягнуто.</>
        ) : (
          <>
            У <b>{unnamed.toLocaleString('uk-UA')}</b> {pluralUk(unnamed, 'клієнта', 'клієнтів', 'клієнтів')} замість назви показано номер:
            KeepInCRM не віддав назву разом з угодою.
          </>
        )}
        {result && result.unresolved > 0 && !running && (
          <span className="block text-xs text-amber-800 mt-0.5">
            Знайдено {result.resolved}, без назви лишилось {result.unresolved}: CRM не повернула для них імені
            (структуру відповіді записано в лог сервера).
          </span>
        )}
        {error && <span className="block text-xs text-red-600 mt-0.5">{error}</span>}
      </div>

      {unnamed > 0 && (
        <button
          onClick={start}
          disabled={running || starting}
          className="inline-flex items-center gap-2 h-10 sm:h-9 px-4 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition disabled:opacity-60"
        >
          {(running || starting) && <Loader2 className="w-4 h-4 animate-spin" />}
          {running ? 'Триває…' : 'Підтягнути назви'}
        </button>
      )}
    </div>
  );
}

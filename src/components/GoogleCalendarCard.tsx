import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Check, Loader2, RefreshCw, Video } from 'lucide-react';
import { useAppContext } from '../App';
import {
  disconnectGoogle, getGoogleConnectUrl, getGoogleStatus, GoogleStatus, syncGoogleNow, updateGooglePrefs,
} from '../api';
import NewMeetingDialog from './NewMeetingDialog';

const REASONS: Record<string, string> = {
  state: 'Сесія підключення застаріла. Спробуйте ще раз.',
  scope: 'Не надано доступ до календаря. Під час підключення залиште галочку доступу до подій.',
  norefresh: 'Google не видав довготривалий доступ. Спробуйте ще раз.',
  exchange: 'Google не прийняв підключення. Спробуйте ще раз або зверніться до адміністратора.',
  code: 'Google не повернув код підключення.',
  server: 'Помилка сервера під час підключення.',
};

function ago(iso: string | null): string {
  if (!iso) return 'ще не синхронізовано';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'щойно';
  if (min < 60) return `${min} хв тому`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} год тому`;
  return new Date(iso).toLocaleDateString('uk-UA');
}

/**
 * Підключення Google Календаря: міти з Meet і дзеркало задач та подій.
 *
 * Стоїть у кабінеті на всю ширину й видна на телефоні — міт найчастіше
 * створюють саме звідти.
 */
export default function GoogleCalendarCard() {
  const { currentUser, confirmAction } = useAppContext();
  const isAdmin = currentUser?.role === 'admin';

  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [meetingOpen, setMeetingOpen] = useState(false);

  const load = useCallback(async () => {
    try { setStatus(await getGoogleStatus()); setError(null); }
    catch (e: any) { setError(e.message || 'Не вдалось отримати стан Google'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Результат підключення приходить у адресі (?google=connected / denied / error&reason=…)
  const handledParam = useRef(false);
  useEffect(() => {
    if (handledParam.current) return;
    handledParam.current = true;
    const p = new URLSearchParams(window.location.search);
    const g = p.get('google');
    if (!g) return;
    if (g === 'connected') setNotice('Google Календар підключено. Ваші задачі та події переносяться в календар.');
    else if (g === 'denied') setError('Підключення скасовано.');
    else setError(REASONS[p.get('reason') || ''] || 'Не вдалось підключити Google.');
    p.delete('google');
    p.delete('reason');
    const qs = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
    void load();
  }, [load]);

  // Поки йде перенесення, оновлюємо стан, щоб людина бачила, коли воно закінчилось
  useEffect(() => {
    if (!status?.syncing) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [status?.syncing, load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null); setNotice(null);
    try { await fn(); } catch (e: any) { setError(e.message || 'Не вдалось виконати'); } finally { setBusy(null); }
  };

  const connect = () => run('connect', async () => { window.location.assign(await getGoogleConnectUrl()); });

  const toggle = (key: 'syncTasks' | 'syncEvents', value: boolean) => run(key, async () => {
    await updateGooglePrefs({ [key]: value });
    setStatus(s => (s ? { ...s, [key]: value, syncing: value } : s));
    if (value) setTimeout(load, 1200);
  });

  const syncNow = () => run('sync', async () => {
    await syncGoogleNow();
    setStatus(s => (s ? { ...s, syncing: true } : s));
    setTimeout(load, 1200);
  });

  const disconnect = () => confirmAction(
    'Відключити Google Календар? Копії задач і подій буде прибрано з вашого календаря. Створені міти залишаться.',
    () => run('disconnect', async () => { await disconnectGoogle(); await load(); }),
  );

  if (!status) {
    return error ? (
      <p className="text-xs text-red-500 mb-4">{error}</p>
    ) : null;
  }

  // ── Сервер без ключів Google ────────────────────────────────────────────────
  if (!status.configured) {
    // Звичайним учасникам цей стан нічого не дає, а адміністратору підказує, що робити
    if (!isAdmin) return null;
    return (
      <section className="mb-6 bg-white rounded-2xl border border-dashed border-gray-300 p-5">
        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2 mb-1">
          <CalendarDays className="w-4 h-4 text-blue-600" /> Google Календар не налаштовано
        </h3>
        <p className="text-sm text-gray-500">
          Додайте на сервері змінні <code className="text-xs bg-gray-100 px-1 rounded">GOOGLE_CLIENT_ID</code> і{' '}
          <code className="text-xs bg-gray-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code>, а в Google Cloud внесіть адресу:{' '}
          <code className="text-xs bg-gray-100 px-1 rounded break-all">{status.redirectUri}</code>
        </p>
      </section>
    );
  }

  const connected = status.connected && !status.needsReconnect;

  return (
    <section aria-labelledby="gcal-title" className="mb-6 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 id="gcal-title" className="font-bold text-gray-800 text-sm flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-blue-600" /> Google Календар
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {connected ? `Підключено: ${status.email || 'акаунт Google'}` : 'Міти з Meet і ваші задачі прямо у справжньому календарі'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {connected && (
            <button
              onClick={() => setMeetingOpen(true)}
              className="h-11 sm:h-9 px-4 inline-flex items-center gap-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              <Video className="w-4 h-4" /> Створити міт
            </button>
          )}
          {!connected && (
            <button
              onClick={connect}
              disabled={busy === 'connect'}
              className="h-11 sm:h-9 px-4 inline-flex items-center gap-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-60"
            >
              {busy === 'connect' && <Loader2 className="w-4 h-4 animate-spin" />}
              {status.needsReconnect ? 'Підключити знову' : 'Підключити Google'}
            </button>
          )}
        </div>
      </div>

      {status.needsReconnect && (
        <p className="mx-5 mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Доступ до календаря більше не діє{status.lastError ? ` (${status.lastError})` : ''}. Підключіть Google знову — задачі не синхронізуються.
        </p>
      )}

      {connected && (
        <div className="px-5 pb-4 border-t border-gray-100 pt-3 space-y-1">
          <Toggle
            label="Мої задачі з датою"
            hint="Задача, де ви виконавець, зʼявляється подією на весь день. Виконана — зникає."
            on={status.syncTasks}
            busy={busy === 'syncTasks'}
            onChange={v => toggle('syncTasks', v)}
          />
          <Toggle
            label="Події (виставки тощо)"
            hint="Події, на які вас призначено."
            on={status.syncEvents}
            busy={busy === 'syncEvents'}
            onChange={v => toggle('syncEvents', v)}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              {status.syncing
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Переносимо в календар…</>
                : <>Остання синхронізація: {ago(status.lastSyncAt)}</>}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={syncNow}
                disabled={status.syncing || busy === 'sync'}
                className="h-10 sm:h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Синхронізувати
              </button>
              <button
                onClick={disconnect}
                className="h-10 sm:h-8 px-3 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg"
              >
                Відключити
              </button>
            </div>
          </div>
          {status.lastError && !status.syncing && (
            <p className="text-xs text-amber-700">Частину не вдалось перенести: {status.lastError}</p>
          )}
        </div>
      )}

      {notice && <p className="px-5 pb-4 text-sm text-green-700 flex items-center gap-1.5"><Check className="w-4 h-4" /> {notice}</p>}
      {error && <p className="px-5 pb-4 text-sm text-red-600">{error}</p>}

      {meetingOpen && <NewMeetingDialog onClose={() => setMeetingOpen(false)} />}
    </section>
  );
}

function Toggle({ label, hint, on, busy, onChange }: {
  label: string; hint: string; on: boolean; busy: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 min-h-[48px] py-1.5 cursor-pointer">
      <input
        type="checkbox"
        checked={on}
        disabled={busy}
        onChange={e => onChange(e.target.checked)}
        className="mt-1 w-4 h-4"
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-gray-800">{label}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
    </label>
  );
}

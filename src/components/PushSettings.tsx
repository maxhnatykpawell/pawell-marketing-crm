import React, { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Check, Loader2, X } from 'lucide-react';
import { sendTestPush } from '../api';
import { disablePush, enablePush, getPushState, type PushState } from '../lib/pushClient';

/** Пояснення для станів, у яких увімкнути не можна: що саме не так і що робити */
const BLOCKED_TEXT: Partial<Record<PushState, string>> = {
  unsupported: 'Цей браузер не вміє показувати сповіщення. Спробуйте Chrome, Edge, Firefox або Safari на iPhone.',
  'ios-install': 'На iPhone сповіщення працюють у встановленому застосунку. Натисніть «Поділитися» → «На початковий екран», а потім відкрийте PAWELL з головного екрана.',
  'server-off': 'Сервер ще не налаштований для сповіщень. Напишіть адміністратору.',
  denied: 'Сповіщення заборонені в налаштуваннях браузера для цього сайту. Дозвольте їх там (значок замка біля адреси) і поверніться сюди.',
};

function usePushState() {
  const [state, setState] = useState<PushState | null>(null);
  const refresh = useCallback(() => { getPushState().then(setState).catch(() => setState('unsupported')); }, []);
  useEffect(refresh, [refresh]);
  return { state, refresh };
}

/** Блок налаштувань: увімкнути, вимкнути й перевірити сповіщення на цьому пристрої */
export default function PushSettings() {
  const { state, refresh } = usePushState();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const toggle = async () => {
    setBusy(true); setMessage(null);
    try {
      if (state === 'on') {
        await disablePush();
      } else {
        await enablePush();
        setMessage({ kind: 'ok', text: 'Готово: сповіщення увімкнено на цьому пристрої.' });
      }
    } catch (e: any) {
      setMessage({ kind: 'error', text: e.message || 'Не вдалося змінити налаштування' });
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const test = async () => {
    setBusy(true); setMessage(null);
    try {
      const n = await sendTestPush();
      setMessage(n > 0
        ? { kind: 'ok', text: 'Тестове сповіщення надіслано. Якщо застосунок відкритий, воно не показується, згорніть його й повторіть.' }
        : { kind: 'error', text: 'Сповіщення нікуди не дійшло. Вимкніть і ввімкніть його знову.' });
    } catch (e: any) {
      setMessage({ kind: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const blocked = state ? BLOCKED_TEXT[state] : undefined;
  const on = state === 'on';

  return (
    <div className="px-5 pt-4 pb-4 border-b border-gray-100">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            {on ? <Bell className="w-4 h-4 text-blue-600" /> : <BellOff className="w-4 h-4 text-gray-500" />}
            Сповіщення на цьому пристрої
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {blocked ?? 'Нові повідомлення в чаті, згадки й призначені задачі показуватимуться, навіть коли застосунок закрито.'}
          </p>
        </div>

        {state && !blocked && (
          <button
            role="switch"
            aria-checked={on}
            aria-label="Сповіщення на цьому пристрої"
            onClick={toggle}
            disabled={busy}
            className={`relative shrink-0 mt-0.5 w-12 h-7 rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center transition-transform ${on ? 'translate-x-5' : ''}`}>
              {busy && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
            </span>
          </button>
        )}
      </div>

      {on && (
        <button
          onClick={test}
          disabled={busy}
          className="mt-3 min-h-[44px] sm:min-h-0 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-100 disabled:opacity-60"
        >
          Надіслати тестове сповіщення
        </button>
      )}

      {message && (
        <p role="status" className={`mt-3 text-xs rounded-lg px-3 py-2 ${message.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

const DISMISS_KEY = 'push_prompt_dismissed';

/**
 * Ненав'язлива підказка зверху мобільного екрана: показується, лише якщо
 * сповіщення можна ввімкнути й людина ще не вирішувала. Одне натискання на
 * «Увімкнути» запускає системний запит дозволу.
 */
export function PushPrompt() {
  const { state, refresh } = usePushState();
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (hidden || state !== 'off') return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* без сховища підказка просто повернеться */ }
    setHidden(true);
  };

  const enable = async () => {
    setBusy(true); setError('');
    try { await enablePush(); } catch (e: any) { setError(e.message || 'Не вдалося'); }
    finally { setBusy(false); refresh(); }
  };

  return (
    <div className="shrink-0 bg-blue-50 border-b border-blue-100 pl-4 pr-1 py-2 flex items-center gap-2" role="region" aria-label="Сповіщення">
      <Bell className="w-5 h-5 text-blue-600 shrink-0" />
      <p className="flex-1 min-w-0 text-sm text-blue-900 leading-snug">
        {error || 'Вмикайте сповіщення, щоб не пропустити повідомлення в чаті.'}
      </p>
      <button
        onClick={enable}
        disabled={busy}
        className="shrink-0 min-h-[44px] px-3 text-sm font-semibold text-blue-700 disabled:opacity-60"
      >
        {busy ? '…' : 'Увімкнути'}
      </button>
      <button onClick={dismiss} aria-label="Не питати" className="shrink-0 w-11 h-11 flex items-center justify-center text-blue-400">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

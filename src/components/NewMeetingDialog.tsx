import React, { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Video } from 'lucide-react';
import { useAppContext } from '../App';
import { createGoogleMeeting, getGoogleConnectUrl, GoogleApiError, GoogleMeetingResult } from '../api';
import { isEmail } from '../lib/email';
import Sheet from './chat/Sheet';

const DURATIONS = [15, 30, 45, 60, 90, 120];

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Найближчі «круглі» пів години: відкрив діалог о 14:07 — запропонували 14:30 */
function defaultStart(): { date: string; time: string } {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return { date: localDay(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/**
 * Створення міту в Google Calendar з Google Meet.
 *
 * Міт створюється в календарі автора, а запрошення розсилає сам Google: учасники
 * отримують лист із посиланням і можуть прийняти чи відхилити його звичним чином.
 */
export default function NewMeetingDialog({ onClose }: { onClose: () => void }) {
  const { state, currentUser } = useAppContext();
  const me = currentUser?.userId;
  const colleagues = useMemo(() => (state.users || []).filter(u => u.id !== me), [state.users, me]);

  const initial = useMemo(defaultStart, []);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState(30);
  const [picked, setPicked] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [description, setDescription] = useState('');
  const [withMeet, setWithMeet] = useState(true);
  const [q, setQ] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [result, setResult] = useState<GoogleMeetingResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Адреси через кому, пробіл чи новий рядок
  const extraEmails = useMemo(
    () => [...new Set(extra.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))],
    [extra],
  );
  const badExtra = extraEmails.filter(e => !isEmail(e));

  const startDate = new Date(`${date}T${time}`);
  const validTime = !isNaN(startDate.getTime());
  const canSubmit = title.trim().length > 0 && validTime && badExtra.length === 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setNeedsConnect(false);
    try {
      const end = new Date(startDate.getTime() + duration * 60_000);
      setResult(await createGoogleMeeting({
        title: title.trim(),
        description: description.trim() || undefined,
        start: startDate.toISOString(),
        end: end.toISOString(),
        attendeeUserIds: picked,
        extraEmails,
        withMeet,
      }));
    } catch (e: any) {
      if (e instanceof GoogleApiError && e.code === 'not_connected') setNeedsConnect(true);
      setError(e.message || 'Не вдалось створити міт');
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    try { window.location.assign(await getGoogleConnectUrl()); }
    catch (e: any) { setError(e.message); }
  };

  const copy = async () => {
    if (!result?.meetLink) return;
    try {
      await navigator.clipboard.writeText(result.meetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* без дозволу буфер недоступний — посилання все одно видно на екрані */ }
  };

  // ── Результат ───────────────────────────────────────────────────────────────
  if (result) {
    return (
      <Sheet title="Міт створено" onClose={onClose} size="sm">
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            {result.invited > 0
              ? `Запрошення надіслано на пошту: ${result.invited}.`
              : 'Міт додано у ваш календар. Нікого не запрошено.'}
          </p>

          {result.meetLink && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3">
              <p className="text-xs font-semibold text-green-800 mb-1 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5" /> Посилання на Google Meet
              </p>
              <p className="text-sm text-green-900 break-all">{result.meetLink}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={copy} className="flex-1 h-11 sm:h-9 inline-flex items-center justify-center gap-1.5 text-sm font-medium bg-white border border-green-300 text-green-800 rounded-lg active:bg-green-100">
                  {copied ? <><Check className="w-4 h-4" /> Скопійовано</> : <><Copy className="w-4 h-4" /> Копіювати</>}
                </button>
                <a href={result.meetLink} target="_blank" rel="noopener noreferrer" className="flex-1 h-11 sm:h-9 inline-flex items-center justify-center gap-1.5 text-sm font-medium bg-green-600 text-white rounded-lg active:bg-green-700">
                  <ExternalLink className="w-4 h-4" /> Відкрити
                </a>
              </div>
            </div>
          )}

          {withMeet && !result.meetLink && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Google ще не видав посилання на Meet. Воно зʼявиться в події календаря за хвилину.
            </p>
          )}

          {result.skipped.length > 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Не запрошено, бо в профілі немає пошти: {result.skipped.join(', ')}.
            </p>
          )}

          {result.htmlLink && (
            <a href={result.htmlLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-600 font-medium">
              <ExternalLink className="w-4 h-4" /> Відкрити в Google Календарі
            </a>
          )}

          <button onClick={onClose} className="w-full h-11 sm:h-10 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-lg">
            Готово
          </button>
        </div>
      </Sheet>
    );
  }

  // ── Форма ───────────────────────────────────────────────────────────────────
  const shown = colleagues.filter(u => u.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Sheet
      title="Новий міт"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          {error && <span className="flex-1 min-w-0 text-xs text-red-600">{error}</span>}
          {!error && <span className="flex-1" />}
          {needsConnect && (
            <button onClick={connect} className="h-11 sm:h-9 px-4 text-sm font-medium bg-white border border-gray-300 rounded-lg">
              Підключити Google
            </button>
          )}
          <button onClick={onClose} className="h-11 sm:h-9 px-4 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">Скасувати</button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="h-11 sm:h-9 px-5 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Створити
          </button>
        </div>
      }
    >
      <div className="px-5 py-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Назва</label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={300}
            placeholder="Наприклад: Планерка по рекламі"
            className="w-full px-3 py-2.5 sm:py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Дата</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2.5 sm:py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Початок</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full px-3 py-2.5 sm:py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Тривалість</label>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={`h-10 sm:h-8 px-3 text-sm rounded-lg border transition ${duration === d ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-700'}`}
              >
                {d < 60 ? `${d} хв` : `${Math.floor(d / 60)} год${d % 60 ? ` ${d % 60} хв` : ''}`}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
          <input type="checkbox" checked={withMeet} onChange={e => setWithMeet(e.target.checked)} className="w-4 h-4" />
          <span className="text-sm text-gray-800 flex items-center gap-1.5"><Video className="w-4 h-4 text-green-600" /> Додати відеозустріч Google Meet</span>
        </label>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-gray-700">Учасники з команди{picked.length > 0 ? ` · ${picked.length}` : ''}</label>
          </div>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Пошук колеги…"
            className="w-full mb-2 px-3 py-2.5 sm:py-2 text-sm bg-gray-100 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
          <ul className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-52 overflow-y-auto">
            {shown.length === 0 && <li className="px-3 py-4 text-sm text-gray-400 text-center">Нікого не знайдено</li>}
            {shown.map(u => {
              const hasMail = !!u.email && isEmail(u.email);
              const on = picked.includes(u.id);
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={!hasMail}
                    onClick={() => setPicked(prev => (on ? prev.filter(x => x !== u.id) : [...prev, u.id]))}
                    className="w-full flex items-center gap-3 px-3 min-h-[52px] sm:min-h-[44px] text-left enabled:active:bg-gray-50 enabled:hover:bg-gray-50 disabled:opacity-50"
                  >
                    <img src={u.avatar} alt="" className="w-7 h-7 rounded-lg object-cover" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-800 truncate">{u.name}</span>
                      <span className="block text-[11px] text-gray-400 truncate">{hasMail ? u.email : 'немає пошти в профілі'}</span>
                    </span>
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                      {on && <Check className="w-3.5 h-3.5 text-white" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Інші учасники (пошта)</label>
          <input
            value={extra}
            onChange={e => setExtra(e.target.value)}
            placeholder="client@company.com, partner@mail.com"
            inputMode="email"
            className={`w-full px-3 py-2.5 sm:py-2 text-sm border rounded-lg outline-none focus:ring-2 ${badExtra.length ? 'border-red-300 focus:ring-red-100' : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100'}`}
          />
          {badExtra.length > 0 && <p className="text-xs text-red-500 mt-1">Некоректна адреса: {badExtra.join(', ')}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Опис</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Порядок денний, що підготувати…"
            className="w-full px-3 py-2.5 sm:py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
          />
        </div>
      </div>
    </Sheet>
  );
}

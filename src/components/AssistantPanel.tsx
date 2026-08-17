import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Loader2, Trash2, Check, AlertTriangle } from 'lucide-react';
import {
  askAssistant, getAssistantHistory, clearAssistantHistory,
  AssistantMessage, AssistantAction,
} from '../api';

/**
 * Асистент команди.
 *
 * Дії він не виконує — лише пропонує. Сервер розв'язує імена в ідентифікатори
 * й повертає опис людською мовою, а застосовує зміну вже застосунок тими самими
 * методами, що й людина руками. Тому права, оптимістичне оновлення й
 * синхронізація працюють однаково, і жодного окремого шляху запису не існує.
 */
export default function AssistantPanel({
  onApplyAction,
}: {
  /** Застосувати підтверджену дію. Повертає текст для стрічки діалогу */
  onApplyAction: (action: AssistantAction) => string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Пропозиція, що чекає рішення. Друга не з'явиться, доки не закрито першу */
  const [pending, setPending] = useState<AssistantAction | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    getAssistantHistory().then(setMessages).catch(() => {});
    inputRef.current?.focus();
  }, [open]);

  // Стрічка завжди показує останнє — інакше після відповіді треба гортати вниз
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, pending]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const push = (role: 'user' | 'model', text: string) =>
    setMessages(m => [...m, { role, text }]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setError(null);
    setPending(null);
    push('user', text);
    setBusy(true);
    try {
      const res = await askAssistant(text);
      push('model', res.reply);
      if (res.action) setPending(res.action);
    } catch (e: any) {
      setError(e.message || 'Не вдалось звернутись до асистента');
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!pending) return;
    const result = onApplyAction(pending);
    setPending(null);
    push('model', result);
  };

  const reset = async () => {
    await clearAssistantHistory().catch(() => {});
    setMessages([]);
    setPending(null);
    setError(null);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Асистент команди"
        className="fixed bottom-5 right-5 z-[90] w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center hover:bg-blue-700 hover:scale-105 transition"
      >
        <Sparkles className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-[90] w-[min(420px,calc(100vw-2.5rem))] h-[min(600px,calc(100vh-2.5rem))] flex flex-col bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-800 leading-tight">Асистент</p>
          <p className="text-[11px] text-gray-400 leading-tight">Бачить лише те, що доступне вам</p>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} title="Очистити діалог" className="p-1.5 text-gray-400 hover:text-red-500 transition">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <button onClick={() => setOpen(false)} title="Згорнути (Esc)" className="p-1.5 text-gray-400 hover:text-gray-700 transition">
          <X className="w-4 h-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
        {messages.length === 0 && !busy && (
          <div className="text-sm text-gray-400 space-y-2 pt-4">
            <p className="font-medium text-gray-500">Запитайте що завгодно про роботу команди:</p>
            <ul className="space-y-1 text-[13px]">
              <li>· Що в мене горить?</li>
              <li>· Скільки прострочених завдань на дошці?</li>
              <li>· Які ключові цифри за сьогодні?</li>
              <li>· Створи завдання «Оновити лендінг» на Олену до п'ятниці</li>
            </ul>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Думає…
          </div>
        )}

        {/* Пропозиція дії. Кнопка — єдиний спосіб щось змінити: сам асистент
            записувати не вміє, тож поки її не натиснуто, нічого не сталось. */}
        {pending && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-1">
              Потрібне підтвердження
            </p>
            <p className="text-sm text-gray-800 mb-2.5">{pending.summary}</p>
            <div className="flex gap-2">
              <button
                onClick={confirm}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition"
              >
                <Check className="w-3.5 h-3.5" />
                Підтвердити
              </button>
              <button
                onClick={() => setPending(null)}
                className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition"
              >
                Скасувати
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-gray-100 p-2.5 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            // Enter надсилає, Shift+Enter переносить рядок — як у всіх месенджерах
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          rows={1}
          placeholder="Запитайте про завдання, цифри, команду…"
          className="flex-1 resize-none max-h-32 px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-blue-400"
        />
        <button
          onClick={send}
          disabled={busy || !draft.trim()}
          className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

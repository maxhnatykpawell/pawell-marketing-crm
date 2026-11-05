import React, { useState, useRef, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Sparkles, X, Send, Loader2, Trash2, Check, AlertTriangle, FileText, ListPlus,
  Pencil, MessageSquarePlus, Target, ClipboardList,
} from 'lucide-react';
import { useAppContext } from '../App';
import {
  askProjectAssistant, getProjectAssistantHistory, clearProjectAssistantHistory,
  AssistantMessage, ProjectAssistantAction,
} from '../api';
import type { Comment } from '../types';

type Decision = 'applied' | 'dismissed' | 'failed';

const TOOL_META: Record<ProjectAssistantAction['tool'], { icon: React.ElementType; label: string }> = {
  propose_create_card: { icon: ListPlus, label: 'Нова задача' },
  propose_update_card: { icon: Pencil, label: 'Зміна задачі' },
  propose_add_comment: { icon: MessageSquarePlus, label: 'Коментар' },
  propose_update_project: { icon: Target, label: 'Мета / опис' },
};

const QUICK_PROMPTS = [
  'Що зараз із проєктом? Де ризики?',
  'Розбий мету проєкту на задачі',
  'Підсумуй обговорення в коментарях',
  'Що сказано у файлах проєкту?',
];

/**
 * Асистент одного проєкту.
 *
 * Знає лише цей проєкт: мету, опис, картки з коментарями й файли. Нічого не
 * змінює сам — повертає пропозиції, які людина затверджує кожну окремо.
 * Затверджена пропозиція застосовується тими самими методами застосунку, що й
 * ручна правка (addCard, updateCard, updateProject), тож права, синхронізація
 * й сповіщення працюють однаково, а окремого шляху запису не існує.
 */
export default function ProjectAssistant({ projectId }: { projectId: string }) {
  const {
    state, currentUser, hasEditRights, activeProjectId,
    addCard, updateCard, updateProject,
  } = useAppContext();

  const project = (state.projects || []).find(p => p.id === projectId);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<ProjectAssistantAction[]>([]);
  const [decisions, setDecisions] = useState<Record<string, { status: Decision; note?: string }>>({});
  const [sources, setSources] = useState<{ type: 'file' | 'card'; name: string }[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Інший проєкт — інша розмова: нічого з попереднього не має лишитись на екрані
  useEffect(() => {
    setMessages([]); setActions([]); setDecisions({}); setSources([]); setError(null);
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    getProjectAssistantHistory(projectId).then(setMessages).catch(() => {});
    inputRef.current?.focus();
  }, [open, projectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, actions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const pending = useMemo(() => actions.filter(a => !decisions[a.id]), [actions, decisions]);

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || busy) return;
    setDraft('');
    setError(null);
    // Нові пропозиції замінюють непідтверджені старі: вони могли вже застаріти
    setActions([]); setDecisions({}); setSources([]);
    setMessages(m => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await askProjectAssistant(projectId, text);
      setMessages(m => [...m, { role: 'model', text: res.reply }]);
      setActions(res.actions || []);
      setSources(res.sources || []);
    } catch (e: any) {
      setError(e.message || 'Не вдалось звернутись до асистента');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Застосувати одну пропозицію. Стан перевіряємо ще раз: поки людина читала,
   * картку могли видалити чи перенести, і застосувати «вчорашнє» нишком не можна.
   * `batch` несе лічильники, бо кілька дій поспіль бачать однаковий застарілий стан.
   */
  const applyOne = (
    action: ProjectAssistantAction,
    batch: { orders: Record<string, number>; comments: Record<string, Comment[]> },
  ): { status: Decision; note?: string } => {
    if (!hasEditRights) return { status: 'failed', note: 'Немає прав на редагування' };
    if (activeProjectId !== projectId) return { status: 'failed', note: 'Відкрито інший проєкт' };

    const p = action.payload;

    switch (action.tool) {
      case 'propose_create_card': {
        if (!state.lists.some(l => l.id === p.listId)) return { status: 'failed', note: 'Колонку вже видалено' };
        const inList = state.cards.filter(c => c.listId === p.listId);
        const base = inList.length ? Math.min(...inList.map(c => c.order)) : 0;
        const shift = batch.orders[p.listId] ?? 0;
        batch.orders[p.listId] = shift + 1;
        addCard(p.listId, p.title, {
          description: p.description || '',
          assigneeId: p.assigneeId ?? null,
          startDate: p.startDate ?? null,
          deadline: p.deadline ?? null,
          phaseId: p.phaseId ?? null,
          order: base - 1 - shift,
        });
        return { status: 'applied' };
      }

      case 'propose_update_card': {
        const card = state.cards.find(c => c.id === p.cardId);
        if (!card) return { status: 'failed', note: 'Картку вже видалено' };
        updateCard(p.cardId, p.updates);
        return { status: 'applied' };
      }

      case 'propose_add_comment': {
        const card = state.cards.find(c => c.id === p.cardId);
        if (!card) return { status: 'failed', note: 'Картку вже видалено' };
        const comment: Comment = {
          id: uuidv4(),
          authorId: currentUser?.userId || '',
          text: p.text,
          createdAt: new Date().toISOString(),
        };
        const added = batch.comments[p.cardId] ?? [];
        batch.comments[p.cardId] = [...added, comment];
        updateCard(p.cardId, { comments: [...(card.comments || []), ...batch.comments[p.cardId]] });
        return { status: 'applied' };
      }

      case 'propose_update_project': {
        const updates: Record<string, string> = {};
        if (typeof p.goal === 'string') updates.goal = p.goal;
        if (typeof p.description === 'string') updates.description = p.description;
        updateProject(projectId, updates);
        return { status: 'applied' };
      }

      default:
        return { status: 'failed', note: 'Невідома дія' };
    }
  };

  const decide = (list: ProjectAssistantAction[]) => {
    const batch = { orders: {} as Record<string, number>, comments: {} as Record<string, Comment[]> };
    const next: Record<string, { status: Decision; note?: string }> = {};
    for (const a of list) next[a.id] = applyOne(a, batch);
    setDecisions(d => ({ ...d, ...next }));
  };

  const dismiss = (id: string) => setDecisions(d => ({ ...d, [id]: { status: 'dismissed' } }));
  const dismissAll = () => setDecisions(d => ({
    ...d, ...Object.fromEntries(pending.map(a => [a.id, { status: 'dismissed' as Decision }])),
  }));

  const reset = async () => {
    await clearProjectAssistantHistory(projectId).catch(() => {});
    setMessages([]); setActions([]); setDecisions({}); setSources([]); setError(null);
  };

  if (!project) return null;

  const launcher = (
    <button
      onClick={() => setOpen(true)}
      title="Асистент проєкту: знає картки, коментарі й файли цього проєкту"
      className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100"
    >
      <Sparkles className="w-4 h-4" />
      Асистент проєкту
    </button>
  );

  if (!open) return launcher;

  return (
    <>
      {launcher}
      <aside
        className="fixed top-0 right-0 bottom-0 z-[95] w-[min(440px,100vw)] flex flex-col bg-white border-l border-gray-200 shadow-2xl"
        aria-label="Асистент проєкту"
      >
        <header className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: project.color }}>
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-800 leading-tight truncate">{project.title}</p>
            <p className="text-[11px] text-gray-400 leading-tight">
              Знає лише цей проєкт: картки, коментарі, файли
            </p>
          </div>
          {messages.length > 0 && (
            <button onClick={reset} title="Очистити діалог" className="p-1.5 text-gray-400 hover:text-red-500 transition">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setOpen(false)} title="Закрити (Esc)" className="p-1.5 text-gray-400 hover:text-gray-700 transition">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
          {messages.length === 0 && !busy && (
            <div className="pt-3 space-y-3">
              <p className="text-sm font-medium text-gray-500">
                Питайте про цей проєкт або доручіть підготувати зміни — застосуєте їх лише ви.
              </p>
              <div className="flex flex-col gap-1.5">
                {QUICK_PROMPTS.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="text-left text-[13px] px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:border-violet-300 hover:bg-violet-50/50 transition"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                  m.role === 'user' ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Читає проєкт…
            </div>
          )}

          {/* Що асистент відкривав — щоб відповідь можна було перевірити за першоджерелом */}
          {sources.length > 0 && !busy && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
              <span>Джерела:</span>
              {sources.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {s.type === 'file' ? <FileText className="w-3 h-3" /> : <ClipboardList className="w-3 h-3" />}
                  <span className="max-w-[150px] truncate">{s.name}</span>
                </span>
              ))}
            </div>
          )}

          {actions.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex-1">
                  Пропозиції · потрібне підтвердження
                </p>
                {pending.length > 1 && (
                  <>
                    <button
                      onClick={() => decide(pending)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition"
                    >
                      <Check className="w-3 h-3" /> Усі ({pending.length})
                    </button>
                    <button onClick={dismissAll} className="text-[11px] font-medium text-gray-500 hover:text-gray-800 transition">
                      Відхилити всі
                    </button>
                  </>
                )}
              </div>

              {actions.map(a => {
                const meta = TOOL_META[a.tool];
                const Icon = meta?.icon ?? Pencil;
                const decision = decisions[a.id];
                return (
                  <div
                    key={a.id}
                    className={`rounded-lg border bg-white px-3 py-2 ${
                      decision?.status === 'applied' ? 'border-emerald-200' :
                      decision?.status === 'failed' ? 'border-red-200' : 'border-gray-200'
                    } ${decision?.status === 'dismissed' ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
                      <Icon className="w-3 h-3" /> {meta?.label}
                    </div>
                    <p className="text-[13px] text-gray-800 leading-snug">{a.summary}</p>

                    {!decision && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => decide([a])}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition"
                        >
                          <Check className="w-3 h-3" /> Підтвердити
                        </button>
                        <button onClick={() => dismiss(a.id)} className="px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-800 transition">
                          Відхилити
                        </button>
                      </div>
                    )}
                    {decision?.status === 'applied' && <p className="mt-1.5 text-xs font-medium text-emerald-600">✓ Застосовано</p>}
                    {decision?.status === 'dismissed' && <p className="mt-1.5 text-xs text-gray-400">Відхилено</p>}
                    {decision?.status === 'failed' && <p className="mt-1.5 text-xs font-medium text-red-600">Не застосовано: {decision.note}</p>}
                  </div>
                );
              })}
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
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            rows={1}
            placeholder="Запитайте про проєкт або доручіть задачі…"
            className="flex-1 resize-none max-h-32 px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-violet-400"
          />
          <button
            onClick={() => send()}
            disabled={busy || !draft.trim()}
            className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
}

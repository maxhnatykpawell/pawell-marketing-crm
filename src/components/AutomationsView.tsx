import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../App';
import {
  Bot, Plus, Check, X, Trash2, Edit3, Play, ToggleLeft, ToggleRight,
  Clock, CalendarClock, ListChecks, AlertCircle, Loader2, ArrowUpRight,
} from 'lucide-react';
import {
  getAutomations, createAutomation, updateAutomation, deleteAutomation, runAutomation,
} from '../api';
import { TaskAutomation, TaskTemplate, RecurrenceSchedule, RecurrenceMode } from '../types';
import {
  describeSchedule, describeNextRun, nextRunAt, validateSchedule, WEEKDAY_SHORT,
} from '../lib/recurrence';

/** Пн першим — тиждень у команді починається не з неділі */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const MODE_LABELS: { mode: RecurrenceMode; label: string }[] = [
  { mode: 'daily', label: 'Щодня' },
  { mode: 'weekly', label: 'По днях тижня' },
  { mode: 'monthly', label: 'Щомісяця' },
  { mode: 'interval', label: 'Кожні N днів' },
];

const blankForm = (): { label: string; enabled: boolean; schedule: RecurrenceSchedule; template: TaskTemplate } => ({
  label: '',
  enabled: true,
  schedule: { mode: 'weekly', time: '09:00', days: [1], dayOfMonth: 1, intervalDays: 3 },
  template: {
    title: '',
    description: '',
    listId: '',
    projectId: null,
    phaseId: null,
    assigneeId: null,
    tagIds: [],
    deadlineOffsetDays: null,
    subtaskTitles: [],
  },
});

// ── Форма правила ─────────────────────────────────────────────────────────────

function AutomationForm({
  initial, onSave, onCancel, isSaving, error,
}: {
  initial: ReturnType<typeof blankForm>;
  onSave: (data: ReturnType<typeof blankForm>) => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
}) {
  const { state } = useAppContext();
  const [form, setForm] = useState(initial);
  const [subtaskDraft, setSubtaskDraft] = useState('');

  const schedule = form.schedule;
  const template = form.template;
  const patchSchedule = (patch: Partial<RecurrenceSchedule>) => setForm({ ...form, schedule: { ...schedule, ...patch } });
  const patchTemplate = (patch: Partial<TaskTemplate>) => setForm({ ...form, template: { ...template, ...patch } });

  /** Списки підписані дошкою: назви на кшталт «To Do» повторюються на кожній */
  const listOptions = useMemo(() => {
    const boards = state.boards || [];
    return (state.lists || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(l => ({
        id: l.id,
        label: boards.length > 1
          ? `${boards.find(b => b.id === l.boardId)?.title || 'Дошка'} › ${l.title}`
          : l.title,
      }));
  }, [state.lists, state.boards]);

  const phases = (state.phases || []).filter(p => p.projectId === template.projectId);
  const scheduleError = validateSchedule(schedule);
  const preview = scheduleError ? null : nextRunAt(schedule, new Date(), null);

  const toggleDay = (d: number) => {
    const cur = schedule.days || [];
    patchSchedule({ days: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d] });
  };

  const toggleTag = (tagId: string) => {
    const cur = template.tagIds || [];
    patchTemplate({ tagIds: cur.includes(tagId) ? cur.filter(x => x !== tagId) : [...cur, tagId] });
  };

  const addSubtask = () => {
    if (!subtaskDraft.trim()) return;
    patchTemplate({ subtaskTitles: [...(template.subtaskTitles || []), subtaskDraft.trim()] });
    setSubtaskDraft('');
  };

  const canSave = !!form.label.trim() && !!template.title.trim() && !!template.listId && !scheduleError;

  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-5 shadow-sm space-y-5">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Назва правила</label>
        <input
          value={form.label}
          onChange={e => setForm({ ...form, label: e.target.value })}
          placeholder="Наприклад: Тижневий звіт по клієнтах"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
        />
        <p className="text-[11px] text-gray-400 mt-1">Видно лише тут — назва самої задачі задається нижче</p>
      </div>

      {/* ── Розклад ───────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 uppercase tracking-wide">
          <CalendarClock className="w-3.5 h-3.5 text-indigo-500" /> Як часто повторювати
        </div>

        <div className="flex flex-wrap gap-1.5">
          {MODE_LABELS.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => patchSchedule({ mode })}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                schedule.mode === mode
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Час створення</label>
            <input
              type="time"
              value={schedule.time}
              onChange={e => patchSchedule({ time: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
            />
          </div>

          {schedule.mode === 'monthly' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Число місяця</label>
              <input
                type="number" min={1} max={31}
                value={schedule.dayOfMonth ?? 1}
                onChange={e => patchSchedule({ dayOfMonth: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
              />
              {(schedule.dayOfMonth ?? 1) > 28 && (
                <p className="text-[11px] text-gray-400 mt-1">У коротких місяцях задача створиться в останній день</p>
              )}
            </div>
          )}

          {schedule.mode === 'interval' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Кожні скільки днів</label>
              <input
                type="number" min={1} max={365}
                value={schedule.intervalDays ?? 3}
                onChange={e => patchSchedule({ intervalDays: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">Відлік іде від останнього створення, а не від початку місяця</p>
            </div>
          )}
        </div>

        {schedule.mode === 'weekly' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">Дні тижня</label>
            <div className="flex gap-1.5 flex-wrap">
              {DAY_ORDER.map(value => {
                const selected = (schedule.days || []).includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleDay(value)}
                    className={`w-9 h-9 rounded-lg text-xs font-bold border transition ${
                      selected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    {WEEKDAY_SHORT[value]}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => patchSchedule({ days: [1, 2, 3, 4, 5] })}
                className="px-3 h-9 rounded-lg text-xs font-semibold border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition"
              >
                Пн–Пт
              </button>
            </div>
          </div>
        )}

        <div className={`rounded-lg px-3 py-2 text-xs ${scheduleError ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-700'}`}>
          {scheduleError
            ? scheduleError
            : <>Задача створюватиметься <b>{describeSchedule(schedule)}</b>. Найближча — {describeNextRun(preview)}.</>}
        </div>
      </div>

      {/* ── Шаблон задачі ─────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4 space-y-4">
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 uppercase tracking-wide">
          <ListChecks className="w-3.5 h-3.5 text-indigo-500" /> Яку задачу створювати
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Назва задачі</label>
          <input
            value={template.title}
            onChange={e => patchTemplate({ title: e.target.value })}
            placeholder="Наприклад: Зібрати звіт за тиждень"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Опис</label>
          <textarea
            value={template.description || ''}
            onChange={e => patchTemplate({ description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 resize-y"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Список на дошці</label>
            <select
              value={template.listId}
              onChange={e => patchTemplate({ listId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 bg-white"
            >
              <option value="">— оберіть список —</option>
              {listOptions.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Виконавець</label>
            <select
              value={template.assigneeId || ''}
              onChange={e => patchTemplate({ assigneeId: e.target.value || null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 bg-white"
            >
              <option value="">— без виконавця —</option>
              {(state.users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Проєкт</label>
            <select
              value={template.projectId || ''}
              onChange={e => patchTemplate({ projectId: e.target.value || null, phaseId: null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 bg-white"
            >
              <option value="">— без проєкту —</option>
              {(state.projects || []).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>

          {template.projectId && phases.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Етап проєкту</label>
              <select
                value={template.phaseId || ''}
                onChange={e => patchTemplate({ phaseId: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 bg-white"
              >
                <option value="">— без етапу —</option>
                {phases.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Дедлайн</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} max={365}
                value={template.deadlineOffsetDays ?? ''}
                onChange={e => patchTemplate({ deadlineOffsetDays: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="—"
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
              />
              <span className="text-xs text-gray-500">днів від створення</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Порожньо — задача буде без дедлайну</p>
          </div>
        </div>

        {(state.tags || []).length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">Теги</label>
            <div className="flex flex-wrap gap-1.5">
              {(state.tags || []).map(tag => {
                const selected = (template.tagIds || []).includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    style={selected ? { backgroundColor: tag.color, borderColor: tag.color } : { borderColor: tag.color, color: tag.color }}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition ${selected ? 'text-white' : 'bg-white'}`}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">Підзадачі</label>
          <div className="space-y-1.5">
            {(template.subtaskTitles || []).map((title, i) => (
              <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                <span className="flex-1 text-sm text-gray-700">{title}</span>
                <button
                  type="button"
                  onClick={() => patchTemplate({ subtaskTitles: (template.subtaskTitles || []).filter((_, x) => x !== i) })}
                  className="text-gray-400 hover:text-red-500 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              value={subtaskDraft}
              onChange={e => setSubtaskDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }}
              placeholder="Додати пункт чек-листа"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={addSubtask}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
        <span className="text-sm font-medium text-gray-700">Правило активне</span>
        <button type="button" onClick={() => setForm({ ...form, enabled: !form.enabled })} className="text-indigo-600 transition">
          {form.enabled ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7 text-gray-400" />}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-lg px-3 py-2 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={isSaving || !canSave}
          onClick={() => onSave(form)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Зберегти
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition"
        >
          Скасувати
        </button>
      </div>
    </div>
  );
}

// ── Рядок правила ─────────────────────────────────────────────────────────────

function AutomationRow({
  automation, isAdmin, busy, onToggle, onRun, onEdit, onDelete, onOpenCard,
}: {
  automation: TaskAutomation;
  isAdmin: boolean;
  busy: boolean;
  onToggle: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenCard: (cardId: string) => void;
}) {
  const { state } = useAppContext();
  const tpl = automation.template;
  const list = (state.lists || []).find(l => l.id === tpl.listId);
  const project = tpl.projectId ? (state.projects || []).find(p => p.id === tpl.projectId) : null;
  const assignee = tpl.assigneeId ? (state.users || []).find(u => u.id === tpl.assigneeId) : null;
  const tags = (state.tags || []).filter(t => (tpl.tagIds || []).includes(t.id));
  const next = automation.enabled ? nextRunAt(automation.schedule, new Date(), automation.lastRunAt) : null;

  return (
    <div className={`bg-white border rounded-xl p-4 transition ${automation.enabled ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-gray-900 truncate">{automation.label}</h3>
            {!automation.enabled && (
              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-bold uppercase">Вимкнено</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            <Clock className="w-3 h-3 inline -mt-0.5 mr-1" />
            {describeSchedule(automation.schedule)}
            {automation.enabled && <> · наступна {describeNextRun(next)}</>}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isAdmin && (
            <>
              <button
                onClick={onRun}
                disabled={busy}
                title="Створити задачу зараз"
                className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={onToggle}
                title={automation.enabled ? 'Вимкнути' : 'Увімкнути'}
                className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition"
              >
                {automation.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
              </button>
              <button onClick={onEdit} title="Редагувати" className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition">
                <Edit3 className="w-4 h-4" />
              </button>
              <button onClick={onDelete} title="Видалити" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 bg-gray-50 rounded-lg px-3 py-2.5">
        <p className="text-sm font-semibold text-gray-800">{tpl.title}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-gray-500">
          <span>{list ? list.title : <span className="text-red-500">списку більше немає</span>}</span>
          {project && <span>· {project.title}</span>}
          <span>· {assignee ? assignee.name : 'без виконавця'}</span>
          {typeof tpl.deadlineOffsetDays === 'number' && <span>· дедлайн +{tpl.deadlineOffsetDays} дн.</span>}
          {(tpl.subtaskTitles || []).length > 0 && <span>· {tpl.subtaskTitles!.length} підзадач</span>}
          {tags.map(t => (
            <span key={t.id} style={{ color: t.color, borderColor: t.color }} className="px-1.5 py-0.5 rounded border font-semibold">
              {t.name}
            </span>
          ))}
        </div>
      </div>

      {automation.lastRunAt && (
        <p className="mt-2 text-[11px] text-gray-400">
          Створено разів: {automation.runCount || 0} · востаннє {new Date(automation.lastRunAt).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}
          {automation.lastCardId && (
            <button
              onClick={() => onOpenCard(automation.lastCardId!)}
              className="ml-1.5 inline-flex items-center gap-0.5 text-indigo-600 hover:underline font-medium"
            >
              відкрити задачу <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </p>
      )}
    </div>
  );
}

// ── Розділ ────────────────────────────────────────────────────────────────────

export default function AutomationsView() {
  const { currentUser, confirmAction, setActiveView, setOpenCardId } = useAppContext();
  const isAdmin = currentUser.role === 'admin';

  const [automations, setAutomations] = useState<TaskAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getAutomations()
      .then(setAutomations)
      .catch(() => setAutomations([]))
      .finally(() => setLoading(false));
  }, []);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  };

  const handleCreate = async (data: ReturnType<typeof blankForm>) => {
    setIsSaving(true); setFormError(null);
    try {
      const created = await createAutomation(data);
      setAutomations(prev => [...prev, created]);
      setIsAdding(false);
    } catch (e: any) { setFormError(e.message); }
    finally { setIsSaving(false); }
  };

  const handleUpdate = async (id: string, data: ReturnType<typeof blankForm>) => {
    setIsSaving(true); setFormError(null);
    try {
      const saved = await updateAutomation(id, data);
      setAutomations(prev => prev.map(a => a.id === id ? saved : a));
      setEditingId(null);
    } catch (e: any) { setFormError(e.message); }
    finally { setIsSaving(false); }
  };

  const handleToggle = async (automation: TaskAutomation) => {
    try {
      const saved = await updateAutomation(automation.id, { enabled: !automation.enabled });
      setAutomations(prev => prev.map(a => a.id === automation.id ? saved : a));
    } catch (e: any) { flash(e.message); }
  };

  const handleDelete = (automation: TaskAutomation) => {
    confirmAction(`Видалити правило «${automation.label}»? Уже створені задачі залишаться.`, async () => {
      try {
        await deleteAutomation(automation.id);
        setAutomations(prev => prev.filter(a => a.id !== automation.id));
      } catch (e: any) { flash(e.message); }
    });
  };

  const handleRun = async (automation: TaskAutomation) => {
    setBusyId(automation.id);
    try {
      const { card } = await runAutomation(automation.id);
      // Правило змінилось на сервері (lastRunAt, лічильник) — забираємо свіжий список
      setAutomations(await getAutomations());
      flash(`Створено задачу «${card.title}»`);
    } catch (e: any) { flash(e.message); }
    finally { setBusyId(null); }
  };

  const openCard = (cardId: string) => {
    setOpenCardId(cardId);
    setActiveView('board');
  };

  /** Форма правила у вигляді, придатному для редагування */
  const toForm = (a: TaskAutomation) => ({
    label: a.label,
    enabled: a.enabled,
    schedule: { ...blankForm().schedule, ...a.schedule },
    template: { ...blankForm().template, ...a.template },
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-600" /> Автоматизації
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Задачі, які створюються самі за розкладом — щоб рутину не доводилось щоразу заводити руками
          </p>
        </div>
        {isAdmin && !isAdding && !editingId && (
          <button
            onClick={() => { setIsAdding(true); setFormError(null); }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition"
          >
            <Plus className="w-4 h-4" /> Нове правило
          </button>
        )}
      </div>

      {toast && (
        <div className="bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2 text-xs font-medium">{toast}</div>
      )}

      {isAdding && (
        <AutomationForm
          initial={blankForm()}
          onSave={handleCreate}
          onCancel={() => { setIsAdding(false); setFormError(null); }}
          isSaving={isSaving}
          error={formError}
        />
      )}

      {automations.length === 0 && !isAdding && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl py-12 text-center">
          <Bot className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-500">Правил ще немає</p>
          <p className="text-xs text-gray-400 mt-1">
            {isAdmin
              ? 'Створіть правило — і задача з’являтиметься на дошці сама'
              : 'Правила налаштовує адміністратор'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {automations.map(automation => (
          editingId === automation.id ? (
            <AutomationForm
              key={automation.id}
              initial={toForm(automation)}
              onSave={data => handleUpdate(automation.id, data)}
              onCancel={() => { setEditingId(null); setFormError(null); }}
              isSaving={isSaving}
              error={formError}
            />
          ) : (
            <AutomationRow
              key={automation.id}
              automation={automation}
              isAdmin={isAdmin}
              busy={busyId === automation.id}
              onToggle={() => handleToggle(automation)}
              onRun={() => handleRun(automation)}
              onEdit={() => { setEditingId(automation.id); setIsAdding(false); setFormError(null); }}
              onDelete={() => handleDelete(automation)}
              onOpenCard={openCard}
            />
          )
        ))}
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { CheckSquare, Circle, CheckCircle2, MessageSquare, Plus, Search, X, FolderKanban } from 'lucide-react';
import { useAppContext } from '../../App';
import type { Card } from '../../types';
import { toDayKey, todayKey, toStoredDate } from '../../lib/gantt';
import {
  TaskBucket, bucketOf, countByBucket, deadlineLabel, filterTasks, groupTasks,
} from '../../lib/mobileTasks';

type Chip = 'all' | 'overdue' | 'today' | 'soon' | 'done';

const CHIPS: { key: Chip; label: string }[] = [
  { key: 'all', label: 'Усі' },
  { key: 'overdue', label: 'Прострочені' },
  { key: 'today', label: 'Сьогодні' },
  { key: 'soon', label: 'Скоро' },
  { key: 'done', label: 'Виконані' },
];

/** Які групи входять у чип. «Скоро» — завтра й найближчий тиждень. */
const CHIP_BUCKETS: Record<Exclude<Chip, 'all'>, TaskBucket[]> = {
  overdue: ['overdue'],
  today: ['today'],
  soon: ['tomorrow', 'week'],
  done: ['done'],
};

const GROUP_PAGE = 30;

interface Props {
  onOpenCard: (card: Card) => void;
}

export default function MobileTasks({ onOpenCard }: Props) {
  const { state, currentUser, updateCard, hasEditRights } = useAppContext();
  const me = currentUser?.userId ?? null;

  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<Chip>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [shown, setShown] = useState<Record<string, number>>({});

  const today = todayKey();
  const lists = state.lists || [];
  const listById = useMemo(() => new Map(lists.map(l => [l.id, l])), [lists]);
  const projectById = useMemo(() => new Map((state.projects || []).map(p => [p.id, p])), [state.projects]);
  const userById = useMemo(() => new Map((state.users || []).map(u => [u.id, u])), [state.users]);

  // Лише картки з існуючих колонок: «осиротілі» (з видаленої колонки) на дошці не видно, і тут теж не потрібні
  const base = useMemo(
    () => state.cards.filter(c => listById.has(c.listId)),
    [state.cards, listById],
  );

  const scoped = useMemo(
    () => filterTasks(base, { assigneeId: scope === 'mine' ? me : null, query, includeDone: true }),
    [base, scope, me, query],
  );

  const counts = useMemo(() => {
    const c = countByBucket(scoped, today);
    return {
      all: scoped.length - c.done,
      overdue: c.overdue,
      today: c.today,
      soon: c.tomorrow + c.week,
      done: c.done,
    } as Record<Chip, number>;
  }, [scoped, today]);

  const groups = useMemo(() => {
    const wanted = chip === 'all' ? null : CHIP_BUCKETS[chip];
    const visible = scoped.filter(c => {
      const b = bucketOf(c, today);
      if (wanted) return wanted.includes(b);
      return b !== 'done'; // у «Усіх» виконані не показуємо — для них є окремий чип
    });
    return groupTasks(visible, today);
  }, [scoped, chip, today]);

  const total = groups.reduce((n, g) => n + g.cards.length, 0);

  return (
    <div className="flex flex-col min-h-full">
      {/* Керування списком: липне під верхньою панеллю */}
      <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur px-4 pt-3 pb-2 space-y-3 border-b border-gray-200">
        <div role="tablist" aria-label="Чиї задачі показувати" className="grid grid-cols-2 p-1 bg-gray-200/70 rounded-xl">
          {([['mine', 'Мої'], ['all', 'Усі']] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={scope === key}
              onClick={() => { setScope(key); setShown({}); }}
              className={`h-10 rounded-lg text-sm font-semibold transition ${
                scope === key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={e => { setQuery(e.target.value); setShown({}); }}
            placeholder="Пошук за назвою"
            aria-label="Пошук задач за назвою"
            className="w-full h-11 pl-10 pr-10 bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Очистити пошук"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto hidden-scrollbar -mx-4 px-4 pb-1" role="group" aria-label="Фільтр за терміном">
          {CHIPS.map(c => {
            const active = chip === c.key;
            const n = counts[c.key];
            const alarming = c.key === 'overdue' && n > 0;
            return (
              <button
                key={c.key}
                onClick={() => { setChip(c.key); setShown({}); }}
                aria-pressed={active}
                className={`shrink-0 h-10 px-4 rounded-full text-sm font-medium border transition flex items-center gap-1.5 ${
                  active
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : alarming
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-white border-gray-200 text-gray-700'
                }`}
              >
                {c.label}
                <span className={`text-xs font-semibold ${active ? 'text-white/80' : 'text-gray-400'}`}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Список */}
      <div className="flex-1 px-4 pt-3 pb-32 space-y-5">
        {total === 0 ? (
          <EmptyState scope={scope} chip={chip} query={query} onReset={() => { setChip('all'); setQuery(''); }} />
        ) : groups.map(group => {
          const limit = shown[group.key] ?? GROUP_PAGE;
          return (
            <section key={group.key} aria-labelledby={`grp-${group.key}`}>
              <h2
                id={`grp-${group.key}`}
                className={`text-xs font-bold uppercase tracking-wider mb-2 px-1 ${group.key === 'overdue' ? 'text-red-600' : 'text-gray-500'}`}
              >
                {group.label} · {group.cards.length}
              </h2>
              <ul className="space-y-2">
                {group.cards.slice(0, limit).map(card => (
                  <li key={card.id}>
                    <TaskRow
                      card={card}
                      today={today}
                      listTitle={listById.get(card.listId)?.title || ''}
                      projectTitle={card.projectId ? projectById.get(card.projectId)?.title : undefined}
                      projectColor={card.projectId ? projectById.get(card.projectId)?.color : undefined}
                      assignee={scope === 'all' && card.assigneeId ? userById.get(card.assigneeId) : undefined}
                      canToggle={hasEditRights}
                      onToggle={() => updateCard(card.id, { isCompleted: !card.isCompleted })}
                      onOpen={() => onOpenCard(card)}
                    />
                  </li>
                ))}
              </ul>
              {group.cards.length > limit && (
                <button
                  onClick={() => setShown(s => ({ ...s, [group.key]: limit + GROUP_PAGE }))}
                  className="w-full h-11 mt-2 text-sm font-medium text-blue-600 bg-white border border-gray-200 rounded-xl"
                >
                  Показати ще {Math.min(GROUP_PAGE, group.cards.length - limit)} із {group.cards.length - limit}
                </button>
              )}
            </section>
          );
        })}
      </div>

      {hasEditRights && (
        <button
          onClick={() => setIsAdding(true)}
          aria-label="Нова задача"
          className="fixed right-4 z-20 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center active:scale-95 transition"
          style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {isAdding && <AddTaskSheet onClose={() => setIsAdding(false)} />}
    </div>
  );
}

// ── Рядок задачі ──────────────────────────────────────────────────────────────

function TaskRow({
  card, today, listTitle, projectTitle, projectColor, assignee, canToggle, onToggle, onOpen,
}: {
  card: Card;
  today: string;
  listTitle: string;
  projectTitle?: string;
  projectColor?: string;
  assignee?: { name: string; avatar?: string };
  canToggle: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const bucket = bucketOf(card, today);
  const label = deadlineLabel(card.deadline, today);
  const subDone = (card.subtasks || []).filter(s => s.completed).length;
  const subTotal = (card.subtasks || []).length;
  const comments = (card.comments || []).length;

  const pill =
    bucket === 'overdue' ? 'bg-red-50 text-red-700'
    : bucket === 'today' ? 'bg-amber-50 text-amber-700'
    : 'bg-gray-100 text-gray-600';

  return (
    <div className="flex items-stretch bg-white border border-gray-200 rounded-xl overflow-hidden">
      {canToggle ? (
        <button
          onClick={onToggle}
          aria-label={card.isCompleted ? `Повернути в роботу: ${card.title}` : `Позначити виконаною: ${card.title}`}
          className="w-12 shrink-0 flex items-center justify-center text-gray-400"
        >
          {card.isCompleted
            ? <CheckCircle2 className="w-6 h-6 text-green-500" />
            : <Circle className="w-6 h-6" />}
        </button>
      ) : (
        <div className="w-3 shrink-0" />
      )}

      <button onClick={onOpen} className="flex-1 min-w-0 text-left py-3 pr-3 min-h-[64px]">
        <p className={`text-[15px] leading-snug font-medium line-clamp-2 ${card.isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {card.title}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs text-gray-500">
          {label && !card.isCompleted && (
            <span className={`px-1.5 py-0.5 rounded font-medium ${pill}`}>{label}</span>
          )}
          {listTitle && <span className="truncate max-w-[40%]">{listTitle}</span>}
          {projectTitle && (
            <span className="inline-flex items-center gap-1 truncate max-w-[45%]">
              <FolderKanban className="w-3 h-3 shrink-0" style={{ color: projectColor }} aria-hidden />
              <span className="truncate">{projectTitle}</span>
            </span>
          )}
          {subTotal > 0 && (
            <span className="inline-flex items-center gap-1"><CheckSquare className="w-3 h-3" aria-hidden />{subDone}/{subTotal}</span>
          )}
          {comments > 0 && (
            <span className="inline-flex items-center gap-1"><MessageSquare className="w-3 h-3" aria-hidden />{comments}</span>
          )}
          {assignee && (
            <span className="inline-flex items-center gap-1 ml-auto">
              {assignee.avatar
                ? <img src={assignee.avatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                : null}
              {assignee.name.split(' ')[0]}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

// ── Порожній стан ─────────────────────────────────────────────────────────────

function EmptyState({ scope, chip, query, onReset }: { scope: 'mine' | 'all'; chip: Chip; query: string; onReset: () => void }) {
  const filtered = chip !== 'all' || !!query.trim();
  const text = query.trim()
    ? `Нічого не знайдено за запитом «${query.trim()}». Спробуйте іншу назву.`
    : chip === 'overdue' ? 'Прострочених задач немає. Так тримати!'
    : chip === 'today' ? 'На сьогодні задач немає.'
    : chip === 'soon' ? 'На найближчий тиждень задач немає.'
    : chip === 'done' ? 'Виконаних задач поки немає.'
    : scope === 'mine' ? 'У вас поки немає задач. Вони з’являться тут, щойно вас призначать виконавцем.'
    : 'Задач поки немає.';
  return (
    <div className="text-center py-16 px-6">
      <CheckCircle2 className="w-12 h-12 text-gray-200 mx-auto mb-3" aria-hidden />
      <p className="text-sm text-gray-500">{text}</p>
      {filtered && (
        <button onClick={onReset} className="mt-4 h-11 px-5 text-sm font-medium text-blue-600 bg-white border border-gray-200 rounded-xl">
          Скинути фільтри
        </button>
      )}
    </div>
  );
}

// ── Нова задача ───────────────────────────────────────────────────────────────

function AddTaskSheet({ onClose }: { onClose: () => void }) {
  const { state, currentUser, addCard, activeBoardId } = useAppContext();
  const boards = state.boards || [];

  // Колонки існуючих дошок у порядку: спершу активна дошка, далі решта
  const options = useMemo(() => {
    const ordered = [...boards].sort((a, b) => (a.id === activeBoardId ? -1 : b.id === activeBoardId ? 1 : 0));
    return ordered.flatMap(b =>
      state.lists
        .filter(l => l.boardId === b.id)
        .sort((x, y) => x.order - y.order)
        .map(l => ({ id: l.id, label: boards.length > 1 ? `${b.title} · ${l.title}` : l.title })),
    );
  }, [boards, state.lists, activeBoardId]);

  const [title, setTitle] = useState('');
  const [listId, setListId] = useState(options[0]?.id ?? '');
  const [deadline, setDeadline] = useState('');
  const [forMe, setForMe] = useState(true);

  const canSave = title.trim().length > 0 && !!listId;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    addCard(listId, title.trim(), {
      assigneeId: forMe ? (currentUser?.userId ?? null) : null,
      deadline: deadline ? toStoredDate(deadline) : null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose} role="presentation">
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Нова задача"
        className="w-full bg-white rounded-t-2xl p-4 space-y-3 pb-safe"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Нова задача</h2>
          <button type="button" onClick={onClose} aria-label="Закрити" className="w-11 h-11 -mr-2 flex items-center justify-center text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-500">Що потрібно зробити</span>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Назва задачі"
            className="mt-1 w-full h-12 px-3 border border-gray-300 rounded-xl outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="text-xs font-medium text-gray-500">Колонка</span>
            <select
              value={listId}
              onChange={e => setListId(e.target.value)}
              className="mt-1 w-full h-12 px-3 border border-gray-300 rounded-xl bg-white outline-none focus:border-blue-400"
            >
              {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="text-xs font-medium text-gray-500">Термін</span>
            <input
              type="date"
              value={deadline}
              min={toDayKey(new Date()) || undefined}
              onChange={e => setDeadline(e.target.value)}
              className="mt-1 w-full h-12 px-3 border border-gray-300 rounded-xl bg-white outline-none focus:border-blue-400"
            />
          </label>
        </div>

        <label className="flex items-center gap-3 min-h-[44px]">
          <input
            type="checkbox"
            checked={forMe}
            onChange={e => setForMe(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-700">Призначити мені</span>
        </label>

        <button
          type="submit"
          disabled={!canSave}
          className="w-full h-12 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-40"
        >
          Створити задачу
        </button>
      </form>
    </div>
  );
}

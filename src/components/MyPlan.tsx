import React, { useMemo, useState } from 'react';
import {
  CalendarCheck, CheckCircle2, ChevronDown, ChevronRight, CornerDownRight, Circle,
  CheckSquare, Sparkles, ArrowRight,
} from 'lucide-react';
import { useAppContext } from '../App';
import type { Card } from '../types';
import { bucketOf, deadlineLabel, groupTasks, type TaskBucket } from '../lib/mobileTasks';
import { buildPlanItems, summarizePlan, type PlanItem } from '../lib/myPlan';

type Kind = 'all' | 'card' | 'subtask';

/** Вигляд груп: що терміновіше, то помітніше. «Пізніше» й «Без терміну» за замовчуванням згорнуті. */
const BUCKET_STYLE: Record<TaskBucket, { dot: string; text: string; badge: string; stripe: string; open: boolean }> = {
  overdue:  { dot: 'bg-red-500',   text: 'text-red-700',   badge: 'bg-red-100 text-red-700',     stripe: 'bg-red-400',   open: true },
  today:    { dot: 'bg-amber-500', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', stripe: 'bg-amber-400', open: true },
  tomorrow: { dot: 'bg-blue-500',  text: 'text-blue-700',  badge: 'bg-blue-100 text-blue-700',   stripe: 'bg-blue-400',  open: true },
  week:     { dot: 'bg-slate-400', text: 'text-slate-600', badge: 'bg-slate-100 text-slate-600', stripe: 'bg-slate-300', open: true },
  later:    { dot: 'bg-gray-300',  text: 'text-gray-500',  badge: 'bg-gray-100 text-gray-600',   stripe: 'bg-gray-200',  open: false },
  none:     { dot: 'bg-gray-300',  text: 'text-gray-500',  badge: 'bg-gray-100 text-gray-500',   stripe: 'bg-gray-200',  open: false },
  done:     { dot: 'bg-gray-300',  text: 'text-gray-500',  badge: 'bg-gray-100 text-gray-500',   stripe: 'bg-gray-200',  open: false },
};

/**
 * Персональний план роботи: усе, що лежить на мені, за термінами.
 *
 * Задачі й підзавдання в одному списку, бо в день планування важить «що мені
 * робити», а не «де воно лежить». Підзавдання можна закрити тут же, не відкриваючи
 * картку. Найтерміновіше розгорнуто, далеке й без терміну сховано за лічильником.
 */
export default function MyPlan({ onOpenCard, storyPoints }: { onOpenCard: (card: Card) => void; storyPoints: number }) {
  const { state, currentUser, updateCard, hasEditRights, setActiveView } = useAppContext();
  const userId = currentUser?.userId || '';

  const [kind, setKind] = useState<Kind>('all');
  const [collapsed, setCollapsed] = useState<Partial<Record<TaskBucket, boolean>>>({});

  const all = useMemo(() => buildPlanItems(state.cards, userId), [state.cards, userId]);
  const summary = useMemo(() => summarizePlan(all, i => bucketOf(i)), [all]);
  const items = useMemo(() => all.filter(i => kind === 'all' || i.kind === kind), [all, kind]);
  const groups = useMemo(() => groupTasks(items), [items]);

  const cardById = useMemo(() => new Map(state.cards.map(c => [c.id, c])), [state.cards]);
  const projectById = useMemo(() => new Map((state.projects || []).map(p => [p.id, p])), [state.projects]);
  const listTitle = (listId: string) => state.lists.find(l => l.id === listId)?.title || '';

  const isOpen = (b: TaskBucket) => collapsed[b] === undefined ? BUCKET_STYLE[b].open : !collapsed[b];
  const toggle = (b: TaskBucket) => setCollapsed(c => ({ ...c, [b]: isOpen(b) }));

  const completeSubtask = (item: PlanItem) => {
    const card = cardById.get(item.cardId);
    if (!card || !hasEditRights) return;
    updateCard(card.id, {
      subtasks: (card.subtasks || []).map(s => (s.id === item.subtaskId ? { ...s, completed: true } : s)),
    });
  };

  const openItem = (item: PlanItem) => {
    const card = cardById.get(item.cardId);
    if (card) onOpenCard(card);
  };

  const kinds: { id: Kind; label: string; count: number }[] = [
    { id: 'all', label: 'Усе', count: all.length },
    { id: 'card', label: 'Задачі', count: summary.tasks },
    { id: 'subtask', label: 'Підзавдання', count: summary.subtasks },
  ];

  return (
    <section aria-labelledby="my-plan-title" className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Шапка: що це, скільки терміново, фільтр */}
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center justify-between gap-3">
          <h3 id="my-plan-title" className="font-bold text-gray-800 flex items-center gap-2 min-w-0">
            <CalendarCheck className="w-5 h-5 text-blue-600 shrink-0" />
            Мій план
          </h3>
          <button
            onClick={() => setActiveView('board')}
            className="shrink-0 flex items-center gap-1.5 min-h-[44px] sm:min-h-0 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition"
          >
            Усі задачі <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-1">
          {summary.overdue > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{summary.overdue} прострочено</span>
          )}
          {summary.today > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{summary.today} на сьогодні</span>
          )}
          {summary.overdue === 0 && summary.today === 0 && all.length > 0 && (
            <span className="text-xs text-gray-500">На сьогодні нічого термінового</span>
          )}
          {storyPoints > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> {storyPoints} SP за місяць
            </span>
          )}
        </div>

        <div role="tablist" aria-label="Що показувати" className="mt-3 inline-flex w-full sm:w-auto p-1 bg-gray-100 rounded-xl">
          {kinds.map(k => (
            <button
              key={k.id}
              role="tab"
              aria-selected={kind === k.id}
              onClick={() => setKind(k.id)}
              className={`flex-1 sm:flex-none min-h-[40px] px-3 sm:px-4 text-sm font-medium rounded-lg transition ${
                kind === k.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {k.label}
              <span className="ml-1.5 text-xs tabular-nums text-gray-400">{k.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Список за термінами */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 px-6 text-center text-gray-400">
          <CheckCircle2 className="w-10 h-10 mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-600">
            {all.length === 0 ? 'У плані порожньо' : kind === 'subtask' ? 'Підзавдань на вас немає' : 'Задач на вас немає'}
          </p>
          <p className="text-xs mt-1 max-w-xs">
            Тут зʼявляться задачі, де ви відповідальні, і підзавдання, куди вас призначили.
          </p>
        </div>
      ) : (
        <div>
          {groups.map(g => {
            const st = BUCKET_STYLE[g.key];
            const open = isOpen(g.key);
            return (
              <div key={g.key} className="border-t border-gray-100 first:border-t-0">
                <button
                  onClick={() => toggle(g.key)}
                  aria-expanded={open}
                  className="w-full flex items-center gap-2 px-4 sm:px-6 min-h-[44px] bg-gray-50 hover:bg-gray-100/70 transition text-left"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot}`} />
                  <span className={`text-xs font-bold uppercase tracking-wider ${st.text}`}>{g.label}</span>
                  <span className="text-xs text-gray-400 tabular-nums">{g.cards.length}</span>
                  <span className="ml-auto text-gray-400">
                    {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                </button>

                {open && (
                  <ul className="divide-y divide-gray-50">
                    {g.cards.map(item => (
                      <PlanRow
                        key={item.id}
                        item={item}
                        stripe={st.stripe}
                        badge={st.badge}
                        card={cardById.get(item.cardId)}
                        projectName={projectById.get(cardById.get(item.cardId)?.projectId || '')?.title}
                        projectColor={projectById.get(cardById.get(item.cardId)?.projectId || '')?.color}
                        listName={listTitle(cardById.get(item.cardId)?.listId || '')}
                        canComplete={hasEditRights}
                        onOpen={() => openItem(item)}
                        onComplete={() => completeSubtask(item)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {items.some(i => i.inheritedDeadline) && (
        <p className="px-4 sm:px-6 py-2.5 border-t border-gray-100 text-xs text-gray-500">
          * У підзавдання немає свого терміну, показано термін задачі.
        </p>
      )}
    </section>
  );
}

function PlanRow({ item, stripe, badge, card, projectName, projectColor, listName, canComplete, onOpen, onComplete }: {
  item: PlanItem;
  stripe: string;
  badge: string;
  card?: Card;
  projectName?: string;
  projectColor?: string;
  listName: string;
  canComplete: boolean;
  onOpen: () => void;
  onComplete: () => void;
}) {
  const isSub = item.kind === 'subtask';
  const label = deadlineLabel(item.deadline);

  return (
    <li className="group flex items-stretch hover:bg-gray-50/80 transition-colors">
      <span className={`w-1 shrink-0 my-3 ml-2 sm:ml-4 rounded-full ${stripe}`} aria-hidden="true" />

      {isSub && (
        canComplete ? (
          <button
            onClick={onComplete}
            aria-label={`Позначити виконаним: ${item.title}`}
            title="Позначити виконаним"
            className="w-11 shrink-0 flex items-center justify-center text-gray-300 hover:text-green-600"
          >
            <Circle className="w-5 h-5" />
          </button>
        ) : (
          <span className="w-11 shrink-0 flex items-center justify-center text-gray-300" aria-hidden="true">
            <Circle className="w-5 h-5" />
          </span>
        )
      )}

      <button
        onClick={onOpen}
        className={`flex-1 min-w-0 text-left py-3 pr-2 min-h-[56px] ${isSub ? 'pl-0' : 'pl-3 sm:pl-4'}`}
      >
        <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-700 leading-snug break-words">
          {item.title}
        </p>

        {isSub && (
          <p className="mt-1 text-xs text-gray-500 flex items-start gap-1 min-w-0">
            <CornerDownRight className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="break-words min-w-0">у задачі «{item.parentTitle}»</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500">
          {projectName && (
            <span className="flex items-center gap-1 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: projectColor || '#9ca3af' }} />
              <span className="truncate max-w-[160px]">{projectName}</span>
            </span>
          )}
          {!isSub && listName && <span>{listName}</span>}
          {!isSub && (item.openSubtasks || 0) > 0 && (
            <span className="flex items-center gap-1">
              <CheckSquare className="w-3 h-3" />
              {card ? `${card.subtasks.filter(s => s.completed).length}/${card.subtasks.length}` : ''}
              {(item.mySubtasks || 0) > 0 && <span className="text-blue-600 font-medium">· на мені {item.mySubtasks}</span>}
            </span>
          )}
        </div>
      </button>

      <div className="shrink-0 flex items-center pr-4 sm:pr-6">
        {label && (
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badge} ${item.inheritedDeadline ? 'opacity-70' : ''}`}
            title={item.inheritedDeadline ? 'Термін задачі: у підзавдання свого немає' : undefined}
          >
            {label}{item.inheritedDeadline ? ' *' : ''}
          </span>
        )}
      </div>
    </li>
  );
}

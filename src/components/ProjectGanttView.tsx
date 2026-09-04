import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../App';
import { Card, Subtask } from '../types';
import CardModal from './CardModal';
import {
  ArrowLeft, CalendarRange, ChevronDown, ChevronRight, CheckCircle2, Circle,
  CornerDownRight, Crosshair, Eraser, FolderKanban, Plus, X,
} from 'lucide-react';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import {
  DayRange, addDays, diffDays, groupDays, isOverdue, isWeekend, parseDayKey,
  rangeFromDrag, rangeLength, rangeOf, rangeToFields, resizeRange, shiftRange,
  shiftSchedulables, spanOf, timelineBounds, toLocalDate, todayKey,
} from '../lib/gantt';

/**
 * Діаграма Ганта проєкту.
 *
 * Дошка відповідає на питання «що зараз у роботі», а це — на питання «чи
 * встигаємо»: усі задачі проєкту разом із підзадачами, розкладені по днях.
 * Планують прямо тут — смужку тягнуть, розтягують за краї, а незаплановану
 * задачу малюють протягуванням по порожньому рядку. Кожен такий жест пише ті
 * самі два поля картки (startDate і deadline), тож дати, поставлені в картці
 * руками, і дати, накидані мишею на діаграмі, — одне й те саме.
 *
 * Уся арифметика днів — у lib/gantt, тут лишається переклад пікселів у дні й
 * малювання.
 */

const LEFT_PANE = 268;
const ROW_HEIGHT = 34;
const DAY_WIDTH = { day: 34, week: 13 } as const;

type Scale = keyof typeof DAY_WIDTH;

interface Row {
  key: string;
  kind: 'card' | 'subtask';
  cardId: string;
  subtaskId?: string;
  title: string;
  completed: boolean;
  assigneeId?: string | null;
  /** Власні дати рядка */
  range: DayRange | null;
  /** Для картки без власних дат — охоплення підзадач */
  summary: DayRange | null;
  /** Частка виконаного: у картки — за підзадачами, у підзадачі — 0 або 1 */
  progress: number;
  hasChildren: boolean;
  collapsed: boolean;
}

type DragMode = 'move' | 'start' | 'end' | 'draw';

interface DragState {
  row: Row;
  mode: DragMode;
  originX: number;
  /** Лівий край доріжки на екрані — для перерахунку пікселів у день */
  trackLeft: number;
  anchorDay: string;
  base: DayRange | null;
  preview: DayRange;
  /** Тягнемо зведену смужку: рухаються підзадачі, а не сама картка */
  shiftChildren: boolean;
}

export default function ProjectGanttView() {
  const { state, activeProjectId, activeBoardId, setActiveView, updateCard, addCard, hasEditRights } = useAppContext();

  const project = (state.projects || []).find(p => p.id === activeProjectId) || null;
  const [scale, setScale] = useState<Scale>('day');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', listId: '', start: '', end: '' });

  const dayWidth = DAY_WIDTH[scale];
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = todayKey();

  const cards = useMemo(
    () => state.cards.filter(c => c.projectId === activeProjectId),
    [state.cards, activeProjectId],
  );

  /** Рядки діаграми: картка, а під нею — її підзадачі. */
  const rows = useMemo<Row[]>(() => {
    const build = (card: Card): Row[] => {
      const subtasks = card.subtasks || [];
      const ownRange = rangeOf(card);
      const summary = ownRange ? null : spanOf(subtasks.map(rangeOf));
      const done = subtasks.filter(st => st.completed).length;
      const isCollapsed = collapsed.has(card.id);
      const cardRow: Row = {
        key: card.id,
        kind: 'card',
        cardId: card.id,
        title: card.title,
        completed: !!card.isCompleted,
        assigneeId: card.assigneeId,
        range: ownRange,
        summary,
        progress: card.isCompleted ? 1 : (subtasks.length ? done / subtasks.length : 0),
        hasChildren: subtasks.length > 0,
        collapsed: isCollapsed,
      };
      if (isCollapsed) return [cardRow];
      return [
        cardRow,
        ...subtasks.map((st: Subtask): Row => ({
          key: `${card.id}:${st.id}`,
          kind: 'subtask',
          cardId: card.id,
          subtaskId: st.id,
          title: st.title,
          completed: st.completed,
          assigneeId: st.assigneeId,
          range: rangeOf(st),
          summary: null,
          progress: st.completed ? 1 : 0,
          hasChildren: false,
          collapsed: false,
        })),
      ];
    };

    // Заплановані — за датою початку, незаплановані — в кінці, у порядку дошки.
    const ordered = [...cards].sort((a, b) => {
      const ra = rangeOf(a) || spanOf((a.subtasks || []).map(rangeOf));
      const rb = rangeOf(b) || spanOf((b.subtasks || []).map(rangeOf));
      if (ra && rb) return ra.start.localeCompare(rb.start) || a.order - b.order;
      if (ra) return -1;
      if (rb) return 1;
      return a.order - b.order;
    });

    return ordered.flatMap(build);
  }, [cards, collapsed]);

  const timeline = useMemo(() => {
    const ranges = rows.flatMap(r => [r.range, r.summary]);
    if (project?.deadline) {
      const projectEnd = rangeOf({ deadline: project.deadline });
      if (projectEnd) ranges.push(projectEnd);
    }
    return timelineBounds(ranges, today, scale === 'day' ? 3 : 7);
  }, [rows, project?.deadline, today, scale]);

  const days = timeline.days;
  const gridWidth = days.length * dayWidth;
  const dayIndex = (key: string) => diffDays(days[0], key);

  /** Крайні дні шкали: далі тягнути нікуди, поки дати не збережено. */
  const clampDay = (key: string) => {
    if (key < days[0]) return days[0];
    if (key > days[days.length - 1]) return days[days.length - 1];
    return key;
  };

  const dayAtX = (clientX: number, trackLeft: number) =>
    clampDay(addDays(days[0], Math.floor((clientX - trackLeft) / dayWidth)));

  // Показуємо сьогодні, а не січень: без цього на довгому проєкті
  // відкривається порожній лівий край шкали.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const offset = dayIndex(today) * dayWidth - el.clientWidth / 3;
    el.scrollLeft = Math.max(0, offset);
    // Один раз на зміну масштабу — далі позицію тримає користувач.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, timeline.start]);

  /* ─────────────────────────── перетягування ─────────────────────────── */

  /**
   * Жест живе в ref, а стан — лише щоб малювати.
   *
   * Слухачі вішаються прямо в mousedown, а не в useEffect: ефект виконується
   * вже після рендера, і швидкий рух — натиснув, смикнув, відпустив — встигав
   * пройти повз нього, а смужка ставала одноденною. З тієї ж причини `commit`
   * читає ref, а не стан: до mouseup React може ще не перемалювати останній
   * крок.
   */
  const dragRef = useRef<DragState | null>(null);
  const stopGesture = useRef<() => void>(() => {});

  // Кинули сторінку посеред жесту — слухачі не мають лишитись на window.
  useEffect(() => () => stopGesture.current(), []);

  const beginGesture = (initial: DragState) => {
    stopGesture.current();
    dragRef.current = initial;
    setDrag(initial);

    const onMove = (e: MouseEvent) => {
      const current = dragRef.current;
      if (!current) return;
      let preview: DayRange;
      if (current.mode === 'draw') {
        preview = rangeFromDrag(current.anchorDay, dayAtX(e.clientX, current.trackLeft));
      } else if (current.base) {
        const delta = Math.round((e.clientX - current.originX) / dayWidth);
        preview = current.mode === 'move'
          ? shiftRange(current.base, delta)
          : resizeRange(current.base, current.mode, delta);
      } else {
        return;
      }
      const next = { ...current, preview };
      dragRef.current = next;
      setDrag(next);
    };

    const onUp = () => {
      detach();
      commit(dragRef.current);
      dragRef.current = null;
      setDrag(null);
    };

    const detach = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      stopGesture.current = () => {};
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    stopGesture.current = detach;
  };

  const commit = (gesture: DragState | null) => {
    if (!gesture) return;
    const { row, preview, base, shiftChildren } = gesture;
    const card = state.cards.find(c => c.id === row.cardId);
    if (!card) return;

    if (row.kind === 'subtask') {
      updateCard(card.id, {
        subtasks: (card.subtasks || []).map(st =>
          st.id === row.subtaskId ? { ...st, ...rangeToFields(preview) } : st),
      });
      return;
    }

    if (shiftChildren) {
      // Зведену смужку картки рухають цілим блоком: власних дат у неї немає,
      // тож зсув розкладається на підзадачі, з яких вона й складена.
      const delta = base ? diffDays(base.start, preview.start) : 0;
      if (!delta) return;
      updateCard(card.id, { subtasks: shiftSchedulables(card.subtasks || [], delta) });
      return;
    }

    updateCard(card.id, rangeToFields(preview));
  };

  const startBarDrag = (e: React.MouseEvent, row: Row, mode: Exclude<DragMode, 'draw'>, range: DayRange, shiftChildren: boolean) => {
    if (!hasEditRights) return;
    e.preventDefault();
    e.stopPropagation();
    beginGesture({
      row, mode, originX: e.clientX,
      // Зсув і розтягування рахуються від точки натискання, а не від краю
      // доріжки: курсор може бути будь-де на смужці.
      trackLeft: 0,
      anchorDay: range.start, base: range, preview: range, shiftChildren,
    });
  };

  const startDraw = (e: React.MouseEvent, row: Row) => {
    if (!hasEditRights || row.range) return;
    const trackLeft = e.currentTarget.getBoundingClientRect().left;
    const anchor = dayAtX(e.clientX, trackLeft);
    e.preventDefault();
    beginGesture({
      row, mode: 'draw', originX: e.clientX, trackLeft,
      anchorDay: anchor, base: null, preview: { start: anchor, end: anchor }, shiftChildren: false,
    });
  };

  const clearSchedule = (row: Row) => {
    const card = state.cards.find(c => c.id === row.cardId);
    if (!card) return;
    if (row.kind === 'subtask') {
      updateCard(card.id, {
        subtasks: (card.subtasks || []).map(st =>
          st.id === row.subtaskId ? { ...st, startDate: null, deadline: null } : st),
      });
    } else {
      updateCard(card.id, { startDate: null, deadline: null });
    }
  };

  /* ───────────────────────── нова задача ───────────────────────── */

  /**
   * Списки поточної дошки — картку треба покласти в один з них.
   *
   * Умова та сама, що й на дошці: у старих списків boardId немає, і вони
   * належать першій дошці. Без вибраної дошки лишаються всі списки — інакше
   * форма мовчки не мала б куди додавати.
   */
  const boardLists = useMemo(() => {
    const boards = state.boards || [];
    const scoped = state.lists.filter(l =>
      l.boardId === activeBoardId || (!l.boardId && boards[0]?.id === activeBoardId));
    return [...(scoped.length ? scoped : state.lists)].sort((a, b) => a.order - b.order);
  }, [state.lists, state.boards, activeBoardId]);

  const openAdd = () => {
    setDraft(d => ({
      ...d,
      listId: boardLists.some(l => l.id === d.listId) ? d.listId : (boardLists[0]?.id || ''),
    }));
    setAdding(true);
  };

  /**
   * Картку створює той самий addCard, що й дошка: проєкт вона бере з
   * activeProjectId, тобто з того, чию діаграму зараз відкрито.
   *
   * Дати необов'язкові — без них задача стає незапланованим рядком, і смужку
   * їй малюють мишею. Одна дата дає одноденну смужку.
   */
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title || !draft.listId) return;
    const start = draft.start || draft.end;
    const end = draft.end || draft.start;
    addCard(draft.listId, title, rangeToFields(start ? rangeFromDrag(start, end) : null));
    // Список і дати лишаємо: підряд додають кілька задач одного етапу.
    setDraft(d => ({ ...d, title: '' }));
  };

  const toggleCollapse = (cardId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId); else next.add(cardId);
      return next;
    });
  };

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, dayIndex(today) * dayWidth - el.clientWidth / 3), behavior: 'smooth' });
  };

  /* ──────────────────────────── відображення ──────────────────────────── */

  const color = project?.color || '#3b82f6';
  const fieldLabel = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1';
  const fieldInput = 'text-sm border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition';
  const tint = (hex: string, alpha: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${alpha}` : hex);

  const topSegments = groupDays(days, 'month');
  const bottomSegments = scale === 'day'
    ? days.map((key, index) => ({ index, span: 1, key }))
    : groupDays(days, 'week');

  const firstSaturday = days.findIndex(d => parseDayKey(d).getUTCDay() === 6);
  const weekendBackground: React.CSSProperties = firstSaturday < 0 ? {} : {
    backgroundImage: `repeating-linear-gradient(to right, #f8fafc 0px, #f8fafc ${dayWidth * 2}px, transparent ${dayWidth * 2}px, transparent ${dayWidth * 7}px)`,
    backgroundPosition: `${(firstSaturday - 7) * dayWidth}px 0`,
  };
  const gridBackground: React.CSSProperties = {
    backgroundImage: `repeating-linear-gradient(to right, transparent 0px, transparent ${dayWidth - 1}px, #eef2f7 ${dayWidth - 1}px, #eef2f7 ${dayWidth}px)`,
  };

  const scheduledCount = rows.filter(r => r.kind === 'card' && (r.range || r.summary)).length;
  const cardRowCount = rows.filter(r => r.kind === 'card').length;
  const projectDeadlineKey = project?.deadline ? rangeOf({ deadline: project.deadline })?.end : null;
  const modalCard = openCardId ? state.cards.find(c => c.id === openCardId) : null;

  if (!project) {
    return (
      <div className="w-full max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <FolderKanban className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Проєкт не вибрано</h3>
        <p className="text-gray-500 mb-6">Оберіть проєкт — і його задачі можна буде розкласти по днях.</p>
        <button
          onClick={() => setActiveView('projects')}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition"
        >
          До проєктів
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto space-y-4 pb-8">
      {/* Шапка */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setActiveView('projects')}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition shrink-0"
            title="До проєктів"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="w-2.5 h-8 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 truncate">
              <CalendarRange className="w-5 h-5 text-blue-600 shrink-0" />
              {project.title}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Заплановано {scheduledCount} з {cardRowCount} задач
              {projectDeadlineKey && ` · дедлайн проєкту ${format(toLocalDate(projectDeadlineKey), 'd MMM yyyy', { locale: uk })}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={scrollToToday}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition flex items-center gap-1.5"
            title="Перемотати до сьогодні"
          >
            <Crosshair className="w-3.5 h-3.5" />
            Сьогодні
          </button>
          <div className="bg-gray-100 p-1 rounded-xl flex">
            {([['day', 'Дні'], ['week', 'Тижні']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setScale(id)}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${
                  scale === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {hasEditRights && (
            <button
              onClick={() => (adding ? setAdding(false) : openAdd())}
              className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition flex items-center gap-1.5 ${
                adding ? 'bg-blue-50 text-blue-700' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
              }`}
              title="Додати задачу в цей проєкт"
            >
              <Plus className="w-4 h-4" />
              Задача
            </button>
          )}
          <button
            onClick={() => setActiveView('board')}
            className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition"
          >
            Дошка задач →
          </button>
        </div>
      </div>

      {/*
        Нову задачу заводять прямо тут: у діаграмі видно, куди вона стає в
        плані, і йти по неї на дошку заради самого лише заголовка не треба.
        Проєкт їй проставляється той, чию діаграму відкрито.
      */}
      {hasEditRights && adding && (
        boardLists.length === 0 ? (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 text-sm text-gray-600 flex flex-wrap items-center gap-2">
            На дошці немає жодного списку — задачу нікуди покласти.
            <button
              onClick={() => setActiveView('board')}
              className="text-blue-600 font-semibold hover:underline"
            >
              Створити список на дошці
            </button>
          </div>
        ) : (
          /*
            noValidate — щоб недописана дата не блокувала кнопку мовчки:
            браузер вважає «08.09.____» невалідним і не пускає submit, а
            користувач бачить лише те, що «Додати» нічого не робить. Для нас
            незаповнена дата — це просто задача без плану.
          */
          <form
            noValidate
            onSubmit={handleCreate}
            className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-wrap items-end gap-3"
          >
            <label className="flex-1 min-w-[240px]">
              <span className={fieldLabel}>Назва задачі</span>
              <input
                autoFocus
                value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                placeholder="Що потрібно зробити?"
                className={`w-full ${fieldInput}`}
              />
            </label>
            <label>
              <span className={fieldLabel}>Список</span>
              <select
                value={draft.listId}
                onChange={e => setDraft(d => ({ ...d, listId: e.target.value }))}
                className={fieldInput}
              >
                {boardLists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            </label>
            <label>
              <span className={fieldLabel}>Початок</span>
              <input
                type="date"
                value={draft.start}
                onChange={e => setDraft(d => ({ ...d, start: e.target.value }))}
                className={fieldInput}
              />
            </label>
            <label>
              <span className={fieldLabel}>Дедлайн</span>
              <input
                type="date"
                value={draft.end}
                onChange={e => setDraft(d => ({ ...d, end: e.target.value }))}
                className={fieldInput}
              />
            </label>
            <button
              type="submit"
              disabled={!draft.title.trim()}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Додати
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              title="Закрити"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="w-full text-[11px] text-gray-400">
              Дати необовʼязкові — без них задача стане рядком без смужки, і план їй можна намалювати мишею.
            </p>
          </form>
        )
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-1">У проєкті ще немає задач</h3>
          <p className="text-gray-500 mb-6">Додайте першу задачу тут або створіть її на дошці — у діаграмі зʼявляться всі задачі проєкту.</p>
          <div className="flex items-center justify-center gap-3">
            {hasEditRights && (
              <button
                onClick={openAdd}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Додати задачу
              </button>
            )}
            <button
              onClick={() => setActiveView('board')}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition"
            >
              До дошки
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/*
            Один скрол на обидві осі: і липкий заголовок шкали, і липка колонка
            назв прив'язані саме до цього контейнера — без обмеження висоти
            заголовок «прилипав» би до сторінки, а не до діаграми.
          */}
          <div ref={scrollRef} className="overflow-auto max-h-[calc(100vh-260px)]">
            <div style={{ width: LEFT_PANE + gridWidth }} className="select-none">

              {/* Заголовок шкали */}
              <div className="flex sticky top-0 z-20 bg-white border-b border-gray-200">
                <div
                  className="sticky left-0 z-10 bg-white shrink-0 border-r border-gray-200 px-4 flex items-end pb-1.5"
                  style={{ width: LEFT_PANE, height: 50 }}
                >
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Задача</span>
                </div>
                <div style={{ width: gridWidth }}>
                  <div className="flex h-[26px] items-center">
                    {topSegments.map(seg => (
                      <div
                        key={seg.key}
                        className="text-[11px] font-semibold text-gray-500 border-r border-gray-100 h-full flex items-center px-2 overflow-hidden whitespace-nowrap"
                        style={{ width: seg.span * dayWidth }}
                      >
                        {format(toLocalDate(seg.key), 'LLLL yyyy', { locale: uk })}
                      </div>
                    ))}
                  </div>
                  <div className="flex h-6">
                    {bottomSegments.map(seg => {
                      const isToday = scale === 'day' && seg.key === today;
                      return (
                        <div
                          key={seg.key}
                          className={`text-[10px] flex items-center justify-center border-r border-gray-100 ${
                            isToday ? 'bg-red-500 text-white font-bold rounded-t' :
                            isWeekend(seg.key) ? 'text-gray-300 bg-gray-50' : 'text-gray-400'
                          }`}
                          style={{ width: seg.span * dayWidth }}
                        >
                          {format(toLocalDate(seg.key), 'd')}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Рядки */}
              {rows.map(row => {
                const isDragging = drag?.row.key === row.key;
                const ownRange = isDragging && drag && !drag.shiftChildren ? drag.preview : row.range;
                const summaryRange = isDragging && drag?.shiftChildren ? drag.preview : row.summary;
                const bar = ownRange || summaryRange;
                const isSummary = !ownRange && !!summaryRange;
                const overdue = bar ? isOverdue(bar, today, row.completed) : false;

                return (
                  <div
                    key={row.key}
                    className="flex group border-b border-gray-50 hover:bg-blue-50/30 transition-colors"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {/* Ліва колонка */}
                    <div
                      className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/60 shrink-0 border-r border-gray-200 flex items-center gap-1.5 pr-2 transition-colors"
                      style={{ width: LEFT_PANE, paddingLeft: row.kind === 'subtask' ? 30 : 10 }}
                    >
                      {row.kind === 'card' ? (
                        row.hasChildren ? (
                          <button
                            onClick={() => toggleCollapse(row.cardId)}
                            className="p-0.5 text-gray-400 hover:text-gray-700 shrink-0"
                            title={row.collapsed ? 'Показати підзадачі' : 'Згорнути підзадачі'}
                          >
                            {row.collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        ) : <span className="w-4 shrink-0" />
                      ) : (
                        <CornerDownRight className="w-3 h-3 text-gray-300 shrink-0" />
                      )}

                      {row.completed
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        : <Circle className="w-3.5 h-3.5 text-gray-300 shrink-0" />}

                      <button
                        onClick={() => setOpenCardId(row.cardId)}
                        title={row.title}
                        className={`flex-1 min-w-0 text-left truncate transition hover:text-blue-700 ${
                          row.kind === 'card' ? 'text-[13px] font-medium text-gray-800' : 'text-xs text-gray-600'
                        } ${row.completed ? 'line-through text-gray-400' : ''}`}
                      >
                        {row.title}
                      </button>

                      {hasEditRights && row.range && (
                        <button
                          onClick={() => clearSchedule(row)}
                          className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500 shrink-0 p-0.5"
                          title="Зняти з плану (очистити дати)"
                        >
                          <Eraser className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Доріжка */}
                    <div
                      className="relative"
                      style={{ width: gridWidth, ...gridBackground, ...weekendBackground }}
                      onMouseDown={e => startDraw(e, row)}
                    >
                      {/* Сьогодні */}
                      <div
                        className="absolute top-0 bottom-0 w-px bg-red-400/70 pointer-events-none"
                        style={{ left: dayIndex(today) * dayWidth + dayWidth / 2 }}
                      />
                      {/* Дедлайн проєкту */}
                      {projectDeadlineKey && (
                        <div
                          className="absolute top-0 bottom-0 w-px pointer-events-none"
                          style={{
                            left: dayIndex(projectDeadlineKey) * dayWidth + dayWidth / 2,
                            backgroundImage: 'linear-gradient(to bottom, #a855f7 60%, transparent 60%)',
                            backgroundSize: '1px 6px',
                          }}
                        />
                      )}

                      {bar ? (
                        <div
                          className={`absolute top-1.5 rounded-md flex items-center overflow-hidden ${
                            isSummary ? 'h-3 mt-1' : 'h-[22px]'
                          } ${hasEditRights ? 'cursor-grab active:cursor-grabbing' : ''} ${
                            isDragging ? 'ring-2 ring-blue-400 shadow-md z-10' : ''
                          } ${overdue ? 'ring-1 ring-red-400' : ''}`}
                          style={{
                            left: dayIndex(bar.start) * dayWidth + 1,
                            width: Math.max(rangeLength(bar) * dayWidth - 2, 6),
                            backgroundColor: row.completed ? '#dcfce7' : tint(color, isSummary ? '55' : '2e'),
                          }}
                          title={`${row.title}\n${format(toLocalDate(bar.start), 'd MMM', { locale: uk })} — ${format(toLocalDate(bar.end), 'd MMM yyyy', { locale: uk })} · ${rangeLength(bar)} дн.`}
                          onMouseDown={e => startBarDrag(e, row, 'move', bar, isSummary)}
                          onDoubleClick={() => setOpenCardId(row.cardId)}
                        >
                          {/* Виконана частина */}
                          <div
                            className="absolute inset-y-0 left-0 pointer-events-none"
                            style={{
                              width: `${Math.round(row.progress * 100)}%`,
                              backgroundColor: row.completed ? '#22c55e' : color,
                              opacity: isSummary ? 0.9 : 0.85,
                            }}
                          />
                          {!isSummary && (
                            <span className="relative px-2 text-[11px] font-medium text-gray-800 truncate pointer-events-none">
                              {rangeLength(bar) * dayWidth > 64 ? row.title : ''}
                            </span>
                          )}

                          {/* Краї для розтягування — у зведеної смужки їх немає:
                              її межі задають підзадачі, а не сама картка. */}
                          {hasEditRights && !isSummary && (
                            <>
                              <span
                                onMouseDown={e => startBarDrag(e, row, 'start', bar, false)}
                                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-black/20 rounded-l-md"
                              />
                              <span
                                onMouseDown={e => startBarDrag(e, row, 'end', bar, false)}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-black/20 rounded-r-md"
                              />
                            </>
                          )}
                        </div>
                      ) : hasEditRights && (
                        <span className="absolute inset-y-0 left-2 flex items-center text-[11px] text-gray-300 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                          протягніть, щоб запланувати
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Легенда */}
          <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-2.5 rounded" style={{ backgroundColor: color }} />
              виконано
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-2.5 rounded" style={{ backgroundColor: tint(color, '2e') }} />
              заплановано
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-1.5 rounded" style={{ backgroundColor: tint(color, '55') }} />
              зведення за підзадачами
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-px h-3 bg-red-400" />
              сьогодні
            </span>
            {projectDeadlineKey && (
              <span className="flex items-center gap-1.5">
                <span className="w-px h-3 bg-purple-500" />
                дедлайн проєкту
              </span>
            )}
            <span className="ml-auto">
              Тягніть смужку — зсув, за край — тривалість, подвійний клік — картка
            </span>
          </div>
        </div>
      )}

      {modalCard && <CardModal card={modalCard} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}

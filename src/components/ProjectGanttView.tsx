import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../App';
import { Card, Phase, Subtask } from '../types';
import CardModal from './CardModal';
import {
  ArrowLeft, CalendarRange, ChevronDown, ChevronRight, CheckCircle2, Circle,
  CornerDownRight, Crosshair, Eraser, FolderKanban, GripVertical, Layers, Plus, Trash2, X,
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

/**
 * Аватар виконавця. Аватарки може не бути — тоді кружечок з ініціалами, як на
 * дошці: порожнє місце в цьому рядку читалось би як «нікого не призначено».
 */
function AssigneeDot({ user, title }: { user: { name: string; avatar?: string }; title: string }) {
  const common = 'w-[18px] h-[18px] rounded-full shrink-0 ring-1 ring-white/80 shadow-sm';
  if (user.avatar) {
    return <img src={user.avatar} alt={user.name} title={title} className={`${common} object-cover`} />;
  }
  return (
    <div title={title} className={`${common} bg-amber-400 text-white text-[8px] font-bold flex items-center justify-center`}>
      {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
    </div>
  );
}

const LEFT_PANE = 268;
const ROW_HEIGHT = 34;
const DAY_WIDTH = { day: 34, week: 13 } as const;

type Scale = keyof typeof DAY_WIDTH;

interface Row {
  key: string;
  kind: 'phase' | 'card' | 'subtask';
  /** У рядка етапу — його власний id; у задачі — етап, у якому вона лежить */
  phaseId?: string | null;
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
  /** Скільки задач в етапі — показуємо поруч із назвою */
  childCount?: number;
}

/** Рядок етапу разом із його задачами: етапи — це групи рядків. */
interface RowGroup {
  /** null — псевдоетап «Без етапу» */
  phase: Phase | null;
  key: string;
  rows: Row[];
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

/**
 * Перетягування задачі між етапами.
 *
 * Це окремий жест, а не той самий, що рухає смужки: там тягнуть дати вздовж
 * шкали, а тут — саму задачу впоперек, з групи в групу. Ціль визначаємо
 * попаданням курсора в прямокутник групи, а не наведенням на рядок: між
 * рядками є проміжки, і на них ціль губилася б.
 */
interface RowDrag {
  cardId: string;
  title: string;
  fromPhaseId: string | null;
  x: number;
  y: number;
  /** undefined — курсор поза будь-якою групою */
  overKey: string | undefined;
}

const PHASE_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6'];
const NO_PHASE = '__none__';

export default function ProjectGanttView() {
  const {
    state, activeProjectId, activeBoardId, setActiveView, updateCard, addCard,
    addPhase, updatePhase, deletePhase, confirmAction, hasEditRights,
  } = useAppContext();

  const project = (state.projects || []).find(p => p.id === activeProjectId) || null;
  const [scale, setScale] = useState<Scale>('day');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', listId: '', start: '', end: '', phaseId: '' });
  const [rowDrag, setRowDrag] = useState<RowDrag | null>(null);
  const [renamingPhaseId, setRenamingPhaseId] = useState<string | null>(null);

  const dayWidth = DAY_WIDTH[scale];
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = todayKey();

  const cards = useMemo(
    () => state.cards.filter(c => c.projectId === activeProjectId),
    [state.cards, activeProjectId],
  );

  const phases = useMemo<Phase[]>(
    () => (state.phases || []).filter(ph => ph.projectId === activeProjectId),
    [state.phases, activeProjectId],
  );

  /** Охоплення задачі: власні дати або, якщо їх немає, дати підзадач. */
  const cardSpan = (card: Card) => rangeOf(card) || spanOf((card.subtasks || []).map(rangeOf));

  /** Рядки діаграми, зібрані в групи-етапи. */
  const groups = useMemo<RowGroup[]>(() => {
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
    const comparePlan = (ra: DayRange | null, rb: DayRange | null, oa: number, ob: number) => {
      if (ra && rb) return ra.start.localeCompare(rb.start) || oa - ob;
      if (ra) return -1;
      if (rb) return 1;
      return oa - ob;
    };

    const ordered = [...cards].sort((a, b) => comparePlan(cardSpan(a), cardSpan(b), a.order, b.order));

    // Задачі етапу, який хтось видалив на іншій вкладці, не мають зникнути з
    // очей: посилання в нікуди читаємо як «без етапу».
    const known = new Set(phases.map(ph => ph.id));
    const inPhase = (id: string) => ordered.filter(c => c.phaseId === id);
    const loose = ordered.filter(c => !c.phaseId || !known.has(c.phaseId));

    const phaseGroup = (phase: Phase): RowGroup => {
      const own = inPhase(phase.id);
      const span = spanOf(own.map(cardSpan));
      const done = own.filter(c => c.isCompleted).length;
      const isCollapsed = collapsed.has(phase.id);
      const phaseRow: Row = {
        key: `phase:${phase.id}`,
        kind: 'phase',
        phaseId: phase.id,
        cardId: '',
        title: phase.title,
        completed: own.length > 0 && done === own.length,
        range: null,
        // Етап не має власних дат — його смужка це охоплення задач
        summary: span,
        progress: own.length ? done / own.length : 0,
        hasChildren: own.length > 0,
        collapsed: isCollapsed,
        childCount: own.length,
      };
      return {
        phase,
        key: phase.id,
        rows: isCollapsed ? [phaseRow] : [phaseRow, ...own.flatMap(build)],
      };
    };

    // Етапи шикуються так само, як задачі: за початком у часі. Так порядок
    // рядків збігається з порядком смужок, і читати діаграму можна згори вниз.
    const phaseGroups = [...phases]
      .sort((a, b) => comparePlan(
        spanOf(inPhase(a.id).map(cardSpan)),
        spanOf(inPhase(b.id).map(cardSpan)),
        a.order, b.order,
      ))
      .map(phaseGroup);

    const looseRows = loose.flatMap(build);

    // Поки етапів немає, діаграма лишається пласким списком, як була: окремий
    // заголовок «Без етапу» над усіма задачами був би шумом.
    if (phaseGroups.length === 0) {
      return [{ phase: null, key: NO_PHASE, rows: looseRows }];
    }

    const looseSpan = spanOf(loose.map(cardSpan));
    const looseHeader: Row = {
      key: `phase:${NO_PHASE}`,
      kind: 'phase',
      phaseId: null,
      cardId: '',
      title: 'Без етапу',
      completed: false,
      range: null,
      summary: looseSpan,
      progress: 0,
      hasChildren: loose.length > 0,
      collapsed: collapsed.has(NO_PHASE),
      childCount: loose.length,
    };

    return [
      ...phaseGroups,
      {
        phase: null,
        key: NO_PHASE,
        rows: collapsed.has(NO_PHASE) ? [looseHeader] : [looseHeader, ...looseRows],
      },
    ];
  }, [cards, phases, collapsed]);

  const rows = useMemo(() => groups.flatMap(g => g.rows), [groups]);

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

    if (row.kind === 'phase') {
      // Етап не має власних дат, тож «перенести етап» означає перенести все,
      // що в ньому лежить, на однакову кількість днів — і задачі, і їхні
      // підзадачі. Незаплановане лишається незапланованим: вигадувати йому
      // дати через сусідів по етапу не можна.
      const delta = base ? diffDays(base.start, preview.start) : 0;
      if (!delta) return;
      state.cards
        .filter(c => c.projectId === activeProjectId && (c.phaseId || null) === (row.phaseId || null))
        .forEach(c => {
          const own = rangeOf(c);
          const subtasks = c.subtasks || [];
          const shifted = shiftSchedulables(subtasks, delta);
          // shiftSchedulables лишає незаплановані пункти тими самими об'єктами,
          // тож порівняння за посиланням і каже, чи справді щось зрушило.
          const movedSubtasks = shifted.some((st, i) => st !== subtasks[i]);
          // Задача без дат у цьому етапі просто не має чого рухати — писати їй
          // порожнє оновлення означало б зайвий запит на кожне тягання етапу.
          if (!own && !movedSubtasks) return;
          updateCard(c.id, {
            ...(own ? rangeToFields(shiftRange(own, delta)) : {}),
            ...(movedSubtasks ? { subtasks: shifted } : {}),
          });
        });
      return;
    }

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

  /* ────────────────── перетягування задачі між етапами ────────────────── */

  /**
   * Прямокутники груп тримаємо в ref, а не рахуємо на кожен рух: під час жесту
   * розмітка не міняється, а getBoundingClientRect у mousemove — найдорожче,
   * що тут може бути.
   */
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rowDragRef = useRef<RowDrag | null>(null);
  const stopRowDrag = useRef<() => void>(() => {});
  useEffect(() => () => stopRowDrag.current(), []);

  const beginRowDrag = (e: React.MouseEvent, row: Row) => {
    if (!hasEditRights || row.kind !== 'card') return;
    e.preventDefault();
    e.stopPropagation();

    const rects = Object.entries(groupRefs.current)
      .filter(([, el]) => el)
      .map(([key, el]) => ({ key, rect: (el as HTMLDivElement).getBoundingClientRect() }));
    const keyAt = (y: number) => rects.find(r => y >= r.rect.top && y <= r.rect.bottom)?.key;

    const initial: RowDrag = {
      cardId: row.cardId,
      title: row.title,
      fromPhaseId: row.phaseId || null,
      x: e.clientX,
      y: e.clientY,
      overKey: keyAt(e.clientY),
    };
    rowDragRef.current = initial;
    setRowDrag(initial);

    const onMove = (ev: MouseEvent) => {
      const current = rowDragRef.current;
      if (!current) return;
      const next = { ...current, x: ev.clientX, y: ev.clientY, overKey: keyAt(ev.clientY) };
      rowDragRef.current = next;
      setRowDrag(next);
    };

    const onUp = () => {
      detach();
      const current = rowDragRef.current;
      rowDragRef.current = null;
      setRowDrag(null);
      if (!current?.overKey) return;
      const target = current.overKey === NO_PHASE ? null : current.overKey;
      if (target === current.fromPhaseId) return;
      updateCard(current.cardId, { phaseId: target });
    };

    const detach = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      stopRowDrag.current = () => {};
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    stopRowDrag.current = detach;
  };

  /* ──────────────────────────── етапи ──────────────────────────── */

  const createPhase = () => {
    if (!activeProjectId) return;
    const phase = {
      projectId: activeProjectId,
      title: `Етап ${phases.length + 1}`,
      color: PHASE_COLORS[phases.length % PHASE_COLORS.length],
      order: phases.length,
    };
    // Назву одразу дають свою — «Етап 3» це заготовка, а не назва. Тому
    // addPhase віддає створений етап: інакше поле для перейменування не було б
    // до чого прив'язати.
    setRenamingPhaseId(addPhase(phase).id);
  };

  const removePhase = (phase: Phase, taskCount: number) => {
    confirmAction(
      taskCount > 0
        ? `Видалити етап «${phase.title}»? ${taskCount} задач(і) лишаться на місці й повернуться в «Без етапу».`
        : `Видалити етап «${phase.title}»?`,
      () => deletePhase(phase.id),
    );
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
    addCard(draft.listId, title, {
      ...rangeToFields(start ? rangeFromDrag(start, end) : null),
      phaseId: draft.phaseId || null,
    });
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
              onClick={createPhase}
              className="px-3 py-1.5 text-sm font-semibold rounded-lg transition flex items-center gap-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200"
              title="Додати етап — блок задач, який планують і рухають цілком"
            >
              <Layers className="w-4 h-4" />
              Етап
            </button>
          )}
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
            {phases.length > 0 && (
              <label>
                <span className={fieldLabel}>Етап</span>
                <select
                  value={draft.phaseId}
                  onChange={e => setDraft(d => ({ ...d, phaseId: e.target.value }))}
                  className={fieldInput}
                >
                  <option value="">Без етапу</option>
                  {phases.map(ph => <option key={ph.id} value={ph.id}>{ph.title}</option>)}
                </select>
              </label>
            )}
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

              {/*
                Рядки, зібрані в групи-етапи. Група — це і рамка на екрані, і
                ціль для перетягування: задачу кидають у прямокутник групи, а
                не в конкретний рядок.
              */}
              {groups.map(group => (
                <div
                  key={group.key}
                  ref={el => { groupRefs.current[group.key] = el; }}
                  className={`transition-colors ${
                    rowDrag && rowDrag.overKey === group.key && (rowDrag.fromPhaseId || NO_PHASE) !== group.key
                      ? 'bg-blue-50/70 ring-2 ring-inset ring-blue-300'
                      : ''
                  }`}
                >
              {group.rows.map(row => {
                const isPhase = row.kind === 'phase';
                const phaseColor = row.phaseId
                  ? (phases.find(ph => ph.id === row.phaseId)?.color || color)
                  : '#94a3b8';
                const isDragging = drag?.row.key === row.key;
                const ownRange = isDragging && drag && !drag.shiftChildren ? drag.preview : row.range;
                const summaryRange = isDragging && drag?.shiftChildren ? drag.preview : row.summary;
                const bar = ownRange || summaryRange;
                const isSummary = !ownRange && !!summaryRange;
                const overdue = bar ? isOverdue(bar, today, row.completed) : false;
                const assignee = row.assigneeId
                  ? state.users.find(u => u.id === row.assigneeId)
                  : undefined;
                const barLeft = bar ? dayIndex(bar.start) * dayWidth + 1 : 0;
                const barWidth = bar ? Math.max(rangeLength(bar) * dayWidth - 2, 6) : 0;
                // На вузькій смужці аватар з'їв би її всю — одноденна задача
                // просто зникла б під кружечком, — а на зведеній не поміститься
                // по висоті. У таких випадках ставимо його поруч, за смужкою.
                const dotInsideBar = !isSummary && barWidth >= 56;

                return (
                  <div
                    key={row.key}
                    className={`flex group border-b transition-colors ${
                      isPhase
                        ? 'border-gray-200 bg-gray-50/80 hover:bg-gray-100/80'
                        : 'border-gray-50 hover:bg-blue-50/30'
                    } ${rowDrag?.cardId === row.cardId && !isPhase ? 'opacity-40' : ''}`}
                    style={{ height: ROW_HEIGHT }}
                  >
                    {/* Ліва колонка */}
                    <div
                      className={`sticky left-0 z-10 shrink-0 border-r border-gray-200 flex items-center gap-1.5 pr-2 transition-colors ${
                        isPhase ? 'bg-gray-50 group-hover:bg-gray-100' : 'bg-white group-hover:bg-blue-50/60'
                      }`}
                      style={{
                        width: LEFT_PANE,
                        paddingLeft: row.kind === 'subtask' ? 34 : row.kind === 'card' ? 20 : 8,
                      }}
                    >
                      {isPhase ? (
                        <>
                          <button
                            onClick={() => toggleCollapse(row.phaseId || NO_PHASE)}
                            className="p-0.5 text-gray-400 hover:text-gray-700 shrink-0"
                            title={row.collapsed ? 'Показати задачі етапу' : 'Згорнути етап'}
                          >
                            {row.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          <span className="w-2 h-4 rounded-sm shrink-0" style={{ backgroundColor: phaseColor }} />

                          {/* Псевдоетап «Без етапу» перейменовувати нема чого, а
                              null === null зробив би його полем вводу одразу */}
                          {row.phaseId && renamingPhaseId === row.phaseId ? (
                            <input
                              autoFocus
                              defaultValue={row.title}
                              onBlur={e => {
                                const next = e.target.value.trim();
                                if (next && next !== row.title) updatePhase(row.phaseId as string, { title: next });
                                setRenamingPhaseId(null);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                if (e.key === 'Escape') { setRenamingPhaseId(null); }
                              }}
                              className="flex-1 min-w-0 text-[13px] font-bold text-gray-900 bg-white border border-blue-400 rounded px-1.5 py-0.5 outline-none"
                            />
                          ) : (
                            <button
                              onClick={() => row.phaseId && hasEditRights && setRenamingPhaseId(row.phaseId)}
                              title={row.phaseId ? 'Перейменувати етап' : 'Задачі, які ще не рознесли по етапах'}
                              className={`flex-1 min-w-0 text-left truncate text-[13px] font-bold uppercase tracking-wide ${
                                row.phaseId ? 'text-gray-800 hover:text-blue-700' : 'text-gray-400'
                              }`}
                            >
                              {row.title}
                            </button>
                          )}

                          <span className="text-[11px] text-gray-400 shrink-0 tabular-nums">{row.childCount}</span>

                          {hasEditRights && row.phaseId && (
                            <button
                              onClick={() => {
                                const phase = phases.find(ph => ph.id === row.phaseId);
                                if (phase) removePhase(phase, row.childCount || 0);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500 shrink-0 p-0.5"
                              title="Видалити етап"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      ) : (
                      <>
                      {/* Ручка перетягування: задачу переносять між етапами саме
                          за неї, щоб не сплутати з кліком по назві */}
                      {hasEditRights && row.kind === 'card' && groups.length > 1 && (
                        <span
                          onMouseDown={e => beginRowDrag(e, row)}
                          className="absolute left-1 opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing"
                          title="Перетягніть в інший етап"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </span>
                      )}
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
                      </>
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
                            isPhase ? 'h-[18px] mt-0.5 shadow-sm' : isSummary ? 'h-3 mt-1' : 'h-[22px]'
                          } ${hasEditRights ? 'cursor-grab active:cursor-grabbing' : ''} ${
                            isDragging ? 'ring-2 ring-blue-400 shadow-md z-10' : ''
                          } ${overdue ? 'ring-1 ring-red-400' : ''}`}
                          style={{
                            left: barLeft,
                            width: barWidth,
                            backgroundColor: isPhase
                              ? tint(phaseColor, '33')
                              : row.completed ? '#dcfce7' : tint(color, isSummary ? '55' : '2e'),
                          }}
                          title={`${row.title}\n${format(toLocalDate(bar.start), 'd MMM', { locale: uk })} — ${format(toLocalDate(bar.end), 'd MMM yyyy', { locale: uk })} · ${rangeLength(bar)} дн.${assignee ? `\n${assignee.name}` : ''}`}
                          onMouseDown={e => startBarDrag(e, row, 'move', bar, isSummary)}
                          onDoubleClick={() => setOpenCardId(row.cardId)}
                        >
                          {/* Виконана частина */}
                          <div
                            className="absolute inset-y-0 left-0 pointer-events-none"
                            style={{
                              width: `${Math.round(row.progress * 100)}%`,
                              backgroundColor: isPhase ? phaseColor : row.completed ? '#22c55e' : color,
                              opacity: isSummary && !isPhase ? 0.9 : 0.85,
                            }}
                          />
                          {(!isSummary || isPhase) && (
                            <span className={`relative px-2 truncate pointer-events-none ${
                              isPhase ? 'text-[10px] font-bold uppercase tracking-wide text-gray-700' : 'text-[11px] font-medium text-gray-800'
                            }`}>
                              {rangeLength(bar) * dayWidth > 64 ? row.title : ''}
                            </span>
                          )}
                          {assignee && dotInsideBar && (
                            <span className="relative ml-auto mr-1 flex items-center pointer-events-none">
                              <AssigneeDot user={assignee} title={`Виконавець: ${assignee.name}`} />
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
                      ) : isPhase ? (
                        <span className="absolute inset-y-0 left-2 flex items-center text-[11px] text-gray-300 pointer-events-none">
                          {row.childCount ? 'задачі етапу ще без дат' : 'перетягніть сюди задачі'}
                        </span>
                      ) : hasEditRights && (
                        <span
                          className="absolute inset-y-0 flex items-center text-[11px] text-gray-300 opacity-0 group-hover:opacity-100 transition pointer-events-none"
                          style={{ left: assignee ? 30 : 8 }}
                        >
                          протягніть, щоб запланувати
                        </span>
                      )}

                      {/*
                        Аватар поза смужкою. Вузька смужка сховала б його під
                        себе, у зведеної не вистачає висоти, а незапланована
                        задача смужки не має взагалі — але виконавець у неї є,
                        і саме таку задачу найчастіше й шукають очима.
                      */}
                      {assignee && !dotInsideBar && (
                        <span
                          className="absolute top-0 bottom-0 flex items-center pointer-events-none"
                          style={{ left: bar ? barLeft + barWidth + 4 : 6 }}
                        >
                          <AssigneeDot user={assignee} title={`Виконавець: ${assignee.name}`} />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
                </div>
              ))}
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
            {phases.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-2 rounded" style={{ backgroundColor: tint(PHASE_COLORS[0], '33') }} />
                етап
              </span>
            )}
            <span className="ml-auto">
              Тягніть смужку — зсув, за край — тривалість, подвійний клік — картка
              {phases.length > 0 && '; задачу за ⣿ — в інший етап'}
            </span>
          </div>
        </div>
      )}

      {/*
        Примара під курсором. Сам рядок лишається на місці (лише блідне): у
        діаграмі рядок — це ще й смужка на шкалі, і виривати його з розмітки
        означало б смикати всю сітку на кожен рух миші.
      */}
      {rowDrag && (
        <div
          className="fixed z-50 pointer-events-none px-2.5 py-1 rounded-lg bg-gray-900 text-white text-xs font-medium shadow-lg max-w-[240px] truncate"
          style={{ left: rowDrag.x + 14, top: rowDrag.y + 10 }}
        >
          {rowDrag.title}
        </div>
      )}

      {modalCard && <CardModal card={modalCard} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { useAppContext } from '../App';
import { Card } from '../types';
import CardModal from './CardModal';
import {
  ChevronLeft, ChevronRight, CalendarRange, AlertTriangle, Eye, EyeOff,
  CircleDot, Info,
} from 'lucide-react';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import {
  addDays, dayKeysBetween, diffDays, groupDays, isOverdue, isWeekend,
  parseDayKey, rangeLength, toLocalDate, todayKey,
} from '../lib/gantt';
import {
  toWorkloadTasks, dailyLoad, summarize, overlapsWith, loadLevel,
  formatMinutes, durationLabel, DEFAULT_DAILY_CAPACITY_MINUTES,
  WorkloadTask, LoadLevel,
} from '../lib/workload';
import { pluralUk, tasksWord, daysWord } from '../lib/plural';

/**
 * Навантаження працівника по днях.
 *
 * Регламент відповідає на питання «як влаштований типовий тиждень», а це — на
 * питання «що насправді лежить на людині цього тижня». Тому діаграма живе
 * поруч із регламентом, а не в проєктах: планують навантаження на людину, а
 * дивляться при цьому на її ж графік.
 *
 * Арифметика днів — у lib/gantt, вага днів — у lib/workload. Тут лишається
 * вибір періоду й малювання.
 */

const LEFT_PANE = 220;
const ROW_HEIGHT = 32;

/** Скільки днів у вікні та якої ширини день — щоб тиждень читався, а місяць влазив */
const PERIODS = {
  week: { label: 'Тиждень', days: 7, dayWidth: 72 },
  fortnight: { label: '2 тижні', days: 14, dayWidth: 46 },
  month: { label: 'Місяць', days: 28, dayWidth: 30 },
} as const;

type PeriodKey = keyof typeof PERIODS;

/** Кольори ваги дня — одна шкала для смужки навантаження й для підсумку */
const LEVEL_STYLE: Record<LoadLevel, { bar: string; text: string; cell: string }> = {
  free: { bar: 'bg-gray-200', text: 'text-gray-400', cell: '' },
  ok: { bar: 'bg-emerald-400', text: 'text-emerald-700', cell: '' },
  tight: { bar: 'bg-amber-400', text: 'text-amber-700', cell: 'bg-amber-50/60' },
  over: { bar: 'bg-red-500', text: 'text-red-700', cell: 'bg-red-50/70' },
};

/** Понеділок тижня, в який потрапляє день */
function weekStartOf(key: string): string {
  const weekday = parseDayKey(key).getUTCDay(); // 0=Нд
  return addDays(key, weekday === 0 ? -6 : 1 - weekday);
}

export default function UserWorkloadGantt({ userId }: { userId: string }) {
  const { state, setOpenCardId } = useAppContext();
  const today = todayKey();

  const [period, setPeriod] = useState<PeriodKey>('week');
  const [anchor, setAnchor] = useState<string>(() => weekStartOf(today));
  const [showCompleted, setShowCompleted] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [modalCard, setModalCard] = useState<Card | null>(null);

  const { days, dayWidth } = useMemo(() => {
    const { days: count, dayWidth } = PERIODS[period];
    return { days: dayKeysBetween(anchor, addDays(anchor, count - 1)), dayWidth };
  }, [period, anchor]);

  const windowStart = days[0];
  const windowEnd = days[days.length - 1];

  /**
   * Задачі людини.
   *
   * Списки, яких уже немає, лишають по собі картки-привиди — на дошці їх не
   * видно, і в навантаження вони теж не мають потрапляти.
   */
  const allTasks = useMemo(() => {
    const validListIds = new Set((state.lists || []).map(l => l.id));
    const cards = (state.cards || []).filter(c =>
      c.assigneeId === userId && validListIds.has(c.listId),
    );
    return toWorkloadTasks(cards);
  }, [state.cards, state.lists, userId]);

  const visibleTasks = useMemo(
    () => (showCompleted ? allTasks : allTasks.filter(t => !t.isCompleted)),
    [allTasks, showCompleted],
  );

  /** Те, що видно у вікні; решта лише рахується, щоб список не здавався повним */
  const tasksInWindow = useMemo(
    () => visibleTasks.filter(t => t.range.start <= windowEnd && t.range.end >= windowStart),
    [visibleTasks, windowStart, windowEnd],
  );
  const outsideCount = visibleTasks.length - tasksInWindow.length;

  /** Скільки задач узагалі не мають дат — на діаграмі їх немає за визначенням */
  const undatedCount = useMemo(() => {
    const validListIds = new Set((state.lists || []).map(l => l.id));
    return (state.cards || []).filter(c =>
      c.assigneeId === userId && validListIds.has(c.listId) &&
      !c.startDate && !c.deadline && (showCompleted || !c.isCompleted),
    ).length;
  }, [state.cards, state.lists, userId, showCompleted]);

  const loads = useMemo(() => dailyLoad(tasksInWindow, days), [tasksInWindow, days]);
  const summary = useMemo(() => summarize(tasksInWindow, loads), [tasksInWindow, loads]);

  const highlighted = useMemo(() => {
    if (!hoveredId) return new Set<string>();
    const task = tasksInWindow.find(t => t.id === hoveredId);
    if (!task) return new Set<string>();
    return new Set(overlapsWith(task, tasksInWindow).map(t => t.id));
  }, [hoveredId, tasksInWindow]);

  const monthSegments = useMemo(() => groupDays(days, 'month'), [days]);
  const gridWidth = days.length * dayWidth;
  const dayIndex = (key: string) => diffDays(windowStart, key);

  const shift = (direction: 1 | -1) => setAnchor(addDays(anchor, direction * PERIODS[period].days));
  const openCard = (taskId: string) => {
    const card = (state.cards || []).find(c => c.id === taskId);
    if (card) { setModalCard(card); setOpenCardId(card.id); }
  };

  const peakLabel = summary.peakDay
    ? `${format(toLocalDate(summary.peakDay.key), 'EEEE, d MMM', { locale: uk })} — ${formatMinutes(summary.peakDay.minutes)}, ${summary.peakDay.tasks} ${tasksWord(summary.peakDay.tasks)}`
    : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Панель керування ─────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-3 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition" title="Назад">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setAnchor(weekStartOf(today))}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            Сьогодні
          </button>
          <button onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition" title="Вперед">
            <ChevronRight className="w-5 h-5" />
          </button>
          <span className="text-sm text-gray-400 ml-1">
            {format(toLocalDate(windowStart), 'd MMM', { locale: uk })} — {format(toLocalDate(windowEnd), 'd MMM', { locale: uk })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCompleted(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
              showCompleted
                ? 'bg-gray-100 text-gray-700 border-gray-200'
                : 'bg-white text-gray-500 border-gray-200 hover:text-gray-700'
            }`}
            title="Виконані задачі"
          >
            {showCompleted ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            Виконані
          </button>
          <div className="flex items-center bg-gray-100/80 rounded-lg p-1 border border-gray-200/50">
            {(Object.keys(PERIODS) as PeriodKey[]).map(key => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                  period === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {PERIODS[key].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Підсумок періоду ─────────────────────────────────── */}
      {/* Порожній підсумок нічого не додає: «— у 0 задачах» лише повторює
          заглушку нижче іншими словами */}
      {tasksInWindow.length > 0 && (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-3 shrink-0 text-xs">
        <span className="text-gray-600">
          Заплановано <b className="text-gray-900">{formatMinutes(summary.totalMinutes)}</b>
          <span className="text-gray-400"> у {tasksInWindow.length} {pluralUk(tasksInWindow.length, 'задачі', 'задачах', 'задачах')}</span>
        </span>
        {peakLabel && (
          <span className="text-gray-600">
            Найважчий день: <b className={LEVEL_STYLE[loadLevel(summary.peakDay!.minutes)].text}>{peakLabel}</b>
          </span>
        )}
        {summary.maxConcurrent > 1 && (
          <span className="flex items-center gap-1 text-gray-600">
            <CircleDot className="w-3.5 h-3.5 text-blue-500" />
            До <b className="text-gray-900">{summary.maxConcurrent}</b> {tasksWord(summary.maxConcurrent)} одночасно
          </span>
        )}
        {summary.overloadedDays > 0 && (
          <span className="flex items-center gap-1 text-red-600 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            {summary.overloadedDays} {daysWord(summary.overloadedDays)} понад норму
          </span>
        )}
      </div>
      )}

      {/* ── Діаграма ─────────────────────────────────────────── */}
      <div className="border border-gray-200/60 rounded-xl bg-white shadow-sm flex-1 min-h-0 overflow-auto hidden-scrollbar">
        <div style={{ width: LEFT_PANE + gridWidth }} className="select-none">

          {/* Заголовок шкали */}
          <div className="flex sticky top-0 z-20 bg-white border-b border-gray-200">
            <div
              className="sticky left-0 z-10 bg-white shrink-0 border-r border-gray-200 px-4 flex items-end pb-1.5"
              style={{ width: LEFT_PANE, height: 48 }}
            >
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Задача</span>
            </div>
            <div style={{ width: gridWidth }}>
              <div className="flex h-[24px] items-center">
                {monthSegments.map(seg => (
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
                {days.map(key => {
                  const isToday = key === today;
                  return (
                    <div
                      key={key}
                      className={`text-[10px] flex items-center justify-center gap-1 border-r border-gray-100 ${
                        isToday ? 'bg-red-500 text-white font-bold rounded-t'
                          : isWeekend(key) ? 'text-gray-300 bg-gray-50' : 'text-gray-400'
                      }`}
                      style={{ width: dayWidth }}
                    >
                      {dayWidth >= 46 && (
                        <span className="uppercase">{format(toLocalDate(key), 'EEEEEE', { locale: uk })}</span>
                      )}
                      <span>{format(toLocalDate(key), 'd')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Рядки задач */}
          {tasksInWindow.length === 0 ? (
            <div className="py-14 text-center">
              <CalendarRange className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500">У цьому періоді задач немає</p>
              {(outsideCount > 0 || undatedCount > 0) && (
                <p className="text-xs text-gray-400 mt-1">
                  {outsideCount > 0 && `${outsideCount} ${tasksWord(outsideCount)} — поза періодом`}
                  {outsideCount > 0 && undatedCount > 0 && ' · '}
                  {undatedCount > 0 && `${undatedCount} ${tasksWord(undatedCount)} — без дат`}
                </p>
              )}
            </div>
          ) : (
            tasksInWindow.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                days={days}
                dayWidth={dayWidth}
                windowStart={windowStart}
                windowEnd={windowEnd}
                today={today}
                dayIndex={dayIndex}
                isHovered={hoveredId === task.id}
                isOverlapping={highlighted.has(task.id)}
                onHover={setHoveredId}
                onOpen={() => openCard(task.id)}
              />
            ))
          )}

          {/* Смужка навантаження */}
          <div className="flex sticky bottom-0 z-20 bg-white border-t-2 border-gray-200">
            <div
              className="sticky left-0 z-10 bg-white shrink-0 border-r border-gray-200 px-4 flex flex-col justify-center"
              style={{ width: LEFT_PANE, height: 52 }}
            >
              <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Навантаження</span>
              <span className="text-[10px] text-gray-400">норма {formatMinutes(DEFAULT_DAILY_CAPACITY_MINUTES)}/день</span>
            </div>
            <div className="flex" style={{ width: gridWidth }}>
              {loads.map(day => {
                const level = loadLevel(day.minutes);
                const style = LEVEL_STYLE[level];
                const fill = Math.min(100, (day.minutes / DEFAULT_DAILY_CAPACITY_MINUTES) * 100);
                const weekend = isWeekend(day.key);
                return (
                  <div
                    key={day.key}
                    className={`border-r border-gray-100 flex flex-col justify-end items-center pb-1 pt-1.5 gap-1 ${
                      weekend ? 'bg-gray-50/70' : style.cell
                    }`}
                    style={{ width: dayWidth, height: 52 }}
                    title={`${format(toLocalDate(day.key), 'EEEE, d MMMM', { locale: uk })}: ${formatMinutes(day.minutes)}, задач — ${day.tasks}${
                      day.unestimated > 0 ? `, без оцінки — ${day.unestimated}` : ''
                    }`}
                  >
                    {/* «?» — це «час невідомий», а не «роботи немає». Задача, що
                        просто перетинає вихідний, годин на нього не переносить —
                        і питати про них нічого */}
                    <span className={`text-[10px] font-bold leading-none ${day.tasks > 0 ? style.text : 'text-gray-300'}`}>
                      {day.minutes > 0
                        ? (day.minutes / 60).toFixed(1).replace('.0', '')
                        : day.unestimated > 0 ? '?' : ''}
                    </span>
                    <div className="w-full px-1.5">
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${fill}%` }} />
                      </div>
                    </div>
                    <span className={`text-[9px] leading-none ${day.tasks > 0 ? 'text-gray-500' : 'text-gray-300'}`}>
                      {day.tasks > 0 ? `${day.tasks} зд.` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Що лишилось за кадром ────────────────────────────── */}
      {(outsideCount > 0 || undatedCount > 0 || summary.unestimatedTasks > 0) && tasksInWindow.length > 0 && (
        <div className="flex items-start gap-1.5 mt-2 shrink-0 text-[11px] text-gray-500">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
          <span>
            {[
              outsideCount > 0 && `${outsideCount} ${tasksWord(outsideCount)} поза періодом`,
              undatedCount > 0 && `${undatedCount} ${tasksWord(undatedCount)} без дат — на діаграму не потрапляють`,
              summary.unestimatedTasks > 0 && `${summary.unestimatedTasks} ${tasksWord(summary.unestimatedTasks)} без оцінки часу — години занижені`,
            ].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}

      {modalCard && <CardModal card={modalCard} onClose={() => { setModalCard(null); setOpenCardId(null); }} />}
    </div>
  );
}

// ── Рядок задачі ──────────────────────────────────────────────────────────────

function TaskRow({
  task, days, dayWidth, windowStart, windowEnd, today, dayIndex,
  isHovered, isOverlapping, onHover, onOpen,
}: {
  task: WorkloadTask;
  days: string[];
  dayWidth: number;
  windowStart: string;
  windowEnd: string;
  today: string;
  dayIndex: (key: string) => number;
  isHovered: boolean;
  isOverlapping: boolean;
  onHover: (id: string | null) => void;
  onOpen: () => void;
}) {
  // Задача може починатись до вікна й тягнутись за нього — малюємо видиму
  // частину, а зрізані краї позначаємо стрілкою, щоб смужка не читалась як
  // коротша, ніж вона є
  const visibleStart = task.range.start < windowStart ? windowStart : task.range.start;
  const visibleEnd = task.range.end > windowEnd ? windowEnd : task.range.end;
  const clippedLeft = task.range.start < windowStart;
  const clippedRight = task.range.end > windowEnd;

  const left = dayIndex(visibleStart) * dayWidth + 1;
  const width = Math.max(rangeLength({ start: visibleStart, end: visibleEnd }) * dayWidth - 2, 8);
  const overdue = isOverdue(task.range, today, task.isCompleted);

  const barColor = task.isCompleted
    ? 'bg-gray-300'
    : overdue
      ? 'bg-red-500'
      : isOverlapping
        ? 'bg-blue-500 ring-2 ring-blue-300'
        : 'bg-blue-500';

  return (
    <div
      className={`flex border-b border-gray-50 transition-colors cursor-pointer ${
        isHovered ? 'bg-blue-50/50' : isOverlapping ? 'bg-blue-50/30' : 'hover:bg-gray-50/70'
      }`}
      style={{ height: ROW_HEIGHT }}
      onMouseEnter={() => onHover(task.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onOpen}
    >
      <div
        className={`sticky left-0 z-10 shrink-0 border-r border-gray-200 flex items-center gap-2 px-3 transition-colors ${
          isHovered ? 'bg-blue-50' : isOverlapping ? 'bg-blue-50/60' : 'bg-white'
        }`}
        style={{ width: LEFT_PANE }}
      >
        <span className={`flex-1 truncate text-xs ${task.isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
          {task.title}
        </span>
        {task.minutes > 0 && (
          <span className="text-[10px] text-gray-400 shrink-0 font-mono">{formatMinutes(task.minutes)}</span>
        )}
      </div>

      <div className="relative" style={{ width: days.length * dayWidth }}>
        {/* Вихідні й сітка */}
        <div className="absolute inset-0 flex pointer-events-none">
          {days.map(key => (
            <div
              key={key}
              className={`border-r border-gray-50 h-full ${
                key === today ? 'bg-red-50/60' : isWeekend(key) ? 'bg-gray-50/70' : ''
              }`}
              style={{ width: dayWidth }}
            />
          ))}
        </div>

        <div
          className={`absolute top-1.5 bottom-1.5 rounded flex items-center px-1.5 gap-1 shadow-sm transition-all ${barColor} ${
            clippedLeft ? 'rounded-l-none' : ''
          } ${clippedRight ? 'rounded-r-none' : ''}`}
          style={{ left, width }}
          title={`${task.title} · ${durationLabel(task.range)}${task.minutes > 0 ? ` · ${formatMinutes(task.minutes)}` : ' · без оцінки'}`}
        >
          {clippedLeft && <ChevronLeft className="w-3 h-3 text-white/80 shrink-0" />}
          {width > 60 && (
            <span className="text-[10px] font-medium text-white truncate flex-1">
              {task.minutes > 0 ? formatMinutes(task.minutes) : durationLabel(task.range)}
            </span>
          )}
          {clippedRight && <ChevronRight className="w-3 h-3 text-white/80 shrink-0 ml-auto" />}
        </div>
      </div>
    </div>
  );
}

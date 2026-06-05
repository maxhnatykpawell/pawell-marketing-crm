import React, { useState } from 'react';
import { useAppContext } from '../App';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth, isToday } from 'date-fns';
import { uk } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EventItem, Card, ContentPlanItem } from '../types';

interface CalendarEvent {
  id: string;
  type: 'event' | 'card' | 'content';
  title: string;
  startDate: Date;
  endDate: Date;
  color: string;
  original: EventItem | Card | ContentPlanItem;
}

export default function MasterCalendarView() {
  const { state, setActiveEventId, setActiveView } = useAppContext();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const events = state.events || [];
  
  // Aggregate all events
  const allCalendarEvents: CalendarEvent[] = [
    // 1. Events
    ...events.map(e => ({
      id: `evt-${e.id}`,
      type: 'event' as const,
      title: e.title,
      startDate: new Date(e.startDate),
      endDate: new Date(e.endDate),
      color: 'bg-purple-100 text-purple-700 border-purple-200',
      original: e
    })),
    // 2. Card Deadlines
    ...(state.cards || []).filter(c => c.deadline).map(c => ({
      id: `crd-${c.id}`,
      type: 'card' as const,
      title: c.title,
      startDate: new Date(c.deadline!),
      endDate: new Date(c.deadline!),
      color: 'bg-orange-100 text-orange-700 border-orange-200',
      original: c
    })),
    // 3. Content Plan
    ...(state.contentPlans || []).filter(c => c.publishDate).map(c => ({
      id: `cnt-${c.id}`,
      type: 'content' as const,
      title: c.focus || c.description || 'Публікація',
      startDate: new Date(c.publishDate!),
      endDate: new Date(c.publishDate!),
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      original: c
    }))
  ];

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const resetMonth = () => setCurrentMonth(new Date());

  return (
    <div className="w-full max-w-7xl mx-auto h-full flex flex-col transition-all duration-300">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            Загальний календар
          </h2>
          <p className="text-gray-500 text-sm mt-1">Огляд усіх дедлайнів, контенту та майбутніх подій</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col flex-1 h-full min-h-[500px]">
        {/* Calendar Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-xl font-bold text-gray-800 capitalize">
            {format(currentMonth, 'LLLL yyyy', { locale: uk })}
          </h3>
          <div className="flex items-center space-x-2">
            <button onClick={resetMonth} className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-md transition">
              Сьогодні
            </button>
            <div className="flex items-center space-x-1 border border-gray-200 rounded-md p-0.5">
              <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded text-gray-600 transition"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded text-gray-600 transition"><ChevronRight className="w-5 h-5" /></button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-4 text-xs font-medium text-gray-600">
          <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-purple-400 mr-2"></span>Виставки / Події</span>
          <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-orange-400 mr-2"></span>Дедлайни задач</span>
          <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-blue-400 mr-2"></span>Публікації (Контент-план)</span>
        </div>

        {/* Days of week */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {['Пн', 'Вв', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 grid grid-cols-7 grid-rows-5 md:grid-rows-auto bg-gray-200 gap-px overflow-y-auto">
          {calendarDays.map((day) => {
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isTodayDate = isToday(day);
            
            // Find items for this day
            const dayEvents = allCalendarEvents.filter(e => {
              // Normalize times to strictly compare dates
              const dStart = new Date(e.startDate).setHours(0,0,0,0);
              const dEnd = new Date(e.endDate).setHours(0,0,0,0);
              const tDay = day.setHours(0,0,0,0);
              return tDay >= dStart && tDay <= dEnd;
            });

            return (
              <div 
                key={day.toISOString()} 
                className={`min-h-[100px] p-2 bg-white transition ${!isCurrentMonth ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50/50'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${isTodayDate ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700'}`}>
                    {format(day, 'd')}
                  </span>
                </div>
                <div className="space-y-1 overflow-y-auto max-h-[100px] hidden-scrollbar">
                  {dayEvents.map(e => (
                    <div 
                      key={e.id}
                      onClick={() => {
                        if (e.type === 'event') {
                          setActiveEventId(e.original.id);
                          setActiveView('event-details');
                        }
                      }}
                      className={`text-[10px] leading-tight px-1.5 py-1 rounded border overflow-hidden text-ellipsis whitespace-nowrap ${e.type === 'event' ? 'cursor-pointer hover:shadow-md hover:-translate-y-px transition' : 'cursor-default'} ${e.color}`}
                      title={`${e.title}\n(${e.type === 'event' ? 'Подія' : e.type === 'card' ? 'Задача' : 'Контент'})`}
                    >
                      {e.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

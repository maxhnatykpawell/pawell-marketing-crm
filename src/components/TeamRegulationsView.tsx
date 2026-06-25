import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppContext } from '../App';
import { User } from '../types';
import { Target, Activity, Shield, Save, Users, Edit2, Calendar, Clock, AlertCircle, Play, ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react';

const DAYS = [
  { key: 'monday', label: 'Понеділок', short: 'Пн' },
  { key: 'tuesday', label: 'Вівторок', short: 'Вт' },
  { key: 'wednesday', label: 'Середа', short: 'Ср' },
  { key: 'thursday', label: 'Четвер', short: 'Чт' },
  { key: 'friday', label: "П'ятниця", short: 'Пт' }
];

interface ScheduleBlock {
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  activity: string;
}

function parseScheduleText(text: string): ScheduleBlock[] {
  if (!text) return [];
  const lines = text.split('\n');
  const blocks: ScheduleBlock[] = [];
  const regex = /^(\d{1,2}:\d{2})\s*[-—–]\s*(\d{1,2}:\d{2})\s*(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(regex);
    if (match) {
      const start = match[1];
      const end = match[2];
      const activity = match[3].trim();
      const [startH, startM] = start.split(':').map(Number);
      const [endH, endM] = end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      blocks.push({ start, end, startMinutes, endMinutes, activity });
    }
  }
  return blocks.sort((a, b) => a.startMinutes - b.startMinutes);
}

export default function TeamRegulationsView() {
  const { state, updateUser } = useAppContext();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<User>>({});

  const [now, setNow] = useState(new Date());
  
  const dayOfWeekIndex = (now.getDay() + 6) % 7; 
  const safeIndex = dayOfWeekIndex >= 5 ? 0 : dayOfWeekIndex;
  const todayKey = DAYS[safeIndex].key;
  const todayLabel = DAYS[safeIndex].label;

  const [timelineDayKey, setTimelineDayKey] = useState<string>(todayKey);
  const [viewDays, setViewDays] = useState<1 | 3 | 5>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Close fullscreen on Escape
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isFullscreen]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedUserId && !timelineDayKey) {
      setTimelineDayKey(todayKey);
    }
  }, [selectedUserId, todayKey, timelineDayKey]);

  useEffect(() => {
    if (!selectedUserId && state.users.length > 0) {
      setSelectedUserId(state.users[0].id);
    }
  }, [state.users, selectedUserId]);

  const selectedUser = state.users.find(u => u.id === selectedUserId);

  const handleSelectUser = (id: string) => {
    setSelectedUserId(id);
    setIsEditing(false);
    setFormData({});
    setTimelineDayKey(todayKey);
  };

  const startEditing = () => {
    if (selectedUser) {
      setFormData(selectedUser);
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    if (selectedUserId) {
      updateUser(selectedUserId, formData);
      setIsEditing(false);
    }
  };

  const handleScheduleChange = (dayKey: string, val: string) => {
    setFormData(prev => ({
      ...prev,
      weeklySchedule: {
        ...(prev.weeklySchedule || {}),
        [dayKey]: val
      }
    }));
  };

  const handlePrevDays = () => {
    const idx = DAYS.findIndex(d => d.key === timelineDayKey);
    const newIdx = (idx - 1 + 5) % 5;
    setTimelineDayKey(DAYS[newIdx].key);
  };

  const handleNextDays = () => {
    const idx = DAYS.findIndex(d => d.key === timelineDayKey);
    const newIdx = (idx + 1) % 5;
    setTimelineDayKey(DAYS[newIdx].key);
  };

  const handleToday = () => {
    setTimelineDayKey(todayKey);
  };

  const visibleDays = useMemo(() => {
    const startIndex = DAYS.findIndex(d => d.key === timelineDayKey);
    const visible = [];
    for (let i = 0; i < viewDays; i++) {
      visible.push(DAYS[(startIndex + i) % 5]);
    }
    return visible;
  }, [timelineDayKey, viewDays]);

  const gridColsClass = viewDays === 1 ? 'grid-cols-1' : viewDays === 3 ? 'grid-cols-3' : 'grid-cols-5';

  return (
    <div className="flex h-full gap-6 w-full max-w-7xl mx-auto">
      {/* Sidebar - Users List */}
      <div className="w-64 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden flex-shrink-0 relative h-[calc(100vh-120px)]">
        <div className="p-4 border-b border-gray-50 flex items-center shrink-0">
          <Users className="w-5 h-5 text-blue-500 mr-2" />
          <h2 className="font-semibold text-gray-800">Команда</h2>
        </div>
        <div className="p-2 space-y-1 overflow-y-auto flex-1 hidden-scrollbar">
          {state.users.map(u => (
            <button
              key={u.id}
              onClick={() => handleSelectUser(u.id)}
              className={`w-full flex items-center px-3 py-2.5 rounded-lg transition ${selectedUserId === u.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full mr-3 shrink-0 bg-gray-100 object-cover" />
              <div className="text-left overflow-hidden">
                <span className="block truncate text-sm">{u.name}</span>
                <span className="block text-[11px] opacity-70 truncate font-normal">{u.role || 'Роль не вказана'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content - Regulations */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[calc(100vh-120px)] overflow-hidden">
        {selectedUser ? (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-50 shrink-0">
              <div className="flex items-center space-x-4">
                <img src={selectedUser.avatar} alt={selectedUser.name} className="w-12 h-12 rounded-full border border-gray-100 object-cover" />
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedUser.name}</h2>
                  {!isEditing ? (
                    <p className="text-gray-500 text-sm">{selectedUser.role || 'Роль не вказана'}</p>
                  ) : (
                    <input 
                      type="text" 
                      value={formData.role || ''} 
                      onChange={e => setFormData({...formData, role: e.target.value})}
                      placeholder="Введіть посаду/роль..."
                      className="mt-1 px-3 py-1 text-sm border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md outline-none w-64 bg-white"
                    />
                  )}
                </div>
              </div>
              <div>
                {!isEditing ? (
                  <button onClick={startEditing} className="flex items-center px-4 py-2 bg-gray-50 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100 transition">
                    <Edit2 className="w-4 h-4 mr-2 text-gray-500" />
                    Редагувати регламент
                  </button>
                ) : (
                  <div className="flex space-x-2">
                    <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 font-medium rounded-lg transition">Скасувати</button>
                    <button onClick={handleSave} className="flex items-center px-4 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-sm">
                      <Save className="w-4 h-4 mr-2" />
                      Зберегти
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Banner (only in View Mode) */}
            {!isEditing && (() => {
              const currentMinutes = now.getHours() * 60 + now.getMinutes();
              const todayBlocks = parseScheduleText(selectedUser.weeklySchedule?.[todayKey] || '');
              const currentBlock = todayBlocks.find(b => currentMinutes >= b.startMinutes && currentMinutes < b.endMinutes);
              const nextBlock = todayBlocks.find(b => b.startMinutes > currentMinutes);

              const getBannerContent = () => {
                if (!selectedUser.weeklySchedule || todayBlocks.length === 0) {
                  return { status: 'Немає регламентованих задач на сьогодні', color: 'bg-gray-50 text-gray-500' };
                }
                if (currentBlock) {
                  return { status: `Зараз за регламентом: ${currentBlock.activity} (${currentBlock.start} - ${currentBlock.end})`, color: 'bg-blue-50/50 text-blue-700 border-l-[3px] border-blue-500' };
                }
                if (nextBlock) {
                  return { status: `Наступна задача: ${nextBlock.activity} о ${nextBlock.start}`, color: 'bg-green-50/50 text-green-700 border-l-[3px] border-green-500' };
                }
                return { status: 'Регламентний робочий день завершено', color: 'bg-gray-50 text-gray-600' };
              };

              const banner = getBannerContent();

              return (
                <div className={`mx-6 mt-4 p-3 rounded-lg flex items-center text-sm font-medium ${banner.color}`}>
                  <Play className="w-4 h-4 mr-2 opacity-70" />
                  {banner.status}
                </div>
              );
            })()}

            <div className="p-6 flex-1 overflow-y-auto hidden-scrollbar flex flex-col min-h-0 relative">
              {isEditing ? (
                /* EDIT MODE */
                <div className="max-w-3xl mx-auto w-full space-y-8 pb-10">
                  <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                    <h3 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                      <Activity className="w-5 h-5 text-blue-500 mr-2" />
                      Операційна діяльність
                    </h3>
                    <textarea 
                      value={formData.operationalDuties || ''}
                      onChange={e => setFormData({...formData, operationalDuties: e.target.value})}
                      placeholder="Опишіть основні процеси, зони відповідальності..."
                      className="w-full h-24 p-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm resize-y bg-gray-50 focus:bg-white transition"
                    />
                  </div>

                  <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                    <h3 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                      <Target className="w-5 h-5 text-blue-500 mr-2" />
                      Цілі та KPI
                    </h3>
                    <textarea 
                      value={formData.goals || ''}
                      onChange={e => setFormData({...formData, goals: e.target.value})}
                      placeholder="Опишіть основні цілі (Goals) та ключові показники ефективності (KPI)..."
                      className="w-full h-24 p-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm resize-y bg-gray-50 focus:bg-white transition"
                    />
                  </div>

                  <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                    <h3 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                      <Calendar className="w-5 h-5 text-blue-500 mr-2" />
                      Графік на тиждень
                    </h3>
                    <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-800 mb-5 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
                      <div>
                        Пишіть задачі у форматі: <code className="font-mono bg-blue-100/50 px-1 py-0.5 rounded">ЧЧ:ММ - ЧЧ:ММ Назва задачі</code>. Наприклад:<br />
                        <span className="font-mono mt-1 block opacity-80">09:00 - 10:00 Ранкова нарада</span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {DAYS.map(day => (
                        <div key={day.key} className="flex flex-col sm:flex-row gap-2 sm:gap-4 border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                          <div className="sm:w-32 font-medium text-gray-700 shrink-0 pt-2 text-sm">{day.label}</div>
                          <div className="flex-1">
                            <textarea
                              value={formData.weeklySchedule?.[day.key] || ''}
                              onChange={(e) => handleScheduleChange(day.key, e.target.value)}
                              placeholder={`Задачі на ${day.label.toLowerCase()}...`}
                              className="w-full h-20 p-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm resize-y bg-gray-50 focus:bg-white transition"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* VIEW MODE (CALENDAR) */
                <div className="flex flex-col h-full max-h-full">
                  {/* Text sections condensed */}
                  {(selectedUser.operationalDuties || selectedUser.goals) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 shrink-0">
                      {selectedUser.operationalDuties && (
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center">
                            <Activity className="w-3.5 h-3.5 mr-1.5" /> Операційна діяльність
                          </h4>
                          <div className="text-sm text-gray-700 whitespace-pre-wrap">{selectedUser.operationalDuties}</div>
                        </div>
                      )}
                      {selectedUser.goals && (
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center">
                            <Target className="w-3.5 h-3.5 mr-1.5" /> Цілі та KPI
                          </h4>
                          <div className="text-sm text-gray-700 whitespace-pre-wrap">{selectedUser.goals}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Calendar Toolbar */}
                  <div className="flex items-center justify-between mb-4 shrink-0">
                    <div className="flex items-center space-x-2">
                      <button onClick={handlePrevDays} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition">
                        <ChevronLeft className="w-5 h-5"/>
                      </button>
                      <button onClick={handleToday} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition">
                        Сьогодні
                      </button>
                      <button onClick={handleNextDays} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition">
                        <ChevronRight className="w-5 h-5"/>
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-gray-100/80 rounded-lg p-1 border border-gray-200/50">
                        <button onClick={() => setViewDays(1)} className={`px-3.5 py-1 text-sm font-medium rounded-md transition-all ${viewDays === 1 ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>1 день</button>
                        <button onClick={() => setViewDays(3)} className={`px-3.5 py-1 text-sm font-medium rounded-md transition-all ${viewDays === 3 ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>3 дні</button>
                        <button onClick={() => setViewDays(5)} className={`px-3.5 py-1 text-sm font-medium rounded-md transition-all ${viewDays === 5 ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>5 днів</button>
                      </div>
                      <button
                        onClick={() => setIsFullscreen(true)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition"
                        title="На весь екран"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Calendar Canvas */}
                  {(() => {
                    const allBlocks = visibleDays.flatMap(day => parseScheduleText(selectedUser.weeklySchedule?.[day.key] || ''));
                    const startHour = Math.max(0, Math.min(8, ...allBlocks.map(b => Math.floor(b.startMinutes / 60))));
                    const endHour = Math.min(24, Math.max(20, ...allBlocks.map(b => Math.ceil(b.endMinutes / 60))));
                    const totalMinutes = (endHour - startHour) * 60;
                    
                    const hourMarkers = [];
                    for (let h = startHour; h <= endHour; h++) {
                      hourMarkers.push(h);
                    }
                    
                    const currentMinutes = now.getHours() * 60 + now.getMinutes();
                    const currentMinutesOffset = currentMinutes - startHour * 60;
                    const redLineTopPct = totalMinutes > 0 ? (currentMinutesOffset / totalMinutes) * 100 : 0;

                    return (
                      <div className="relative border border-gray-200/60 rounded-xl bg-white flex-1 overflow-hidden flex flex-col min-h-[400px] shadow-sm">
                        {/* Header with day names */}
                        <div className="flex border-b border-gray-100 bg-gray-50/50 shrink-0">
                          <div className="w-14 shrink-0 border-r border-gray-100" />
                          <div className={`flex-1 grid ${gridColsClass} divide-x divide-gray-100`}>
                            {visibleDays.map(day => {
                              const isToday = day.key === todayKey;
                              return (
                                <div key={day.key} className="text-center py-2 text-sm font-semibold text-gray-700 relative">
                                  {day.label}
                                  {isToday && <span className="absolute top-1/2 -translate-y-1/2 ml-1.5 w-1.5 h-1.5 inline-block rounded-full bg-blue-500" />}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Scrollable Timeline Area */}
                        <div className="flex-1 overflow-y-auto hidden-scrollbar relative">
                          <div className="flex relative" style={{ minHeight: `${Math.max((endHour - startHour) * 100, 600)}px` }}>
                            {/* Y-axis */}
                            <div className="w-14 shrink-0 border-r border-gray-100 relative bg-gray-50/30">
                              {hourMarkers.map((h, i) => {
                                const topPct = (i / (hourMarkers.length - 1)) * 100;
                                return (
                                  <div key={h} className="absolute left-0 right-0 flex justify-end pr-2" style={{ top: `${topPct}%` }}>
                                    <span className="text-[10px] text-gray-400 -mt-2 bg-transparent font-mono">
                                      {h.toString().padStart(2, '0')}:00
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Grid and Events */}
                            <div className={`flex-1 grid ${gridColsClass} divide-x divide-gray-100 relative`}>
                              {/* Horizontal grid lines */}
                              <div className="absolute inset-0 pointer-events-none">
                                {hourMarkers.map((h, i) => (
                                  <div key={h} className="absolute w-full border-t border-gray-100" style={{ top: `${(i / (hourMarkers.length - 1)) * 100}%` }} />
                                ))}
                              </div>

                              {visibleDays.map((day) => {
                                const blocks = parseScheduleText(selectedUser.weeklySchedule?.[day.key] || '');
                                const isTimelineToday = day.key === todayKey;
                                
                                return (
                                  <div key={day.key} className="relative h-full">
                                    {blocks.map((block, idx) => {
                                      const top = ((block.startMinutes - startHour * 60) / totalMinutes) * 100;
                                      const height = ((block.endMinutes - block.startMinutes) / totalMinutes) * 100;
                                      const isCurrent = isTimelineToday && currentMinutes >= block.startMinutes && currentMinutes < block.endMinutes;
                                      
                                      const bgClasses = isCurrent 
                                        ? 'bg-blue-100/80 text-blue-900 border-l-[3px] border-l-blue-600 shadow-sm z-10' 
                                        : 'bg-indigo-50/60 hover:bg-indigo-50/80 text-indigo-900 border-l-[3px] border-l-indigo-300';
                                      
                                      return (
                                        <div
                                          key={idx}
                                          className={`absolute left-1.5 right-1.5 rounded-r-md p-1.5 transition-colors flex flex-col overflow-y-auto hidden-scrollbar ${bgClasses}`}
                                          style={{ top: `${top}%`, height: `${height}%` }}
                                          title={`${block.activity} (${block.start} - ${block.end})`}
                                        >
                                          <div className="text-[11px] font-semibold leading-tight">{block.activity}</div>
                                          <div className="text-[10px] font-mono opacity-70 mt-0.5 shrink-0">{block.start} - {block.end}</div>
                                        </div>
                                      );
                                    })}
                                    
                                    {/* Red line for current time */}
                                    {isTimelineToday && currentMinutes >= startHour * 60 && currentMinutes <= endHour * 60 && (
                                      <div className="absolute left-0 right-0 border-t-[1.5px] border-red-500 z-20 pointer-events-none" style={{ top: `${redLineTopPct}%` }}>
                                        <div className="w-2 h-2 rounded-full bg-red-500 -mt-1 -ml-1 absolute" />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── FULLSCREEN OVERLAY ── */}
                  {isFullscreen && selectedUser && (() => {
                    const allBlocksFs = visibleDays.flatMap(day => parseScheduleText(selectedUser.weeklySchedule?.[day.key] || ''));
                    const startHourFs = Math.max(0, Math.min(8, ...allBlocksFs.map(b => Math.floor(b.startMinutes / 60))));
                    const endHourFs = Math.min(24, Math.max(20, ...allBlocksFs.map(b => Math.ceil(b.endMinutes / 60))));
                    const totalMinutesFs = (endHourFs - startHourFs) * 60;
                    const hourMarkersFs: number[] = [];
                    for (let h = startHourFs; h <= endHourFs; h++) hourMarkersFs.push(h);
                    const currentMinutesFs = now.getHours() * 60 + now.getMinutes();
                    const currentOffsetFs = currentMinutesFs - startHourFs * 60;
                    const redLineFs = totalMinutesFs > 0 ? (currentOffsetFs / totalMinutesFs) * 100 : 0;

                    return (
                      <div
                        className="fixed inset-0 z-[200] bg-white flex flex-col"
                        style={{ animation: 'fadeInScale 0.18s ease' }}
                      >
                        {/* Fullscreen header */}
                        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white shrink-0">
                          <div className="flex items-center gap-4">
                            <img src={selectedUser.avatar} alt={selectedUser.name} className="w-8 h-8 rounded-full" />
                            <span className="text-base font-semibold text-gray-900">{selectedUser.name} — Тижневий графік</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {/* Day switcher */}
                            <div className="flex items-center space-x-1">
                              <button onClick={handlePrevDays} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition"><ChevronLeft className="w-4 h-4" /></button>
                              <button onClick={handleToday} className="px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition">Сьогодні</button>
                              <button onClick={handleNextDays} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition"><ChevronRight className="w-4 h-4" /></button>
                            </div>
                            <div className="flex items-center bg-gray-100 rounded-lg p-1">
                              <button onClick={() => setViewDays(1)} className={`px-3 py-1 text-sm font-medium rounded-md transition ${viewDays === 1 ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>1 день</button>
                              <button onClick={() => setViewDays(3)} className={`px-3 py-1 text-sm font-medium rounded-md transition ${viewDays === 3 ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>3 дні</button>
                              <button onClick={() => setViewDays(5)} className={`px-3 py-1 text-sm font-medium rounded-md transition ${viewDays === 5 ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>5 днів</button>
                            </div>
                            <button
                              onClick={() => setIsFullscreen(false)}
                              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition"
                              title="Закрити (Esc)"
                            >
                              <Minimize2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setIsFullscreen(false)}
                              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Calendar canvas — full remaining height */}
                        <div className="flex-1 overflow-hidden flex flex-col px-4 pb-4 pt-3">
                          <div className="relative border border-gray-200 rounded-xl bg-white flex-1 overflow-hidden flex flex-col shadow-sm">
                            {/* Day headers */}
                            <div className="flex border-b border-gray-100 bg-gray-50/50 shrink-0">
                              <div className="w-16 shrink-0 border-r border-gray-100" />
                              <div className={`flex-1 grid ${gridColsClass} divide-x divide-gray-100`}>
                                {visibleDays.map(day => {
                                  const isToday = day.key === todayKey;
                                  return (
                                    <div key={day.key} className="text-center py-3 text-sm font-semibold text-gray-700 relative">
                                      {day.label}
                                      {isToday && <span className="absolute top-1/2 -translate-y-1/2 ml-1.5 w-1.5 h-1.5 inline-block rounded-full bg-blue-500" />}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Scrollable body */}
                            <div className="flex-1 overflow-y-auto hidden-scrollbar relative">
                              <div className="flex relative" style={{ minHeight: `${Math.max((endHourFs - startHourFs) * 120, 700)}px` }}>
                                {/* Y-axis */}
                                <div className="w-16 shrink-0 border-r border-gray-100 relative bg-gray-50/30">
                                  {hourMarkersFs.map((h, i) => (
                                    <div key={h} className="absolute left-0 right-0 flex justify-end pr-2" style={{ top: `${(i / (hourMarkersFs.length - 1)) * 100}%` }}>
                                      <span className="text-[11px] text-gray-400 -mt-2 font-mono">{h.toString().padStart(2, '0')}:00</span>
                                    </div>
                                  ))}
                                </div>

                                {/* Grid + events */}
                                <div className={`flex-1 grid ${gridColsClass} divide-x divide-gray-100 relative`}>
                                  <div className="absolute inset-0 pointer-events-none">
                                    {hourMarkersFs.map((h, i) => (
                                      <div key={h} className="absolute w-full border-t border-gray-100" style={{ top: `${(i / (hourMarkersFs.length - 1)) * 100}%` }} />
                                    ))}
                                  </div>

                                  {visibleDays.map(day => {
                                    const blocks = parseScheduleText(selectedUser.weeklySchedule?.[day.key] || '');
                                    const isTimelineToday = day.key === todayKey;
                                    return (
                                      <div key={day.key} className="relative h-full">
                                        {blocks.map((block, idx) => {
                                          const top = ((block.startMinutes - startHourFs * 60) / totalMinutesFs) * 100;
                                          const height = ((block.endMinutes - block.startMinutes) / totalMinutesFs) * 100;
                                          const isCurrent = isTimelineToday && currentMinutesFs >= block.startMinutes && currentMinutesFs < block.endMinutes;
                                          const bgCls = isCurrent
                                            ? 'bg-blue-100/80 text-blue-900 border-l-[3px] border-l-blue-600 shadow-sm z-10'
                                            : 'bg-indigo-50/60 hover:bg-indigo-50/80 text-indigo-900 border-l-[3px] border-l-indigo-300';
                                          return (
                                            <div
                                              key={idx}
                                              className={`absolute left-2 right-2 rounded-r-md p-2 flex flex-col overflow-hidden ${bgCls}`}
                                              style={{ top: `${top}%`, height: `${height}%` }}
                                              title={`${block.activity} (${block.start}–${block.end})`}
                                            >
                                              <div className="text-xs font-semibold leading-tight">{block.activity}</div>
                                              <div className="text-[11px] font-mono opacity-70 mt-0.5">{block.start} – {block.end}</div>
                                            </div>
                                          );
                                        })}
                                        {isTimelineToday && currentMinutesFs >= startHourFs * 60 && currentMinutesFs <= endHourFs * 60 && (
                                          <div className="absolute left-0 right-0 border-t-[1.5px] border-red-500 z-20 pointer-events-none" style={{ top: `${redLineFs}%` }}>
                                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 -mt-1.5 -ml-1 absolute" />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  
                  {!selectedUser.operationalDuties && !selectedUser.goals && (!selectedUser.weeklySchedule || Object.values(selectedUser.weeklySchedule).every(v => !v)) && (
                    <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-xl">
                      <div className="text-center p-8 bg-white border border-gray-200 rounded-2xl shadow-lg max-w-sm">
                        <Shield className="w-12 h-12 text-blue-100 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Регламент порожній</h3>
                        <p className="text-gray-500 text-sm mb-6">Заповніть регламент співробітника, щоб побачити його розклад у календарі.</p>
                        <button onClick={startEditing} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition shadow-sm w-full">
                          Заповнити регламент
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-10 text-center">
            <div>
              <Users className="w-16 h-16 text-gray-100 mx-auto mb-4" />
              <p className="text-gray-400 font-medium text-lg">Оберіть учасника команди зліва</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useAppContext } from '../App';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday } from 'date-fns';
import { uk } from 'date-fns/locale';
import { TrendingUp, TrendingDown, Target, Edit2, Check, Calendar as CalendarIcon, Send, Loader2, RefreshCw, Users, Zap, AlertCircle } from 'lucide-react';
import { Metric, KeepInCRMSnapshot, KeepInCRMSourceStat } from '../types';
import { getKeepInCRMSnapshot, triggerKeepInCRMSync } from '../api';

export default function DashboardView() {
  const { state, updateMetric, setActiveView, setActiveEventId, currentUser } = useAppContext();
  
  const [editingMetric, setEditingMetric] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Metric>>({});
  const [isSendingReport, setIsSendingReport] = useState(false);

  // ── KeepInCRM State ──────────────────────────────────────────────────────────
  const [kSnapshot, setKSnapshot] = useState<KeepInCRMSnapshot | null>(null);
  const [kLoading, setKLoading] = useState(true);
  const [kSyncing, setKSyncing] = useState(false);
  const [kError, setKError] = useState<string | null>(null);

  useEffect(() => {
    getKeepInCRMSnapshot()
      .then(snap => setKSnapshot(snap))
      .catch(() => setKError('Не вдалось завантажити дані KeepInCRM'))
      .finally(() => setKLoading(false));
  }, []);

  const handleKSync = async () => {
    setKSyncing(true);
    setKError(null);
    try {
      const { snapshot } = await triggerKeepInCRMSync();
      setKSnapshot(snapshot);
    } catch (e: any) {
      setKError(e.message || 'Помилка синхронізації');
    } finally {
      setKSyncing(false);
    }
  };

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const events = state.events || [];
  const contents = state.contentPlans || [];
  const cards = state.cards || [];

  const handleEditMetric = (metric: Metric) => {
    setEditingMetric(metric.id);
    setEditForm(metric);
  };

  const handleSaveMetric = () => {
    if (editingMetric) {
      updateMetric(editingMetric, editForm);
      setEditingMetric(null);
    }
  };

  const handleTestNotification = async () => {
    setIsSendingReport(true);
    try {
      const response = await fetch('/api/test-notification', { 
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
      });
      const data = await response.json();
      if (data.success) {
        alert('ШІ-звіт успішно згенеровано та надіслано в Telegram!');
      } else {
        alert('Помилка відправки: ' + (data.error === 'missing_telegram_credentials' ? 'Відсутні ключі Telegram в .env' : data.error));
      }
    } catch (e) {
      alert('Помилка відправки звіту.');
      console.error(e);
    } finally {
      setIsSendingReport(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto h-full flex flex-col space-y-6 pb-6 overflow-y-auto hidden-scrollbar">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Головна панель відділу</h2>
          <p className="text-gray-500 text-sm mt-1">Огляд ключових показників та розклад на поточний тиждень</p>
        </div>
        <button
          onClick={handleTestNotification}
          disabled={isSendingReport}
          className="flex items-center px-4 py-2 bg-[#2ba3e2] hover:bg-[#208bc2] text-white rounded-lg shadow-sm font-medium transition text-sm disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSendingReport ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Отримати ШІ-звіт в Telegram
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-shrink-0">
        {(state.metrics || []).map(metric => (
          <div key={metric.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 group relative transition hover:shadow-md h-[120px]">
            {editingMetric === metric.id ? (
              <div className="flex flex-col h-full justify-between">
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    value={editForm.title || ''} 
                    onChange={e => setEditForm({...editForm, title: e.target.value})}
                    className="w-1/2 text-sm font-medium text-gray-700 border-b border-gray-300 focus:border-blue-500 outline-none"
                    placeholder="Назва"
                  />
                  <input 
                    type="text" 
                    value={editForm.value || ''} 
                    onChange={e => setEditForm({...editForm, value: e.target.value})}
                    className="w-1/2 text-sm font-bold text-gray-900 border-b border-gray-300 focus:border-blue-500 outline-none"
                    placeholder="Значення"
                  />
                </div>
                <div className="flex space-x-2 items-center mt-2">
                  <input 
                    type="text" 
                    value={editForm.trend || ''} 
                    onChange={e => setEditForm({...editForm, trend: e.target.value})}
                    placeholder="Тренд (+5%)"
                    className="w-2/3 text-xs border border-gray-300 rounded px-2 py-1 outline-none"
                  />
                  <label className="text-xs text-gray-500 flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={!!editForm.trendPositive} 
                      onChange={e => setEditForm({...editForm, trendPositive: e.target.checked})}
                      className="mr-1"
                    />
                    Додатній?
                  </label>
                </div>
                <button onClick={handleSaveMetric} className="w-full mt-2 bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-semibold py-1 rounded transition flex items-center justify-center">
                  <Check className="w-3 h-3 mr-1" /> Зберегти
                </button>
              </div>
            ) : (
              <>
                <button 
                  onClick={() => handleEditMetric(metric)}
                  className="absolute top-3 right-3 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition p-1 bg-gray-50 rounded"
                  title="Редагувати показник"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <div className="flex flex-col h-full justify-between">
                  <h3 className="text-sm font-medium text-gray-500">{metric.title}</h3>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-bold text-gray-900 leading-tight">{metric.value}</span>
                    {metric.trend && (
                      <div className={`flex items-center text-xs font-semibold px-2 py-1 rounded-full ${metric.trendPositive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {metric.trendPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                        {metric.trend}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* KeepInCRM Block */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800">KeepInCRM · Сьогодні</h3>
              {kSnapshot?.lastSyncedAt && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Оновлено: {new Date(kSnapshot.lastSyncedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>
          {currentUser?.role === 'admin' && (
            <button
              onClick={handleKSync}
              disabled={kSyncing}
              title="Синхронізувати зараз"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${kSyncing ? 'animate-spin' : ''}`} />
              {kSyncing ? 'Синхронізація...' : 'Оновити'}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {kLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Завантаження даних...</span>
            </div>
          ) : kError ? (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {kError}
            </div>
          ) : !kSnapshot ? (
            <div className="text-center py-8 text-gray-400">
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Дані ще не синхронізовані.</p>
              <p className="text-xs mt-1">Додайте KEEPINCRM_API_KEY у змінні середовища.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Leads Today */}
              <KeepInCRMSourceCard
                title="Ліди за сьогодні"
                total={kSnapshot.totalLeadsToday}
                stats={kSnapshot.leadsToday}
                color="blue"
                icon={<Users className="w-4 h-4" />}
              />

              {/* Clients Today */}
              <KeepInCRMSourceCard
                title="Клієнти за сьогодні"
                total={kSnapshot.totalClientsToday}
                stats={kSnapshot.clientsToday}
                color="green"
                icon={<Target className="w-4 h-4" />}
              />

              {/* Conversion Rate */}
              <div className="flex flex-col">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Конверсія лід → клієнт</p>
                <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl border border-violet-100 p-6">
                  <span className="text-5xl font-black text-violet-700 leading-none">
                    {kSnapshot.conversionRateToday}%
                  </span>
                  <p className="text-xs text-violet-500 mt-2 font-medium">
                    {kSnapshot.totalClientsToday} з {kSnapshot.totalLeadsToday} лідів
                  </p>
                  {/* Mini progress bar */}
                  <div className="w-full mt-4 bg-violet-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-violet-500 to-indigo-500 h-2 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(kSnapshot.conversionRateToday, 100)}%` }}
                    />
                  </div>
                  {kSnapshot.lastSyncError && (
                    <p className="text-[10px] text-amber-500 mt-3 text-center">
                      ⚠️ Остання синхронізація завершилась з помилкою
                    </p>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[400px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
          <h3 className="text-lg font-bold text-gray-800 flex items-center">
            <CalendarIcon className="w-5 h-5 mr-3 text-blue-500" />
            Календар на тиждень
          </h3>
          <span className="text-sm font-medium text-gray-600 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
            {format(weekStart, 'd MMMM', { locale: uk })} — {format(weekEnd, 'd MMMM yyyy', { locale: uk })}
          </span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-7 divide-y xl:divide-y-0 xl:divide-x divide-gray-100 bg-gray-50/30 flex-1 overflow-hidden">
          {weekDays.map(day => {
            const isTodayDate = isToday(day);
            const dayEvents = events.filter(e => {
              const start = new Date(e.startDate).setHours(0,0,0,0);
              const end = new Date(e.endDate).setHours(0,0,0,0);
              const tDay = day.setHours(0,0,0,0);
              return tDay >= start && tDay <= end;
            });
            const dayContents = contents.filter(c => c.publishDate && isSameDay(new Date(c.publishDate), day));
            const dayCards = cards.filter(c => c.deadline && isSameDay(new Date(c.deadline), day));

            return (
              <div key={day.toISOString()} className={`flex flex-col min-h-[200px] xl:min-h-0 transition ${isTodayDate ? 'bg-blue-50/10' : ''}`}>
                <div className={`px-4 py-3 border-b border-gray-100 text-center flex-shrink-0 ${isTodayDate ? 'bg-blue-50/50 border-b-blue-100' : 'bg-white'}`}>
                  <span className={`block text-[11px] font-bold uppercase tracking-wider ${isTodayDate ? 'text-blue-600' : 'text-gray-500'}`}>
                    {format(day, 'EEEE', { locale: uk })}
                  </span>
                  <span className={`text-xl font-bold mt-0.5 block ${isTodayDate ? 'text-blue-700' : 'text-gray-800'}`}>
                    {format(day, 'd')}
                  </span>
                </div>
                
                <div className="p-3 space-y-3 flex-1 overflow-y-auto hidden-scrollbar bg-white/40">
                  {/* Events */}
                  {dayEvents.map(e => (
                    <div 
                      key={e.id}
                      onClick={() => {
                        setActiveEventId(e.id);
                        setActiveView('event-details');
                      }}
                      className="text-xs p-2.5 rounded-lg border bg-purple-50 border-purple-200 text-purple-800 cursor-pointer hover:shadow-md hover:-translate-y-px transition relative group"
                    >
                      <div className="font-semibold leading-tight pr-4 line-clamp-2">{e.title}</div>
                      <span className="text-[9px] opacity-70 mt-1.5 block uppercase font-bold tracking-wide">Подія</span>
                    </div>
                  ))}

                  {/* Contents */}
                  {dayContents.map(c => (
                    <div 
                      key={c.id}
                      onClick={() => setActiveView('content')}
                      className="text-xs p-2.5 rounded-lg border bg-blue-50 border-blue-200 text-blue-800 cursor-pointer hover:shadow-md hover:-translate-y-px transition relative group"
                    >
                      <div className="font-semibold leading-tight line-clamp-2">{c.focus || c.description}</div>
                      <span className="text-[9px] opacity-70 mt-1.5 block uppercase font-bold tracking-wide">Пост</span>
                    </div>
                  ))}

                  {/* Tasks */}
                  {dayCards.map(c => (
                    <div 
                      key={c.id}
                      onClick={() => setActiveView('board')}
                      className="text-xs p-2.5 rounded-lg border bg-orange-50 border-orange-200 text-orange-800 cursor-pointer hover:shadow-md hover:-translate-y-px transition relative flex flex-col justify-between"
                    >
                      <div className="font-semibold leading-tight line-clamp-2">{c.title}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[9px] opacity-70 uppercase font-bold tracking-wide">Дедлайн</span>
                        {c.assigneeId && state.users.find(u => u.id === c.assigneeId) && (
                          <img 
                            src={state.users.find(u => u.id === c.assigneeId)?.avatar} 
                            alt="avatar" 
                            className="w-4 h-4 rounded-full border border-orange-200 bg-white"
                          />
                        )}
                      </div>
                    </div>
                  ))}

                  {dayEvents.length === 0 && dayContents.length === 0 && dayCards.length === 0 && (
                    <div className="h-full min-h-[100px] flex items-center justify-center pt-4">
                       {/* Make a very subtle placehold when empty */}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
    </div>
  );
}

// ── KeepInCRM Source Bar Card ─────────────────────────────────────────────────

interface SourceCardProps {
  title: string;
  total: number;
  stats: KeepInCRMSourceStat[];
  color: 'blue' | 'green';
  icon: React.ReactNode;
}

function KeepInCRMSourceCard({ title, total, stats, color, icon }: SourceCardProps) {
  const colorMap = {
    blue: {
      bg: 'from-blue-50 to-sky-50',
      border: 'border-blue-100',
      text: 'text-blue-700',
      bar: 'bg-gradient-to-r from-blue-400 to-sky-500',
      barBg: 'bg-blue-100',
      icon: 'bg-blue-100 text-blue-600',
      label: 'text-blue-500',
    },
    green: {
      bg: 'from-emerald-50 to-teal-50',
      border: 'border-emerald-100',
      text: 'text-emerald-700',
      bar: 'bg-gradient-to-r from-emerald-400 to-teal-500',
      barBg: 'bg-emerald-100',
      icon: 'bg-emerald-100 text-emerald-600',
      label: 'text-emerald-500',
    },
  }[color];

  const maxCount = stats.length > 0 ? Math.max(...stats.map(s => s.count)) : 1;

  return (
    <div className="flex flex-col">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</p>
      <div className={`flex-1 bg-gradient-to-br ${colorMap.bg} rounded-xl border ${colorMap.border} p-4`}>
        {/* Total */}
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-7 h-7 rounded-lg ${colorMap.icon} flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
          <span className={`text-3xl font-black ${colorMap.text} leading-none`}>{total}</span>
          <span className="text-xs text-gray-400 mt-1">сьогодні</span>
        </div>

        {/* Source bars */}
        {stats.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Дані відсутні</p>
        ) : (
          <div className="space-y-2.5">
            {stats.slice(0, 5).map(s => (
              <div key={s.source}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-gray-600 font-medium truncate max-w-[120px]" title={s.source}>
                    {s.source}
                  </span>
                  <span className={`text-[11px] font-bold ${colorMap.label}`}>{s.count}</span>
                </div>
                <div className={`w-full ${colorMap.barBg} rounded-full h-1.5`}>
                  <div
                    className={`${colorMap.bar} h-1.5 rounded-full transition-all duration-700`}
                    style={{ width: `${(s.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {stats.length > 5 && (
              <p className="text-[10px] text-gray-400 mt-1">+ ще {stats.length - 5} джерел</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

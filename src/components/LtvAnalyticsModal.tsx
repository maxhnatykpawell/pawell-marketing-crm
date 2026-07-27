import React, { useState, useMemo } from 'react';
import { X, Search, Filter, Users, DollarSign, Gem, Tag } from 'lucide-react';

interface ClientLTV {
  id: string;
  name: string;
  revenue: number;
  agreementsCount: number;
  tags: string[];
  lastPurchaseDate?: string;
  purchaseMonths?: string[];
}

function getRfmSegment(client: ClientLTV): { label: string; color: string; icon: string } {
  if (!client.lastPurchaseDate) return { label: 'Звичайний', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: '🙂' };
  
  const daysSince = Math.floor((new Date().getTime() - new Date(client.lastPurchaseDate).getTime()) / (1000 * 3600 * 24));
  
  if (client.agreementsCount >= 3 && daysSince <= 90) return { label: 'Чемпіон', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: '👑' };
  if (client.agreementsCount >= 2 && daysSince <= 180) return { label: 'Лояльний', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: '🌟' };
  if (client.agreementsCount >= 2 && daysSince > 180) return { label: 'Сплячий', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: '💤' };
  if (client.agreementsCount === 1 && daysSince > 180) return { label: 'Зона ризику', color: 'bg-red-100 text-red-800 border-red-200', icon: '🚨' };
  if (client.agreementsCount === 1 && daysSince <= 60) return { label: 'Новий', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: '🆕' };
  
  return { label: 'Звичайний', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: '🙂' };
}

interface CohortData {
  size: number;
  retention: Record<number, number>;
}

function calculateCohorts(clients: ClientLTV[]): Record<string, CohortData> {
  const cohorts: Record<string, CohortData> = {};

  clients.forEach(c => {
    if (!c.purchaseMonths || c.purchaseMonths.length === 0) return;
    
    const sortedMonths = [...c.purchaseMonths].sort();
    const firstMonth = sortedMonths[0]; 
    
    if (!cohorts[firstMonth]) {
      cohorts[firstMonth] = { size: 0, retention: {} };
    }
    
    cohorts[firstMonth].size += 1;
    
    const [y1, m1] = firstMonth.split('-').map(Number);
    
    sortedMonths.forEach(mStr => {
      const [y2, m2] = mStr.split('-').map(Number);
      const diffMonths = (y2 - y1) * 12 + (m2 - m1);
      
      if (diffMonths >= 0) {
        cohorts[firstMonth].retention[diffMonths] = (cohorts[firstMonth].retention[diffMonths] || 0) + 1;
      }
    });
  });

  return cohorts;
}

interface StageStat {
  stage: string;
  count: number;
  avgOpenDays: number;
  avgCycleDays: number;
}

interface LtvAnalyticsModalProps {
  onClose: () => void;
  data: {
    totalLTVRevenue: number;
    uniqueClientsCount: number;
    ltv: number;
    clients: ClientLTV[];
    stageStats?: StageStat[];
  };
}

export default function LtvAnalyticsModal({ onClose, data }: LtvAnalyticsModalProps) {
  const [activeTab, setActiveTab] = useState<'clients' | 'funnel' | 'cohorts'>('clients');
  const [segment, setSegment] = useState<string>('all');
  const [rfmSegment, setRfmSegment] = useState<string>('all');
  const [searchTag, setSearchTag] = useState<string>('');
  const [topN, setTopN] = useState<number | 'all'>('all');
  
  const [closedStages, setClosedStages] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('pawell_closed_stages');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return ['Успішно реалізовано', 'Відмова'];
  });

  const toggleClosedStage = (stage: string) => {
    setClosedStages(prev => {
      const next = prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage];
      localStorage.setItem('pawell_closed_stages', JSON.stringify(next));
      return next;
    });
  };

  const allClients = data.clients || [];

  // Фільтрація клієнтів
  const filteredClients = useMemo(() => {
    let result = [...allClients];

    // 1. Фільтр по сегменту (B2B, B2C, B2G)
    if (segment !== 'all') {
      result = result.filter(c => {
        const clientTags = c.tags.map(t => t.toLowerCase());
        return clientTags.includes(segment.toLowerCase());
      });
    }

    // 2. Фільтр по RFM сегменту
    if (rfmSegment !== 'all') {
      result = result.filter(c => getRfmSegment(c).label === rfmSegment);
    }

    // 3. Фільтр по будь-якому введеному тегу (наприклад "батареї")
    if (searchTag.trim() !== '') {
      const q = searchTag.toLowerCase().trim();
      result = result.filter(c => {
        return c.tags.some(t => t.toLowerCase().includes(q));
      });
    }

    // 4. Сортування за доходом (вже відсортовано з бекенду, але для надійності)
    result.sort((a, b) => b.revenue - a.revenue);

    // 5. Фільтр по кількості (Топ N)
    if (topN !== 'all') {
      result = result.slice(0, topN);
    }

    return result;
  }, [allClients, segment, rfmSegment, searchTag, topN]);

  // Когорти
  const cohortsData = useMemo(() => calculateCohorts(filteredClients), [filteredClients]);
  const sortedCohortKeys = Object.keys(cohortsData).sort().reverse(); 
  const maxMonthOffset = Math.max(0, ...Object.values(cohortsData).flatMap((c: any) => Object.keys(c.retention).map(Number)));

  // Перерахунок LTV для поточної вибірки
  const sampleRevenue = filteredClients.reduce((sum, c) => sum + c.revenue, 0);
  const sampleCount = filteredClients.length;
  const sampleLtv = sampleCount > 0 ? Math.round(sampleRevenue / sampleCount) : 0;

  // Funnel calculations
  const allStages = data.stageStats || [];
  const wonStages = allStages.filter(s => closedStages.includes(s.stage));
  const openStages = allStages.filter(s => !closedStages.includes(s.stage)).sort((a, b) => b.avgOpenDays - a.avgOpenDays);

  const totalWonCount = wonStages.reduce((sum, s) => sum + s.count, 0);
  const totalCycleDays = wonStages.reduce((sum, s) => sum + (s.avgCycleDays * s.count), 0);
  const avgSalesCycle = totalWonCount > 0 ? Math.round(totalCycleDays / totalWonCount) : 0;
  const totalOpenCount = openStages.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
              <Gem className="w-6 h-6 text-purple-600" />
              Розширена Аналітика
            </h2>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button 
                onClick={() => setActiveTab('clients')}
                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeTab === 'clients' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Клієнти (LTV & RFM)
              </button>
              <button 
                onClick={() => setActiveTab('funnel')}
                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeTab === 'funnel' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Швидкість Воронки
              </button>
              <button 
                onClick={() => setActiveTab('cohorts')}
                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeTab === 'cohorts' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Утримання (Когорти)
              </button>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {activeTab === 'clients' && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 px-6 py-4 border-b border-gray-100 bg-white">
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Сегмент:</span>
            <select 
              value={segment} 
              onChange={e => setSegment(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-purple-400"
            >
              <option value="all">Всі B2B/B2C</option>
              <option value="B2B">Тільки B2B</option>
              <option value="B2C">Тільки B2C</option>
              <option value="B2G">Тільки B2G</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 ml-2">RFM:</span>
            <select 
              value={rfmSegment} 
              onChange={e => setRfmSegment(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-purple-400"
            >
              <option value="all">Всі клієнти</option>
              <option value="Чемпіон">Чемпіони 👑</option>
              <option value="Лояльний">Лояльні 🌟</option>
              <option value="Сплячий">Сплячі 💤</option>
              <option value="Новий">Нові 🆕</option>
              <option value="Зона ризику">Зона ризику 🚨</option>
            </select>
          </div>

          <div className="flex items-center gap-2 ml-4">
            <Search className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Пошук по тегу:</span>
            <input 
              type="text" 
              placeholder="Напр. 'батареї', 'ремонт'..."
              value={searchTag}
              onChange={e => setSearchTag(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-purple-400 w-48"
            />
          </div>

          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Розмір бази:</span>
            <select 
              value={topN === 'all' ? 'all' : topN.toString()} 
              onChange={e => setTopN(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-purple-400"
            >
              <option value="all">Всі клієнти</option>
              <option value="50">Топ-50</option>
              <option value="100">Топ-100</option>
              <option value="500">Топ-500</option>
              <option value="1000">Топ-1000</option>
            </select>
          </div>

          {allClients.length === 0 && (
            <div className="text-sm text-orange-500 font-medium ml-auto">
              Увага: Масив клієнтів пустий. Можливо, синхронізація ще не збирала ці дані. Оновіть LTV.
            </div>
          )}

        </div>

        {/* Dynamic Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-gray-50/50 flex-shrink-0">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Середній чек (LTV)</p>
              <p className="text-3xl font-black text-purple-600">{sampleLtv.toLocaleString('uk-UA')} ₴</p>
            </div>
            <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center">
              <Gem className="w-6 h-6 text-purple-500" />
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Загальний дохід групи</p>
              <p className="text-3xl font-black text-emerald-600">{sampleRevenue.toLocaleString('uk-UA')} ₴</p>
            </div>
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-emerald-500" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Клієнтів у вибірці</p>
              <p className="text-3xl font-black text-blue-600">{sampleCount.toLocaleString('uk-UA')}</p>
            </div>
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-500" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-white p-6 pt-0">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#e5e7eb]">Клієнт / RFM</th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#e5e7eb]">LTV (Сума)</th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#e5e7eb]">К-ть угод / Остання</th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#e5e7eb]">Теги</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredClients.map((client, index) => {
                const rfm = getRfmSegment(client);
                return (
                <tr key={client.id} className="hover:bg-gray-50/50 transition group">
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-400 w-6">{index + 1}.</span>
                        <span className="text-sm font-semibold text-gray-800">{client.name}</span>
                      </div>
                      <div className="flex ml-9">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${rfm.color}`}>
                          <span>{rfm.icon}</span> {rfm.label}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm font-bold text-gray-900">{client.revenue.toLocaleString('uk-UA')} ₴</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-gray-700">{client.agreementsCount}</span>
                      {client.lastPurchaseDate ? (
                        <span className="text-[10px] text-gray-500 font-medium">
                          {Math.floor((new Date().getTime() - new Date(client.lastPurchaseDate).getTime()) / (1000 * 3600 * 24))} дн. тому
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1.5">
                      {client.tags && client.tags.length > 0 ? (
                        client.tags.map(t => (
                          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">
                            <Tag className="w-2.5 h-2.5" />
                            {t}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-400 text-sm">
                    За вашими фільтрами не знайдено жодного клієнта
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
        )}

        {activeTab === 'funnel' && (
          <div className="flex-1 overflow-auto bg-gray-50 p-6 flex flex-col gap-6">
            
            {/* Configuration Panel */}
            <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-purple-800 font-bold text-sm">
                <span className="text-lg">⚙️</span>
                Налаштування воронки: Оберіть, які етапи є фінальними (Успішні або Відмова)
              </div>
              <p className="text-xs text-purple-600">
                Щоб ми могли правильно порахувати середній цикл угоди (Sales Cycle) і не враховувати закриті угоди у "вузьких місцях", виберіть ваші фінальні статуси нижче. (Натисніть на статуси, які є кінцевими).
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                {allStages.map(s => {
                  const isClosed = closedStages.includes(s.stage);
                  return (
                    <button
                      key={s.stage}
                      onClick={() => toggleClosedStage(s.stage)}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-all ${
                        isClosed 
                          ? 'bg-purple-600 text-white border-purple-700 shadow-md scale-105' 
                          : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-600 opacity-70'
                      }`}
                    >
                      {s.stage} ({s.count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-14 h-14 bg-purple-50 rounded-xl flex items-center justify-center">
                  <Gem className="w-7 h-7 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider mb-1">Середній цикл угоди</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-4xl font-black text-gray-900">{avgSalesCycle}</p>
                    <p className="text-sm font-semibold text-gray-400">днів</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">на основі {totalWonCount} закритих угод</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">⏳</span>
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider mb-1">Відкритих угод у воронці</p>
                  <p className="text-4xl font-black text-gray-900">
                    {totalOpenCount}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">аналізуються на вузькі місця</p>
                </div>
              </div>
            </div>

            {/* Bottlenecks Chart */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex-1 flex flex-col min-h-[400px]">
              <h3 className="text-base font-black text-gray-800 mb-6 flex items-center gap-2">
                Вузькі місця (Скільки днів висять поточні відкриті угоди)
              </h3>
              
              {openStages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Немає відкритих угод для аналізу</div>
              ) : (
                <div className="flex-1 flex items-end gap-4 overflow-x-auto pb-4 pt-10">
                  {openStages.map((b, i) => {
                    // Знаходимо максимальне значення для пропорції висоти
                    const maxDays = Math.max(...openStages.map(x => x.avgOpenDays));
                    const heightPercent = maxDays > 0 ? (b.avgOpenDays / maxDays) * 100 : 0;
                    
                    return (
                      <div key={i} className="flex flex-col items-center flex-1 min-w-[80px] group relative">
                        <div className="absolute -top-8 bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-10">
                          {b.count} угод(и)
                        </div>
                        <div className="w-full flex justify-center h-[200px] items-end">
                          <div 
                            className="w-12 bg-gradient-to-t from-orange-200 to-orange-400 rounded-t-md transition-all duration-500 hover:from-orange-300 hover:to-orange-500 relative flex justify-center"
                            style={{ height: `${Math.max(10, heightPercent)}%` }}
                          >
                            <span className="absolute -top-6 text-sm font-black text-gray-700">{b.avgOpenDays} д.</span>
                          </div>
                        </div>
                        <div className="mt-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center h-10 overflow-hidden text-ellipsis line-clamp-2 px-1">
                          {b.stage}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {activeTab === 'cohorts' && (
          <div className="flex-1 overflow-auto bg-gray-50 p-6 flex flex-col gap-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
              <h3 className="text-base font-black text-gray-800 mb-2">Когортний Аналіз (Утримання)</h3>
              <p className="text-sm text-gray-500 mb-6">Відсоток клієнтів, які повернулися за покупками в наступні місяці (застосовано поточні фільтри).</p>

              {sortedCohortKeys.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">Немає даних про дати покупок для розрахунку когорт.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr>
                        <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">Когорта</th>
                        <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 text-center">Розмір</th>
                        {Array.from({ length: maxMonthOffset + 1 }).map((_, i) => (
                          <th key={i} className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 text-center w-16">M{i}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedCohortKeys.map(cohortMonth => {
                        const row = cohortsData[cohortMonth];
                        return (
                          <tr key={cohortMonth} className="hover:bg-gray-50/50 transition">
                            <td className="py-3 px-4 text-sm font-bold text-gray-800">{cohortMonth}</td>
                            <td className="py-3 px-4 text-sm font-bold text-blue-600 text-center">{row.size}</td>
                            {Array.from({ length: maxMonthOffset + 1 }).map((_, i) => {
                              const count = row.retention[i] || 0;
                              const percent = row.size > 0 ? Math.round((count / row.size) * 100) : 0;
                              
                              // Колір залежно від відсотка (чим більше тим зеленіше), M0 завжди 100%
                              let bgClass = 'bg-transparent';
                              let textClass = 'text-gray-400';
                              
                              if (count > 0) {
                                if (i === 0) {
                                  bgClass = 'bg-emerald-50';
                                  textClass = 'text-emerald-700';
                                } else if (percent >= 50) {
                                  bgClass = 'bg-emerald-500';
                                  textClass = 'text-white font-bold';
                                } else if (percent >= 20) {
                                  bgClass = 'bg-emerald-300';
                                  textClass = 'text-emerald-900 font-bold';
                                } else if (percent >= 1) {
                                  bgClass = 'bg-emerald-100';
                                  textClass = 'text-emerald-800';
                                }
                              }

                              return (
                                <td key={i} className="p-1">
                                  <div className={`w-full h-10 flex items-center justify-center rounded text-xs ${bgClass} ${textClass}`}>
                                    {count > 0 ? `${percent}%` : '-'}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

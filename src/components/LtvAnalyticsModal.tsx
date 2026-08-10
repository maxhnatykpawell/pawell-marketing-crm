import React, { useState, useMemo, useEffect } from 'react';
import { X, Users, DollarSign, Gem, Download, ArrowUp, ArrowDown, AlertTriangle, Loader2 } from 'lucide-react';
import { getKeepInCRMLTVClients } from '../api';
import { LTV_HORIZONS, CohortLtvRow, CohortLtvHorizon } from '../lib/cohortLtv';
import { describePeriod } from './PeriodPicker';
import ClientFilterBar from './analytics/ClientFilterBar';
import RevenueDistributionCard from './analytics/RevenueDistribution';
import {
  ClientRecord as ClientLTV, EnrichedClient, ClientFilters, EMPTY_FILTERS,
  SortKey, SortDir, SORT_LABELS,
  enrichClients, applyFilters, sortClients, collectTags, collectCohortMonths,
  computeDistribution, clientsToCsv,
} from '../lib/clientAnalytics';

/** Заголовок колонки, що керує сортуванням; напрямок показано стрілкою */
function SortableTh({
  label, sortKey: key, active, dir, onSort, align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const isActive = active === key;
  return (
    <th
      className={`py-3 px-4 sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#e5e7eb] ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <button
        onClick={() => onSort(key)}
        title={`Сортувати за: ${SORT_LABELS[key]}`}
        className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider transition ${
          isActive ? 'text-purple-700' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {label}
        {isActive
          ? (dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowDown className="w-3 h-3 opacity-0" />}
      </button>
    </th>
  );
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

/** Скільки місяців показувати в матриці, щоб таблиця лишалась читабельною */
const LTV_MAX_MONTHS = 24;

interface LtvAnalyticsModalProps {
  onClose: () => void;
  data: {
    totalLTVRevenue: number;
    uniqueClientsCount: number;
    ltv: number;
    stageStats?: StageStat[];
    /** Помилка останньої синхронізації, якщо вона впала */
    lastSyncError?: string | null;
    cohortLtv?: {
      rows: CohortLtvRow[];
      horizons: Record<number, CohortLtvHorizon | null>;
    };
    /** Діапазон, яким обмежено вивантаження; null = за весь час */
    scopedTo?: { from: string | null; to: string | null } | null;
  };
}

export default function LtvAnalyticsModal({ onClose, data }: LtvAnalyticsModalProps) {
  const [activeTab, setActiveTab] = useState<'clients' | 'funnel' | 'cohorts'>('clients');
  const [filters, setFilters] = useState<ClientFilters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  /** Ліміт РЯДКІВ у таблиці. Метрики рахуються по всій вибірці, а не по зрізу. */
  const [limit, setLimit] = useState<number | 'all'>('all');

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

  // Клієнти лежать окремо від агрегатів і можуть важити мегабайти — тягнемо їх
  // тут, а не разом зі знімком для картки на дашборді.
  const [allClients, setAllClients] = useState<ClientLTV[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getKeepInCRMLTVClients();
        if (!cancelled) setAllClients(list);
      } catch (e: any) {
        if (!cancelled) setClientsError(e.message || 'Не вдалось завантажити клієнтів');
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Похідні поля рахуємо один раз, а не на кожен фільтр
  const enriched = useMemo(() => enrichClients(allClients), [allClients]);

  const tagOptions = useMemo(() => collectTags(allClients), [allClients]);
  const cohortOptions = useMemo(() => collectCohortMonths(enriched), [enriched]);

  /** Вибірка після фільтрів — саме на ній рахуються ВСІ метрики */
  const filteredClients = useMemo(
    () => sortClients(applyFilters(enriched, filters), sortKey, sortDir),
    [enriched, filters, sortKey, sortDir],
  );

  /** Зріз лише для показу в таблиці */
  const visibleClients = useMemo(
    () => (limit === 'all' ? filteredClients : filteredClients.slice(0, limit)),
    [filteredClients, limit],
  );

  const distribution = useMemo(() => computeDistribution(filteredClients), [filteredClients]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Для тексту природний порядок за зростанням, для чисел — за спаданням
      setSortDir(key === 'name' || key === 'cohort' ? 'asc' : 'desc');
    }
  };

  const exportCsv = () => {
    const blob = new Blob(['﻿' + clientsToCsv(filteredClients)], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Когорти
  const cohortsData = useMemo(() => calculateCohorts(filteredClients), [filteredClients]);
  const sortedCohortKeys = Object.keys(cohortsData).sort().reverse(); 
  const maxMonthOffset = Math.max(0, ...Object.values(cohortsData).flatMap((c: any) => Object.keys(c.retention).map(Number)));

  // ── Когортний LTV (з сервера, по всіх клієнтах) ────────────────────────────
  const ltvCohortRows = useMemo(
    () => [...(data.cohortLtv?.rows ?? [])].sort((a, b) => b.month.localeCompare(a.month)),
    [data.cohortLtv],
  );
  const ltvMaxOffset = Math.min(
    LTV_MAX_MONTHS,
    Math.max(0, ...ltvCohortRows.map(r => r.maxOffset)),
  );
  const ltvMaxValue = Math.max(0, ...ltvCohortRows.flatMap(r => Object.values(r.ltvByOffset)));

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
                Клієнти (ARPU & RFM)
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
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={filteredClients.length === 0}
              title="Вивантажити поточну вибірку в CSV"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:border-purple-300 hover:text-purple-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Фільтри живуть над вкладками: вони впливають на вміст усіх трьох,
            тож ховати їх на двох із них означало б приховати активний стан. */}
        <ClientFilterBar
          filters={filters}
          onChange={setFilters}
          tags={tagOptions}
          cohorts={cohortOptions}
          totalCount={allClients.length}
          filteredCount={filteredClients.length}
        />

        {clientsError && (
          <div className="flex items-center gap-2 px-6 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {clientsError}
          </div>
        )}

        {data.lastSyncError && (
          <div className="flex items-center gap-2 px-6 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Остання синхронізація впала: {data.lastSyncError}. Дані нижче застарілі.
          </div>
        )}

        {activeTab === 'clients' && (
          <>
            {clientsLoading && (
              <div className="flex items-center justify-center gap-2 px-6 py-3 text-sm text-gray-500 bg-gray-50 border-b border-gray-100">
                <Loader2 className="w-4 h-4 animate-spin" />
                Завантаження списку клієнтів...
              </div>
            )}

            {!clientsLoading && !clientsError && allClients.length === 0 && (
              <div className="px-6 py-3 text-sm text-orange-600 bg-orange-50 border-b border-orange-100">
                Список клієнтів порожній — можливо, синхронізація ще не збирала ці дані.
              </div>
            )}

            <div className="flex-1 overflow-auto bg-gray-50/50">
              {/* Метрики вибірки */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 pb-0">
                {[
                  { label: 'Дохід на клієнта (ARPU)', value: `${distribution.mean.toLocaleString('uk-UA')} ₴`, tone: 'text-purple-600', bg: 'bg-purple-50', icon: <Gem className="w-6 h-6 text-purple-500" /> },
                  { label: 'Загальний дохід вибірки', value: `${distribution.total.toLocaleString('uk-UA')} ₴`, tone: 'text-emerald-600', bg: 'bg-emerald-50', icon: <DollarSign className="w-6 h-6 text-emerald-500" /> },
                  { label: 'Клієнтів у вибірці', value: distribution.count.toLocaleString('uk-UA'), tone: 'text-blue-600', bg: 'bg-blue-50', icon: <Users className="w-6 h-6 text-blue-500" /> },
                ].map(m => (
                  <div key={m.label} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">{m.label}</p>
                      <p className={`text-3xl font-black ${m.tone} truncate`}>{m.value}</p>
                    </div>
                    <div className={`w-12 h-12 ${m.bg} rounded-full flex items-center justify-center flex-shrink-0 ml-3`}>
                      {m.icon}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-6">
                <RevenueDistributionCard dist={distribution} />
              </div>

              {/* Таблиця */}
              <div className="px-6 pb-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-white">
                  <SortableTh label="Клієнт / RFM" sortKey="name"     active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Дохід"        sortKey="revenue"  active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                  <SortableTh label="Угод"         sortKey="deals"    active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                  <SortableTh label="Середній чек" sortKey="avgCheck" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                  <SortableTh label="Остання"      sortKey="recency"  active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                  <SortableTh label="Когорта"      sortKey="cohort"   active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#e5e7eb]">Теги</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleClients.map((client, index) => (
                  <tr key={client.id} className="hover:bg-gray-50/50 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-300 w-6 flex-shrink-0">{index + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate" title={client.name}>{client.name}</p>
                          <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${client.rfm.color}`}>
                            <span>{client.rfm.icon}</span> {client.rfm.label}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm font-bold text-gray-900 whitespace-nowrap">
                        {client.revenue.toLocaleString('uk-UA')} ₴
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-medium text-gray-700">
                      {client.agreementsCount}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-gray-600 whitespace-nowrap">
                      {client.avgCheck.toLocaleString('uk-UA')} ₴
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {client.recencyDays !== null ? (
                        <span className="text-xs text-gray-500">{client.recencyDays} дн.</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">
                      {client.cohortMonth ?? '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {client.tags.length > 0 ? client.tags.map(t => (
                          <button
                            key={t}
                            onClick={() => setFilters(f => f.tagsInclude.includes(t) ? f : { ...f, tagsInclude: [...f.tagsInclude, t] })}
                            title={`Відфільтрувати за тегом «${t}»`}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap hover:bg-purple-100 hover:text-purple-700 hover:border-purple-200 transition"
                          >
                            {t}
                          </button>
                        )) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400 text-sm">
                      За цими фільтрами жодного клієнта не знайдено
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Ліміт показу — саме показу: метрики вище рахуються по всій вибірці */}
            {filteredClients.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                <span className="text-xs text-gray-500">
                  Показано {visibleClients.length.toLocaleString('uk-UA')} з {filteredClients.length.toLocaleString('uk-UA')}
                  <span className="text-gray-400"> · метрики й CSV — по всій вибірці</span>
                </span>
                <div className="flex items-center gap-1">
                  {([50, 100, 500, 'all'] as const).map(n => (
                    <button
                      key={String(n)}
                      onClick={() => setLimit(n)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                        limit === n ? 'bg-purple-600 text-white' : 'text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {n === 'all' ? 'Всі' : n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
              </div>
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

            {/* ── Когортний LTV ──────────────────────────────────────────────
                На відміну від таблиці утримання вище, ці числа приходять з сервера
                і рахуються по ВСІХ клієнтах — фільтри вибірки на них не впливають. */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
              <h3 className="text-base font-black text-gray-800 mb-2">Когортний LTV</h3>
              <p className="text-sm text-gray-500 mb-1">
                Накопичений середній дохід з одного клієнта через N місяців після першої покупки.
              </p>
              <p className="text-xs text-gray-400 mb-6">
                Рахується по всіх клієнтах — фільтри та пошук на цю таблицю не впливають.
                {data.scopedTo && (
                  <span className="text-amber-600 font-semibold">
                    {' '}Синхронізовано лише за {describePeriod({ key: 'custom', ...data.scopedTo })}, тож LTV занижений.
                  </span>
                )}
              </p>

              {!ltvCohortRows.length ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  Немає даних про когорти. Запустіть синхронізацію LTV.
                </div>
              ) : (
                <>
                  {/* Зведення по горизонтах */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {LTV_HORIZONS.map(h => {
                      const stat = data.cohortLtv?.horizons?.[h] ?? null;
                      return (
                        <div key={h} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            LTV · {h} міс.
                          </p>
                          {stat ? (
                            <>
                              <p className="text-xl font-black text-purple-700 mt-1">
                                {stat.ltv.toLocaleString('uk-UA')} ₴
                              </p>
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                {stat.cohorts} когорт · {stat.clients} клієнтів
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-gray-400 italic mt-2">
                              ще немає когорт такого віку
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                      <thead>
                        <tr>
                          <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">Когорта</th>
                          <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 text-center">Розмір</th>
                          {Array.from({ length: ltvMaxOffset + 1 }).map((_, i) => (
                            <th key={i} className="py-3 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 text-center">M{i}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {ltvCohortRows.map(row => (
                          <tr key={row.month} className="hover:bg-gray-50/50 transition">
                            <td className="py-3 px-4 text-sm font-bold text-gray-800 whitespace-nowrap">{row.month}</td>
                            <td className="py-3 px-4 text-sm font-bold text-blue-600 text-center">{row.size}</td>
                            {Array.from({ length: ltvMaxOffset + 1 }).map((_, i) => {
                              // Когорта ще не дожила до цього зміщення — комірки немає,
                              // і це принципово інше, ніж «дохід нульовий».
                              if (i > row.maxOffset) {
                                return <td key={i} className="p-1"><div className="w-full h-10" /></td>;
                              }
                              const value = row.ltvByOffset[i] ?? 0;
                              const intensity = ltvMaxValue > 0 ? value / ltvMaxValue : 0;
                              return (
                                <td key={i} className="p-1">
                                  <div
                                    className="w-full h-10 flex items-center justify-center rounded text-[11px] font-semibold whitespace-nowrap"
                                    style={{
                                      backgroundColor: `rgba(139, 92, 246, ${Math.max(0.06, intensity * 0.85)})`,
                                      color: intensity > 0.5 ? '#fff' : '#4c1d95',
                                    }}
                                    title={`${row.month}, ${i} міс.: ${value.toLocaleString('uk-UA')} ₴ на клієнта`}
                                  >
                                    {value > 0 ? value.toLocaleString('uk-UA') : '—'}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

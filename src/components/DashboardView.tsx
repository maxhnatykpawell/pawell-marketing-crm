import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../App';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, subDays } from 'date-fns';
import { uk } from 'date-fns/locale';
import { TrendingUp, TrendingDown, Target, Edit2, Check, Calendar as CalendarIcon, Send, Loader2, RefreshCw, Users, Zap, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Metric, KeepInCRMHistoryResponse, KeepInCRMSourceStat, KeepInCRMAgreementStat } from '../types';
import { getKeepInCRMHistory, triggerKeepInCRMSync, triggerKeepInCRMHistorySync, getKeepInCRMSyncStatus, getKeepInCRMLTV, triggerKeepInCRMSyncLTV } from '../api';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, Gem, ExternalLink, Wallet } from 'lucide-react';
import LtvAnalyticsModal from './LtvAnalyticsModal';
import PeriodPicker, { PeriodKey, PeriodValue, makePeriod, describePeriod } from './PeriodPicker';
import LtvSyncDialog from './LtvSyncDialog';
import {
  sumSpend, computeCac, cacBySource, previousRange,
  DEFAULT_CURRENCY_RATES, AD_SPEND_CATEGORY,
  CacScope, CacResult, SourceCacResult, SpendBreakdown,
} from '../lib/cac';

/**
 * Скільки днів когорта «дозріває», перш ніж її конверсію можна вважати усталеною.
 * Лід, залучений сьогодні, ще не встиг стати клієнтом, тому свіжі дні завжди
 * занижують конверсію. Підберіть під реальний цикл угоди у вашому відділі.
 */
const COHORT_MATURITY_DAYS = 14;

/** Що кладемо в чисельник CAC — вибір зберігається між сеансами */
const CAC_SCOPE_KEY = 'pawell_cac_scope';

function loadCacScope(): CacScope {
  try {
    return localStorage.getItem(CAC_SCOPE_KEY) === 'all' ? 'all' : 'ads';
  } catch {
    return 'ads';
  }
}

export default function DashboardView() {
  const { state, updateMetric, setActiveView, setActiveEventId, currentUser, updateSettings, hasEditRights } = useAppContext();
  
  const [editingMetric, setEditingMetric] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Metric>>({});
  const [isSendingReport, setIsSendingReport] = useState(false);

  // ── KeepInCRM State ──────────────────────────────────────────────────────────
  /** Пресети дашборда: тут завжди є конкретні межі, «весь час» не має сенсу */
  const K_PRESETS: PeriodKey[] = ['today', 'yesterday', '7d', '30d', 'month', 'custom'];
  const [kPeriod, setKPeriod]     = useState<PeriodValue>(() => makePeriod('today'));
  const [kData, setKData]         = useState<KeepInCRMHistoryResponse | null>(null);
  const [kLoading, setKLoading]   = useState(true);
  const [kSyncing, setKSyncing]   = useState(false);
  const [kError, setKError]       = useState<string | null>(null);
  
  // ── LTV State ────────────────────────────────────────────────────────────────
  const [ltvData, setLtvData]     = useState<any>(null);
  /** Зведений LTV на горизонті 12 міс; null поки жодна когорта не дожила до нього */
  const ltv12 = ltvData?.cohortLtv?.horizons?.[12] ?? null;
  const [ltvLoading, setLtvLoading] = useState(true);
  const [ltvSyncing, setLtvSyncing] = useState(false);
  const [ltvError, setLtvError]     = useState<string | null>(null);
  const [isLtvModalOpen, setIsLtvModalOpen] = useState(false);
  const [isLtvSyncOpen, setIsLtvSyncOpen]   = useState(false);

  // ── CAC ──────────────────────────────────────────────────────────────────────
  const [cacScope, setCacScope] = useState<CacScope>(loadCacScope);
  const changeCacScope = (s: CacScope) => {
    setCacScope(s);
    try { localStorage.setItem(CAC_SCOPE_KEY, s); } catch { /* приватний режим */ }
  };

  // ── History sync progress (polling) ──────────────────────────────────────────
  const [hSyncRunning, setHSyncRunning] = useState(false);
  const [hSyncDone, setHSyncDone]       = useState(0);
  const [hSyncTotal, setHSyncTotal]     = useState(0);
  const [hSyncPct, setHSyncPct]         = useState(0);
  const [hSyncDate, setHSyncDate]       = useState('');
  const [hSyncError, setHSyncError]     = useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const loadKData = useCallback(async (p: PeriodValue) => {
    // Дашборд завжди працює з конкретним діапазоном; порожні межі означають, що
    // користувач ще не добрав довільний період — запит робити нема з чим.
    if (!p.from || !p.to) return;
    setKLoading(true);
    setKError(null);
    try {
      const data = await getKeepInCRMHistory(p.from, p.to, true);
      setKData(data);
    } catch (e: any) {
      setKError(e.message || 'Не вдалось завантажити дані KeepInCRM');
    } finally {
      setKLoading(false);
    }
  }, []);

  useEffect(() => { loadKData(kPeriod); }, [kPeriod, loadKData]);

  const loadLTV = useCallback(async () => {
    setLtvLoading(true);
    try {
      const data = await getKeepInCRMLTV();
      setLtvData(data);
    } catch { } finally {
      setLtvLoading(false);
    }
  }, []);

  useEffect(() => { loadLTV(); }, [loadLTV]);

  /** Polling: читає /api/keepincrm/sync-status кожні 1.5с поки синх активний */
  const startPolling = useCallback((currentPeriod: PeriodValue) => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const st = await getKeepInCRMSyncStatus();
        setHSyncDone(st.done);
        setHSyncTotal(st.total);
        setHSyncPct(st.pct);
        setHSyncDate(st.currentDate);
        setHSyncRunning(st.running);
        if (st.error) setHSyncError(st.error);
        if (!st.running) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          if (!st.error) await loadKData(currentPeriod);
        }
      } catch { /* ігноруємо помилки polling */ }
    }, 1500);
  }, [loadKData]);

  // При монтуванні — перевіряємо чи синх вже йде (перезавантаження сторінки під час синху)
  useEffect(() => {
    (async () => {
      try {
        const st = await getKeepInCRMSyncStatus();
        if (st.running) {
          setHSyncRunning(true);
          setHSyncDone(st.done);
          setHSyncTotal(st.total);
          setHSyncPct(st.pct);
          setHSyncDate(st.currentDate);
          startPolling(kPeriod);
        }
      } catch { /* ігноруємо */ }
    })();
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKSync = async () => {
    setKSyncing(true);
    setKError(null);
    try {
      await triggerKeepInCRMSync();
      await loadKData(kPeriod);
    } catch (e: any) {
      setKError(e.message || 'Помилка синхронізації');
    } finally {
      setKSyncing(false);
    }
  };

  const handleLTVSync = async (period: PeriodValue) => {
    setLtvSyncing(true);
    setLtvError(null);
    try {
      const res = await triggerKeepInCRMSyncLTV(period.from, period.to);
      setLtvData(res.snapshot);
      setIsLtvSyncOpen(false);
    } catch (e: any) {
      setLtvError(e.message || 'Не вдалось порахувати LTV');
    } finally {
      setLtvSyncing(false);
    }
  };

  const handleKHistorySync = async () => {
    if (hSyncRunning) return;
    if (!window.confirm('Це завантажить історію за останні 30 днів. Процес іде у фоні, ви можете продовжувати роботу. Продовжити?')) return;
    setHSyncError(null);
    setHSyncDone(0);
    setHSyncPct(0);
    try {
      const result = await triggerKeepInCRMHistorySync(30);
      if (result.success) {
        // Запущено у фоні — стартуємо polling
        setHSyncRunning(true);
        setHSyncTotal(30);
        startPolling(kPeriod);
      } else {
        // 409: вже виконується — підключаємось до прогресу
        setHSyncRunning(true);
        startPolling(kPeriod);
      }
    } catch (e: any) {
      setHSyncError(e.message || 'Помилка запуску синхронізації');
    }
  };


  /**
   * Дні періоду, чиї когорти ще не дозріли. Конверсія по них свідомо занижена —
   * частина лідів просто не встигла конвертнутись.
   */
  const immatureDates = React.useMemo(() => {
    if (!kData) return [] as string[];
    const cutoff = format(subDays(new Date(), COHORT_MATURITY_DAYS), 'yyyy-MM-dd');
    return kData.entries.map(e => e.date).filter(d => d > cutoff).sort();
  }, [kData]);

  /**
   * CAC за обраний період.
   *
   * Чисельник — витрати з розділу «Витрати» за ті самі дати, знаменник —
   * когортні клієнти з KeepInCRM. Обидва числа вже є в системі, лишалось звести
   * їх в одному періоді й в одній валюті.
   */
  const cacData = React.useMemo(() => {
    if (!kData) return null;
    const { from, to } = kData.period;
    if (!from || !to) return null;

    const expenses = state.expenses || [];
    const rates = state.currencyRates ?? DEFAULT_CURRENCY_RATES;
    const prev = previousRange(from, to);

    const spend     = sumSpend(expenses, from, to, cacScope, rates);
    const prevSpend = sumSpend(expenses, prev.from, prev.to, cacScope, rates);

    // LTV на горизонті 12 міс, поки він є; інакше ARPU — це те саме число, що
    // показує картка LTV поруч, тож співвідношення не суперечитиме сусідній плитці.
    const ltv = ltv12?.ltv ?? ltvData?.ltv ?? null;

    const result = computeCac({
      spend: spend.total,
      newClients: kData.aggregated.totalClients,
      acquired: kData.aggregated.totalAcquired,
      prevSpend: prevSpend.total,
      prevClients: kData.comparison?.totalClients ?? 0,
      ltv,
    });

    return {
      result,
      spend,
      bySource: cacBySource(spend.bySource, kData.aggregated.clientsBySource || []),
      ltvBasis: ltv12 ? 'LTV 12 міс' : 'ARPU',
      hasComparison: kData.comparison !== null,
      /** Курси ніхто не вводив, а валютні витрати є — сума приблизна */
      ratesUnset: spend.hasForeign && !state.currencyRates,
    };
  }, [kData, state.expenses, state.currencyRates, cacScope, ltv12, ltvData]);

  /**
   * Дані для графіків. Знімки, зняті до переходу на когортну модель, не мають
   * totalAcquiredToday — добудовуємо його з лідів і клієнтів, це той самий набір.
   */
  const chartData = React.useMemo(
    () => (kData?.entries ?? []).map(e => ({
      ...e,
      acquired: e.totalAcquiredToday ?? ((e.totalLeadsToday || 0) + (e.totalClientsToday || 0)),
    })),
    [kData],
  );

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
        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          {/* Icon + title */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-800 truncate">KeepInCRM Analytics</h3>
              {kData && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {kData.period.from === kData.period.to
                    ? kData.period.from
                    : `${kData.period.from} — ${kData.period.to}`
                  }
                  {' · '}{kData.entries.length} днів з даними
                </p>
              )}
            </div>
          </div>

          {/* Period picker */}
          <PeriodPicker
            value={kPeriod}
            onChange={setKPeriod}
            presets={K_PRESETS}
            disabled={kLoading && !kData}
          />

          {/* Sync button (admin only) */}
          {currentUser?.role === 'admin' && (
            <div className="flex gap-2">
              <button
                onClick={handleKHistorySync}
                disabled={hSyncRunning || kSyncing}
                title={hSyncRunning ? `Синхронізація виконується (${hSyncDone}/${hSyncTotal} днів)` : 'Синхронізувати історію (30 днів)'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${hSyncRunning ? 'animate-spin' : ''}`} />
                {hSyncRunning ? `${hSyncDone}/${hSyncTotal} днів...` : 'Синх. історію (30д)'}
              </button>
              <button
                onClick={() => setIsLtvSyncOpen(true)}
                disabled={ltvSyncing || hSyncRunning}
                title="Порахувати LTV за обраний період"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${ltvSyncing ? 'animate-spin' : ''}`} />
                {ltvSyncing ? 'Рахуємо...' : 'LTV'}
              </button>
              <button
                onClick={handleKSync}
                disabled={kSyncing || hSyncRunning}
                title="Синхронізувати зараз"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${kSyncing ? 'animate-spin' : ''}`} />
                {kSyncing ? 'Онов...' : 'Оновити'}
              </button>
            </div>
          )}
        </div>

        {/* History sync progress bar */}
        {hSyncRunning && (
          <div className="px-6 pb-3 pt-2 border-b border-gray-100 bg-orange-50/50">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-orange-700 font-medium flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Синхронізація: {hSyncDone} з {hSyncTotal} днів
                {hSyncDate && <span className="text-orange-400 font-normal">· {hSyncDate}</span>}
              </span>
              <span className="text-xs font-bold text-orange-600">{hSyncPct}%</span>
            </div>
            <div className="w-full bg-orange-100 rounded-full h-1.5">
              <div
                className="bg-gradient-to-r from-orange-400 to-amber-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(2, hSyncPct)}%` }}
              />
            </div>
          </div>
        )}
        {hSyncError && !hSyncRunning && (
          <div className="px-6 pb-3 pt-2">
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              Помилка синхронізації: {hSyncError}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6">

          {kLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Завантаження даних...</span>
            </div>
          ) : kError ? (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{kError}
            </div>
          ) : !kData ? (
            <div className="text-center py-8 text-gray-400">
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Дані ще не синхронізовані.</p>
              <p className="text-xs mt-1">Додайте KEEPINCRM_API_KEY у змінні середовища.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">

              {/* Залучено (когорта періоду) */}
              <KeepInCRMSourceCard
                title="Залучено за період"
                total={kData.aggregated.totalAcquired}
                stats={kData.aggregated.acquiredBySource}
                color="blue"
                icon={<Users className="w-4 h-4" />}
                change={kData.comparison?.acquiredChange ?? null}
              />

              {/* Скільки з цієї когорти вже конвертувалось */}
              <KeepInCRMSourceCard
                title="Стали клієнтами"
                total={kData.aggregated.totalClients}
                stats={kData.aggregated.clientsBySource}
                color="green"
                icon={<Target className="w-4 h-4" />}
                change={kData.comparison?.clientsChange ?? null}
              />
              
              {/* Agreements */}
              <KeepInCRMSourceCard
                title="Угоди за період"
                total={kData.aggregated.totalAgreements || 0}
                stats={kData.aggregated.agreementsBySource || []}
                color="yellow"
                icon={<DollarSign className="w-4 h-4" />}
                change={kData.comparison?.agreementsChange ?? null}
                subTotal={kData.aggregated.totalAgreementsSum ? `${kData.aggregated.totalAgreementsSum.toLocaleString('uk-UA')} ₴` : undefined}
                showSum
              />

              {/* Avg Deal Value */}
              <AvgDealCard
                totalSum={kData.aggregated.totalAgreementsSum ?? 0}
                totalCount={kData.aggregated.totalAgreements ?? 0}
                bySource={kData.aggregated.agreementsBySource ?? []}
                sumChange={kData.comparison?.agreementsSumChange ?? null}
                countChange={kData.comparison?.agreementsChange ?? null}
              />

              {/* Когортний LTV на горизонті 12 міс. ARPU лишається довідковим числом нижче. */}
              <div className="flex flex-col">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">LTV клієнта</p>
                <div 
                  onClick={() => ltvData && setIsLtvModalOpen(true)}
                  className={`flex-1 flex flex-col justify-center bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-100 p-5 relative overflow-hidden transition-all ${ltvData ? 'cursor-pointer hover:shadow-md hover:border-purple-300 group' : ''}`}
                  title={ltvData ? 'Натисніть для детальної аналітики' : ''}
                >
                  {ltvLoading ? (
                    <div className="flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-purple-400" /></div>
                  ) : ltvData ? (
                    <>
                      <div className="flex items-center justify-between text-purple-600 mb-1 relative z-10">
                        <div className="flex items-center">
                          <Gem className="w-4 h-4 mr-1.5" />
                          <span className="text-sm font-semibold tracking-wide">
                            {ltv12 ? 'За 12 місяців' : 'ARPU · за весь час'}
                          </span>
                        </div>
                        <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>

                      {ltv12 ? (
                        <>
                          <span className="text-3xl font-black text-gray-900 mt-1 relative z-10">
                            {ltv12.ltv.toLocaleString('uk-UA')} ₴
                          </span>
                          <p className="text-xs text-gray-500 mt-2 font-medium relative z-10">
                            по {ltv12.cohorts} зрілих когортах · {ltv12.clients} клієнтів
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5 relative z-10">
                            ARPU за весь час: {ltvData.ltv?.toLocaleString('uk-UA') ?? 0} ₴
                          </p>
                        </>
                      ) : (
                        <>
                          <span className="text-3xl font-black text-gray-900 mt-1 relative z-10">
                            {ltvData.ltv?.toLocaleString('uk-UA') ?? 0} ₴
                          </span>
                          <p className="text-xs text-gray-500 mt-2 font-medium relative z-10">
                            Клієнтів, що купили: {ltvData.uniqueClientsCount ?? 0}
                          </p>
                          {/* Жодна когорта ще не прожила 12 міс — чесніше показати ARPU */}
                          <p className="text-[11px] text-amber-600 mt-1 relative z-10">
                            ⏳ Для LTV бракує когорт віком 12 міс.
                          </p>
                        </>
                      )}

                      {ltvData.scopedTo && (
                        <p className="text-[11px] text-amber-600 mt-1 relative z-10">
                          ⚠️ Дані лише за {describePeriod({ key: 'custom', ...ltvData.scopedTo })} — LTV занижений
                        </p>
                      )}


                      <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:scale-110 transition-transform duration-300">
                        <Gem className="w-24 h-24 text-purple-600" />
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400 text-center relative z-10">Немає даних</span>
                  )}
                </div>
              </div>

              {/* Когортна конверсія */}
              <div className="flex flex-col">
                <p
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3"
                  title="Яка частка записів, залучених у цей період, вже стала клієнтами"
                >
                  Конверсія когорти
                </p>
                <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl border border-violet-100 p-6">
                  <span className="text-5xl font-black text-violet-700 leading-none">
                    {kData.aggregated.avgConversionRate}%
                  </span>
                  <p className="text-xs text-violet-500 mt-2 font-medium text-center">
                    {kData.aggregated.totalClients} з {kData.aggregated.totalAcquired} залучених
                  </p>
                  <div className="w-full mt-4 bg-violet-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-violet-500 to-indigo-500 h-2 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(kData.aggregated.avgConversionRate, 100)}%` }}
                    />
                  </div>

                  {/* Порівняння з попереднім періодом (null = ділення на нуль) */}
                  {kData.comparison && kData.comparison.conversionChange !== null && (
                    <div className={`mt-3 flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                      kData.comparison.conversionChange >= 0
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                    }`}>
                      {kData.comparison.conversionChange >= 0
                        ? <TrendingUp className="w-3 h-3" />
                        : <TrendingDown className="w-3 h-3" />}
                      {kData.comparison.conversionChange >= 0 ? '+' : ''}{kData.comparison.conversionChange}% відносно поп. пер.
                    </div>
                  )}

                  {/* Свіжі когорти ще не встигли конвертнутись — попереджаємо явно */}
                  {immatureDates.length > 0 && (
                    <p
                      className="mt-3 text-[10px] leading-snug text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 text-center"
                      title={`Когорти молодші за ${COHORT_MATURITY_DAYS} дн. ще накопичують конверсії, тому показник занижений`}
                    >
                      ⏳ {immatureDates.length === kData.entries.length
                        ? 'Весь період ще дозріває'
                        : `Останні ${immatureDates.length} дн. ще дозрівають`}
                    </p>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ── Юніт-економіка: CAC ──────────────────────────────────────── */}
          {/* Суми бюджету бачать лише адміни — так само, як розділ «Витрати» */}
          {kData && cacData && currentUser?.role === 'admin' && (
            <CacSection
              scope={cacScope}
              onScopeChange={changeCacScope}
              result={cacData.result}
              spend={cacData.spend}
              bySource={cacData.bySource}
              ltvBasis={cacData.ltvBasis}
              hasComparison={cacData.hasComparison}
              ratesUnset={cacData.ratesUnset}
              immatureDays={immatureDates.length}
              periodDays={kData.entries.length}
              onOpenExpenses={() => setActiveView('expenses')}
            />
          )}

          {/* ── Sales Funnel ─────────────────────────────────────────────── */}
          {kData && (
            <SalesFunnel
              acquired={kData.aggregated.totalAcquired}
              clients={kData.aggregated.totalClients}
              agreements={kData.aggregated.totalAgreements ?? 0}
              agreementsSum={kData.aggregated.totalAgreementsSum ?? 0}
              acquiredChange={kData.comparison?.acquiredChange ?? null}
              clientsChange={kData.comparison?.clientsChange ?? null}
              agreementsChange={kData.comparison?.agreementsChange ?? null}
            />
          )}

          {/* Chart Section */}
          {kData && kData.entries.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-gray-800">Динаміка залучення та конверсії</h3>
              </div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorClients" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorAgreements" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => {
                        const [, month, day] = val.split('-');
                        return `${day}.${month}`;
                      }}
                      tick={{ fontSize: 11, fill: '#6b7280' }} 
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      minTickGap={20}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: '#6b7280' }} 
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '12px' }}
                      labelFormatter={(label) => `Дата: ${label}`}
                    />
                    <Area
                      type="monotone"
                      name="Залучено"
                      dataKey="acquired"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorLeads)"
                      activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
                    />
                    <Area
                      type="monotone"
                      name="Стали клієнтами"
                      dataKey="totalClientsToday"
                      stroke="#10b981" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorClients)" 
                      activeDot={{ r: 4, strokeWidth: 0, fill: '#10b981' }}
                    />
                    <Area 
                      type="monotone" 
                      name="Угоди"
                      dataKey="totalAgreementsToday" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorAgreements)" 
                      activeDot={{ r: 4, strokeWidth: 0, fill: '#f59e0b' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Revenue Chart */}
              <div className="flex items-center justify-between mt-8 mb-6">
                <h3 className="text-sm font-bold text-gray-800">Дохід по днях (грн)</h3>
              </div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => {
                        const [, month, day] = val.split('-');
                        return `${day}.${month}`;
                      }}
                      tick={{ fontSize: 11, fill: '#6b7280' }} 
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      minTickGap={20}
                    />
                    <YAxis 
                      tickFormatter={(val) => `${val.toLocaleString('uk-UA')} ₴`}
                      tick={{ fontSize: 11, fill: '#6b7280' }} 
                      tickLine={false}
                      axisLine={false}
                      width={80}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '12px' }}
                      labelFormatter={(label) => `Дата: ${label}`}
                      formatter={(value: number) => [`${value.toLocaleString('uk-UA')} ₴`, 'Дохід']}
                    />
                    <Area 
                      type="monotone" 
                      name="Дохід"
                      dataKey="totalAgreementsSumToday" 
                      stroke="#8b5cf6" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorRevenue)" 
                      activeDot={{ r: 4, strokeWidth: 0, fill: '#8b5cf6' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
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
      
      {/* LTV Analytics Modal */}
      {isLtvModalOpen && ltvData && (
        <LtvAnalyticsModal
          data={ltvData}
          onClose={() => setIsLtvModalOpen(false)}
          rfmThresholds={state.rfmThresholds}
          onSaveRfmThresholds={t => updateSettings({ rfmThresholds: t })}
          canEditSettings={hasEditRights}
        />
      )}

      {/* Вибір періоду для розрахунку LTV */}
      {isLtvSyncOpen && (
        <LtvSyncDialog
          syncing={ltvSyncing}
          error={ltvError}
          onClose={() => { setIsLtvSyncOpen(false); setLtvError(null); }}
          onConfirm={handleLTVSync}
        />
      )}
    </div>
  );
}

// ── CAC / юніт-економіка ──────────────────────────────────────────────────────

const uah = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} ₴`;

interface CacSectionProps {
  scope: CacScope;
  onScopeChange: (s: CacScope) => void;
  result: CacResult;
  spend: SpendBreakdown;
  bySource: SourceCacResult;
  ltvBasis: string;
  hasComparison: boolean;
  ratesUnset: boolean;
  /** Скільки днів періоду ще не дозріли — стільки ж клієнтів ще не дорахувалось */
  immatureDays: number;
  periodDays: number;
  onOpenExpenses: () => void;
}

function CacSection({
  scope, onScopeChange, result, spend, bySource, ltvBasis,
  hasComparison, ratesUnset, immatureDays, periodDays, onOpenExpenses,
}: CacSectionProps) {
  const { cac, cpl, prevCac, cacChange, cacImproved, ltvToCac, newClients } = result;

  const scopeLabel = scope === 'ads' ? `Категорія «${AD_SPEND_CATEGORY}»` : 'Усі витрати відділу';
  const maxSourceCac = Math.max(...bySource.matched.map(s => s.cac ?? 0), 1);

  return (
    <div className="mt-8 pt-6 border-t border-gray-100">
      {/* Header + перемикач бази витрат */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-800">Юніт-економіка</h3>
          <span className="text-[11px] text-gray-400">за той самий період</span>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['ads', 'all'] as CacScope[]).map(s => (
            <button
              key={s}
              onClick={() => onScopeChange(s)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                scope === s ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              title={s === 'ads'
                ? `Тільки рекламний бюджет (категорія «${AD_SPEND_CATEGORY}») — paid CAC`
                : 'Усі витрати відділу — blended CAC, повна собівартість клієнта'}
            >
              {s === 'ads' ? 'Реклама' : 'Усі витрати'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        {/* CAC */}
        <div className="bg-gradient-to-br from-sky-50 to-cyan-50 rounded-xl border border-sky-100 p-4 flex flex-col">
          <div className="flex items-start justify-between">
            <p
              className="text-[11px] font-semibold text-sky-700 uppercase tracking-wider"
              title="Витрати періоду ÷ клієнти, залучені в цьому ж періоді"
            >
              CAC · вартість клієнта
            </p>
            <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
          </div>

          {cac === null ? (
            <>
              <span className="text-2xl font-black text-gray-300 mt-3 leading-none">—</span>
              <p className="text-[11px] text-gray-400 mt-2 leading-snug">
                За період немає клієнтів — ділити нема на що
              </p>
            </>
          ) : (
            <>
              <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                <span className="text-3xl font-black text-sky-800 leading-none">
                  {cac.toLocaleString('uk-UA')}
                </span>
                <span className="text-xs font-bold text-sky-400">₴</span>
                {cacChange !== null && (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                    cacImproved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                    title={`Попередній період: ${uah(prevCac ?? 0)} за клієнта. Для CAC зниження — це добре.`}
                  >
                    {cacChange <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                    {cacChange > 0 ? '+' : ''}{cacChange}%
                  </span>
                )}
              </div>
              <p className="text-[11px] text-sky-600/80 mt-2 leading-snug">
                {uah(spend.total)} ÷ {newClients.toLocaleString('uk-UA')} клієнт(ів)
              </p>
              {!hasComparison && (
                <p className="text-[10px] text-gray-400 mt-1">Немає з чим порівняти</p>
              )}
            </>
          )}
        </div>

        {/* CPL */}
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-100 p-4 flex flex-col">
          <div className="flex items-start justify-between">
            <p
              className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider"
              title="Витрати періоду ÷ усі залучені записи (ліди + клієнти)"
            >
              Вартість ліда
            </p>
            <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          {cpl === null ? (
            <>
              <span className="text-2xl font-black text-gray-300 mt-3 leading-none">—</span>
              <p className="text-[11px] text-gray-400 mt-2">За період нікого не залучено</p>
            </>
          ) : (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-indigo-800 leading-none">
                  {cpl.toLocaleString('uk-UA')}
                </span>
                <span className="text-xs font-bold text-indigo-400">₴</span>
              </div>
              <p className="text-[11px] text-indigo-600/80 mt-2 leading-snug">
                Скільки коштує один залучений запис
              </p>
            </>
          )}
        </div>

        {/* LTV : CAC */}
        <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 rounded-xl border border-purple-100 p-4 flex flex-col">
          <div className="flex items-start justify-between">
            <p
              className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider"
              title="Скільки грошей приносить клієнт на кожну гривню залучення"
            >
              LTV : CAC
            </p>
            <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
              <Gem className="w-4 h-4" />
            </div>
          </div>
          {ltvToCac === null ? (
            <>
              <span className="text-2xl font-black text-gray-300 mt-3 leading-none">—</span>
              <p className="text-[11px] text-gray-400 mt-2 leading-snug">
                Потрібні і CAC, і порахований LTV
              </p>
            </>
          ) : (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-3xl font-black leading-none ${
                  ltvToCac >= 3 ? 'text-emerald-700' : ltvToCac >= 1 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {ltvToCac.toLocaleString('uk-UA')}×
                </span>
              </div>
              <p className="text-[11px] text-purple-600/80 mt-2 leading-snug">
                {ltvToCac >= 3
                  ? 'Здорова економіка (бенчмарк ≥ 3×)'
                  : ltvToCac >= 1
                    ? 'Окупається, але запасу мало (норма ≥ 3×)'
                    : 'Клієнт коштує дорожче, ніж приносить'}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">База: {ltvBasis}</p>
            </>
          )}
        </div>

        {/* Витрати періоду */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 p-4 flex flex-col">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
              Витрати періоду
            </p>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-800 leading-none">
              {spend.total.toLocaleString('uk-UA')}
            </span>
            <span className="text-xs font-bold text-emerald-400">₴</span>
          </div>
          <p className="text-[11px] text-emerald-600/80 mt-2 leading-snug">
            {scopeLabel} · {spend.count} запис(ів)
          </p>
          <button
            onClick={onOpenExpenses}
            className="mt-auto pt-2 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 transition self-start"
          >
            Відкрити витрати <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Застереження — краще пояснити перекос, ніж дати повірити в рівне число */}
      <div className="mt-3 space-y-1.5">
        {spend.count === 0 && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-snug">
            За цей період витрат не заведено{scope === 'ads' ? ` в категорії «${AD_SPEND_CATEGORY}»` : ''} — CAC рахується від нуля.
            Додайте витрати в розділі «Витрати», щоб число стало реальним.
          </p>
        )}
        {ratesUnset && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-snug">
            У періоді є витрати не в гривні, а курс не задано — використано типовий.
            Задайте курс у «Витрати → Налаштування».
          </p>
        )}
        {immatureDays > 0 && cac !== null && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-snug">
            ⏳ {immatureDays === periodDays ? 'Весь період' : `Останні ${immatureDays} дн.`} ще дозрівають:
            частина залучених не встигла стати клієнтами, тож CAC поки завищений.
          </p>
        )}
      </div>

      {/* CAC по джерелах */}
      {bySource.matched.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
            CAC по джерелах
          </p>
          <div className="space-y-2.5">
            {bySource.matched.map(s => (
              <div key={s.source} className="flex items-center gap-3">
                <span className="w-28 text-xs text-gray-600 truncate shrink-0" title={s.source}>{s.source}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-500 transition-all duration-500"
                    style={{ width: `${Math.max(((s.cac ?? 0) / maxSourceCac) * 100, 4)}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-gray-800 tabular-nums w-24 text-right shrink-0">
                  {s.cac === null ? '—' : uah(s.cac)}
                </span>
                <span className="text-[10px] text-gray-400 w-28 text-right shrink-0 hidden sm:block">
                  {uah(s.spend)} / {s.clients} кл.
                </span>
              </div>
            ))}
          </div>
          {(bySource.unmatchedSpend > 0 || bySource.unmatchedClients > 0) && (
            <p className="text-[10px] text-gray-400 mt-2.5 leading-snug">
              Поза розбивкою:
              {bySource.unmatchedSpend > 0 && ` ${uah(bySource.unmatchedSpend)} витрат на джерела, яких немає в CRM`}
              {bySource.unmatchedSpend > 0 && bySource.unmatchedClients > 0 && ' ·'}
              {bySource.unmatchedClients > 0 && ` ${bySource.unmatchedClients} клієнт(ів) із джерел без витрат`}
              . Назви джерел у витратах і в CRM мають збігатись.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Avg Deal Value Card ───────────────────────────────────────────────────────

interface AvgDealCardProps {
  totalSum: number;
  totalCount: number;
  bySource: { source: string; count: number; totalSum: number }[];
  sumChange: number | null;
  countChange: number | null;
}

function AvgDealCard({ totalSum, totalCount, bySource, sumChange }: AvgDealCardProps) {
  const avg = totalCount > 0 ? Math.round(totalSum / totalCount) : 0;

  // Avg check по кожному джерелу, відсортований спаданням
  const sourceAvgs = bySource
    .filter(s => s.count > 0)
    .map(s => ({ source: s.source, avg: Math.round(s.totalSum / s.count), count: s.count }))
    .sort((a, b) => b.avg - a.avg);

  const maxAvg = sourceAvgs.length > 0 ? sourceAvgs[0].avg : 1;

  return (
    <div className="flex flex-col">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Середній чек</p>
      <div className="flex-1 bg-gradient-to-br from-rose-50 to-pink-50 rounded-xl border border-rose-100 p-4">

        {/* Main value */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              {totalCount > 0 ? (
                <>
                  <span className="text-2xl font-black text-rose-700 leading-none">
                    {avg.toLocaleString('uk-UA')}
                  </span>
                  <span className="text-xs font-bold text-rose-400 ml-1">₴</span>
                </>
              ) : (
                <span className="text-sm text-gray-400 italic">Немає угод</span>
              )}
              <p className="text-[10px] text-rose-400 font-medium mt-0.5">
                {totalCount > 0 ? `з ${totalCount} угод` : ''}
              </p>
            </div>
          </div>

          {/* Change badge */}
          {sumChange !== null && (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
              sumChange >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {sumChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {sumChange >= 0 ? '+' : ''}{sumChange}%
            </span>
          )}
        </div>

        {/* Per-source avg check */}
        {sourceAvgs.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Дані відсутні</p>
        ) : (
          <div className="space-y-2">
            {sourceAvgs.slice(0, 4).map(s => (
              <div key={s.source}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-gray-500 font-medium truncate max-w-[90px]" title={s.source}>
                    {s.source}
                  </span>
                  <span className="text-[10px] font-bold text-rose-600 whitespace-nowrap">
                    {s.avg.toLocaleString('uk-UA')} ₴
                  </span>
                </div>
                <div className="w-full bg-rose-100 rounded-full h-1">
                  <div
                    className="h-1 rounded-full bg-gradient-to-r from-rose-400 to-pink-500 transition-all duration-500"
                    style={{ width: `${Math.max(4, (s.avg / maxAvg) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sales Funnel ─────────────────────────────────────────────────────────────

interface SalesFunnelProps {
  acquired: number;
  clients: number;
  agreements: number;
  agreementsSum: number;
  acquiredChange: number | null;
  clientsChange: number | null;
  agreementsChange: number | null;
}

function SalesFunnel({ acquired, clients, agreements, agreementsSum, acquiredChange, clientsChange, agreementsChange }: SalesFunnelProps) {
  // Єдина конверсія, яку чесно дають денні знімки: обидва числа описують ту саму
  // когорту — записи, залучені в цей період. Ступінь «Клієнт → Угода» тут навмисне
  // не рахується: угоди за період не прив'язані до когорти (угода може бути з
  // клієнтом, заведеним рік тому), тож таке відношення нічого не вимірювало б.
  const conv1 = acquired > 0 ? Math.round((clients / acquired) * 1000) / 10 : 0;

  const stages = [
    {
      key: 'acquired',
      label: 'Залучено',
      value: acquired,
      pct: 100,
      color: { fill: '#3b82f6', light: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
      change: acquiredChange,
      sub: null,
      note: null as string | null,
    },
    {
      key: 'clients',
      label: 'Стали клієнтами',
      value: clients,
      pct: acquired > 0 ? (clients / acquired) * 100 : 0,
      color: { fill: '#10b981', light: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
      change: clientsChange,
      sub: null,
      note: null as string | null,
    },
    {
      key: 'agreements',
      label: 'Угоди',
      value: agreements,
      // Ширина рівня угод відносна до когорти лише візуально — див. note нижче.
      pct: acquired > 0 ? Math.min((agreements / acquired) * 100, 100) : 0,
      color: { fill: '#8b5cf6', light: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6' },
      change: agreementsChange,
      sub: agreementsSum > 0 ? `${agreementsSum.toLocaleString('uk-UA')} ₴` : null,
      note: 'обсяг за період, не прив\'язаний до когорти',
    },
  ];

  return (
    <div className="mt-8 pt-6 border-t border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-bold text-gray-800">Воронка продажів</h3>
        {acquired > 0 && (
          <span className="text-xs text-gray-400 font-medium">
            Конверсія когорти: <span className="text-gray-600 font-semibold">{conv1}%</span>
          </span>
        )}
      </div>

      {/* Funnel + stats layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-center">

        {/* SVG Funnel */}
        <div className="flex-1 w-full max-w-lg mx-auto lg:mx-0">
          <svg
            viewBox="0 0 320 200"
            className="w-full"
            style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.06))' }}
          >
            <defs>
              {stages.map((s) => (
                <linearGradient key={s.key} id={`fg-${s.key}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={s.color.fill} stopOpacity="0.85" />
                  <stop offset="100%" stopColor={s.color.fill} stopOpacity="0.65" />
                </linearGradient>
              ))}
            </defs>

            {stages.map((s, i) => {
              const topW   = Math.max(30, (s.pct / 100) * 280);
              const nextPct = i < stages.length - 1 ? stages[i + 1].pct : s.pct;
              const botW   = i < stages.length - 1 ? Math.max(30, (nextPct / 100) * 280) : Math.max(30, (s.pct / 100) * 280);
              const h   = 52;
              const gap = 8;
              const y   = i * (h + gap);
              const cx  = 160;

              const tl = cx - topW / 2;
              const tr = cx + topW / 2;
              const bl = cx - botW / 2;
              const br = cx + botW / 2;

              return (
                <g key={s.key}>
                  {/* Trapezoid */}
                  <path
                    d={`M${tl},${y} L${tr},${y} L${br},${y + h} L${bl},${y + h} Z`}
                    fill={`url(#fg-${s.key})`}
                    rx="4"
                  />
                  {/* Rounded cap top */}
                  <rect x={tl} y={y} width={topW} height={4} rx={2} fill={s.color.fill} opacity="0.9" />

                  {/* Label inside */}
                  <text
                    x={cx}
                    y={y + h / 2 - 6}
                    textAnchor="middle"
                    fill="white"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="system-ui, sans-serif"
                    opacity="0.95"
                  >
                    {s.label}
                  </text>
                  <text
                    x={cx}
                    y={y + h / 2 + 9}
                    textAnchor="middle"
                    fill="white"
                    fontSize="15"
                    fontWeight="800"
                    fontFamily="system-ui, sans-serif"
                    opacity="0.97"
                  >
                    {s.value.toLocaleString('uk-UA')}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Stats column */}
        <div className="flex-1 w-full space-y-3">
          {/* Stage stats */}
          {stages.map((s) => (
            <div
              key={s.key}
              className="flex items-center gap-4 rounded-xl px-4 py-3 border"
              style={{ background: s.color.light, borderColor: s.color.border }}
            >
              {/* Color dot */}
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color.fill }} />

              {/* Label + value */}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: s.color.text }}>
                  {s.label}
                </p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-black text-gray-900">
                    {s.value.toLocaleString('uk-UA')}
                  </span>
                  {s.sub && (
                    <span className="text-xs font-semibold" style={{ color: s.color.fill }}>
                      {s.sub}
                    </span>
                  )}
                </div>
                {s.note && (
                  <p className="text-[10px] text-gray-400 mt-1 leading-snug">{s.note}</p>
                )}
              </div>

              {/* Change badge — null означає нульову базу, відсоток не визначений */}
              {s.change !== null && (
                <span
                  className={`flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    s.change >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {s.change >= 0 ? '+' : ''}{s.change}%
                </span>
              )}
            </div>
          ))}

          {/* Когортна конверсія — єдиний перехід, який ці дані дозволяють виміряти */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-center">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Залучений → Клієнт
            </p>
            <p className="text-2xl font-black text-gray-800 mt-1">
              {conv1}<span className="text-sm font-semibold text-gray-400">%</span>
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {clients.toLocaleString('uk-UA')} з {acquired.toLocaleString('uk-UA')} залучених
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── KeepInCRM Source Bar Card ─────────────────────────────────────────────────

interface SourceCardProps {
  title: string;
  total: number;
  stats: (KeepInCRMSourceStat | KeepInCRMAgreementStat)[];
  color: 'blue' | 'green' | 'yellow';
  icon: React.ReactNode;
  change?: number | null;  // % зміна відносно попереднього періоду
  subTotal?: string;       // додатковий текст під тоталом (напр. сума в грн)
  showSum?: boolean;       // показати суму по кожному джерелу (для угод)
}

function KeepInCRMSourceCard({ title, total, stats, color, icon, change, subTotal, showSum }: SourceCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const colors = {
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
    yellow: {
      bg: 'from-amber-50 to-yellow-50',
      border: 'border-amber-100',
      text: 'text-amber-700',
      bar: 'bg-gradient-to-r from-amber-400 to-yellow-500',
      barBg: 'bg-amber-100',
      icon: 'bg-amber-100 text-amber-600',
      label: 'text-amber-500',
    }
  }[color] || {
    bg: 'from-gray-50 to-gray-100',
    border: 'border-gray-200',
    text: 'text-gray-700',
    bar: 'bg-gray-400',
    barBg: 'bg-gray-200',
    icon: 'bg-gray-200 text-gray-600',
    label: 'text-gray-500',
  };

  const maxCount = stats.length > 0 ? Math.max(...stats.map(s => s.count)) : 1;
  const activeStats = stats.filter(s => s.count > 0);
  const hiddenCount = stats.length - activeStats.length;
  
  // Якщо немає активних, але є приховані — показуємо приховані, інакше показуємо те що є
  const displayedStats = isExpanded ? stats : activeStats;

  return (
    <div className="flex flex-col">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</p>
      <div className={`flex-1 bg-gradient-to-br ${colors.bg} rounded-xl border ${colors.border} p-4`}>
        {/* Total */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className={`w-7 h-7 rounded-lg ${colors.icon} flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black ${colors.text} leading-none`}>
              {total}
            </span>
            {subTotal && (
              <span className={`text-sm font-bold ${colors.label} whitespace-nowrap`}>
                {subTotal}
              </span>
            )}
          </div>
          {change !== null && change !== undefined ? (
            <span className={`flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
              change >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {change >= 0 ? '+' : ''}{change}%
            </span>
          ) : (
            <span className="text-xs text-gray-400 mt-1">за період</span>
          )}
        </div>

        {/* Source bars */}
        {stats.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Дані відсутні</p>
        ) : (
          <div className="space-y-2.5">
            {displayedStats.length === 0 && !isExpanded ? (
               <p className="text-[11px] text-gray-400 italic">Немає джерел з даними &gt; 0</p>
            ) : (
              displayedStats.map(s => {
                const agr = s as KeepInCRMAgreementStat;
                const hasSum = showSum && typeof agr.totalSum === 'number' && agr.totalSum > 0;
                return (
                  <div key={s.source}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-gray-600 font-medium truncate max-w-[120px]" title={s.source}>
                        {s.source}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {hasSum && (
                          <span className="text-[10px] text-gray-400 font-medium">
                            {agr.totalSum.toLocaleString('uk-UA')} ₴
                          </span>
                        )}
                        <span className={`text-[11px] font-bold ${colors.label}`}>{s.count}</span>
                      </div>
                    </div>
                    <div className="flex-1 ml-2 bg-gray-100 rounded-full h-1.5 mt-1">
                    <div 
                      className={`h-1.5 rounded-full ${colors.bar}`}
                      style={{ width: `${Math.max(5, (s.count / maxCount) * 100)}%` }}
                    />
                  </div>
                </div>
                );
              })
            )}

            {/* Toggle button */}
            {hiddenCount > 0 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`mt-2 flex items-center justify-center w-full gap-1 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded-md transition ${colors.label} hover:bg-white/50`}
              >
                {isExpanded ? (
                  <>Приховати джерела (0) <ChevronUp className="w-3 h-3" /></>
                ) : (
                  <>Показати ще {hiddenCount} джерел (0) <ChevronDown className="w-3 h-3" /></>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

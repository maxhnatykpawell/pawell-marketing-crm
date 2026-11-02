import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../App';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, subDays } from 'date-fns';
import { uk } from 'date-fns/locale';
import { TrendingUp, TrendingDown, Target, Calendar as CalendarIcon, Send, Loader2, RefreshCw, Users, Zap, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { KeepInCRMHistoryResponse } from '../types';
import { getKeepInCRMHistory, triggerKeepInCRMSync, triggerKeepInCRMHistorySync, getKeepInCRMSyncStatus, getKeepInCRMLTV, triggerKeepInCRMSyncLTV } from '../api';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, Gem, ExternalLink, Wallet } from 'lucide-react';
import PeriodPicker, { PeriodKey, PeriodValue, makePeriod, describePeriod } from './PeriodPicker';
import LtvSyncDialog from './LtvSyncDialog';
import SyncActivityBanner from './SyncActivityBanner';
import KpiTile from './dashboard/KpiTile';
import SourceTable from './dashboard/SourceTable';
import { avgCheckChange } from '../lib/dashboardMetrics';
import { useSyncActivity } from '../hooks/useSyncActivity';
import {
  sumSpend, computeCac, cacBySource, previousRange,
  DEFAULT_CURRENCY_RATES, AD_SPEND_CATEGORY, COHORT_MATURITY_DAYS,
  CacScope, CacResult, SourceCacResult, SpendBreakdown,
} from '../lib/cac';

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
  const { state, setActiveView, setActiveEventId, currentUser, canView } = useAppContext();
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

  /**
   * Що зараз синхронізується на сервері — незалежно від того, хто це запустив.
   * LTV рахується фоном, тож і «чи йде», і «чи закінчилось» береться звідси, а не
   * з відповіді на кнопку.
   */
  const { status: activity, refresh: refreshActivity } = useSyncActivity();
  const ltvRunning = activity?.ltv.running ?? false;
  /** Кнопка зайнята і поки летить запит на старт, і поки сервер рахує */
  const ltvBusy = ltvSyncing || ltvRunning;

  // Прогін закінчився (хоч і не нами — нічний, чи з іншої вкладки): підтягуємо свіже число
  const wasLtvRunning = React.useRef(false);
  useEffect(() => {
    if (wasLtvRunning.current && !ltvRunning) loadLTV();
    wasLtvRunning.current = ltvRunning;
  }, [ltvRunning, loadLTV]);

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
      // Запуск фоновий: відповідь лише підтверджує старт. Хід видно у смузі
      // нижче, а свіже число підтягнеться саме, коли сервер закінчить.
      await triggerKeepInCRMSyncLTV(period.from, period.to);
      setIsLtvSyncOpen(false);
      await refreshActivity();
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
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">Головна панель відділу</h2>
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



      {/* KeepInCRM Block */}
      <div className="flex flex-col gap-5 flex-shrink-0">
        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden">
        {/* Шапка: дві групи, які переносяться ЦІЛКОМ. Раніше кнопки й вибір періоду
            були окремими елементами одного рядка і при нестачі місця розсипались поодинці. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-5">
          <div className="flex items-center gap-3 min-w-[240px]">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 leading-tight">Аналітика KeepInCRM</h3>
              {kData && (
                <p className="text-xs text-gray-600 mt-0.5">
                  {kData.period.from === kData.period.to
                    ? ymdUa(kData.period.from)
                    : `${ymdUa(kData.period.from)} — ${ymdUa(kData.period.to)}`}
                  {' · '}{kData.entries.length} {kData.entries.length === 1 ? 'день' : 'днів'} з даними
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <PeriodPicker
              value={kPeriod}
              onChange={setKPeriod}
              presets={K_PRESETS}
              disabled={kLoading && !kData}
            />

            {/* Синхронізація — лише для адміна; одна група з однаковими кнопками */}
            {currentUser?.role === 'admin' && (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Синхронізація з KeepInCRM">
                <button
                  onClick={handleKHistorySync}
                  disabled={hSyncRunning || kSyncing}
                  title={hSyncRunning ? `Синхронізація виконується (${hSyncDone}/${hSyncTotal} днів)` : 'Завантажити історію за останні 30 днів'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-orange-500 ${hSyncRunning ? 'animate-spin' : ''}`} />
                  {hSyncRunning ? `Історія ${hSyncDone}/${hSyncTotal}` : 'Історія 30 дн.'}
                </button>
                <button
                  onClick={() => setIsLtvSyncOpen(true)}
                  disabled={ltvBusy || hSyncRunning}
                  title={ltvRunning
                    ? `LTV вже рахується${activity?.ltv.pct != null ? ` (${activity.ltv.pct}%)` : ''} — хід нижче`
                    : 'Порахувати LTV за обраний період'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-purple-500 ${ltvBusy ? 'animate-spin' : ''}`} />
                  {ltvBusy
                    ? (activity?.ltv.pct != null ? `LTV ${activity.ltv.pct}%` : 'Рахуємо LTV…')
                    : 'Порахувати LTV'}
                </button>
                <button
                  onClick={handleKSync}
                  disabled={kSyncing || hSyncRunning}
                  title="Оновити дані за сьогодні"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-violet-500 ${kSyncing ? 'animate-spin' : ''}`} />
                  {kSyncing ? 'Оновлюємо…' : 'Оновити'}
                </button>
              </div>
            )}
          </div>
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
        {/* Усі фонові роботи з CRM разом: LTV, історія, нічний перерахунок, пауза через ліміт */}
        <SyncActivityBanner
          status={activity}
          lastLtvAt={ltvData?.lastSyncedAt ?? null}
          historyShownElsewhere={hSyncRunning}
        />
        {hSyncError && !hSyncRunning && (
          <div className="px-6 pb-3 pt-2">
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              Помилка синхронізації: {hSyncError}
            </div>
          </div>
        )}

        </div>

        {/* Content */}
        <div className="flex flex-col gap-5">

          <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6">
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
            <div className="@container">
              {/* Брейкпоінти — від ширини КОНТЕЙНЕРА, а не вікна: збоку є меню, і шість
                  плиток у ряд на вікні 1280 стискались би до ~150 px кожна. */}
              <div className="grid grid-cols-2 @2xl:grid-cols-3 @6xl:grid-cols-6 gap-3">
                <KpiTile
                  label="Залучено"
                  accent="#3b82f6"
                  value={fmtNum(kData.aggregated.totalAcquired)}
                  delta={kData.comparison?.acquiredChange}
                  note="нових записів: ліди й клієнти"
                  trend={chartData.map(e => e.acquired)}
                />
                <KpiTile
                  label="Стали клієнтами"
                  accent="#10b981"
                  value={fmtNum(kData.aggregated.totalClients)}
                  delta={kData.comparison?.clientsChange}
                  note={`${fmtNum(kData.aggregated.totalAcquired - kData.aggregated.totalClients)} ще лідами`}
                  trend={chartData.map(e => e.totalClientsToday || 0)}
                />
                <KpiTile
                  label="Конверсія когорти"
                  accent="#6366f1"
                  value={String(kData.aggregated.avgConversionRate)}
                  unit="%"
                  delta={kData.comparison?.conversionChange}
                  note={<>
                    {fmtNum(kData.aggregated.totalClients)} з {fmtNum(kData.aggregated.totalAcquired)} залучених
                    {immatureDates.length > 0 && (
                      <span className="block mt-1 text-amber-800" title={`Когорти молодші за ${COHORT_MATURITY_DAYS} дн. ще накопичують конверсії, тому показник занижений`}>
                        ⏳ {immatureDates.length === kData.entries.length
                          ? 'весь період ще дозріває'
                          : `останні ${immatureDates.length} дн. ще дозрівають`}
                      </span>
                    )}
                  </>}
                />
                <KpiTile
                  label="Угоди"
                  accent="#f59e0b"
                  value={fmtNum(kData.aggregated.totalAgreements ?? 0)}
                  delta={kData.comparison?.agreementsChange}
                  note={kData.aggregated.totalAgreementsSum ? `на ${uah(kData.aggregated.totalAgreementsSum)}` : 'без суми'}
                  trend={chartData.map(e => e.totalAgreementsToday || 0)}
                />
                <KpiTile
                  label="Середній чек"
                  accent="#8b5cf6"
                  value={(kData.aggregated.totalAgreements ?? 0) > 0
                    ? fmtNum(Math.round((kData.aggregated.totalAgreementsSum ?? 0) / (kData.aggregated.totalAgreements ?? 1)))
                    : '—'}
                  unit={(kData.aggregated.totalAgreements ?? 0) > 0 ? '₴' : undefined}
                  delta={avgCheckChange(kData.comparison?.agreementsSumChange, kData.comparison?.agreementsChange)}
                  note={(kData.aggregated.totalAgreements ?? 0) > 0 ? `сума ÷ ${fmtNum(kData.aggregated.totalAgreements ?? 0)} угод` : 'за період немає угод'}
                />
                {/* Веде на вкладку «Аналітика»: туди ж можна зайти з меню, і обидва шляхи
                    мають приводити в одне місце. */}
                <KpiTile
                  label={ltv12 ? 'LTV клієнта · 12 міс' : 'ARPU · за весь час'}
                  accent="#d946ef"
                  value={ltvLoading ? '…' : ltvData ? (ltv12 ? ltv12.ltv : (ltvData.ltv ?? 0)).toLocaleString('uk-UA') : '—'}
                  unit={ltvData ? '₴' : undefined}
                  onClick={() => setActiveView('analytics')}
                  title="Відкрити розширену аналітику"
                  note={ltvData
                    ? (ltv12
                      ? <>по {ltv12.cohorts} зрілих когортах · {fmtNum(ltv12.clients)} клієнтів<span className="block mt-1">ARPU за весь час: {(ltvData.ltv ?? 0).toLocaleString('uk-UA')} ₴</span></>
                      : <>⏳ Для LTV бракує когорт віком 12 міс.<span className="block mt-1">Клієнтів, що купили: {fmtNum(ltvData.uniqueClientsCount ?? 0)}</span></>)
                    : 'Немає даних'}
                  badge={ltvData?.scopedTo
                    ? <span className="text-[11px] font-bold text-amber-800 bg-amber-100 rounded px-1.5 py-0.5" title={`Дані лише ${describePeriod({ key: 'custom', ...ltvData.scopedTo })} — LTV занижений`}>⚠ неповний</span>
                    : undefined}
                />
              </div>
            </div>
          )}
          </div>

          {/* ── Джерела: один рядок — одне джерело, колонки — весь ланцюг ──── */}
          {kData && (
            <SourceTable
              aggregated={kData.aggregated}
              cac={cacData && canView('expenses') ? cacData.bySource : null}
            />
          )}

          {/* ── Юніт-економіка: CAC ──────────────────────────────────────── */}
          {/* Прив'язано до права на «Витрати», а не до ролі: CAC — це той самий
              бюджет, лише поділений на клієнтів */}
          {kData && cacData && canView('expenses') && (
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
            <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 mb-5">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Динаміка залучення та угод</h3>
                  <p className="text-xs text-gray-600 mt-0.5">По днях обраного періоду; наведіть на графік, щоб побачити точні числа.</p>
                </div>
                {/* Легенда обов'язкова: три лінії одного кольорового ряду без підпису — загадка.
                    Біля кожної — підсумок за період, щоб легенда була ще й довідкою. */}
                <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-700">
                  {[
                    { color: '#3b82f6', label: 'Залучено', total: kData.aggregated.totalAcquired },
                    { color: '#10b981', label: 'Стали клієнтами', total: kData.aggregated.totalClients },
                    { color: '#f59e0b', label: 'Угоди', total: kData.aggregated.totalAgreements ?? 0 },
                  ].map(l => (
                    <li key={l.label} className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="inline-block w-4 h-[3px] rounded-full" style={{ backgroundColor: l.color }} />
                      <span className="font-semibold">{l.label}</span>
                      <span className="text-gray-500 tabular-nums">· {fmtNum(l.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
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
                      tick={{ fontSize: 12, fill: '#4b5563' }} 
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      minTickGap={20}
                    />
                    <YAxis 
                      tick={{ fontSize: 12, fill: '#4b5563' }} 
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      width={76}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '13px' }}
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
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 mt-10 mb-5 pt-6 border-t border-gray-100">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Сума угод по днях</h3>
                  <p className="text-xs text-gray-600 mt-0.5">Законтрактовано в гривнях, за датою створення угоди.</p>
                </div>
                <p className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                  <span aria-hidden className="inline-block w-4 h-[3px] rounded-full" style={{ backgroundColor: '#8b5cf6' }} />
                  <span className="font-semibold">Сума угод</span>
                  <span className="text-gray-500 tabular-nums">· {uah(kData.aggregated.totalAgreementsSum ?? 0)}</span>
                </p>
              </div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
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
                      tick={{ fontSize: 12, fill: '#4b5563' }} 
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      minTickGap={20}
                    />
                    <YAxis 
                      tickFormatter={(val) => `${val.toLocaleString('uk-UA')} ₴`}
                      tick={{ fontSize: 12, fill: '#4b5563' }} 
                      tickLine={false}
                      axisLine={false}
                      width={76}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '13px' }}
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

      <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[400px]">
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
                      <span className="text-[11px] opacity-70 mt-1.5 block uppercase font-bold tracking-wide">Подія</span>
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
                      <span className="text-[11px] opacity-70 mt-1.5 block uppercase font-bold tracking-wide">Пост</span>
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
                        <span className="text-[11px] opacity-70 uppercase font-bold tracking-wide">Дедлайн</span>
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
const fmtNum = (n: number) => n.toLocaleString('uk-UA');
/** '2026-11-02' → '02.11.2026' */
const ymdUa = (s: string) => s.split('-').reverse().join('.');

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

  return (
    <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6">
      {/* Header + перемикач бази витрат */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-900">Юніт-економіка</h3>
            <p className="text-xs text-gray-600 mt-0.5">Витрати ÷ клієнти за той самий період</p>
          </div>
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

      <div className="@container">
        <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
          <KpiTile
            label="CAC · вартість клієнта"
            accent="#0ea5e9"
            title="Витрати періоду ÷ клієнти, залучені в цьому ж періоді"
            value={cac === null ? '—' : cac.toLocaleString('uk-UA')}
            unit={cac === null ? undefined : '₴'}
            delta={cac === null ? undefined : (hasComparison ? cacChange : undefined)}
            deltaGood="down"
            note={cac === null
              ? 'За період немає клієнтів — ділити нема на що'
              : <>{uah(spend.total)} ÷ {newClients.toLocaleString('uk-UA')} клієнт(ів)
                  {!hasComparison && <span className="block mt-1">Немає з чим порівняти</span>}
                  {cacChange !== null && prevCac !== null && <span className="block mt-1">Було {uah(prevCac)} · зниження — це добре</span>}</>}
          />
          <KpiTile
            label="Вартість ліда"
            accent="#6366f1"
            title="Витрати періоду ÷ усі залучені записи (ліди + клієнти)"
            value={cpl === null ? '—' : cpl.toLocaleString('uk-UA')}
            unit={cpl === null ? undefined : '₴'}
            note={cpl === null ? 'За період нікого не залучено' : 'скільки коштує один залучений запис'}
          />
          <KpiTile
            label="LTV : CAC"
            accent={ltvToCac === null ? '#9ca3af' : ltvToCac >= 3 ? '#10b981' : ltvToCac >= 1 ? '#f59e0b' : '#ef4444'}
            title="Скільки грошей приносить клієнт на кожну гривню залучення"
            value={ltvToCac === null ? '—' : `${ltvToCac.toLocaleString('uk-UA')}×`}
            note={ltvToCac === null
              ? 'Потрібні і CAC, і порахований LTV'
              : <>
                  {ltvToCac >= 3
                    ? 'Здорова економіка (бенчмарк ≥ 3×)'
                    : ltvToCac >= 1
                      ? 'Окупається, але запасу мало (норма ≥ 3×)'
                      : 'Клієнт коштує дорожче, ніж приносить'}
                  {/* Шкала 0–5×: мітка на 3× — бенчмарк здорової економіки */}
                  <span className="relative block mt-2 h-2 rounded-full bg-gray-100" title="Мітка — бенчмарк 3×">
                    <span
                      className={`block h-2 rounded-full ${ltvToCac >= 3 ? 'bg-emerald-500' : ltvToCac >= 1 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, (ltvToCac / 5) * 100)}%` }}
                    />
                    <span className="absolute -top-0.5 h-3 w-0.5 rounded bg-gray-500" style={{ left: '60%' }} />
                  </span>
                  <span className="block mt-1.5">База: {ltvBasis}</span>
                </>}
          />
          <KpiTile
            label="Витрати періоду"
            accent="#14b8a6"
            value={spend.total.toLocaleString('uk-UA')}
            unit="₴"
            note={<>
              {scopeLabel} · {spend.count} запис(ів)
              <span
                role="button"
                tabIndex={0}
                onClick={onOpenExpenses}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpenExpenses(); }}
                className="mt-1.5 inline-flex items-center gap-1 font-semibold text-teal-800 hover:text-teal-950 cursor-pointer"
              >
                Відкрити витрати <ExternalLink className="w-3 h-3" />
              </span>
            </>}
          />
        </div>
      </div>

      {/* Застереження — краще пояснити перекос, ніж дати повірити в рівне число */}
      <div className="mt-3 space-y-1.5">
        {spend.count === 0 && (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-snug">
            За цей період витрат не заведено{scope === 'ads' ? ` в категорії «${AD_SPEND_CATEGORY}»` : ''} — CAC рахується від нуля.
            Додайте витрати в розділі «Витрати», щоб число стало реальним.
          </p>
        )}
        {ratesUnset && (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-snug">
            У періоді є витрати не в гривні, а курс не задано — використано типовий.
            Задайте курс у «Витрати → Налаштування».
          </p>
        )}
        {immatureDays > 0 && cac !== null && (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-snug">
            ⏳ {immatureDays === periodDays ? 'Весь період' : `Останні ${immatureDays} дн.`} ще дозрівають:
            частина залучених не встигла стати клієнтами, тож CAC поки завищений.
          </p>
        )}
      </div>

      {/* CAC по кожному джерелу — колонка таблиці «Джерела» вище. Тут лишається те,
          що в таблицю не лягає: гроші й клієнти, які не вдалося зіставити. */}
      {(bySource.unmatchedSpend > 0 || bySource.unmatchedClients > 0) && (
        <p className="mt-3 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 leading-snug">
          Поза розбивкою CAC по джерелах:
          {bySource.unmatchedSpend > 0 && ` ${uah(bySource.unmatchedSpend)} витрат на джерела, яких немає в CRM`}
          {bySource.unmatchedSpend > 0 && bySource.unmatchedClients > 0 && ' ·'}
          {bySource.unmatchedClients > 0 && ` ${bySource.unmatchedClients} клієнт(ів) із джерел без витрат`}
          . Назви джерел у витратах і в CRM мають збігатись.
        </p>
      )}
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
    <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6">
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
              className="flex items-center gap-4 rounded-2xl px-4 py-3 border"
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
                  <p className="text-[11px] text-gray-400 mt-1 leading-snug">{s.note}</p>
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
          <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3 text-center">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Залучений → Клієнт
            </p>
            <p className="text-2xl font-black text-gray-800 mt-1">
              {conv1}<span className="text-sm font-semibold text-gray-400">%</span>
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {clients.toLocaleString('uk-UA')} з {acquired.toLocaleString('uk-UA')} залучених
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

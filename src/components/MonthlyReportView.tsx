import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  CalendarRange, ChevronLeft, ChevronRight, Download, FileDown, Loader2,
  TrendingUp, TrendingDown, AlertTriangle, UserPlus, UserCheck, UserMinus, RotateCcw,
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { useAppContext } from '../App';
import { getKeepInCRMHistory } from '../api';
import { ClientRecord } from '../lib/clientAnalytics';
import { LtvSnapshot } from '../lib/ltvSnapshot';
import { DEFAULT_CURRENCY_RATES, COHORT_MATURITY_DAYS } from '../lib/cac';
import { pluralUk } from '../lib/plural';
import {
  MonthlyReport, MonthSpend, MonthTotals, MovementKind, MOVEMENT_LABELS,
  AcquisitionInput, AcquisitionStats, SourceStat,
  buildMonthlyReport, computeMonthSpend, computeAcquisition, groupSources,
  monthlyReportToCsv, summarizeMonth, judgeLtvToCac, LTV_TO_CAC_HINTS,
  monthLabel, monthLabelIn, monthBounds, shiftMonth, currentMonth, lastClosedMonth,
  availableMonths, delta, formatPct,
} from '../lib/monthlyReport';
import MonthlyReportDoc from './MonthlyReportDoc';
import Donut, { sourceColor } from './report/Donut';

/**
 * Місячний звіт — окрема вкладка аналітики.
 *
 * Решта аналітики відповідає на «хто наші клієнти» й живе під фільтрами. Цей
 * розділ відповідає на «що сталось у місяці» і фільтрів навмисно не має: звіт
 * за місяць, зібраний по зрізу бази, читають як звіт про всю компанію — і
 * помиляються, бо в готовому документі зріза не видно.
 *
 * Тому тут лише один орган керування — сам місяць. Усе решта однакове щоразу,
 * щоб два звіти поруч читались як один ряд чисел.
 */

const STORAGE_KEY = 'pawell_monthly_report_month';

/** Скільки місяців у динаміці — рік, щоб було видно сезонність */
const TREND_MONTHS = 12;
/** Скільки рядків клієнтів показуємо на екрані; повний список — у CSV */
const SCREEN_ROWS = 20;

const uah = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} ₴`;
const num = (n: number) => n.toLocaleString('uk-UA');
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Валідний 'YYYY-MM' — усе інше зі сховища не беремо */
const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/**
 * Зміна показника.
 *
 * `good` існує заради CAC і витрат: там зростання — погана новина, і фарбувати
 * її зеленим означало б брехати кольором.
 */
function Change({ pct, good = 'up' }: { pct: number | null; good?: 'up' | 'down' }) {
  if (pct === null) {
    return <span className="text-[11px] text-gray-400" title="Минулого місяця показник був нульовим — відсоток не визначений">—</span>;
  }
  const rising = pct >= 0;
  const positive = good === 'up' ? rising : !rising;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded ${
        pct === 0 ? 'bg-gray-100 text-gray-500'
          : positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
      }`}
    >
      {rising ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {formatPct(pct)}
    </span>
  );
}

/** Картка показника: число, зміна до попереднього місяця і що це взагалі */
function Metric({
  label, value, pct, note, good = 'up',
}: {
  label: string;
  value: string;
  pct: number | null;
  note?: string;
  good?: 'up' | 'down';
  key?: React.Key;
}) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
      <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xl font-black text-gray-900 truncate" title={value}>{value}</p>
        <Change pct={pct} good={good} />
      </div>
      {note && <p className="text-[11px] text-gray-400 mt-1 truncate" title={note}>{note}</p>}
    </div>
  );
}

const MOVEMENT_VISUALS: Record<MovementKind, { icon: React.ReactNode; tone: string; bg: string; hint: string }> = {
  new:         { icon: <UserPlus className="w-4 h-4" />,   tone: 'text-purple-700',  bg: 'bg-purple-50 border-purple-100',   hint: 'перша покупка цього місяця' },
  kept:        { icon: <UserCheck className="w-4 h-4" />,  tone: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100', hint: 'купували і минулого місяця, і цього' },
  reactivated: { icon: <RotateCcw className="w-4 h-4" />,  tone: 'text-blue-700',    bg: 'bg-blue-50 border-blue-100',       hint: 'були в паузі минулого місяця й повернулись' },
  lost:        { icon: <UserMinus className="w-4 h-4" />,  tone: 'text-red-700',     bg: 'bg-red-50 border-red-100',         hint: 'купували минулого місяця, цього — ні' },
};

/** Картка розділу з заголовком і поясненням під ним */
function Card({ title, hint, children, right }: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h3 className="text-base font-black text-gray-800">{title}</h3>
          {hint && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

const Th = ({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right'; key?: React.Key }) => (
  <th className={`py-2 px-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
);

interface Props {
  /** Уся база клієнтів — звіт навмисно не бере відфільтровану вибірку */
  clients: ClientRecord[];
  loading: boolean;
  /** Знімок LTV — з нього беремо LTV для співвідношення LTV/CAC */
  snapshot: LtvSnapshot | null;
}

export default function MonthlyReportView({ clients, loading, snapshot }: Props) {
  const { state, canView } = useAppContext();

  /**
   * Витрати — чутливий розділ із власним дозволом, і бюджет відділу не має
   * протікати в аналітику тому, кому його не відкривали. Той самий дозвіл, що
   * закриває картку CAC на головній.
   */
  const canSeeMoney = canView('expenses');

  /** Вибраний місяць живе між сеансами: звіт відкривають кілька разів за день */
  const [month, setMonth] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isMonth(saved)) return saved;
    } catch { /* приватний режим */ }
    return lastClosedMonth();
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, month); } catch { /* не привід ламати звіт */ }
  }, [month]);

  /**
   * Топ рахуємо з запасом (100), а показуємо двадцятку.
   *
   * Запас потрібен друкованому документу, який бере більше рядків, а повний
   * список клієнтів місяця однаково живе в CSV — він збирається з руху клієнтів,
   * а не з топа, і цей ліміт на нього не впливає.
   */
  const report = useMemo<MonthlyReport>(
    () => buildMonthlyReport(clients, month, { trendMonths: TREND_MONTHS, topLimit: 100 }),
    [clients, month],
  );

  /** Місяці з даними — щоб стрілки не гуляли по порожнечі */
  const months = useMemo(() => availableMonths(clients), [clients]);
  /** Межі даних; null — даних немає взагалі, і тоді стрілки нічим не обмежені */
  const newest = months[0] ?? null;
  const oldest = months[months.length - 1] ?? null;

  const thisMonth = currentMonth();
  const incomplete = month >= thisMonth;

  const t = report.totals;
  const p = report.prevTotals;

  /*
    Залучення приходить не зі знімка LTV, а з добових зрізів CRM: MQA, конверсія
    й джерела — це когорта місяця, якої в помісячних сумах немає. Тягнемо два
    місяці окремими запитами, а не одним із `compare`: порівняння на сервері
    рахується «стільки ж днів поспіль», і для 30-денного місяця базою став би
    хвіст попереднього, а не сам попередній місяць.
  */
  const [acqRaw, setAcqRaw] = useState<{ month: string; current: AcquisitionInput; prev: AcquisitionInput | null } | null>(null);
  const [acqLoading, setAcqLoading] = useState(true);
  const [acqError, setAcqError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const bounds = monthBounds(month);
    const prevBounds = monthBounds(shiftMonth(month, -1));

    setAcqLoading(true);
    setAcqError(null);
    (async () => {
      try {
        const [cur, prev] = await Promise.all([
          getKeepInCRMHistory(bounds.from, bounds.to, false),
          getKeepInCRMHistory(prevBounds.from, prevBounds.to, false),
        ]);
        if (cancelled) return;
        setAcqRaw({ month, current: cur.aggregated, prev: prev.aggregated });
      } catch (e: any) {
        if (!cancelled) setAcqError(e.message || 'Не вдалось завантажити дані залучення');
      } finally {
        if (!cancelled) setAcqLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month]);

  const acquisition = useMemo<AcquisitionStats | null>(() => {
    // Дані попереднього місяця ще на льоту — не показуємо чужі числа під новою назвою
    if (!acqRaw || acqRaw.month !== month) return null;
    return computeAcquisition(acqRaw.current, acqRaw.prev, month, { maturityDays: COHORT_MATURITY_DAYS });
  }, [acqRaw, month]);

  /** Джерела для кільця: п'ять найбільших і «Інші» */
  const donutSources = useMemo(
    () => (acquisition ? groupSources(acquisition.sources, 5) : []),
    [acquisition],
  );

  /**
   * LTV для співвідношення LTV/CAC.
   *
   * Когортний на 12 місяців, поки він є; інакше ARPU за весь час — те саме
   * число, що показує аналітика поруч, і та сама послідовність, що на дашборді.
   * Інакше LTV/CAC у двох місцях відрізнялось би без жодного пояснення.
   */
  const ltv = useMemo(() => {
    const ltv12 = snapshot?.cohortLtv?.horizons?.[12]?.ltv ?? null;
    if (ltv12) return { value: ltv12, basis: 'LTV 12 міс' as const };
    if (snapshot?.ltv) return { value: snapshot.ltv, basis: 'ARPU' as const };
    return null;
  }, [snapshot]);

  // Витрати живуть у спільному стані застосунку, а не в знімку CRM — звідси й
  // беруться, тією ж функцією, що на дашборді, щоб суми за місяць сходились.
  const spend = useMemo<MonthSpend | null>(() => {
    if (!canSeeMoney) return null;
    const expenses = state.expenses ?? [];
    if (expenses.length === 0) return null;

    /*
      Знаменник CAC — когортні клієнти з CRM (MQA), як на дашборді. Помісячні
      суми LTV беремо лише тоді, коли агрегати CRM недоступні: вони рахують
      «новий» інакше (перша покупка), і змішувати два визначення в одному числі
      не можна — про підміну сказано в підписі під карткою.
    */
    const fromCrm = acquisition !== null;
    return computeMonthSpend(
      expenses,
      month,
      {
        newClients: fromCrm ? acquisition!.mqa : report.totals.newClients,
        prevNewClients: fromCrm ? acquisition!.prevMqa : report.prevTotals.newClients,
        acquired: fromCrm ? acquisition!.acquired : undefined,
        revenue: report.totals.revenue,
        ltv: ltv?.value ?? null,
        ltvBasis: ltv?.basis,
        clientsBySource: fromCrm ? acqRaw?.current.clientsBySource : undefined,
      },
      state.currencyRates ?? DEFAULT_CURRENCY_RATES,
    );
  }, [canSeeMoney, state.expenses, state.currencyRates, month, report, acquisition, acqRaw, ltv]);

  /** На чому саме порахований CAC — читач має знати, що в знаменнику */
  const cacBasisLabel = acquisition ? 'клієнти когорти місяця з CRM (MQA)' : 'нові клієнти з помісячних сум LTV';


  // ── Вивантаження ───────────────────────────────────────────────────────────
  const exportCsv = useCallback(() => {
    const blob = new Blob(['﻿' + monthlyReportToCsv(report)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monthly-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report, month]);

  /**
   * Документ існує в DOM лише поки його друкують — так само, як звіт по вибірці:
   * тримати намальованими дві сотні рядків заради кнопки, яку тиснуть раз на
   * місяць, немає за що.
   */
  const [preparingPdf, setPreparingPdf] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  const printDoc = useReactToPrint({
    contentRef: docRef,
    documentTitle: `Місячний звіт — ${month}`,
    onAfterPrint: () => setPreparingPdf(false),
    onPrintError: () => setPreparingPdf(false),
  });

  useEffect(() => {
    if (!preparingPdf) return;
    // Таймер, а не кадр: у фоновій вкладці кадри не малюються, і друк не стартує
    const id = setTimeout(() => printDoc(), 50);
    return () => clearTimeout(id);
  }, [preparingPdf, printDoc]);

  const trendMax = Math.max(1, ...report.trend.map(x => x.revenue));
  const lost = report.movements.lost;

  return (
    <>
    <div className="flex flex-col gap-6 print:hidden">

      {/* ── Вибір місяця ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-purple-200">
              <CalendarRange className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-gray-900 leading-tight">
                Місячний звіт · {monthLabel(month)}
              </h2>
              <p className="text-xs text-gray-500">
                {loading
                  ? 'Завантаження клієнтів…'
                  : <>по всій базі ({num(report.totalClients)} клієнтів) · порівняння з {monthLabelIn(report.prevMonth)} · фільтри аналітики не застосовуються</>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setMonth(m => shiftMonth(m, -1))}
                disabled={oldest !== null && month <= oldest}
                title="Попередній місяць"
                className="p-1.5 rounded-md text-gray-500 hover:bg-white hover:text-purple-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="month"
                value={month}
                max={newest && newest > thisMonth ? newest : thisMonth}
                onChange={e => { if (isMonth(e.target.value)) setMonth(e.target.value); }}
                className="bg-white border border-gray-200 rounded-md px-2 py-1 text-xs font-semibold text-gray-700 outline-none focus:border-violet-400"
              />
              <button
                onClick={() => setMonth(m => shiftMonth(m, 1))}
                disabled={month >= thisMonth}
                title="Наступний місяць"
                className="p-1.5 rounded-md text-gray-500 hover:bg-white hover:text-purple-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setMonth(lastClosedMonth())}
              disabled={month === lastClosedMonth()}
              title="Останній закритий місяць — типовий звітний період"
              className="px-2.5 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:border-purple-300 hover:text-purple-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Минулий місяць
            </button>

            <button
              onClick={exportCsv}
              disabled={t.clients === 0 && lost.clients.length === 0}
              title="Вивантажити всіх клієнтів місяця, включно з тими, хто перестав купувати"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:border-purple-300 hover:text-purple-700 hover:bg-purple-50/50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>

            <button
              onClick={() => setPreparingPdf(true)}
              disabled={loading || preparingPdf}
              title="Зібрати місячний звіт у PDF"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {preparingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              <span className="hidden sm:inline">{preparingPdf ? 'Готуємо…' : 'PDF'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Попередження ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center gap-2 px-6 py-4 text-sm text-gray-500 bg-white rounded-2xl border border-gray-100">
          <Loader2 className="w-4 h-4 animate-spin" />
          Завантаження клієнтів…
        </div>
      )}

      {/* Порожня база й знімок старого формату — різні біди, і радять у них різне */}
      {!loading && clients.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-10 text-center">
          <p className="text-sm text-gray-500">
            Список клієнтів порожній — можливо, синхронізація LTV ще не збирала ці дані.
          </p>
        </div>
      )}

      {!loading && clients.length > 0 && !report.hasMonthlyStats && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            У знімку LTV немає сум по місяцях, а місячний звіт рахується саме з них — тому всі числа
            нижче нульові. Перезапустіть синхронізацію LTV, і звіт з'явиться.
          </span>
        </div>
      )}

      {!loading && incomplete && clients.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2 text-xs text-blue-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            {monthLabel(month)} ще не закінчився — числа неповні, і порівняння
            з {monthLabelIn(report.prevMonth)} занижене. Для підписаного звіту беріть закритий місяць.
          </span>
        </div>
      )}

      {!loading && report.hasMonthlyStats && t.clients === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-10 text-center">
          <p className="text-sm text-gray-500">
            За {monthLabelIn(month)} у базі немає жодної угоди.
          </p>
          {oldest && newest && (
            <p className="text-xs text-gray-400 mt-1">
              Дані є за {monthLabel(oldest)} — {monthLabel(newest)}.
            </p>
          )}
        </div>
      )}

      {!loading && t.clients > 0 && (
        <>
          {/* ── Коротко ──────────────────────────────────────────────────── */}
          <Card
            title="Коротко про місяць"
            hint="Ті самі числа, що в таблицях нижче, прочитані вголос — щоб усі читали їх однаково."
          >
            <ul className="space-y-1.5">
              {summarizeMonth(report, { acquisition, spend }).map((line, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700 leading-snug">
                  <span className="text-purple-400 font-bold flex-shrink-0">•</span>
                  {line}
                </li>
              ))}
            </ul>
          </Card>

          {/* ── Показники ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            {[
              { label: 'Дохід', value: uah(t.revenue), d: delta(t.revenue, p.revenue), note: `було ${uah(p.revenue)}` },
              { label: 'Угод', value: num(t.deals), d: delta(t.deals, p.deals), note: `було ${num(p.deals)}` },
              { label: 'Активних клієнтів', value: num(t.clients), d: delta(t.clients, p.clients), note: `було ${num(p.clients)}` },
              { label: 'Середній чек', value: uah(t.avgCheck), d: delta(t.avgCheck, p.avgCheck), note: `було ${uah(p.avgCheck)}` },
              { label: 'Дохід на клієнта', value: uah(t.arpu), d: delta(t.arpu, p.arpu), note: `було ${uah(p.arpu)}` },
            ].map(m => (
              <Metric key={m.label} label={m.label} value={m.value} pct={m.d.pct} note={m.note} />
            ))}
          </div>

          {/* ── Залучення і утримання ────────────────────────────────────
              Другий ряд показників, а не шість карток у першому: дохід — це
              результат, а MQA, конверсія, LTV/CAC і утримання — те, з чого він
              вийшов. Мішати їх в один ряд означало б ставити наслідок поруч із
              причиною без жодної позначки. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <Metric
              label="MQA · клієнти за місяць"
              value={acquisition ? num(acquisition.mqa) : acqLoading ? '…' : '—'}
              pct={acquisition?.mqaChange ?? null}
              note={acquisition
                ? `із ${num(acquisition.acquired)} залучених · було ${num(acquisition.prevMqa)}`
                : acqError ? 'дані CRM недоступні' : 'когорта місяця з CRM'}
            />
            <Metric
              label="Конверсія в клієнта"
              value={acquisition?.conversion !== null && acquisition !== null ? `${acquisition.conversion} %` : acqLoading ? '…' : '—'}
              pct={acquisition?.conversionChange ?? null}
              note={acquisition?.prevConversion !== null && acquisition !== null
                ? `було ${acquisition.prevConversion} % · залучений → клієнт`
                : 'частка залучених, що стали клієнтами'}
            />
            <Metric
              label="LTV / CAC"
              value={spend?.ltvToCac != null ? `${spend.ltvToCac}` : canSeeMoney ? '—' : 'закрито'}
              pct={null}
              note={spend?.ltvToCac != null
                ? LTV_TO_CAC_HINTS[judgeLtvToCac(spend.ltvToCac)!]
                : canSeeMoney ? 'потрібні витрати за місяць і LTV' : 'потрібен доступ до витрат'}
            />
            <Metric
              label="Утримання клієнтів"
              value={report.retention.rate !== null ? `${report.retention.rate} %` : '—'}
              pct={report.retention.rate !== null && report.prevRetention.rate !== null
                ? delta(report.retention.rate, report.prevRetention.rate).pct
                : null}
              note={report.retention.rate !== null
                ? `${num(report.retention.kept)} з ${num(report.retention.base)} клієнтів ${monthLabelIn(report.prevMonth)}`
                : `у ${monthLabelIn(report.prevMonth)} активних не було`}
            />
            <Metric
              label="Утримання доходу"
              value={report.retention.revenueRetention !== null ? `${report.retention.revenueRetention} %` : '—'}
              pct={null}
              note={`дохід тих самих клієнтів проти всього доходу ${monthLabelIn(report.prevMonth)}`}
            />
          </div>

          {acqError && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5 flex items-start gap-2 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Дані залучення з CRM не завантажились ({acqError}). MQA, конверсія й джерела
                недоступні — решта звіту рахується з помісячних сум і не залежить від них.
              </span>
            </div>
          )}

          {acquisition && !acquisition.mature && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5 flex items-start gap-2 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Когорта {monthLabelIn(month)} ще дозріває: лідам з останніх днів місяця треба
                час, щоб стати клієнтами. Тому MQA й конверсія поки занижені, а CAC завищений —
                через {COHORT_MATURITY_DAYS} дн. після закриття місяця числа усталяться.
              </span>
            </div>
          )}

          {/* Рік тому — окремим рядком, а не шостою карткою: це інша база
              порівняння, і мішати її з «до минулого місяця» не можна. */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Рік тому</span>
            {report.hasYearAgo ? (
              <>
                <span className="text-gray-600">
                  {monthLabel(report.yearAgoMonth)}: <strong className="text-gray-900">{uah(report.yearAgoTotals.revenue)}</strong>
                  {' · '}{num(report.yearAgoTotals.deals)} {pluralUk(report.yearAgoTotals.deals, 'угода', 'угоди', 'угод')}
                  {' · '}{num(report.yearAgoTotals.clients)} {pluralUk(report.yearAgoTotals.clients, 'клієнт', 'клієнти', 'клієнтів')}
                </span>
                <Change pct={delta(t.revenue, report.yearAgoTotals.revenue).pct} />
                <span className="text-xs text-gray-400">порівняння прибирає сезонність</span>
              </>
            ) : (
              <span className="text-xs text-gray-400">
                Даних за {monthLabelIn(report.yearAgoMonth)} немає — сезонність порівняти нема з чим.
              </span>
            )}
          </div>

          {/* ── Рух клієнтів ─────────────────────────────────────────────── */}
          <Card
            title="Рух клієнтів"
            hint={<>Чотири групи, а не «стало більше чи менше»: зростання на нових і зростання на
              поверненнях лікуються різним. Для тих, хто перестав купувати, показано, скільки вони
              давали в {monthLabelIn(report.prevMonth)}.</>}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {(['new', 'kept', 'reactivated', 'lost'] as MovementKind[]).map(kind => {
                const g = report.movements[kind];
                const v = MOVEMENT_VISUALS[kind];
                return (
                  <div key={kind} className={`rounded-xl border px-4 py-3 ${v.bg}`}>
                    <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${v.tone}`}>
                      {v.icon}
                      {MOVEMENT_LABELS[kind]}
                    </div>
                    <p className={`text-3xl font-black mt-1 ${v.tone}`}>{num(g.clients.length)}</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {uah(g.revenue)}
                      {kind !== 'lost' && t.revenue > 0 && (
                        <span className="text-gray-400"> · {share(g.revenue, t.revenue)} % доходу</span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1 leading-snug">{v.hint}</p>
                  </div>
                );
              })}
            </div>

            {/* Утримання — під самими групами: воно з них і складається, тож
                показувати його окремою карткою означало б змусити читача
                складати ці числа в голові. */}
            <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-600">
              <span>
                Утримання клієнтів:{' '}
                <strong className="text-gray-900">
                  {report.retention.rate !== null ? `${report.retention.rate} %` : '—'}
                </strong>
                {report.retention.rate !== null && (
                  <span className="text-gray-400">
                    {' '}({num(report.retention.kept)} з {num(report.retention.base)})
                  </span>
                )}
              </span>
              <span>
                Відтік:{' '}
                <strong className="text-gray-900">
                  {report.retention.churn !== null ? `${report.retention.churn} %` : '—'}
                </strong>
              </span>
              <span title={`Дохід цього місяця від клієнтів, активних у ${monthLabelIn(report.prevMonth)}, проти всього доходу того місяця`}>
                Утримання доходу:{' '}
                <strong className="text-gray-900">
                  {report.retention.revenueRetention !== null ? `${report.retention.revenueRetention} %` : '—'}
                </strong>
              </span>
              <span>
                Дохід від постійних:{' '}
                <strong className="text-gray-900">{report.retention.repeatRevenueShare} %</strong>
              </span>
              {report.prevRetention.rate !== null && report.retention.rate !== null && (
                <span className="text-gray-400">
                  у {monthLabelIn(report.prevMonth)} утримання було {report.prevRetention.rate} %
                </span>
              )}
            </div>
          </Card>

          {/* ── Нові та постійні ─────────────────────────────────────────── */}
          <Card
            title="Нові та постійні"
            hint="Новий — той, у кого перша покупка сталась саме цього місяця. Постійний купував і раніше."
          >
            {/* Смужка перед таблицею: співвідношення видно за секунду, а числа
                в таблиці потрібні лише тому, хто вже побачив перекіс. */}
            <div className="flex h-3 rounded-full overflow-hidden mb-3 bg-gray-100">
              <div
                className="bg-purple-500"
                style={{ width: `${share(t.newRevenue, t.revenue)}%` }}
                title={`Нові: ${uah(t.newRevenue)}`}
              />
              <div
                className="bg-emerald-500"
                style={{ width: `${share(t.returningRevenue, t.revenue)}%` }}
                title={`Постійні: ${uah(t.returningRevenue)}`}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <Th>Тип клієнта</Th>
                    <Th align="right">Клієнтів</Th>
                    <Th align="right">Було в {monthLabel(report.prevMonth)}</Th>
                    <Th align="right">Угод</Th>
                    <Th align="right">Дохід</Th>
                    <Th align="right">Частка доходу</Th>
                    <Th align="right">Середній чек</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    { label: 'Нові', dot: 'bg-purple-500', clients: t.newClients, prevClients: p.newClients, deals: t.newDeals, revenue: t.newRevenue },
                    { label: 'Постійні', dot: 'bg-emerald-500', clients: t.returningClients, prevClients: p.returningClients, deals: t.returningDeals, revenue: t.returningRevenue },
                  ].map(row => (
                    <tr key={row.label} className="hover:bg-gray-50/50 transition">
                      <td className="py-2.5 px-3 text-sm font-semibold text-gray-800">
                        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${row.dot}`} />
                        {row.label}
                      </td>
                      <td className="py-2.5 px-3 text-sm text-right font-bold text-gray-900">{num(row.clients)}</td>
                      <td className="py-2.5 px-3 text-sm text-right text-gray-500">{num(row.prevClients)}</td>
                      <td className="py-2.5 px-3 text-sm text-right text-gray-700">{num(row.deals)}</td>
                      <td className="py-2.5 px-3 text-sm text-right font-bold text-gray-900 whitespace-nowrap">{uah(row.revenue)}</td>
                      <td className="py-2.5 px-3 text-sm text-right text-gray-700">{share(row.revenue, t.revenue)} %</td>
                      <td className="py-2.5 px-3 text-sm text-right text-gray-600 whitespace-nowrap">
                        {row.deals > 0 ? uah(row.revenue / row.deals) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Динаміка ─────────────────────────────────────────────────── */}
          <Card
            title={`Динаміка за ${TREND_MONTHS} ${pluralUk(TREND_MONTHS, 'місяць', 'місяці', 'місяців')}`}
            hint="Ряд закінчується звітним місяцем. Натисніть на стовпець, щоб перейти до звіту за той місяць."
          >
            <div className="flex items-end gap-1.5 h-48 mb-4 overflow-x-auto pt-6">
              {report.trend.map(m => {
                const height = Math.round((m.revenue / trendMax) * 100);
                const isCurrent = m.month === month;
                return (
                  <button
                    key={m.month}
                    onClick={() => setMonth(m.month)}
                    title={`${monthLabel(m.month)}: ${uah(m.revenue)} · ${num(m.deals)} ${pluralUk(m.deals, 'угода', 'угоди', 'угод')} · ${num(m.clients)} ${pluralUk(m.clients, 'клієнт', 'клієнти', 'клієнтів')}`}
                    className="flex-1 min-w-[36px] h-full flex flex-col items-center justify-end gap-1 group"
                  >
                    <span className={`text-[10px] font-bold whitespace-nowrap ${isCurrent ? 'text-purple-700' : 'text-gray-400 group-hover:text-gray-600'}`}>
                      {m.revenue > 0 ? `${Math.round(m.revenue / 1000)}k` : ''}
                    </span>
                    <div
                      className={`w-full rounded-t-md transition-all ${
                        isCurrent ? 'bg-purple-600' : 'bg-purple-200 group-hover:bg-purple-300'
                      }`}
                      style={{ height: `${Math.max(2, height)}%` }}
                    />
                    <span className={`text-[10px] whitespace-nowrap ${isCurrent ? 'font-bold text-purple-700' : 'text-gray-400'}`}>
                      {m.month.slice(5)}.{m.month.slice(2, 4)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <Th>Місяць</Th>
                    <Th align="right">Дохід</Th>
                    <Th align="right">Угод</Th>
                    <Th align="right">Клієнтів</Th>
                    <Th align="right">Нових</Th>
                    <Th align="right">Середній чек</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...report.trend].reverse().map((m: MonthTotals) => (
                    <tr
                      key={m.month}
                      onClick={() => setMonth(m.month)}
                      className={`cursor-pointer transition ${m.month === month ? 'bg-purple-50/70' : 'hover:bg-gray-50/50'}`}
                    >
                      <td className={`py-2 px-3 text-sm ${m.month === month ? 'font-bold text-purple-800' : 'text-gray-700'}`}>
                        {monthLabel(m.month)}
                      </td>
                      <td className="py-2 px-3 text-sm text-right font-bold text-gray-900 whitespace-nowrap">{uah(m.revenue)}</td>
                      <td className="py-2 px-3 text-sm text-right text-gray-700">{num(m.deals)}</td>
                      <td className="py-2 px-3 text-sm text-right text-gray-700">{num(m.clients)}</td>
                      <td className="py-2 px-3 text-sm text-right text-gray-700">{num(m.newClients)}</td>
                      <td className="py-2 px-3 text-sm text-right text-gray-600 whitespace-nowrap">
                        {m.deals > 0 ? uah(m.avgCheck) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Джерела ───────────────────────────────────────────────────── */}
          <Card
            title="Яке джерело скільки принесло"
            hint={<>Сума угод місяця по джерелах з CRM. Кільце — частки, точні числа в таблиці:
              на кільці їх не читають, і воно не для цього.
              {acquisition && acquisition.sources.length > donutSources.length &&
                ` Джерел ${num(acquisition.sources.length)}; у кільці п'ять найбільших, решта — «Інші».`}</>}
          >
            {acqLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Завантаження даних по джерелах…
              </div>
            ) : !acquisition || donutSources.length === 0 ? (
              <p className="text-sm text-gray-400">
                {acqError
                  ? 'Дані по джерелах недоступні — CRM не відповіла.'
                  : `За ${monthLabelIn(month)} CRM не повернула угод по джерелах.`}
              </p>
            ) : (
              <div className="flex flex-col xl:flex-row gap-6 xl:items-start">
                <div className="flex-shrink-0 flex flex-col items-center gap-3">
                  <Donut
                    slices={donutSources.map((c, i) => ({
                      label: c.source,
                      value: c.revenue,
                      color: sourceColor(i, c.source),
                      hint: `${c.source}: ${uah(c.revenue)} · ${c.revenueShare} % · ${num(c.deals)} ${pluralUk(c.deals, 'угода', 'угоди', 'угод')}`,
                    }))}
                    centerValue={uah(acquisition.sourcesRevenue)}
                    centerLabel="сума угод місяця"
                    size={220}
                  />
                  {/* Легенда обов'язкова: колір сам по собі ніколи не має
                      залишатись єдиним носієм того, яке це джерело. */}
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 max-w-[260px]">
                    {donutSources.map((c, i) => (
                      <span key={c.source} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
                        <span
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: sourceColor(i, c.source) }}
                        />
                        {c.source} · {c.revenueShare} %
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex-1 min-w-0 overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <Th>Джерело</Th>
                        <Th align="right">Сума угод</Th>
                        <Th align="right">Частка</Th>
                        <Th align="right">Угод</Th>
                        <Th align="right">Клієнтів (MQA)</Th>
                        <Th align="right">Залучено</Th>
                        <Th align="right">Конверсія</Th>
                        {canSeeMoney && <Th align="right">CAC</Th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {acquisition.sources.map((c: SourceStat, i) => {
                        // CAC по джерелу є лише там, де зійшлись і витрати, і клієнти
                        const sourceCac = spend?.bySource?.matched.find(
                          m => m.source.toLowerCase() === c.source.toLowerCase(),
                        );
                        return (
                          <tr key={c.source} className="hover:bg-gray-50/50 transition">
                            <td className="py-2 px-3 text-sm font-semibold text-gray-800">
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                  style={{ backgroundColor: i < 5 ? sourceColor(i) : '#9ca3af' }}
                                />
                                {c.source}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-sm text-right font-bold text-gray-900 whitespace-nowrap">{uah(c.revenue)}</td>
                            <td className="py-2 px-3 text-sm text-right text-gray-700">{c.revenueShare} %</td>
                            <td className="py-2 px-3 text-sm text-right text-gray-700">{num(c.deals)}</td>
                            <td className="py-2 px-3 text-sm text-right text-gray-700">{num(c.clients)}</td>
                            <td className="py-2 px-3 text-sm text-right text-gray-500">{num(c.acquired)}</td>
                            <td className="py-2 px-3 text-sm text-right text-gray-700">
                              {c.conversion !== null ? `${c.conversion} %` : '—'}
                            </td>
                            {canSeeMoney && (
                              <td className="py-2 px-3 text-sm text-right text-gray-700 whitespace-nowrap">
                                {sourceCac?.cac != null ? uah(sourceCac.cac) : <span className="text-gray-300">—</span>}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {canSeeMoney && spend?.bySource && spend.bySource.unmatchedSpend > 0 && (
                    <p className="text-[11px] text-gray-400 mt-2 leading-snug">
                      {uah(spend.bySource.unmatchedSpend)} рекламних витрат заведено на джерела,
                      яких немає в CRM — CAC по них порахувати неможливо. Назви джерел у витратах
                      і в CRM мають збігатись.
                    </p>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* ── Гроші ────────────────────────────────────────────────────── */}
          {canSeeMoney && (
          <Card
            title="Гроші: витрати й вартість клієнта"
            hint={<>Витрати за дати цього місяця з розділу «Витрати», зведені до гривні.
              У знаменнику CAC — {cacBasisLabel}
              {acquisition ? `: ${num(acquisition.mqa)}` : `: ${num(t.newClients)}`}.
              {spend?.hasForeign && ' Частина витрат не в гривні — сума залежить від курсу в налаштуваннях витрат.'}</>}
          >
            {!spend || spend.count === 0 ? (
              <p className="text-sm text-gray-400">
                За {monthLabelIn(month)} витрат не внесено — вартість клієнта порахувати неможливо.
                Внесіть витрати в розділі «Витрати», і блок заповниться.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                  {/* Для витрат і CAC зростання — погана новина, тож good='down' */}
                  <Metric
                    label="Витрати за місяць"
                    value={uah(spend.total)}
                    pct={delta(spend.total, spend.prevTotal).pct}
                    note={`було ${uah(spend.prevTotal)}`}
                    good="down"
                  />
                  <Metric
                    label="З них реклама"
                    value={uah(spend.ads)}
                    pct={delta(spend.ads, spend.prevAds).pct}
                    note={`було ${uah(spend.prevAds)}`}
                    good="down"
                  />
                  <Metric
                    label="CAC за рекламою"
                    value={spend.cac !== null ? uah(spend.cac) : '—'}
                    pct={spend.cacChange}
                    note={spend.prevCac !== null ? `було ${uah(spend.prevCac)}` : 'порівнювати нема з чим'}
                    good="down"
                  />
                  <Metric
                    label="CAC за всіма витратами"
                    value={spend.blendedCac !== null ? uah(spend.blendedCac) : '—'}
                    pct={null}
                    note="усі витрати відділу ÷ залучені клієнти"
                    good="down"
                  />
                  <Metric
                    label="LTV / CAC"
                    value={spend.ltvToCac != null ? `${spend.ltvToCac}` : '—'}
                    pct={null}
                    note={spend.ltvToCac != null && spend.ltvBasis
                      ? `${spend.ltvBasis} ${uah(spend.ltv ?? 0)} ÷ CAC ${uah(spend.cac ?? 0)}`
                      : 'потрібні рекламний бюджет і LTV'}
                  />
                </div>

                {/* Другий ряд — довідкові числа поруч, а не ще п'ять карток:
                    їх читають рідше, ніж CAC, але без них CAC не перевірити. */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-xs text-gray-600">
                  <span>
                    Дохід на 1 ₴ витрат:{' '}
                    <strong className="text-gray-900">
                      {spend.revenuePerSpend !== null ? `${spend.revenuePerSpend} ₴` : '—'}
                    </strong>
                  </span>
                  <span>
                    ДРВ (частка реклами в доході):{' '}
                    <strong className="text-gray-900">{spend.adShare !== null ? `${spend.adShare} %` : '—'}</strong>
                  </span>
                  <span title="Вартість одного залученого записа — ліда, який ще не став клієнтом">
                    CPL (вартість залученого):{' '}
                    <strong className="text-gray-900">{spend.cpl !== null ? uah(spend.cpl) : '—'}</strong>
                  </span>
                  {spend.ltvToCac != null && judgeLtvToCac(spend.ltvToCac) === 'thin' && (
                    <span className="text-red-700 font-semibold">
                      LTV/CAC нижче 3 — клієнт приносить менше ніж утричі більше, ніж коштував
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <Th>Категорія витрат</Th>
                        <Th align="right">Сума</Th>
                        <Th align="right">Частка витрат</Th>
                        <Th align="right">Частка доходу місяця</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {spend.byCategory.map(c => (
                        <tr key={c.category} className="hover:bg-gray-50/50 transition">
                          <td className="py-2 px-3 text-sm font-semibold text-gray-800">{c.category}</td>
                          <td className="py-2 px-3 text-sm text-right font-bold text-gray-900 whitespace-nowrap">{uah(c.amount)}</td>
                          <td className="py-2 px-3 text-sm text-right text-gray-700">{share(c.amount, spend.total)} %</td>
                          <td className="py-2 px-3 text-sm text-right text-gray-600">
                            {t.revenue > 0 ? `${share(c.amount, t.revenue)} %` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
          )}

          {/* ── Найбільші клієнти ────────────────────────────────────────── */}
          <Card
            title="Найбільші клієнти місяця"
            hint={<>Зміна — різниця з {monthLabelIn(report.prevMonth)}.
              {t.clients > SCREEN_ROWS && ` Показано ${SCREEN_ROWS} із ${num(t.clients)} активних клієнтів місяця; повний список — у CSV.`}</>}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <Th>Клієнт</Th>
                    <Th>Група</Th>
                    <Th align="right">Дохід</Th>
                    <Th align="right">Угод</Th>
                    <Th align="right">Було в {monthLabel(report.prevMonth)}</Th>
                    <Th align="right">Зміна</Th>
                    <Th align="right">Частка місяця</Th>
                    <Th>Перша покупка</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.top.slice(0, SCREEN_ROWS).map((c, i) => (
                    <tr key={c.id} className="hover:bg-gray-50/50 transition">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-gray-300 w-5 flex-shrink-0">{i + 1}</span>
                          <span className="text-sm font-semibold text-gray-800 truncate" title={c.name}>{c.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${MOVEMENT_VISUALS[c.kind].bg} ${MOVEMENT_VISUALS[c.kind].tone}`}>
                          {MOVEMENT_LABELS[c.kind]}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-sm text-right font-bold text-gray-900 whitespace-nowrap">{uah(c.revenue)}</td>
                      <td className="py-2.5 px-3 text-sm text-right text-gray-700">{num(c.deals)}</td>
                      <td className="py-2.5 px-3 text-sm text-right text-gray-500 whitespace-nowrap">
                        {c.prevRevenue > 0 ? uah(c.prevRevenue) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-sm text-right whitespace-nowrap">
                        {c.prevRevenue > 0
                          ? <span className={c.delta >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>
                              {c.delta >= 0 ? '+' : '−'}{uah(Math.abs(c.delta))}
                            </span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-sm text-right text-gray-600">{share(c.revenue, t.revenue)} %</td>
                      <td className="py-2.5 px-3 text-xs text-gray-500 whitespace-nowrap">
                        {c.first ? monthLabel(c.first) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Перестали купувати ───────────────────────────────────────── */}
          <Card
            title="Перестали купувати"
            hint={<>Купували в {monthLabelIn(report.prevMonth)}, цього місяця — ні. Це не відтік
              назавжди, а список на дзвінок: разом вони давали {uah(lost.revenue)}.
              {lost.clients.length > SCREEN_ROWS && ` Показано ${SCREEN_ROWS} із ${num(lost.clients.length)}; повний список — у CSV.`}</>}
          >
            {lost.clients.length === 0 ? (
              <p className="text-sm text-gray-400">
                Жоден клієнт минулого місяця не зник — усі купували й цього.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <Th>Клієнт</Th>
                      <Th align="right">Давав у {monthLabel(report.prevMonth)}</Th>
                      <Th align="right">Угод було</Th>
                      <Th>Перша покупка</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lost.clients.slice(0, SCREEN_ROWS).map((c, i) => (
                      <tr key={c.id} className="hover:bg-gray-50/50 transition">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold text-gray-300 w-5 flex-shrink-0">{i + 1}</span>
                            <span className="text-sm font-semibold text-gray-800 truncate" title={c.name}>{c.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-sm text-right font-bold text-gray-900 whitespace-nowrap">{uah(c.prevRevenue)}</td>
                        <td className="py-2.5 px-3 text-sm text-right text-gray-700">{num(c.prevDeals)}</td>
                        <td className="py-2.5 px-3 text-xs text-gray-500 whitespace-nowrap">
                          {c.first ? monthLabel(c.first) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>

    {/*
      Документ для друку. На екрані його немає, у режимі друку — є: Ctrl+P із
      цієї вкладки має давати той самий звіт, що й кнопка «PDF», а не знімок
      інтерфейсу з кнопками й підказками.
    */}
    {preparingPdf && (
      <div ref={docRef} className="hidden print:block">
        <MonthlyReportDoc
          report={report}
          spend={spend}
          acquisition={acquisition}
          sources={donutSources}
          incomplete={incomplete}
        />
      </div>
    )}
    </>
  );
}

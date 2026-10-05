import React, { useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle, Info } from 'lucide-react';
import {
  STAGES, LOW_SAMPLE, StageStat, StageKey, formatDuration,
  FunnelSpeedResponse, FunnelSpeedResult, FunnelSpeedState,
} from '../../lib/funnelSpeed';

/**
 * Швидкість проходження воронки по джерелах: лід → клієнт → угода → перша оплата.
 *
 * Чисто показова вкладка: усе рахує сервер (src/lib/funnelSpeed.ts), тут лише
 * подача. Головне правило подачі — швидкість ніколи не показується без частки тих,
 * хто дійшов, і без розміру вибірки: «медіана 2 дні» по трьох клієнтах і по трьохстах
 * — зовсім різні твердження.
 */

/** Скільки джерел показуємо до «Показати всі» */
const SOURCE_ROWS = 12;
/** Скільки місяців когорт показуємо до «Показати всі» */
const COHORT_ROWS = 12;

const nf = (n: number) => n.toLocaleString('uk-UA');
const pct = (share: number | null) => (share === null ? '—' : `${Math.round(share * 100)}%`);

const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** Комірка переходу: медіана, а під нею — скільки людей за нею стоїть */
function StageCell({ stat }: { stat: StageStat; key?: React.Key }) {
  const low = stat.reached < LOW_SAMPLE;
  return (
    <>
      <td className={`py-2 px-3 text-right whitespace-nowrap ${low ? 'text-gray-400' : 'text-gray-900 font-bold'}`}>
        <span title={low ? `Менше ${LOW_SAMPLE} випадків — цифра ненадійна` : undefined}>
          {formatDuration(stat.median)}
        </span>
      </td>
      <td className="py-2 px-3 text-right whitespace-nowrap text-gray-500 hidden md:table-cell">
        {formatDuration(stat.p75)}
      </td>
      <td className="py-2 px-3 text-right whitespace-nowrap text-xs text-gray-500 border-r border-gray-100">
        {pct(stat.share)} <span className="text-gray-400">({nf(stat.reached)}/{nf(stat.entered)})</span>
      </td>
    </>
  );
}

function StageHeaders() {
  return (
    <>
      {STAGES.map(s => (
        <th key={s.key} colSpan={3} className="py-2 px-3 text-center text-xs font-bold uppercase tracking-wider text-gray-600 border-r border-gray-100">
          {s.label}
        </th>
      ))}
    </>
  );
}

function SubHeaders() {
  return (
    <>
      {STAGES.map(s => (
        <React.Fragment key={s.key}>
          <th className="py-1.5 px-3 text-right text-[10px] font-semibold uppercase text-gray-400">медіана</th>
          <th className="py-1.5 px-3 text-right text-[10px] font-semibold uppercase text-gray-400 hidden md:table-cell">p75</th>
          <th className="py-1.5 px-3 text-right text-[10px] font-semibold uppercase text-gray-400 border-r border-gray-100">дійшли</th>
        </React.Fragment>
      ))}
    </>
  );
}

function KpiCard({ stage, stat }: { stage: typeof STAGES[number]; stat: StageStat; key?: React.Key }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
      <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{stage.label}</p>
      <p className="text-3xl font-black text-gray-900 mt-1">{formatDuration(stat.median)}</p>
      <p className="text-xs text-gray-500 mt-1">
        медіана · p75 {formatDuration(stat.p75)} · p90 {formatDuration(stat.p90)}
      </p>
      <p className="text-xs text-gray-600 mt-3">
        <strong>{pct(stat.share)}</strong> дійшли ({nf(stat.reached)} з {nf(stat.entered)})
      </p>
      <p className="text-[11px] text-gray-400 mt-1 leading-snug">
        від: {stage.from} → до: {stage.to}
      </p>
    </div>
  );
}

/** Дата «17.10.2024» із підписом кількості */
const fmtBulk = (d: { day: string; count: number }) =>
  `${d.day.slice(8, 10)}.${d.day.slice(5, 7)}.${d.day.slice(0, 4)} (${nf(d.count)})`;

/** Скільки записів виключено з кожного переходу і чому — щоб цифри не здавались повнішими, ніж є */
function exclusionNotes(result: FunnelSpeedResult): string[] {
  const out: string[] = [];
  const { leadToClient: s1, clientToDeal: s2, dealToPayment: s3 } = result.overall;
  const bd = result.bulkDays;

  if (s1.immediate) {
    out.push(`${nf(s1.immediate)} клієнтів створено одразу клієнтами (не були лідами) — у «лід → клієнт» і «клієнт → угода» не враховано: їх заводять разом з угодою, і час там завжди нульовий.`);
  }
  const bulkParts = [
    bd.created.length ? `створення: ${bd.created.map(fmtBulk).join(', ')}` : '',
    bd.converted.length ? `конверсія: ${bd.converted.map(fmtBulk).join(', ')}` : '',
    bd.deals.length ? `перша угода: ${bd.deals.map(fmtBulk).join(', ')}` : '',
  ].filter(Boolean);
  if (bulkParts.length) {
    out.push(`Дні масових імпортів і правок відкинуто — на них припадає сотні й тисячі подій за добу при звичайних ~10, тож це момент імпорту, а не момент події в житті клієнта. ${bulkParts.join('; ')}.`);
  }
  if (s2.negative) out.push(`${nf(s2.negative)} клієнтів мають угоду, створену раніше за конверсію, — у «клієнт → угода» не враховано.`);
  if (s3.negative) out.push(`${nf(s3.negative)} клієнтів мають оплату, датовану раніше за першу угоду, — у «угода → оплата» не враховано.`);
  if (s3.unverified) out.push(`${nf(s3.unverified)} клієнтів мають суму «сплачено» без запису оплати — це давні угоди до обліку оплат; у швидкості оплати вони «не дійшли», хоча гроші могли надійти.`);
  const fresh = Math.max(s1.tooFresh, s2.tooFresh, s3.tooFresh);
  if (fresh) out.push(`Свіжі старти (молодші за поріг зрілості) відсічені: до ${nf(fresh)} на перехід.`);
  return out;
}

export interface FunnelSpeedProps {
  response: FunnelSpeedResponse | null;
  loading: boolean;
  error: string | null;
  syncState: FunnelSpeedState;
  isAdmin: boolean;
  onSync: (full: boolean) => Promise<void>;
  matureOnly: boolean;
  onMatureOnlyChange: (v: boolean) => void;
  minAgeDays: number;
  periodLabel: string;
}

export default function FunnelSpeed({
  response, loading, error, syncState, isAdmin, onSync, matureOnly, onMatureOnlyChange, minAgeDays, periodLabel,
}: FunnelSpeedProps) {
  const [showAllSources, setShowAllSources] = useState(false);
  const [showAllCohorts, setShowAllCohorts] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const result = response?.result ?? null;
  const meta = response?.meta ?? null;

  const startSync = async (full: boolean) => {
    setSyncError(null);
    try { await onSync(full); } catch (e: any) { setSyncError(e.message || 'Не вдалось запустити'); }
  };

  const progress = syncState.total > 0 ? Math.round((syncState.done / syncState.total) * 100) : 0;

  const syncPanel = (
    <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={matureOnly}
          onChange={e => onMatureOnlyChange(e.target.checked)}
          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
        />
        <span>
          Лише зрілі когорти <span className="text-gray-400">(старт старший за {minAgeDays || 30} днів)</span>
        </span>
      </label>
      <p className="text-xs text-gray-500 flex-1 min-w-[220px] flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
        Свіжі когорти завжди виглядають швидшими: повільні ще не дійшли. Відсікання робить порівняння чесним.
      </p>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        {meta && (
          <span title={`Режим: ${meta.mode === 'full' ? 'повний' : 'зміни'}; прогін тривав ${meta.durationSec} с`}>
            Дані від {new Date(meta.lastSyncedAt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {isAdmin && !syncState.running && (
          <>
            <button
              onClick={() => startSync(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:border-purple-300 hover:text-purple-700 font-semibold transition"
              title="Підтягнути лише змінене після попереднього прогону — кілька хвилин"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Оновити
            </button>
            <button
              onClick={() => {
                if (window.confirm('Повне вивантаження — понад 1500 запитів до KeepInCRM, близько 20 хвилин. Продовжити?')) startSync(true);
              }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-purple-300 hover:text-purple-700 font-semibold transition"
              title="Перебрати всю базу з нуля"
            >
              Повністю
            </button>
          </>
        )}
      </div>

      {syncState.running && (
        <div className="w-full">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Вивантаження ({syncState.mode === 'full' ? 'повне' : 'зміни'}): {syncState.phase || 'підготовка'}
            </span>
            <span>{syncState.total > 0 ? `${nf(syncState.done)} / ${nf(syncState.total)} стор.` : ''}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          {syncState.mode === 'full' && (
            <p className="text-[11px] text-gray-400 mt-1">
              KeepInCRM дозволяє 100 запитів на хвилину, тож повний прохід триває близько 20 хвилин. Сторінку можна не тримати відкритою.
            </p>
          )}
        </div>
      )}
      {(syncError || (syncState.error && !syncState.running)) && (
        <p className="w-full text-xs text-red-600 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {syncError || syncState.error}
        </p>
      )}
    </div>
  );

  if (loading && !response) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Завантаження…
      </div>
    );
  }

  if (error && !response) {
    return <div className="py-10 text-center text-sm text-red-600">{error}</div>;
  }

  if (!result || !meta) {
    return (
      <div className="flex flex-col gap-4">
        {syncPanel}
        <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm py-14 text-center text-sm text-gray-500">
          {syncState.running
            ? 'Дані вивантажуються — після завершення тут з’явиться звіт.'
            : 'Дані про проходження воронки ще не вивантажені.'
              + (isAdmin ? ' Натисніть «Повністю», щоб запустити перше вивантаження.' : ' Адміністратор може запустити вивантаження.')}
        </div>
      </div>
    );
  }

  const sources = showAllSources ? result.bySource : result.bySource.slice(0, SOURCE_ROWS);
  const cohorts = showAllCohorts ? result.byCohort : result.byCohort.slice(0, COHORT_ROWS);
  const notes = exclusionNotes(result);

  return (
    <div className={`flex flex-col gap-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      {syncPanel}

      {meta.warning && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
          <span>
            Вивантаження неповне: {meta.warning}. Під час прогону дані в CRM змінювались, і частина записів могла зсунутись
            між сторінками — запустіть оновлення ще раз.
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STAGES.map(s => <KpiCard key={s.key} stage={s} stat={result.overall[s.key]} />)}
      </div>

      {/* ── По джерелах ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h3 className="text-base font-black text-gray-800">По джерелах</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Джерело клієнта · когорти {periodLabel} · у комірці: час, частка тих, хто дійшов, і (дійшли/стартували).
            Сірим — менше {LOW_SAMPLE} випадків.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th rowSpan={2} className="py-2 px-4 text-left text-xs font-bold uppercase tracking-wider text-gray-600 align-bottom">Джерело</th>
                <th rowSpan={2} className="py-2 px-3 text-right text-xs font-bold uppercase tracking-wider text-gray-600 align-bottom">Клієнтів</th>
                <StageHeaders />
              </tr>
              <tr className="border-b border-gray-200"><SubHeaders /></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sources.map(s => (
                <tr key={s.source} className="hover:bg-gray-50/50">
                  <td className="py-2 px-4 font-semibold text-gray-800 max-w-[220px] truncate" title={s.source}>{s.source}</td>
                  <td className="py-2 px-3 text-right text-gray-500">{nf(s.total)}</td>
                  {STAGES.map(st => <StageCell key={st.key} stat={s.stages[st.key]} />)}
                </tr>
              ))}
              {sources.length === 0 && (
                <tr><td colSpan={2 + STAGES.length * 3} className="py-8 text-center text-gray-400">Немає даних за вибраний період</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {result.bySource.length > SOURCE_ROWS && (
          <button
            onClick={() => setShowAllSources(v => !v)}
            className="w-full py-2.5 text-xs font-semibold text-purple-700 hover:bg-purple-50 border-t border-gray-100 transition"
          >
            {showAllSources ? 'Згорнути' : `Показати всі джерела (${result.bySource.length})`}
          </button>
        )}
      </div>

      {/* ── По когортах ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h3 className="text-base font-black text-gray-800">По місяцях старту</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Місяць — це коли перехід РОЗПОЧАВСЯ (створення ліда, конверсія, перша угода). Рядок у сусідніх колонках може стосуватись різних людей.
            Свіжі місяці ще «дозрівають»: частка тих, хто дійшов, у них зросте.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th rowSpan={2} className="py-2 px-4 text-left text-xs font-bold uppercase tracking-wider text-gray-600 align-bottom">Місяць</th>
                <StageHeaders />
              </tr>
              <tr className="border-b border-gray-200"><SubHeaders /></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cohorts.map(c => (
                <tr key={c.month} className="hover:bg-gray-50/50">
                  <td className="py-2 px-4 font-semibold text-gray-800 whitespace-nowrap">{monthLabel(c.month)}</td>
                  {STAGES.map(st => <StageCell key={st.key} stat={c.stages[st.key as StageKey]} />)}
                </tr>
              ))}
              {cohorts.length === 0 && (
                <tr><td colSpan={1 + STAGES.length * 3} className="py-8 text-center text-gray-400">Немає даних за вибраний період</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {result.byCohort.length > COHORT_ROWS && (
          <button
            onClick={() => setShowAllCohorts(v => !v)}
            className="w-full py-2.5 text-xs font-semibold text-purple-700 hover:bg-purple-50 border-t border-gray-100 transition"
          >
            {showAllCohorts ? 'Згорнути' : `Показати всі місяці (${result.byCohort.length})`}
          </button>
        )}
      </div>

      {/* ── Як читати ───────────────────────────────────────────────────── */}
      <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 text-xs text-gray-600 leading-relaxed space-y-1.5">
        <p className="font-bold text-gray-700">Як рахується</p>
        <p>
          <strong>Лід → клієнт:</strong> від створення запису до моменту, коли він перестав бути лідом.{' '}
          <strong>Клієнт → угода:</strong> від конверсії до першої створеної угоди.{' '}
          <strong>Угода → оплата:</strong> від першої угоди до першої оплати клієнта (дата оплати — лише день, тож цей перехід у календарних днях).
        </p>
        <p>
          Джерело береться з картки клієнта. Показано медіану (половина клієнтів швидше, половина повільніше) і p75 — так довгий хвіст
          «купив через рік» не псує картину. «Дійшли» — частка стартувавших, хто завершив перехід; без неї швидкість нічого не варта.
        </p>
        {notes.length > 0 && (
          <ul className="list-disc pl-5 space-y-0.5 text-gray-500 pt-1">
            {notes.map(n => <li key={n}>{n}</li>)}
          </ul>
        )}
        {(meta.fetched.clients > 0) && (
          <p className="text-gray-400 pt-1">
            У вибірці {nf(meta.clients)} клієнтів{meta.orphanDeals + meta.orphanPayments > 0
              ? `; ${nf(meta.orphanDeals)} угод і ${nf(meta.orphanPayments)} оплат не прив'язані до клієнтів і не враховані`
              : ''}.
          </p>
        )}
      </div>
    </div>
  );
}

import React from 'react';
import {
  MonthlyReport, MonthSpend, MonthTotals, MovementKind, MOVEMENT_LABELS,
  AcquisitionStats, SourceStat, MonthCoverage, MonthProgress,
  monthLabel, monthLabelIn, dayLabel, delta, formatPct, summarizeMonth,
  judgeLtvToCac, LTV_TO_CAC_HINTS,
} from '../lib/monthlyReport';
import { pluralUk } from '../lib/plural';
import { Section, TH, TD, Kpi, uah, num } from './report/primitives';
import Donut, { sourceColor } from './report/Donut';

/**
 * Друкований місячний звіт.
 *
 * Один місяць, завжди однакова структура: підсумок словами, показники проти
 * попереднього місяця, рух клієнтів, динаміка року, гроші, найбільші клієнти.
 * Саме незмінність структури тут і цінна — місячні звіти читають підряд, і
 * документ, у якому щоразу інший набір розділів, порівнювати неможливо.
 *
 * Малюється лише в момент друку (див. MonthlyReportView), тож на швидкодію
 * екрана не впливає.
 */

/** Скільки клієнтів показуємо в таблицях документа */
const TOP_ROWS = 25;
const LOST_ROWS = 25;

/** Частка, 0–100 %; нульове ціле не ділимо */
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Підпис зміни до попереднього місяця: «+12.3 % · було 2 800 ₴» */
function changeNote(current: number, base: number, formatter: (n: number) => string): string {
  return `${formatPct(delta(current, base).pct)} · було ${formatter(base)}`;
}

const MOVEMENT_HINTS: Record<MovementKind, string> = {
  new:         'перша покупка саме цього місяця',
  kept:        'купували і минулого місяця, і цього',
  reactivated: 'купували колись, минулого місяця — ні, цього повернулись',
  lost:        'купували минулого місяця, цього — ні',
};

export interface MonthlyReportDocProps {
  report: MonthlyReport;
  /** Витрати місяця; null — витрат немає або немає доступу, розділ «Гроші» пропускаємо */
  spend: MonthSpend | null;
  /** Залучення з CRM: MQA, конверсія, джерела; null — дані не приїхали */
  acquisition: AcquisitionStats | null;
  /** Покриття місяця добовими знімками CRM; null — дані не приїхали */
  coverage: MonthCoverage | null;
  /** Джерела, вже згорнуті до шести — ті самі, що на екрані */
  sources: SourceStat[];
  /** Де саме місяць: закінчився чи триває, і станом на яке число */
  progress: MonthProgress | null;
  /** Чи використовується CRM-фолбек для карток (замінює порожні LTV дані) */
  crmFallback?: boolean;
}

export default function MonthlyReportDoc({
  report: r, spend, acquisition, sources, coverage, progress, crmFallback,
}: MonthlyReportDocProps) {
  const generatedAt = new Date().toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const t = r.totals;
  const p = r.prevTotals;
  const title = monthLabel(r.month);
  const prevIn = monthLabelIn(r.prevMonth);

  /** Найбільший дохід у тренді — база для смужок */
  const trendMax = Math.max(1, ...r.trend.map(x => x.revenue));

  const movementRows: MovementKind[] = ['new', 'kept', 'reactivated', 'lost'];

  return (
    <div className="print-landscape bg-white text-gray-900 p-6" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>

      {/* ── Титул ─────────────────────────────────────────────────────────── */}
      <header className="border-b-4 border-purple-600 pb-3">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-[22px] font-black leading-tight">
              Місячний звіт · {title}
              {progress?.partial && (
                <span className="text-[13px] text-gray-500 font-bold"> · станом на {dayLabel(progress.asOf)}</span>
              )}
            </h1>
            <p className="text-[10px] text-gray-600 mt-0.5">
              PAWELL · сформовано {generatedAt}
            </p>
          </div>
          <div className="text-right text-[10px] text-gray-700">
            <p><span className="text-gray-500">Порівняння:</span> <strong>{monthLabel(r.prevMonth)}</strong></p>
            <p>
              <span className="text-gray-500">Активних клієнтів:</span>{' '}
              <strong>{num(t.clients)}</strong> з {num(r.totalClients)} у базі
            </p>
          </div>
        </div>

        {/*
          Звіт рахується по всій базі. Це не дрібниця: решта аналітики живе під
          фільтрами, і читач, який бачив там зріз, інакше вирішить, що й тут зріз.
        */}
        <p className="text-[9px] text-gray-600 mt-2 leading-snug">
          Усі числа — по всій базі клієнтів за {title.toLowerCase()}; фільтри й пошук
          розширеної аналітики на цей звіт не впливають.
          {' '}Дохід і угоди беруться з помісячних сум знімка LTV.
        </p>

        {/*
          Місяць, що триває, підписаний датою, а не попередженням «не закінчився»:
          такий звіт роблять свідомо — 28-го, щоб побачити, з чим закриваються.
          Сказати треба інше: станом на яке число числа, і що з чим порівняне.
        */}
        {progress?.partial && (
          <p className="text-[9px] text-amber-700 mt-1 font-semibold">
            ⚠ Місяць ще триває: числа станом на {dayLabel(progress.asOf)} — минуло{' '}
            {num(progress.daysElapsed)} із {num(progress.daysInMonth)} днів. Дохід, угоди й
            утримання зіставлені з повним {monthLabel(r.prevMonth).toLowerCase()}, тож ці зміни
            занижені; MQA, конверсія й джерела — з рівним відрізком попереднього місяця.
          </p>
        )}
        {!r.hasMonthlyStats && (
          <p className="text-[9px] text-red-700 mt-1 font-semibold">
            ⚠ У знімку немає сум по місяцях — звіт порожній. Перезапустіть синхронізацію LTV.
          </p>
        )}
        {/*
          Неповне покриття мусить стояти на першій сторінці, поруч із періодом:
          документ ходить окремо від екрана, і читач інакше не дізнається, що в
          сумах з CRM бракує днів.
        */}
        {coverage && !coverage.complete && (
          <p className="text-[9px] text-red-700 mt-1 font-semibold">
            ⚠ У базі лише {num(coverage.presentDays)} із {num(coverage.expectedDays)} добових знімків
            CRM за цей місяць ({coverage.percent} %) — MQA, конверсія й суми по джерелах занижені:
            дні без знімка не потрапляють у підсумок. Показники з помісячних сум LTV
            (дохід, угоди, клієнти, утримання) від цього не залежать.
          </p>
        )}
        {crmFallback && (
          <p className="text-[9px] text-amber-700 mt-1 font-semibold">
            ⚠ Дохід, угоди й клієнти у показниках — з добових зрізів CRM, а не зі знімка LTV:
            помісячні суми LTV за {monthLabel(r.month).toLowerCase()} ще не перераховувались.
            Рух клієнтів, утримання, нові/постійні й топ — потребують LTV і поки порожні.
          </p>
        )}
      </header>

      {/* ── Підсумок ──────────────────────────────────────────────────────── */}
      <Section title="Коротко про місяць">
        <ul className="list-disc pl-4 space-y-0.5">
          {summarizeMonth(r, { acquisition, spend }).map((line, i) => (
            <li key={i} className="text-[10px] text-gray-800 leading-snug">{line}</li>
          ))}
        </ul>
      </Section>

      {/* ── Показники ─────────────────────────────────────────────────────── */}
      <Section
        title="Ключові показники"
        hint={<>Зміна — до {prevIn}. {r.hasYearAgo
          ? <>Рік тому, у {monthLabelIn(r.yearAgoMonth)}, дохід був {uah(r.yearAgoTotals.revenue)}.</>
          : <>Даних за {monthLabelIn(r.yearAgoMonth)} немає, тож сезонність порівняти нема з чим.</>}</>}
      >
        <div className={`grid ${r.hasPaid ? 'grid-cols-6' : 'grid-cols-5'} gap-2`}>
          <Kpi label="Законтрактовано" value={uah(t.revenue)} note={changeNote(t.revenue, p.revenue, uah)} />
          {r.hasPaid && <Kpi label="Оплачено" value={uah(t.paid)} note={changeNote(t.paid, p.paid, uah)} />}
          <Kpi label="Угод" value={num(t.deals)} note={changeNote(t.deals, p.deals, num)} />
          <Kpi label="Активних клієнтів" value={num(t.clients)} note={changeNote(t.clients, p.clients, num)} />
          <Kpi label="Середній чек" value={uah(t.avgCheck)} note={changeNote(t.avgCheck, p.avgCheck, uah)} />
          <Kpi label="Дохід на клієнта" value={uah(t.arpu)} note={changeNote(t.arpu, p.arpu, uah)} />
        </div>
      </Section>

      {/* ── Залучення і утримання ─────────────────────────────────────────── */}
      <Section
        title="Залучення і утримання"
        hint={<>MQA — залучені цього місяця записи, які вже стали клієнтами (когорта місяця з CRM);
          конверсія — їхня частка від усіх залучених. Утримання рахується від клієнтів, активних
          у {prevIn}: утримати можна лише того, хто вже був.
          {acquisition && !acquisition.mature &&
            ' Когорта місяця ще дозріває, тож MQA й конверсія занижені.'}</>}
      >
        <div className="grid grid-cols-5 gap-2">
          <Kpi
            label="MQA · клієнти за місяць"
            value={acquisition ? num(acquisition.mqa) : '—'}
            note={acquisition
              ? `із ${num(acquisition.acquired)} залучених · ${formatPct(acquisition.mqaChange)} до ${prevIn}`
              : 'дані CRM недоступні'}
          />
          <Kpi
            label="Конверсія в клієнта"
            value={acquisition?.conversion != null ? `${acquisition.conversion} %` : '—'}
            note={acquisition?.prevConversion != null
              ? `було ${acquisition.prevConversion} % · ${formatPct(acquisition.conversionChange)}`
              : 'порівнювати нема з чим'}
          />
          <Kpi
            label="LTV / CAC"
            value={spend?.ltvToCac != null ? `${spend.ltvToCac}` : '—'}
            note={spend?.ltvToCac != null
              ? LTV_TO_CAC_HINTS[judgeLtvToCac(spend.ltvToCac)!]
              : 'потрібні витрати місяця й LTV'}
          />
          <Kpi
            label="Утримання клієнтів"
            value={r.retention.rate !== null ? `${r.retention.rate} %` : '—'}
            note={r.retention.rate !== null
              ? `${num(r.retention.kept)} з ${num(r.retention.base)}; відтік ${r.retention.churn} %`
              : `у ${prevIn} активних не було`}
          />
          <Kpi
            label="Утримання доходу"
            value={r.retention.revenueRetention !== null ? `${r.retention.revenueRetention} %` : '—'}
            note={`від доходу ${prevIn}; дохід від постійних — ${r.retention.repeatRevenueShare} %`}
          />
        </div>
      </Section>

      {/* ── Нові та постійні ──────────────────────────────────────────────── */}
      <Section
        title="Нові та постійні"
        hint="Новий — той, у кого перша покупка сталась саме цього місяця. Постійний купував і раніше."
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <TH>Тип клієнта</TH>
              <TH align="right">Клієнтів</TH>
              <TH align="right">Було в {monthLabel(r.prevMonth)}</TH>
              <TH align="right">Угод</TH>
              <TH align="right">Дохід</TH>
              <TH align="right">Частка доходу</TH>
              <TH align="right">Середній чек</TH>
            </tr>
          </thead>
          <tbody>
            {([
              { label: 'Нові', clients: t.newClients, prevClients: p.newClients, deals: t.newDeals, revenue: t.newRevenue },
              { label: 'Постійні', clients: t.returningClients, prevClients: p.returningClients, deals: t.returningDeals, revenue: t.returningRevenue },
            ]).map(row => (
              <tr key={row.label}>
                <TD bold>{row.label}</TD>
                <TD align="right">{num(row.clients)}</TD>
                <TD align="right">{num(row.prevClients)}</TD>
                <TD align="right">{num(row.deals)}</TD>
                <TD align="right">{uah(row.revenue)}</TD>
                <TD align="right" bold>{share(row.revenue, t.revenue)} %</TD>
                <TD align="right">{row.deals > 0 ? uah(row.revenue / row.deals) : '—'}</TD>
              </tr>
            ))}
            <tr className="bg-gray-50">
              <TD bold>Разом</TD>
              <TD align="right" bold>{num(t.clients)}</TD>
              <TD align="right">{num(p.clients)}</TD>
              <TD align="right" bold>{num(t.deals)}</TD>
              <TD align="right" bold>{uah(t.revenue)}</TD>
              <TD align="right">—</TD>
              <TD align="right">{uah(t.avgCheck)}</TD>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* ── Рух клієнтів ──────────────────────────────────────────────────── */}
      <Section
        title="Рух клієнтів"
        hint={<>Чотири групи, а не «стало більше чи менше»: зростання на нових і зростання
          на поверненнях означають різне. Для тих, хто перестав купувати, показано, скільки
          вони давали в {prevIn}.</>}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <TH>Група</TH>
              <TH>Що це означає</TH>
              <TH align="right">Клієнтів</TH>
              <TH align="right">Угод</TH>
              <TH align="right">Дохід</TH>
              <TH align="right">Частка доходу місяця</TH>
            </tr>
          </thead>
          <tbody>
            {movementRows.map(kind => {
              const g = r.movements[kind];
              return (
                <tr key={kind} className={kind === 'lost' ? 'bg-red-50' : undefined}>
                  <TD bold>{MOVEMENT_LABELS[kind]}</TD>
                  <TD>{MOVEMENT_HINTS[kind]}</TD>
                  <TD align="right">{num(g.clients.length)}</TD>
                  <TD align="right">{num(g.deals)}</TD>
                  <TD align="right">{uah(g.revenue)}</TD>
                  <TD align="right">{kind === 'lost' ? '—' : `${share(g.revenue, t.revenue)} %`}</TD>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* ── Динаміка ──────────────────────────────────────────────────────── */}
      <Section
        title={`Динаміка за ${r.trend.length} ${pluralUk(r.trend.length, 'місяць', 'місяці', 'місяців')}`}
        breakBefore
        hint="Ряд закінчується звітним місяцем. Смужка — дохід відносно найкращого місяця ряду."
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <TH>Місяць</TH>
              <TH align="right">Законтрактовано</TH>
              {r.hasPaid && <TH align="right">Оплачено</TH>}
              <TH align="right">Угод</TH>
              <TH align="right">Клієнтів</TH>
              <TH align="right">Нових</TH>
              <TH align="right">Середній чек</TH>
              <TH>Дохід відносно найкращого місяця</TH>
            </tr>
          </thead>
          <tbody>
            {[...r.trend].reverse().map((m: MonthTotals) => (
              <tr key={m.month} className={m.month === r.month ? 'bg-purple-50' : undefined}>
                <TD bold={m.month === r.month}>{monthLabel(m.month)}</TD>
                <TD align="right" bold={m.month === r.month}>{uah(m.revenue)}</TD>
                {r.hasPaid && <TD align="right">{uah(m.paid)}</TD>}
                <TD align="right">{num(m.deals)}</TD>
                <TD align="right">{num(m.clients)}</TD>
                <TD align="right">{num(m.newClients)}</TD>
                <TD align="right">{m.deals > 0 ? uah(m.avgCheck) : '—'}</TD>
                <td className="border border-gray-300 px-1.5 py-[3px]">
                  <div
                    className="h-2 bg-purple-500 rounded-sm"
                    style={{ width: `${Math.round((m.revenue / trendMax) * 100)}%` }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ── Джерела ────────────────────────────────────────────────────────── */}
      {acquisition && (
        <Section
          title="Яке джерело скільки принесло"
          hint={<>Сума угод місяця по джерелах з CRM. У кільці п'ять найбільших джерел,
            решта — «Інші»; повний перелік у таблиці.</>}
        >
          {sources.length === 0 ? (
            <p className="text-[10px] text-gray-500 italic">
              За {monthLabelIn(r.month)} CRM не повернула угод по джерелах.
            </p>
          ) : (
            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 flex flex-col items-center gap-1">
                <Donut
                  slices={sources.map((c, i) => ({
                    label: c.source,
                    value: c.revenue,
                    color: sourceColor(i, c.source),
                  }))}
                  centerValue={uah(acquisition.sourcesRevenue)}
                  centerLabel="сума угод"
                  size={150}
                  thickness={20}
                />
                {/* Легенда під кільцем: у документі підказок немає, тож колір без
                    підпису лишився б загадкою */}
                <div className="flex flex-col gap-0.5">
                  {sources.map((c, i) => (
                    <span key={c.source} className="flex items-center gap-1 text-[7.5px] text-gray-700 whitespace-nowrap">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-sm"
                        style={{ backgroundColor: sourceColor(i, c.source) }}
                      />
                      {c.source} · {c.revenueShare} %
                    </span>
                  ))}
                </div>
              </div>

              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <TH>Джерело</TH>
                    <TH align="right">Сума угод</TH>
                    <TH align="right">Частка</TH>
                    <TH align="right">Угод</TH>
                    <TH align="right">Клієнтів (MQA)</TH>
                    <TH align="right">Залучено</TH>
                    <TH align="right">Конверсія</TH>
                    {spend && <TH align="right">CAC</TH>}
                  </tr>
                </thead>
                <tbody>
                  {acquisition.sources.map(c => {
                    const sourceCac = spend?.bySource?.matched.find(
                      m => m.source.toLowerCase() === c.source.toLowerCase(),
                    );
                    return (
                      <tr key={c.source}>
                        <TD bold>{c.source}</TD>
                        <TD align="right" bold>{uah(c.revenue)}</TD>
                        <TD align="right">{c.revenueShare} %</TD>
                        <TD align="right">{num(c.deals)}</TD>
                        <TD align="right">{num(c.clients)}</TD>
                        <TD align="right">{num(c.acquired)}</TD>
                        <TD align="right">{c.conversion !== null ? `${c.conversion} %` : '—'}</TD>
                        {spend && <TD align="right">{sourceCac?.cac != null ? uah(sourceCac.cac) : '—'}</TD>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* ── Гроші ─────────────────────────────────────────────────────────── */}
      {spend && (
        <Section
          title="Гроші: витрати й вартість клієнта"
          hint={<>Витрати беруться з розділу «Витрати» за дати цього місяця й зводяться до
            гривні. У знаменнику CAC — {acquisition
              ? <>клієнти когорти місяця з CRM: {num(acquisition.mqa)}</>
              : <>нові клієнти з помісячних сум: {num(t.newClients)}</>}.
            {spend.hasForeign && ' Частина витрат не в гривні — сума залежить від курсу в налаштуваннях.'}</>}
        >
          {spend.count === 0 ? (
            <p className="text-[10px] text-gray-500 italic">
              За {monthLabelIn(r.month)} витрат не внесено — вартість клієнта порахувати неможливо.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-6 gap-2 mb-3">
                <Kpi label="Витрати за місяць" value={uah(spend.total)} note={changeNote(spend.total, spend.prevTotal, uah)} />
                <Kpi label="З них реклама" value={uah(spend.ads)} note={changeNote(spend.ads, spend.prevAds, uah)} />
                <Kpi
                  label="CAC за рекламою"
                  value={spend.cac !== null ? uah(spend.cac) : '—'}
                  note={spend.prevCac !== null
                    ? `${formatPct(spend.cacChange)} · було ${uah(spend.prevCac)}`
                    : 'порівнювати з попереднім місяцем нема з чим'}
                />
                <Kpi
                  label="CAC за всіма витратами"
                  value={spend.blendedCac !== null ? uah(spend.blendedCac) : '—'}
                  note="усі витрати відділу ÷ залучені клієнти"
                />
                <Kpi
                  label="LTV / CAC"
                  value={spend.ltvToCac != null ? `${spend.ltvToCac}` : '—'}
                  note={spend.ltvToCac != null && spend.ltvBasis
                    ? `${spend.ltvBasis} ${uah(spend.ltv ?? 0)} ÷ CAC ${uah(spend.cac ?? 0)}`
                    : 'потрібні рекламний бюджет і LTV'}
                />
                <Kpi
                  label="Дохід на 1 ₴ витрат"
                  value={spend.revenuePerSpend !== null ? `${spend.revenuePerSpend}` : '—'}
                  note={<>
                    {spend.adShare !== null && <>ДРВ — {spend.adShare} %. </>}
                    {spend.cpl !== null && <>CPL — {uah(spend.cpl)}</>}
                  </>}
                />
              </div>

              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <TH>Категорія витрат</TH>
                    <TH align="right">Сума</TH>
                    <TH align="right">Частка витрат</TH>
                    <TH align="right">Частка доходу місяця</TH>
                  </tr>
                </thead>
                <tbody>
                  {spend.byCategory.map(c => (
                    <tr key={c.category}>
                      <TD bold>{c.category}</TD>
                      <TD align="right">{uah(c.amount)}</TD>
                      <TD align="right">{share(c.amount, spend.total)} %</TD>
                      <TD align="right">{t.revenue > 0 ? `${share(c.amount, t.revenue)} %` : '—'}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Section>
      )}

      {/* ── Найбільші клієнти ─────────────────────────────────────────────── */}
      <Section
        title={`Найбільші клієнти місяця${t.clients > TOP_ROWS ? ` — перші ${TOP_ROWS} з ${num(t.clients)}` : ''}`}
        breakBefore
        hint={<>Зміна — різниця з {prevIn}. «Нові» означає першу покупку цього місяця,
          «Повернулись» — паузу в {prevIn}.
          {t.clients > TOP_ROWS && ' Повний список клієнтів місяця вивантажується в CSV з екрана звіту.'}</>}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <TH align="right">#</TH>
              <TH>Клієнт</TH>
              <TH>Група</TH>
              <TH align="right">Дохід</TH>
              <TH align="right">Угод</TH>
              <TH align="right">Середній чек</TH>
              <TH align="right">Було в {monthLabel(r.prevMonth)}</TH>
              <TH align="right">Зміна</TH>
              <TH align="right">Частка місяця</TH>
              <TH>Перша покупка</TH>
            </tr>
          </thead>
          <tbody>
            {r.top.slice(0, TOP_ROWS).map((c, i) => (
              <tr key={c.id} style={{ breakInside: 'avoid' }}>
                <TD align="right">{i + 1}</TD>
                <TD bold>{c.name}</TD>
                <TD>{MOVEMENT_LABELS[c.kind]}</TD>
                <TD align="right" bold>{uah(c.revenue)}</TD>
                <TD align="right">{num(c.deals)}</TD>
                <TD align="right">{c.deals > 0 ? uah(c.revenue / c.deals) : '—'}</TD>
                <TD align="right">{c.prevRevenue > 0 ? uah(c.prevRevenue) : '—'}</TD>
                <TD align="right">{c.prevRevenue > 0 ? `${c.delta >= 0 ? '+' : '−'}${uah(Math.abs(c.delta))}` : '—'}</TD>
                <TD align="right">{share(c.revenue, t.revenue)} %</TD>
                <TD>{c.first ? monthLabel(c.first) : '—'}</TD>
              </tr>
            ))}
            {r.top.length === 0 && (
              <tr><TD>За {monthLabelIn(r.month)} угод не було</TD></tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* ── Втрачені ──────────────────────────────────────────────────────── */}
      <Section
        title={`Перестали купувати${r.movements.lost.clients.length > LOST_ROWS ? ` — перші ${LOST_ROWS} за сумою` : ''}`}
        hint={<>Клієнти, які купували в {prevIn}, а цього місяця — ні. Це не відтік назавжди,
          а список на дзвінок: разом вони давали {uah(r.movements.lost.revenue)}.</>}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <TH align="right">#</TH>
              <TH>Клієнт</TH>
              <TH align="right">Давав у {monthLabel(r.prevMonth)}</TH>
              <TH align="right">Угод було</TH>
              <TH>Перша покупка</TH>
            </tr>
          </thead>
          <tbody>
            {r.movements.lost.clients.slice(0, LOST_ROWS).map((c, i) => (
              <tr key={c.id} style={{ breakInside: 'avoid' }}>
                <TD align="right">{i + 1}</TD>
                <TD bold>{c.name}</TD>
                <TD align="right">{uah(c.prevRevenue)}</TD>
                <TD align="right">{num(c.prevDeals)}</TD>
                <TD>{c.first ? monthLabel(c.first) : '—'}</TD>
              </tr>
            ))}
            {r.movements.lost.clients.length === 0 && (
              <tr><TD>Жоден клієнт минулого місяця не зник — усі купували й цього</TD><TD>—</TD><TD>—</TD><TD>—</TD><TD>—</TD></tr>
            )}
          </tbody>
        </table>
      </Section>

      <footer className="mt-6 pt-2 border-t border-gray-300 text-[8px] text-gray-500">
        PAWELL · Місячний звіт · {title}{progress?.partial ? ` · станом на ${dayLabel(progress.asOf)}` : ''} · сформовано {generatedAt}
      </footer>
    </div>
  );
}

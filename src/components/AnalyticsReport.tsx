import React from 'react';
import {
  TieredClient, RevenueDistribution, TierBreakdown, TIERS,
  CustomerMix, CustomerKind, CUSTOMER_KIND_LABELS,
  RfmThresholds, RFM_RULES, RFM_LABELS, CohortRetention, MonthRange,
} from '../lib/clientAnalytics';
import { LtvSnapshot } from '../lib/ltvSnapshot';
import { LTV_HORIZONS } from '../lib/cohortLtv';
import { PeriodValue, describePeriod } from './PeriodPicker';

/**
 * Друкований звіт по поточній вибірці.
 *
 * Це не знімок екрана, а окремий документ. Різниця принципова: на екрані числа
 * пояснює контекст — увімкнені фільтри видно чіпами, період видно в шапці,
 * решту можна доклацати. У PDF нічого доклацати не можна, і читає його зазвичай
 * той, хто вибірку не складав. Тому звіт починається з того, ЩО саме показано,
 * і збирає всі три вкладки в один документ — окремо надрукований «шматок
 * воронки» без періоду й фільтрів однаково правдивий і однаково марний.
 *
 * Малюється лише в момент друку (див. AnalyticsView), тож на швидкодію
 * інтерфейсу не впливає.
 */

/**
 * Скільки рядків клієнтів іде в документ.
 *
 * Повний список — це CSV. Сотні сторінок таблиці в PDF ніхто не читає, а
 * зібрати їх коштує і часу, і пам'яті. Хвіст вибірки в документі підсумований
 * одним рядком, щоб сума в таблиці сходилась із сумою у зведенні.
 */
const CLIENT_ROWS = 100;

/** Скільки місяців матриць влазить у сторінку, лишаючись читабельним */
const MATRIX_MONTHS = 18;

const uah = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} ₴`;
const num = (n: number) => n.toLocaleString('uk-UA');

/** Заголовок розділу разом із блоком, який він називає: розривати їх не можна */
function Section({
  title, hint, children, breakBefore = false,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  breakBefore?: boolean;
}) {
  return (
    <section
      className="mt-6"
      style={{ breakInside: 'avoid', breakBefore: breakBefore ? 'page' : 'auto' }}
    >
      <h2 className="text-[13px] font-black text-gray-900 border-b-2 border-gray-900 pb-1 mb-2">
        {title}
      </h2>
      {hint && <p className="text-[9px] text-gray-500 mb-2 leading-snug">{hint}</p>}
      {children}
    </section>
  );
}

type Align = 'left' | 'right' | 'center';

/** Класи пишемо повними: Tailwind збирає стилі зі статичного тексту, і
    `text-${align}` не потрапив би у збірку взагалі */
const ALIGN: Record<Align, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

/** `key` в типі навмисно: без нього ці помічники не можна поставити в .map(),
    а React усе одно забирає його собі й у компонент не передає */
const TH = ({ children, align = 'left' }: { children: React.ReactNode; align?: Align; key?: React.Key }) => (
  <th className={`border border-gray-300 bg-gray-100 px-1.5 py-1 text-[8px] font-bold uppercase tracking-wide text-gray-700 ${ALIGN[align]}`}>
    {children}
  </th>
);

const TD = ({ children, align = 'left', bold = false }: { children: React.ReactNode; align?: Align; bold?: boolean }) => (
  <td className={`border border-gray-300 px-1.5 py-[3px] text-[9px] text-gray-800 ${ALIGN[align]} ${bold ? 'font-bold' : ''}`}>
    {children}
  </td>
);

/** Показник у шапці звіту — число і те, що воно означає */
function Kpi({ label, value, note }: { label: string; value: string; note?: string; key?: React.Key }) {
  return (
    <div className="border border-gray-300 rounded px-2 py-1.5">
      <p className="text-[7.5px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-[15px] font-black text-gray-900 leading-tight">{value}</p>
      {note && <p className="text-[7.5px] text-gray-500 leading-tight">{note}</p>}
    </div>
  );
}

export interface AnalyticsReportProps {
  /** Вибірка після фільтрів і фокусів — у порядку, заданому сортуванням таблиці */
  clients: TieredClient[];
  distribution: RevenueDistribution;
  tiered: TierBreakdown;
  customerMix: CustomerMix;
  period: PeriodValue;
  monthRange: MonthRange | null;
  /** Скільки фільтрів увімкнено — щоб читач звіту знав, що бачить зріз */
  activeFilterCount: number;
  /** Підписи увімкнених фокусів (тір, тип клієнта) */
  filterChips: string[];
  thresholds: RfmThresholds;
  rfmCounts: Record<string, number>;
  /** Скільки клієнтів у базі всього — база для «з N» */
  totalClients: number;
  cohorts: Record<string, CohortRetention>;
  snapshot: LtvSnapshot;
  /** Етапи, позначені як фінальні — від них рахується цикл угоди */
  closedStages: string[];
}

export default function AnalyticsReport({
  clients, distribution, tiered, customerMix, period, monthRange,
  activeFilterCount, filterChips, thresholds, rfmCounts, totalClients,
  cohorts, snapshot, closedStages,
}: AnalyticsReportProps) {
  const generatedAt = new Date().toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const periodLabel = monthRange ? describePeriod(period) : 'за весь час';

  // ── Воронка ────────────────────────────────────────────────────────────────
  const allStages = snapshot.stageStats ?? [];
  const wonStages = allStages.filter(s => closedStages.includes(s.stage));
  const openStages = allStages
    .filter(s => !closedStages.includes(s.stage))
    .sort((a, b) => b.avgOpenDays - a.avgOpenDays);
  const wonCount = wonStages.reduce((s, x) => s + x.count, 0);
  const avgSalesCycle = wonCount > 0
    ? Math.round(wonStages.reduce((s, x) => s + x.avgCycleDays * x.count, 0) / wonCount)
    : 0;
  const openCount = openStages.reduce((s, x) => s + x.count, 0);

  // ── Утримання ──────────────────────────────────────────────────────────────
  const cohortKeys = Object.keys(cohorts).sort().reverse();
  const retentionOffsets = Math.min(
    MATRIX_MONTHS,
    Math.max(0, ...Object.values(cohorts).flatMap(c => Object.keys(c.retention).map(Number))),
  );

  // ── Когортний LTV ──────────────────────────────────────────────────────────
  const ltvRows = [...(snapshot.cohortLtv?.rows ?? [])].sort((a, b) => b.month.localeCompare(a.month));
  const ltvOffsets = Math.min(MATRIX_MONTHS, Math.max(0, ...ltvRows.map(r => r.maxOffset)));

  // ── Клієнти ────────────────────────────────────────────────────────────────
  const shown = clients.slice(0, CLIENT_ROWS);
  const rest = clients.slice(CLIENT_ROWS);
  const restRevenue = rest.reduce((s, c) => s + c.periodRevenue, 0);
  const restDeals = rest.reduce((s, c) => s + c.periodDeals, 0);

  const mixRows: CustomerKind[] = ['new', 'returning', 'unknown'];

  return (
    <div className="print-landscape bg-white text-gray-900 p-6" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>

      {/* ── Титул ─────────────────────────────────────────────────────────── */}
      <header className="border-b-4 border-purple-600 pb-3">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-[22px] font-black leading-tight">Аналітика клієнтів</h1>
            <p className="text-[10px] text-gray-600 mt-0.5">
              PAWELL · звіт сформовано {generatedAt}
            </p>
          </div>
          <div className="text-right text-[10px] text-gray-700">
            <p><span className="text-gray-500">Період:</span> <strong>{periodLabel}</strong></p>
            <p>
              <span className="text-gray-500">У вибірці:</span>{' '}
              <strong>{num(clients.length)}</strong> з {num(totalClients)} клієнтів
            </p>
          </div>
        </div>

        {/*
          Що саме відрізано від бази. Без цього рядка звіт із трьох клієнтів
          виглядає як звіт про всю компанію — і його так і прочитають.
        */}
        <p className="text-[9px] text-gray-600 mt-2 leading-snug">
          {activeFilterCount === 0 && filterChips.length === 0
            ? 'Фільтри не застосовані — показано всю базу клієнтів за вибраний період.'
            : <>
                Застосовано фільтрів: <strong>{activeFilterCount}</strong>
                {filterChips.length > 0 && <> · звужено до: <strong>{filterChips.join(', ')}</strong></>}
                {' '}— числа нижче стосуються лише цього зрізу.
              </>}
          {monthRange && (
            <> Дохід, угоди й середній чек — за {periodLabel}; дохід за весь час показано окремою колонкою.</>
          )}
        </p>

        {snapshot.lastSyncError && (
          <p className="text-[9px] text-red-700 mt-1 font-semibold">
            ⚠ Остання синхронізація впала: {snapshot.lastSyncError}. Дані в звіті застарілі.
          </p>
        )}
        {snapshot.scopedTo && (
          <p className="text-[9px] text-amber-700 mt-1 font-semibold">
            ⚠ Синхронізовано лише за {describePeriod({ key: 'custom', ...snapshot.scopedTo })} —
            когортний LTV занижений.
          </p>
        )}
      </header>

      {/* ── Ключові показники ─────────────────────────────────────────────── */}
      <Section title="Ключові показники вибірки">
        <div className="grid grid-cols-5 gap-2">
          <Kpi label="Дохід на клієнта (ARPU)" value={uah(distribution.mean)} note={`медіана ${uah(distribution.median)}`} />
          <Kpi label="Загальний дохід" value={uah(distribution.total)} note={`${num(distribution.count)} клієнтів`} />
          <Kpi label="Топ-10 % дають" value={`${distribution.top10Share} %`} note={`${num(distribution.top10Count)} клієнтів, від ${uah(distribution.top10Threshold)}`} />
          <Kpi label="90-й процентиль" value={uah(distribution.p90)} note="вище — лише десята частина" />
          <Kpi
            label="LTV · 12 міс."
            value={snapshot.cohortLtv?.horizons?.[12] ? uah(snapshot.cohortLtv.horizons[12]!.ltv) : '—'}
            note={snapshot.cohortLtv?.horizons?.[12]
              ? `${snapshot.cohortLtv.horizons[12]!.cohorts} зрілих когорт`
              : 'немає когорт такого віку'}
          />
        </div>
        {/*
          Медіана поруч із середнім не для краси: якщо вони розходяться в рази,
          «середній клієнт» зі звіту не існує в природі, і планувати за ним не можна.
        */}
        {distribution.count > 0 && distribution.median > 0 && distribution.mean / distribution.median >= 2 && (
          <p className="text-[9px] text-amber-800 mt-2 leading-snug">
            Середнє вище за медіану у {(distribution.mean / distribution.median).toFixed(1)} раза —
            дохід сильно перекошений у бік найбільших клієнтів. Планувати за ARPU в такій вибірці не варто.
          </p>
        )}
      </Section>

      {/* ── Нові та постійні ──────────────────────────────────────────────── */}
      <Section
        title="Хто приносить замовлення"
        hint={customerMix.basis === 'period'
          ? 'Новий — той, чия перша покупка сталась усередині періоду. Постійний купував і до нього.'
          : 'Періоду не задано, тож новим вважається клієнт з єдиною покупкою за весь час.'}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <TH>Тип клієнта</TH>
              <TH align="right">Клієнтів</TH>
              <TH align="right">Частка клієнтів</TH>
              <TH align="right">Замовлень</TH>
              <TH align="right">Частка замовлень</TH>
              <TH align="right">Дохід</TH>
              <TH align="right">Частка доходу</TH>
              <TH align="right">Середній чек</TH>
            </tr>
          </thead>
          <tbody>
            {mixRows.map(kind => {
              const b = customerMix[kind];
              if (b.clients === 0) return null;
              return (
                <tr key={kind}>
                  <TD bold>{CUSTOMER_KIND_LABELS[kind]}</TD>
                  <TD align="right">{num(b.clients)}</TD>
                  <TD align="right">{b.clientsShare} %</TD>
                  <TD align="right">{num(b.deals)}</TD>
                  <TD align="right">{b.dealsShare} %</TD>
                  <TD align="right">{uah(b.revenue)}</TD>
                  <TD align="right">{b.revenueShare} %</TD>
                  <TD align="right">{uah(b.avgCheck)}</TD>
                </tr>
              );
            })}
            <tr className="bg-gray-50">
              <TD bold>Разом</TD>
              <TD align="right" bold>{num(customerMix.totalClients)}</TD>
              <TD align="right">—</TD>
              <TD align="right" bold>{num(customerMix.totalDeals)}</TD>
              <TD align="right">—</TD>
              <TD align="right" bold>{uah(customerMix.totalRevenue)}</TD>
              <TD align="right">—</TD>
              <TD align="right">—</TD>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* ── Тіри ──────────────────────────────────────────────────────────── */}
      <Section
        title="Тіри клієнтів"
        hint="Поділ за часткою кількості платників: Tier 1 — топ-10 % за доходом, далі 20 %, 30 % і решта. Клієнти без доходу в періоді в тіри не входять."
      >
        {tiered.stats.length === 0 ? (
          <p className="text-[10px] text-gray-500 italic">У вибірці немає клієнтів з доходом більшим за нуль.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <TH>Тір</TH>
                <TH>Що це</TH>
                <TH align="right">Клієнтів</TH>
                <TH align="right">Дохід</TH>
                <TH align="right">Частка доходу</TH>
                <TH align="right">Поріг входу</TH>
                <TH align="right">Найбільший</TH>
                <TH align="right">Середній</TH>
              </tr>
            </thead>
            <tbody>
              {tiered.stats.map(s => {
                const meta = TIERS.find(t => t.id === s.tier)!;
                return (
                  <tr key={s.tier}>
                    <TD bold>{meta.label}</TD>
                    <TD>{meta.hint}</TD>
                    <TD align="right">{num(s.count)}</TD>
                    <TD align="right">{uah(s.revenue)}</TD>
                    <TD align="right" bold>{s.revenueShare} %</TD>
                    <TD align="right">{uah(s.minRevenue)}</TD>
                    <TD align="right">{uah(s.maxRevenue)}</TD>
                    <TD align="right">{uah(s.avgRevenue)}</TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tiered.zeroRevenueCount > 0 && (
          <p className="text-[9px] text-gray-500 mt-1">
            Поза тірами: {num(tiered.zeroRevenueCount)} клієнтів без доходу в періоді.
          </p>
        )}
      </Section>

      {/* ── Розподіл доходу ───────────────────────────────────────────────── */}
      <Section
        title="Розподіл доходу по клієнтах"
        hint="Верхня межа гістограми — 90-й процентиль: інакше один викид зібрав би всіх решту в один стовпець."
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <TH>Дохід клієнта</TH>
              <TH align="right">Клієнтів</TH>
              <TH align="right">Частка</TH>
              <TH>Розподіл</TH>
            </tr>
          </thead>
          <tbody>
            {distribution.buckets.map((b, i) => {
              const maxCount = Math.max(1, ...distribution.buckets.map(x => x.count));
              const pct = distribution.count > 0 ? Math.round((b.count / distribution.count) * 100) : 0;
              return (
                <tr key={i}>
                  <TD>{uah(b.from)} — {b.to === null ? 'і більше' : uah(b.to)}</TD>
                  <TD align="right">{num(b.count)}</TD>
                  <TD align="right">{pct} %</TD>
                  <td className="border border-gray-300 px-1.5 py-[3px]">
                    <div
                      className="h-2 bg-purple-500 rounded-sm"
                      style={{ width: `${Math.round((b.count / maxCount) * 100)}%` }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* ── Сегменти ──────────────────────────────────────────────────────── */}
      <Section
        title="Сегменти клієнтів (RFM)"
        hint="Розмір сегментів рахується по всій базі за період, без решти фільтрів: пороги налаштовуються під базу, а не під відкритий зріз."
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <TH>Сегмент</TH>
              <TH>Правило за поточними порогами</TH>
              <TH align="right">Клієнтів</TH>
            </tr>
          </thead>
          <tbody>
            {RFM_LABELS.map(label => {
              const rule = RFM_RULES.find(r => r.label === label);
              return (
                <tr key={label}>
                  <TD bold>{label}</TD>
                  <TD>{rule ? rule.describe(thresholds) : '—'}</TD>
                  <TD align="right">{num(rfmCounts[label] ?? 0)}</TD>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* ── Воронка ───────────────────────────────────────────────────────── */}
      <Section
        title="Швидкість воронки"
        breakBefore
        hint={<>Фінальними позначено етапи: <strong>{closedStages.join(', ') || 'жодного'}</strong> — саме від них рахується цикл угоди. Решта вважається відкритими.</>}
      >
        {allStages.length === 0 ? (
          <p className="text-[10px] text-gray-500 italic">Дані по етапах угод відсутні — запустіть синхронізацію.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Kpi label="Середній цикл угоди" value={`${avgSalesCycle} дн.`} note={`по ${num(wonCount)} закритих угодах`} />
              <Kpi label="Відкритих угод" value={num(openCount)} note={`на ${openStages.length} етапах`} />
              <Kpi
                label="Найдовше висить"
                value={openStages[0] ? `${openStages[0].avgOpenDays} дн.` : '—'}
                note={openStages[0]?.stage ?? 'відкритих етапів немає'}
              />
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <TH>Етап</TH>
                  <TH align="right">Угод зараз</TH>
                  <TH align="right">Висять у середньому</TH>
                  <TH>Наскільки це багато</TH>
                </tr>
              </thead>
              <tbody>
                {openStages.map(s => {
                  const worst = Math.max(1, ...openStages.map(x => x.avgOpenDays));
                  return (
                    <tr key={s.stage}>
                      <TD bold>{s.stage}</TD>
                      <TD align="right">{num(s.count)}</TD>
                      <TD align="right">{s.avgOpenDays} дн.</TD>
                      <td className="border border-gray-300 px-1.5 py-[3px]">
                        <div
                          className="h-2 bg-orange-400 rounded-sm"
                          style={{ width: `${Math.round((s.avgOpenDays / worst) * 100)}%` }}
                        />
                      </td>
                    </tr>
                  );
                })}
                {openStages.length === 0 && (
                  <tr><TD>Усі етапи позначені як фінальні — відкритих угод немає</TD><TD>—</TD><TD>—</TD><TD>—</TD></tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </Section>

      {/* ── Утримання ─────────────────────────────────────────────────────── */}
      <Section
        title="Утримання по когортах"
        breakBefore
        hint="Відсоток клієнтів когорти, які купували через N місяців після першої покупки. Рахується по поточній вибірці, тобто з урахуванням фільтрів."
      >
        {cohortKeys.length === 0 ? (
          <p className="text-[10px] text-gray-500 italic">Немає даних про дати покупок.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <TH>Когорта</TH>
                <TH align="right">Розмір</TH>
                {Array.from({ length: retentionOffsets + 1 }).map((_, i) => (
                  <TH key={i} align="center">M{i}</TH>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohortKeys.map(month => {
                const row = cohorts[month];
                return (
                  <tr key={month}>
                    <TD bold>{month}</TD>
                    <TD align="right">{num(row.size)}</TD>
                    {Array.from({ length: retentionOffsets + 1 }).map((_, i) => {
                      const count = row.retention[i] || 0;
                      const pct = row.size > 0 ? Math.round((count / row.size) * 100) : 0;
                      return (
                        <td
                          key={i}
                          className="border border-gray-300 px-1 py-[3px] text-[8px] text-center"
                          style={count > 0
                            ? { backgroundColor: `rgba(16, 185, 129, ${Math.max(0.08, pct / 100 * 0.8)})` }
                            : undefined}
                        >
                          {count > 0 ? `${pct}%` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* ── Когортний LTV ─────────────────────────────────────────────────── */}
      <Section
        title="Когортний LTV"
        hint="Накопичений середній дохід з одного клієнта через N місяців після першої покупки. Рахується по всій базі — фільтри вибірки на цю таблицю не впливають."
      >
        <div className="grid grid-cols-4 gap-2 mb-3">
          {LTV_HORIZONS.map(h => {
            const stat = snapshot.cohortLtv?.horizons?.[h] ?? null;
            return (
              <Kpi
                key={h}
                label={`LTV · ${h} міс.`}
                value={stat ? uah(stat.ltv) : '—'}
                note={stat ? `${stat.cohorts} когорт · ${num(stat.clients)} клієнтів` : 'ще немає когорт такого віку'}
              />
            );
          })}
        </div>

        {ltvRows.length === 0 ? (
          <p className="text-[10px] text-gray-500 italic">Немає даних про когорти — запустіть синхронізацію LTV.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <TH>Когорта</TH>
                <TH align="right">Розмір</TH>
                {Array.from({ length: ltvOffsets + 1 }).map((_, i) => (
                  <TH key={i} align="center">M{i}</TH>
                ))}
              </tr>
            </thead>
            <tbody>
              {ltvRows.map(row => {
                const maxValue = Math.max(1, ...ltvRows.flatMap(r => Object.values(r.ltvByOffset)));
                return (
                  <tr key={row.month}>
                    <TD bold>{row.month}</TD>
                    <TD align="right">{num(row.size)}</TD>
                    {Array.from({ length: ltvOffsets + 1 }).map((_, i) => {
                      // Когорта ще не дожила до цього місяця — це не нуль, а відсутність даних
                      if (i > row.maxOffset) {
                        return <td key={i} className="border border-gray-300 bg-gray-50" />;
                      }
                      const value = row.ltvByOffset[i] ?? 0;
                      return (
                        <td
                          key={i}
                          className="border border-gray-300 px-1 py-[3px] text-[8px] text-center whitespace-nowrap"
                          style={{ backgroundColor: `rgba(139, 92, 246, ${Math.max(0.06, (value / maxValue) * 0.8)})` }}
                        >
                          {value > 0 ? num(value) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* ── Клієнти ───────────────────────────────────────────────────────── */}
      <Section
        title={`Клієнти вибірки${clients.length > CLIENT_ROWS ? ` — перші ${CLIENT_ROWS} з ${num(clients.length)}` : ''}`}
        breakBefore
        hint={clients.length > CLIENT_ROWS
          ? 'Порядок такий самий, як у таблиці на екрані. Повний список вивантажується кнопкою CSV.'
          : 'Порядок такий самий, як у таблиці на екрані.'}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <TH align="right">#</TH>
              <TH>Клієнт</TH>
              <TH>Тір</TH>
              <TH>Сегмент</TH>
              <TH>Тип</TH>
              <TH align="right">Дохід за період</TH>
              <TH align="right">Угод</TH>
              <TH align="right">Середній чек</TH>
              <TH align="right">Дохід за весь час</TH>
              <TH align="right">Остання</TH>
              <TH>Когорта</TH>
            </tr>
          </thead>
          <tbody>
            {shown.map((c, i) => (
              <tr key={c.id} style={{ breakInside: 'avoid' }}>
                <TD align="right">{i + 1}</TD>
                <TD bold>{c.name}</TD>
                <TD>{c.tier ? `Tier ${c.tier}` : '—'}</TD>
                <TD>{c.rfm.label}</TD>
                <TD>{CUSTOMER_KIND_LABELS[c.customerKind]}</TD>
                <TD align="right">{uah(c.periodRevenue)}</TD>
                <TD align="right">{num(c.periodDeals)}</TD>
                <TD align="right">{uah(c.avgCheck)}</TD>
                <TD align="right">{uah(c.revenue)}</TD>
                <TD align="right">{c.recencyDays !== null ? `${c.recencyDays} дн.` : '—'}</TD>
                <TD>{c.cohortMonth ?? '—'}</TD>
              </tr>
            ))}
            {rest.length > 0 && (
              <tr className="bg-gray-50">
                <TD align="right">—</TD>
                <TD bold>Решта вибірки ({num(rest.length)} клієнтів)</TD>
                <TD>—</TD>
                <TD>—</TD>
                <TD>—</TD>
                <TD align="right" bold>{uah(restRevenue)}</TD>
                <TD align="right" bold>{num(restDeals)}</TD>
                <TD align="right">—</TD>
                <TD align="right">—</TD>
                <TD align="right">—</TD>
                <TD>—</TD>
              </tr>
            )}
            {clients.length === 0 && (
              <tr><TD>За цими фільтрами жодного клієнта не знайдено</TD></tr>
            )}
          </tbody>
        </table>
      </Section>

      <footer className="mt-6 pt-2 border-t border-gray-300 text-[8px] text-gray-500">
        PAWELL · Аналітика клієнтів · {periodLabel} · сформовано {generatedAt}
      </footer>
    </div>
  );
}

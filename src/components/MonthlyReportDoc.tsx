import React from 'react';
import {
  MonthlyReport, MonthSpend, MonthTotals, MovementKind, MOVEMENT_LABELS,
  AcquisitionStats, SourceStat, MonthCoverage, MonthProgress,
  monthLabel, monthLabelIn, dayLabel, delta, formatPct, summarizeMonth,
  judgeLtvToCac, LTV_TO_CAC_HINTS,
} from '../lib/monthlyReport';
import { COHORT_MATURITY_DAYS } from '../lib/cac';
import { pluralUk } from '../lib/plural';
import { uah, num } from './report/primitives';
import Donut, { sourceColor, OTHER_COLOR } from './report/Donut';

/**
 * Друкований місячний звіт.
 *
 * Один місяць, завжди однакова структура: коротко словами → ключові показники →
 * нові й постійні та рух клієнтів → динаміка року → джерела → гроші → найбільші
 * клієнти → ті, хто перестав купувати. Порядок не міняється від місяця до місяця,
 * бо звіти читають підряд.
 *
 * ПРАВИЛА ЧИТАБЕЛЬНОСТІ (не опускати без причини):
 *  - жоден текст не менший за 11 px (≈ 8 pt на папері); основний — 12.5–14 px;
 *  - одна ідея на сторінку: великі розділи починаються з нової сторінки;
 *  - таблиці без вертикальних ліній, з тонкими горизонтальними, до 8 колонок;
 *  - у таблицях лише те, що читають; усе інше — у CSV з екрана звіту;
 *  - колір ніколи не єдиний носій змісту: біля кольору завжди знак чи слово.
 *
 * Малюється лише в момент друку (див. MonthlyReportView), тож на швидкодію
 * екрана не впливає.
 */

/** Скільки клієнтів показуємо в таблицях документа; повний список — у CSV */
const TOP_ROWS = 15;
const LOST_ROWS = 15;

/** Частка, 0–100 %; нульове ціле не ділимо */
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// ── Дрібні деталі, спільні для розділів ───────────────────────────────────────

/** Розділ: заголовок, коротке пояснення, вміст. Розривати посередині не можна */
function Block({
  title, hint, children, breakBefore = false, splittable = false,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  breakBefore?: boolean;
  /** Можна ділити між сторінками (рядки всередині самі не розриваються) */
  splittable?: boolean;
}) {
  return (
    <section
      className="mt-8 first:mt-0"
      style={{ breakInside: splittable ? 'auto' : 'avoid', breakBefore: breakBefore ? 'page' : 'auto' }}
    >
      <h2 className="text-[19px] font-extrabold text-gray-900 leading-tight">{title}</h2>
      <div className="h-[3px] w-12 bg-purple-600 rounded-full mt-1.5 mb-2.5" />
      {hint && <p className="text-[12.5px] text-gray-600 mb-4 leading-snug max-w-[860px]">{hint}</p>}
      {children}
    </section>
  );
}

type Align = 'left' | 'right';
const ALIGN: Record<Align, string> = { left: 'text-left', right: 'text-right' };

const Th = ({ children, align = 'left' }: { children?: React.ReactNode; align?: Align; key?: React.Key }) => (
  <th className={`px-3 py-2 text-[12px] font-bold text-gray-800 bg-gray-100 border-b-2 border-gray-400 whitespace-nowrap ${ALIGN[align]}`}>
    {children}
  </th>
);

const Td = ({
  children, align = 'left', bold = false, muted = false, colSpan,
}: {
  children?: React.ReactNode; align?: Align; bold?: boolean; muted?: boolean; colSpan?: number; key?: React.Key;
}) => (
  <td
    colSpan={colSpan}
    className={`px-3 py-[6px] text-[13px] border-b border-gray-300 tabular-nums ${ALIGN[align]} ${
      muted ? 'text-gray-600' : 'text-gray-900'
    } ${bold ? 'font-bold' : ''}`}
  >
    {children}
  </td>
);

/** Зміна до бази: стрілка + знак + число. Колір — друга підказка, не перша */
function Chip({ pct, good = 'up' }: { pct: number | null; good?: 'up' | 'down' }) {
  if (pct === null) {
    return <span className="text-[12.5px] text-gray-600">— немає бази</span>;
  }
  const rising = pct >= 0;
  const positive = pct === 0 ? null : good === 'up' ? rising : !rising;
  const tone =
    positive === null ? 'bg-gray-100 text-gray-800'
      : positive ? 'bg-emerald-100 text-emerald-900'
        : 'bg-red-100 text-red-900';
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[12.5px] font-bold whitespace-nowrap ${tone}`}>
      {pct === 0 ? '■' : rising ? '▲' : '▼'} {formatPct(pct)}
    </span>
  );
}

/** Картка показника: що це → велике число → як змінилось */
function Stat({
  label, value, pct, note, good = 'up',
}: {
  label: string;
  value: string;
  /** undefined — зміни немає в принципі (показуємо лише пояснення) */
  pct?: number | null;
  note?: React.ReactNode;
  good?: 'up' | 'down';
  key?: React.Key;
}) {
  return (
    <div className="border border-gray-300 rounded-lg px-4 py-3 bg-white" style={{ breakInside: 'avoid' }}>
      <p className="text-[12.5px] font-bold text-gray-700">{label}</p>
      <p className="text-[28px] font-black text-gray-900 leading-tight tabular-nums my-0.5">{value}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-gray-600 leading-snug">
        {pct !== undefined && <Chip pct={pct} good={good} />}
        {note && <span>{note}</span>}
      </div>
    </div>
  );
}

/** Коротка назва місяця для осі: «жов 26» */
const MONTH_SHORT = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
const shortMonth = (m: string) => `${MONTH_SHORT[Number(m.slice(5, 7)) - 1] ?? m} ${m.slice(2, 4)}`;

/** «1,2 млн» / «345 тис.» — підпис над стовпцем; точні суми лежать у таблиці */
function compactUah(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '')} млн ₴`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} тис. ₴`;
  return uah(n);
}

/** Стовпець із заокругленою верхівкою й рівною основою */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/**
 * Динаміка: стовпці доходу за рік.
 *
 * Підписано лише поточний місяць і найкращий у ряді — підпис над кожним
 * стовпцем перетворив би графік на таблицю, а таблиця стоїть одразу під ним.
 */
function TrendChart({ trend, current }: { trend: MonthTotals[]; current: string }) {
  const W = 1000, H = 165, top = 30, bottom = 28;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...trend.map(m => m.revenue));
  const slot = W / trend.length;
  const barW = Math.min(52, slot * 0.58);
  const base = H - bottom;
  const peak = trend.reduce((best, m) => (m.revenue > best.revenue ? m : best), trend[0]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Дохід за ${trend.length} місяців. Найкращий — ${monthLabel(peak.month)}: ${uah(peak.revenue)}.`}
    >
      {[0.5, 1].map(f => (
        <line key={f} x1={0} x2={W} y1={base - plotH * f} y2={base - plotH * f} stroke="#e5e7eb" strokeWidth={1} />
      ))}
      {trend.map((m, i) => {
        const h = Math.max(2, (m.revenue / max) * plotH);
        const cx = slot * i + slot / 2;
        const x = cx - barW / 2;
        const isCurrent = m.month === current;
        const labelled = isCurrent || m.month === peak.month;
        return (
          <g key={m.month}>
            <path d={barPath(x, base - h, barW, h, 4)} fill={isCurrent ? '#4c1d95' : '#8b5cf6'} />
            {labelled && m.revenue > 0 && (
              <text x={cx} y={base - h - 8} textAnchor="middle"
                    style={{ fontSize: 13, fontWeight: 800, fill: '#111827' }}>
                {compactUah(m.revenue)}
              </text>
            )}
            <text x={cx} y={H - 9} textAnchor="middle"
                  style={{ fontSize: 12.5, fontWeight: isCurrent ? 800 : 500, fill: isCurrent ? '#111827' : '#4b5563' }}>
              {shortMonth(m.month)}
            </text>
          </g>
        );
      })}
      <line x1={0} x2={W} y1={base} y2={base} stroke="#9ca3af" strokeWidth={1.5} />
    </svg>
  );
}

const MOVEMENT_HINTS: Record<MovementKind, string> = {
  new:         'перша покупка саме цього місяця',
  kept:        'купували і минулого місяця, і цього',
  reactivated: 'купували раніше, минулого місяця — ні, цього повернулись',
  lost:        'купували минулого місяця, цього — ні',
};

/** Колір крапки групи — лише допоміжний: назва групи завжди поруч */
const MOVEMENT_DOT: Record<MovementKind, string> = {
  new: 'bg-purple-600', kept: 'bg-emerald-600', reactivated: 'bg-blue-600', lost: 'bg-red-600',
};

const Dot = ({ className }: { className: string }) => (
  <span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 align-baseline ${className}`} />
);

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

  const movementRows: MovementKind[] = ['new', 'kept', 'reactivated', 'lost'];
  const lostGroup = r.movements.lost;

  /**
   * Застереження — в один блок на першій сторінці, коротко. Документ ходить
   * окремо від екрана, і читач мусить побачити, що числа неповні, ще до того,
   * як на них спиратись. Але чотири абзаци дрібним шрифтом у шапці ніхто не читає.
   */
  const notes: { tone: 'warn' | 'bad'; text: React.ReactNode }[] = [];
  if (!r.hasMonthlyStats) {
    notes.push({ tone: 'bad', text: <>У знімку LTV немає сум по місяцях, тому звіт порожній. Перезапустіть синхронізацію LTV.</> });
  }
  if (progress?.partial) {
    notes.push({
      tone: 'warn',
      text: <><b>Місяць ще триває:</b> дані станом на {dayLabel(progress.asOf)} ({num(progress.daysElapsed)} із {num(progress.daysInMonth)} днів).
        Дохід, угоди й утримання порівнюються з повним {monthLabel(r.prevMonth).toLowerCase()}, тож їхні зміни занижені.
        MQA, конверсія й джерела порівнюються з таким самим відрізком попереднього місяця.</>,
    });
  }
  if (crmFallback) {
    notes.push({
      tone: 'warn',
      text: <><b>Дохід, угоди й клієнти — з добових зрізів CRM.</b> Знімок LTV за {monthLabel(r.month).toLowerCase()} ще
        не перераховано. Рух клієнтів, утримання, нові/постійні й топ клієнтів поки порожні.</>,
    });
  }
  if (coverage && !coverage.complete) {
    notes.push({
      tone: 'bad',
      text: <><b>Не всі дні є в CRM:</b> збережено {num(coverage.presentDays)} із {num(coverage.expectedDays)}{' '}
        {pluralUk(coverage.expectedDays, 'добового знімка', 'добових знімків', 'добових знімків')} ({coverage.percent} %).
        MQA, конверсія й суми по джерелах занижені. Дохід, угоди й утримання від цього не залежать.</>,
    });
  }
  if (acquisition && !acquisition.mature) {
    notes.push({
      tone: 'warn',
      text: <><b>Когорта місяця ще дозріває:</b> ліди з останніх днів не встигли стати клієнтами. MQA й конверсія занижені,
        CAC завищений — числа усталяться через {COHORT_MATURITY_DAYS} днів після закриття місяця.</>,
    });
  }

  // Колір рядка таблиці джерел — той самий, що сегмент кільця; хто не потрапив у кільце, той «Інші»
  const colorOfSource = (name: string): string => {
    const idx = sources.findIndex(s => s.source === name);
    return idx >= 0 ? sourceColor(idx, name) : OTHER_COLOR;
  };

  return (
    <div className="print-landscape bg-white text-gray-900 px-2 py-1" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>

      {/* ═══ Сторінка 1 · титул, застереження, підсумок словами ═══════════════ */}
      <header className="pb-4 border-b-4 border-purple-600">
        <div className="flex items-end justify-between gap-8">
          <div>
            <p className="text-[12.5px] font-extrabold tracking-[0.12em] uppercase text-purple-700">PAWELL · Місячний звіт</p>
            <h1 className="text-[36px] font-black leading-none mt-1">
              {title}
              {progress?.partial && (
                <span className="text-[18px] text-gray-600 font-bold"> · станом на {dayLabel(progress.asOf)}</span>
              )}
            </h1>
          </div>
          <div className="text-right text-[12.5px] text-gray-700 leading-relaxed">
            <p>Порівняння з: <b className="text-gray-900">{monthLabel(r.prevMonth)}</b></p>
            <p>Активних клієнтів: <b className="text-gray-900">{num(t.clients)}</b> з {num(r.totalClients)} у базі</p>
            <p className="text-gray-600">Сформовано {generatedAt}</p>
          </div>
        </div>
        <p className="text-[12.5px] text-gray-600 mt-3">
          Усі числа — по всій базі клієнтів; фільтри аналітики на звіт не впливають.
          Дохід і угоди беруться з помісячних сум знімка LTV.
        </p>
      </header>

      {notes.length > 0 && (
        <aside className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-5 py-3" style={{ breakInside: 'avoid' }}>
          <p className="text-[14px] font-extrabold text-amber-900 mb-1.5">Що врахувати, читаючи звіт</p>
          <ul className="space-y-1.5">
            {notes.map((n, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug text-gray-900">
                <span aria-hidden className={`font-black ${n.tone === 'bad' ? 'text-red-700' : 'text-amber-700'}`}>⚠</span>
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <Block title="Коротко про місяць" splittable>
        <ol className="space-y-2.5">
          {summarizeMonth(r, { acquisition, spend }).map((line, i) => (
            <li key={i} className="flex gap-3 text-[14.5px] text-gray-900 leading-relaxed" style={{ breakInside: 'avoid' }}>
              <span className="flex-shrink-0 w-6 h-6 mt-0.5 rounded-full bg-purple-700 text-white text-[12.5px] font-extrabold flex items-center justify-center">
                {i + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </Block>

      {/* ═══ Сторінка 2 · ключові показники ═══════════════════════════════════ */}
      <Block
        title="Ключові показники"
        hint={<>Зміна — до попереднього місяця ({monthLabel(r.prevMonth)}).
          Зелений — покращення, червоний — погіршення; напрямок завжди видно по стрілці.</>}
      >
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Законтрактовано" value={uah(t.revenue)} pct={delta(t.revenue, p.revenue).pct} note={`було ${uah(p.revenue)}`} />
          {r.hasPaid
            ? <Stat label="Оплачено (надійшло на рахунок)" value={uah(t.paid)} pct={delta(t.paid, p.paid).pct} note={`було ${uah(p.paid)}`} />
            : <Stat label="Угод" value={num(t.deals)} pct={delta(t.deals, p.deals).pct} note={`було ${num(p.deals)}`} />}
          {r.hasPaid && <Stat label="Угод" value={num(t.deals)} pct={delta(t.deals, p.deals).pct} note={`було ${num(p.deals)}`} />}
          <Stat label="Активних клієнтів" value={num(t.clients)} pct={delta(t.clients, p.clients).pct} note={`було ${num(p.clients)}`} />
          <Stat label="Середній чек" value={uah(t.avgCheck)} pct={delta(t.avgCheck, p.avgCheck).pct} note={`було ${uah(p.avgCheck)}`} />
          <Stat label="Дохід на клієнта" value={uah(t.arpu)} pct={delta(t.arpu, p.arpu).pct} note={`було ${uah(p.arpu)}`} />
        </div>

        {/* Рік тому — інша база порівняння, тому окремо від карток */}
        <div className="mt-4 rounded-lg border border-gray-300 bg-gray-50 px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
          <b className="text-gray-900">Рік тому</b>
          {r.hasYearAgo ? (
            <>
              <span className="text-gray-800">
                {monthLabel(r.yearAgoMonth)}: <b>{uah(r.yearAgoTotals.revenue)}</b>
                {' · '}{num(r.yearAgoTotals.deals)} {pluralUk(r.yearAgoTotals.deals, 'угода', 'угоди', 'угод')}
                {' · '}{num(r.yearAgoTotals.clients)} {pluralUk(r.yearAgoTotals.clients, 'клієнт', 'клієнти', 'клієнтів')}
              </span>
              <Chip pct={delta(t.revenue, r.yearAgoTotals.revenue).pct} />
              <span className="text-gray-600">порівняння з тим самим місяцем прибирає сезонність</span>
            </>
          ) : (
            <span className="text-gray-600">Даних за {monthLabelIn(r.yearAgoMonth)} немає — сезонність порівняти нема з чим.</span>
          )}
        </div>

        <h3 className="text-[15px] font-extrabold text-gray-900 mt-7 mb-1">Залучення та утримання</h3>
        <p className="text-[12.5px] text-gray-600 mb-3 max-w-[860px] leading-snug">
          MQA — залучені цього місяця записи, що вже стали клієнтами. Конверсія — їхня частка від усіх залучених.
          Утримання рахується від клієнтів, активних у {prevIn}: утримати можна лише того, хто вже був.
        </p>
        <div className="grid grid-cols-5 gap-3">
          <Stat
            label="MQA"
            value={acquisition ? num(acquisition.mqa) : '—'}
            pct={acquisition ? acquisition.mqaChange : undefined}
            note={acquisition ? `із ${num(acquisition.acquired)} залучених` : 'дані CRM недоступні'}
          />
          <Stat
            label="Конверсія"
            value={acquisition?.conversion != null ? `${acquisition.conversion} %` : '—'}
            pct={acquisition?.prevConversion != null ? acquisition.conversionChange : undefined}
            note={acquisition?.prevConversion != null ? `було ${acquisition.prevConversion} %` : 'порівнювати нема з чим'}
          />
          <Stat
            label="LTV / CAC"
            value={spend?.ltvToCac != null ? `${spend.ltvToCac}` : '—'}
            note={spend?.ltvToCac != null
              ? LTV_TO_CAC_HINTS[judgeLtvToCac(spend.ltvToCac)!]
              : 'потрібні витрати місяця й LTV'}
          />
          <Stat
            label="Утримання клієнтів"
            value={r.retention.rate !== null ? `${r.retention.rate} %` : '—'}
            pct={r.retention.rate !== null && r.prevRetention.rate !== null
              ? delta(r.retention.rate, r.prevRetention.rate).pct : undefined}
            note={r.retention.rate !== null
              ? `${num(r.retention.kept)} з ${num(r.retention.base)}; відтік ${r.retention.churn} %`
              : `у ${prevIn} активних не було`}
          />
          <Stat
            label="Утримання доходу"
            value={r.retention.revenueRetention !== null ? `${r.retention.revenueRetention} %` : '—'}
            note={`від доходу ${prevIn}; частка постійних — ${r.retention.repeatRevenueShare} %`}
          />
        </div>
      </Block>

      {/* ═══ Сторінка 3 · хто купував ═════════════════════════════════════════ */}
      <Block
        title="Нові та постійні клієнти"
        breakBefore
        hint="Новий — той, у кого перша покупка сталась саме цього місяця. Постійний купував і раніше."
      >
        {/* Смужка перед таблицею: співвідношення видно за секунду */}
        {t.revenue > 0 && (
          <div className="flex h-5 rounded overflow-hidden mb-4 bg-gray-200" role="img"
               aria-label={`Нові ${share(t.newRevenue, t.revenue)} % доходу, постійні ${share(t.returningRevenue, t.revenue)} %`}>
            <div className="bg-purple-600 text-white text-[12px] font-bold flex items-center pl-2"
                 style={{ width: `${share(t.newRevenue, t.revenue)}%` }}>
              {share(t.newRevenue, t.revenue) >= 8 && `${share(t.newRevenue, t.revenue)} %`}
            </div>
            <div className="bg-emerald-700 text-white text-[12px] font-bold flex items-center pl-2"
                 style={{ width: `${share(t.returningRevenue, t.revenue)}%` }}>
              {share(t.returningRevenue, t.revenue) >= 8 && `${share(t.returningRevenue, t.revenue)} %`}
            </div>
          </div>
        )}
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Тип клієнта</Th>
              <Th align="right">Клієнтів</Th>
              <Th align="right">Було в {monthLabel(r.prevMonth).toLowerCase()}</Th>
              <Th align="right">Угод</Th>
              <Th align="right">Дохід</Th>
              <Th align="right">Частка</Th>
              <Th align="right">Середній чек</Th>
            </tr>
          </thead>
          <tbody>
            {([
              { label: 'Нові', dot: 'bg-purple-600', clients: t.newClients, prevClients: p.newClients, deals: t.newDeals, revenue: t.newRevenue },
              { label: 'Постійні', dot: 'bg-emerald-700', clients: t.returningClients, prevClients: p.returningClients, deals: t.returningDeals, revenue: t.returningRevenue },
            ]).map(row => (
              <tr key={row.label}>
                <Td bold><Dot className={row.dot} />{row.label}</Td>
                <Td align="right">{num(row.clients)}</Td>
                <Td align="right" muted>{num(row.prevClients)}</Td>
                <Td align="right">{num(row.deals)}</Td>
                <Td align="right" bold>{uah(row.revenue)}</Td>
                <Td align="right">{share(row.revenue, t.revenue)} %</Td>
                <Td align="right">{row.deals > 0 ? uah(row.revenue / row.deals) : '—'}</Td>
              </tr>
            ))}
            <tr className="bg-gray-50">
              <Td bold>Разом</Td>
              <Td align="right" bold>{num(t.clients)}</Td>
              <Td align="right" muted>{num(p.clients)}</Td>
              <Td align="right" bold>{num(t.deals)}</Td>
              <Td align="right" bold>{uah(t.revenue)}</Td>
              <Td align="right" muted>100 %</Td>
              <Td align="right">{uah(t.avgCheck)}</Td>
            </tr>
          </tbody>
        </table>
      </Block>

      <Block
        title="Рух клієнтів"
        hint={<>Чотири групи, а не «стало більше чи менше»: зростання на нових і на поверненнях означає різне.
          Для тих, хто перестав купувати, показано, скільки вони давали в {prevIn}.</>}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Група</Th>
              <Th>Що це означає</Th>
              <Th align="right">Клієнтів</Th>
              <Th align="right">Угод</Th>
              <Th align="right">Дохід</Th>
              <Th align="right">Частка доходу</Th>
            </tr>
          </thead>
          <tbody>
            {movementRows.map(kind => {
              const g = r.movements[kind];
              return (
                <tr key={kind}>
                  <Td bold><Dot className={MOVEMENT_DOT[kind]} />{MOVEMENT_LABELS[kind]}</Td>
                  <Td muted>{MOVEMENT_HINTS[kind]}</Td>
                  <Td align="right" bold>{num(g.clients.length)}</Td>
                  <Td align="right">{num(g.deals)}</Td>
                  <Td align="right">{uah(g.revenue)}</Td>
                  <Td align="right">{kind === 'lost' ? '—' : `${share(g.revenue, t.revenue)} %`}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-[12px] text-gray-600 mt-2">
          Для групи «{MOVEMENT_LABELS.lost}» дохід — це те, що вона давала в {prevIn}, тому частки в доході цього місяця в неї немає.
        </p>
      </Block>

      {/* ═══ Сторінка 4 · динаміка ════════════════════════════════════════════ */}
      <Block
        title={`Динаміка за ${r.trend.length} ${pluralUk(r.trend.length, 'місяць', 'місяці', 'місяців')}`}
        breakBefore
        hint="Дохід (законтрактовано) по місяцях; підписано звітний і найкращий місяць, решта — у таблиці."
      >
        <TrendChart trend={r.trend} current={r.month} />

        <table className="w-full border-collapse mt-4">
          <thead>
            <tr>
              <Th>Місяць</Th>
              <Th align="right">Законтрактовано</Th>
              {r.hasPaid && <Th align="right">Оплачено</Th>}
              <Th align="right">Угод</Th>
              <Th align="right">Клієнтів</Th>
              <Th align="right">Нових</Th>
              <Th align="right">Середній чек</Th>
            </tr>
          </thead>
          <tbody>
            {[...r.trend].reverse().map((m: MonthTotals) => {
              const cur = m.month === r.month;
              return (
                <tr key={m.month} className={cur ? 'bg-purple-100' : undefined} style={{ breakInside: 'avoid' }}>
                  <Td bold={cur}>{monthLabel(m.month)}</Td>
                  <Td align="right" bold={cur}>{uah(m.revenue)}</Td>
                  {r.hasPaid && <Td align="right">{uah(m.paid)}</Td>}
                  <Td align="right">{num(m.deals)}</Td>
                  <Td align="right">{num(m.clients)}</Td>
                  <Td align="right">{num(m.newClients)}</Td>
                  <Td align="right">{m.deals > 0 ? uah(m.avgCheck) : '—'}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Block>

      {/* ═══ Джерела ═════════════════════════════════════════════════════════ */}
      {acquisition && (
        <Block
          title="Яке джерело скільки принесло"
          breakBefore
          hint="Сума угод місяця по джерелах з CRM. У кільці п'ять найбільших джерел, решта — «Інші»; повний перелік у таблиці."
        >
          {sources.length === 0 ? (
            <p className="text-[13px] text-gray-600 italic">
              За {monthLabelIn(r.month)} CRM не повернула угод по джерелах.
            </p>
          ) : (
            <div className="flex gap-8 items-start">
              <div className="flex-shrink-0">
                <Donut
                  slices={sources.map((c, i) => ({
                    label: c.source,
                    value: c.revenue,
                    color: sourceColor(i, c.source),
                  }))}
                  centerValue={uah(acquisition.sourcesRevenue)}
                  centerLabel="сума угод"
                  size={210}
                  thickness={30}
                />
              </div>

              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Джерело</Th>
                    <Th align="right">Сума угод</Th>
                    <Th align="right">Частка</Th>
                    <Th align="right">Угод</Th>
                    <Th align="right">MQA</Th>
                    <Th align="right">Залучено</Th>
                    <Th align="right">Конверсія</Th>
                    {spend && <Th align="right">CAC</Th>}
                  </tr>
                </thead>
                <tbody>
                  {acquisition.sources.map(c => {
                    const sourceCac = spend?.bySource?.matched.find(
                      m => m.source.toLowerCase() === c.source.toLowerCase(),
                    );
                    return (
                      <tr key={c.source} style={{ breakInside: 'avoid' }}>
                        {/* Крапка тим самим кольором, що й сегмент кільця, — це і є легенда */}
                        <Td bold>
                          <span className="inline-block w-3 h-3 rounded-sm mr-2 align-middle" style={{ backgroundColor: colorOfSource(c.source) }} />
                          {c.source}
                        </Td>
                        <Td align="right" bold>{uah(c.revenue)}</Td>
                        <Td align="right">{c.revenueShare} %</Td>
                        <Td align="right">{num(c.deals)}</Td>
                        <Td align="right">{num(c.clients)}</Td>
                        <Td align="right" muted>{num(c.acquired)}</Td>
                        <Td align="right">{c.conversion !== null ? `${c.conversion} %` : '—'}</Td>
                        {spend && <Td align="right">{sourceCac?.cac != null ? uah(sourceCac.cac) : '—'}</Td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {acquisition.sources.some(c => colorOfSource(c.source) === OTHER_COLOR) && (
            <p className="text-[12px] text-gray-600 mt-3">
              Сірий колір — «Інші»: джерела поза п'ятіркою найбільших об'єднані в один сегмент кільця.
            </p>
          )}
        </Block>
      )}

      {/* ═══ Гроші ════════════════════════════════════════════════════════════ */}
      {spend && (
        <Block
          title="Гроші: витрати й вартість клієнта"
          breakBefore
          hint={<>Витрати беруться з розділу «Витрати» за дати цього місяця й зводяться до гривні.
            У знаменнику CAC — {acquisition
              ? <>клієнти когорти місяця з CRM: {num(acquisition.mqa)}</>
              : <>нові клієнти з помісячних сум: {num(t.newClients)}</>}.
            {spend.hasForeign && ' Частина витрат не в гривні — сума залежить від курсу в налаштуваннях.'}</>}
        >
          {spend.count === 0 ? (
            <p className="text-[13px] text-gray-600 italic">
              За {monthLabelIn(r.month)} витрат не внесено — вартість клієнта порахувати неможливо.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <Stat label="Витрати за місяць" value={uah(spend.total)} pct={delta(spend.total, spend.prevTotal).pct} good="down" note={`було ${uah(spend.prevTotal)}`} />
                <Stat label="З них реклама" value={uah(spend.ads)} pct={delta(spend.ads, spend.prevAds).pct} good="down" note={`було ${uah(spend.prevAds)}`} />
                <Stat
                  label="CAC за рекламою"
                  value={spend.cac !== null ? uah(spend.cac) : '—'}
                  pct={spend.prevCac !== null ? spend.cacChange : undefined}
                  good="down"
                  note={spend.prevCac !== null ? `було ${uah(spend.prevCac)}` : 'порівнювати з попереднім місяцем нема з чим'}
                />
                <Stat
                  label="CAC за всіма витратами"
                  value={spend.blendedCac !== null ? uah(spend.blendedCac) : '—'}
                  note="усі витрати відділу ÷ залучені клієнти"
                />
                <Stat
                  label="LTV / CAC"
                  value={spend.ltvToCac != null ? `${spend.ltvToCac}` : '—'}
                  note={spend.ltvToCac != null && spend.ltvBasis
                    ? `${spend.ltvBasis} ${uah(spend.ltv ?? 0)} ÷ CAC ${uah(spend.cac ?? 0)}`
                    : 'потрібні рекламний бюджет і LTV'}
                />
                <Stat
                  label="Дохід на 1 ₴ витрат"
                  value={spend.revenuePerSpend !== null ? `${spend.revenuePerSpend}` : '—'}
                  note={[
                    spend.adShare !== null ? `ДРВ ${spend.adShare} %` : null,
                    spend.cpl !== null ? `CPL ${uah(spend.cpl)}` : null,
                  ].filter(Boolean).join(' · ') || undefined}
                />
              </div>

              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Категорія витрат</Th>
                    <Th align="right">Сума</Th>
                    <Th align="right">Частка витрат</Th>
                    <Th align="right">Частка доходу місяця</Th>
                  </tr>
                </thead>
                <tbody>
                  {spend.byCategory.map(c => (
                    <tr key={c.category} style={{ breakInside: 'avoid' }}>
                      <Td bold>{c.category}</Td>
                      <Td align="right">{uah(c.amount)}</Td>
                      <Td align="right">{share(c.amount, spend.total)} %</Td>
                      <Td align="right" muted>{t.revenue > 0 ? `${share(c.amount, t.revenue)} %` : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Block>
      )}

      {/* ═══ Найбільші клієнти ════════════════════════════════════════════════ */}
      <Block
        title={`Найбільші клієнти місяця${t.clients > TOP_ROWS ? ` — перші ${TOP_ROWS} з ${num(t.clients)}` : ''}`}
        breakBefore
        hint={<>Зміна — різниця з {prevIn}.
          {t.clients > TOP_ROWS && ' Повний список клієнтів місяця (з середнім чеком і першою покупкою) — у CSV з екрана звіту.'}</>}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th align="right">#</Th>
              <Th>Клієнт</Th>
              <Th>Група</Th>
              <Th align="right">Дохід</Th>
              <Th align="right">Угод</Th>
              <Th align="right">Було раніше</Th>
              <Th align="right">Зміна</Th>
              <Th align="right">Частка</Th>
            </tr>
          </thead>
          <tbody>
            {r.top.slice(0, TOP_ROWS).map((c, i) => (
              <tr key={c.id} style={{ breakInside: 'avoid' }}>
                <Td align="right" muted>{i + 1}</Td>
                <Td bold>{c.name}</Td>
                <Td><Dot className={MOVEMENT_DOT[c.kind]} />{MOVEMENT_LABELS[c.kind]}</Td>
                <Td align="right" bold>{uah(c.revenue)}</Td>
                <Td align="right">{num(c.deals)}</Td>
                <Td align="right" muted>{c.prevRevenue > 0 ? uah(c.prevRevenue) : '—'}</Td>
                <Td align="right">{c.prevRevenue > 0 ? `${c.delta >= 0 ? '▲ +' : '▼ −'}${uah(Math.abs(c.delta))}` : '—'}</Td>
                <Td align="right">{share(c.revenue, t.revenue)} %</Td>
              </tr>
            ))}
            {r.top.length === 0 && (
              <tr><Td colSpan={8} muted>За {monthLabelIn(r.month)} угод не було</Td></tr>
            )}
          </tbody>
        </table>
      </Block>

      {/* ═══ Перестали купувати ═══════════════════════════════════════════════ */}
      <Block
        title={`Перестали купувати${lostGroup.clients.length > LOST_ROWS ? ` — перші ${LOST_ROWS} за сумою` : ''}`}
        breakBefore
        hint={<>Клієнти, які купували в {prevIn}, а цього місяця — ні. Це не відтік назавжди, а список на дзвінок:
          разом вони давали <b className="text-gray-900">{uah(lostGroup.revenue)}</b>.</>}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th align="right">#</Th>
              <Th>Клієнт</Th>
              <Th align="right">Давав у {monthLabel(r.prevMonth).toLowerCase()}</Th>
              <Th align="right">Угод було</Th>
              <Th>Перша покупка</Th>
            </tr>
          </thead>
          <tbody>
            {lostGroup.clients.slice(0, LOST_ROWS).map((c, i) => (
              <tr key={c.id} style={{ breakInside: 'avoid' }}>
                <Td align="right" muted>{i + 1}</Td>
                <Td bold>{c.name}</Td>
                <Td align="right" bold>{uah(c.prevRevenue)}</Td>
                <Td align="right">{num(c.prevDeals)}</Td>
                <Td muted>{c.first ? monthLabel(c.first) : '—'}</Td>
              </tr>
            ))}
            {lostGroup.clients.length === 0 && (
              <tr><Td colSpan={5} muted>Жоден клієнт минулого місяця не зник — усі купували й цього</Td></tr>
            )}
          </tbody>
        </table>
      </Block>

    </div>
  );
}

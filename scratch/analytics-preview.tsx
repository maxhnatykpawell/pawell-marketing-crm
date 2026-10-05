/**
 * Пісочниця розширеної аналітики: сторінка і PDF-звіт на вигаданій базі.
 *
 * Потрібна з двох причин. По-перше, звіт на екрані не показується ніколи — він
 * живе лише в друкованому вигляді, і подивитись на його верстку інакше як через
 * друк неможливо. По-друге, сама сторінка тягне дані з KeepInCRM, тож без ключа
 * й без входу в систему вона порожня. Тут обидві дивляться на одні й ті самі
 * вигадані числа: клієнтів із перекошеним доходом, воронку й когорти.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { AppContext } from '../src/App';
import AnalyticsView from '../src/components/AnalyticsView';
import AnalyticsReport from '../src/components/AnalyticsReport';
import {
  ClientRecord, enrichClients, assignTiers, computeDistribution, computeCustomerMix,
  calculateCohorts, countByRfm, DEFAULT_RFM_THRESHOLDS, MonthRange,
} from '../src/lib/clientAnalytics';
import { buildCohortLtv } from '../src/lib/cohortLtv';
import { LtvSnapshot } from '../src/lib/ltvSnapshot';
import { PeriodValue } from '../src/components/PeriodPicker';
import { FunnelRecord, FunnelSpeedMeta, summarizeFunnelSpeed } from '../src/lib/funnelSpeed';

const NOW = new Date('2026-08-15T12:00:00Z');

/** Місяць 'YYYY-MM' зі зміщенням від серпня 2026 */
const month = (offset: number) => new Date(Date.UTC(2026, 7 + offset, 1)).toISOString().slice(0, 7);

/**
 * Вигадані проходи воронкою: різні джерела з різною швидкістю, частка недійшлих,
 * клієнти-одразу, аномалії — щоб побачити і таблиці, і примітки про виключене.
 */
const FUNNEL_SOURCES = [
  { name: 'Instagram', leadH: 6, dealD: 4, payD: 3, drop: 0.3 },
  { name: 'Google Ads', leadH: 30, dealD: 12, payD: 9, drop: 0.5 },
  { name: 'Рекомендації', leadH: 3, dealD: 2, payD: 1, drop: 0.15 },
  { name: 'Холодні дзвінки', leadH: 70, dealD: 25, payD: 20, drop: 0.7 },
  { name: 'Сайт', leadH: 12, dealD: 8, payD: 5, drop: 0.4 },
];
const funnelRecords: FunnelRecord[] = Array.from({ length: 900 }, (_, i) => {
  const src = FUNNEL_SOURCES[i % FUNNEL_SOURCES.length];
  const created = new Date(NOW.getTime() - ((i * 37) % 330 + 3) * 86_400_000);
  const jitter = 0.5 + ((i * 7919) % 100) / 70;
  const r: FunnelRecord = {
    id: String(i), source: src.name, createdAt: created.toISOString(), isLead: false,
    convertedAt: null, firstDealAt: null, firstPaidDate: null,
  };
  if (i % 11 === 0) { r.convertedAt = r.createdAt; return r; } // створений одразу клієнтом
  if ((i * 13) % 100 < src.drop * 100 * 0.6) { r.isLead = true; return r; }
  const conv = new Date(created.getTime() + src.leadH * 3_600_000 * jitter);
  r.convertedAt = conv.toISOString();
  if ((i * 17) % 100 < src.drop * 100) return r;
  const deal = new Date(conv.getTime() + src.dealD * 86_400_000 * jitter);
  r.firstDealAt = deal.toISOString();
  if ((i * 19) % 100 < src.drop * 100) { if (i % 5 === 0) r.paidNoDate = true; return r; }
  r.firstPaidDate = new Date(deal.getTime() + Math.round(src.payD * jitter) * 86_400_000).toISOString().slice(0, 10);
  return r;
});
const funnelMeta: FunnelSpeedMeta = {
  lastSyncedAt: '2026-08-15T03:05:00Z', lastFullAt: '2026-08-10T03:05:00Z', mode: 'incremental',
  clients: funnelRecords.length, fetched: { clients: 234, deals: 36, payments: 649 },
  orphanDeals: 3, orphanPayments: 1, futurePayments: 12, warning: null, durationSec: 214,
};
const funnelResult = (q: URLSearchParams) => summarizeFunnelSpeed(funnelRecords, {
  from: q.get('from'), to: q.get('to'), minAgeDays: Number(q.get('minAgeDays') || 0),
}, NOW);



/**
 * База з перекосом: кілька великих клієнтів і довгий хвіст дрібних — саме той
 * випадок, у якому середнє бреше, а звіт має це показати.
 */
const clients: ClientRecord[] = Array.from({ length: 240 }, (_, i) => {
  const big = i < 12;
  const firstOffset = -(i % 20) - 1;
  const months = Array.from({ length: big ? 6 : (i % 3) + 1 }, (_, k) => month(firstOffset + k))
    .filter(m => m <= month(0));
  const perMonth = big ? 90_000 + i * 7_000 : 3_000 + (i % 17) * 900;

  const monthlyStats: Record<string, { revenue: number; deals: number }> = {};
  for (const m of months) monthlyStats[m] = { revenue: perMonth, deals: big ? 2 : 1 };

  return {
    id: `c${i}`,
    name: big ? `ТОВ «Великий клієнт ${i + 1}»` : `ФОП Дрібний ${i + 1}`,
    revenue: perMonth * months.length,
    agreementsCount: months.length * (big ? 2 : 1),
    lastPurchaseDate: `${months[months.length - 1] ?? month(-6)}-12`,
    purchaseMonths: months,
    monthlyStats,
    tags: big ? ['ключовий', 'опт'] : i % 4 === 0 ? ['роздріб'] : [],
  } as ClientRecord;
});

const snapshot: LtvSnapshot = {
  totalLTVRevenue: clients.reduce((s, c) => s + c.revenue, 0),
  uniqueClientsCount: clients.length,
  ltv: 42_000,
  stageStats: [
    { stage: 'Новий лід', count: 84, avgOpenDays: 4, avgCycleDays: 0 },
    { stage: 'Кваліфікація', count: 41, avgOpenDays: 11, avgCycleDays: 0 },
    { stage: 'Комерційна пропозиція', count: 27, avgOpenDays: 26, avgCycleDays: 0 },
    { stage: 'Погодження договору', count: 12, avgOpenDays: 38, avgCycleDays: 0 },
    { stage: 'Успішно реалізовано', count: 156, avgOpenDays: 0, avgCycleDays: 34 },
    { stage: 'Відмова', count: 63, avgOpenDays: 0, avgCycleDays: 21 },
  ],
  cohortLtv: buildCohortLtv(
    clients.map(c => ({
      monthlyRevenue: Object.fromEntries(
        Object.entries(c.monthlyStats ?? {}).map(([m, s]) => [m, s.revenue]),
      ),
    })),
    month(0),
  ),
};

/**
 * Сторінка ходить у ті самі ендпоїнти, що й у бою, — підміняємо їх, а не api.ts:
  так перевіряється справжній шлях завантаження, включно зі станом «ще вантажимо».
 */
const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  if (url.includes('/api/keepincrm/funnel-speed/status')) {
    return json({ running: false, mode: null, phase: '', done: 0, total: 0, startedAt: null, finishedAt: null, error: null });
  }
  if (url.includes('/api/keepincrm/funnel-speed')) {
    return json({
      meta: funnelMeta,
      result: funnelResult(new URL(url, location.href).searchParams),
      state: { running: false, mode: null, phase: '', done: 0, total: 0, startedAt: null, finishedAt: null, error: null },
    });
  }
  if (url.includes('/api/keepincrm/ltv/clients')) return json(clients);
  if (url.includes('/api/keepincrm/ltv')) return json(snapshot);
  return realFetch(input as any, init);
}) as typeof window.fetch;

/** Контекст — лише те, що читає сама сторінка */
const ctx: any = {
  state: { rfmThresholds: DEFAULT_RFM_THRESHOLDS },
  hasEditRights: true,
  currentUser: { role: 'admin' },
  updateSettings: (u: any) => console.log('updateSettings', u),
};

// ── Дані для звіту, порахованy тим самим конвеєром, що й на сторінці ──────────
const monthRange: MonthRange = { from: month(-11), to: month(0) };
const period: PeriodValue = { key: 'custom', from: `${monthRange.from}-01`, to: `${monthRange.to}-28` };
const enriched = enrichClients(clients, NOW, DEFAULT_RFM_THRESHOLDS, monthRange);
const tiered = assignTiers(enriched);

/** ?tab=funnel&view=report — відкрити конкретну вкладку, щоб зняти її без кліків */
const qs = new URLSearchParams(location.search);
if (qs.get('tab')) {
  try { localStorage.setItem('pawell_ltv_analytics_view', JSON.stringify({ tab: qs.get('tab') })); } catch { /* пісочниця */ }
}

function Preview() {
  const [tab, setTab] = useState<'page' | 'report'>(qs.get('view') === 'report' ? 'report' : 'page');

  return (
    <div className="min-h-screen bg-blue-50/50">
      <div className="flex items-center gap-2 px-6 py-3 bg-white border-b border-gray-200 print:hidden">
        {(['page', 'report'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              tab === t ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t === 'page' ? 'Сторінка «Аналітика»' : 'PDF-звіт'}
          </button>
        ))}
        <span className="text-[11px] text-gray-400">вигадана база на 240 клієнтів</span>
      </div>

      {tab === 'page' ? (
        <AppContext.Provider value={ctx}>
          <div className="p-6">
            <AnalyticsView />
          </div>
        </AppContext.Provider>
      ) : (
        // Ширина ≈ A4 landscape мінус поля, щоб на екрані було видно реальні переноси
        <div className="py-6 bg-gray-200">
          <div className="mx-auto bg-white shadow-lg" style={{ width: '1050px' }}>
            <AnalyticsReport
              clients={tiered.clients}
              distribution={computeDistribution(tiered.clients)}
              tiered={tiered}
              customerMix={computeCustomerMix(tiered.clients, monthRange)}
              period={period}
              monthRange={monthRange}
              activeFilterCount={2}
              filterChips={['лише Tier 1']}
              thresholds={DEFAULT_RFM_THRESHOLDS}
              rfmCounts={countByRfm(enriched)}
              totalClients={clients.length}
              cohorts={calculateCohorts(tiered.clients)}
              snapshot={snapshot}
              closedStages={['Успішно реалізовано', 'Відмова']}
              funnelSpeed={funnelResult(new URLSearchParams({ minAgeDays: '30' }))}
              funnelMeta={funnelMeta}
              funnelMatureOnly
              funnelMaturityDays={30}
            />
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);

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

const NOW = new Date('2026-08-15T12:00:00Z');

/** Місяць 'YYYY-MM' зі зміщенням від серпня 2026 */
const month = (offset: number) => new Date(Date.UTC(2026, 7 + offset, 1)).toISOString().slice(0, 7);

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

  if (url.includes('/api/keepincrm/ltv/clients')) return json(clients);
  if (url.includes('/api/keepincrm/ltv')) return json(snapshot);
  return realFetch(input as any, init);
}) as typeof window.fetch;

/** Контекст — лише те, що читає сама сторінка */
const ctx: any = {
  state: { rfmThresholds: DEFAULT_RFM_THRESHOLDS },
  hasEditRights: true,
  updateSettings: (u: any) => console.log('updateSettings', u),
};

// ── Дані для звіту, порахованy тим самим конвеєром, що й на сторінці ──────────
const monthRange: MonthRange = { from: month(-11), to: month(0) };
const period: PeriodValue = { key: 'custom', from: `${monthRange.from}-01`, to: `${monthRange.to}-28` };
const enriched = enrichClients(clients, NOW, DEFAULT_RFM_THRESHOLDS, monthRange);
const tiered = assignTiers(enriched);

function Preview() {
  const [tab, setTab] = useState<'page' | 'report'>('page');

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
            />
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);

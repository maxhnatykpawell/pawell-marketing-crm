/**
 * Пісочниця головної панелі: справжній DashboardView на вигаданих даних CRM.
 *
 * Головна тягне все з /api/keepincrm/*, тож без ключа й без входу вона порожня.
 * Тут fetch підмінений: «сервер» віддає 30 днів знімків, LTV і статус синхронізації.
 * `?sync=ltv` показує смугу активної синхронізації, `?sync=idle` (типово) — спокій.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { AppContext } from '../src/App';
import DashboardView from '../src/components/DashboardView';

const q = new URLSearchParams(location.search);
const sync = q.get('sync') ?? 'idle';

// `?static=1` — для знімків: анімація графіків recharts у безголовому браузері
// зависає на початку, тож кадри виконуємо з «майбутнім» часом, і лінії малюються одразу
if (q.get('static') === '1') {
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now() + 1e6), 0) as unknown as number;
}

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const SOURCES = ['Meta Ads', 'Google Ads', 'Рекомендації', 'Instagram', 'Сайт', 'Холодні дзвінки', 'Telegram'];
const WEIGHTS = [0.32, 0.22, 0.16, 0.12, 0.09, 0.06, 0.03];

const days = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10);
  const split = (n: number) => SOURCES.map((s, k) => ({ source: s, count: Math.round(n * WEIGHTS[k]) }));
  const tot = (xs: { count: number }[]) => xs.reduce((t, x) => t + x.count, 0);
  // Підсумки беремо як суму по джерелах — як і в справжніх знімках, де вони не розходяться
  const clientsToday = split(Math.round((18 + Math.floor(rnd() * 22)) * (0.25 + rnd() * 0.2)));
  const leadsToday = split(12 + Math.floor(rnd() * 16));
  const agreementsToday = split(4 + Math.floor(rnd() * 9)).map(x => ({
    source: x.source, count: x.count, totalSum: x.count * (16000 + Math.floor(rnd() * 9000)),
  }));
  const clients = tot(clientsToday);
  const acquired = clients + tot(leadsToday);
  return {
    date: d,
    totalAcquiredToday: acquired,
    totalClientsToday: clients,
    totalLeadsToday: tot(leadsToday),
    conversionRateToday: Math.round((clients / Math.max(1, acquired)) * 1000) / 10,
    clientsToday,
    leadsToday,
    totalAgreementsToday: tot(agreementsToday),
    totalAgreementsSumToday: agreementsToday.reduce((t, x) => t + x.totalSum, 0),
    agreementsToday,
    lastSyncedAt: new Date().toISOString(),
  };
});

const sum = (f: (e: any) => number) => days.reduce((s, e) => s + f(e), 0);
const countBy = (pick: (e: any) => any[]) =>
  SOURCES.map(s => ({
    source: s,
    count: days.reduce((t, e) => t + (pick(e).find((x: any) => x.source === s)?.count ?? 0), 0),
  }));

const clientsBySource = countBy(e => e.clientsToday);
const leadsBySource = countBy(e => e.leadsToday);
const aggregated = {
  totalAcquired: sum(e => e.totalAcquiredToday),
  totalLeads: sum(e => e.totalLeadsToday),
  totalClients: sum(e => e.totalClientsToday),
  totalAgreements: sum(e => e.totalAgreementsToday),
  totalAgreementsSum: sum(e => e.totalAgreementsSumToday),
  avgConversionRate: Math.round((sum(e => e.totalClientsToday) / sum(e => e.totalAcquiredToday)) * 1000) / 10,
  acquiredBySource: clientsBySource.map((s, i) => ({ ...s, count: s.count + leadsBySource[i].count })),
  leadsBySource,
  clientsBySource,
  agreementsBySource: SOURCES.map(s => ({
    source: s,
    count: days.reduce((t, e) => t + (e.agreementsToday.find((x: any) => x.source === s)?.count ?? 0), 0),
    totalSum: days.reduce((t, e) => t + (e.agreementsToday.find((x: any) => x.source === s)?.totalSum ?? 0), 0),
  })),
};

const comparison = {
  totalAcquired: 560, totalLeads: 400, totalClients: 160, avgConversionRate: 28.5,
  acquiredChange: 8.4, leadsChange: 5.1, clientsChange: 14.2, conversionChange: 5.3,
  agreementsChange: -6.8, agreementsSumChange: 3.2,
};

const ltvSnapshot = {
  ltv: 42300, uniqueClientsCount: 1840, totalLTVRevenue: 77_800_000,
  lastSyncedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
  cohortLtv: { rows: [], horizons: { 12: { ltv: 96000, cohorts: 7, clients: 612 } } },
};

const status = (): any => ({
  running: false, type: null, total: 0, done: 0, pct: 0, currentDate: '', startedAt: null, finishedAt: null, error: null,
  ltv: sync === 'ltv'
    ? { running: true, trigger: 'manual', range: { from: '2026-01-01', to: '2026-11-02' }, phase: 'Завантаження угод з CRM', done: 34, total: 80, pct: 43, startedAt: new Date(Date.now() - 95000).toISOString(), finishedAt: null, error: null }
    : { running: false, trigger: null, range: null, phase: '', done: 0, total: 0, pct: null, startedAt: null, finishedAt: null, error: null },
  today: false,
  rateLimitedUntil: sync === 'ltv' ? Date.now() + 20000 : null,
});

const json = (body: any) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const realFetch = window.fetch.bind(window);
window.fetch = ((input: any, init?: any) => {
  const url = String(typeof input === 'string' ? input : input.url);
  if (url.includes('/api/keepincrm/history')) {
    const p = new URL(url, location.origin).searchParams;
    return json({
      entries: days,
      period: { from: p.get('from') ?? days[0].date, to: p.get('to') ?? days[29].date },
      aggregated,
      comparison: p.get('compare') ? comparison : null,
    });
  }
  if (url.includes('/api/keepincrm/sync-status')) return json(status());
  if (url.includes('/api/keepincrm/ltv')) return json(ltvSnapshot);
  return realFetch(input, init);
}) as typeof fetch;

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString();
const todayYmd = new Date().toISOString().slice(0, 10);

const ctx: any = {
  state: {
    expenses: [
      { id: '1', amount: 210000, currency: 'UAH', category: 'Реклама', source: 'Meta Ads', date: todayYmd },
      { id: '2', amount: 2400, currency: 'USD', category: 'Реклама', source: 'Google Ads', date: todayYmd },
      { id: '3', amount: 95000, currency: 'UAH', category: 'Зарплата', date: todayYmd },
    ],
    currencyRates: { USD: 42, EUR: 49 },
    users: [],
    cards: [
      { id: 'c1', title: 'Підготувати креативи для чорної п’ятниці', deadline: iso(1) },
      { id: 'c2', title: 'Звіт по таргету', deadline: iso(2) },
    ],
    events: [{ id: 'e1', title: 'Вебінар для партнерів', startDate: iso(2), endDate: iso(2) }],
    contentPlans: [{ id: 'p1', focus: 'Кейс клієнта: +40% заявок', publishDate: iso(0) }],
  },
  currentUser: { role: 'admin', name: 'Тест' },
  canView: () => true,
  setActiveView: (v: string) => console.log('setActiveView', v),
  setActiveEventId: () => {},
};

createRoot(document.getElementById('root')!).render(
  <AppContext.Provider value={ctx}>
    <DashboardView />
  </AppContext.Provider>,
);

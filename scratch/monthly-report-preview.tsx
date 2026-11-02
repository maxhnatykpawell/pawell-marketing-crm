/**
 * Пісочниця друкованого місячного звіту на вигаданій базі.
 *
 * Документ існує в DOM лише під час друку, тож подивитись на верстку можна тільки
 * через друк. Тут він малюється одразу; `?partial=1` показує місяць, що триває,
 * `?bare=1` — звіт без витрат і CRM (найгірший випадок для порожніх розділів).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import MonthlyReportDoc from '../src/components/MonthlyReportDoc';
import {
  buildMonthlyReport, computeAcquisition, computeCoverage, computeMonthSpend, groupSources, monthProgress,
} from '../src/lib/monthlyReport';
import { ClientRecord } from '../src/lib/clientAnalytics';
import { DEFAULT_CURRENCY_RATES, COHORT_MATURITY_DAYS } from '../src/lib/cac';

const q = new URLSearchParams(location.search);
const partial = q.get('partial') === '1';
const bare = q.get('bare') === '1';

const MONTH = '2026-10';
const NOW = partial ? new Date('2026-10-20T10:00:00Z') : new Date('2026-11-02T10:00:00Z');
const months = Array.from({ length: 16 }, (_, i) => new Date(Date.UTC(2025, 6 + i, 1)).toISOString().slice(0, 7));

// Детермінований «випадковий» генератор, щоб прев'ю не стрибало між оновленнями
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const NAMES = ['ТОВ «Альфа Груп»', 'ФОП Коваленко І. П.', 'Студія «Лімон»', 'Мережа кав\'ярень Брю', 'Агро-Центр Південь',
  'ТОВ «Новий Шлях»', 'Клінік Плюс', 'Будівельна компанія Дніпро', 'Інтернет-магазин ЗелеМаркет', 'Школа англійської Lingua'];
const clients: ClientRecord[] = Array.from({ length: 90 }, (_, i) => {
  const start = Math.floor(rnd() * 14);
  const monthlyStats: Record<string, { revenue: number; deals: number }> = {};
  const monthlyPaid: Record<string, number> = {};
  for (let k = start; k < 16; k++) {
    if (rnd() < 0.45) {
      const deals = 1 + Math.floor(rnd() * 3);
      const revenue = Math.round((4000 + rnd() * 60000) * (i < 6 ? 4 : 1));
      monthlyStats[months[k]] = { revenue, deals };
      monthlyPaid[months[k]] = Math.round(revenue * (0.6 + rnd() * 0.4));
    }
  }
  const revenue = Object.values(monthlyStats).reduce((s, x) => s + x.revenue, 0);
  const agreementsCount = Object.values(monthlyStats).reduce((s, x) => s + x.deals, 0);
  return { id: String(i), name: i < NAMES.length ? NAMES[i] : `Клієнт №${i + 1} · ТОВ «Дуже довга назва компанії»`, revenue, agreementsCount, tags: [], monthlyStats, monthlyPaid };
});

const report = buildMonthlyReport(clients, MONTH, { trendMonths: 12, topLimit: 100 });

const input = (k: number) => ({
  totalAcquired: 120 * k, totalLeads: 80 * k, totalClients: 40 * k, totalAgreements: 55, totalAgreementsSum: 1_450_000,
  acquiredBySource: [{ source: 'Meta Ads', count: 50 }, { source: 'Google Ads', count: 30 }, { source: 'Рекомендації', count: 20 }, { source: 'Instagram', count: 12 }, { source: 'Сайт', count: 8 }, { source: 'Холодні дзвінки', count: 6 }, { source: 'Telegram', count: 4 }].map(s => ({ ...s, count: s.count * k })),
  clientsBySource: [{ source: 'Meta Ads', count: 14 }, { source: 'Google Ads', count: 9 }, { source: 'Рекомендації', count: 10 }, { source: 'Instagram', count: 3 }, { source: 'Сайт', count: 2 }, { source: 'Холодні дзвінки', count: 1 }, { source: 'Telegram', count: 1 }].map(s => ({ ...s, count: s.count * k })),
  agreementsBySource: [{ source: 'meta_ads', count: 18, totalSum: 520000 }, { source: 'Google Ads', count: 12, totalSum: 340000 }, { source: 'Рекомендації', count: 11, totalSum: 300000 }, { source: 'Instagram', count: 6, totalSum: 120000 }, { source: 'Сайт', count: 4, totalSum: 90000 }, { source: 'Холодні дзвінки', count: 3, totalSum: 50000 }, { source: 'Telegram', count: 1, totalSum: 30000 }],
});

const acquisition = bare ? null : computeAcquisition(input(1), input(0.9), MONTH, { maturityDays: COHORT_MATURITY_DAYS, now: NOW });
const expenses = [
  ...['2026-09', '2026-10'].flatMap(m => [
    { amount: m === '2026-10' ? 180000 : 150000, currency: 'UAH', category: 'Реклама', source: 'Meta Ads', date: `${m}-10` },
    { amount: 1500, currency: 'USD', category: 'Реклама', source: 'Google Ads', date: `${m}-12` },
    { amount: 90000, currency: 'UAH', category: 'Зарплата', date: `${m}-05` },
    { amount: 24000, currency: 'UAH', category: 'Підрядники', date: `${m}-18` },
    { amount: 8000, currency: 'UAH', category: 'Сервіси', date: `${m}-21` },
  ]),
];
const spend = bare ? null : computeMonthSpend(expenses, MONTH, {
  newClients: acquisition!.mqa, prevNewClients: acquisition!.prevMqa, acquired: acquisition!.acquired,
  revenue: report.totals.revenue, ltv: 96000, ltvBasis: 'LTV 12 міс', clientsBySource: input(1).clientsBySource,
}, DEFAULT_CURRENCY_RATES);

const days = Array.from({ length: 31 }, (_, i) => ({ date: `${MONTH}-${String(i + 1).padStart(2, '0')}` }));
const coverage = bare ? null : computeCoverage(MONTH, q.get('gaps') === '1' ? days.filter((_, i) => i % 5 !== 0) : days, NOW);
const progress = monthProgress(MONTH, NOW);

createRoot(document.getElementById('root')!).render(
  <MonthlyReportDoc
    report={report}
    spend={spend}
    acquisition={acquisition}
    coverage={coverage}
    sources={acquisition ? groupSources(acquisition.sources, 5) : []}
    progress={progress}
  />,
);

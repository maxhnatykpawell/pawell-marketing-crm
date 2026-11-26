/**
 * Пісочниця «Розширеної аналітики»: справжній AnalyticsView, але «сервер» — підміна
 * fetch у пам'яті. Нічого не пишеться в базу й не йде в KeepInCRM.
 * Запуск: npx vite --port 5199 → http://localhost:5199/scratch/analytics-preview.html
 */
import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { AppContext } from '../src/App';
import AnalyticsView from '../src/components/AnalyticsView';

const now = new Date();
const mk = (back: number) => { const d = new Date(now.getFullYear(), now.getMonth() - back, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const names = ['Аеропорт Бориспіль', 'Укрзалізниця', 'Нова пошта', 'Метінвест', 'Київстар', 'Епіцентр', 'Сільпо', 'Ощадбанк', 'Фоззі', 'ЕКО Маркет', 'Таврія В', 'АТБ', 'Roshen', 'МХП', 'Нафтогаз', 'Укрнафта', 'ДТЕК', 'Фокстрот', 'Comfy', 'Rozetka'];

const clients = Array.from({ length: 90 }, (_, i) => {
  const monthly: Record<string, { revenue: number; deals: number }> = {};
  const n = i < 5 ? 12 : i < 25 ? 5 : i < 55 ? 2 : 1;
  for (let k = 0; k < n; k++) monthly[mk(k * (i < 5 ? 1 : 2) + (i % 3))] = { revenue: Math.round((900 - i * 9) * 1000 * (0.6 + ((i * 7 + k) % 5) / 8)), deals: 1 + (k % 2) };
  const revenue = Object.values(monthly).reduce((s, m) => s + m.revenue, 0);
  const months = Object.keys(monthly).sort();
  return {
    id: 'c' + i, name: (names[i % names.length]) + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ''),
    revenue, agreementsCount: Object.values(monthly).reduce((s, m) => s + m.deals, 0),
    tags: i % 3 === 0 ? ['B2B', 'Тендер'] : i % 5 === 0 ? ['Дистриб’ютор'] : ['B2B'],
    lastPurchaseDate: months[months.length - 1] + '-15T00:00:00.000Z', monthlyStats: monthly,
  };
});

const snapshot = {
  totalLTVRevenue: clients.reduce((s, c) => s + c.revenue, 0), uniqueClientsCount: clients.length, ltv: 1_200_000,
  stageStats: [{ stage: 'Переговори', count: 12, avgOpenDays: 21, avgCycleDays: 0 }, { stage: 'Виграно', count: 40, avgOpenDays: 0, avgCycleDays: 34 }],
  cohortLtv: { rows: [], horizons: {} }, lastSyncedAt: new Date().toISOString(),
};

const users = [{ id: 'u1', name: 'Максим Гнатик', avatar: '' }];
const realFetch = window.fetch.bind(window);
window.fetch = async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (!url.startsWith('/api/')) return realFetch(input, init);
  await new Promise(r => setTimeout(r, 120));
  if (url.startsWith('/api/keepincrm/ltv/clients')) return json(clients);
  if (url.startsWith('/api/keepincrm/ltv')) return json(snapshot);
  if (url.startsWith('/api/client-power')) return json({ items: {
    c0: { potentialUah: 30_000_000, contractSize: 'large', contacts: 7, fullAccount: true },
    c1: { potentialUah: 9_000_000, contractSize: 'medium', contacts: 4 },
  } });
  return json({}, 404);
};

function Preview() {
  const ctx: any = useMemo(() => new Proxy({
    state: { users, cards: [], rfmThresholds: undefined }, currentUser: { userId: 'u1', role: 'admin', name: 'Максим' }, hasEditRights: true,
    updateSettings: () => {},
  }, { get: (t: any, k: string) => (k in t ? t[k] : () => {}) }), []);
  return <AppContext.Provider value={ctx}><AnalyticsView /></AppContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Preview />);

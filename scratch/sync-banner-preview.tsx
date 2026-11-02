/** Пісочниця індикатора синхронізації: усі стани один під одним */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import SyncActivityBanner from '../src/components/SyncActivityBanner';
import type { KeepInCRMSyncStatus } from '../src/api';

const base = (): KeepInCRMSyncStatus => ({
  running: false, type: null, total: 0, done: 0, pct: 0, currentDate: '', startedAt: null, finishedAt: null, error: null,
  ltv: { running: false, trigger: null, range: null, phase: '', done: 0, total: 0, pct: null, startedAt: null, finishedAt: null, error: null },
  today: false, rateLimitedUntil: null, startupLtv: null,
});
const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();

const cases: [string, KeepInCRMSyncStatus, string | null][] = [
  ['Спокій', base(), '2026-11-02T01:00:00Z'],
  ['Спокій, але минулий розрахунок упав', { ...base(), ltv: { ...base().ltv, error: 'KeepInCRM /agreements [500]' } }, null],
  ['LTV: завантаження угод (вручну, за рік)', { ...base(), ltv: { ...base().ltv, running: true, trigger: 'manual', range: { from: '2026-01-01', to: '2026-11-02' }, phase: 'Завантаження угод з CRM', done: 34, total: 80, pct: 43, startedAt: ago(95) } }, null],
  ['LTV: збереження (нічний)', { ...base(), ltv: { ...base().ltv, running: true, trigger: 'cron', phase: 'Розрахунок і збереження', done: 80, total: 80, pct: null, startedAt: ago(410) } }, null],
  ['LTV + пауза через ліміт', { ...base(), rateLimitedUntil: Date.now() + 24000, ltv: { ...base().ltv, running: true, trigger: 'manual', phase: 'Завантаження угод з CRM', done: 12, total: 80, pct: 15, startedAt: ago(30) } }, null],
  ['Нічний перерахунок когорт + сьогодні', { ...base(), running: true, type: 'cohort', done: 11, total: 30, pct: 37, currentDate: '2026-10-14', today: true }, null],
];

createRoot(document.getElementById('root')!).render(
  <div className="max-w-4xl mx-auto p-6 space-y-6 bg-gray-100">
    {cases.map(([title, status, last]) => (
      <div key={title}>
        <p className="text-xs font-bold text-gray-500 mb-1">{title}</p>
        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden">
          <SyncActivityBanner status={status} lastLtvAt={last} />
        </div>
      </div>
    ))}
  </div>,
);

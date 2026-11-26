/**
 * Пісочниця тірування Pawell Power: картка-зведення та діалог оцінки на вигаданих клієнтах.
 * Запуск: npx vite --port 5199 → http://localhost:5199/scratch/power-preview.html (?dialog — відкрити оцінку)
 */
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import ClientPowerCard from '../src/components/analytics/ClientPowerCard';
import ClientPowerDialog from '../src/components/analytics/ClientPowerDialog';
import { addMonths, buildPowerContext, computeAllPower, monthKey, summarizePower, type ClientPowerInput } from '../src/lib/clientPower';
import type { PowerFocus } from '../src/lib/analyticsViewState';
import type { ClientRecord } from '../src/lib/clientAnalytics';

const now = new Date();
const cur = monthKey(now);
const clients: ClientRecord[] = Array.from({ length: 40 }, (_, i) => {
  const monthly: Record<string, { revenue: number; deals: number }> = {};
  const n = i < 4 ? 12 : i < 14 ? 4 : 1;
  for (let k = 0; k < n; k++) monthly[addMonths(cur, -k * (i < 4 ? 1 : 2))] = { revenue: (400 - i * 9) * 1000, deals: 1 };
  const revenue = Object.values(monthly).reduce((s, m) => s + m.revenue, 0);
  return { id: 'c' + i, name: `Клієнт ${i + 1}`, revenue, agreementsCount: n, tags: [], monthlyStats: monthly };
});

function Preview() {
  const [inputs, setInputs] = useState<Record<string, ClientPowerInput>>({
    c0: { potentialUah: 9_000_000, contractSize: 'large', contacts: 7, fullAccount: true },
    c1: { potentialUah: 3_000_000, contractSize: 'medium', contacts: 3 },
    c2: { potentialUah: 200_000, contractSize: 'small', contacts: 2 },
  });
  const [focus, setFocus] = useState<PowerFocus | null>(null);
  const [open, setOpen] = useState(location.search.includes('dialog'));
  const ctx = useMemo(() => buildPowerContext(clients), []);
  const power = useMemo(() => computeAllPower(clients, inputs), [inputs]);
  const summary = useMemo(() => summarizePower(clients.map(c => ({ periodRevenue: c.revenue, power: power.get(c.id) }))), [power]);

  return (
    <>
      <ClientPowerCard summary={summary} focus={focus} onFocus={setFocus} />
      {open && (
        <ClientPowerDialog
          client={clients[0]} ctx={ctx} initial={inputs.c0 ?? {}}
          meta={{ updatedAt: new Date().toISOString(), updatedBy: 'Олег' }}
          onClose={() => setOpen(false)}
          onSave={async i => { setInputs(p => ({ ...p, c0: i })); }}
        />
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);

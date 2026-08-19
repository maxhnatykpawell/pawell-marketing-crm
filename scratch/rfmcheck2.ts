import { enrichClients, applyFilters, countByRfm, EMPTY_FILTERS, DEFAULT_RFM_THRESHOLDS, assignTiers } from '../src/lib/clientAnalytics';

const now = new Date('2026-08-18');

// Клієнт зі щомісячною статистикою: купував давно, у 2025-01..2025-03
const sleeper = (id: string) => ({
  id, name: 'sleep-' + id, revenue: 3000, agreementsCount: 3,
  lastPurchaseDate: '2025-03-15T00:00:00.000Z',   // ~520 днів тому -> Сплячий
  tags: [] as string[],
  monthlyStats: { '2025-01': { revenue: 1000, deals: 1 }, '2025-03': { revenue: 2000, deals: 2 } },
});
const fresh = (id: string) => ({
  id, name: 'fresh-' + id, revenue: 4000, agreementsCount: 4,
  lastPurchaseDate: '2026-08-01T00:00:00.000Z',
  tags: [] as string[],
  monthlyStats: { '2026-07': { revenue: 2000, deals: 2 }, '2026-08': { revenue: 2000, deals: 2 } },
});

const clients: any[] = [sleeper('a'), sleeper('b'), sleeper('c'), fresh('d')];

const scenarios: { name: string; period: any }[] = [
  { name: 'за весь час', period: null },
  { name: 'період 2026-01..2026-08 (сплячі поза періодом)', period: { from: '2026-01', to: '2026-08' } },
  { name: 'період 2025-01..2025-12 (сплячі в періоді)', period: { from: '2025-01', to: '2025-12' } },
];

for (const s of scenarios) {
  const enr = enrichClients(clients, now, DEFAULT_RFM_THRESHOLDS, s.period);
  const badge = countByRfm(enr.filter(c => c.inPeriod));
  const rows = applyFilters(enr, { ...EMPTY_FILTERS, rfm: ['Сплячий'] as any });
  const tiered = assignTiers(rows);
  console.log(`\n--- ${s.name} ---`);
  enr.forEach(c => console.log(`  ${c.id}\tinPeriod=${c.inPeriod}\tperiodDeals=${c.periodDeals}\trecency=${c.recencyDays}\t${c.rfm.label}`));
  console.log(`  бейдж Сплячий = ${badge['Сплячий'] ?? 0}`);
  console.log(`  таблиця (rfm=Сплячий) = ${rows.length}, після assignTiers = ${tiered.clients.length}`);
  console.log(`  збіг: ${(badge['Сплячий'] ?? 0) === tiered.clients.length ? 'ok' : '❌ РОЗБІЖНІСТЬ'}`);
}

// Знімок СТАРОГО формату — без monthlyStats
console.log('\n\n=== старий формат знімка (без monthlyStats) ===');
const legacy: any[] = [
  { id: 'L1', name: 'L1', revenue: 3000, agreementsCount: 3, lastPurchaseDate: '2025-03-15T00:00:00.000Z', tags: [] },
  { id: 'L2', name: 'L2', revenue: 3000, agreementsCount: 3, lastPurchaseDate: '2025-03-15T00:00:00.000Z', tags: [] },
];
for (const s of scenarios) {
  const enr = enrichClients(legacy, now, DEFAULT_RFM_THRESHOLDS, s.period);
  const badge = countByRfm(enr.filter(c => c.inPeriod));
  const rows = applyFilters(enr, { ...EMPTY_FILTERS, rfm: ['Сплячий'] as any });
  console.log(`${s.name}: бейдж=${badge['Сплячий'] ?? 0} таблиця=${rows.length}  ${(badge['Сплячий'] ?? 0) === rows.length ? 'ok' : '❌'}`);
  enr.forEach(c => console.log(`   ${c.id} inPeriod=${c.inPeriod} periodDeals=${c.periodDeals} cohort=${c.cohortMonth} seg=${c.rfm.label}`));
}

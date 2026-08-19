import { enrichClients, applyFilters, countByRfm, EMPTY_FILTERS, DEFAULT_RFM_THRESHOLDS, assignTiers } from '../src/lib/clientAnalytics';

const now = new Date('2026-08-18');
const mk = (id: string, deals: number, daysAgo: number, months: string[]) => ({
  id, name: id, revenue: 1000 * deals, agreementsCount: deals,
  lastPurchaseDate: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
  tags: [] as string[], purchaseMonths: months,
});

const clients: any[] = [
  mk('sleep1', 3, 400, ['2025-01', '2025-05', '2025-07']),
  mk('sleep2', 2, 300, ['2025-06', '2025-10']),
  mk('sleep3', 5, 900, ['2024-01', '2024-03']),
  mk('champ',  4,  10, ['2026-05', '2026-08']),
  mk('newbie', 1,  10, ['2026-08']),
];

const enr = enrichClients(clients, now, DEFAULT_RFM_THRESHOLDS, null);
const badge = countByRfm(enr.filter(c => c.inPeriod));

console.log('клієнт\tсегмент\tcustomerKind');
enr.forEach(c => console.log(`${c.id}\t${c.rfm.label}\t${c.customerKind}`));

console.log(`\nбейдж «Сплячий» = ${badge['Сплячий']}`);

const rows = applyFilters(enr, { ...EMPTY_FILTERS, rfm: ['Сплячий'] as any });
const tiered = assignTiers(rows);

for (const kindFocus of [null, 'new', 'returning'] as const) {
  for (const tierFocus of [null, 1, 4] as const) {
    const tierSel = tierFocus === null ? tiered.clients : tiered.clients.filter(c => c.tier === tierFocus);
    const sel = kindFocus === null ? tierSel : tierSel.filter(c => c.customerKind === kindFocus);
    console.log(`kindFocus=${kindFocus ?? '—'}\ttierFocus=${tierFocus ?? '—'}\t-> у таблиці ${sel.length} (бейдж каже ${badge['Сплячий']})`);
  }
}

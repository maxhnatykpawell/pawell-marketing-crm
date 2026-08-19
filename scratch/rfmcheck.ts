import { RFM_LABELS, RFM_STYLES, RFM_RULES, enrichClients, applyFilters, countByRfm, EMPTY_FILTERS, DEFAULT_RFM_THRESHOLDS } from '../src/lib/clientAnalytics';

const cp = (s: string) => [...s].map(c => c.codePointAt(0)!.toString(16)).join(' ');

console.log('=== RFM_LABELS (звідки беруться значення фільтра) ===');
for (const l of RFM_LABELS) console.log(`"${l}"  len=${l.length}  ${cp(l)}`);

console.log('\n=== ключі RFM_STYLES (звідки береться c.rfm.label) ===');
for (const k of Object.keys(RFM_STYLES)) console.log(`"${k}"  len=${k.length}  ${cp(k)}  -> .label="${RFM_STYLES[k].label}" ${cp(RFM_STYLES[k].label)}`);

console.log('\n=== RFM_RULES.label (звідки бейдж бере counts[...]) ===');
for (const r of RFM_RULES) console.log(`"${r.label}"  len=${r.label.length}  ${cp(r.label)}`);

console.log('\n=== чи знайде фільтр кожну мітку ===');
for (const l of RFM_LABELS) {
  const styleLabel = RFM_STYLES[l as string]?.label;
  console.log(`${l}: RFM_STYLES[label] існує=${!!styleLabel}, збіг=${styleLabel === l}`);
}
for (const r of RFM_RULES) {
  const inLabels = (RFM_LABELS as readonly string[]).includes(r.label);
  console.log(`RULE "${r.label}": є в RFM_LABELS=${inLabels}`);
}

// ── наскрізна перевірка на синтетичних даних ────────────────────────────────
const now = new Date('2026-08-18');
const mk = (id: string, deals: number, daysAgo: number) => ({
  id, name: 'c' + id, revenue: 1000 * deals, agreementsCount: deals,
  lastPurchaseDate: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
  tags: [] as string[],
});

const clients: any[] = [
  mk('sleep1', 3, 400), mk('sleep2', 2, 300), mk('sleep3', 5, 900),
  mk('champ', 4, 10), mk('risk', 1, 400), mk('new', 1, 10),
];

const enr = enrichClients(clients, now, DEFAULT_RFM_THRESHOLDS, null);
console.log('\n=== сегменти на синтетичних даних ===');
enr.forEach(c => console.log(`${c.id}\tdeals=${c.agreementsCount}\trecency=${c.recencyDays}\t-> ${c.rfm.label}`));

const counts = countByRfm(enr.filter(c => c.inPeriod));
console.log('\nбейдж каже Сплячий =', counts['Сплячий']);

for (const label of RFM_LABELS) {
  const rows = applyFilters(enr, { ...EMPTY_FILTERS, rfm: [label] as any });
  const badge = counts[label] ?? 0;
  const flag = rows.length === badge ? 'ok' : '❌ РОЗБІЖНІСТЬ';
  console.log(`фільтр "${label}": таблиця=${rows.length}  бейдж=${badge}  ${flag}`);
}

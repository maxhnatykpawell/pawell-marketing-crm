import {
  enrichClients, applyFilters, sortClients, collectTags, collectCohortMonths,
  computeDistribution, clientsToCsv, countActiveFilters, recencyBucket,
  EMPTY_FILTERS, ClientRecord, ClientFilters, chunkList,
} from './clientAnalytics';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

const NOW = new Date('2026-08-10T12:00:00Z');
const f = (over: Partial<ClientFilters> = {}): ClientFilters => ({ ...EMPTY_FILTERS, ...over });

const client = (over: Partial<ClientRecord> & { id: string }): ClientRecord => ({
  name: `Клієнт ${over.id}`, revenue: 0, agreementsCount: 0, tags: [], ...over,
});

console.log('\nЗбагачення');
{
  const [c] = enrichClients([client({
    id: 'a', revenue: 900, agreementsCount: 3,
    lastPurchaseDate: '2026-08-01', purchaseMonths: ['2026-05', '2026-03', '2026-08'],
  })], NOW);

  check('середній чек', c.avgCheck, 300);
  check('давність у днях', c.recencyDays, 9);
  check('когорта — найраніший місяць', c.cohortMonth, '2026-03');
  check('RFM: 3 угоди + свіжа покупка = Чемпіон', c.rfm.label, 'Чемпіон');
}
{
  const [c] = enrichClients([client({ id: 'b', revenue: 100, agreementsCount: 1 })], NOW);
  check('без дати покупки давність null', c.recencyDays, null);
  check('без покупок когорта null', c.cohortMonth, null);
  check('нуль угод не ділить на нуль', enrichClients([client({ id: 'z', revenue: 50 })], NOW)[0].avgCheck, 0);
}
{
  const rfm = (deals: number, date: string) =>
    enrichClients([client({ id: 'x', agreementsCount: deals, lastPurchaseDate: date })], NOW)[0].rfm.label;

  check('1 угода давно = Зона ризику', rfm(1, '2025-01-01'), 'Зона ризику');
  check('1 угода щойно = Новий',       rfm(1, '2026-08-01'), 'Новий');
  check('2 угоди давно = Сплячий',     rfm(2, '2024-01-01'), 'Сплячий');
  check('2 угоди недавно = Лояльний',  rfm(2, '2026-06-01'), 'Лояльний');
}

console.log('\nФільтри');
{
  const data = enrichClients([
    client({ id: '1', name: 'Альфа', revenue: 1000, agreementsCount: 2, tags: ['Дилер'],           lastPurchaseDate: '2026-08-05', purchaseMonths: ['2026-01'] }),
    client({ id: '2', name: 'Бета',  revenue: 5000, agreementsCount: 1, tags: ['Роздріб', 'Тест'], lastPurchaseDate: '2025-01-01', purchaseMonths: ['2025-01'] }),
    client({ id: '3', name: 'Гама',  revenue: 200,  agreementsCount: 4, tags: ['Дилер', 'Тест'],   lastPurchaseDate: '2026-08-09', purchaseMonths: ['2026-01'] }),
  ], NOW);

  const ids = (fl: ClientFilters) => applyFilters(data, fl).map(c => c.id);

  check('без фільтрів — усі', ids(f()), ['1', '2', '3']);
  check('include: будь-який із тегів', ids(f({ tagsInclude: ['Дилер'] })), ['1', '3']);
  check('exclude виграє над include', ids(f({ tagsInclude: ['Дилер'], tagsExclude: ['Тест'] })), ['1']);
  check('дохід від', ids(f({ revenueMin: 900 })), ['1', '2']);
  check('дохід від-до', ids(f({ revenueMin: 900, revenueMax: 2000 })), ['1']);
  check('кількість угод', ids(f({ dealsMin: 2 })), ['1', '3']);
  check('середній чек', ids(f({ avgCheckMin: 1000 })), ['2']);
  check('давність', ids(f({ recency: ['lt30'] })), ['1', '3']);
  check('когорта', ids(f({ cohortMonth: '2025-01' })), ['2']);
  check('пошук по назві без регістру', ids(f({ search: 'бет' })), ['2']);
  check('фільтри комбінуються', ids(f({ tagsInclude: ['Дилер'], recency: ['lt30'], dealsMin: 3 })), ['3']);
  check('нічого не підходить', ids(f({ revenueMin: 99999 })), []);
}

console.log('\nЛічильник активних фільтрів');
{
  check('порожні = 0', countActiveFilters(EMPTY_FILTERS), 0);
  check('діапазон рахується як один', countActiveFilters(f({ revenueMin: 1, revenueMax: 2 })), 1);
  check('пробіли в пошуку не рахуються', countActiveFilters(f({ search: '   ' })), 0);
  check('кілька груп', countActiveFilters(f({ tagsInclude: ['a'], rfm: ['Новий'], cohortMonth: '2026-01' })), 3);
}

console.log('\nМежі кошиків давності');
{
  check('29 днів', recencyBucket(29), 'lt30');
  check('30 днів', recencyBucket(30), '30_90');
  check('90 днів', recencyBucket(90), '90_180');
  check('180 днів', recencyBucket(180), '90_180');
  check('181 день', recencyBucket(181), 'gt180');
  check('null', recencyBucket(null), 'never');
}

console.log('\nСортування');
{
  const data = enrichClients([
    client({ id: 'a', name: 'Бета',  revenue: 100, agreementsCount: 1, lastPurchaseDate: '2026-08-01', purchaseMonths: ['2026-02'] }),
    client({ id: 'b', name: 'Альфа', revenue: 300, agreementsCount: 3, lastPurchaseDate: '2026-06-01', purchaseMonths: ['2026-01'] }),
    client({ id: 'c', name: 'Гама',  revenue: 200, agreementsCount: 2 }),
  ], NOW);

  const ids = (k: any, d: any) => sortClients(data, k, d).map(c => c.id);

  check('дохід спадання', ids('revenue', 'desc'), ['b', 'c', 'a']);
  check('дохід зростання', ids('revenue', 'asc'), ['a', 'c', 'b']);
  check('назва за алфавітом', ids('name', 'asc'), ['b', 'a', 'c']);
  check('давність: свіжіші перші', ids('recency', 'asc'), ['a', 'b', 'c']);
  check('давність: без дати завжди в кінці', ids('recency', 'desc')[2], 'c');
  check('когорта: без когорти в кінці', ids('cohort', 'asc'), ['b', 'a', 'c']);
  check('вхідний масив не мутується', data.map(c => c.id), ['a', 'b', 'c']);
}

console.log('\nДовідники');
{
  const raw = [
    client({ id: '1', tags: ['Дилер', 'Дилер', 'Тест'] }),
    client({ id: '2', tags: ['Дилер'] }),
  ];
  check('дубльований тег у клієнта рахується раз', collectTags(raw), [{ tag: 'Дилер', count: 2 }, { tag: 'Тест', count: 1 }]);

  const enr = enrichClients([
    client({ id: '1', purchaseMonths: ['2026-01'] }),
    client({ id: '2', purchaseMonths: ['2026-03'] }),
    client({ id: '3', purchaseMonths: ['2026-01'] }),
  ], NOW);
  check('когорти від найновішої', collectCohortMonths(enr), [{ month: '2026-03', count: 1 }, { month: '2026-01', count: 2 }]);
}

console.log('\nРозподіл доходу');
{
  const even = enrichClients([100, 100, 100, 100].map((r, i) => client({ id: String(i), revenue: r })), NOW);
  const d1 = computeDistribution(even);
  check('рівний розподіл: середнє = медіана', [d1.mean, d1.median], [100, 100]);

  const skewed = enrichClients([0, 0, 0, 0, 0, 0, 0, 0, 0, 1000].map((r, i) => client({ id: String(i), revenue: r })), NOW);
  const d2 = computeDistribution(skewed);
  check('перекошений: медіана 0', d2.median, 0);
  check('перекошений: топ-10% дають усе', d2.top10Share, 100);
  check('сума збігається', d2.total, 1000);

  const empty = computeDistribution([]);
  check('порожня вибірка не падає', [empty.count, empty.mean, empty.top10Share], [0, 0, 0]);
}

console.log('\nCSV');
{
  const rows = enrichClients([
    client({ id: '1', name: 'ТОВ "Альфа"; філія', revenue: 100, agreementsCount: 2, tags: ['Дилер'] }),
  ], NOW);
  const csv = clientsToCsv(rows);
  const dataLine = csv.split('\r\n')[1];

  check('лапки й крапка з комою екрануються', dataLine.startsWith('"ТОВ ""Альфа""; філія"'), true);
  check('роздільник — крапка з комою', csv.split('\r\n')[0].split(';')[1], 'Дохід');
}

console.log('\nРозбиття на частини');
{
  const n = (count: number) => Array.from({ length: count }, (_, i) => i);

  check('порожній список — жодної частини', chunkList([], 100), []);
  check('менше за розмір — одна частина', chunkList(n(3), 100).map(c => c.length), [3]);
  check('рівно розмір — одна частина', chunkList(n(100), 100).map(c => c.length), [100]);
  check('на один більше — дві частини', chunkList(n(101), 100).map(c => c.length), [100, 1]);
  check('кілька повних', chunkList(n(250), 100).map(c => c.length), [100, 100, 50]);
  check('порядок зберігається', chunkList(n(5), 2).flat(), [0, 1, 2, 3, 4]);
  check('нульовий розмір відхиляється', (() => {
    try { chunkList(n(5), 0); return 'не кинуло'; } catch { return 'кинуло'; }
  })(), 'кинуло');

  // Прибирання застарілих документів спирається на кількість частин: якщо база
  // схудла, документи з індексом >= chunks.length мають піти.
  const before = chunkList(n(2500), 1000).length;   // 3 частини: 0,1,2
  const after  = chunkList(n(500), 1000).length;    // 1 частина: 0
  check('старих індексів на видалення', [before, after, [1, 2].every(i => i >= after)], [3, 1, true]);
  check('порожня база прибирає всі частини', chunkList([], 1000).length, 0);
}

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

import {
  enrichClients, applyFilters, sortClients, collectTags, collectCohortMonths,
  computeDistribution, assignTiers, clientsToCsv, countActiveFilters, recencyBucket,
  EMPTY_FILTERS, ClientRecord, ClientFilters, chunkList, chunkBySize, getPurchaseMonths,
  classifyCustomer, computeCustomerMix,
  checkRfmThresholds, sanitizeRfmThresholds, countByRfm, DEFAULT_RFM_THRESHOLDS,
  calculateCohorts,
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

  const ten = enrichClients(
    [10, 20, 30, 40, 50, 60, 70, 80, 90, 1000].map((r, i) => client({ id: String(i), revenue: r })),
    NOW,
  );
  const d3 = computeDistribution(ten);
  check('топ-10 %: скільки клієнтів', d3.top10Count, 1);
  check('топ-10 %: поріг входу', d3.top10Threshold, 1000);

  const twenty = enrichClients(
    Array.from({ length: 20 }, (_, i) => client({ id: String(i), revenue: (i + 1) * 100 })),
    NOW,
  );
  const d4 = computeDistribution(twenty);
  check('20 клієнтів → у топ-10 % двоє', d4.top10Count, 2);
  check('поріг = дохід меншого з двох', d4.top10Threshold, 1900);
}

console.log('\nТіри');
{
  const mk = (revenues: number[]) =>
    enrichClients(revenues.map((r, i) => client({ id: String(i), revenue: r })), NOW);

  const t = assignTiers(mk(Array.from({ length: 10 }, (_, i) => (i + 1) * 100)));
  check('10 платників: розміри тірів', t.stats.map(s => s.count), [1, 2, 3, 4]);
  check('тіри за спаданням доходу', t.stats.map(s => s.tier), [1, 2, 3, 4]);
  check('Tier 1 — найбільший клієнт', t.stats[0].maxRevenue, 1000);
  check('поріг входу в Tier 1', t.stats[0].minRevenue, 1000);
  check('частки доходу сумуються в 100', t.stats.reduce((s, x) => s + x.revenueShare, 0), 100);
  check('усі платники ранжовані', t.rankedCount, 10);
  check('без доходу нікого немає', t.zeroRevenueCount, 0);

  const zeros = assignTiers(mk([0, 0, 0, 0, 0, 0, 0, 0, 0, 1000]));
  check('нульові клієнти поза тірами', zeros.zeroRevenueCount, 9);
  check('ранжується лише платник', zeros.rankedCount, 1);
  check('єдиний платник — Tier 1', zeros.stats.map(s => [s.tier, s.count]), [[1, 1]]);
  check(
    'нульовим тір не присвоєно',
    zeros.clients.filter(c => c.tier === null).length,
    9,
  );

  const noEarners = assignTiers(mk([0, 0, 0]));
  check('без платників тірів немає', [noEarners.stats.length, noEarners.rankedCount], [0, 0]);

  // Однакові суми не можна розкладати в різні тіри: межа зсувається вниз
  const ties = assignTiers(mk([500, 500, 500, 500, 500, 500, 500, 500, 500, 500]));
  check('десять однакових сум — усі в Tier 1', ties.stats.map(s => [s.tier, s.count]), [[1, 10]]);

  check('порядок вхідного списку збережено',
    assignTiers(mk([100, 900, 500])).clients.map(c => c.periodRevenue), [100, 900, 500]);

  check('порожній вхід не падає',
    [assignTiers([]).rankedCount, assignTiers([]).stats.length], [0, 0]);
}

console.log('\nCSV');
{
  const rows = enrichClients([
    client({ id: '1', name: 'ТОВ "Альфа"; філія', revenue: 100, agreementsCount: 2, tags: ['Дилер'] }),
  ], NOW);
  const csv = clientsToCsv(rows);
  const dataLine = csv.split('\r\n')[1];

  check('лапки й крапка з комою екрануються', dataLine.startsWith('"ТОВ ""Альфа""; філія"'), true);
  check('роздільник — крапка з комою', csv.split('\r\n')[0].split(';')[1], 'Tier');
  check('є і періодні, і загальні числа', csv.split('\r\n')[0].split(';').slice(2, 7),
    ['Дохід за період', 'Угод за період', 'Середній чек', 'Дохід за весь час', 'Угод за весь час']);
  // Окремий рядок без лапок і крапки з комою — щоб split(';') бив по колонках
  const plain = enrichClients([client({ id: '2', name: 'Бета', revenue: 100 })], NOW);
  check('без тіру колонка порожня', clientsToCsv(plain).split('\r\n')[1].split(';')[1], '');
  check('тір потрапляє в CSV',
    clientsToCsv(assignTiers(plain).clients).split('\r\n')[1].split(';')[1], 'Tier 1');
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

console.log('\nПеріод аналітики');
{
  const c = (id: string, stats: Record<string, [number, number]>): ClientRecord => ({
    id, name: `Клієнт ${id}`,
    revenue: Object.values(stats).reduce((s, [r]) => s + r, 0),
    agreementsCount: Object.values(stats).reduce((s, [, d]) => s + d, 0),
    tags: [], lastPurchaseDate: '2026-08-01',
    monthlyStats: Object.fromEntries(Object.entries(stats).map(([m, [revenue, deals]]) => [m, { revenue, deals }])),
  });

  const data = [
    c('1', { '2025-06': [1000, 2], '2026-03': [500, 1] }),
    c('2', { '2026-03': [300, 3] }),
    c('3', { '2024-01': [9000, 5] }),
  ];

  const all = enrichClients(data, NOW);
  check('без періоду — суми за весь час', all.map(x => x.periodRevenue), [1500, 300, 9000]);
  check('без періоду всі в вибірці', all.map(x => x.inPeriod), [true, true, true]);

  const q1 = enrichClients(data, NOW, undefined, { from: '2026-01', to: '2026-06' });
  check('дохід звужується до періоду', q1.map(x => x.periodRevenue), [500, 300, 0]);
  check('угоди звужуються до періоду', q1.map(x => x.periodDeals), [1, 3, 0]);
  check('без активності — поза вибіркою', q1.map(x => x.inPeriod), [true, true, false]);
  check('середній чек рахується від періодних чисел', q1.map(x => x.avgCheck), [500, 100, 0]);
  check('дохід за весь час зберігається окремо', q1.map(x => x.revenue), [1500, 300, 9000]);

  check('когорта не звужується періодом', q1[0].cohortMonth, '2025-06');

  check('неактивні відсіюються фільтром', applyFilters(q1, f()).map(x => x.id), ['1', '2']);
  check('фільтр доходу застосовується до періодного', applyFilters(q1, f({ revenueMin: 400 })).map(x => x.id), ['1']);
  check('розподіл рахує періодний дохід', computeDistribution(applyFilters(q1, f())).total, 800);
  check('сортування за періодним доходом', sortClients(applyFilters(q1, f()), 'revenue', 'desc').map(x => x.id), ['1', '2']);

  // Межі діапазону включні з обох боків
  const edge = enrichClients([c('e', { '2026-01': [10, 1], '2026-06': [20, 1], '2026-07': [40, 1] })],
    NOW, undefined, { from: '2026-01', to: '2026-06' });
  check('межі включні', edge[0].periodRevenue, 30);

  // Старий формат: сум немає, але активність визначити можна
  const legacy = enrichClients([{
    id: 'L', name: 'Старий', revenue: 700, agreementsCount: 4, tags: [],
    purchaseMonths: ['2026-03'],
  }], NOW, undefined, { from: '2026-01', to: '2026-06' });
  check('старий формат: активність визначено', legacy[0].inPeriod, true);
  check('старий формат: суми лишаються за весь час', legacy[0].periodRevenue, 700);

  const legacyOut = enrichClients([{
    id: 'L2', name: 'Старий', revenue: 700, agreementsCount: 4, tags: [],
    purchaseMonths: ['2023-03'],
  }], NOW, undefined, { from: '2026-01', to: '2026-06' });
  check('старий формат: поза періодом відсіюється', legacyOut[0].inPeriod, false);
}

console.log('\nМісяці покупок');
{
  check('з monthlyStats', getPurchaseMonths({
    id: '1', name: '', revenue: 0, agreementsCount: 0, tags: [],
    monthlyStats: { '2026-05': { revenue: 1, deals: 1 }, '2026-01': { revenue: 1, deals: 1 } },
  }), ['2026-01', '2026-05']);
  check('зі старого purchaseMonths', getPurchaseMonths({
    id: '1', name: '', revenue: 0, agreementsCount: 0, tags: [], purchaseMonths: ['2026-05', '2026-01'],
  }), ['2026-01', '2026-05']);
  check('порожньо', getPurchaseMonths({ id: '1', name: '', revenue: 0, agreementsCount: 0, tags: [] }), []);
}

console.log('\nНовий чи постійний');
{
  const P = { from: '2026-01', to: '2026-06' };

  check('перша покупка до періоду = постійний', classifyCustomer(['2025-11', '2026-02'], 2, P), 'returning');
  check('перша покупка в періоді = новий',      classifyCustomer(['2026-02', '2026-03'], 2, P), 'new');
  // Межа періоду належить самому періоду: хто прийшов у січні, той у січні новий
  check('перша покупка рівно на межі = новий',  classifyCustomer(['2026-01'], 1, P), 'new');
  check('без місяців — не вгадуємо',            classifyCustomer([], 3, P), 'unknown');

  check('весь час: одна покупка = новий',          classifyCustomer(['2026-02'], 1, null), 'new');
  check('весь час: два місяці = постійний',        classifyCustomer(['2026-02', '2026-05'], 2, null), 'returning');
  check('весь час: дві угоди в місяці = постійний', classifyCustomer(['2026-02'], 2, null), 'returning');
}

console.log('\nРозклад «нові / постійні»');
{
  const m = (o: Record<string, number>) =>
    Object.fromEntries(Object.entries(o).map(([k, deals]) => [k, { revenue: deals * 1000, deals }]));

  const data = [
    // Прийшов торік → у періоді постійний, 3 угоди на 3000 ₴
    client({ id: 'old', revenue: 9000, agreementsCount: 9, monthlyStats: m({ '2025-05': 6, '2026-02': 3 }) }),
    // Перша покупка в періоді → новий, 1 угода на 1000 ₴
    client({ id: 'new', revenue: 1000, agreementsCount: 1, monthlyStats: m({ '2026-03': 1 }) }),
  ];

  const period = { from: '2026-01', to: '2026-06' };
  const mix = computeCustomerMix(enrichClients(data, NOW, undefined, period), period);

  check('замовлення постійних', mix.returning.deals, 3);
  check('замовлення нових',     mix.new.deals, 1);
  check('% замовлень постійними', mix.returning.dealsShare, 75);
  check('% замовлень новими',     mix.new.dealsShare, 25);
  // У періоді враховані лише угоди періоду, а не 9000 ₴ за весь час
  check('дохід постійних — лише за період', mix.returning.revenue, 3000);
  check('% доходу постійних', mix.returning.revenueShare, 75);
  check('середній чек боку', mix.returning.avgCheck, 1000);
  check('клієнтів у кожному боці', [mix.returning.clients, mix.new.clients], [1, 1]);
  check('база — період', mix.basis, 'period');

  // Без періоду межа інша: 'old' купував двічі, 'new' — один раз
  const allTime = computeCustomerMix(enrichClients(data, NOW), null);
  check('весь час: замовлення постійних', allTime.returning.deals, 9);
  check('весь час: замовлення нових',     allTime.new.deals, 1);
  check('весь час: % постійних',          allTime.returning.dealsShare, 90);
  check('весь час: база',                 allTime.basis, 'lifetime');
}
{
  // Клієнти без дат покупок не приписуються ні до нових, ні до постійних
  const mix = computeCustomerMix(
    enrichClients([client({ id: 'ghost', revenue: 500, agreementsCount: 2 })], NOW),
    null,
  );
  check('без історії — окремо', [mix.unknown.deals, mix.new.deals, mix.returning.deals], [2, 0, 0]);
  check('без історії дає 100 %', mix.unknown.dealsShare, 100);
}
{
  const empty = computeCustomerMix([], null);
  check('порожня вибірка не ділить на нуль', [empty.totalDeals, empty.new.dealsShare], [0, 0]);
}

console.log('\nПороги сегментації');
{
  // Пороги справді керують сегментом, а не лише його описом
  const c = client({ id: 's', agreementsCount: 2, lastPurchaseDate: '2026-06-01' }); // 70 днів тому
  const seg = (t: Partial<typeof DEFAULT_RFM_THRESHOLDS>) =>
    enrichClients([c], NOW, { ...DEFAULT_RFM_THRESHOLDS, ...t })[0].rfm.label;

  check('за замовчуванням — Лояльний', seg({}), 'Лояльний');
  check('знизили поріг чемпіона за угодами', seg({ championDeals: 2 }), 'Чемпіон');
  check('звузили вікно лояльного', seg({ loyalDays: 30, dormantDays: 30 }), 'Сплячий');

  const counts = countByRfm(enrichClients([
    client({ id: 'a', agreementsCount: 5, lastPurchaseDate: '2026-08-01' }),
    client({ id: 'b', agreementsCount: 2, lastPurchaseDate: '2026-07-01' }),
    client({ id: 'c', agreementsCount: 1, lastPurchaseDate: '2020-01-01' }),
  ], NOW));
  check('лічильник сегментів', [counts['Чемпіон'], counts['Лояльний'], counts['Зона ризику']], [1, 1, 1]);
  check('порожні сегменти лишаються нулями', counts['Сплячий'], 0);
}
{
  check('стандартні пороги не суперечать собі', checkRfmThresholds(DEFAULT_RFM_THRESHOLDS), []);

  const inverted = checkRfmThresholds({ ...DEFAULT_RFM_THRESHOLDS, championDeals: 1 });
  check('чемпіон з меншим порогом за угодами — попередження', inverted.length, 1);

  const overlap = checkRfmThresholds({ ...DEFAULT_RFM_THRESHOLDS, dormantDays: 90 });
  check('сплячий перекриває лояльного — попередження', overlap.length, 1);

  check('нуль і від\'ємні відхиляються',
    checkRfmThresholds({ ...DEFAULT_RFM_THRESHOLDS, newDays: 0 }).length > 0, true);
}
{
  check('сміття зі спільного стану — стандартні пороги',
    sanitizeRfmThresholds({ championDeals: 'багато', loyalDays: null }), DEFAULT_RFM_THRESHOLDS);
  check('частковий об\'єкт доповнюється',
    sanitizeRfmThresholds({ championDeals: 7 }), { ...DEFAULT_RFM_THRESHOLDS, championDeals: 7 });
  check('нема налаштувань — стандартні', sanitizeRfmThresholds(undefined), DEFAULT_RFM_THRESHOLDS);
  check('дробові округлюються',
    sanitizeRfmThresholds({ loyalDays: 45.6 }).loyalDays, 46);
}

console.log('\nУтримання по когортах');
{
  const r = calculateCohorts([
    client({ id: 'a', purchaseMonths: ['2026-01', '2026-02', '2026-04'] }),
    client({ id: 'b', purchaseMonths: ['2026-01'] }),
    client({ id: 'c', purchaseMonths: ['2026-03', '2026-04'] }),
    client({ id: 'd' }),
  ]);

  check('когорта — місяць першої покупки', Object.keys(r).sort(), ['2026-01', '2026-03']);
  check('розмір січневої когорти', r['2026-01'].size, 2);
  check('M0 — усі, хто прийшов', r['2026-01'].retention[0], 2);
  check('M1 — повернувся один', r['2026-01'].retention[1], 1);
  check('місяць без покупок порожній', r['2026-01'].retention[2], undefined);
  check('M3 — той самий один', r['2026-01'].retention[3], 1);
  // Клієнт без жодного місяця покупки не має від чого відлічувати когорту
  check('клієнт без покупок когорти не утворює', Object.keys(r).length, 2);
}

console.log('\nРізання за розміром');
{
  const item = (n: number) => ({ pad: 'x'.repeat(n) });

  check('порожній вхід', chunkBySize([], 100), []);
  // Кожен елемент ~110 Б при бюджеті 250 Б → по 2 на частину
  const r = chunkBySize([item(100), item(100), item(100), item(100), item(100)], 250);
  check('ріже за бюджетом', r.map(c => c.length), [2, 2, 1]);
  check('нічого не загублено', r.flat().length, 5);

  // Елемент, більший за бюджет, не зникає і не тягне за собою сусідів
  const huge = chunkBySize([item(10), item(5000), item(10)], 200);
  check('завеликий елемент лишається окремо', huge.map(c => c.length), [1, 1, 1]);
  check('нульовий бюджет відхиляється', (() => {
    try { chunkBySize([item(1)], 0); return 'не кинуло'; } catch { return 'кинуло'; }
  })(), 'кинуло');
}

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

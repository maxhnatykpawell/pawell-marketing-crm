import {
  toUAH,
  previousRange,
  sumSpend,
  computeCac,
  cacBySource,
  normalizeSource,
  DEFAULT_CURRENCY_RATES,
  CacExpenseInput,
} from './cac';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`);
    failures++;
  }
}

const rates = { USD: 40, EUR: 50 };

console.log('\ntoUAH');
check('гривня лишається як є', toUAH(100, 'UAH', rates), 100);
check('долар за курсом', toUAH(100, 'USD', rates), 4000);
check('євро за курсом', toUAH(10, 'EUR', rates), 500);
check('невідома валюта = гривня', toUAH(100, 'GBP', rates), 100);
check('NaN не отруює суму', toUAH(NaN, 'USD', rates), 0);

console.log('\npreviousRange');
check('один день → попередній день', previousRange('2026-08-10', '2026-08-10'), { from: '2026-08-09', to: '2026-08-09' });
check('7 днів → попередні 7', previousRange('2026-08-10', '2026-08-16'), { from: '2026-08-03', to: '2026-08-09' });
// 31 день серпня → рівно 31 попередній день, а не «календарний липень»
check('через межу місяця', previousRange('2026-08-01', '2026-08-31'), { from: '2026-07-01', to: '2026-07-31' });
check('коротший місяць не розтягується', previousRange('2026-03-01', '2026-03-31'), { from: '2026-01-29', to: '2026-02-28' });
check('через межу року', previousRange('2026-01-01', '2026-01-05'), { from: '2025-12-27', to: '2025-12-31' });

const expenses: CacExpenseInput[] = [
  { amount: 10000, currency: 'UAH', category: 'Реклама', source: 'Meta Ads',   date: '2026-08-05' },
  { amount: 100,   currency: 'USD', category: 'Реклама', source: 'Google Ads', date: '2026-08-07' },
  { amount: 5000,  currency: 'UAH', category: 'Контент', source: 'Фрілансери', date: '2026-08-07' },
  { amount: 999,   currency: 'UAH', category: 'Реклама', source: 'Meta Ads',   date: '2026-07-31' }, // поза періодом
  { amount: 777,   currency: 'UAH', category: 'Реклама', source: 'Meta Ads',   date: '2026-08-11' }, // поза періодом
];

console.log('\nsumSpend');
{
  const ads = sumSpend(expenses, '2026-08-01', '2026-08-10', 'ads', rates);
  check('лише реклама: 10000 + 100$*40', ads.total, 14000);
  check('записів у періоді', ads.count, 2);
  check('валюта відзначена', ads.hasForeign, true);
  check('розбивка по джерелах відсортована', ads.bySource, [
    { source: 'Meta Ads', amount: 10000 },
    { source: 'Google Ads', amount: 4000 },
  ]);

  const all = sumSpend(expenses, '2026-08-01', '2026-08-10', 'all', rates);
  check('усі витрати включають контент', all.total, 19000);
  check('категорій дві', all.byCategory.length, 2);

  check('межі періоду включні', sumSpend(expenses, '2026-07-31', '2026-07-31', 'ads', rates).total, 999);
  check('порожній період = 0', sumSpend(expenses, '2026-09-01', '2026-09-30', 'all', rates).total, 0);
  check('немає валютних витрат — hasForeign false', sumSpend(expenses, '2026-07-31', '2026-07-31', 'ads', rates).hasForeign, false);
}

console.log('\ncomputeCac');
{
  const r = computeCac({ spend: 20000, newClients: 10, acquired: 100, prevSpend: 15000, prevClients: 5, ltv: 12000 });
  check('CAC = 20000/10', r.cac, 2000);
  check('CPL = 20000/100', r.cpl, 200);
  check('CAC поп. періоду = 15000/5', r.prevCac, 3000);
  check('CAC впав на третину', r.cacChange, -33.3);
  check('падіння CAC — це покращення', r.cacImproved, true);
  check('LTV/CAC = 12000/2000', r.ltvToCac, 6);
}
{
  // Нуль клієнтів ≠ безкоштовний клієнт: показник має лишитись невідомим.
  const r = computeCac({ spend: 20000, newClients: 0, acquired: 40, prevSpend: 0, prevClients: 0, ltv: 12000 });
  check('немає клієнтів → CAC невідомий', r.cac, null);
  check('але CPL рахується', r.cpl, 500);
  check('немає бази → зміна невідома', r.cacChange, null);
  check('немає CAC → немає LTV/CAC', r.ltvToCac, null);
  check('покращення невідоме', r.cacImproved, null);
}
{
  const r = computeCac({ spend: 30000, newClients: 5, acquired: 50, prevSpend: 10000, prevClients: 5, ltv: null });
  check('CAC виріс утричі', r.cacChange, 200);
  check('зростання CAC — не покращення', r.cacImproved, false);
  check('без LTV співвідношення порожнє', r.ltvToCac, null);
}
{
  // Нульові витрати — валідний стан (бюджет ще не заведено), CAC чесно 0.
  const r = computeCac({ spend: 0, newClients: 4, acquired: 20, prevSpend: 0, prevClients: 2, ltv: 5000 });
  check('нульові витрати → CAC 0', r.cac, 0);
  check('CAC 0 не дає ділення на нуль у LTV/CAC', r.ltvToCac, null);
}

console.log('\nnormalizeSource');
check('регістр і пробіли', normalizeSource('Meta Ads'), normalizeSource('meta_ads'));
check('різні джерела не злипаються', normalizeSource('Google Ads') === normalizeSource('Meta Ads'), false);

console.log('\ncacBySource');
{
  const r = cacBySource(
    [
      { source: 'Meta Ads', amount: 10000 },
      { source: 'Google Ads', amount: 6000 },
      { source: 'Notion', amount: 500 },
    ],
    [
      { source: 'meta ads', count: 10 },
      { source: 'Google Ads', count: 2 },
      { source: 'Рекомендації', count: 7 },
    ],
  );
  check('зіставлено попри різне написання', r.matched.map(m => m.source), ['meta ads', 'Google Ads']);
  check('CAC по Meta = 1000', r.matched[0].cac, 1000);
  check('CAC по Google = 3000', r.matched[1].cac, 3000);
  check('відсортовано від дешевшого', r.matched[0].cac! < r.matched[1].cac!, true);
  check('витрати без клієнтів у CRM — окремо', r.unmatchedSpend, 500);
  check('клієнти без витрат — окремо', r.unmatchedClients, 7);
}
{
  const r = cacBySource([{ source: 'Meta Ads', amount: 10000 }], [{ source: 'Meta Ads', count: 0 }]);
  check('нуль клієнтів по джерелу → CAC невідомий', r.matched[0].cac, null);
}

console.log('\nДефолтні курси');
check('USD задано', DEFAULT_CURRENCY_RATES.USD > 0, true);
check('EUR задано', DEFAULT_CURRENCY_RATES.EUR > 0, true);

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

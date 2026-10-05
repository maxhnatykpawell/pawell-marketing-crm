import {
  buildFunnelRecords, mergeFunnelRecords, summarizeFunnelSpeed, quantile, formatDuration, FunnelRecord,
} from './funnelSpeed';

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

const NOW = new Date('2026-10-05T12:00:00Z');

function rec(p: Partial<FunnelRecord> & { id: string }): FunnelRecord {
  return {
    source: 'Instagram',
    createdAt: '2026-01-10T10:00:00Z',
    isLead: false,
    convertedAt: null,
    firstDealAt: null,
    firstPaidDate: null,
    ...p,
  };
}

console.log('\nquantile');
check('медіана непарного', quantile([1, 2, 9], 0.5), 2);
check('медіана парного — інтерполяція', quantile([1, 3], 0.5), 2);
check('p75', quantile([0, 10], 0.75), 7.5);
check('порожній масив', quantile([], 0.5), null);

console.log('\nformatDuration');
check('менше години', formatDuration(0.01), '< 1 год');
check('години', formatDuration(0.5), '12 год');
check('дні з десятковою', formatDuration(1.5), '1,5 дн.');
check('багато днів — ціле', formatDuration(27.4), '27 дн.');
check('null', formatDuration(null), '—');

console.log('\nЛід → клієнт');
{
  const records = [
    // 2 дні
    rec({ id: '1', createdAt: '2026-01-10T10:00:00Z', convertedAt: '2026-01-12T10:00:00Z' }),
    // 4 дні
    rec({ id: '2', createdAt: '2026-01-10T10:00:00Z', convertedAt: '2026-01-14T10:00:00Z' }),
    // створений одразу клієнтом: lead_updated_at == created_at — не переходив із ліда
    rec({ id: '3', createdAt: '2026-01-10T10:00:00Z', convertedAt: '2026-01-10T10:00:00Z' }),
    // ще лід
    rec({ id: '4', isLead: true }),
  ];
  const s = summarizeFunnelSpeed(records, {}, NOW).overall.leadToClient;
  check('учасників: 2 конвертовані + 1 лід', s.entered, 3);
  check('дійшли', s.reached, 2);
  check('частка', Math.round((s.share ?? 0) * 100), 67);
  check('медіана 3 дні', s.median, 3);
  check('одразу-клієнти виключені й пораховані', s.immediate, 1);
}

console.log('\nКлієнт → угода');
{
  const records = [
    // 5 днів від конверсії до першої угоди
    rec({ id: '1', convertedAt: '2026-02-01T00:00:00Z', firstDealAt: '2026-02-06T00:00:00Z' }),
    // угода раніше за конверсію — аномалія, виключаємо
    rec({ id: '2', convertedAt: '2026-02-10T00:00:00Z', firstDealAt: '2026-02-01T00:00:00Z' }),
    // клієнт без угоди — стартував, але не дійшов
    rec({ id: '3', convertedAt: '2026-02-01T00:00:00Z' }),
    // лід на цей перехід не потрапляє
    rec({ id: '4', isLead: true, createdAt: '2026-02-01T00:00:00Z' }),
  ];
  const s = summarizeFunnelSpeed(records, {}, NOW).overall.clientToDeal;
  check('стартували двоє', s.entered, 2);
  check('дійшов один', s.reached, 1);
  check('медіана 5 днів', s.median, 5);
  check('аномалія пораховано', s.negative, 1);
}

console.log('\nУгода → оплата — календарні дні');
{
  const records = [
    // угода 1 лютого, оплата 4 лютого → 3 дні
    rec({ id: '1', firstDealAt: '2026-02-01T09:00:00Z', firstPaidDate: '2026-02-04' }),
    // оплата в день угоди → 0
    rec({ id: '2', firstDealAt: '2026-02-01T09:00:00Z', firstPaidDate: '2026-02-01' }),
    // оплата датована раніше угоди — виключаємо
    rec({ id: '3', firstDealAt: '2026-02-10T09:00:00Z', firstPaidDate: '2026-02-01' }),
    // не оплачено, але в CRM сума «сплачено» є — окремо в unverified
    rec({ id: '4', firstDealAt: '2026-02-01T09:00:00Z', paidNoDate: true }),
    // не оплачено взагалі
    rec({ id: '5', firstDealAt: '2026-02-01T09:00:00Z' }),
    // без угоди — не учасник
    rec({ id: '6' }),
  ];
  const s = summarizeFunnelSpeed(records, {}, NOW).overall.dealToPayment;
  check('стартували четверо', s.entered, 4);
  check('оплатили двоє', s.reached, 2);
  check('медіана 1,5 дня', s.median, 1.5);
  check('від\'ємні пораховані', s.negative, 1);
  check('суму без дати видно окремо', s.unverified, 1);
}

console.log('\nДата угоди близько опівночі рахується за київським часом');
{
  // 31 січня 22:30 UTC — це вже 1 лютого 00:30 у Києві (UTC+2 взимку)
  const records = [rec({ id: '1', firstDealAt: '2026-01-31T22:30:00Z', firstPaidDate: '2026-02-01' })];
  const s = summarizeFunnelSpeed(records, {}, NOW).overall.dealToPayment;
  check('0 днів, а не від\'ємне', [s.reached, s.negative, s.median], [1, 0, 0]);
}

console.log('\nФільтр за когортою і мінімальний вік');
{
  const records = [
    rec({ id: '1', createdAt: '2026-01-10T10:00:00Z', convertedAt: '2026-01-11T10:00:00Z' }),
    rec({ id: '2', createdAt: '2026-03-10T10:00:00Z', convertedAt: '2026-03-20T10:00:00Z' }),
    // свіжий: створений 3 дні тому
    rec({ id: '3', createdAt: '2026-10-02T10:00:00Z', convertedAt: '2026-10-02T12:00:00Z' }),
  ];
  const jan = summarizeFunnelSpeed(records, { from: '2026-01', to: '2026-01' }, NOW).overall.leadToClient;
  check('лише січнева когорта', [jan.entered, jan.median], [1, 1]);

  const all = summarizeFunnelSpeed(records, {}, NOW).overall.leadToClient;
  check('без відсікання — 3 учасники', all.entered, 3);

  const mature = summarizeFunnelSpeed(records, { minAgeDays: 30 }, NOW).overall.leadToClient;
  check('свіжий старт відсічено', [mature.entered, mature.tooFresh], [2, 1]);
}

console.log('\nДжерела');
{
  const records = [
    rec({ id: '1', source: 'Meta Ads',  convertedAt: '2026-01-12T10:00:00Z' }),
    rec({ id: '2', source: 'meta_ads',  convertedAt: '2026-01-14T10:00:00Z' }),
    rec({ id: '3', source: 'Google',    convertedAt: '2026-01-11T10:00:00Z' }),
  ];
  const r = summarizeFunnelSpeed(records, {}, NOW);
  check('Meta Ads і meta_ads — одне джерело', r.bySource.map(s => [s.source, s.total]), [['Meta Ads', 2], ['Google', 1]]);
  check('медіана по Meta — 3 дні', r.bySource[0].stages.leadToClient.median, 3);
}

console.log('\nКогорти по місяцях');
{
  const records = [
    rec({ id: '1', createdAt: '2026-01-10T10:00:00Z', convertedAt: '2026-01-12T10:00:00Z' }),
    rec({ id: '2', createdAt: '2026-02-10T10:00:00Z', convertedAt: '2026-02-20T10:00:00Z' }),
  ];
  const r = summarizeFunnelSpeed(records, {}, NOW);
  check('місяці від свіжих до старих', r.byCohort.map(c => c.month).slice(0, 2), ['2026-02', '2026-01']);
  check('медіана по лютому', r.byCohort.find(c => c.month === '2026-02')!.stages.leadToClient.median, 10);
}

console.log('\nbuildFunnelRecords');
{
  const { records, stats } = buildFunnelRecords(
    [
      { id: 'a', source: 'Instagram', createdAt: '2026-01-10T10:00:00.123Z', isLead: false, leadUpdatedAt: '2026-01-12T10:00:00.456Z' },
      { id: 'b', source: '', createdAt: '2026-01-10T10:00:00Z', isLead: true, leadUpdatedAt: null },
      // давній клієнт без lead_updated_at — конверсія = створення
      { id: 'c', source: 'Google', createdAt: '2025-01-01T00:00:00Z', isLead: false, leadUpdatedAt: null },
    ],
    [
      { clientId: 'a', createdAt: '2026-02-05T10:00:00Z', paidAmount: 0 },
      { clientId: 'a', createdAt: '2026-02-01T10:00:00Z', paidAmount: 100 },
      { clientId: 'zzz', createdAt: '2026-02-01T10:00:00Z', paidAmount: 0 },
      { clientId: 'c', createdAt: '2025-03-01T10:00:00Z', paidAmount: 50 },
    ],
    [
      { clientId: 'a', at: '2026-03-10' },
      { clientId: 'a', at: '2026-02-20' },
      { clientId: 'a', at: '2026-12-31' },
      { clientId: 'nobody', at: '2026-02-20' },
    ],
    '2026-10-05',
  );
  const a = records.find(r => r.id === 'a')!;
  const b = records.find(r => r.id === 'b')!;
  const c = records.find(r => r.id === 'c')!;
  check('мілісекунди прибрано', [a.createdAt, a.convertedAt], ['2026-01-10T10:00:00Z', '2026-01-12T10:00:00Z']);
  check('найраніша угода', a.firstDealAt, '2026-02-01T10:00:00Z');
  check('найраніша оплата, майбутня ігнорується', a.firstPaidDate, '2026-02-20');
  check('порожнє джерело → «Не вказано»', b.source, 'Не вказано');
  check('лід не має дати конверсії', b.convertedAt, null);
  check('клієнт без lead_updated_at: конверсія = створення', c.convertedAt, c.createdAt);
  check('оплачено без запису → прапорець', [c.paidNoDate, a.paidNoDate], [true, undefined]);
  check('сироти й майбутні оплати пораховані', stats, { orphanDeals: 1, orphanPayments: 1, futurePayments: 1 });
}

console.log('\nМасові дні — імпорти й масові правки не є швидкістю');
{
  // 120 клієнтів «конвертовано» одним днем: це масова правка статусу, а не 280 днів очікування
  const bulkConv = Array.from({ length: 120 }, (_, i) => rec({
    id: `c${i}`, createdAt: '2025-01-10T10:00:00Z', convertedAt: '2025-10-17T09:00:00Z',
  }));
  const normal = [
    rec({ id: 'n1', createdAt: '2026-03-01T10:00:00Z', convertedAt: '2026-03-02T10:00:00Z' }),
    rec({ id: 'n2', createdAt: '2026-03-01T10:00:00Z', convertedAt: '2026-03-02T10:00:00Z' }),
  ];
  const r = summarizeFunnelSpeed([...bulkConv, ...normal], {}, NOW);
  const s1 = r.overall.leadToClient;
  check('масова конверсія відкинута й пораховано', [s1.bulk, s1.entered, s1.median], [120, 2, 1]);
  check('день названо', r.bulkDays.converted, [{ day: '2025-10-17', count: 120 }]);
  check('для «клієнт → угода» та сама дата — теж відкинута', r.overall.clientToDeal.bulk, 120);

  // 100 лідів, заведених одного дня імпортом, — не когорта
  const imported = Array.from({ length: 100 }, (_, i) => rec({ id: `i${i}`, isLead: true, createdAt: '2025-03-18T08:00:00Z' }));
  const r2 = summarizeFunnelSpeed(imported, {}, NOW);
  check('імпортовані ліди не стартують перехід', [r2.overall.leadToClient.bulk, r2.overall.leadToClient.entered], [100, 0]);

  // 100 перших угод одним днем — імпорт угод
  const deals = Array.from({ length: 100 }, (_, i) => rec({
    id: `d${i}`, firstDealAt: '2024-04-09T10:00:00Z', firstPaidDate: '2024-05-09',
  }));
  const r3 = summarizeFunnelSpeed(deals, {}, NOW);
  check('імпортовані угоди не дають швидкості оплати', [r3.overall.dealToPayment.bulk, r3.overall.dealToPayment.reached], [100, 0]);

  // 99 за день — ще звичайний день
  const busy = Array.from({ length: 99 }, (_, i) => rec({
    id: `x${i}`, createdAt: '2026-02-01T10:00:00Z', convertedAt: '2026-02-03T10:00:00Z',
  }));
  const r4 = summarizeFunnelSpeed(busy, {}, NOW);
  check('99 за день — не масово', [r4.overall.leadToClient.bulk, r4.overall.leadToClient.reached], [0, 99]);
}

console.log('\nКлієнт, створений одразу клієнтом, не стартує «клієнт → угода»');
{
  const records = [
    // заведений разом з угодою: «0 годин» — не швидкість
    rec({ id: 'd', createdAt: '2026-02-01T10:00:00Z', convertedAt: '2026-02-01T10:00:00Z', firstDealAt: '2026-02-01T10:00:05Z' }),
    // справжня конверсія і угода через 2 дні
    rec({ id: 'r', createdAt: '2026-02-01T10:00:00Z', convertedAt: '2026-02-02T10:00:00Z', firstDealAt: '2026-02-04T10:00:00Z' }),
  ];
  const s = summarizeFunnelSpeed(records, {}, NOW).overall.clientToDeal;
  check('прямий клієнт виключений і пораховано', [s.immediate, s.entered, s.reached, s.median], [1, 1, 1, 2]);
}

console.log('\nmergeFunnelRecords — інкрементальне оновлення');
{
  const base = buildFunnelRecords(
    [
      { id: 'a', source: 'Instagram', createdAt: '2026-01-10T10:00:00Z', isLead: true, leadUpdatedAt: null },
      { id: 'b', source: 'Google', createdAt: '2026-01-10T10:00:00Z', isLead: false, leadUpdatedAt: '2026-01-11T10:00:00Z' },
    ],
    [{ clientId: 'b', createdAt: '2026-02-01T10:00:00Z', paidAmount: 0 }],
    [{ clientId: 'b', at: '2026-02-10' }],
    '2026-10-05',
  ).records;

  // Змінився лише клієнт a (став клієнтом) і з'явилась нова угода у b; оплати прийшли всі
  const { records } = mergeFunnelRecords(
    base,
    [{ id: 'a', source: 'Instagram', createdAt: '2026-01-10T10:00:00Z', isLead: false, leadUpdatedAt: '2026-01-13T10:00:00Z' }],
    [{ clientId: 'b', createdAt: '2026-05-01T10:00:00Z', paidAmount: 0 }],
    [{ clientId: 'b', at: '2026-02-10' }],
    '2026-10-05',
  );
  const a = records.find(r => r.id === 'a')!;
  const b = records.find(r => r.id === 'b')!;
  check('клієнт став клієнтом', [a.isLead, a.convertedAt], [false, '2026-01-13T10:00:00Z']);
  check('нова пізніша угода не підміняє першу', b.firstDealAt, '2026-02-01T10:00:00Z');
  check('нерухомий клієнт не загубився', records.length, 2);
  check('вхідний набір не змінено', base.find(r => r.id === 'a')!.isLead, true);

  // Оплату скасували — її більше немає серед усіх оплат
  const cancelled = mergeFunnelRecords(base, [], [], [], '2026-10-05').records.find(r => r.id === 'b')!;
  check('скасована оплата зникає', cancelled.firstPaidDate, null);

  // Оплату перенесли на пізніше
  const moved = mergeFunnelRecords(base, [], [], [{ clientId: 'b', at: '2026-03-15' }], '2026-10-05').records.find(r => r.id === 'b')!;
  check('перенесена оплата перераховується', moved.firstPaidDate, '2026-03-15');

  // Оновилась угода з сумою «сплачено», а запису оплати немає → прапорець; з'явилась оплата → знімається
  const flagged = mergeFunnelRecords(base, [], [{ clientId: 'a', createdAt: '2026-03-01T10:00:00Z', paidAmount: 10 }], [], '2026-10-05').records;
  check('сплачено без запису — прапорець', flagged.find(r => r.id === 'a')!.paidNoDate, true);
  const cleared = mergeFunnelRecords(flagged, [], [], [{ clientId: 'a', at: '2026-03-02' }], '2026-10-05').records;
  check('після появи оплати прапорець знято', cleared.find(r => r.id === 'a')!.paidNoDate, undefined);
}

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

import { kyivYmd, kyivMonthOf, kyivDayBounds } from './kyivTime';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

console.log('\nМісяць угоди за Києвом');
// Саме ці випадки ламались на сервері в UTC
check('01:30 першого числа (зима) — вже новий місяць', kyivMonthOf('2026-11-01T01:30:00+02:00'), '2026-11');
check('01:30 першого числа (літо) — вже новий місяць', kyivMonthOf('2026-10-01T01:30:00+03:00'), '2026-10');
check('23:30 останнього числа лишається в місяці', kyivMonthOf('2026-10-31T23:30:00+02:00'), '2026-10');
check('дата без часу не зсувається', kyivMonthOf('2026-10-31'), '2026-10');
check('перше число без часу', kyivMonthOf('2026-11-01'), '2026-11');
check('сміття → null', kyivMonthOf('не дата'), null);

console.log('\nДоба за Києвом');
check('00:30 Києва — вже наступний день', kyivYmd(new Date('2026-11-01T22:30:00Z')), '2026-11-02');

console.log('\nМежі доби для CRM');
check('літо: +03:00', kyivDayBounds('2026-07-15'), {
  gteq: '2026-07-15T00:00:00.000+03:00', lteq: '2026-07-15T23:59:59.999+03:00',
});
check('зима: +02:00', kyivDayBounds('2026-12-15'), {
  gteq: '2026-12-15T00:00:00.000+02:00', lteq: '2026-12-15T23:59:59.999+02:00',
});
check('31 жовтня (після переходу) — +02:00', kyivDayBounds('2026-10-31'), {
  gteq: '2026-10-31T00:00:00.000+02:00', lteq: '2026-10-31T23:59:59.999+02:00',
});
check('день переходу 25 жовтня: початок +03:00, кінець +02:00', kyivDayBounds('2026-10-25'), {
  gteq: '2026-10-25T00:00:00.000+03:00', lteq: '2026-10-25T23:59:59.999+02:00',
});
check('день переходу 29 березня: початок +02:00, кінець +03:00', kyivDayBounds('2026-03-29'), {
  gteq: '2026-03-29T00:00:00.000+02:00', lteq: '2026-03-29T23:59:59.999+03:00',
});

// Доби не мають ні дірок, ні перекриття: кінець однієї + 1 мс = початок наступної
const end = new Date(kyivDayBounds('2026-10-31').lteq).getTime() + 1;
check('жовтень → листопад без шва', new Date(end).toISOString(), new Date(kyivDayBounds('2026-11-01').gteq).toISOString());

if (failures > 0) { console.log(`\n❌ Провалено: ${failures}`); process.exit(1); }
console.log('\n✅ Усі перевірки пройдено');

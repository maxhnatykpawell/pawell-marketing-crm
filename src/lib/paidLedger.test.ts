import { PaidLedger, applyPaid, cashMonth, extractAgreementPaid } from './paidLedger';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

console.log('\nПоле «Сплачено»');
{
  check('число', extractAgreementPaid({ paid: 1500 }), 1500);
  check('рядок з комою', extractAgreementPaid({ paid: '1 500,50' }), 1500.5);
  check('нуль — це нуль, а не «немає поля»', extractAgreementPaid({ paid: 0 }), 0);
  check('поля немає', extractAgreementPaid({ total: 1000 }), null);
  check('порожнє поле — немає даних', extractAgreementPaid({ paid: null }), null);
  check('запасна назва', extractAgreementPaid({ payed: '200' }), 200);
}

console.log('\nКасовий місяць');
{
  // 1 жовтня 03:00 за Києвом = 30 вересня 00:00 UTC
  check('нічний прогін 1-го — ще попередній місяць', cashMonth(new Date('2026-10-01T00:00:00Z')), '2026-09');
  check('удень 1-го — вже новий', cashMonth(new Date('2026-10-01T09:00:00Z')), '2026-10');
  check('середина місяця', cashMonth(new Date('2026-09-15T12:00:00Z')), '2026-09');
}

console.log('\nЖурнал');
{
  const l: PaidLedger = {};
  applyPaid(l, 'a', 1000, '2026-06', '2026-09', true);
  check('старт: історія — у місяць угоди', l, { a: { '2026-06': 1000 } });

  applyPaid(l, 'a', 1000, '2026-06', '2026-09', false);
  check('без змін — без запису', l, { a: { '2026-06': 1000 } });

  applyPaid(l, 'a', 1600, '2026-06', '2026-09', false);
  check('доплата — у касовий місяць', l, { a: { '2026-06': 1000, '2026-09': 600 } });

  applyPaid(l, 'a', 1400, '2026-06', '2026-10', false);
  check('повернення — мінус у касовий місяць', l, { a: { '2026-06': 1000, '2026-09': 600, '2026-10': -200 } });

  applyPaid(l, 'b', 500, '2026-08', '2026-09', false);
  check('нова угода після старту — касовий місяць', l.b, { '2026-09': 500 });

  applyPaid(l, 'c', 0, '2026-08', '2026-09', true);
  check('неоплачена угода в журнал не пишеться', 'c' in l, false);

  applyPaid(l, 'b', 0, '2026-08', '2026-09', false);
  check('скасована в тому ж місяці оплата зникає', 'b' in l, false);
}

if (failures > 0) {
  console.log(`\n✗ Провалено: ${failures}`);
  process.exit(1);
}
console.log('\n✓ Усі перевірки пройдено');

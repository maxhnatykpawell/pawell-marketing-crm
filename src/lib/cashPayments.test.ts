import assert from 'node:assert/strict';
import { aggregateCash, bucketPayments, extractPaymentAmount, paymentDay } from './cashPayments';

// Сума: різні назви поля, рядки з комою й пробілами, відсутність поля ≠ нуль
assert.equal(extractPaymentAmount({ amount: 1500.5 }), 1500.5);
assert.equal(extractPaymentAmount({ sum: '1 200,50' }), 1200.5);
assert.equal(extractPaymentAmount({ amount: 0 }), 0);
assert.equal(extractPaymentAmount({ foo: 1 }), null);
assert.equal(extractPaymentAmount(null), null);

// День: дата без часу не зсувається, момент часу рахується за Києвом
assert.equal(paymentDay('2026-10-31'), '2026-10-31');
assert.equal(paymentDay('2026-10-31T22:30:00Z'), '2026-11-01'); // 00:30 за Києвом (EET, UTC+2 з 25.10)
assert.equal(paymentDay('2026-07-31T21:30:00Z'), '2026-08-01'); // літо, UTC+3
assert.equal(paymentDay(''), null);
assert.equal(paymentDay('не дата'), null);

const src: Record<string, string> = { a: 'Google', b: 'Instagram' };
const r = bucketPayments(
  [
    { clientId: 'a', at: '2026-10-05', amount: 100 },
    { clientId: 'a', at: '2026-10-05', amount: 50.25 },
    { clientId: 'b', at: '2026-10-05', amount: 400 },
    { clientId: 'zzz', at: '2026-11-02', amount: 10 },   // невідомий клієнт
    { clientId: 'a', at: '2026-11-03', amount: null },   // без суми
    { clientId: 'a', at: '', amount: 999 },              // без дати
  ],
  id => src[id],
);
assert.equal(r.noDate, 1);
assert.equal(r.noAmount, 1);
assert.deepEqual(r.days.map(d => d.date), ['2026-10-05', '2026-11-02', '2026-11-03']);
assert.equal(r.days[0].sum, 550.25);
assert.equal(r.days[0].count, 3);
assert.deepEqual(r.days[0].bySource.map(s => s.source), ['Instagram', 'Google']); // за сумою
assert.equal(r.days[1].bySource[0].source, 'Не вказано');
// Платіж без суми рахується в кількості, але не псує суму
assert.equal(r.days[2].count, 1);
assert.equal(r.days[2].sum, 0);

const agg = aggregateCash(r.days);
assert.equal(agg.count, 5);
assert.equal(agg.sum, 560.25);
assert.deepEqual(agg.byMonth, [
  { month: '2026-10', count: 3, sum: 550.25 },
  { month: '2026-11', count: 2, sum: 10 },
]);
assert.equal(agg.bySource.find(s => s.source === 'Google')!.sum, 150.25);

// Float-шум не накопичується
const f = bucketPayments(
  [{ clientId: null, at: '2026-10-01', amount: 0.1 }, { clientId: null, at: '2026-10-01', amount: 0.2 }],
  () => undefined,
);
assert.equal(f.days[0].sum, 0.3);

console.log('cashPayments.test: ok');

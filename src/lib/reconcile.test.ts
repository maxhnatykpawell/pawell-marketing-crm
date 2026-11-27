import assert from 'node:assert/strict';
import { buildReconcileReport, previousMonthRange, totalsOf } from './reconcile';

const snap = (date: string, l: number, c: number, ag: number, sum: number) => ({
  date, totalLeadsToday: l, totalClientsToday: c, totalAcquiredToday: l + c,
  totalAgreementsToday: ag, totalAgreementsSumToday: sum,
});

// Без змін — порожній звіт
{
  const s = [snap('2026-10-01', 2, 3, 1, 100), snap('2026-10-02', 0, 1, 0, 0)];
  const r = buildReconcileReport(['2026-10-01', '2026-10-02'], s, s);
  assert.equal(r.changedDays, 0);
  assert.equal(r.changes.length, 0);
  assert.deepEqual(r.totalsDelta, { acquired: 0, leads: 0, clients: 0, agreements: 0, agreementsSum: 0 });
}

// Сума угоди й статус ліда змінились у KeepIn уже після знімка
{
  const before = [snap('2026-10-01', 3, 2, 1, 100), snap('2026-10-02', 1, 1, 1, 50)];
  const after = [snap('2026-10-01', 2, 3, 1, 250), snap('2026-10-02', 1, 1, 1, 50)];
  const r = buildReconcileReport(['2026-10-01', '2026-10-02'], before, after);
  assert.equal(r.changedDays, 1);
  assert.equal(r.changes[0].date, '2026-10-01');
  assert.deepEqual(r.changes[0].delta, { acquired: 0, leads: -1, clients: 1, agreements: 0, agreementsSum: 150 });
  assert.equal(r.totalsDelta.agreementsSum, 150);
}

// Новий день, якого не було, і день, що впав (лишається старим, не рахується зміною)
{
  const before = [snap('2026-10-02', 1, 0, 0, 0)];
  const after = [snap('2026-10-01', 4, 0, 2, 10), snap('2026-10-02', 9, 9, 9, 9)];
  const r = buildReconcileReport(['2026-10-01', '2026-10-02'], before, after, ['2026-10-02']);
  assert.equal(r.changedDays, 1);
  assert.equal(r.changes[0].date, '2026-10-01');
  assert.equal(r.changes[0].before, null);
  assert.deepEqual(r.failedDays, ['2026-10-02']);
}

// Старий знімок без totalAcquiredToday
assert.equal(totalsOf({ date: 'x', totalLeadsToday: 2, totalClientsToday: 5 })!.acquired, 7);

// Сортування: найбільша розбіжність першою; float-шум у сумах не створює «зміну»
{
  const before = [snap('2026-10-01', 0, 0, 0, 0.1 + 0.2), snap('2026-10-02', 0, 0, 0, 0)];
  const after = [snap('2026-10-01', 0, 0, 0, 0.3), snap('2026-10-02', 0, 0, 1, 900)];
  const r = buildReconcileReport(['2026-10-01', '2026-10-02'], before, after);
  assert.equal(r.changedDays, 1);
  assert.equal(r.changes[0].date, '2026-10-02');
}

// Попередній місяць (у т.ч. через межу року і високосний лютий)
assert.deepEqual(previousMonthRange('2026-11-01'), { from: '2026-10-01', to: '2026-10-31' });
assert.deepEqual(previousMonthRange('2027-01-01'), { from: '2026-12-01', to: '2026-12-31' });
assert.deepEqual(previousMonthRange('2028-03-05'), { from: '2028-02-01', to: '2028-02-29' });

console.log('reconcile.test: ok');

import assert from 'node:assert/strict';
import { dayOffset, shiftDay, overlayRows, PREV } from './periodOverlay';

assert.equal(dayOffset('2026-10-01', '2026-10-04'), 3);
assert.equal(dayOffset('2026-10-01', '2026-09-30'), -1);
assert.equal(shiftDay('2026-09-30', 1), '2026-10-01'); // перехід через місяць
assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');

type E = { date: string; clients: number };
const e = (date: string, clients: number): E => ({ date, clients });

// 1–3 жовтня проти 28–30 вересня: лягають день до дня
const rows = overlayRows(
  [e('2026-10-01', 5), e('2026-10-02', 6), e('2026-10-03', 7)],
  [e('2026-09-28', 1), e('2026-09-29', 2), e('2026-09-30', 3)],
  '2026-10-01', '2026-09-28', ['clients'],
);
assert.equal(rows.length, 3);
assert.deepEqual(rows.map(r => r.date), ['2026-10-01', '2026-10-02', '2026-10-03']);
assert.deepEqual(rows.map(r => r.prevDate), ['2026-09-28', '2026-09-29', '2026-09-30']);
assert.deepEqual(rows.map(r => r.clients), [5, 6, 7]);
assert.deepEqual(rows.map(r => r[PREV + 'clients']), [1, 2, 3]);

// день без знімка в одному з періодів — розрив, а не нуль
const gaps = overlayRows(
  [e('2026-10-01', 5), e('2026-10-03', 7)],
  [e('2026-09-29', 2)],
  '2026-10-01', '2026-09-28', ['clients'],
);
assert.deepEqual(gaps.map(r => r.date), ['2026-10-01', '2026-10-02', '2026-10-03']);
assert.equal(gaps[1].clients, undefined);
assert.equal(gaps[1][PREV + 'clients'], 2);
assert.equal(gaps[2][PREV + 'clients'], undefined);

// без попереднього періоду рядки лишаються рівно поточними
const only = overlayRows([e('2026-10-01', 5)], [], '2026-10-01', '2026-09-30', ['clients']);
assert.equal(only.length, 1);
assert.equal(only[0].clients, 5);
assert.equal(PREV + 'clients' in only[0], false);

// вхідні дані не мутуються
const src = [e('2026-10-01', 5)];
overlayRows(src, [e('2026-09-30', 1)], '2026-10-01', '2026-09-30', ['clients']);
assert.deepEqual(src, [{ date: '2026-10-01', clients: 5 }]);

console.log('periodOverlay tests passed');

import assert from 'node:assert/strict';
import {
  buildPowerContext, computePower, computeAllPower, tierOfScore, sanitizePowerInput, isEmptyPowerInput,
  addMonths, monthsBetween, TIER1_MIN, TIER2_MIN, attachPower, summarizePower, matchesPowerFocus,
} from './clientPower';
import type { ClientRecord } from './clientAnalytics';

const NOW = new Date(2026, 10, 15); // листопад 2026 → поточний місяць 2026-11

/** Клієнт з обороту й місячними покупками: months — { 'YYYY-MM': сума } */
function client(id: string, revenue: number, months: Record<string, number> = {}, extra: Partial<ClientRecord> = {}): ClientRecord {
  const monthlyStats = Object.fromEntries(Object.entries(months).map(([m, r]) => [m, { revenue: r, deals: 1 }]));
  return { id, name: 'К' + id, revenue, agreementsCount: Object.keys(months).length || 1, tags: [], monthlyStats, ...extra };
}

// ── Місяці ───────────────────────────────────────────────────────────────────
assert.equal(addMonths('2026-11', -11), '2025-12');
assert.equal(addMonths('2026-01', -1), '2025-12');
assert.equal(addMonths('2026-12', 1), '2027-01');
assert.equal(monthsBetween('2025-12', '2026-11'), 11);

// ── Оборот: місце серед усіх клієнтів ────────────────────────────────────────
{
  // 20 клієнтів: оборот 2000, 1900 … 100 → топ-10% це два перші
  const all = Array.from({ length: 20 }, (_, i) => client('c' + i, (20 - i) * 100));
  const ctx = buildPowerContext(all, NOW);
  const score = (id: string) => computePower(all.find(c => c.id === id)!, undefined, ctx).scores.revenue;
  assert.equal(score('c0'), 3, 'перший — топ-10%');
  assert.equal(score('c1'), 3, 'другий із двадцяти — межа топ-10% включно');
  assert.equal(score('c2'), 2, 'третій — вже не топ-10%');
  assert.equal(score('c7'), 2, 'восьмий із двадцяти (40%) — межа включно');
  assert.equal(score('c8'), 1, 'дев’ятий — нижче топ-40%');
  assert.equal(score('c19'), 1);
}
// Однаковий оборот — однаковий бал, незалежно від порядку в списку
{
  const all = [client('a', 1000), client('b', 500), client('c', 500), client('d', 500), ...Array.from({ length: 6 }, (_, i) => client('x' + i, 10 + i))];
  const ctx = buildPowerContext(all, NOW);
  const s = (id: string) => computePower(all.find(c => c.id === id)!, undefined, ctx).scores.revenue;
  assert.equal(s('b'), s('c'));
  assert.equal(s('c'), s('d'));
}
// Клієнт без обороту не ранжується
{
  const all = [client('a', 1000), client('zero', 0)];
  const r = computePower(all[1], undefined, buildPowerContext(all, NOW));
  assert.equal(r.scores.revenue, null);
  assert.equal(r.tier, null, 'без обороту тіра немає');
}

// ── Частота ──────────────────────────────────────────────────────────────────
{
  const ctxOf = (c: ClientRecord) => buildPowerContext([c], NOW);
  const freq = (c: ClientRecord, input = {}) => computePower(c, input, ctxOf(c)).scores.frequency;

  // Купує щомісяця майже без пропусків за 12 місяців
  const monthly: Record<string, number> = {};
  for (let i = 0; i < 12; i++) if (i !== 3) monthly[addMonths('2026-11', -i)] = 100;
  assert.equal(freq(client('m', 1100, monthly)), 3, '11 з 12 місяців = щомісяця');

  // Кілька разів на рік
  assert.equal(freq(client('s', 300, { '2026-02': 100, '2026-06': 100, '2026-09': 100 })), 2);
  // Разово
  assert.equal(freq(client('o', 100, { '2025-03': 100 })), 1);
  // Дві покупки давно, поза вікном 12 місяців, — це вже не «кілька разів на рік»
  assert.equal(freq(client('old', 200, { '2023-01': 100, '2023-02': 100 })), 1);
  // Рамковий договір — завжди «щомісяця»
  assert.equal(freq(client('f', 100, { '2025-03': 100 }), { framework: true }), 3);

  // Новий клієнт: вікно коротке, купує кожен місяць
  assert.equal(freq(client('new', 400, { '2026-08': 100, '2026-09': 100, '2026-10': 100, '2026-11': 100 })), 3, 'нові з регулярними покупками');
  // Двомісячний клієнт не може бути «щомісячним» — вікно закоротке
  assert.equal(freq(client('new2', 200, { '2026-10': 100, '2026-11': 100 })), 2);

  // Старий формат знімків: лише перелік місяців
  const legacy: ClientRecord = { id: 'l', name: 'L', revenue: 100, agreementsCount: 1, tags: [], purchaseMonths: ['2026-05'] };
  assert.equal(freq(legacy), 1);
  // Без дат взагалі — за кількістю угод
  assert.equal(freq({ id: 'n', name: 'N', revenue: 100, agreementsCount: 3, tags: [] }), 2);
}

// ── Потенціал: частка нашої річної виручки ───────────────────────────────────
{
  // Річна виручка = 10 000 000 (за останні 12 місяців)
  const big = client('big', 10_000_000, { '2026-05': 10_000_000 });
  const c = client('c', 500, { '2026-05': 500 });
  const ctx = buildPowerContext([big, c], NOW);
  assert.equal(ctx.annualRevenue, 10_000_500);
  const pot = (uah?: number | null) => computePower(c, { potentialUah: uah }, ctx).scores.potential;
  assert.equal(pot(50_000), 1, '0,5% — менше 1%');
  assert.equal(pot(100_000), 1, '0,9999% — ще менше 1% (річна виручка 10 000 500)');
  assert.equal(pot(100_005), 2, '1% — межа включно');
  assert.equal(pot(500_000), 2, '5% — ще 1–5%');
  assert.equal(pot(600_000), 3, 'понад 5%');
  assert.equal(pot(undefined), null, 'не введено — не оцінено');
  assert.equal(pot(null), null);
}
// Покупки старші за 12 місяців у річну виручку не входять
{
  const a = client('a', 1000, { '2026-05': 100, '2024-01': 900 });
  assert.equal(buildPowerContext([a], NOW).annualRevenue, 100);
}
// Немає помісячних даних → потенціал оцінити нема з чим
{
  const legacy: ClientRecord = { id: 'l', name: 'L', revenue: 100, agreementsCount: 1, tags: [], purchaseMonths: ['2026-05'] };
  const ctx = buildPowerContext([legacy], NOW);
  assert.equal(ctx.annualRevenue, null);
  assert.equal(computePower(legacy, { potentialUah: 5000 }, ctx).scores.potential, null);
}

// ── Контракт і глибина ───────────────────────────────────────────────────────
{
  const c = client('c', 100, { '2026-05': 100 });
  const ctx = buildPowerContext([c], NOW);
  const r = (i: object) => computePower(c, i, ctx).scores;
  assert.equal(r({ contractSize: 'large' }).contract, 3);
  assert.equal(r({ contractSize: 'medium' }).contract, 2);
  assert.equal(r({ contractSize: 'small' }).contract, 1);
  assert.equal(r({ contractSize: 'none' }).contract, 1);
  assert.equal(r({}).contract, null);
  assert.equal(r({ contacts: 0 }).depth, 1);
  assert.equal(r({ contacts: 1 }).depth, 1);
  assert.equal(r({ contacts: 2 }).depth, 2);
  assert.equal(r({ contacts: 4 }).depth, 2);
  assert.equal(r({ contacts: 5 }).depth, 3);
  assert.equal(r({}).depth, null);
}

// ── Тір за сумою ─────────────────────────────────────────────────────────────
assert.equal(tierOfScore(15, true), 1);
assert.equal(tierOfScore(TIER1_MIN, true), 1);
assert.equal(tierOfScore(TIER1_MIN, false), 2, 'без повного акаунта Tier 1 недоступний');
assert.equal(tierOfScore(TIER1_MIN - 1, true), 2, 'повний акаунт без суми — теж не Tier 1');
assert.equal(tierOfScore(TIER2_MIN, false), 2);
assert.equal(tierOfScore(TIER2_MIN - 1, false), 3);
assert.equal(tierOfScore(5, false), 3);

// ── Повний сценарій і попередній тір ─────────────────────────────────────────
{
  // Топ-клієнт, що купує щомісяця: оборот 3 + частота 3 = 6, решта ще не оцінена (по 1) → 9 → Tier 2 попередньо
  const monthly: Record<string, number> = {};
  for (let i = 0; i < 12; i++) monthly[addMonths('2026-11', -i)] = 1000;
  const star = client('star', 12000, monthly);
  const others = Array.from({ length: 9 }, (_, i) => client('o' + i, 100 + i, { '2026-05': 100 }));
  const all = [star, ...others];
  const ctx = buildPowerContext(all, NOW);

  const prelim = computePower(star, undefined, ctx);
  assert.equal(prelim.complete, false);
  assert.deepEqual(prelim.missing, ['potential', 'contract', 'depth']);
  assert.equal(prelim.score, 3 + 1 + 3 + 1 + 1, 'відсутні ознаки — по 1 балу');
  assert.equal(prelim.tier, 2, 'попередній тір: щонайменше Tier 2');

  const full = computePower(star, { potentialUah: 5_000_000, contractSize: 'large', contacts: 6, fullAccount: true }, ctx);
  assert.equal(full.complete, true);
  assert.equal(full.score, 15);
  assert.equal(full.tier, 1);

  // Те саме без позначки «повний акаунт» — найвищий Tier 2
  const noFull = computePower(star, { potentialUah: 5_000_000, contractSize: 'large', contacts: 6 }, ctx);
  assert.equal(noFull.score, 15);
  assert.equal(noFull.tier, 2);

  const m = computeAllPower(all, { star: { contacts: 6, fullAccount: true } }, NOW);
  assert.equal(m.size, 10);
  assert.equal(m.get('star')!.fullAccount, true);
  assert.equal(m.get('o0')!.fullAccount, false);
}

// ── Підписи-пояснення ────────────────────────────────────────────────────────
{
  const c = client('c', 100, { '2026-05': 100 });
  const r = computePower(c, { contacts: 3 }, buildPowerContext([c], NOW));
  assert.match(r.notes.revenue!, /топ-/);
  assert.match(r.notes.depth!, /3 контакти/);
  assert.equal(r.notes.potential, 'Не оцінено');
}

// ── Санітизація ввода ────────────────────────────────────────────────────────
assert.deepEqual(sanitizePowerInput(null), {});
assert.deepEqual(sanitizePowerInput('сміття'), {});
assert.deepEqual(sanitizePowerInput({ potentialUah: 1_500_000.7, contractSize: 'medium', contacts: 4, framework: true }), {
  potentialUah: 1_500_001, contractSize: 'medium', contacts: 4, framework: true,
});
assert.deepEqual(sanitizePowerInput({ potentialUah: -5 }), {}, 'від’ємне відкидається, а не стає нулем');
assert.deepEqual(sanitizePowerInput({ potentialUah: '100' }), {}, 'рядок не число');
assert.deepEqual(sanitizePowerInput({ potentialUah: Infinity }), {});
assert.deepEqual(sanitizePowerInput({ potentialUah: 1e15 }), {});
assert.deepEqual(sanitizePowerInput({ contractSize: 'huge' }), {});
assert.deepEqual(sanitizePowerInput({ contacts: 2.5 }), {});
assert.deepEqual(sanitizePowerInput({ contacts: 9999 }), {});
assert.deepEqual(sanitizePowerInput({ fullAccount: true, contacts: 3 }), { contacts: 3 }, 'повний акаунт без 5 контактів не приймається');
assert.deepEqual(sanitizePowerInput({ fullAccount: true, contacts: 5 }), { contacts: 5, fullAccount: true });
assert.deepEqual(sanitizePowerInput({ framework: false, evil: '<script>' }), {}, 'зайві поля не проходять');
assert.equal(isEmptyPowerInput({}), true);
assert.equal(isEmptyPowerInput({ contacts: 0 }), false, 'нуль контактів — це відповідь, а не порожнеча');

// ── Зведення й фокус ─────────────────────────────────────────────────────────
{
  const mk = (id: string, tier: 1 | 2 | 3 | null, complete: boolean, periodRevenue: number) => ({
    id, periodRevenue,
    power: { tier, complete, score: 10, missing: [], scores: {}, notes: {}, fullAccount: false } as any,
  });
  const rows: any[] = [mk('a', 1, true, 600), mk('b', 2, false, 300), mk('c', 2, true, 100), mk('d', null, false, 50), { id: 'e', periodRevenue: 5 }];
  const sum = summarizePower(rows);
  assert.deepEqual(sum.rows.map(r => r.count), [1, 2, 0]);
  assert.equal(sum.rows[0].share, 0.6);
  assert.equal(sum.rows[1].incomplete, 1);
  assert.equal(sum.incompleteTotal, 1);
  assert.equal(sum.unranked, 2, 'без тіру і без результату');
  assert.equal(sum.total, 5);
  assert.equal(matchesPowerFocus(rows[0].power, 1), true);
  assert.equal(matchesPowerFocus(rows[0].power, 2), false);
  assert.equal(matchesPowerFocus(rows[1].power, 'incomplete'), true);
  assert.equal(matchesPowerFocus(rows[2].power, 'incomplete'), false);
  assert.equal(matchesPowerFocus(rows[3].power, null), true, 'без фокуса бачимо всіх');
  assert.equal(matchesPowerFocus(rows[3].power, 3), false);
  assert.equal(matchesPowerFocus(undefined, 1), false);

  const attached = attachPower([{ id: 'x' }, { id: 'y' }], new Map([['x', rows[0].power]]));
  assert.ok(attached[0].power && !attached[1].power);
}

console.log('clientPower tests passed');

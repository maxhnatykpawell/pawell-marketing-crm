import { decideStartupLtv, lastNightlySlot, LTV_RETRY_AFTER_ERROR_MS } from './startupSync';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

// Зима: Київ = UTC+2, тож 03:00 Києва = 01:00 UTC; літо: UTC+3, 03:00 Києва = 00:00 UTC
console.log('\nОстанній нічний слот');
check('після 03:00 — сьогоднішній (зима)', lastNightlySlot(new Date('2026-11-02T10:00:00Z')).toISOString(), '2026-11-02T01:00:00.000Z');
check('до 03:00 — учорашній (зима)', lastNightlySlot(new Date('2026-11-02T00:30:00Z')).toISOString(), '2026-11-01T01:00:00.000Z');
check('літо: слот о 00:00 UTC', lastNightlySlot(new Date('2026-07-15T12:00:00Z')).toISOString(), '2026-07-15T00:00:00.000Z');

console.log('\nРішення на старті');
const NOW = new Date('2026-11-02T10:00:00Z'); // 12:00 за Києвом

check('знімка немає — рахуємо', decideStartupLtv(null, NOW).run, true);
check('дата зіпсована — рахуємо', decideStartupLtv({ lastSyncedAt: 'не дата' }, NOW).run, true);

// Нічний прогін відбувся о 03:00 Києва (01:00 UTC) — рестарт опівдні нічого не вантажить
const fresh = decideStartupLtv({ lastSyncedAt: '2026-11-02T01:05:00Z' }, NOW);
check('нічний прогін був сьогодні — пропускаємо', fresh.run, false);
check('причина називає свіжість', fresh.reason.includes('свіжий'), true);

// Саме сценарій користувача: рестарт через годину після прогону
check('рестарт через годину після прогону — пропускаємо', decideStartupLtv({ lastSyncedAt: '2026-11-02T09:00:00Z' }, NOW).run, false);

// Сервер лежав уночі й прогін не відбувся: знімок учорашній
const missed = decideStartupLtv({ lastSyncedAt: '2026-11-01T01:05:00Z' }, NOW);
check('нічний прогін пропущено — наздоганяємо', missed.run, true);
check('причина називає пропуск', missed.reason.includes('пропущено'), true);

// Старт до 03:00: учорашній прогін ще актуальний
check('о 02:00 знімок з учорашньої ночі — ще свіжий',
  decideStartupLtv({ lastSyncedAt: '2026-11-01T01:05:00Z' }, new Date('2026-11-02T00:00:00Z')).run, false);

console.log('\nПісля збою');
const failedRecently = decideStartupLtv({ lastSyncedAt: '2026-11-02T01:05:00Z', lastSyncError: 'x', lastSyncErrorAt: new Date(NOW.getTime() - 10 * 60_000).toISOString() }, NOW);
check('збій 10 хв тому — не б\'ємо знову', failedRecently.run, false);
check('збій давно — повторюємо', decideStartupLtv({ lastSyncedAt: '2026-11-01T01:05:00Z', lastSyncError: 'x', lastSyncErrorAt: new Date(NOW.getTime() - LTV_RETRY_AFTER_ERROR_MS - 1000).toISOString() }, NOW).run, true);
check('збій без дати — повторюємо', decideStartupLtv({ lastSyncedAt: '2026-11-01T01:05:00Z', lastSyncError: 'x' }, NOW).run, true);

if (failures > 0) { console.log(`\n❌ Провалено: ${failures}`); process.exit(1); }
console.log('\n✅ Усі перевірки пройдено');

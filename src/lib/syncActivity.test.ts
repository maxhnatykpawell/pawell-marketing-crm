import { formatElapsed, describeRange, describeTrigger, isSyncBusy } from './syncActivity';
import type { KeepInCRMSyncStatus } from '../api';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

const idle = (): KeepInCRMSyncStatus => ({
  running: false, type: null, total: 0, done: 0, pct: 0, currentDate: '', startedAt: null, finishedAt: null, error: null,
  ltv: { running: false, trigger: null, range: null, phase: '', done: 0, total: 0, pct: null, startedAt: null, finishedAt: null, error: null },
  today: false, rateLimitedUntil: null, startupLtv: null,
});

console.log('\nІндикатор синхронізації');
check('нічого не йде', isSyncBusy(idle()), false);
check('немає даних — не зайнято', isSyncBusy(null), false);
check('іде історія', isSyncBusy({ ...idle(), running: true }), true);
check('іде LTV', isSyncBusy({ ...idle(), ltv: { ...idle().ltv, running: true } }), true);
check('іде оновлення за сьогодні', isSyncBusy({ ...idle(), today: true }), true);
// Помилка минулого прогону — не «зайнято»
check('стара помилка LTV — не зайнято', isSyncBusy({ ...idle(), ltv: { ...idle().ltv, error: 'x' } }), false);

check('секунди', formatElapsed(45_000), '45 с');
check('хвилини з нулем', formatElapsed(125_000), '2 хв 05 с');
check('від\'ємний час не ламається', formatElapsed(-500), '0 с');

check('весь час', describeRange(null), 'за весь час');
check('обидві межі порожні — теж весь час', describeRange({ from: null, to: null }), 'за весь час');
check('період', describeRange({ from: '2026-01-01', to: '2026-11-02' }), '2026-01-01 — 2026-11-02');
check('напіввідкритий', describeRange({ from: '2026-01-01', to: null }), '2026-01-01 — …');

check('ручний', describeTrigger('manual'), 'запущено вручну');
check('нічний', describeTrigger('cron').includes('03:00'), true);
check('без причини', describeTrigger(null), '');

if (failures > 0) { console.log(`\n❌ Провалено: ${failures}`); process.exit(1); }
console.log('\n✅ Усі перевірки пройдено');

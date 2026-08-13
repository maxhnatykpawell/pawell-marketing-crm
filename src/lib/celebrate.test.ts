import { celebrate, onCelebrate, resetCelebrateCooldown } from './celebrate';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

console.log('\nСигнал святкування');
{
  resetCelebrateCooldown();
  let fired = 0;
  const off = onCelebrate(() => { fired++; });

  const t0 = 1_000_000;
  celebrate(t0);
  check('перший виклик спрацьовує', fired, 1);

  // Масове закриття десяти карток — одна подія для людини, один залп
  for (let i = 1; i <= 9; i++) celebrate(t0 + i);
  check('серія в межах вікна — без повторів', fired, 1);

  celebrate(t0 + 399);
  check('на межі вікна ще тихо', fired, 1);

  celebrate(t0 + 400);
  check('після вікна спрацьовує знову', fired, 2);

  off();
  celebrate(t0 + 5000);
  check('після відписки не викликається', fired, 2);
}
{
  resetCelebrateCooldown();
  let a = 0, b = 0;
  const offA = onCelebrate(() => { a++; });
  const offB = onCelebrate(() => { b++; });
  celebrate(2_000_000);
  check('усі підписники отримують сигнал', [a, b], [1, 1]);
  offA(); offB();
}

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

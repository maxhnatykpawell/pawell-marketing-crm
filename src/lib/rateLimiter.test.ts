import { createSlotLimiter } from './rateLimiter';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

/** Віртуальний годинник: sleep просто пересуває час уперед */
function clock() {
  let t = 1_000_000;
  return { now: () => t, sleep: async (ms: number) => { t += ms; }, at: () => t };
}

(async () => {
  console.log('\nТемп запитів');

  // 120 запитів поспіль при ліміті 80/хв не можуть вкластись швидше за 89 секунд
  {
    const c = clock();
    const lim = createSlotLimiter(c.now, c.sleep);
    const t0 = c.at();
    for (let i = 0; i < 120; i++) await lim.take(80);
    check('120 запитів при 80/хв — не швидше за 89 с', (c.at() - t0) / 1000 >= 89, true);
  }

  // У жодному вікні в 60 с не більше 80 запитів
  {
    const c = clock();
    const lim = createSlotLimiter(c.now, c.sleep);
    const stamps: number[] = [];
    for (let i = 0; i < 300; i++) { await lim.take(80); stamps.push(c.at()); }
    let worst = 0;
    for (let i = 0, j = 0; i < stamps.length; i++) {
      while (stamps[i] - stamps[j] >= 60_000) j++;
      worst = Math.max(worst, i - j + 1);
    }
    check('найбільше запитів у будь-якій хвилині ≤ 80', worst <= 80, true);
  }

  // Паралельні виклики теж стають у чергу, а не стартують разом
  {
    // Фіксуємо, скільки кожен виклик просить почекати: усі п'ять стартують
    // одночасно, і слоти мають розійтись на рівні проміжки
    const waits: number[] = [];
    const lim = createSlotLimiter(() => 1_000_000, async ms => { waits.push(ms); });
    await Promise.all(Array.from({ length: 5 }, () => lim.take(60)));
    check('5 паралельних при 60/хв — перший без очікування, решта 1–4 с', waits.sort((a, b) => a - b), [1000, 2000, 3000, 4000]);
  }

  // Пауза після 429 зсуває наступні запити
  {
    const c = clock();
    const lim = createSlotLimiter(c.now, c.sleep);
    await lim.take(80);
    lim.pauseUntil(c.at() + 30_000);
    const before = c.at();
    await lim.take(80);
    check('після 429 наступний запит чекає паузу', c.at() - before >= 30_000, true);
  }

  // Пауза не скорочує чергу, що вже довша
  {
    const c = clock();
    const lim = createSlotLimiter(c.now, c.sleep);
    for (let i = 0; i < 10; i++) await lim.take(60);
    const before = c.at();
    lim.pauseUntil(before - 5_000);
    await lim.take(60);
    check('пауза в минулому нічого не змінює', c.at() - before <= 1_000, true);
  }

  if (failures > 0) { console.log(`\n❌ Провалено: ${failures}`); process.exit(1); }
  console.log('\n✅ Усі перевірки пройдено');
})();

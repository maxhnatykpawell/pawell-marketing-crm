/**
 * Рівномірний темп запитів до зовнішнього API.
 *
 * Ліміт KeepInCRM — 100 запитів на хвилину на ключ. Запити, що йдуть підряд,
 * вибирають його за секунди (синхронізація LTV чи історії за період — це сотні
 * сторінок), і далі кожен отримує «Rate limit exceeded». Тому запити не
 * кидаються разом, а ставляться в чергу зі слотами через рівні проміжки.
 *
 * Лічильник один на процес: усі синхронізації ходять тим самим ключем, тож і
 * чергу мають ділити, а не кожна рахувати свій ліміт окремо.
 *
 * Час і очікування передаються ззовні, щоб темп можна було перевірити тестом
 * без справжніх хвилин очікування.
 */
export function createSlotLimiter(
  now: () => number = () => Date.now(),
  sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
) {
  let nextSlot = 0;

  return {
    /** Дочекатись свого слоту; чекати можна з кількох місць одразу */
    async take(perMinute: number): Promise<void> {
      const gap = 60_000 / perMinute;
      const start = Math.max(now(), nextSlot);
      nextSlot = start + gap;
      const wait = start - now();
      if (wait > 0) await sleep(wait);
    },

    /**
     * Після відмови 429 пауза потрібна ВСІМ, а не лише тому, хто її отримав:
     * інакше сусідні синхронізації продовжать бити в той самий ліміт.
     */
    pauseUntil(timestamp: number): void {
      nextSlot = Math.max(nextSlot, timestamp);
    },
  };
}

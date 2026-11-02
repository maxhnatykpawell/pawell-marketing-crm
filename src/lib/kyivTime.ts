/**
 * Київський час — одна відповідь на питання «який це день / місяць / зсув».
 *
 * Раніше кожне місце вгадувало по-своєму: сервер ліпив до дат жорсткий `+03:00`
 * (літній зсув, що діє лише з кінця березня до кінця жовтня), а місяць угоди
 * брався через `getMonth()` у часовому поясі процесу — тобто в UTC на хостингу.
 * Обидва підходи дають однаковий результат майже весь рік і розходяться рівно
 * там, де місячний звіт найчутливіший: на межі місяців.
 */

const KYIV = 'Europe/Kyiv';

/** 'YYYY-MM-DD' за київським календарем */
export function kyivYmd(d: Date = new Date()): string {
  return d.toLocaleDateString('sv-SE', { timeZone: KYIV });
}

/**
 * Місяць 'YYYY-MM', до якого належить момент.
 *
 * Дата без часу ('2026-10-31') — це вже календарний день, і її не можна
 * проганяти через Date: вона розпарситься як північ UTC і в поясі позаду UTC
 * з'їде на день назад. Повний момент часу рахуємо за Києвом, а не за поясом
 * сервера: угода о 01:30 першого числа за київським годинником — це вже новий
 * місяць, хоч в UTC ще минулий.
 */
export function kyivMonthOf(value: string | Date): string | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return kyivYmd(d).slice(0, 7);
}

/** Зсув Києва від UTC у момент `at`, формату '+02:00' / '+03:00' */
function kyivOffsetAt(at: Date): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: KYIV, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find(p => p.type === 'timeZoneName')?.value ?? 'GMT+02:00';
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(part);
  return m ? `${m[1]}:${m[2] ?? '00'}` : '+02:00';
}

/**
 * Межі київської доби для фільтрів CRM (`created_at_gteq` / `created_at_lteq`).
 *
 * Зсув береться окремо на початок і на кінець доби: у день переходу на
 * зимовий/літній час ці два зсуви різні.
 */
export function kyivDayBounds(ymd: string): { gteq: string; lteq: string } {
  const [y, m, d] = ymd.split('-').map(Number);
  // Приблизна північ за Києвом (UTC−3 год) і приблизна кінець доби (UTC+21 год):
  // потрібні лише щоб влучити у правильний бік переходу.
  const startGuess = new Date(Date.UTC(y, m - 1, d, 0) - 3 * 3600_000);
  const endGuess = new Date(Date.UTC(y, m - 1, d, 21));
  return {
    gteq: `${ymd}T00:00:00.000${kyivOffsetAt(startGuess)}`,
    lteq: `${ymd}T23:59:59.999${kyivOffsetAt(endGuess)}`,
  };
}

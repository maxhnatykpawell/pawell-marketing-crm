/**
 * Журнал оплат — у якому місяці гроші реально надійшли на рахунок.
 *
 * KeepInCRM віддає по угоді лише загальне «Сплачено», без дат платежів. А звіту
 * потрібен касовий погляд: серпневий контракт, оплачений у вересні, — це гроші
 * вересня. Тому кожна синхронізація порівнює «Сплачено» з тим, що бачила
 * минулого разу, і приріст записує в місяць, коли його побачила.
 *
 * Точність — один прогін синхронізації (щодоби о 03:00). Історію до першого
 * запуску журналу відновити неможливо, тож вона лягає в місяць самої угоди — і
 * звіт чесно каже, з якої дати числа касові (`PaidLedgerMeta.since`).
 *
 * Чиста логіка без мережі й бази, див. paidLedger.test.ts.
 */

/** id угоди → місяць 'YYYY-MM' → скільки оплачено в цьому місяці */
export type PaidLedger = Record<string, Record<string, number>>;

export interface PaidLedgerMeta {
  /**
   * Коли журнал уперше побачив поле оплати. До цього моменту історія лягла в
   * місяць угоди; null — поле ще жодного разу не приходило.
   */
  since: string | null;
}

/** Сума, нижче якої різниця — шум округлення, а не платіж */
const EPS = 0.005;

function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Поле «Сплачено» угоди.
 *
 * null — поля в угоді немає зовсім (а не «нічого не сплачено»). Це різні речі:
 * якщо назва поля в API не та, журнал не повинен вирішити, що всі угоди
 * неоплачені, а потім, коли назву виправлять, звалити всю історію в один місяць.
 */
export function extractAgreementPaid(item: any): number | null {
  for (const key of ['paid', 'paid_sum', 'paid_amount', 'paid_total', 'payed', 'payed_sum', 'payment_sum']) {
    if (item && key in item) {
      const n = parseAmount(item[key]);
      if (n !== null) return n;
    }
  }
  return null;
}

/**
 * Касовий місяць для приросту, побаченого в `now`.
 *
 * Нічний прогін 1-го числа о 03:00 бачить платежі, внесені ввечері останнього
 * дня попереднього місяця, — тому відступаємо на 6 годин. Ручний перерахунок
 * удень 1-го числа вже потрапляє в новий місяць.
 */
export function cashMonth(now: Date): string {
  const shifted = new Date(now.getTime() - 6 * 3600 * 1000);
  return shifted.toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' }).slice(0, 7);
}

function total(entry: Record<string, number> | undefined): number {
  if (!entry) return 0;
  let s = 0;
  for (const v of Object.values(entry)) s += v;
  return s;
}

/**
 * Врахувати поточне «Сплачено» угоди в журналі. Змінює `ledger` на місці.
 *
 * @param agreementMonth місяць угоди — куди лягає історія, поки журнал новий
 * @param month касовий місяць цього прогону (`cashMonth`)
 * @param baseline журнал ще не ініціалізований: усе, що вже сплачено, — історія
 */
export function applyPaid(
  ledger: PaidLedger,
  agreementId: string,
  paidNow: number,
  agreementMonth: string | null,
  month: string,
  baseline: boolean,
): void {
  const entry = ledger[agreementId];
  const diff = paidNow - total(entry);
  if (Math.abs(diff) < EPS) return;

  // Угода, якої журнал ще не знав: на старті це історія, пізніше — нова оплата
  const target = !entry && baseline && agreementMonth ? agreementMonth : month;
  const next = { ...(entry ?? {}) };
  // Повернення коштів чи виправлення суми — теж рух грошей у цьому місяці
  next[target] = Math.round(((next[target] ?? 0) + diff) * 100) / 100;
  if (Math.abs(next[target]) < EPS) delete next[target];

  if (Object.keys(next).length > 0) ledger[agreementId] = next;
  else delete ledger[agreementId];
}

/**
 * Облік записів, які клієнт уже показав на екрані, а сервер ще не підтвердив.
 *
 * ── Яку проблему це розв'язує ────────────────────────────────────────────────
 * Інтерфейс оптимістичний: створив задачу — вона одразу з'являється, а на сервер
 * іде у фоні. Паралельно застосунок раз на 30 с (і при поверненні на вкладку)
 * завантажує весь стан і ЗАМІНЮЄ ним локальний. Якщо така відповідь була
 * надіслана сервером ДО того, як задача на ньому з'явилась, вона затирає щойно
 * створену задачу. Після рефрешу задача є (запис таки дійшов) — або її немає
 * зовсім (запис не вдався, а ніхто про це не сказав).
 *
 * ── Як це розв'язано ─────────────────────────────────────────────────────────
 * Кожен запис реєструється тут. Коли приходить стан із сервера, ми не підміняємо
 * ним локальний «наосліп», а накладаємо поверх нього ті записи, які сервер міг
 * ще не встигнути врахувати (див. overlay).
 *
 * Який запис «міг не встигнути»: годинник у цього модуля логічний (лічильник).
 * Кожна подія — початок завантаження стану, початок і завершення запису — бере
 * наступне число. Запис, що завершився ДО початку завантаження, сервер уже
 * бачив — його накладати не треба. Усе інше (ще в дорозі, або завершився вже
 * після початку завантаження) накладаємо.
 *
 * Накладання ідемпотентне: якщо сервер усе-таки встиг врахувати запис, результат
 * той самий. Тому помилитись «в запас» безпечно, а «в мінус» — ні.
 *
 * Модуль без мережі й без React: див. pendingWrites.test.ts.
 */

export type WriteKind = 'create' | 'update' | 'delete' | 'state';

export interface PendingOp {
  seq: number;
  kind: WriteKind;
  /** Колекція (cards, lists…); для повної синхронізації стану — 'state' */
  type: string;
  id: string;
  /** create — весь обʼєкт; update — лише змінені поля */
  data?: any;
  startedAt: number;
  /** null, поки запис не завершився (або чекає в офлайн-черзі) */
  settledAt: number | null;
  settledWall: number | null;
  startedWall: number;
  /** Якщо запит відкладено в офлайн-чергу — її ідентифікатор */
  queueId?: string;
}

/** Через скільки після завершення запис ще пам'ятаємо — на випадок дуже повільного завантаження стану */
const SETTLED_KEEP_MS = 5 * 60 * 1000;

/**
 * Повна синхронізація стану, що висить довше, перестає блокувати оновлення:
 * інакше один завислий запис назавжди зупинив би отримання чужих змін.
 */
export const STATE_SYNC_BLOCK_MS = 2 * 60 * 1000;

export class PendingWrites {
  private ops: PendingOp[] = [];
  private clock = 0;
  private seq = 0;

  /** Зареєструвати запис, що починається. Викликати синхронно, одразу після оптимістичної зміни. */
  begin(kind: WriteKind, type: string, id: string, data?: any, now = Date.now()): PendingOp {
    const op: PendingOp = {
      seq: ++this.seq,
      kind,
      type,
      id,
      data,
      startedAt: ++this.clock,
      settledAt: null,
      settledWall: null,
      startedWall: now,
    };
    this.ops.push(op);
    return op;
  }

  /** Сервер підтвердив запис */
  settle(op: PendingOp, now = Date.now()): void {
    if (op.settledAt !== null) return;
    op.settledAt = ++this.clock;
    op.settledWall = now;
    this.prune(now);
  }

  /** Запис не вдався: більше не накладаємо його, і локальна зміна зникне при наступному оновленні */
  fail(op: PendingOp): void {
    this.ops = this.ops.filter(o => o !== op);
  }

  /** Позначити початок завантаження стану; повернене число передається в overlay */
  fetchStart(): number {
    return ++this.clock;
  }

  /** Знайти запис за ідентифікатором офлайн-черги */
  byQueueId(queueId: string): PendingOp | undefined {
    return this.ops.find(o => o.queueId === queueId);
  }

  /** Чи є незавершений запис для цього обʼєкта, відкладений в офлайн-чергу */
  hasQueuedFor(type: string, id: string): boolean {
    return this.ops.some(o => o.type === type && o.id === id && o.settledAt === null && !!o.queueId);
  }

  /** Скільки записів ще не підтверджено */
  get unsettledCount(): number {
    return this.ops.filter(o => o.settledAt === null).length;
  }

  /**
   * Чи йде (або щойно завершилась) повна синхронізація стану.
   *
   * Її не можна «накласти»: вона переписує десятки колекцій одразу. Поки вона
   * триває, відповідь сервера просто відкладаємо й завантажуємо стан знову.
   */
  stateSyncInFlight(fetchStart: number, now = Date.now()): boolean {
    return this.ops.some(o =>
      o.kind === 'state'
      && (
        (o.settledAt === null && now - o.startedWall < STATE_SYNC_BLOCK_MS)
        || (o.settledAt !== null && o.settledAt > fetchStart)
      ),
    );
  }

  /**
   * Накласти записи, яких сервер міг ще не бачити, на стан, отриманий від нього.
   * Повертає НОВИЙ обʼєкт; вхідний не змінюється.
   */
  overlay<S extends Record<string, any>>(server: S, fetchStart: number): S {
    const relevant = this.ops
      .filter(o => o.kind !== 'state' && (o.settledAt === null || o.settledAt > fetchStart))
      .sort((a, b) => a.seq - b.seq);
    if (relevant.length === 0) return server;

    const out: Record<string, any> = { ...server };
    // Копіюємо колекцію один раз, при першій зміні, а не на кожен запис
    const copied = new Set<string>();
    const list = (type: string): any[] => {
      if (!copied.has(type)) {
        out[type] = Array.isArray(out[type]) ? [...out[type]] : [];
        copied.add(type);
      }
      return out[type];
    };

    for (const op of relevant) {
      const items = list(op.type);
      const idx = items.findIndex(i => i?.id === op.id);
      switch (op.kind) {
        case 'create':
          // Сервер уже має обʼєкт — його версія свіжіша за нашу, не чіпаємо
          if (idx === -1) items.push(op.data);
          break;
        case 'update':
          if (idx !== -1) items[idx] = { ...items[idx], ...op.data };
          break;
        case 'delete':
          if (idx !== -1) items.splice(idx, 1);
          break;
      }
    }
    return out as S;
  }

  private prune(now: number): void {
    this.ops = this.ops.filter(o => o.settledWall === null || now - o.settledWall < SETTLED_KEEP_MS);
  }
}

// ── Розбір офлайн-черги ──────────────────────────────────────────────────────

export interface QueuedRequest {
  id: string;
  url: string;
  options: { method?: string; body?: any };
}

/**
 * Що означає запит, який лежить в офлайн-черзі.
 *
 * Після перезавантаження сторінки памʼять про записи втрачена, а черга в
 * localStorage лишилась: за нею відновлюємо «ще не підтверджене», інакше задача,
 * створена без звʼязку, не була б видна, доки черга не відправиться.
 */
export function describeQueued(req: QueuedRequest): Omit<PendingOp, 'seq' | 'startedAt' | 'settledAt' | 'settledWall' | 'startedWall'> | null {
  const method = (req.options.method || 'GET').toUpperCase();
  if (req.url === '/api/state' && method === 'POST') {
    return { kind: 'state', type: 'state', id: 'state', queueId: req.id };
  }
  const m = req.url.match(/^\/api\/entity\/([A-Za-z]+)(?:\/([^/?#]+))?$/);
  if (!m) return null;
  const type = m[1];
  const id = m[2] ? decodeURIComponent(m[2]) : undefined;

  if (method === 'POST' && !id) {
    const bodyId = req.options.body?.id;
    return bodyId ? { kind: 'create', type, id: String(bodyId), data: req.options.body, queueId: req.id } : null;
  }
  if (method === 'PUT' && id) return { kind: 'update', type, id, data: req.options.body, queueId: req.id };
  if (method === 'DELETE' && id) return { kind: 'delete', type, id, queueId: req.id };
  return null;
}

// ── Повідомлення про помилку запису ──────────────────────────────────────────

const WHAT: Record<string, string> = {
  cards: 'задачу', lists: 'список', tags: 'тег', users: 'користувача', contentPlans: 'контент-план',
  userGroups: 'групу', events: 'подію', projects: 'проєкт', phases: 'фазу', processes: 'процес',
  boards: 'дошку', expenses: 'витрату', payrolls: 'розрахунок', notifications: 'сповіщення', state: 'зміни',
};

const DOING: Record<WriteKind, string> = {
  create: 'створити',
  update: 'зберегти зміни',
  delete: 'видалити',
  state: 'зберегти',
};

/** Людське пояснення, чому запис не вдався, — без технічних кодів у першому рядку */
export function writeErrorMessage(kind: WriteKind, type: string, status: number | null): string {
  const what = WHAT[type] ?? 'дані';
  const action = kind === 'update' || kind === 'state' ? DOING[kind] : `${DOING[kind]} ${what}`;
  const prefix = `Не вдалось ${action}`;
  if (status === 401) return `${prefix}: сесія закінчилась. Увійдіть знову. Зміни скасовано.`;
  if (status === 403) return `${prefix}: немає прав на цю дію. Зміни скасовано.`;
  if (status === 404) return `${prefix}: обʼєкта вже не існує. Зміни скасовано.`;
  if (status === null) return `${prefix}: немає звʼязку із сервером. Зміни скасовано.`;
  return `${prefix}: сервер не зміг це зберегти (код ${status}). Зміни скасовано.`;
}

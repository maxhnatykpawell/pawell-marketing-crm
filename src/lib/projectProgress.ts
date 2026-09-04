/**
 * Скільки проєкту вже зроблено.
 *
 * Задача в цьому застосунку завершується двома різними жестами: галочкою на
 * картці (isCompleted) або переносом у останню колонку дошки. Обидва сигнали
 * рівноправні — так їх і читає решта коду, коли вирішує, чи картка прострочена
 * (див. Board, BoardCard, BoardList). Плитка проєкту довго рахувала лише
 * колонку й не бачила галочки, тож проєкт, закритий галочками, показував 0%.
 *
 * Тому правило зібране тут одне на всіх: картка зроблена, якщо стоїть галочка
 * або вона лежить у останній колонці своєї дошки.
 *
 * «Остання колонка» — це найбільший order у межах дошки картки, а не в межах
 * усіх списків одразу: дошок кілька, і остання колонка кожної своя.
 */
import { Card, List } from '../types';

type ListShape = Pick<List, 'id' | 'order' | 'boardId'>;
type CardShape = Pick<Card, 'listId' | 'isCompleted'>;

/**
 * Останні колонки — по одній на дошку.
 *
 * Списки зі старих дощок можуть не мати boardId; вони належать одній спільній
 * дошці, тож і рахуються як одна група, а не як безліч окремих.
 */
export function doneListIds(lists: ListShape[]): Set<string> {
  const lastPerBoard = new Map<string, ListShape>();
  for (const list of lists) {
    const board = list.boardId || '';
    const current = lastPerBoard.get(board);
    if (!current || list.order > current.order) lastPerBoard.set(board, list);
  }
  return new Set([...lastPerBoard.values()].map(l => l.id));
}

/** Чи задача зроблена: галочка або остання колонка. */
export function isCardDone(card: CardShape, doneIds: Set<string>): boolean {
  return card.isCompleted === true || doneIds.has(card.listId);
}

export interface ProjectProgress {
  /** Скільки задач у проєкті */
  total: number;
  /** Скільки з них зроблено */
  done: number;
  /** Той самий стан у відсотках, готовий до показу */
  percent: number;
}

/**
 * Прогрес проєкту за його задачами.
 *
 * Набір останніх колонок приходить ззовні готовим: він однаковий для всіх
 * проєктів, а плитки рахуються пачкою — перебирати заради кожної всі списки
 * дошки немає сенсу.
 *
 * Відсоток округлюється, але не до брехні: поки лишилась хоч одна незакрита
 * задача, показуємо щонайбільше 99% — інакше проєкт із 199 закритими з 200
 * виглядав би завершеним. Дзеркально, одна закрита задача з великої купи не
 * має показувати 0%.
 */
export function projectProgress(cards: CardShape[], doneIds: Set<string>): ProjectProgress {
  const total = cards.length;
  const done = cards.filter(c => isCardDone(c, doneIds)).length;
  return { total, done, percent: toPercent(done, total) };
}

function toPercent(done: number, total: number): number {
  if (total === 0 || done === 0) return 0;
  if (done >= total) return 100;
  const rounded = Math.round((done / total) * 100);
  return Math.min(99, Math.max(1, rounded));
}

import {
  resolveRights, availableTools, runReadTool, prepareAction, isWriteTool,
  AssistantUser, ToolContext,
} from './assistantTools';
import type { AppState } from '../types';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

const NOW = new Date('2026-08-13T12:00:00Z');

const state = {
  users: [
    { id: 'u1', name: 'Максим Гнатик', avatar: '', role: 'CMO' },
    { id: 'u2', name: 'Олена Ковальчук', avatar: '', groupId: 'g1' },
  ],
  userGroups: [
    { id: 'g1', name: 'Виконавці', rights: { canEdit: false, allowedViews: ['board', 'profile'] } },
  ],
  lists: [
    { id: 'l1', title: 'Беклог', order: 0 },
    { id: 'l2', title: 'В роботі', order: 1 },
  ],
  cards: [
    { id: 'c1', listId: 'l1', title: 'Лендінг', description: 'Зробити лендінг', deadline: '2026-08-01',
      assigneeId: 'u2', subtasks: [], comments: [], attachments: [], order: 0 },
    { id: 'c2', listId: 'l2', title: 'Розсилка', description: '', deadline: '2026-12-01',
      assigneeId: 'u1', subtasks: [], comments: [], attachments: [], order: 1 },
    { id: 'c3', listId: 'l2', title: 'Старий звіт', description: '', deadline: '2026-01-01',
      assigneeId: null, isCompleted: true, subtasks: [], comments: [], attachments: [], order: 2 },
  ],
  tags: [],
  contentPlans: [],
  expenses: [
    { id: 'e1', title: 'Реклама', amount: 5000, currency: 'UAH', category: 'Маркетинг',
      source: 'Meta Ads', date: '2026-08-05', createdBy: 'u1', createdAt: '' },
    { id: 'e2', title: 'Хостинг', amount: 1200, currency: 'UAH', category: 'Інфраструктура',
      date: '2026-07-01', createdBy: 'u1', createdAt: '' },
  ],
  metrics: [{ id: 'm1', title: 'Ліди', value: '42' }],
} as unknown as AppState;

const admin: AssistantUser = { userId: 'u1', name: 'Максим', role: 'admin' };
const member: AssistantUser = { userId: 'u2', name: 'Олена', role: 'member' };

const ctxFor = (user: AssistantUser): ToolContext => ({
  state, now: NOW, user, rights: resolveRights(state, user), ltv: { ltv: 15000 },
});

console.log('\nПрава');
{
  check('адмін отримує типові права', resolveRights(state, admin).allowedViews.includes('dashboard'), true);
  check('учаснику дістаються права групи', resolveRights(state, member).allowedViews, ['board', 'profile']);
  check('група без права редагування', resolveRights(state, member).canEdit, false);

  const adminTools = availableTools(resolveRights(state, admin), admin).map(t => t.name);
  const memberTools = availableTools(resolveRights(state, member), member).map(t => t.name);

  check('адмін бачить витрати', adminTools.includes('get_expenses_summary'), true);
  check('учасник витрат не бачить', memberTools.includes('get_expenses_summary'), false);
  check('учасник не бачить метрик без дашборда', memberTools.includes('get_key_metrics'), false);
  check('дошка учаснику доступна', memberTools.includes('search_cards'), true);
  check('команда доступна всім', memberTools.includes('get_team'), true);
  // canEdit=false — дій не пропонуємо взагалі
  check('без права редагування дій немає', memberTools.some(isWriteTool), false);
  check('адмін має дії', adminTools.filter(isWriteTool), ['propose_create_card', 'propose_update_card']);
}

console.log('\nПрава застосовуються і при виклику');
{
  // Модель може назвати інструмент, якого їй не давали — це не має спрацювати
  const r = runReadTool('get_expenses_summary', {}, ctxFor(member)) as any;
  check('учасник не дістане витрат навіть прямим викликом', r.error, 'Недостатньо прав для цих даних');

  const w = runReadTool('propose_create_card', { title: 'X' }, ctxFor(admin)) as any;
  check('дію не можна виконати як читання', w.error, 'Цей інструмент змінює дані й тут не виконується');

  check('невідомий інструмент', (runReadTool('drop_database', {}, ctxFor(admin)) as any).error,
    'Невідомий інструмент: drop_database');
}

console.log('\nПошук карток');
{
  const all = runReadTool('search_cards', {}, ctxFor(admin)) as any;
  check('виконані за замовчуванням приховані', all.cards.map((c: any) => c.id), ['c1', 'c2']);
  check('прострочені йдуть першими', all.cards[0].id, 'c1');
  check('прострочення позначено', all.cards[0].overdue, true);

  const overdue = runReadTool('search_cards', { onlyOverdue: true }, ctxFor(admin)) as any;
  check('лише прострочені', overdue.cards.map((c: any) => c.id), ['c1']);

  const mine = runReadTool('search_cards', { onlyMine: true }, ctxFor(member)) as any;
  check('лише свої', mine.cards.map((c: any) => c.id), ['c1']);

  const byName = runReadTool('search_cards', { assigneeName: 'олена' }, ctxFor(admin)) as any;
  check("виконавець за частиною імені", byName.cards.map((c: any) => c.id), ['c1']);

  const byText = runReadTool('search_cards', { query: 'розсил' }, ctxFor(admin)) as any;
  check('пошук за текстом', byText.cards.map((c: any) => c.id), ['c2']);

  // Порожній результат і неіснуюча людина — різні відповіді, інакше модель
  // впевнено доповість «завдань немає»
  const ghost = runReadTool('search_cards', { assigneeName: 'Привид' }, ctxFor(admin)) as any;
  check('неіснуючий виконавець — помилка, а не порожньо', ghost.error, 'Не знайдено людину: Привид');

  const withDone = runReadTool('search_cards', { includeCompleted: true }, ctxFor(admin)) as any;
  check('виконані на вимогу', withDone.total, 3);
}

console.log('\nЗведення й цифри');
{
  const b = runReadTool('get_board_overview', {}, ctxFor(admin)) as any;
  check('колонки за порядком', b.lists.map((l: any) => l.title), ['Беклог', 'В роботі']);
  check('прострочені по дошці', b.totalOverdue, 1);
  check('без виконавця не рахує виконані', b.lists[1].unassigned, 0);

  const m = runReadTool('get_key_metrics', {}, ctxFor(admin)) as any;
  check('метрики дашборда', m.metrics[0].value, '42');
  check('LTV з окремого документа', m.ltv.ltv, 15000);

  const e = runReadTool('get_expenses_summary', { from: '2026-08-01' }, ctxFor(admin)) as any;
  check('витрати від дати', e.total, 5000);
  check('розбивка по категоріях', e.byCategory, [{ name: 'Маркетинг', amount: 5000 }]);
}

console.log('\nДії пропонуються, а не виконуються');
{
  const a = prepareAction('propose_create_card',
    { title: 'Новий банер', listTitle: 'в роботі', assigneeName: 'Олена', deadline: '2026-09-01' },
    ctxFor(admin)) as any;
  check('колонку розв\'язано в id', a.payload.listId, 'l2');
  check('виконавця розв\'язано в id', a.payload.assigneeId, 'u2');
  check('опис для підтвердження', a.summary,
    'Створити завдання «Новий банер» у колонці «В роботі», виконавець Олена Ковальчук, дедлайн 2026-09-01');

  const noList = prepareAction('propose_create_card', { title: 'Без колонки' }, ctxFor(admin)) as any;
  check('без колонки — перша на дошці', noList.payload.listId, 'l1');

  const badUser = prepareAction('propose_create_card',
    { title: 'X', assigneeName: 'Невідомий' }, ctxFor(admin)) as any;
  check('неіснуючий виконавець зупиняє дію', badUser.error, 'Не знайдено виконавця: Невідомий');

  const upd = prepareAction('propose_update_card',
    { cardId: 'c1', deadline: '2026-09-15', isCompleted: true }, ctxFor(admin)) as any;
  check('зміни зібрано', upd.payload.updates, { deadline: '2026-09-15', isCompleted: true });
  check('опис змін', upd.summary, 'Змінити «Лендінг»: дедлайн → 2026-09-15, позначити виконаним');

  const empty = prepareAction('propose_update_card', { cardId: 'c1' }, ctxFor(admin)) as any;
  check('порожня зміна відхиляється', empty.error, 'Не вказано жодної зміни');

  const ghost = prepareAction('propose_update_card', { cardId: 'нема', deadline: '2026-01-01' }, ctxFor(admin)) as any;
  check('неіснуюча картка', ghost.error, 'Картку не знайдено. Спершу знайди її через search_cards');

  const denied = prepareAction('propose_create_card', { title: 'X' }, ctxFor(member)) as any;
  check('без права редагування дія відхиляється', denied.error, 'У вас немає прав на редагування');
}

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

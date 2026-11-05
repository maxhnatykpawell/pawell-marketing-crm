import {
  PROJECT_TOOLS, availableProjectTools, canUseProjectAssistant, isProjectWriteTool,
  runProjectReadTool, prepareProjectActions, listProjectFiles, projectBrief,
  ProjectToolContext, LoadedFile, ProjectFileRef,
} from './projectAssistant';
import { resolveRights, AssistantUser } from './assistantTools';
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
    { id: 'u1', name: 'Максим Гнатик', avatar: '' },
    { id: 'u2', name: 'Олена Ковальчук', avatar: '', groupId: 'g1' },
    { id: 'u3', name: 'Іван Петренко', avatar: '' },
  ],
  userGroups: [
    { id: 'g1', name: 'Читачі', rights: { canEdit: false, allowedViews: ['board', 'projects'] } },
  ],
  lists: [
    { id: 'l1', title: 'Беклог', order: 0 },
    { id: 'l2', title: 'В роботі', order: 1 },
  ],
  tags: [{ id: 't1', name: 'Терміново', color: '#f00' }],
  projects: [
    { id: 'p1', title: 'Запуск лендінгу', status: 'active', goal: 'Збільшити ліди на 30%', description: 'Новий лендінг під кампанію',
      managerIds: ['u1'], ownerId: 'u1', deadline: '2026-09-30', createdAt: '2026-01-01',
      infoFiles: [
        { id: 'if1', name: 'Бриф', url: 'https://docs.google.com/document/d/BRIEF/edit' },
        { id: 'if2', name: 'Бюджет.xlsx', url: '/uploads/budget-1.xlsx' },
      ] },
    { id: 'p2', title: 'Інший проєкт', status: 'active', goal: 'Секретна мета', managerIds: ['u1'], createdAt: '2026-01-01',
      infoFiles: [{ id: 'if9', name: 'Чужий бриф', url: '/uploads/secret.pdf' }] },
    { id: 'p3', title: 'Закритий', status: 'active', managerIds: ['u1'], ownerId: 'u1', memberIds: ['u1'], createdAt: '2026-01-01' },
  ],
  phases: [
    { id: 'ph1', projectId: 'p1', title: 'Дизайн', order: 0, createdAt: '' },
    { id: 'ph2', projectId: 'p2', title: 'Чужий етап', order: 0, createdAt: '' },
  ],
  cards: [
    { id: 'c1', listId: 'l1', projectId: 'p1', phaseId: 'ph1', title: 'Макет hero-блоку', description: 'Зробити макет',
      deadline: '2026-08-01', assigneeId: 'u2', subtasks: [{ id: 's1', title: 'Референси', completed: true }],
      comments: [
        { id: 'm2', authorId: 'u1', text: 'Клієнт просить червоний акцент', createdAt: '2026-08-10T10:00:00Z' },
        { id: 'm1', authorId: 'u2', text: 'Перший варіант готовий', createdAt: '2026-08-05T10:00:00Z' },
      ],
      attachments: [{ id: 'a1', name: 'Референси.pdf', url: '/uploads/refs.pdf', kind: 'file' },
                    { id: 'a2', name: 'Moodboard', url: 'https://miro.com/board/1', kind: 'link' }],
      tagIds: ['t1'], order: 0 },
    { id: 'c2', listId: 'l2', projectId: 'p1', title: 'Текст оферу', description: '', deadline: '2026-12-01',
      assigneeId: null, subtasks: [], comments: [], attachments: [], order: 1 },
    { id: 'c3', listId: 'l2', projectId: 'p1', title: 'Готове', description: '', deadline: null, isCompleted: true,
      assigneeId: 'u1', subtasks: [], comments: [], attachments: [], order: 2 },
    { id: 'c4', listId: 'l1', projectId: 'p2', title: 'Таємна картка іншого проєкту', description: 'секрет',
      deadline: null, assigneeId: 'u1',
      subtasks: [], comments: [{ id: 'mx', authorId: 'u1', text: 'секретний коментар', createdAt: '2026-08-01T00:00:00Z' }],
      attachments: [{ id: 'ax', name: 'Чужий файл', url: '/uploads/other.pdf', kind: 'file' }], order: 3 },
    { id: 'c5', listId: 'l1', projectId: null, title: 'Картка без проєкту', description: '', deadline: null,
      assigneeId: null, subtasks: [], comments: [], attachments: [], order: 4 },
  ],
} as unknown as AppState;

const admin: AssistantUser = { userId: 'u1', name: 'Максим', role: 'admin' };
const reader: AssistantUser = { userId: 'u2', name: 'Олена', role: 'member' };
const outsider: AssistantUser = { userId: 'u3', name: 'Іван', role: 'member' };

const loadCalls: string[] = [];
const loadFile = async (f: ProjectFileRef): Promise<LoadedFile> => {
  loadCalls.push(f.ref);
  if (f.ref === 'info:if1') return { text: 'Бюджет кампанії 50 000 грн\nКанал: Meta Ads', format: 'text' };
  if (f.ref === 'info:if2') return { error: 'Не вдалось прочитати файл' };
  return { text: 'x'.repeat(30000), format: 'text' };
};

let n = 0;
const ctxFor = (user: AssistantUser, projectId = 'p1'): ProjectToolContext => ({
  state, project: state.projects!.find(p => p.id === projectId)!, now: NOW, user,
  rights: resolveRights(state, user), loadFile, newId: () => `id${++n}`,
});

async function main() {
  console.log('\nДоступ');
  {
    const a = ctxFor(admin), r = ctxFor(reader);
    check('адмін користується', canUseProjectAssistant(a.project, admin, a.rights), true);
    check('читач без редагування все одно бачить проєкт', canUseProjectAssistant(r.project, reader, r.rights), true);
    check('закритий проєкт — не для сторонніх',
      canUseProjectAssistant(state.projects![2], outsider, resolveRights(state, outsider)), false);
    check('сторонній не отримує жодного інструмента',
      availableProjectTools(state.projects![2], outsider, resolveRights(state, outsider)).length, 0);

    const adminTools = availableProjectTools(a.project, admin, a.rights).map(t => t.name);
    check('адмін має дії', adminTools.includes('propose_create_cards') && adminTools.includes('propose_update_project'), true);
    const readerTools = availableProjectTools(r.project, reader, r.rights).map(t => t.name);
    check('читач без права редагування — лише читання', readerTools.some(isProjectWriteTool), false);
    check('читач має читальні', readerTools.includes('search_project_cards'), true);

    const closed = ctxFor(outsider, 'p3');
    check('виклик інструмента без прав відхилено',
      await runProjectReadTool('get_project_overview', {}, closed), { error: 'Недостатньо прав для цього проєкту' });
    check('дію без прав відхилено', prepareProjectActions('propose_add_comment', { cardId: 'c1', text: 'x' }, ctxFor(reader)),
      { error: 'У вас немає прав на редагування' });
    check('усі write-інструменти позначені', PROJECT_TOOLS.filter(t => t.writes).every(t => t.requiresEdit), true);
  }

  console.log('\nМежа проєкту');
  {
    const ctx = ctxFor(admin);
    const found: any = await runProjectReadTool('search_project_cards', { includeCompleted: true }, ctx);
    check('лише картки цього проєкту', found.cards.map((c: any) => c.id).sort(), ['c1', 'c2', 'c3']);

    const secret: any = await runProjectReadTool('search_project_cards', { query: 'секрет', includeCompleted: true }, ctx);
    check('чужий вміст не знаходиться', secret.total, 0);

    check('деталі чужої картки недоступні',
      await runProjectReadTool('get_card_details', { cardId: 'c4' }, ctx), { error: 'Картку не знайдено в цьому проєкті' });
    check('картка без проєкту теж не наша',
      await runProjectReadTool('get_card_details', { cardId: 'c5' }, ctx), { error: 'Картку не знайдено в цьому проєкті' });

    const files = listProjectFiles(state, ctx.project).map(f => f.ref);
    check('файли лише проєкту й його карток', files, ['info:if1', 'info:if2', 'att:c1:a1', 'att:c1:a2']);

    const stolen: any = await runProjectReadTool('read_project_file', { ref: 'info:if9' }, ctx);
    check('чужий інфо-файл не читається', stolen.error?.includes('немає в цьому проєкті'), true);
    const stolen2: any = await runProjectReadTool('read_project_file', { ref: 'att:c4:ax' }, ctx);
    check('вкладення чужої картки не читається', stolen2.error?.includes('немає в цьому проєкті'), true);
    check('до loadFile чужі ключі не дійшли', loadCalls.length, 0);

    const overview: any = await runProjectReadTool('get_project_overview', {}, ctx);
    check('огляд: мета', overview.goal, 'Збільшити ліди на 30%');
    check('огляд: лічильники тільки цього проєкту', overview.cards, { total: 3, open: 2, overdue: 1, unassigned: 1 });
    check('огляд: етапи без чужих', overview.phases, [{ title: 'Дизайн', cards: 1, open: 1 }]);
    check('огляд: файлів', overview.files, 4);
  }

  console.log('\nПошук і коментарі');
  {
    const ctx = ctxFor(admin);
    const r: any = await runProjectReadTool('search_project_cards', { query: 'червоний' }, ctx);
    check('знаходить за текстом коментаря', r.cards.map((c: any) => [c.id, c.matchedIn]), [['c1', ['comment']]]);
    const sub: any = await runProjectReadTool('search_project_cards', { query: 'референси' }, ctx);
    check('знаходить за підзадачею', sub.cards[0].matchedIn, ['subtask']);

    const overdue: any = await runProjectReadTool('search_project_cards', { onlyOverdue: true }, ctx);
    check('прострочені', overdue.cards.map((c: any) => c.id), ['c1']);
    const noOne: any = await runProjectReadTool('search_project_cards', { assigneeName: 'Нікого' }, ctx);
    check('невідома людина — помилка, а не порожній список', noOne.error, 'Не знайдено людину: Нікого');
    const noPhase: any = await runProjectReadTool('search_project_cards', { phaseTitle: 'Чужий етап' }, ctx);
    check('етап іншого проєкту не існує', noPhase.error, 'Не знайдено етап: Чужий етап');

    const d: any = await runProjectReadTool('get_card_details', { cardId: 'c1' }, ctx);
    check('коментарі у хронологічному порядку з авторами',
      d.comments.map((c: any) => c.author), ['Олена Ковальчук', 'Максим Гнатик']);
    check('теги', d.tags, ['Терміново']);
    check('ключі вкладень', d.attachments.map((a: any) => a.ref), ['att:c1:a1', 'att:c1:a2']);
  }

  console.log('\nЧитання файлів');
  {
    const ctx = ctxFor(admin);
    const ok: any = await runProjectReadTool('read_project_file', { ref: 'info:if1' }, ctx);
    check('повертає текст', ok.text, 'Бюджет кампанії 50 000 грн\nКанал: Meta Ads');
    check('кінець — без nextOffset', ok.nextOffset, null);

    const err: any = await runProjectReadTool('read_project_file', { ref: 'info:if2' }, ctx);
    check('помилка читання передається, а не ковтається', err.error, 'Не вдалось прочитати файл');

    const big: any = await runProjectReadTool('read_project_file', { ref: 'att:c1:a1' }, ctx);
    check('великий файл — сторінка з nextOffset', big.nextOffset > 0 && big.text.length <= 12000, true);
    const next: any = await runProjectReadTool('read_project_file', { ref: 'att:c1:a1', offset: big.nextOffset }, ctx);
    check('наступна сторінка', next.offset, big.nextOffset);
    check('загальна довжина', next.totalChars, 30000);
  }

  console.log('\nПропозиції: задачі');
  {
    const ctx = ctxFor(admin);
    const r: any = prepareProjectActions('propose_create_cards', { tasks: [
      { title: 'Зібрати відгуки', assigneeName: 'Олена', deadline: '2026-08-20', phaseTitle: 'Дизайн', listTitle: 'В роботі' },
      { title: 'Написати заголовки' },
      { title: 'Зі зламаною датою', deadline: '2026-13-45' },
      { title: 'Невідомий виконавець', assigneeName: 'Привид' },
      { title: 'Початок пізніше', startDate: '2026-09-10', deadline: '2026-09-01' },
      { title: 'Текст оферу' },
      { title: 'Зібрати відгуки' },
      { title: '   ' },
    ] }, ctx);

    check('валідні лишились, погані відсіяні', r.actions.map((a: any) => a.payload.title), ['Зібрати відгуки', 'Написати заголовки']);
    check('усі проблеми названі', r.errors.length, 6);
    check('імена перетворено на id', [r.actions[0].payload.assigneeId, r.actions[0].payload.listId, r.actions[0].payload.phaseId], ['u2', 'l2', 'ph1']);
    check('колонка за замовчуванням — перша', r.actions[1].payload.listId, 'l1');
    check('у кожної пропозиції свій id', new Set(r.actions.map((a: any) => a.id)).size, 2);
    check('опис для кнопки', r.actions[0].summary,
      'Створити «Зібрати відгуки» у колонці «В роботі», етап «Дизайн», виконавець Олена Ковальчук, дедлайн 2026-08-20');
    check('дубль відкритої картки названо', r.errors.some((e: string) => e.includes('«Текст оферу»: така відкрита картка вже є')), true);
    check('етап чужого проєкту не підходить',
      (prepareProjectActions('propose_create_cards', { tasks: [{ title: 'X', phaseTitle: 'Чужий етап' }] }, ctx) as any).error.includes('Не знайдено етап'), true);

    check('порожній список', prepareProjectActions('propose_create_cards', { tasks: [] }, ctx), { error: 'Не вказано жодної задачі' });
    const many: any = prepareProjectActions('propose_create_cards',
      { tasks: Array.from({ length: 30 }, (_, i) => ({ title: `Задача ${i}` })) }, ctx);
    check('ліміт пакета', [many.actions.length, many.errors.some((e: string) => e.includes('перші 20'))], [20, true]);
    check('усе погане → помилка',
      (prepareProjectActions('propose_create_cards', { tasks: [{ title: '' }] }, ctx) as any).error.includes('порожня назва'), true);
  }

  console.log('\nПропозиції: зміни');
  {
    const ctx = ctxFor(admin);
    const upd: any = prepareProjectActions('propose_update_card',
      { cardId: 'c1', deadline: '2026-08-30', assigneeName: 'Іван', listTitle: 'В роботі', isCompleted: false }, ctx);
    check('оновлення картки', upd.actions[0].payload,
      { cardId: 'c1', updates: { deadline: '2026-08-30', assigneeId: 'u3', listId: 'l2', isCompleted: false } });

    check('чужа картка не змінюється',
      prepareProjectActions('propose_update_card', { cardId: 'c4', title: 'Х' }, ctx),
      { error: 'Картку не знайдено в цьому проєкті. Спершу знайди її через search_project_cards' });
    check('без змін — помилка', prepareProjectActions('propose_update_card', { cardId: 'c1' }, ctx), { error: 'Не вказано жодної зміни' });
    check('погана дата',
      prepareProjectActions('propose_update_card', { cardId: 'c1', deadline: 'завтра' }, ctx),
      { error: 'Некоректна дата дедлайну (потрібен формат YYYY-MM-DD)' });

    const cm: any = prepareProjectActions('propose_add_comment', { cardId: 'c1', text: '  Підсумок: узгодили червоний  ' }, ctx);
    check('коментар обрізано по краях', cm.actions[0].payload, { cardId: 'c1', text: 'Підсумок: узгодили червоний' });
    check('коментар до чужої картки', (prepareProjectActions('propose_add_comment', { cardId: 'c4', text: 'x' }, ctx) as any).error.includes('не знайдено'), true);
    check('порожній коментар', prepareProjectActions('propose_add_comment', { cardId: 'c1', text: '  ' }, ctx), { error: 'Порожній коментар' });
  }

  console.log('\nПропозиції: проєкт');
  {
    const ctx = ctxFor(admin);
    const up: any = prepareProjectActions('propose_update_project', { goal: 'Подвоїти ліди до Q4' }, ctx);
    check('нова мета', up.actions[0].payload, { goal: 'Подвоїти ліди до Q4' });
    check('в підсумку видно було → стало', up.actions[0].summary.includes('Збільшити ліди на 30%') && up.actions[0].summary.includes('Подвоїти ліди до Q4'), true);

    const both: any = prepareProjectActions('propose_update_project', { goal: 'Нова', description: 'Новий опис' }, ctx);
    check('мета й опис разом', Object.keys(both.actions[0].payload), ['goal', 'description']);
    check('те саме значення — нічого міняти',
      (prepareProjectActions('propose_update_project', { goal: 'Збільшити ліди на 30%' }, ctx) as any).error.startsWith('Нічого міняти'), true);
    check('порожнє — нічого міняти',
      (prepareProjectActions('propose_update_project', { goal: '  ' }, ctx) as any).error.startsWith('Нічого міняти'), true);
  }

  console.log('\nЗагальне');
  {
    check('невідома дія', prepareProjectActions('get_team', {}, ctxFor(admin)), { error: 'Невідома дія: get_team' });
    check('читальний не виконує запис', await runProjectReadTool('propose_add_comment', {}, ctxFor(admin)),
      { error: 'Цей інструмент змінює дані й тут не виконується' });
    check('невідомий інструмент', await runProjectReadTool('drop_db', {}, ctxFor(admin)), { error: 'Невідомий інструмент: drop_db' });

    const brief = projectBrief(ctxFor(admin));
    check('візитка містить мету й назву', brief.includes('Запуск лендінгу') && brief.includes('Збільшити ліди на 30%'), true);
    check('візитка не містить чужого', brief.includes('Секретна') || brief.includes('секрет'), false);
  }

  if (failures > 0) { console.log(`\n✗ Провалено: ${failures}`); process.exit(1); }
  console.log('\n✓ Усе гаразд');
}

main();

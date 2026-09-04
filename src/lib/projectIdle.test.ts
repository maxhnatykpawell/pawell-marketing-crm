import { daysSince, lastTouchedAt, idleRecipients, findIdleProjects } from './projectIdle';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

const NOW = new Date('2026-09-30T12:00:00.000Z');
/** Дата за N діб до «зараз» */
const ago = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString();

const project = (over: any = {}) => ({
  id: 'p1', title: 'Осінній запуск', color: '#000', status: 'active',
  managerIds: ['m1'], createdAt: ago(90), ...over,
} as any);

const card = (over: any = {}) => ({
  id: 'c1', listId: 'l1', title: 'Задача', description: '', deadline: null,
  assigneeId: null, subtasks: [], comments: [], attachments: [], order: 0,
  projectId: 'p1', ...over,
} as any);

console.log('\nСкільки минуло');
check('доба тому', daysSince(ago(1), NOW), 1);
check('десять діб тому', daysSince(ago(10), NOW), 10);
check('щойно', daysSince(ago(0), NOW), 0);
check('сміття замість дати не ламає', daysSince('колись', NOW), 0);

console.log('\nОстанній слід життя');
check('зміна картки', lastTouchedAt({ updatedAt: ago(3), comments: [] } as any), ago(3));
// Обговорення — теж увага, і в старій картці це може бути єдиний слід
check('коментар, коли картку не редагували',
  lastTouchedAt({ comments: [{ id: 'x', authorId: 'u1', text: '', createdAt: ago(2) }] } as any), ago(2));
check('береться найсвіжіше з двох',
  lastTouchedAt({ updatedAt: ago(9), comments: [{ id: 'x', authorId: 'u1', text: '', createdAt: ago(2) }] } as any), ago(2));
check('слідів немає — не знаємо', lastTouchedAt({ comments: [] } as any), null);

console.log('\nКому казати');
check('власник', idleRecipients({ ownerId: 'o1', managerIds: ['m1', 'm2'] } as any), ['o1']);
// Проєкти з історії власника не мають — тоді відповідальні менеджери
check('без власника — менеджери', idleRecipients({ managerIds: ['m1', 'm2'] } as any), ['m1', 'm2']);
check('нікого', idleRecipients({ managerIds: [] } as any), []);

console.log('\nЗанедбані проєкти');
{
  const idle = findIdleProjects([project()], [card({ updatedAt: ago(10) })], NOW, 7);
  check('усе мовчить довше за поріг', idle.map(i => i.project.id), ['p1']);
  check('рахуємо дні тиші', idle[0].days, 10);
  check('і кількість задач, що стоять', idle[0].taskCount, 1);
  check('кажемо менеджерам, бо власника немає', idle[0].recipientIds, ['m1']);
}
check('поріг ще не минув',
  findIdleProjects([project()], [card({ updatedAt: ago(3) })], NOW, 7).length, 0);
// Одна жива задача — і проєкт живий, хай навіть решта стоїть місяцями
check('одна свіжа задача рятує весь проєкт',
  findIdleProjects([project()], [
    card({ id: 'c1', updatedAt: ago(40) }),
    card({ id: 'c2', updatedAt: ago(1) }),
  ], NOW, 7).length, 0);
check('усі задачі мовчать — проєкт занедбаний',
  findIdleProjects([project()], [
    card({ id: 'c1', updatedAt: ago(40) }),
    card({ id: 'c2', updatedAt: ago(8) }),
  ], NOW, 7).map(i => i.days), [8]);

console.log('\nКоли мовчимо');
check('завершений проєкт не турбуємо',
  findIdleProjects([project({ status: 'completed' })], [card({ updatedAt: ago(30) })], NOW, 7).length, 0);
check('проєкт на паузі не турбуємо',
  findIdleProjects([project({ status: 'on-hold' })], [card({ updatedAt: ago(30) })], NOW, 7).length, 0);
// Проєкт, де все зроблено, не занедбаний — він закінчений
check('усі задачі виконані',
  findIdleProjects([project()], [card({ updatedAt: ago(30), isCompleted: true })], NOW, 7).length, 0);
check('у проєкті взагалі немає задач',
  findIdleProjects([project()], [], NOW, 7).length, 0);
// Краще промовчати, ніж назвати занедбаним те, про що нічого не знаємо
check('задача без жодного сліду життя — проєкт невідомий, а не занедбаний',
  findIdleProjects([project()], [card({ id: 'c1', updatedAt: ago(30) }), card({ id: 'c2' })], NOW, 7).length, 0);
check('чужі картки не рахуються',
  findIdleProjects([project()], [card({ projectId: 'p2', updatedAt: ago(30) })], NOW, 7).length, 0);
check('нема кому казати — не рахуємо занедбаним',
  findIdleProjects([project({ managerIds: [] })], [card({ updatedAt: ago(30) })], NOW, 7).length, 0);
// Інакше нагадування приходило б щодня, доки проєкт не зрушить
check('нагадали недавно — мовчимо',
  findIdleProjects([project({ lastIdleNotifiedAt: ago(2) })], [card({ updatedAt: ago(30) })], NOW, 7).length, 0);
check('минув ще один період — нагадуємо знову',
  findIdleProjects([project({ lastIdleNotifiedAt: ago(9) })], [card({ updatedAt: ago(30) })], NOW, 7).length, 1);
check('поріг вимкнено нулем',
  findIdleProjects([project()], [card({ updatedAt: ago(30) })], NOW, 0).length, 0);

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

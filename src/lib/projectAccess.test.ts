import {
  isProjectRestricted, projectAccessIds, canAccessProject, canManageProjectAccess,
  accessibleProjects, accessibleCards, scopeStateToUser,
} from './projectAccess';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

const admin = { userId: 'boss', role: 'admin' };
const owner = { userId: 'u1' };
const manager = { userId: 'u2' };
const member = { userId: 'u3' };
const outsider = { userId: 'u9' };

const open = { id: 'p-open', ownerId: 'u1', managerIds: ['u2'], memberIds: [] };
const closed = { id: 'p-closed', ownerId: 'u1', managerIds: ['u2'], memberIds: ['u3'] };
// Проєкт з історії: полів доступу взагалі немає
const legacy = { id: 'p-old', managerIds: ['u2'] } as any;

console.log('\nВідкритий і закритий проєкт');
check('порожній список учасників — проєкт відкритий', isProjectRestricted(open), false);
check('доданий учасник закриває проєкт', isProjectRestricted(closed), true);
check('проєкт без полів доступу — відкритий', isProjectRestricted(legacy), false);
check('відсутній memberIds не ламає перевірку', isProjectRestricted({ managerIds: [] } as any), false);

console.log('\nХто має доступ');
check('власник, менеджери й учасники — одним списком', projectAccessIds(closed), ['u1', 'u2', 'u3']);
check('без повторів, коли власник ще й менеджер',
  projectAccessIds({ ownerId: 'u1', managerIds: ['u1', 'u2'], memberIds: ['u1'] }), ['u1', 'u2']);
check('порожній проєкт — порожній список', projectAccessIds({ managerIds: [], memberIds: [] } as any), []);

console.log('\nДоступ до проєкту');
check('відкритий бачить будь-хто', canAccessProject(open, outsider), true);
check('проєкт з історії бачать усі', canAccessProject(legacy, outsider), true);
check('закритий — стороннього не пускає', canAccessProject(closed, outsider), false);
check('закритий бачить власник', canAccessProject(closed, owner), true);
// Менеджера не треба дублювати в учасниках — він веде проєкт, отже бачить його
check('закритий бачить менеджер', canAccessProject(closed, manager), true);
check('закритий бачить доданий учасник', canAccessProject(closed, member), true);
check('адмін бачить закритий проєкт', canAccessProject(closed, admin), true);

console.log('\nХто роздає доступ');
check('адмін керує доступом', canManageProjectAccess(closed, admin), true);
check('власник керує доступом', canManageProjectAccess(closed, owner), true);
// Менеджер веде роботу, але не вирішує, кого пускати
check('менеджер не керує доступом', canManageProjectAccess(closed, manager), false);
check('учасник не керує доступом', canManageProjectAccess(closed, member), false);
check('у проєкті без власника доступ роздає лише адмін', canManageProjectAccess(legacy, manager), false);

console.log('\nСписок проєктів');
check('сторонній бачить лише відкриті',
  accessibleProjects([open, closed, legacy], outsider).map(p => p.id), ['p-open', 'p-old']);
check('учасник бачить і закритий',
  accessibleProjects([open, closed, legacy], member).map(p => p.id), ['p-open', 'p-closed', 'p-old']);
check('адмін бачить усі',
  accessibleProjects([open, closed, legacy], admin).map(p => p.id), ['p-open', 'p-closed', 'p-old']);

console.log('\nКартки');
const cards = [
  { id: 'c1', projectId: 'p-open' },
  { id: 'c2', projectId: 'p-closed' },
  { id: 'c3', projectId: null },
  { id: 'c4', projectId: 'p-deleted' },
];
check('картки закритого проєкту зникають',
  accessibleCards(cards, [open, closed] as any, outsider).map(c => c.id), ['c1', 'c3', 'c4']);
// Задача без проєкту — спільна робота дошки, закривати треба проєкти, а не дошку
check('картка без проєкту лишається видимою',
  accessibleCards(cards, [open, closed] as any, outsider).some(c => c.id === 'c3'), true);
// Сирота від видаленого проєкту не має тихо зникати з дошки
check('картка видаленого проєкту лишається видимою',
  accessibleCards(cards, [open, closed] as any, outsider).some(c => c.id === 'c4'), true);
check('учаснику видно все', accessibleCards(cards, [open, closed] as any, member).length, 4);
check('адміну видно все', accessibleCards(cards, [open, closed] as any, admin).length, 4);

console.log('\nСтан очима людини');
const state = { projects: [open, closed], cards, users: [{ id: 'u1' }] } as any;
{
  const scoped = scopeStateToUser(state, outsider);
  check('проєкти звужені', scoped.projects.map((p: any) => p.id), ['p-open']);
  check('картки звужені', scoped.cards.map((c: any) => c.id), ['c1', 'c3', 'c4']);
  check('решта стану не чіпається', scoped.users, state.users);
}
// Коли ховати нічого, стан має лишитись тим самим об'єктом: інакше кожен
// перерахунок давав би новий масив і перемальовував усе без причини
check('без закритих проєктів повертається той самий стан',
  scopeStateToUser(state, admin) === state, true);
check('порожній стан не ламається',
  scopeStateToUser({ projects: [], cards: [] } as any, outsider).projects, []);

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

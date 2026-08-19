import {
  dmConversationId, dmMembers, canAccess, recipientsOf, parseMentions, previewOf,
  unreadCount, startsNewGroup, dayLabel, mergeMessage, sortConversations,
} from './chat';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`);
    failures++;
  }
}

console.log('\ndmConversationId');
check('порядок учасників не впливає', dmConversationId('u2', 'u1'), dmConversationId('u1', 'u2'));
check('формат передбачуваний', dmConversationId('u1', 'u2'), 'dm_u1__u2');
check('учасники читаються назад', dmMembers(dmConversationId('bob', 'alice')), ['alice', 'bob']);
check('канал не видає учасників', dmMembers('general'), null);

console.log('\ncanAccess');
{
  const openChannel = { id: 'c1', kind: 'channel' as const, memberIds: null };
  const privateChannel = { id: 'c2', kind: 'channel' as const, memberIds: ['u1', 'u2'] };
  const dm = { id: 'dm_u1__u2', kind: 'dm' as const, memberIds: ['u1', 'u2'] };

  check('відкритий канал — усім', canAccess(openChannel, 'хтось'), true);
  check('приватний канал — лише учасникам', canAccess(privateChannel, 'u3'), false);
  check('приватний канал — учасник заходить', canAccess(privateChannel, 'u2'), true);
  check('особисте — лише двом', canAccess(dm, 'u3'), false);
  check('особисте — співрозмовник заходить', canAccess(dm, 'u1'), true);
  // Найнебезпечніший випадок: dm без списку учасників не має ставати публічним
  check('dm без memberIds не відкривається всім', canAccess({ id: 'x', kind: 'dm', memberIds: null }, 'u9'), false);

  check('відкритий канал — розсилка всім', recipientsOf(openChannel), null);
  check('приватний — розсилка учасникам', recipientsOf(privateChannel), ['u1', 'u2']);
}

console.log('\nparseMentions');
{
  const users = [
    { id: 'u1', name: 'Марія' },
    { id: 'u2', name: 'Марія Коваль' },
    { id: 'u3', name: 'Олег' },
  ];
  check('проста згадка', parseMentions('@Олег глянь будь ласка', users), ['u3']);
  // Найпідступніше: ім’я з пробілом має вигравати над своїм же префіксом
  check('складене ім’я не ріжеться навпіл', parseMentions('@Марія Коваль підготує звіт', users), ['u2']);
  check('коротше ім’я теж знаходиться', parseMentions('@Марія глянь', users), ['u1']);
  check('регістр не заважає', parseMentions('@олег привіт', users), ['u3']);
  check('дві згадки', parseMentions('@Олег і @Марія — на зустріч', users).sort(), ['u1', 'u3']);
  check('без дублікатів', parseMentions('@Олег @Олег', users), ['u3']);
  check('пошта не є згадкою', parseMentions('пиши на max@Олег.com', users), []);
  check('невідоме ім’я ігнорується', parseMentions('@Хтось', users), []);
  check('порожній текст', parseMentions('', users), []);
  check('немає користувачів', parseMentions('@Олег', []), []);
}

console.log('\npreviewOf');
check('переноси згортаються', previewOf('перший\nдругий   рядок'), 'перший другий рядок');
check('довгий текст обрізається', previewOf('а'.repeat(100)).length, 80);
check('короткий не чіпаємо', previewOf('ок'), 'ок');

console.log('\nunreadCount');
{
  const msgs = [
    { id: 'm1', authorId: 'other', createdAt: '2026-08-19T10:00:00Z' },
    { id: 'm2', authorId: 'me',    createdAt: '2026-08-19T10:05:00Z' },
    { id: 'm3', authorId: 'other', createdAt: '2026-08-19T10:10:00Z' },
  ];
  check('усе нове, крім свого', unreadCount(msgs, null, 'me'), 2);
  check('після позначки прочитання', unreadCount(msgs, '2026-08-19T10:06:00Z', 'me'), 1);
  check('усе прочитано', unreadCount(msgs, '2026-08-19T23:00:00Z', 'me'), 0);
  check('свої повідомлення не рахуються', unreadCount(msgs, null, 'other'), 1);
}

console.log('\nstartsNewGroup');
{
  const a = { id: 'm1', authorId: 'u1', createdAt: '2026-08-19T10:00:00Z' };
  check('перше в стрічці', startsNewGroup(a, null), true);
  check('той самий автор поруч у часі', startsNewGroup({ id: 'm2', authorId: 'u1', createdAt: '2026-08-19T10:02:00Z' }, a), false);
  check('той самий автор через годину', startsNewGroup({ id: 'm2', authorId: 'u1', createdAt: '2026-08-19T11:02:00Z' }, a), true);
  check('інший автор', startsNewGroup({ id: 'm2', authorId: 'u2', createdAt: '2026-08-19T10:01:00Z' }, a), true);
}

console.log('\ndayLabel');
{
  const today = new Date('2026-08-19T12:00:00Z');
  check('сьогодні', dayLabel('2026-08-19T08:00:00Z', today), 'Сьогодні');
  check('вчора', dayLabel('2026-08-18T08:00:00Z', today), 'Вчора');
  check('давніше — дата', dayLabel('2026-08-01T08:00:00Z', today), '1 серпня');
}

console.log('\nmergeMessage');
{
  const m1 = { id: 'm1', authorId: 'u1', createdAt: '2026-08-19T10:00:00Z' };
  const m2 = { id: 'm2', authorId: 'u1', createdAt: '2026-08-19T10:05:00Z' };

  check('додається в кінець', mergeMessage([m1], m2).map(m => m.id), ['m1', 'm2']);
  // Своє повідомлення повертається ще й через потік — дубля бути не має
  check('повтор по id не дублюється', mergeMessage([m1, m2], m2).map(m => m.id), ['m1', 'm2']);
  check('запізнілий порядок відновлюється', mergeMessage([m2], m1).map(m => m.id), ['m1', 'm2']);
  check('оновлення заміщає на місці', mergeMessage([m1, m2], { ...m2, authorId: 'u9' })[1].authorId, 'u9');
}

console.log('\nsortConversations');
{
  const list = [
    { id: 'a', createdAt: '2026-01-01T00:00:00Z', lastMessageAt: '2026-08-01T00:00:00Z' },
    { id: 'b', createdAt: '2026-02-01T00:00:00Z' },
    { id: 'c', createdAt: '2026-01-01T00:00:00Z', lastMessageAt: '2026-08-19T00:00:00Z' },
  ];
  check('свіжі розмови вгорі', sortConversations(list).map(c => c.id), ['c', 'a', 'b']);
}

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

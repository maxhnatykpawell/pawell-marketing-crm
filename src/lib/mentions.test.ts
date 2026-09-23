import {
  findMentions, parseMentions, splitMentions,
  mentionQueryAt, applyMention, suggestMentions,
  MentionUser,
} from './mentions';

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

const users: MentionUser[] = [
  { id: 'u1', name: 'Марія' },
  { id: 'u2', name: 'Марія Коваль' },
  { id: 'u3', name: 'Олег' },
  { id: 'u4', name: "В'ячеслав" },
];

console.log('\nfindMentions');
check('позиція і довжина разом із собачкою',
  findMentions('@Олег глянь', users), [{ index: 0, length: 5, userId: 'u3' }]);
check('згадка не на початку',
  findMentions('привіт, @Олег!', users), [{ index: 8, length: 5, userId: 'u3' }]);
// Довше ім'я виграє: інакше «@Марія Коваль» позначало б іншу людину
check('складене ім’я перемагає коротше',
  findMentions('@Марія Коваль тут', users), [{ index: 0, length: 13, userId: 'u2' }]);
check('коротше ім’я, коли складене не підходить',
  findMentions('@Марія тут', users), [{ index: 0, length: 6, userId: 'u1' }]);
check('дві згадки по порядку',
  findMentions('@Олег і @Марія', users),
  [{ index: 0, length: 5, userId: 'u3' }, { index: 8, length: 6, userId: 'u1' }]);
// Пошта не є згадкою — це і є межа слова перед '@'
check('пошта не згадка', findMentions('пиши на max@Олег.com', users), []);
check('апостроф в імені', findMentions("@В'ячеслав привіт", users), [{ index: 0, length: 10, userId: 'u4' }]);
check('невідоме ім’я', findMentions('@Хтось', users), []);
check('порожній текст', findMentions('', users), []);
check('немає команди', findMentions('@Олег', []), []);
check('користувач без імені не ламає пошук',
  findMentions('@Олег', [{ id: 'x', name: '' }, { id: 'u3', name: 'Олег' }]),
  [{ index: 0, length: 5, userId: 'u3' }]);

console.log('\nparseMentions');
check('проста згадка', parseMentions('@Олег глянь будь ласка', users), ['u3']);
check('дві згадки', parseMentions('@Олег і @Марія — на зустріч', users), ['u3', 'u1']);
check('без дублікатів', parseMentions('@Олег @Олег', users), ['u3']);
check('регістр не заважає', parseMentions('@олег привіт', users), ['u3']);
check('порожньо', parseMentions('нікого не чіпаю', users), []);

console.log('\nsplitMentions');
// Підсвітка й сповіщення мусять збігатись — обидва читають той самий пошук
check('текст без згадок — один шматок',
  splitMentions('просто текст', users), [{ text: 'просто текст', userId: null }]);
check('згадка посередині',
  splitMentions('привіт @Олег, глянь', users), [
    { text: 'привіт ', userId: null },
    { text: '@Олег', userId: 'u3' },
    { text: ', глянь', userId: null },
  ]);
check('згадка на початку і в кінці',
  splitMentions('@Олег дякую @Марія', users), [
    { text: '@Олег', userId: 'u3' },
    { text: ' дякую ', userId: null },
    { text: '@Марія', userId: 'u1' },
  ]);
check('порожній текст', splitMentions('', users), []);
// Те, що не стало згадкою, не має підсвічуватись — інакше людина чекала б
// сповіщення, якого не буде
check('пошта лишається звичайним текстом',
  splitMentions('max@Олег.com', users), [{ text: 'max@Олег.com', userId: null }]);

console.log('\nmentionQueryAt');
check('щойно набрана собачка', mentionQueryAt('привіт @'), '');
check('частина імені', mentionQueryAt('привіт @Ол'), 'Ол');
check('ім’я з пробілом', mentionQueryAt('@Марія Ков'), 'Марія Ков');
check('без собачки', mentionQueryAt('просто текст'), null);
// Дописав згадку й пішов далі — підказка має зникнути, а не висіти
check('новий рядок обриває запит', mentionQueryAt('@Олег\nдалі текст'), null);
check('порожній рядок', mentionQueryAt(''), null);

console.log('\napplyMention');
check('підставляє замість недодрукованого', applyMention('привіт @Ол', 'Олег'), 'привіт @Олег ');
check('підставляє після голої собачки', applyMention('@', 'Олег'), '@Олег ');
check('не чіпає готовий текст', applyMention('привіт усім', 'Олег'), 'привіт усім');

console.log('\nsuggestMentions');
check('порожній запит показує всіх', suggestMentions(users, '').map(u => u.id), ['u1', 'u2', 'u3', 'u4']);
check('фільтр за частиною імені', suggestMentions(users, 'мар').map(u => u.id), ['u1', 'u2']);
check('немає запиту — немає підказок', suggestMentions(users, null), []);
check('нічого не збіглось', suggestMentions(users, 'зззз'), []);
check('обмеження кількості', suggestMentions(users, '', 2).map(u => u.id), ['u1', 'u2']);

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

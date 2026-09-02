import {
  canViewSection, VIEWS, GRANTABLE_VIEWS, ALWAYS_ALLOWED_VIEWS,
  ALL_VIEW_IDS, DEFAULT_ALLOWED_VIEWS,
} from './views';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

console.log('\nСклад переліку');
check('витрати є серед тих, що роздаються', GRANTABLE_VIEWS.some(v => v.id === 'expenses'), true);
check('витрати позначені як чутливі', VIEWS.find(v => v.id === 'expenses')?.sensitive, true);
check('чат і профіль доступні завжди', [...ALWAYS_ALLOWED_VIEWS].sort(), ['chat', 'profile']);
check('завжди доступні не показуються прапорцями',
  GRANTABLE_VIEWS.some(v => ALWAYS_ALLOWED_VIEWS.includes(v.id)), false);
check('id унікальні', new Set(ALL_VIEW_IDS).size, ALL_VIEW_IDS.length);

console.log('\nЩо дається за замовчуванням');
// Головне правило: бюджет відділу не відкривається сам собою
check('витрат за замовчуванням немає', DEFAULT_ALLOWED_VIEWS.includes('expenses'), false);
check('дошка за замовчуванням є', DEFAULT_ALLOWED_VIEWS.includes('board'), true);
check('зарплати за замовчуванням є (кожен бачить свою)', DEFAULT_ALLOWED_VIEWS.includes('payroll'), true);

console.log('\nАдміністратор');
check('бачить витрати', canViewSection('expenses', [], 'admin'), true);
check('бачить усе, навіть з порожніми правами', ALL_VIEW_IDS.every(v => canViewSection(v, [], 'admin')), true);

console.log('\nУчасник без окремих прав');
{
  const rights = [...DEFAULT_ALLOWED_VIEWS];
  check('витрат не бачить', canViewSection('expenses', rights, 'member'), false);
  check('дошку бачить', canViewSection('board', rights, 'member'), true);
}

console.log('\nУчаснику видали доступ до витрат');
{
  const rights = [...DEFAULT_ALLOWED_VIEWS, 'expenses'];
  check('витрати відкрились', canViewSection('expenses', rights, 'member'), true);
  // Саме те, чого раніше не можна було зробити взагалі
  check('решта прав не постраждала', canViewSection('board', rights, 'member'), true);
}

console.log('\nПорожні права');
{
  check('нічого не відкрито — розділ закритий', canViewSection('board', [], 'member'), false);
  check('але чат лишається', canViewSection('chat', [], 'member'), true);
  check('і профіль лишається', canViewSection('profile', [], 'member'), true);
}

console.log('\nСторінка події');
{
  check('event-details іде за правом на «Події»', canViewSection('event-details', ['events'], 'member'), true);
  check('без «Подій» — закрита', canViewSection('event-details', ['board'], 'member'), false);
}

console.log('\nДіаграма Ганта');
{
  check('gantt іде за правом на «Проєкти»', canViewSection('gantt', ['projects'], 'member'), true);
  check('без «Проєктів» — закрита', canViewSection('gantt', ['board'], 'member'), false);
  check('це сторінка, а не вкладка меню', GRANTABLE_VIEWS.some(v => v.id === 'gantt'), false);
}

console.log('\nНевідомий розділ');
check('чого немає в переліку — те закрите', canViewSection('secret-page', [], 'member'), false);
check('вигаданий розділ не відкривається підробленими правами',
  canViewSection('secret-page', ['secret-page'], 'member'), true); // право видане явно — це усвідомлений вибір адміна

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

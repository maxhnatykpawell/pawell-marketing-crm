import {
  extractTitle, stripServiceSuffix, isAccessWall, titleFromHtml,
  isPrivateAddress, isFetchableUrl,
} from './linkTitle';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

console.log('\nЧитання назви зі сторінки');
{
  check('звичайний title', extractTitle('<html><head><title>Бюджет Q3</title></head>'), 'Бюджет Q3');
  check('og:title має пріоритет',
    extractTitle('<meta property="og:title" content="Бриф кампанії"><title>щось інше</title>'),
    'Бриф кампанії');
  check('атрибути у зворотному порядку',
    extractTitle('<meta content="Бриф" property="og:title">'), 'Бриф');
  check('переноси рядків згортаються', extractTitle('<title>\n  Контент\n  план  </title>'), 'Контент план');
  check('сутності декодуються', extractTitle('<title>Ціни &amp; знижки &#39;25</title>'), "Ціни & знижки '25");
  check('немає title — null', extractTitle('<html><body>нічого</body></html>'), null);
}

console.log('\nХвіст сервісу');
{
  check('англійський Sheets', stripServiceSuffix('Бюджет Q3 - Google Sheets'), 'Бюджет Q3');
  check('український Документи', stripServiceSuffix('Бриф - Google Документи'), 'Бриф');
  check('тире-em', stripServiceSuffix('План — Google Docs'), 'План');
  check('назва без хвоста не змінюється', stripServiceSuffix('Просто назва'), 'Просто назва');
  // Назва документа може сама закінчуватись на щось схоже — не з'їдаємо її цілком
  check('порожній результат не повертається', stripServiceSuffix('Google Docs'), 'Google Docs');
}

console.log('\nСторінка входу замість документа');
{
  check('англійський вхід', isAccessWall('Sign in - Google Accounts'), true);
  check('український вхід', isAccessWall('Увійдіть в облікові записи Google'), true);
  check('запит доступу', isAccessWall('Request access'), true);
  check('редирект на accounts.google.com', isAccessWall('Щось', 'https://accounts.google.com/v3/signin'), true);
  check('нормальна назва проходить', isAccessWall('Бюджет Q3', 'https://docs.google.com/spreadsheets/d/abc'), false);
}

console.log('\nПовний шлях HTML → назва');
{
  check('назва документа',
    titleFromHtml('<title>Бюджет Q3 - Google Sheets</title>', 'https://docs.google.com/spreadsheets/d/abc'),
    'Бюджет Q3');
  check('сторінка входу дає null',
    titleFromHtml('<title>Sign in - Google Accounts</title>', 'https://accounts.google.com/signin'),
    null);
  // «Untitled document» — це відсутність назви, а не назва
  check('безіменний документ дає null',
    titleFromHtml('<title>Untitled document - Google Docs</title>'), null);
  check('порожня сторінка дає null', titleFromHtml('<html></html>'), null);
}

console.log('\nЗахист від запитів у внутрішню мережу');
{
  check('localhost', isPrivateAddress('localhost'), true);
  check('127.0.0.1', isPrivateAddress('127.0.0.1'), true);
  check('10.x', isPrivateAddress('10.0.0.5'), true);
  check('172.16–31', isPrivateAddress('172.20.10.1'), true);
  check('172.32 — вже публічна', isPrivateAddress('172.32.0.1'), false);
  check('192.168.x', isPrivateAddress('192.168.1.1'), true);
  check('метадані хмари', isPrivateAddress('169.254.169.254'), true);
  check('CGNAT', isPrivateAddress('100.64.0.1'), true);
  check('IPv6 loopback', isPrivateAddress('::1'), true);
  check('IPv4 у IPv6-обгортці', isPrivateAddress('::ffff:127.0.0.1'), true);
  check('публічна адреса', isPrivateAddress('142.250.185.78'), false);
  check('звичайний домен', isPrivateAddress('docs.google.com'), false);

  check('https дозволено', isFetchableUrl('https://docs.google.com/document/d/abc'), true);
  check('http дозволено', isFetchableUrl('http://example.com'), true);
  check('file: заборонено', isFetchableUrl('file:///etc/passwd'), false);
  check('javascript: заборонено', isFetchableUrl('javascript:alert(1)'), false);
  check('localhost заборонено', isFetchableUrl('http://localhost:3000/admin'), false);
  check('метадані заборонено', isFetchableUrl('http://169.254.169.254/latest/meta-data/'), false);
  check('сміття заборонено', isFetchableUrl('не посилання'), false);
}

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

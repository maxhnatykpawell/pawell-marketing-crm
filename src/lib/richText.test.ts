import { toggleWrap, toggleLinePrefix, insertLink, insertText } from './richText';
import { detectProvider, normalizeUrl, suggestLinkName, isExternalUrl } from './links';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

console.log('\nПанель форматування');
{
  check('жирний обгортає виділення', toggleWrap('привіт світ', 7, 11, '**').text, 'привіт **світ**');
  check('повторний клік знімає обгортку', toggleWrap('привіт **світ**', 7, 15, '**').text, 'привіт світ');
  // Людина виділяє слово, а не маркери навколо нього — цей випадок і є типовим
  check('знімає обгортку, коли маркери поза виділенням', toggleWrap('привіт **світ**', 9, 13, '**').text, 'привіт світ');
  check('курсор стає між маркерами', toggleWrap('abc', 3, 3, '*').selectionStart, 4);
  check('похилий не чіпає сусідні слова', toggleWrap('one two', 0, 3, '*').text, '*one* two');
}

console.log('\nСписки');
{
  check('маркований на кількох рядках', toggleLinePrefix('a\nb', 0, 3, '- ').text, '- a\n- b');
  check('повторний клік прибирає маркери', toggleLinePrefix('- a\n- b', 0, 7, '- ').text, 'a\nb');
  check('нумерований рахує рядки', toggleLinePrefix('a\nb', 0, 3, '1. ').text, '1. a\n2. b');
  check('нумерований знімається', toggleLinePrefix('1. a\n2. b', 0, 9, '1. ').text, 'a\nb');
  // Порожні рядки лишаються порожніми, інакше список рветься «- » без тексту
  check('порожній рядок не отримує маркер', toggleLinePrefix('a\n\nb', 0, 4, '- ').text, '- a\n\n- b');
}

console.log('\nПосилання та емодзі у тексті');
{
  check('виділення стає підписом посилання',
    insertLink('дивись тут', 7, 10, 'https://docs.google.com/document/d/1').text,
    'дивись [тут](https://docs.google.com/document/d/1)');
  check('без виділення підписом стає URL',
    insertLink('', 0, 0, 'https://example.com').text,
    '[https://example.com](https://example.com)');
  check('емодзі вставляється в курсор', insertText('привіт', 6, 6, '🔥').text, 'привіт🔥');
  check('емодзі замінює виділення', insertText('привіт світ', 7, 11, '🔥').text, 'привіт 🔥');
}

console.log('\nРозпізнавання Google-файлів');
{
  check('таблиця', detectProvider('https://docs.google.com/spreadsheets/d/abc/edit').id, 'google-sheets');
  check('документ', detectProvider('https://docs.google.com/document/d/abc/edit#heading').id, 'google-docs');
  check('презентація', detectProvider('https://docs.google.com/presentation/d/abc').id, 'google-slides');
  check('форма', detectProvider('https://forms.gle/abc').id, 'google-forms');
  check('файл на Drive', detectProvider('https://drive.google.com/file/d/abc/view').id, 'google-drive');
  check('календар', detectProvider('https://calendar.google.com/calendar/u/0/r').id, 'google-calendar');
  // Люди копіюють адресу з рядка браузера без схеми — це теж має спрацювати
  check('вставка без https', detectProvider('docs.google.com/document/d/abc').id, 'google-docs');
  check('чуже посилання лишається загальним', detectProvider('https://example.com/x.pdf').id, 'link');
  check('сміття не ламає розпізнавання', detectProvider('це не посилання').id, 'link');

  check('схема додається', normalizeUrl('docs.google.com/x'), 'https://docs.google.com/x');
  check('наш шлях у сховищі лишається відносним', normalizeUrl('/uploads/file.pdf'), '/uploads/file.pdf');
  check('відносний шлях — не зовнішнє посилання', isExternalUrl('/uploads/file.pdf'), false);

  check('назва для Google-файлу — тип файлу', suggestLinkName('https://docs.google.com/spreadsheets/d/abc'), 'Google Таблиця');
  check('назва для чужого файлу — з шляху', suggestLinkName('https://example.com/reports/q3.pdf'), 'q3.pdf');
}

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

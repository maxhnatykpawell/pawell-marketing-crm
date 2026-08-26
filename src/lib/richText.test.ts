import { parseMarkdown, markdownToHtml, htmlToMarkdown } from './richText';
import { detectProvider, normalizeUrl, suggestLinkName, isExternalUrl } from './links';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

/**
 * Підроблений DOM: конвертеру потрібні лише nodeType/nodeName/childNodes,
 * тож дерево збирається вручну — без браузера й без jsdom у залежностях.
 */
type FakeNode = Parameters<typeof htmlToMarkdown>[0];
const txt = (value: string): FakeNode => ({ nodeType: 3, nodeName: '#text', textContent: value });
const el = (nodeName: string, kids: FakeNode[] = [], attrs: Record<string, string> = {}): FakeNode => ({
  nodeType: 1,
  nodeName,
  childNodes: kids,
  textContent: kids.map(k => k.textContent || '').join(''),
  getAttribute: (name: string) => attrs[name] ?? null,
});

console.log('\nРозбір розмітки');
{
  check('жирний', parseMarkdown('**так**'), [{ type: 'paragraph', children: [{ type: 'bold', children: [{ type: 'text', value: 'так' }] }] }]);
  check('похилий не чіпає множення', parseMarkdown('2 * 3 * 4'), [{ type: 'paragraph', children: [{ type: 'text', value: '2 * 3 * 4' }] }]);
  check('маркований список', parseMarkdown('- а\n- б'), [{ type: 'list', ordered: false, start: 1, items: [[{ type: 'text', value: 'а' }], [{ type: 'text', value: 'б' }]] }]);
  check('нумерований список', parseMarkdown('2. а'), [{ type: 'list', ordered: true, start: 2, items: [[{ type: 'text', value: 'а' }]] }]);
  check('порожній текст — жодного блоку', parseMarkdown(''), []);
  // Голий URL можна замінити назвою документа, а підпис автора — ні
  check('голий URL помічений як bare',
    parseMarkdown('https://docs.google.com/document/d/1'),
    [{ type: 'paragraph', children: [{ type: 'link', href: 'https://docs.google.com/document/d/1', bare: true, children: [{ type: 'text', value: 'docs.google.com/document/d/1' }] }] }]);
  check('посилання з підписом не bare',
    parseMarkdown('[бриф](https://docs.google.com/document/d/1)'),
    [{ type: 'paragraph', children: [{ type: 'link', href: 'https://docs.google.com/document/d/1', children: [{ type: 'text', value: 'бриф' }] }] }]);
}

console.log('\nMarkdown → HTML редактора');
{
  check('форматування стає тегами', markdownToHtml('**ж** *п* __п__ ~~з~~'), '<div><b>ж</b> <i>п</i> <u>п</u> <s>з</s></div>');
  check('рядки стають div-ами', markdownToHtml('перший\nдругий'), '<div>перший</div><div>другий</div>');
  check('порожній рядок лишається порожнім', markdownToHtml('а\n\nб'), '<div>а</div><div><br></div><div>б</div>');
  check('список', markdownToHtml('- а\n- б'), '<ul><li>а</li><li>б</li></ul>');
  check('посилання з підписом', markdownToHtml('[бриф](https://docs.google.com/document/d/1)'),
    '<div><a href="https://docs.google.com/document/d/1">бриф</a></div>');
  // Текст із картки не має виконуватись як розмітка
  check('HTML у тексті екранується', markdownToHtml('<img src=x onerror=alert(1)>'),
    '<div>&lt;img src=x onerror=alert(1)&gt;</div>');
  // Дужка обриває посилання ще на розборі, а схема все одно зводиться до https
  check('javascript: не переживає конвертацію', markdownToHtml('[тиць](javascript:alert(1))'),
    '<div><a href="https://alert(1">тиць</a>)</div>');
  check('data: теж знешкоджується', markdownToHtml('[тиць](data:text/html;base64,PHM+)'),
    '<div><a href="https://text/html;base64,PHM+">тиць</a></div>');
}

console.log('\nHTML редактора → markdown');
{
  check('жирний і похилий',
    htmlToMarkdown(el('DIV', [el('DIV', [el('B', [txt('ж')]), txt(' і '), el('I', [txt('п')])])])),
    '**ж** і *п*');
  check('підкреслення і закреслення',
    htmlToMarkdown(el('DIV', [el('U', [txt('п')]), txt(' '), el('S', [txt('з')])])),
    '__п__ ~~з~~');
  // execCommand радо вкладає <b> у <b> — маркери не мають подвоюватись
  check('вкладені однакові теги не подвоюють маркери',
    htmlToMarkdown(el('DIV', [el('B', [el('B', [txt('ж')])])])),
    '**ж**');
  check('стиль замість тега теж розпізнається',
    htmlToMarkdown(el('DIV', [{ ...el('SPAN', [txt('ж')]), style: { fontWeight: '700' } }])),
    '**ж**');
  check('рядки з div-ів',
    htmlToMarkdown(el('DIV', [el('DIV', [txt('а')]), el('DIV', [txt('б')])])),
    'а\nб');
  check('порожній div — порожній рядок',
    htmlToMarkdown(el('DIV', [el('DIV', [txt('а')]), el('DIV', [el('BR')]), el('DIV', [txt('б')])])),
    'а\n\nб');
  check('br розриває рядок',
    htmlToMarkdown(el('DIV', [txt('а'), el('BR'), txt('б')])),
    'а\nб');
  check('маркований список',
    htmlToMarkdown(el('DIV', [el('UL', [el('LI', [txt('а')]), el('LI', [txt('б')])])])),
    '- а\n- б');
  check('нумерований список рахує пункти',
    htmlToMarkdown(el('DIV', [el('OL', [el('LI', [txt('а')]), el('LI', [txt('б')])])])),
    '1. а\n2. б');
  check('посилання з підписом',
    htmlToMarkdown(el('DIV', [el('A', [txt('бриф')], { href: 'https://docs.google.com/document/d/1' })])),
    '[бриф](https://docs.google.com/document/d/1)');
  // Браузер сам робить посилання клікабельним — дужки навколо URL лише шумлять
  check('голе посилання лишається голим',
    htmlToMarkdown(el('DIV', [el('A', [txt('https://example.com')], { href: 'https://example.com' })])),
    'https://example.com');
  check('код',
    htmlToMarkdown(el('DIV', [el('CODE', [txt('npm test')])])),
    '`npm test`');
  check('порожнє поле — порожній рядок', htmlToMarkdown(el('DIV', [el('BR')])), '');
}

console.log('\nПовний оберт: markdown → HTML → markdown');
{
  // Те, що людина набрала, має пережити збереження й повторне відкриття картки
  const samples = [
    '**жирний** і *похилий* та ~~закреслений~~',
    '- перший\n- другий **важливий**',
    '1. крок\n2. крок',
    'рядок\n\nінший рядок',
    'бриф: [тут](https://docs.google.com/document/d/1)',
    'таблиця https://docs.google.com/spreadsheets/d/abc/edit',
    'просто текст 🙂',
  ];
  for (const md of samples) {
    check(JSON.stringify(md), htmlToMarkdown(parseHtmlish(markdownToHtml(md))), md);
  }
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

/**
 * Крихітний розбір HTML, який породжує markdownToHtml — рівно стільки, щоб
 * замкнути оберт у тесті. Це не браузерний парсер: у ньому немає ані
 * самозакривних тегів крім <br>, ані атрибутів крім href.
 */
function parseHtmlish(html: string): FakeNode {
  const root = el('DIV', []);
  const stack: FakeNode[] = [root];
  const token = /<(\/?)([a-z]+)([^>]*)>|([^<]+)/gi;

  let m: RegExpExecArray | null;
  while ((m = token.exec(html))) {
    const [, closing, tag, attrs, text] = m;
    const top = stack[stack.length - 1];
    const kids = top.childNodes as FakeNode[];

    if (text) {
      kids.push(txt(text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')));
      continue;
    }
    if (closing) { stack.pop(); continue; }
    if (tag.toLowerCase() === 'br') { kids.push(el('BR')); continue; }

    const href = /href="([^"]*)"/.exec(attrs || '');
    const node = el(tag.toUpperCase(), [], href ? { href: href[1] } : {});
    kids.push(node);
    stack.push(node);
  }
  return root;
}

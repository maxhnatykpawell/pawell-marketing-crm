import { zipSync, strToU8 } from 'fflate';
import {
  fileKindOf, decodeText, decodeXmlEntities, htmlToText, extractDocxText, extractXlsxText,
  columnIndex, googleSource, isAllowedGoogleHost, looksLikeAccessWall, pageOfText,
} from './fileText';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

console.log('\nТип файлу');
{
  check('pdf за розширенням', fileKindOf('Бриф.PDF'), 'pdf');
  check('docx', fileKindOf('plan.docx'), 'docx');
  check('xlsx за mime', fileKindOf('book', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'xlsx');
  check('csv — текст', fileKindOf('data.csv'), 'text');
  check('картинка не підтримується', fileKindOf('logo.png'), 'unsupported');
  check('html', fileKindOf('page.html'), 'html');
  check('без розширення, text/plain', fileKindOf('notes', 'text/plain; charset=utf-8'), 'text');
}

console.log('\nКодування');
{
  check('utf-8 з BOM', decodeText(new Uint8Array([0xEF, 0xBB, 0xBF, 0x41, 0x42])), 'AB');
  // «Привіт» у windows-1251
  const cp1251 = new Uint8Array([0xCF, 0xF0, 0xE8, 0xE2, 0xB3, 0xF2]);
  check('windows-1251 розпізнається', decodeText(cp1251), 'Привіт');
  check('сутності xml', decodeXmlEntities('a &amp; b &lt;c&gt; &#1055;'), 'a & b <c> П');
  check('html → текст', htmlToText('<head><title>x</title></head><p>Привіт</p><script>bad()</script><p>Світ</p>'), 'Привіт\nСвіт');
}

console.log('\nDOCX');
{
  const xml = `<?xml version="1.0"?><w:document><w:body>
    <w:p><w:r><w:t>Бриф кампанії</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Бюджет: </w:t></w:r><w:r><w:t>50 &amp; 000</w:t></w:r></w:p>
    <w:p><w:r><w:t>A</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>B</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Клітинка</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  </w:body></w:document>`;
  const docx = zipSync({ 'word/document.xml': strToU8(xml), '[Content_Types].xml': strToU8('<x/>') });
  const text = extractDocxText(docx);
  check('абзаци розділені', text.split('\n')[0], 'Бриф кампанії');
  check('runs склеєні, сутності розкодовані', text.split('\n')[1], 'Бюджет: 50 & 000');
  check('табуляція зберігається', text.split('\n')[2], 'A\tB');
  check('таблиця не губиться', text.includes('Клітинка'), true);

  let thrown = '';
  try { extractDocxText(zipSync({ 'other.txt': strToU8('x') })); } catch (e: any) { thrown = e.message; }
  check('не-docx дає зрозумілу помилку', thrown, 'Це не схоже на документ Word');
}

console.log('\nXLSX');
{
  const workbook = `<workbook><sheets>
    <sheet name="Бюджет" sheetId="1" r:id="rId1"/>
    <sheet name="Плани &amp; цілі" sheetId="2" r:id="rId2"/>
  </sheets></workbook>`;
  const rels = `<Relationships>
    <Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/>
    <Relationship Id="rId2" Type="x" Target="/xl/worksheets/sheet2.xml"/>
  </Relationships>`;
  const sst = `<sst><si><t>Канал</t></si><si><t>Витрати</t></si><si><r><t>Meta </t></r><r><t>Ads</t></r></si></sst>`;
  const sheet1 = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"/><c r="C2"><v>5000</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Разом</t></is></c><c r="C3" t="b"><v>1</v></c></row>
    <row r="4"></row>
  </sheetData></worksheet>`;
  const sheet2 = `<worksheet><sheetData><row r="1"><c r="B1"><v>7</v></c></row></sheetData></worksheet>`;
  const xlsx = zipSync({
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(rels),
    'xl/sharedStrings.xml': strToU8(sst),
    'xl/worksheets/sheet1.xml': strToU8(sheet1),
    'xl/worksheets/sheet2.xml': strToU8(sheet2),
  });
  const text = extractXlsxText(xlsx);
  const lines = text.split('\n');
  check('назва першого аркуша', lines[0], '## Бюджет');
  check('шапка: пропущений стовпець B', lines[1], 'Канал\t\tВитрати');
  check('rich-text рядок склеєно, порожня клітинка між даними', lines[2], 'Meta Ads\t\t5000');
  check('inlineStr і булеве', lines[3], 'Разом\t\tTRUE');
  check('другий аркуш із сутністю в назві', text.includes('## Плани & цілі\n\t7'), true);
  check('порожній рядок не потрапляє у вивід', lines.filter(l => l === '').length, 1 /* між аркушами */);

  check('AB → 27', columnIndex('AB12'), 27);
  check('A → 0', columnIndex('A1'), 0);
}

console.log('\nПосилання Google');
{
  check('документ', googleSource('https://docs.google.com/document/d/1AbC_-x/edit?usp=sharing'),
    { url: 'https://docs.google.com/document/d/1AbC_-x/export?format=txt', kind: 'text', service: 'doc' });
  check('таблиця — вся книга', googleSource('https://docs.google.com/spreadsheets/d/XYZ123/edit#gid=0')?.url,
    'https://docs.google.com/spreadsheets/d/XYZ123/export?format=xlsx');
  check('презентація', googleSource('https://docs.google.com/presentation/d/PRES1/edit')?.service, 'slides');
  check('файл на Диску', googleSource('https://drive.google.com/file/d/FILE_1/view')?.url,
    'https://drive.google.com/uc?export=download&id=FILE_1');
  check('Диск за ?id=', googleSource('https://drive.google.com/open?id=FILE_2')?.kind, 'auto');
  check('чужий хост — ні', googleSource('https://evil.example.com/document/d/abc'), null);
  check('http — ні', googleSource('http://docs.google.com/document/d/abc'), null);
  check('не документ', googleSource('https://docs.google.com/forms/d/abc'), null);
  check('сміття', googleSource('не url'), null);
  check('id із шляхом нагору не проходить', googleSource('https://drive.google.com/open?id=../../x'), null);

  check('docs.google.com дозволено', isAllowedGoogleHost('docs.google.com'), true);
  check('googleusercontent дозволено', isAllowedGoogleHost('doc-0g-1k-docs.googleusercontent.com'), true);
  check('схожий хост — ні', isAllowedGoogleHost('docs.google.com.evil.io'), false);
  check('accounts не дозволено для вмісту', isAllowedGoogleHost('accounts.google.com'), false);

  check('редірект на вхід', looksLikeAccessWall('text/html', 'https://accounts.google.com/v3/signin', ''), true);
  check('сторінка входу в тілі', looksLikeAccessWall('text/html', 'https://docs.google.com/x', '<title>Sign in - Google Accounts</title>'), true);
  check('нормальний текст не стіна', looksLikeAccessWall('text/plain', 'https://docs.google.com/x', 'Привіт'), false);
}

console.log('\nСторінки');
{
  const text = Array.from({ length: 10 }, (_, i) => `рядок ${i}`).join('\n');
  const p1 = pageOfText(text, 0, 30);
  check('перша сторінка різана по рядку', p1.text.endsWith('\n'), true);
  check('є продовження', p1.nextOffset !== null, true);
  let acc = '', off: number | null = 0, guard = 0;
  while (off !== null && guard++ < 50) { const p = pageOfText(text, off, 30); acc += p.text; off = p.nextOffset; }
  check('сторінки в сумі дають увесь текст', acc, text);
  check('кінець: немає наступної', pageOfText(text, 0, 10_000).nextOffset, null);
  check('offset за межами — порожньо', pageOfText(text, 99999).text, '');
  check('від’ємний offset безпечний', pageOfText('abc', -5).text, 'abc');
  check('загальна довжина', p1.totalChars, text.length);
}

if (failures > 0) { console.log(`\n✗ Провалено: ${failures}`); process.exit(1); }
console.log('\n✓ Усе гаразд');

/**
 * Текст із файлів проєкту — те, що асистент може прочитати.
 *
 * Модуль чистий (байти → рядок): мережу й диск обслуговує сервер, а тут лише
 * розбір форматів, тож усе перевіряється тестами без жодного живого файлу.
 *
 * DOCX і XLSX — це zip із XML усередині. Окрема бібліотека для кожного формату
 * важила б більше, ніж уся логіка нижче, а потрібен нам лише текст: абзаци
 * документа й клітинки таблиці. Форматування, картинки й формули асистентові
 * ні до чого.
 *
 * PDF тут не розбирається: його читає сама модель (див. сервер) — вона бере й
 * сканований PDF, чого жоден текстовий парсер не вміє.
 */
import { unzipSync, strFromU8 } from 'fflate';

export type FileKind = 'text' | 'html' | 'docx' | 'xlsx' | 'pdf' | 'unsupported';

/** Скільки символів віддавати моделі за один виклик — далі вона просить наступну сторінку */
export const FILE_PAGE_CHARS = 12000;

/** Більші за це файли навіть не завантажуємо: це не документ, а архів чи відео */
export const FILE_MAX_BYTES = 15 * 1024 * 1024;

const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'rtf', 'xml', 'srt', 'vtt']);

export function fileKindOf(name: string, contentType?: string | null): FileKind {
  const ext = /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase() ?? '';
  const type = (contentType || '').toLowerCase();

  if (ext === 'pdf' || type.includes('application/pdf')) return 'pdf';
  if (ext === 'docx' || type.includes('wordprocessingml')) return 'docx';
  if (ext === 'xlsx' || type.includes('spreadsheetml')) return 'xlsx';
  if (ext === 'html' || ext === 'htm' || type.includes('text/html')) return 'html';
  if (TEXT_EXT.has(ext) || type.startsWith('text/')) return 'text';
  return 'unsupported';
}

// ── Звичайний текст ───────────────────────────────────────────────────────────

/**
 * UTF-8, а якщо вийшла каша — windows-1251. Українські CSV з Excel досі
 * зберігаються саме в ній, і без цього замість тексту було б «����».
 */
export function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
  const bad = (utf8.match(/�/g) || []).length;
  if (bad === 0 || bad / Math.max(utf8.length, 1) < 0.01) return utf8;
  try {
    return new TextDecoder('windows-1251').decode(bytes);
  } catch {
    return utf8;
  }
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    return XML_ENTITIES[e.toLowerCase()] ?? '';
  });
}

export function htmlToText(html: string): string {
  return decodeXmlEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|h[1-6]|li|tr|br)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── DOCX ──────────────────────────────────────────────────────────────────────

function readZipEntries(bytes: Uint8Array, wanted: (name: string) => boolean): Record<string, string> {
  const files = unzipSync(bytes, { filter: f => wanted(f.name) });
  const out: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) out[name] = strFromU8(data);
  return out;
}

export function extractDocxText(bytes: Uint8Array): string {
  const entries = readZipEntries(bytes, n => n === 'word/document.xml');
  const xml = entries['word/document.xml'];
  if (!xml) throw new Error('Це не схоже на документ Word');

  // Кінець абзацу ставимо маркером ДО розбору, бо після зняття тегів межі абзаців
  // зникли б і весь документ злився б в один рядок
  const marked = xml
    .replace(/<\/w:p>/g, '\u0001')
    .replace(/<w:tab\s*\/>/g, '\u0002')
    .replace(/<w:br[^>]*\/>/g, '\u0001');

  // `<w:t` обов'язково з пробілом або `>` далі — щоб не зачепити <w:tab>, <w:tbl>
  const token = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|(\u0001)|(\u0002)/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = token.exec(marked))) {
    if (m[1] !== undefined) out += decodeXmlEntities(m[1]);
    else if (m[2]) out += '\n';
    else out += '\t';
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

// ── XLSX ──────────────────────────────────────────────────────────────────────

/** «AB12» → 27 (нульова нумерація стовпців) */
export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(n - 1, 0);
}

function allText(xmlChunk: string): string {
  const parts: string[] = [];
  const re = /<t(?:\s[^>]*)?>([^<]*)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xmlChunk))) parts.push(decodeXmlEntities(m[1]));
  return parts.join('');
}

export function extractXlsxText(bytes: Uint8Array): string {
  const entries = readZipEntries(
    bytes,
    n => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' ||
         n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n),
  );
  const workbook = entries['xl/workbook.xml'];
  if (!workbook) throw new Error('Це не схоже на таблицю Excel');

  const shared: string[] = [];
  const sst = entries['xl/sharedStrings.xml'];
  if (sst) {
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sst))) shared.push(allText(m[1]));
  }

  // Аркуші в порядку книги: назва → ідентифікатор зв'язку → файл
  const rels = new Map<string, string>();
  const relRe = /<Relationship\b[^>]*>/g;
  let rm: RegExpExecArray | null;
  while ((rm = relRe.exec(entries['xl/_rels/workbook.xml.rels'] || ''))) {
    const id = /\bId="([^"]+)"/.exec(rm[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(rm[0])?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
  }

  const sheets: { name: string; path: string }[] = [];
  const sheetRe = /<sheet\b[^>]*>/g;
  let sm: RegExpExecArray | null;
  while ((sm = sheetRe.exec(workbook))) {
    const name = decodeXmlEntities(/\bname="([^"]*)"/.exec(sm[0])?.[1] ?? 'Аркуш');
    const rid = /\br:id="([^"]+)"/.exec(sm[0])?.[1];
    const path = rid ? rels.get(rid) : undefined;
    if (path) sheets.push({ name, path });
  }

  const out: string[] = [];
  for (const { name, path } of sheets) {
    const xml = entries[path];
    if (!xml) continue;
    const rows: string[] = [];

    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(xml))) {
      const cells: string[] = [];
      // Клітинка буває парною (<c ..>…</c>) і порожньою (<c .../>)
      const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rowMatch[1]))) {
        const attrs = cm[1];
        const body = cm[2] ?? '';
        const ref = /\br="([A-Z]+\d+)"/i.exec(attrs)?.[1];
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
        const raw = /<v>([^<]*)<\/v>/.exec(body)?.[1];

        let value = '';
        if (type === 's') value = shared[Number(raw)] ?? '';
        else if (type === 'inlineStr') value = allText(body);
        else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
        else if (raw !== undefined) value = decodeXmlEntities(raw);

        // Порожні клітинки між заповненими зберігаємо — інакше стовпці з'їдуть
        const col = ref ? columnIndex(ref) : cells.length;
        while (cells.length < col) cells.push('');
        cells[col] = value.replace(/[\t\r\n]+/g, ' ');
      }
      if (cells.some(c => c !== '')) rows.push(cells.join('\t').replace(/\t+$/, ''));
    }

    out.push(`## ${name}\n${rows.join('\n') || '(порожній аркуш)'}`);
  }

  if (out.length === 0) throw new Error('У книзі немає аркушів');
  return out.join('\n\n');
}

// ── Посилання Google ──────────────────────────────────────────────────────────

/**
 * Хости, на які дозволено ходити за вмістом.
 *
 * Це свідомо вужче за «будь-яка публічна адреса»: асистент читає вміст і
 * віддає його моделі, тож відкривати йому довільний інтернет — це і ризик
 * (внутрішні сервіси), і шлях для підсунутих інструкцій. Google Docs/Drive —
 * єдине зовнішнє сховище, де команда реально тримає документи проєктів.
 */
export function isAllowedGoogleHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'docs.google.com' || h === 'drive.google.com' || h === 'drive.usercontent.google.com' ||
    h.endsWith('.googleusercontent.com');
}

export interface GoogleSource {
  /** Адреса експорту, за якою справді можна забрати вміст */
  url: string;
  /** Який формат очікувати у відповідь; 'auto' — визначити за заголовками */
  kind: FileKind | 'auto';
  service: 'doc' | 'sheet' | 'slides' | 'file';
}

export function googleSource(rawUrl: string): GoogleSource | null {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();

  if (host === 'docs.google.com') {
    const m = /^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/.exec(u.pathname);
    if (!m) return null;
    const [, type, id] = m;
    if (type === 'document') return { url: `https://docs.google.com/document/d/${id}/export?format=txt`, kind: 'text', service: 'doc' };
    // Таблицю беремо цілою книгою, а не лише першим аркушем
    if (type === 'spreadsheets') return { url: `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`, kind: 'xlsx', service: 'sheet' };
    return { url: `https://docs.google.com/presentation/d/${id}/export?format=txt`, kind: 'text', service: 'slides' };
  }

  if (host === 'drive.google.com') {
    const id = /^\/file\/d\/([\w-]+)/.exec(u.pathname)?.[1] || u.searchParams.get('id');
    if (!id || !/^[\w-]+$/.test(id)) return null;
    return { url: `https://drive.google.com/uc?export=download&id=${id}`, kind: 'auto', service: 'file' };
  }

  return null;
}

/**
 * Відповідь Google замість файлу — сторінка входу чи запиту доступу.
 * Її не можна віддавати моделі як «вміст документа».
 */
export function looksLikeAccessWall(contentType: string | null, finalUrl: string, head: string): boolean {
  try {
    const host = new URL(finalUrl).hostname;
    if (host === 'accounts.google.com' || host.endsWith('.accounts.google.com')) return true;
  } catch { /* дивимось на вміст */ }
  if (!(contentType || '').toLowerCase().includes('text/html')) return false;
  return /<title>[^<]*(sign in|вхід|увійти|google accounts|request access|запит доступу|virus scan)/i.test(head) ||
    /accounts\.google\.com\/(ServiceLogin|v3\/signin)/i.test(head);
}

// ── Посторінкова віддача ──────────────────────────────────────────────────────

export interface TextPage {
  text: string;
  offset: number;
  totalChars: number;
  /** З якого символу читати далі; null — це кінець */
  nextOffset: number | null;
}

/** Один шматок тексту. Різати намагаємось по рядку, а не посеред слова */
export function pageOfText(full: string, offset = 0, size = FILE_PAGE_CHARS): TextPage {
  const start = Math.min(Math.max(0, Math.floor(offset) || 0), full.length);
  let end = Math.min(start + size, full.length);
  if (end < full.length) {
    const cut = full.lastIndexOf('\n', end);
    if (cut > start + size * 0.5) end = cut + 1;
  }
  return {
    text: full.slice(start, end),
    offset: start,
    totalChars: full.length,
    nextOffset: end < full.length ? end : null,
  };
}

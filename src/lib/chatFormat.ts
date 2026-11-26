/**
 * Легка розмітка повідомлення: `код`, *жирний*, _курсив_ і клікабельні посилання.
 *
 * Свідомо не повний Markdown: у робочому чаті потрібні посилання на таблиці й
 * задачі та трохи виділення, а не заголовки з таблицями. Розбір повертає плоский
 * список фрагментів — React малює їх без dangerouslySetInnerHTML, тож чужий текст
 * не може стати розміткою.
 */

export type FormatKind = 'text' | 'link' | 'code' | 'bold' | 'italic';

export interface FormatPart {
  kind: FormatKind;
  text: string;
  /** Лише для link */
  href?: string;
}

const URL_RE = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"»)\]]/g;

/** Лише http(s): javascript: та інше в href не потрапляє за жодних умов */
export function safeHref(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function splitLinks(text: string): FormatPart[] {
  const out: FormatPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    const href = safeHref(m[0]);
    if (!href) continue;
    if (idx > last) out.push({ kind: 'text', text: text.slice(last, idx) });
    out.push({ kind: 'link', text: m[0], href });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

// Розмітка не чіпає слова всередині: snake_case_name чи 2*3*4 лишаються як є
const INLINE_RE = /(`[^`\n]+`)|(?<![\w*])\*([^*\n]+)\*(?![\w*])|(?<![\w_])_([^_\n]+)_(?![\w_])/g;

export function formatMessage(text: string): FormatPart[] {
  const out: FormatPart[] = [];
  let last = 0;
  const pushPlain = (s: string) => { if (s) out.push(...splitLinks(s)); };

  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    pushPlain(text.slice(last, idx));
    if (m[1]) out.push({ kind: 'code', text: m[1].slice(1, -1) });
    else if (m[2]) out.push({ kind: 'bold', text: m[2] });
    else if (m[3]) out.push({ kind: 'italic', text: m[3] });
    last = idx + m[0].length;
  }
  pushPlain(text.slice(last));
  return out;
}

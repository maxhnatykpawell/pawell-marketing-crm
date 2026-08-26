/**
 * Мінімальна розмітка для описів і коментарів.
 *
 * У базі текст лишається markdown-подібним рядком: описи читає не лише картка,
 * а й ШІ-асистент та телеграм-сповіщення, і там довільний HTML був би зайвим
 * ризиком. Але людині маркери показувати не треба — редактор працює на
 * contentEditable, а цей модуль перекладає між двома представленнями:
 *
 *   markdown ──parseMarkdown──▶ AST ──▶ React (перегляд) / HTML (редактор)
 *   HTML з редактора ──htmlToMarkdown──▶ markdown (назад у базу)
 *
 * Спільний AST тримає перегляд і редактор синхронними: правило, додане один
 * раз, працює в обох.
 */

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'bold' | 'italic' | 'underline' | 'strike'; children: InlineNode[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: InlineNode[] };

export type BlockNode =
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'blank' }
  | { type: 'list'; ordered: boolean; start: number; items: InlineNode[][] };

interface InlineRule {
  regex: RegExp;
  build: (m: RegExpExecArray) => InlineNode;
}

const INLINE_RULES: InlineRule[] = [
  { regex: /`([^`\n]+)`/, build: m => ({ type: 'code', value: m[1] }) },
  { regex: /\*\*([\s\S]+?)\*\*/, build: m => ({ type: 'bold', children: parseInline(m[1]) }) },
  { regex: /__([\s\S]+?)__/, build: m => ({ type: 'underline', children: parseInline(m[1]) }) },
  { regex: /~~([\s\S]+?)~~/, build: m => ({ type: 'strike', children: parseInline(m[1]) }) },
  {
    // Вміст не починається і не закінчується пробілом — інакше «2 * 3 * 4»
    // у кошторисі перетворилось би на курсив.
    regex: /\*([^\s*][^*\n]*?[^\s*]|[^\s*])\*/,
    build: m => ({ type: 'italic', children: parseInline(m[1]) }),
  },
  { regex: /\[([^\]\n]+)\]\((\S+?)\)/, build: m => ({ type: 'link', href: m[2], children: parseInline(m[1]) }) },
  { regex: /https?:\/\/[^\s<>()[\]]+/, build: m => ({ type: 'link', href: m[0], children: [{ type: 'text', value: m[0].replace(/^https?:\/\//, '') }] }) },
];

export function parseInline(text: string): InlineNode[] {
  if (!text) return [];

  let best: { rule: InlineRule; match: RegExpExecArray } | null = null;
  for (const rule of INLINE_RULES) {
    const match = rule.regex.exec(text);
    if (!match) continue;
    if (!best || match.index < best.match.index) best = { rule, match };
  }

  if (!best) return [{ type: 'text', value: text }];

  const { rule, match } = best;
  const nodes: InlineNode[] = [];
  if (match.index > 0) nodes.push({ type: 'text', value: text.slice(0, match.index) });
  nodes.push(rule.build(match));
  nodes.push(...parseInline(text.slice(match.index + match[0].length)));
  return nodes;
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*(\d+)\.\s+(.*)$/;

export function parseMarkdown(text: string): BlockNode[] {
  if (!text) return [];
  const lines = text.split('\n');
  const blocks: BlockNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const bullet = BULLET.exec(lines[i]);
    const ordered = ORDERED.exec(lines[i]);

    if (bullet || ordered) {
      const isOrdered = !!ordered;
      const start = ordered ? parseInt(ordered[1], 10) || 1 : 1;
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const m = isOrdered ? ORDERED.exec(lines[i]) : BULLET.exec(lines[i]);
        if (!m) break;
        items.push(parseInline(isOrdered ? m[2] : m[1]));
        i++;
      }
      blocks.push({ type: 'list', ordered: isOrdered, start, items });
      continue;
    }

    if (lines[i].trim() === '') {
      blocks.push({ type: 'blank' });
      i++;
      continue;
    }

    blocks.push({ type: 'paragraph', children: parseInline(lines[i]) });
    i++;
  }

  return blocks;
}

/* ────────────────────────── markdown → HTML ────────────────────────── */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Схема посилання: у contentEditable потрапляє те, що вставила людина, тож
 * усе крім http(s) і наших власних шляхів вважаємо небезпечним.
 */
function safeHref(href: string): string {
  const url = href.trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return url;
  return `https://${url.replace(/^[a-z]+:\/*/i, '')}`;
}

function inlineToHtml(nodes: InlineNode[]): string {
  return nodes.map(node => {
    switch (node.type) {
      case 'text': return escapeHtml(node.value);
      case 'bold': return `<b>${inlineToHtml(node.children)}</b>`;
      case 'italic': return `<i>${inlineToHtml(node.children)}</i>`;
      case 'underline': return `<u>${inlineToHtml(node.children)}</u>`;
      case 'strike': return `<s>${inlineToHtml(node.children)}</s>`;
      case 'code': return `<code>${escapeHtml(node.value)}</code>`;
      case 'link': return `<a href="${escapeHtml(safeHref(node.href))}">${inlineToHtml(node.children)}</a>`;
    }
  }).join('');
}

/** HTML для contentEditable: рядок = <div>, як їх створює сам браузер. */
export function markdownToHtml(md: string): string {
  const blocks = parseMarkdown(md);
  if (blocks.length === 0) return '';

  return blocks.map(block => {
    if (block.type === 'blank') return '<div><br></div>';
    if (block.type === 'paragraph') return `<div>${inlineToHtml(block.children) || '<br>'}</div>`;
    const tag = block.ordered ? 'ol' : 'ul';
    const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : '';
    const items = block.items.map(item => `<li>${inlineToHtml(item) || '<br>'}</li>`).join('');
    return `<${tag}${start}>${items}</${tag}>`;
  }).join('');
}

/* ────────────────────────── HTML → markdown ────────────────────────── */

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/** Теги, що починають новий рядок; решта — інлайнові. */
const BLOCK_TAGS = new Set(['DIV', 'P', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'ARTICLE']);

/** Мінімальний зріз DOM, потрібний конвертеру (і легко підробний у тестах). */
interface DomNode {
  nodeType: number;
  nodeName: string;
  textContent?: string | null;
  childNodes?: ArrayLike<DomNode>;
  getAttribute?: (name: string) => string | null;
  style?: { fontWeight?: string; fontStyle?: string; textDecoration?: string; textDecorationLine?: string };
}

function children(node: DomNode): DomNode[] {
  return node.childNodes ? Array.prototype.slice.call(node.childNodes) : [];
}

/** Формати, які браузер міг записати стилем замість тега. */
function styleMarkers(node: DomNode): string[] {
  const style = node.style;
  if (!style) return [];
  const markers: string[] = [];
  const weight = style.fontWeight || '';
  if (weight === 'bold' || weight === 'bolder' || parseInt(weight, 10) >= 600) markers.push('**');
  if (style.fontStyle === 'italic') markers.push('*');
  const decoration = `${style.textDecorationLine || ''} ${style.textDecoration || ''}`;
  if (decoration.includes('underline')) markers.push('__');
  if (decoration.includes('line-through')) markers.push('~~');
  return markers;
}

const TAG_MARKERS: Record<string, string> = {
  B: '**', STRONG: '**',
  I: '*', EM: '*',
  U: '__',
  S: '~~', STRIKE: '~~', DEL: '~~',
};

/**
 * Обгортає вміст маркером — але не вдруге.
 *
 * execCommand радо породжує <b><b>текст</b></b>, а «****текст****» рендерер
 * прочитав би як порожній жирний плюс літерали. Тому активні маркери
 * передаються вниз по дереву.
 */
function wrap(inner: string, marker: string, active: Set<string>): string {
  if (!inner.trim()) return inner;
  if (active.has(marker)) return inner;
  return `${marker}${inner}${marker}`;
}

function inlineToMarkdown(node: DomNode, active: Set<string>): string {
  if (node.nodeType === TEXT_NODE) return node.textContent || '';
  if (node.nodeType !== ELEMENT_NODE) return '';

  const tag = node.nodeName.toUpperCase();
  if (tag === 'BR') return '';

  if (tag === 'CODE') {
    const value = (node.textContent || '').replace(/`/g, '');
    return value.trim() ? `\`${value}\`` : value;
  }

  if (tag === 'A') {
    const href = node.getAttribute?.('href') || '';
    const label = children(node).map(c => inlineToMarkdown(c, active)).join('');
    if (!href) return label;
    // Голе посилання рендериться саме — дужки лише зашумили б текст
    const bare = href.replace(/^https?:\/\//, '');
    if (!label.trim() || label === href || label === bare) return href;
    return `[${label}](${href})`;
  }

  const markers = TAG_MARKERS[tag] ? [TAG_MARKERS[tag]] : styleMarkers(node);
  const nextActive = markers.length ? new Set([...active, ...markers]) : active;
  let out = children(node).map(c => inlineToMarkdown(c, nextActive)).join('');
  for (const marker of markers) out = wrap(out, marker, active);
  return out;
}

function blockLines(node: DomNode): string[] {
  const out: string[] = [];
  let buffer = '';
  const flush = () => { out.push(buffer); buffer = ''; };

  for (const child of children(node)) {
    if (child.nodeType === ELEMENT_NODE) {
      const tag = child.nodeName.toUpperCase();

      if (tag === 'BR') { flush(); continue; }

      if (tag === 'UL' || tag === 'OL') {
        if (buffer) flush();
        const ordered = tag === 'OL';
        let index = 1;
        for (const li of children(child)) {
          if (li.nodeName.toUpperCase() !== 'LI') continue;
          const text = blockLines(li).join(' ').trim();
          if (!text) continue;
          out.push((ordered ? `${index}. ` : '- ') + text);
          index++;
        }
        continue;
      }

      if (BLOCK_TAGS.has(tag)) {
        if (buffer) flush();
        out.push(...blockLines(child));
        continue;
      }
    }

    buffer += inlineToMarkdown(child, new Set());
  }

  if (buffer) out.push(buffer);
  else if (out.length === 0) out.push('');
  return out;
}

/** Читає вміст contentEditable назад у markdown для збереження. */
export function htmlToMarkdown(root: DomNode): string {
  return blockLines(root)
    .join('\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

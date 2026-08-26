/**
 * Мінімальна розмітка для описів і коментарів.
 *
 * Свідомо не HTML: описи вже лежать у базі як звичайний текст, їх читає ще й
 * ШІ-асистент і телеграм-сповіщення. Markdown-подібні маркери лишаються
 * читабельними скрізь, де рендерера немає, і не створюють ризику XSS —
 * на відміну від contentEditable, який зберігав би довільний HTML.
 */

export interface TextEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Обгортає виділення маркером; якщо воно вже обгорнуте — знімає обгортку. */
export function toggleWrap(text: string, start: number, end: number, marker: string): TextEdit {
  const selected = text.slice(start, end);
  const len = marker.length;

  // Виділення разом з маркерами: «**жирний**»
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= len * 2) {
    const inner = selected.slice(len, -len);
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  // Маркери одразу за межами виділення: «**[жирний]**»
  const before = text.slice(Math.max(0, start - len), start);
  const after = text.slice(end, end + len);
  if (before === marker && after === marker) {
    return {
      text: text.slice(0, start - len) + selected + text.slice(end + len),
      selectionStart: start - len,
      selectionEnd: start - len + selected.length,
    };
  }

  const placeholder = selected || '';
  const next = text.slice(0, start) + marker + placeholder + marker + text.slice(end);
  return {
    text: next,
    selectionStart: start + len,
    selectionEnd: start + len + placeholder.length,
  };
}

/** Додає (або знімає) префікс списку на всіх рядках виділення. */
export function toggleLinePrefix(text: string, start: number, end: number, prefix: string): TextEdit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEndIdx = text.indexOf('\n', end);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;

  const block = text.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const isOrdered = /^\d+\.\s$/.test(prefix);
  // Префікс — наш власний рядок ('- ' або '1. '), тож обходимось без побудови
  // регулярки з нього: для маркерів достатньо startsWith.
  const hasPrefix = (line: string) => (isOrdered ? /^\d+\.\s/.test(line) : line.startsWith(prefix));
  const stripPrefix = (line: string) => (isOrdered ? line.replace(/^\d+\.\s/, '') : line.slice(prefix.length));
  const allPrefixed = lines.every(l => l.trim() === '' || hasPrefix(l));

  const nextLines = lines.map((l, i) => {
    if (l.trim() === '') return l;
    if (allPrefixed) return stripPrefix(l);
    return (isOrdered ? `${i + 1}. ` : prefix) + l;
  });

  const nextBlock = nextLines.join('\n');
  return {
    text: text.slice(0, lineStart) + nextBlock + text.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + nextBlock.length,
  };
}

/** Вставляє посилання: виділений текст стає підписом. */
export function insertLink(text: string, start: number, end: number, url: string, label?: string): TextEdit {
  const selected = text.slice(start, end);
  const title = label?.trim() || selected || url;
  const snippet = `[${title}](${url})`;
  return {
    text: text.slice(0, start) + snippet + text.slice(end),
    selectionStart: start + snippet.length,
    selectionEnd: start + snippet.length,
  };
}

/** Вставляє рядок (емодзі) у позицію курсора, замінюючи виділення. */
export function insertText(text: string, start: number, end: number, snippet: string): TextEdit {
  return {
    text: text.slice(0, start) + snippet + text.slice(end),
    selectionStart: start + snippet.length,
    selectionEnd: start + snippet.length,
  };
}

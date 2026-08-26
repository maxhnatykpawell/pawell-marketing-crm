import React from 'react';
import { detectProvider, normalizeUrl } from '../lib/links';
import FileTypeIcon from './FileTypeIcon';

/**
 * Рендер мінімальної розмітки описів і коментарів.
 *
 * Свій крихітний парсер замість markdown-бібліотеки: підтримуємо рівно те, що
 * дає панель форматування, і жодного HTML з тексту не виконуємо — усе стає
 * React-вузлами. Посилання на Google-файли отримують іконку прямо в тексті,
 * щоб «ось та таблиця» читалась без переходу.
 */

interface Rule {
  regex: RegExp;
  render: (m: RegExpExecArray, key: string) => React.ReactNode;
}

/** Посилання з іконкою сервісу. Не компонент, щоб key лишався на самому <a>. */
function renderLink(href: string, label: React.ReactNode, key: string) {
  const url = normalizeUrl(href);
  const provider = detectProvider(url);
  return (
    <a
      key={key}
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={e => e.stopPropagation()}
      className="inline-flex items-baseline gap-1 text-blue-600 hover:underline break-all"
    >
      {provider.id !== 'link' && (
        <FileTypeIcon provider={provider} className="w-3.5 h-3.5 self-center shrink-0" />
      )}
      {label}
    </a>
  );
}

const RULES: Rule[] = [
  {
    regex: /`([^`\n]+)`/,
    render: (m, key) => (
      <code key={key} className="px-1 py-0.5 rounded bg-gray-200/70 text-[0.9em] font-mono text-gray-800">
        {m[1]}
      </code>
    ),
  },
  {
    regex: /\*\*([\s\S]+?)\*\*/,
    render: (m, key) => <strong key={key} className="font-semibold">{parseInline(m[1], key)}</strong>,
  },
  {
    regex: /__([\s\S]+?)__/,
    render: (m, key) => <u key={key}>{parseInline(m[1], key)}</u>,
  },
  {
    regex: /~~([\s\S]+?)~~/,
    render: (m, key) => <s key={key} className="opacity-70">{parseInline(m[1], key)}</s>,
  },
  {
    // Вміст не починається і не закінчується пробілом — інакше «2 * 3 * 4»
    // у кошторисі перетворилось би на курсив.
    regex: /\*([^\s*][^*\n]*?[^\s*]|[^\s*])\*/,
    render: (m, key) => <em key={key}>{parseInline(m[1], key)}</em>,
  },
  {
    regex: /\[([^\]\n]+)\]\((\S+?)\)/,
    render: (m, key) => renderLink(m[2], m[1], key),
  },
  {
    regex: /https?:\/\/[^\s<>()[\]]+/,
    render: (m, key) => renderLink(m[0], m[0].replace(/^https?:\/\//, ''), key),
  },
];

function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  if (!text) return [];

  let best: { rule: Rule; match: RegExpExecArray } | null = null;
  for (const rule of RULES) {
    const match = rule.regex.exec(text);
    if (!match) continue;
    if (!best || match.index < best.match.index) best = { rule, match };
  }

  if (!best) return [text];

  const { rule, match } = best;
  const key = `${keyPrefix}-${match.index}`;
  return [
    ...(match.index > 0 ? [text.slice(0, match.index)] : []),
    rule.render(match, key),
    ...parseInline(text.slice(match.index + match[0].length), `${key}x`),
  ];
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*(\d+)\.\s+(.*)$/;

export default function RichText({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const bullet = BULLET.exec(lines[i]);
    const ordered = ORDERED.exec(lines[i]);

    if (bullet) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = BULLET.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 space-y-0.5 my-1">
          {items.map((item, idx) => <li key={idx}>{parseInline(item, `ul${i}-${idx}`)}</li>)}
        </ul>
      );
      continue;
    }

    if (ordered) {
      const items: string[] = [];
      const startAt = parseInt(ordered[1], 10) || 1;
      while (i < lines.length) {
        const m = ORDERED.exec(lines[i]);
        if (!m) break;
        items.push(m[2]);
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} start={startAt} className="list-decimal pl-5 space-y-0.5 my-1">
          {items.map((item, idx) => <li key={idx}>{parseInline(item, `ol${i}-${idx}`)}</li>)}
        </ol>
      );
      continue;
    }

    if (lines[i].trim() === '') {
      blocks.push(<div key={`br-${i}`} className="h-2" />);
      i++;
      continue;
    }

    blocks.push(<p key={`p-${i}`} className="whitespace-pre-wrap break-words">{parseInline(lines[i], `p${i}`)}</p>);
    i++;
  }

  return <div className={className}>{blocks}</div>;
}

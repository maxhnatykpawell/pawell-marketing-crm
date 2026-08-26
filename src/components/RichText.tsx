import React from 'react';
import { BlockNode, InlineNode, parseMarkdown } from '../lib/richText';
import { detectProvider, normalizeUrl } from '../lib/links';
import { useLinkTitle } from '../hooks/useLinkTitle';
import FileTypeIcon from './FileTypeIcon';

/**
 * Перегляд відформатованого тексту описів і коментарів.
 *
 * Рендеримо з того ж AST, що й редактор (див. lib/richText), і завжди у
 * React-вузли — жодного HTML з тексту не виконуємо. Посилання на Google-файли
 * отримують іконку прямо в тексті, щоб «ось та таблиця» читалась без переходу.
 */

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

/**
 * Голий URL на впізнаний сервіс — показуємо назвою документа.
 *
 * Поки назва їде (або якщо документ закритий), лишається адреса без схеми:
 * посилання клікабельне з першої мілісекунди, ніщо не «мигає» порожнім.
 * Для звичайних сайтів запит не робимо взагалі — там адреса й так читається,
 * а ходити за назвою кожного посилання в описі було б і повільно, і зайво.
 */
function AutoTitleLink({ href, fallback }: { href: string; fallback: string }) {
  const url = normalizeUrl(href);
  const provider = detectProvider(url);
  const title = useLinkTitle(url, provider.id !== 'link');
  return renderLink(href, title || fallback, 'auto');
}

function renderInline(nodes: InlineNode[], keyPrefix: string): React.ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (node.type) {
      case 'text':
        return <React.Fragment key={key}>{node.value}</React.Fragment>;
      case 'bold':
        return <strong key={key} className="font-semibold">{renderInline(node.children, key)}</strong>;
      case 'italic':
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case 'underline':
        return <u key={key}>{renderInline(node.children, key)}</u>;
      case 'strike':
        return <s key={key} className="opacity-70">{renderInline(node.children, key)}</s>;
      case 'code':
        return (
          <code key={key} className="px-1 py-0.5 rounded bg-gray-200/70 text-[0.9em] font-mono text-gray-800">
            {node.value}
          </code>
        );
      case 'link':
        if (node.bare) {
          const fallback = node.href.replace(/^https?:\/\//, '');
          return React.createElement(AutoTitleLink, { key, href: node.href, fallback });
        }
        return renderLink(node.href, renderInline(node.children, key), key);
    }
  });
}

function renderBlock(block: BlockNode, key: string): React.ReactNode {
  if (block.type === 'blank') return <div key={key} className="h-2" />;
  if (block.type === 'paragraph') {
    return <p key={key} className="whitespace-pre-wrap break-words">{renderInline(block.children, key)}</p>;
  }
  const items = block.items.map((item, idx) => <li key={idx}>{renderInline(item, `${key}-${idx}`)}</li>);
  return block.ordered
    ? <ol key={key} start={block.start} className="list-decimal pl-5 space-y-0.5 my-1">{items}</ol>
    : <ul key={key} className="list-disc pl-5 space-y-0.5 my-1">{items}</ul>;
}

export default function RichText({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  return <div className={className}>{parseMarkdown(text).map((b, i) => renderBlock(b, `b${i}`))}</div>;
}

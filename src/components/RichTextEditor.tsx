import React, { useLayoutEffect, useRef, useState } from 'react';
import { Bold, Italic, Strikethrough, Code, List, ListOrdered, Link2, Eye, Pencil } from 'lucide-react';
import { toggleWrap, toggleLinePrefix, insertLink, insertText, TextEdit } from '../lib/richText';
import { normalizeUrl } from '../lib/links';
import EmojiPicker from './EmojiPicker';
import RichText from './RichText';

/**
 * Textarea з мінімальною панеллю форматування.
 *
 * Лишаємось на textarea, а не на contentEditable: текст зберігається як
 * markdown-подібний рядок (див. lib/richText), тож те саме поле редагує описи,
 * які потім читає ШІ-асистент і телеграм. Ціна — форматування не видно під час
 * набору, тому поруч є перемикач «Перегляд».
 */

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  minHeight?: number;
  className?: string;
  /** Ctrl/Cmd+Enter — типова «відправка» для полів, де Enter робить новий рядок. */
  onSubmit?: () => void;
  onCancel?: () => void;
}

export default function RichTextEditor({
  value, onChange, placeholder, autoFocus, minHeight = 110, className, onSubmit, onCancel,
}: Props) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);
  const [preview, setPreview] = useState(false);

  // Після програмної зміни тексту повертаємо курсор туди, куди його поставила
  // дія панелі — інакше він стрибає в кінець і форматувати далі незручно.
  useLayoutEffect(() => {
    const sel = pendingSelection.current;
    if (!sel || !areaRef.current) return;
    pendingSelection.current = null;
    areaRef.current.focus();
    areaRef.current.setSelectionRange(sel[0], sel[1]);
  }, [value]);

  const apply = (fn: (text: string, start: number, end: number) => TextEdit) => {
    const area = areaRef.current;
    if (!area) return;
    const { selectionStart, selectionEnd } = area;
    const edit = fn(value, selectionStart, selectionEnd);
    pendingSelection.current = [edit.selectionStart, edit.selectionEnd];
    onChange(edit.text);
  };

  const handleLink = () => {
    const url = window.prompt('Посилання (Google Docs, Sheets, Drive…)');
    if (!url || !url.trim()) return;
    apply((t, s, e) => insertLink(t, s, e, normalizeUrl(url)));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && onCancel) { onCancel(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit(); return; }
    if (!(e.ctrlKey || e.metaKey)) return;

    const key = e.key.toLowerCase();
    if (key === 'b') { e.preventDefault(); apply((t, s, en) => toggleWrap(t, s, en, '**')); }
    else if (key === 'i') { e.preventDefault(); apply((t, s, en) => toggleWrap(t, s, en, '*')); }
    else if (key === 'u') { e.preventDefault(); apply((t, s, en) => toggleWrap(t, s, en, '__')); }
    else if (key === 'k') { e.preventDefault(); handleLink(); }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-0.5 flex-wrap px-1.5 py-1 bg-gray-50 border border-gray-200 border-b-0 rounded-t-xl">
        <ToolButton title="Жирний (Ctrl+B)" onClick={() => apply((t, s, e) => toggleWrap(t, s, e, '**'))}>
          <Bold className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="Похилий (Ctrl+I)" onClick={() => apply((t, s, e) => toggleWrap(t, s, e, '*'))}>
          <Italic className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="Підкреслений (Ctrl+U)" onClick={() => apply((t, s, e) => toggleWrap(t, s, e, '__'))}>
          <span className="text-sm font-semibold underline leading-none w-4 text-center">U</span>
        </ToolButton>
        <ToolButton title="Закреслений" onClick={() => apply((t, s, e) => toggleWrap(t, s, e, '~~'))}>
          <Strikethrough className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="Код" onClick={() => apply((t, s, e) => toggleWrap(t, s, e, '`'))}>
          <Code className="w-4 h-4" />
        </ToolButton>

        <span className="w-px h-4 bg-gray-300 mx-1" />

        <ToolButton title="Маркований список" onClick={() => apply((t, s, e) => toggleLinePrefix(t, s, e, '- '))}>
          <List className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="Нумерований список" onClick={() => apply((t, s, e) => toggleLinePrefix(t, s, e, '1. '))}>
          <ListOrdered className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="Посилання (Ctrl+K)" onClick={handleLink}>
          <Link2 className="w-4 h-4" />
        </ToolButton>
        <EmojiPicker onPick={emoji => apply((t, s, e) => insertText(t, s, e, emoji))} />

        <button
          type="button"
          onClick={() => setPreview(p => !p)}
          className="ml-auto flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-200/70 rounded-lg transition"
          title={preview ? 'Редагувати' : 'Переглянути як буде виглядати'}
        >
          {preview ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {preview ? 'Редагувати' : 'Перегляд'}
        </button>
      </div>

      {preview ? (
        <div
          className="w-full bg-white border border-gray-200 rounded-b-xl p-3 text-sm text-gray-700 overflow-y-auto"
          style={{ minHeight }}
        >
          {value.trim()
            ? <RichText text={value} />
            : <span className="text-gray-400 italic">Порожньо</span>}
        </div>
      ) : (
        <textarea
          ref={areaRef}
          autoFocus={autoFocus}
          className="w-full bg-white border border-blue-400 ring-2 ring-blue-100 rounded-b-xl p-3 text-sm text-gray-700 outline-none transition resize-y"
          style={{ minHeight }}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      )}
    </div>
  );
}

function ToolButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      // onMouseDown, а не onClick: клік спершу забирає фокус із textarea і
      // виділення схлопується — форматувати було б нічого.
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-200/70 transition flex items-center justify-center"
    >
      {children}
    </button>
  );
}

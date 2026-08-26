import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bold, Italic, Strikethrough, Code, List, ListOrdered, Link2, Underline as UnderlineIcon } from 'lucide-react';
import { htmlToMarkdown, markdownToHtml } from '../lib/richText';
import { normalizeUrl } from '../lib/links';
import EmojiPicker from './EmojiPicker';

/**
 * Редактор опису картки: те, що бачиш, те й отримуєш.
 *
 * Поле — contentEditable, тож жирне видно жирним, а не як «**жирне**».
 * Але назовні (і в базу) віддаємо markdown: описи читає ще й ШІ-асистент та
 * телеграм-сповіщення, а зберігати довільний HTML із буфера обміну — зайвий
 * ризик. Переклад в обидва боки живе в lib/richText.
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

type Format = 'bold' | 'italic' | 'underline' | 'strikeThrough';
const FORMATS: Format[] = ['bold', 'italic', 'underline', 'strikeThrough'];

export default function RichTextEditor({
  value, onChange, placeholder, autoFocus, minHeight = 110, className, onSubmit, onCancel,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  /**
   * Останнє, що ми самі віддали нагору. Порівняння з ним відрізняє «зміна
   * прийшла ззовні» від «це відлуння нашого ж набору» — інакше перезапис
   * innerHTML на кожну літеру збивав би курсор у початок.
   */
  const lastEmitted = useRef<string | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [isEmpty, setIsEmpty] = useState(!value.trim());

  const refreshActive = useCallback(() => {
    const state: Record<string, boolean> = {};
    for (const format of FORMATS) {
      try { state[format] = document.queryCommandState(format); } catch { state[format] = false; }
    }
    setActive(state);
  }, []);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const markdown = htmlToMarkdown(el);
    lastEmitted.current = markdown;
    setIsEmpty(!markdown.trim());
    onChange(markdown);
  }, [onChange]);

  // Синхронізація ззовні: перший рендер, скасування, підстановка опису від ШІ.
  useEffect(() => {
    const el = editorRef.current;
    if (!el || value === lastEmitted.current) return;
    el.innerHTML = markdownToHtml(value);
    setIsEmpty(!value.trim());
  }, [value]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // Теги замість inline-стилів: <b> конвертується назад однозначно,
    // а <span style="font-weight:700"> — вже як пощастить.
    try { document.execCommand('styleWithCSS', false, 'false'); } catch { /* Safari може не знати команди */ }
    if (autoFocus) {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    // autoFocus навмисно поза залежностями: курсор ставимо лише при відкритті
    // редактора, а не щоразу, коли батько перерендерився.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (command: string, argument?: string) => {
    editorRef.current?.focus();
    try { document.execCommand(command, false, argument); } catch { /* команда не підтримується */ }
    emit();
    refreshActive();
  };

  const handleLink = () => {
    const input = window.prompt('Посилання (Google Docs, Sheets, Drive…)');
    if (!input || !input.trim()) return;
    const url = normalizeUrl(input);
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) exec('createLink', url);
    else exec('insertText', url); // голе посилання підхопить рендерер картки
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && onCancel) { e.preventDefault(); onCancel(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); handleLink(); return; }
    // Ctrl+B/I/U браузер обробляє сам — нам лишається оновити підсвітку кнопок
    if (e.ctrlKey || e.metaKey) setTimeout(refreshActive, 0);
  };

  /**
   * Вставка — лише текстом.
   *
   * З Google Docs у буфері їде верстка на сотні тегів зі шрифтами й
   * кольорами; у картці вона все одно зведеться до наших п'яти форматів,
   * тож чесніше не тягнути її взагалі.
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text) exec('insertText', text);
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-0.5 flex-wrap px-1.5 py-1 bg-gray-50 border border-gray-200 border-b-0 rounded-t-xl">
        <ToolButton title="Жирний (Ctrl+B)" active={active.bold} onClick={() => exec('bold')}>
          <Bold className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="Похилий (Ctrl+I)" active={active.italic} onClick={() => exec('italic')}>
          <Italic className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="Підкреслений (Ctrl+U)" active={active.underline} onClick={() => exec('underline')}>
          <UnderlineIcon className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="Закреслений" active={active.strikeThrough} onClick={() => exec('strikeThrough')}>
          <Strikethrough className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="Код" onClick={() => wrapInCode(editorRef.current, emit)}>
          <Code className="w-4 h-4" />
        </ToolButton>

        <span className="w-px h-4 bg-gray-300 mx-1" />

        <ToolButton title="Маркований список" onClick={() => exec('insertUnorderedList')}>
          <List className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="Нумерований список" onClick={() => exec('insertOrderedList')}>
          <ListOrdered className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="Посилання (Ctrl+K)" onClick={handleLink}>
          <Link2 className="w-4 h-4" />
        </ToolButton>
        <EmojiPicker onPick={emoji => exec('insertText', emoji)} />
      </div>

      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          className="rich-editor w-full bg-white border border-blue-400 ring-2 ring-blue-100 rounded-b-xl p-3 text-sm text-gray-700 outline-none transition overflow-y-auto"
          style={{ minHeight }}
          onInput={() => { emit(); refreshActive(); }}
          onKeyUp={refreshActive}
          onMouseUp={refreshActive}
          onFocus={refreshActive}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
        {isEmpty && placeholder && (
          <span className="absolute left-3 top-3 text-sm text-gray-400 italic pointer-events-none">
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Моноширинний фрагмент.
 *
 * execCommand не вміє <code>, а fontName з моноширинним шрифтом дав би
 * <font face="…">, який після конвертації став би звичайним текстом. Тому
 * вставляємо тег напряму.
 */
function wrapInCode(editor: HTMLDivElement | null, emit: () => void) {
  if (!editor) return;
  editor.focus();
  const selection = window.getSelection();
  const text = selection && !selection.isCollapsed ? selection.toString() : '';
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  try {
    document.execCommand('insertHTML', false, `<code>${escaped || 'код'}</code>&nbsp;`);
  } catch { /* команда не підтримується */ }
  emit();
}

function ToolButton({
  title, onClick, active, children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      // onMouseDown, а не onClick: клік спершу забирає фокус із поля і
      // виділення схлопується — форматувати було б нічого.
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      className={`p-1.5 rounded-lg transition flex items-center justify-center ${
        active ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200/70'
      }`}
    >
      {children}
    </button>
  );
}

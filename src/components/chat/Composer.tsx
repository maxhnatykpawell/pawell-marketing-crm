import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AtSign, CornerUpLeft, FileText, Loader2, Paperclip, Send, X } from 'lucide-react';
import { uploadFile } from '../../api';
import { ChatAttachment, ChatMessage, User } from '../../types';
import { draftKey, isImageName } from '../../lib/chat';
import { applyMention, mentionQueryAt, suggestMentions } from '../../lib/mentions';
import MentionSuggestions from '../MentionSuggestions';
import EmojiPicker from '../EmojiPicker';
import type { SendExtra } from '../../hooks/useChat';

const MAX_FILE_MB = 25;

interface Pending {
  key: string;
  name: string;
  isImage: boolean;
  /** Поки вантажиться — url немає */
  url?: string;
  /** Локальний превʼю-образ, щоб фото було видно ще до завершення вантаження */
  preview?: string;
  error?: string;
}

/**
 * Поле вводу повідомлення.
 *
 * Що тут зроблено заради зручності, зокрема з телефона:
 *  - росте разом із текстом (до ~8 рядків), а не показує смужку прокрутки;
 *  - чернетка зберігається за розмовою — перемкнувся на інший канал і повернувся,
 *    а недописане на місці;
 *  - Enter надсилає лише з клавіатури комп'ютера; на екрані дотику це новий рядок,
 *    а надсилає кнопка (інакше повідомлення йшло б недописаним);
 *  - кнопки панелі не крадуть фокус, тож клавіатура на телефоні не ховається
 *    щоразу, коли тиснеш «надіслати»;
 *  - файли можна прикріпити кнопкою, перетягнути або вставити з буфера (скріншот).
 */
export default function Composer({
  conversationId, users, mobile, disabled, replyTo, replyAuthor, onCancelReply, onSend,
}: {
  conversationId: string;
  users: User[];
  mobile: boolean;
  disabled: boolean;
  replyTo: ChatMessage | null;
  replyAuthor: string;
  onCancelReply: () => void;
  onSend: (text: string, extra: SendExtra) => Promise<void>;
}) {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(draftKey(conversationId)) ?? ''; } catch { return ''; }
  });
  const [files, setFiles] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => suggestMentions(users, mentionQuery), [mentionQuery, users]);
  const uploading = files.some(f => !f.url && !f.error);
  const ready = files.filter(f => f.url);
  const canSend = (!!text.trim() || ready.length > 0) && !sending && !uploading && !disabled;

  // Автовисота: спершу скидаємо, інакше textarea ніколи не стискається назад
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [text]);

  // Чернетка: пишемо з невеликою затримкою, а не на кожну літеру
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (text.trim()) localStorage.setItem(draftKey(conversationId), text);
        else localStorage.removeItem(draftKey(conversationId));
      } catch { /* приватний режим — чернетка просто не збережеться */ }
    }, 250);
    return () => clearTimeout(t);
  }, [text, conversationId]);

  // Натиснули «Відповісти» — одразу можна друкувати
  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  const upload = (list: File[]) => {
    for (const file of list) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const isImage = file.type.startsWith('image/') || isImageName(file.name);
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setFiles(prev => [...prev, { key, name: file.name, isImage, error: `Більше ${MAX_FILE_MB} МБ` }]);
        continue;
      }
      // Скріншот із буфера приходить з іменем «image.png» — дамо йому читабельне
      const name = file.name && file.name !== 'image.png' ? file.name : `Знімок ${new Date().toLocaleTimeString('uk-UA')}.png`;
      const preview = isImage ? URL.createObjectURL(file) : undefined;
      setFiles(prev => [...prev, { key, name, isImage, preview }]);
      uploadFile(file)
        .then(res => setFiles(prev => prev.map(f => (f.key === key ? { ...f, url: res.url, name: res.name || name } : f))))
        .catch(() => setFiles(prev => prev.map(f => (f.key === key ? { ...f, error: 'Не вдалось завантажити' } : f))));
    }
  };

  const removeFile = (key: string) => {
    setFiles(prev => {
      const f = prev.find(x => x.key === key);
      if (f?.preview) URL.revokeObjectURL(f.preview);
      return prev.filter(x => x.key !== key);
    });
  };

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const attachments: ChatAttachment[] = ready.map(f => ({ name: f.name, url: f.url!, isImage: f.isImage }));
      await onSend(text.trim(), {
        replyToId: replyTo?.id,
        attachments: attachments.length ? attachments : undefined,
      });
      files.forEach(f => f.preview && URL.revokeObjectURL(f.preview));
      setText('');
      setFiles([]);
      setMentionQuery(null);
      onCancelReply();
      try { localStorage.removeItem(draftKey(conversationId)); } catch { /* не критично */ }
      inputRef.current?.focus();
    } catch (e: any) {
      setError(e.message || 'Не вдалось надіслати');
    } finally {
      setSending(false);
    }
  };

  const onChange = (v: string) => {
    setText(v);
    // Підказку показуємо лише поки людина друкує саме згадку в кінці рядка
    setMentionQuery(mentionQueryAt(v));
  };

  const pickMention = (name: string) => {
    setText(prev => applyMention(prev, name));
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const insertAtCursor = (chunk: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + chunk + text.slice(end);
    setText(next);
    // Курсор — одразу після вставленого, інакше він стрибає в кінець
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + chunk.length, start + chunk.length);
    });
  };

  const startMention = () => {
    const needsSpace = text.length > 0 && !/\s$/.test(text);
    onChange(text + (needsSpace ? ' ' : '') + '@');
    inputRef.current?.focus();
  };

  // Кнопки панелі не відбирають фокус у поля (на телефоні це ховало б клавіатуру)
  const keepFocus = (e: React.SyntheticEvent) => e.preventDefault();

  return (
    <div
      className="shrink-0 bg-white border-t border-gray-200 px-3 sm:px-4 pt-2 pb-2 sm:pb-3 relative sm:pr-16"
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        upload([...e.dataTransfer.files]);
      }}
    >
      {error && <p className="text-xs text-red-500 mb-1.5 px-1">{error}</p>}

      <div className={`relative rounded-xl border bg-white transition ${
        dragging ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/40' : 'border-gray-300 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100'
      }`}>
        <MentionSuggestions users={suggestions} onPick={pickMention} align="bottom" />

        {replyTo && (
          <div className="flex items-start gap-2 px-3 pt-2 text-xs text-gray-500">
            <CornerUpLeft className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
            <p className="flex-1 min-w-0 truncate">
              Відповідь для <span className="font-semibold text-gray-700">{replyAuthor}</span>
              {': '}{replyTo.deletedAt ? 'повідомлення видалено' : (replyTo.text || (replyTo.attachments?.[0]?.name ?? ''))}
            </p>
            <button
              onClick={onCancelReply}
              aria-label="Скасувати відповідь"
              className="p-1.5 -m-1 text-gray-400 hover:text-gray-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {files.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-3 pt-2.5 hidden-scrollbar">
            {files.map(f => (
              <div
                key={f.key}
                className={`relative shrink-0 rounded-lg border ${f.error ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} ${f.preview ? 'w-16 h-16' : 'h-16 pl-3 pr-8 flex items-center gap-2 max-w-[200px]'}`}
              >
                {f.preview ? (
                  <img src={f.preview} alt={f.name} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <>
                    <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-700 truncate">{f.name}</span>
                  </>
                )}
                {!f.url && !f.error && (
                  <span className="absolute inset-0 rounded-lg bg-white/60 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                  </span>
                )}
                {f.error && (
                  <span className="absolute inset-x-0 bottom-0 text-[9px] leading-tight text-center text-red-600 bg-red-50/90 rounded-b-lg px-0.5">
                    {f.error}
                  </span>
                )}
                <button
                  onClick={() => removeFile(f.key)}
                  aria-label={`Прибрати ${f.name}`}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-700 text-white flex items-center justify-center shadow"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={inputRef}
          value={text}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape' && replyTo) { onCancelReply(); return; }
            // Enter надсилає, Shift+Enter — новий рядок. На екрані дотику Enter — це новий рядок,
            // а надсилає кнопка: інакше на телефоні повідомлення йшло б недописаним
            const isTouch = window.matchMedia('(pointer: coarse)').matches;
            if (e.key === 'Enter' && !e.shiftKey && !isTouch && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          onPaste={e => {
            const pasted = [...e.clipboardData.files];
            if (pasted.length > 0) {
              e.preventDefault();
              upload(pasted);
            }
          }}
          rows={1}
          disabled={disabled}
          enterKeyHint={mobile ? 'enter' : 'send'}
          placeholder={disabled ? 'Немає зв’язку із сервером…' : 'Напишіть повідомлення'}
          className="block w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm leading-relaxed outline-none disabled:text-gray-400 min-h-[44px]"
        />

        <div className="flex items-center justify-between px-1.5 pb-1.5">
          <div className="flex items-center">
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={() => fileRef.current?.click()}
              aria-label="Прикріпити файл"
              title="Прикріпити файл"
              className="p-2.5 sm:p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
            >
              <Paperclip className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={e => { upload([...(e.target.files ?? [])]); e.target.value = ''; }}
            />
            <div onMouseDown={keepFocus}>
              <EmojiPicker
                direction="up"
                align="left"
                title="Емодзі"
                onPick={emoji => insertAtCursor(emoji)}
                className="p-2.5 sm:p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition [&_svg]:w-5 [&_svg]:h-5 sm:[&_svg]:w-4 sm:[&_svg]:h-4"
              />
            </div>
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={startMention}
              aria-label="Згадати колегу"
              title="Згадати колегу"
              className="p-2.5 sm:p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
            >
              <AtSign className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!mobile && (
              <span className="hidden sm:inline text-[11px] text-gray-400">
                <kbd className="font-sans">Enter</kbd> — надіслати, <kbd className="font-sans">Shift+Enter</kbd> — новий рядок
              </span>
            )}
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={submit}
              disabled={!canSend}
              aria-label="Надіслати повідомлення"
              title="Надіслати"
              className="h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed shrink-0"
            >
              {sending || uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

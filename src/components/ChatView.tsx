/**
 * Чат: список розмов ліворуч, стрічка праворуч.
 *
 * Уся мережева механіка живе в useChat — тут лише показ. Свідомо тримаємось
 * вигляду решти системи (білі картки, сині акценти), а не «як у месенджері»:
 * це вкладка робочого інструмента, а не окремий застосунок.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../App';
import { ChatConversationView, ChatMessage, User } from '../types';
import { UseChat } from '../hooks/useChat';
import { dayKey, dayLabel, startsNewGroup } from '../lib/chat';
import {
  MessageSquare, Hash, Lock, Plus, Send, Search, X, Check,
  Pencil, Trash2, Loader2, Users as UsersIcon, ChevronUp,
} from 'lucide-react';

interface Props {
  chat: UseChat;
}

export default function ChatView({ chat }: Props) {
  const { state, currentUser } = useAppContext();
  const users = state.users || [];
  const myId = currentUser?.userId ?? '';

  const [search, setSearch] = useState('');
  const [isNewChannelOpen, setIsNewChannelOpen] = useState(false);
  const [isPeoplePickerOpen, setIsPeoplePickerOpen] = useState(false);

  const userById = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  /** Назва розмови очима поточного користувача */
  const titleOf = (c: ChatConversationView): string => {
    if (c.kind === 'dm') {
      const peer = c.peerId ? userById.get(c.peerId) : null;
      return peer?.name ?? 'Особисте листування';
    }
    return c.title;
  };

  const active = chat.conversations.find(c => c.id === chat.activeId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chat.conversations;
    return chat.conversations.filter(c => titleOf(c).toLowerCase().includes(q));
  }, [chat.conversations, search, userById]);

  // Перше відкриття — стаємо в найсвіжішу розмову, щоб не дивитись у порожнечу
  useEffect(() => {
    if (!chat.activeId && chat.conversations.length > 0) {
      chat.openConversation(chat.conversations[0].id);
    }
  }, [chat.conversations, chat.activeId]);

  return (
    // flex-1 + min-h-0, а не h-full: батьківський <main> — колонка, і без
    // min-h-0 стрічка розпирала б сторінку замість того, щоб прокручуватись
    <div className="flex-1 min-h-0 flex bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

      {/* ── Список розмов ── */}
      <aside className="w-64 lg:w-72 border-r border-gray-200 flex flex-col bg-gray-50/60 shrink-0">
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-500" />
              Чат
              <ConnectionDot state={chat.connection} />
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsPeoplePickerOpen(true)}
                title="Написати колезі"
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
              >
                <UsersIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsNewChannelOpen(true)}
                title="Створити канал"
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Пошук розмови..."
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-100 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto hidden-scrollbar py-2">
          {filtered.length === 0 ? (
            <p className="text-xs text-gray-400 text-center px-4 py-6">Нічого не знайдено</p>
          ) : filtered.map(c => {
            const isActive = c.id === chat.activeId;
            const peer = c.kind === 'dm' && c.peerId ? userById.get(c.peerId) : null;
            return (
              <button
                key={c.id}
                onClick={() => chat.openConversation(c.id)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition ${
                  isActive ? 'bg-blue-50 border-r-2 border-blue-600' : 'hover:bg-gray-100'
                }`}
              >
                {peer ? (
                  <img src={peer.avatar} alt={peer.name} className="w-7 h-7 rounded-full object-cover border border-gray-200 shrink-0" />
                ) : (
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {c.memberIds === null ? <Hash className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${c.unread > 0 ? 'font-bold text-gray-900' : isActive ? 'font-semibold text-blue-800' : 'font-medium text-gray-700'}`}>
                      {titleOf(c)}
                    </span>
                    {c.unread > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {c.unread > 99 ? '99+' : c.unread}
                      </span>
                    )}
                  </div>
                  {c.lastMessagePreview && (
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{c.lastMessagePreview}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Стрічка ── */}
      <section className="flex-1 flex flex-col min-w-0">
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <MessageSquare className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">Оберіть розмову ліворуч або створіть новий канал</p>
          </div>
        ) : (
          <>
            <header className="px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {active.kind === 'dm'
                  ? <UsersIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  : active.memberIds === null
                    ? <Hash className="w-4 h-4 text-gray-400 shrink-0" />
                    : <Lock className="w-4 h-4 text-gray-400 shrink-0" />}
                <h3 className="text-sm font-bold text-gray-800 truncate">{titleOf(active)}</h3>
                {active.kind === 'channel' && (
                  <span className="text-[11px] text-gray-400 shrink-0">
                    {active.memberIds === null ? 'відкритий для всіх' : `${active.memberIds.length} учасник(ів)`}
                  </span>
                )}
              </div>
              {chat.connection !== 'online' && (
                <span className="text-[11px] text-amber-600 flex items-center gap-1 shrink-0">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {chat.connection === 'connecting' ? 'Підключення...' : 'Немає зв’язку'}
                </span>
              )}
            </header>

            <MessageFeed chat={chat} myId={myId} userById={userById} />

            <Composer
              users={users}
              disabled={chat.connection === 'offline'}
              onSend={chat.send}
            />
          </>
        )}
      </section>

      {isNewChannelOpen && (
        <NewChannelDialog
          users={users}
          myId={myId}
          onClose={() => setIsNewChannelOpen(false)}
          onCreate={async (title, memberIds) => {
            const id = await chat.createChannel(title, memberIds);
            chat.openConversation(id);
            setIsNewChannelOpen(false);
          }}
        />
      )}

      {isPeoplePickerOpen && (
        <PeoplePicker
          users={users.filter(u => u.id !== myId)}
          onClose={() => setIsPeoplePickerOpen(false)}
          onPick={async peerId => {
            const id = await chat.openDm(peerId);
            chat.openConversation(id);
            setIsPeoplePickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── Індикатор з'єднання ───────────────────────────────────────────────────────

function ConnectionDot({ state }: { state: 'connecting' | 'online' | 'offline' }) {
  const map = {
    online:     { color: 'bg-green-500', title: 'Онлайн — повідомлення приходять миттєво' },
    connecting: { color: 'bg-amber-400 animate-pulse', title: 'Підключення...' },
    offline:    { color: 'bg-gray-300', title: 'Немає зв’язку — перепідключаємось' },
  }[state];
  return <span className={`w-1.5 h-1.5 rounded-full ${map.color}`} title={map.title} />;
}

// ── Стрічка повідомлень ───────────────────────────────────────────────────────

function MessageFeed({
  chat, myId, userById,
}: {
  chat: UseChat;
  myId: string;
  userById: Map<string, User>;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  /**
   * Прокрутка вниз — тільки якщо людина вже була внизу. Інакше нове
   * повідомлення смикало б стрічку в того, хто саме читає давню історію.
   */
  const wasAtBottom = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (wasAtBottom.current) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  let lastDay = '';

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto px-5 py-4 bg-gray-50/40"
    >
      {chat.hasMore && (
        <div className="text-center mb-4">
          <button
            onClick={chat.loadOlder}
            disabled={chat.loadingMessages}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-white border border-gray-200 rounded-full px-3 py-1.5 shadow-sm transition disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {chat.loadingMessages ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronUp className="w-3 h-3" />}
            Показати давніші
          </button>
        </div>
      )}

      {chat.loadingMessages && chat.messages.length === 0 && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        </div>
      )}

      {!chat.loadingMessages && chat.messages.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-10">
          Поки що порожньо. Напишіть перше повідомлення.
        </p>
      )}

      {chat.messages.map((m, i) => {
        const prev = i > 0 ? chat.messages[i - 1] : null;
        const author = userById.get(m.authorId);
        const isMine = m.authorId === myId;
        const newGroup = startsNewGroup(m, prev);

        const day = dayKey(m.createdAt);
        const showDay = day !== lastDay;
        lastDay = day;

        return (
          <React.Fragment key={m.id}>
            {showDay && (
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {dayLabel(m.createdAt)}
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
            )}

            <div className={`group flex gap-2.5 ${newGroup ? 'mt-3' : 'mt-0.5'}`}>
              <div className="w-7 shrink-0">
                {newGroup && author && (
                  <img src={author.avatar} alt={author.name} className="w-7 h-7 rounded-full object-cover border border-gray-200" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                {newGroup && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-bold text-gray-800">{author?.name ?? 'Невідомий'}</span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(m.createdAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                {editingId === m.id ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      autoFocus
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingId(null);
                        if (e.key === 'Enter' && editText.trim()) {
                          chat.edit(m.id, editText.trim()).catch(console.error);
                          setEditingId(null);
                        }
                      }}
                      className="flex-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                      onClick={() => { chat.edit(m.id, editText.trim()).catch(console.error); setEditingId(null); }}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {m.deletedAt ? (
                        <p className="text-sm text-gray-400 italic">Повідомлення видалено</p>
                      ) : (
                        <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                          <HighlightedText text={m.text} mentions={m.mentions ?? []} myId={myId} userById={userById} />
                          {m.editedAt && <span className="text-[10px] text-gray-400 ml-1.5">(змінено)</span>}
                        </p>
                      )}
                    </div>

                    {isMine && !m.deletedAt && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                        <button
                          onClick={() => { setEditingId(m.id); setEditText(m.text); }}
                          title="Редагувати"
                          className="p-1 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => chat.remove(m.id).catch(console.error)}
                          title="Видалити"
                          className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

/** Підсвітка @-згадок; своє ім'я виділяється помітніше за чуже */
function HighlightedText({
  text, mentions, myId, userById,
}: {
  text: string;
  mentions: string[];
  myId: string;
  userById: Map<string, User>;
}) {
  if (mentions.length === 0) return <>{text}</>;

  const names = mentions
    .map(id => ({ id, name: userById.get(id)?.name ?? '' }))
    .filter(x => x.name)
    .sort((a, b) => b.name.length - a.name.length);

  const parts: React.ReactNode[] = [];
  let rest = text;
  let guard = 0;

  while (rest && guard++ < 200) {
    let hit: { index: number; length: number; id: string } | null = null;
    for (const n of names) {
      const idx = rest.toLowerCase().indexOf('@' + n.name.toLowerCase());
      if (idx !== -1 && (!hit || idx < hit.index)) {
        hit = { index: idx, length: n.name.length + 1, id: n.id };
      }
    }
    if (!hit) break;

    if (hit.index > 0) parts.push(rest.slice(0, hit.index));
    parts.push(
      <span
        key={parts.length}
        className={`font-semibold px-1 rounded ${
          hit.id === myId ? 'bg-amber-100 text-amber-800' : 'text-blue-600'
        }`}
      >
        {rest.slice(hit.index, hit.index + hit.length)}
      </span>,
    );
    rest = rest.slice(hit.index + hit.length);
  }

  if (rest) parts.push(rest);
  return <>{parts}</>;
}

// ── Поле вводу ────────────────────────────────────────────────────────────────

function Composer({
  users, disabled, onSend,
}: {
  users: User[];
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return users.filter(u => u.name.toLowerCase().includes(q)).slice(0, 5);
  }, [mentionQuery, users]);

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body);
      setText('');
      setMentionQuery(null);
    } catch (e: any) {
      setError(e.message || 'Не вдалось надіслати');
    } finally {
      setSending(false);
    }
  };

  const onChange = (v: string) => {
    setText(v);
    // Показуємо підказку лише поки людина друкує саме згадку в кінці рядка
    const m = v.match(/@([^@\n]*)$/);
    setMentionQuery(m ? m[1] : null);
  };

  const pickMention = (name: string) => {
    setText(prev => prev.replace(/@([^@\n]*)$/, `@${name} `));
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  return (
    // pr-16 — під правим нижнім кутом висить плаваюча кнопка асистента, і без
    // відступу вона накриває собою кнопку «надіслати»
    <div className="border-t border-gray-200 pl-4 pr-16 py-3 bg-white shrink-0 relative">
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-4 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-56 z-10">
          {suggestions.map(u => (
            <button
              key={u.id}
              onClick={() => pickMention(u.name)}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50 transition text-left"
            >
              <img src={u.avatar} alt={u.name} className="w-5 h-5 rounded-full object-cover" />
              <span className="text-sm text-gray-700 truncate">{u.name}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-[11px] text-red-500 mb-1.5">{error}</p>}

      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            // Enter надсилає, Shift+Enter — новий рядок
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          disabled={disabled}
          placeholder={disabled ? 'Немає зв’язку із сервером...' : 'Напишіть повідомлення. @ — щоб згадати колегу'}
          className="flex-1 resize-none max-h-32 px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition disabled:bg-gray-50"
          style={{ minHeight: '38px' }}
        />
        <button
          onClick={submit}
          disabled={!text.trim() || sending || disabled}
          className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          title="Надіслати (Enter)"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Діалоги ───────────────────────────────────────────────────────────────────

function NewChannelDialog({
  users, myId, onClose, onCreate,
}: {
  users: User[];
  myId: string;
  onClose: () => void;
  onCreate: (title: string, memberIds: string[] | null) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(title.trim(), isPrivate ? [...selected, myId] : null);
    } catch (e: any) {
      setError(e.message || 'Не вдалось створити канал');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Новий канал</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Назва</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="Наприклад: реклама"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={e => setIsPrivate(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-gray-700">Закритий канал</span>
              <span className="block text-xs text-gray-500">
                Бачитимуть лише обрані. Відкритий канал доступний усій команді.
              </span>
            </span>
          </label>

          {isPrivate && (
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-56 overflow-y-auto">
              {users.filter(u => u.id !== myId).map(u => {
                const on = selected.includes(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => setSelected(prev => on ? prev.filter(x => x !== u.id) : [...prev, u.id])}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition text-left"
                  >
                    <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full object-cover" />
                    <span className="flex-1 text-sm text-gray-700 truncate">{u.name}</span>
                    {on && <Check className="w-4 h-4 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition">
            Скасувати
          </button>
          <button
            onClick={submit}
            disabled={!title.trim() || busy}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Створити
          </button>
        </div>
      </div>
    </div>
  );
}

function PeoplePicker({
  users, onClose, onPick,
}: {
  users: User[];
  onClose: () => void;
  onPick: (userId: string) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const filtered = users.filter(u => u.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Написати колезі</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100">
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Пошук..."
            className="w-full px-3 py-2 text-sm bg-gray-100 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Нікого не знайдено</p>
          ) : filtered.map(u => (
            <button
              key={u.id}
              onClick={() => onPick(u.id)}
              className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-blue-50 transition text-left"
            >
              <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full object-cover border border-gray-200" />
              <span className="text-sm text-gray-700 truncate">{u.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

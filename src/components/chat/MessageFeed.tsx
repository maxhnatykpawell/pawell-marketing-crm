import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, Check, ChevronUp, Copy, CornerUpLeft, FileText, Loader2, Pencil, SmilePlus, Trash2, X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAppContext } from '../../App';
import { DUR, EASE, SPRING } from '../../lib/motion';
import { ChatMessage, User } from '../../types';
import type { UseChat } from '../../hooks/useChat';
import { dayKey, dayLabel, startsNewGroup } from '../../lib/chat';
import { splitMentions } from '../../lib/mentions';
import { formatMessage } from '../../lib/chatFormat';
import Sheet from './Sheet';

/** Швидкі реакції: те, чим у робочому чаті справді відповідають */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '👀', '✅'];

const isCoarse = () => window.matchMedia('(pointer: coarse)').matches;

interface Props {
  chat: UseChat;
  myId: string;
  isAdmin: boolean;
  userById: Map<string, User>;
  mobile: boolean;
  /** Скільки непрочитаного було в розмові на момент відкриття — для роздільника «Нові» */
  unreadAtOpen: number;
  onReply: (m: ChatMessage) => void;
}

export default function MessageFeed({ chat, myId, isAdmin, userById, mobile, unreadAtOpen, onReply }: Props) {
  const { confirmAction } = useAppContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  /**
   * Нове повідомлення: з'явилось ПІСЛЯ того, як розмову відкрили, і пізніше за все, що вже було.
   * Тоді воно плавно виїжджає знизу. Історія, що підвантажилась при відкритті чи через «Показати
   * давніші», не анімується: сотня повідомлень, що одночасно «вискакують», — це шум, а не рух.
   */
  const knownIds = useRef<Set<string> | null>(null);
  const newestKnown = useRef('');
  if (knownIds.current === null && chat.messages.length > 0) {
    knownIds.current = new Set(chat.messages.map(m => m.id));
    newestKnown.current = chat.messages[chat.messages.length - 1].createdAt;
  }
  const isFresh = (m: ChatMessage) =>
    knownIds.current !== null && !knownIds.current.has(m.id) && m.createdAt > newestKnown.current;
  useEffect(() => {
    if (knownIds.current === null) return;
    for (const m of chat.messages) knownIds.current.add(m.id);
    const last = chat.messages[chat.messages.length - 1];
    if (last && last.createdAt > newestKnown.current) newestKnown.current = last.createdAt;
  }, [chat.messages]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [newBelow, setNewBelow] = useState(0);

  // ── Прокрутка ───────────────────────────────────────────────────────────────
  // Вниз прокручуємо лише якщо людина вже була внизу — інакше нове повідомлення
  // смикало б стрічку в того, хто саме читає давню історію.
  const stick = useRef(true);
  const prev = useRef<{ first?: string; last?: string; height: number }>({ height: 0 });
  const firstLoad = useRef(true);

  /**
   * Роздільник «Нові» ставимо один раз — коли історія вперше підвантажилась.
   * Далі він стоїть на місці, поки розмова відкрита: сенс у тому, щоб показати,
   * де закінчилось прочитане раніше, а не рухатись за кожним новим повідомленням.
   */
  // Рахуємо під час рендеру (а не в ефекті), щоб перша прокрутка вже знала, куди їхати.
  const dividerRef = useRef<string | null | undefined>(undefined);
  if (dividerRef.current === undefined && chat.messages.length > 0) {
    const idx = chat.messages.length - unreadAtOpen;
    dividerRef.current = unreadAtOpen > 0 && idx > 0 && idx < chat.messages.length ? chat.messages[idx].id : null;
  }
  const dividerId = dividerRef.current ?? null;

  const settling = useRef(false);
  const positionInitial = useCallback(() => {
    const divider = dividerId ? document.getElementById(`msg-${dividerId}`) : null;
    if (divider) {
      divider.scrollIntoView({ block: 'center' });
      stick.current = false;
    } else {
      bottomRef.current?.scrollIntoView({ block: 'end' });
      stick.current = true;
    }
  }, [dividerId]);

  /** Картинка догрузилась і змінила висоту: тримаємо позицію, а не лишаємо її «пливти» */
  const onMediaLoad = useCallback(() => {
    if (settling.current) positionInitial();
    else if (stick.current) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [positionInitial]);

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: smooth ? 'smooth' : 'auto' });
    setNewBelow(0);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const list = chat.messages;
    if (!el || list.length === 0) { prev.current.height = el?.scrollHeight ?? 0; return; }
    const first = list[0].id;
    const last = list[list.length - 1].id;
    const p = prev.current;

    if (firstLoad.current) {
      firstLoad.current = false;
      positionInitial();
      // Фото й вкладення дорощують висоту вже після цього — ще пару секунд підправляємо позицію
      settling.current = true;
      setTimeout(() => { settling.current = false; }, 2500);
    } else if (p.first && first !== p.first && last === p.last) {
      // Довантажили давнішу історію — лишаємось на тому ж місці, а не стрибаємо вгору
      el.scrollTop += el.scrollHeight - p.height;
    } else if (last !== p.last) {
      const lastMsg = list[list.length - 1];
      if (stick.current || lastMsg.authorId === myId) scrollToBottom();
      else setNewBelow(n => n + 1);
    }
    prev.current = { first, last, height: el.scrollHeight };
  }, [chat.messages, myId, scrollToBottom, dividerId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (stick.current) setNewBelow(0);
  };

  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1600);
  };

  // ── Дії ─────────────────────────────────────────────────────────────────────
  const startEdit = (m: ChatMessage) => { setEditingId(m.id); setEditText(m.text); setMenuMsg(null); };

  const saveEdit = (m: ChatMessage) => {
    const body = editText.trim();
    setEditingId(null);
    if (!body && !m.attachments?.length) return;
    if (body === m.text) return;
    chat.edit(m.id, body).catch(console.error);
  };

  const askRemove = (m: ChatMessage) => {
    setMenuMsg(null);
    // На телефоні легко зачепити пальцем — перепитуємо; на комп'ютері видаляємо одразу
    const remove = () => chat.remove(m.id).catch(console.error);
    if (isCoarse()) confirmAction('Видалити це повідомлення?', remove);
    else remove();
  };

  const copyText = (m: ChatMessage) => {
    setMenuMsg(null);
    navigator.clipboard?.writeText(m.text).catch(() => { /* без дозволу — просто не копіюємо */ });
  };

  const react = (m: ChatMessage, emoji: string) => {
    setMenuMsg(null);
    setReactFor(null);
    chat.react(m.id, emoji).catch(console.error);
  };

  let lastDay = '';

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto overscroll-contain py-3 bg-white"
      >
        {chat.hasMore && (
          <div className="text-center mb-3">
            <button
              onClick={chat.loadOlder}
              disabled={chat.loadingMessages}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm transition disabled:opacity-50 inline-flex items-center gap-1.5"
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
          <p className="text-center text-sm text-gray-400 py-10 px-6">
            Поки що порожньо. Напишіть перше повідомлення.
          </p>
        )}

        {chat.messages.map((m, i) => {
          const before = i > 0 ? chat.messages[i - 1] : null;
          const author = userById.get(m.authorId);
          const isMine = m.authorId === myId;
          const day = dayKey(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          // Після роздільника дня чи «Нові» серія починається заново — з аватаром
          const newGroup = showDay || m.id === dividerId || startsNewGroup(m, before);
          const time = new Date(m.createdAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
          const canDelete = isMine || isAdmin;

          return (
            <React.Fragment key={m.id}>
              {showDay && (
                <div className="flex items-center gap-3 my-3 px-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px] font-semibold text-gray-500 bg-white border border-gray-200 rounded-full px-3 py-0.5">
                    {dayLabel(m.createdAt)}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )}
              {m.id === dividerId && (
                <div className="flex items-center gap-3 my-2 px-4">
                  <div className="flex-1 h-px bg-red-300" />
                  <span className="text-[11px] font-bold text-red-500 uppercase tracking-wide">Нові</span>
                  <div className="flex-1 h-px bg-red-300" />
                </div>
              )}

              <MessageRow
                m={m}
                animateIn={isFresh(m)}
                newGroup={newGroup}
                authorName={author?.name ?? 'Невідомий'}
                authorAvatar={author?.avatar}
                time={time}
                isMine={isMine}
                canDelete={canDelete}
                myId={myId}
                userById={userById}
                flash={flashId === m.id}
                editing={editingId === m.id}
                editText={editText}
                setEditText={setEditText}
                onSaveEdit={() => saveEdit(m)}
                onCancelEdit={() => setEditingId(null)}
                reactOpen={reactFor === m.id}
                onToggleReactPicker={() => setReactFor(reactFor === m.id ? null : m.id)}
                onReact={emoji => react(m, emoji)}
                onReply={() => onReply(m)}
                onEdit={() => startEdit(m)}
                onDelete={() => askRemove(m)}
                onOpenMenu={() => setMenuMsg(m)}
                onJump={jumpTo}
                onMediaLoad={onMediaLoad}
                mobile={mobile}
              />
            </React.Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {newBelow > 0 && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-blue-600 text-white text-xs font-semibold shadow-lg active:bg-blue-700"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          {newBelow === 1 ? 'Нове повідомлення' : `Нових: ${newBelow}`}
        </button>
      )}

      {/* Меню дій для дотику: швидкі реакції + список */}
      {menuMsg && (
        <Sheet onClose={() => setMenuMsg(null)} size="sm">
          <div className="px-3 pt-2 pb-1">
            <div className="flex items-center justify-between gap-1 pb-3 border-b border-gray-100">
              {QUICK_REACTIONS.map(e => (
                <button
                  key={e}
                  onClick={() => react(menuMsg, e)}
                  className={`flex-1 h-12 text-2xl rounded-xl active:bg-gray-100 ${menuMsg.reactions?.[e]?.includes(myId) ? 'bg-blue-50' : ''}`}
                  aria-label={`Реакція ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
            <ul className="py-1">
              <MenuItem icon={<CornerUpLeft className="w-5 h-5" />} label="Відповісти" onClick={() => { setMenuMsg(null); onReply(menuMsg); }} />
              {menuMsg.text && <MenuItem icon={<Copy className="w-5 h-5" />} label="Копіювати текст" onClick={() => copyText(menuMsg)} />}
              {menuMsg.authorId === myId && menuMsg.text && (
                <MenuItem icon={<Pencil className="w-5 h-5" />} label="Редагувати" onClick={() => startEdit(menuMsg)} />
              )}
              {(menuMsg.authorId === myId || isAdmin) && (
                <MenuItem icon={<Trash2 className="w-5 h-5" />} label="Видалити" danger onClick={() => askRemove(menuMsg)} />
              )}
            </ul>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-3 min-h-[52px] rounded-xl text-base active:bg-gray-100 ${danger ? 'text-red-600' : 'text-gray-800'}`}
      >
        {icon}
        {label}
      </button>
    </li>
  );
}

// ── Одне повідомлення ─────────────────────────────────────────────────────────

interface RowProps {
  m: ChatMessage;
  /** Повідомлення щойно прийшло: показати його плавним виїздом знизу */
  animateIn: boolean;
  newGroup: boolean;
  authorName: string;
  authorAvatar?: string;
  time: string;
  isMine: boolean;
  canDelete: boolean;
  myId: string;
  userById: Map<string, User>;
  flash: boolean;
  editing: boolean;
  editText: string;
  setEditText: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  reactOpen: boolean;
  onToggleReactPicker: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenMenu: () => void;
  onJump: (id: string) => void;
  onMediaLoad: () => void;
  mobile: boolean;
}

function MessageRow(p: RowProps) {
  const { m, newGroup, userById, myId } = p;
  // Чи грати появу — вирішуємо один раз, при створенні рядка: пізніші рендери його не «перезапускають»
  const enter = useRef(p.animateIn).current;
  // Реакції, що зʼявились уже після показу рядка, «вискакують»; ті, що були, — ні
  const shown = useRef(false);
  useEffect(() => { shown.current = true; }, []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  // Довгий дотик відкриває меню дій — так само, як у месенджерах
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const onTouchStart = (e: React.TouchEvent) => {
    if (m.deletedAt || p.editing) return;
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      navigator.vibrate?.(8);
      p.onOpenMenu();
    }, 450);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const s = start.current;
    // Палець поїхав — це прокрутка, а не довгий дотик
    if (s && Math.hypot(t.clientX - s.x, t.clientY - s.y) > 10) cancel();
  };
  useEffect(() => cancel, []);

  const reactions = Object.entries(m.reactions ?? {}).filter(([, ids]) => ids.length > 0);

  return (
    <motion.div
      id={`msg-${m.id}`}
      initial={enter ? { opacity: 0, y: 14 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.base, ease: EASE.out }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={cancel}
      onTouchCancel={cancel}
      onContextMenu={e => {
        // Довгий дотик на Android викликає contextmenu — підміняємо його своїм меню
        if (isCoarse() && !m.deletedAt) { e.preventDefault(); p.onOpenMenu(); }
      }}
      className={`group relative flex gap-2.5 px-3 sm:px-5 py-0.5 sm:hover:bg-gray-50 pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none] ${newGroup ? 'mt-2.5 pt-1' : ''}`}
      style={p.flash ? { animation: 'chat-flash 1.6s ease-out' } : undefined}
    >
      {/* Колонка аватара: у продовженні серії тут час, який видно при наведенні */}
      <div className="w-9 shrink-0 pt-0.5">
        {newGroup ? (
          p.authorAvatar
            ? <img src={p.authorAvatar} alt="" className="w-9 h-9 rounded-lg object-cover" />
            : <div className="w-9 h-9 rounded-lg bg-gray-200 text-gray-600 text-sm font-bold flex items-center justify-center">{p.authorName.charAt(0)}</div>
        ) : (
          <span className="hidden sm:block text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 text-right leading-5 select-none">
            {p.time}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {newGroup && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-gray-900 truncate">{p.authorName}</span>
            <span className="text-[11px] text-gray-400 shrink-0">{p.time}</span>
          </div>
        )}

        {m.replyTo && !m.deletedAt && (
          <button
            onClick={() => p.onJump(m.replyTo!.id)}
            className="block max-w-full text-left border-l-2 border-gray-300 pl-2 my-0.5 text-xs text-gray-500 hover:border-blue-400 transition"
          >
            <span className="font-semibold text-gray-600">{userById.get(m.replyTo.authorId)?.name ?? 'Невідомий'}</span>
            <span className="block truncate">{m.replyTo.preview}</span>
          </button>
        )}

        {p.editing ? (
          <div className="mt-1">
            <textarea
              autoFocus
              value={p.editText}
              onChange={e => p.setEditText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') p.onCancelEdit();
                if (e.key === 'Enter' && !e.shiftKey && !isCoarse()) { e.preventDefault(); p.onSaveEdit(); }
              }}
              rows={Math.min(6, p.editText.split('\n').length + 1)}
              className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 resize-none"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <button onClick={p.onSaveEdit} className="h-9 sm:h-8 px-3 text-sm font-medium bg-blue-600 text-white rounded-lg inline-flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Зберегти
              </button>
              <button onClick={p.onCancelEdit} className="h-9 sm:h-8 px-3 text-sm text-gray-600 hover:bg-gray-100 rounded-lg inline-flex items-center gap-1.5">
                <X className="w-4 h-4" /> Скасувати
              </button>
            </div>
          </div>
        ) : m.deletedAt ? (
          <p className="text-sm text-gray-400 italic">Повідомлення видалено</p>
        ) : (
          <>
            {m.text && (
              <p className="text-[15px] sm:text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                <RichText text={m.text} mentions={m.mentions ?? []} myId={myId} userById={userById} />
                {m.editedAt && <span className="text-[10px] text-gray-400 ml-1.5">(змінено)</span>}
              </p>
            )}

            {m.attachments && m.attachments.length > 0 && (
              <div className="flex flex-wrap items-start gap-2 mt-1.5">
                {m.attachments.map(a => a.isImage ? (
                  <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" className="block max-w-full">
                    <img
                      src={a.url}
                      alt={a.name}
                      loading="lazy"
                      onLoad={p.onMediaLoad}
                      className="max-h-64 max-w-full sm:max-w-sm rounded-lg border border-gray-200 object-cover"
                    />
                  </a>
                ) : (
                  <a
                    key={a.url}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={a.name}
                    className="inline-flex items-center gap-2 max-w-full min-h-[44px] sm:min-h-0 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm text-gray-700"
                  >
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="truncate">{a.name}</span>
                  </a>
                ))}
              </div>
            )}

            {reactions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {reactions.map(([emoji, ids]) => {
                  const mine = ids.includes(myId);
                  return (
                    <motion.button
                      key={emoji}
                      // Нова реакція «вискакує», решта на місці; тап дає відчутний відгук
                      initial={shown.current ? { scale: 0.5, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      whileTap={{ scale: 0.88 }}
                      transition={SPRING.ui}
                      onClick={() => p.onReact(emoji)}
                      title={ids.map(id => userById.get(id)?.name ?? '?').join(', ')}
                      className={`inline-flex items-center gap-1 h-7 px-2 rounded-full border text-xs font-medium transition-colors ${
                        mine ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-sm leading-none">{emoji}</span>
                      {/* Число «підстрибує», коли хтось додав свою реакцію */}
                      <motion.span key={ids.length} initial={shown.current ? { y: -4, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }} transition={SPRING.ui}>
                        {ids.length}
                      </motion.span>
                    </motion.button>
                  );
                })}
                <button
                  onClick={p.mobile ? p.onOpenMenu : p.onToggleReactPicker}
                  aria-label="Додати реакцію"
                  className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-gray-200 bg-gray-50 text-gray-400 hover:text-gray-700"
                >
                  <SmilePlus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Панель дій при наведенні — лише для миші; на телефоні є меню довгого дотику */}
      {!m.deletedAt && !p.editing && (
        <div className="hidden sm:group-hover:flex pointer-coarse:!hidden absolute -top-3 right-4 items-center bg-white border border-gray-200 rounded-lg shadow-sm z-10">
          <ToolbarButton label="Реакція" onClick={p.onToggleReactPicker}><SmilePlus className="w-4 h-4" /></ToolbarButton>
          <ToolbarButton label="Відповісти" onClick={p.onReply}><CornerUpLeft className="w-4 h-4" /></ToolbarButton>
          {p.isMine && m.text && <ToolbarButton label="Редагувати" onClick={p.onEdit}><Pencil className="w-4 h-4" /></ToolbarButton>}
          {p.canDelete && <ToolbarButton label="Видалити" danger onClick={p.onDelete}><Trash2 className="w-4 h-4" /></ToolbarButton>}
        </div>
      )}

      {p.reactOpen && !p.mobile && (
        <>
          <div className="fixed inset-0 z-20" onClick={p.onToggleReactPicker} />
          <div className="absolute -top-12 right-4 z-30 flex items-center gap-0.5 bg-white border border-gray-200 rounded-xl shadow-lg p-1">
            {QUICK_REACTIONS.map(e => (
              <button
                key={e}
                onClick={() => p.onReact(e)}
                className="w-9 h-9 text-xl rounded-lg hover:bg-gray-100 transition"
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

function ToolbarButton({ label, onClick, danger, children }: {
  label: string; onClick: () => void; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`p-2 transition first:rounded-l-lg last:rounded-r-lg ${
        danger ? 'text-gray-500 hover:text-red-600 hover:bg-red-50' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
      }`}
    >
      {children}
    </button>
  );
}

// ── Текст повідомлення ────────────────────────────────────────────────────────

/**
 * Текст із підсвіткою @-згадок, посиланнями та легкою розміткою.
 *
 * Згадки шукаємо тим самим splitMentions, що й сервер, коли вирішує, кому слати
 * сповіщення: підсвічене й надіслане лишаються тим самим набором навіть після
 * перейменування когось у команді. Розмітку (`код`, *жирний*) застосовуємо вже до
 * шматків між згадками — тож ім'я всередині розмітки не губиться.
 */
function RichText({ text, mentions, myId, userById }: {
  text: string; mentions: string[]; myId: string; userById: Map<string, User>;
}) {
  const mentioned = useMemo(
    () => mentions.map(id => ({ id, name: userById.get(id)?.name ?? '' })).filter(u => u.name),
    [mentions, userById],
  );
  const segments = mentioned.length > 0 ? splitMentions(text, mentioned) : [{ text, userId: null as string | null }];

  return (
    <>
      {segments.map((seg, i) => seg.userId !== null ? (
        <span
          key={i}
          className={`font-semibold px-1 rounded ${seg.userId === myId ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-700'}`}
        >
          {seg.text}
        </span>
      ) : (
        <React.Fragment key={i}>
          {formatMessage(seg.text).map((part, j) => {
            switch (part.kind) {
              case 'link':
                return (
                  <a key={j} href={part.href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2 break-all">
                    {part.text}
                  </a>
                );
              case 'code':
                return <code key={j} className="px-1 py-0.5 rounded bg-gray-100 text-[0.85em] font-mono text-rose-700">{part.text}</code>;
              case 'bold':
                return <strong key={j}>{part.text}</strong>;
              case 'italic':
                return <em key={j}>{part.text}</em>;
              default:
                return <React.Fragment key={j}>{part.text}</React.Fragment>;
            }
          })}
        </React.Fragment>
      ))}
    </>
  );
}

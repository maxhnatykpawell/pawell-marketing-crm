/**
 * Чат у стилі Slack: канали й особисті листування в боковій панелі, стрічка з
 * реакціями та відповідями, деталі каналу, режими сповіщень на кожну розмову.
 *
 * Уся мережева механіка живе в useChat — тут лише показ.
 *
 * Телефон: замість двох колонок — по одному екрану. Список розмов → розмова на
 * весь екран (без верхньої панелі й нижньої навігації, як у месенджерах) →
 * деталі. Кнопка «Назад» системи повертає зі стрічки до списку, а не виходить
 * із застосунку.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../App';
import { ChatConversationView, ChatMessage, User } from '../types';
import { UseChat } from '../hooks/useChat';
import { badgeCount, listTimeLabel, previewOf, splitSections } from '../lib/chat';
import {
  MessageSquare, Hash, Lock, Plus, Search, Check, Loader2, UserPlus, ChevronLeft,
  ChevronDown, ChevronRight, BellOff, Info,
} from 'lucide-react';
import MessageFeed from './chat/MessageFeed';
import Composer from './chat/Composer';
import ChannelDetails from './chat/ChannelDetails';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { SPRING, shouldDismiss } from '../lib/motion';
import Sheet from './chat/Sheet';

interface Props {
  chat: UseChat;
  /** Телефон: по одному екрану замість двох колонок */
  mobile?: boolean;
}

export default function ChatView({ chat, mobile = false }: Props) {
  const { state, currentUser } = useAppContext();
  const users = state.users || [];
  const myId = currentUser?.userId ?? '';
  const isAdmin = currentUser?.role === 'admin';

  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [search, setSearch] = useState('');
  const [isNewChannelOpen, setIsNewChannelOpen] = useState(false);
  const [isPeoplePickerOpen, setIsPeoplePickerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<{ channels: boolean; dms: boolean }>({ channels: false, dms: false });
  /** Скільки непрочитаного було в момент відкриття розмови — для роздільника «Нові» */
  const [unreadAtOpen, setUnreadAtOpen] = useState(0);

  /** Жест «потягнути від лівого краю» повертає зі стрічки до списку (як у системних застосунках) */
  const backDrag = useDragControls();

  const userById = useMemo(() => new Map(users.map(u => [u.id, u] as [string, User])), [users]);

  const titleOf = (c: ChatConversationView): string => {
    if (c.kind === 'dm') return (c.peerId ? userById.get(c.peerId)?.name : null) ?? 'Особисте листування';
    return c.title;
  };

  const liveActive = chat.conversations.find(c => c.id === chat.activeId) ?? null;
  // На телефоні екран розмови ще «їде» з екрана, коли активної розмови вже нема (вийшли, заархівували):
  // тримаємо останню, щоб під час виїзду вміст не блимнув порожнім станом
  const lastActive = useRef<ChatConversationView | null>(null);
  if (liveActive) lastActive.current = liveActive;
  const active = liveActive ?? (mobile ? lastActive.current : null);

  // ── Відкриття розмови ───────────────────────────────────────────────────────
  const openConversation = (id: string) => {
    setUnreadAtOpen(chat.conversations.find(c => c.id === id)?.unread ?? 0);
    setReplyTo(null);
    setDetailsOpen(false);
    chat.openConversation(id);
    if (mobile && !mobileThreadOpen) {
      setMobileThreadOpen(true);
      // Запис в історії, щоб «Назад» на телефоні закривав розмову, а не застосунок
      window.history.pushState({ chatThread: true }, '');
    }
  };

  /**
   * Закрити екран розмови. Саму активну розмову скидаємо не тут, а коли екран доїхав
   * (onExitComplete нижче): інакше вміст зник би раніше, ніж екран устиг виїхати.
   */
  const closeThread = () => {
    setMobileThreadOpen(false);
    setDetailsOpen(false);
  };

  // Пішли з вкладки чату, не повернувшись до списку: розмова не має лишитись «відкритою» —
  // інакше нові повідомлення в ній зараховувались би прочитаними, хоч її не видно
  useEffect(() => () => { if (mobile) chat.closeConversation(); }, []);

  /** Кнопка «Назад» у шапці: гасимо запис в історії, який ми самі додали */
  const backToList = () => {
    if (window.history.state?.chatThread) window.history.back();
    else closeThread();
  };

  useEffect(() => {
    if (!mobile || !mobileThreadOpen) return;
    const onPop = () => closeThread();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [mobile, mobileThreadOpen]);

  // Розмова на весь екран мусить стискатись разом з екранною клавіатурою, інакше поле вводу опиняється під нею
  const viewport = useVisualViewport(mobile && mobileThreadOpen);

  // Посилання зі сповіщення (?chat=<id>) відкриває саме цю розмову; інакше на
  // комп'ютері стаємо в найсвіжішу, щоб не дивитись у порожнечу
  const startupDone = useRef(false);
  useEffect(() => {
    if (startupDone.current || chat.conversations.length === 0) return;
    startupDone.current = true;

    const params = new URLSearchParams(window.location.search);
    const wanted = params.get('chat');
    if (wanted) {
      params.delete('chat');
      const qs = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
    }
    if (wanted && chat.conversations.some(c => c.id === wanted)) openConversation(wanted);
    else if (!mobile && !chat.activeId) openConversation(chat.conversations[0].id);
  }, [chat.conversations]);

  // Розмова зникла (вийшли, заархівували) — на телефоні повертаємось до списку
  useEffect(() => {
    if (mobile && mobileThreadOpen && !chat.activeId) {
      setMobileThreadOpen(false);
      if (window.history.state?.chatThread) window.history.back();
    }
  }, [chat.activeId]);

  // ── Список ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chat.conversations;
    return chat.conversations.filter(c => titleOf(c).toLowerCase().includes(q));
  }, [chat.conversations, search, userById]);

  const sections = splitSections<ChatConversationView>(filtered);

  const previewFor = (c: ChatConversationView): string => {
    if (!c.lastMessagePreview) return c.kind === 'channel' ? (c.topic || 'Поки без повідомлень') : 'Напишіть першим';
    if (c.lastMessageAuthorId === myId) return `Ви: ${c.lastMessagePreview}`;
    if (c.kind === 'channel' && c.lastMessageAuthorId) {
      const name = userById.get(c.lastMessageAuthorId)?.name?.split(' ')[0];
      if (name) return `${name}: ${c.lastMessagePreview}`;
    }
    return c.lastMessagePreview;
  };

  const renderRow = (c: ChatConversationView) => {
    const isActive = c.id === chat.activeId;
    const peer = c.kind === 'dm' && c.peerId ? userById.get(c.peerId) : null;
    const count = badgeCount(c);
    const muted = c.notify === 'none';
    // Червоний — коли звертаються саме до вас (згадка чи особисте), синій — просто нові
    const hot = c.kind === 'dm' || c.mentionUnread > 0;
    return (
      <li key={c.id}>
        <button
          onClick={() => openConversation(c.id)}
          className={`w-full text-left px-3 flex items-center gap-3 transition ${
            mobile ? 'min-h-[64px] py-2.5 active:bg-gray-100' : 'min-h-[48px] py-1.5'
          } ${isActive && !mobile ? 'bg-blue-50 border-r-2 border-blue-600' : 'hover:bg-gray-100'}`}
        >
          {peer ? (
            <img src={peer.avatar} alt="" className={`${mobile ? 'w-11 h-11' : 'w-8 h-8'} rounded-xl object-cover shrink-0 border border-gray-200`} />
          ) : (
            <div className={`${mobile ? 'w-11 h-11' : 'w-8 h-8'} rounded-xl flex items-center justify-center shrink-0 ${
              isActive && !mobile ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'
            }`}>
              {c.memberIds === null ? <Hash className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={`flex items-center gap-1 min-w-0 text-sm truncate ${
                count > 0 ? 'font-bold text-gray-900' : isActive && !mobile ? 'font-semibold text-blue-800' : muted ? 'font-medium text-gray-400' : 'font-medium text-gray-700'
              }`}>
                <span className="truncate">{titleOf(c)}</span>
                {muted && <BellOff className="w-3 h-3 shrink-0 text-gray-300" aria-label="Сповіщення вимкнено" />}
              </span>
              <span className={`text-[11px] shrink-0 ${count > 0 ? 'text-gray-700 font-semibold' : 'text-gray-400'}`}>
                {listTimeLabel(c.lastMessageAt)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className={`text-xs truncate ${count > 0 ? 'text-gray-600' : 'text-gray-400'}`}>{previewFor(c)}</p>
              {count > 0 && (
                <span className={`shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-white text-[11px] font-bold flex items-center justify-center ${hot ? 'bg-red-500' : 'bg-blue-600'}`}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </div>
          </div>
        </button>
      </li>
    );
  };

  const renderSection = (
    key: 'channels' | 'dms', label: string, items: ChatConversationView[], onAdd: () => void, addLabel: string,
  ) => (
    <section className="mb-1">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <button
          onClick={() => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))}
          aria-expanded={!collapsed[key]}
          className="flex items-center gap-1 min-h-[32px] text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-800"
        >
          {collapsed[key] ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {label}
          {collapsed[key] && items.some(c => badgeCount(c) > 0) && <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-1" />}
        </button>
        <button
          onClick={onAdd}
          aria-label={addLabel}
          title={addLabel}
          className={`${mobile ? 'p-2.5' : 'p-1.5'} text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition`}
        >
          {key === 'channels' ? <Plus className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
        </button>
      </div>
      {!collapsed[key] && (
        items.length === 0
          ? <p className="text-xs text-gray-400 px-4 py-2">{search ? 'Нічого не знайдено' : key === 'channels' ? 'Каналів ще немає' : 'Напишіть колезі'}</p>
          : <ul>{items.map(renderRow)}</ul>
      )}
    </section>
  );

  // ── Розмова ─────────────────────────────────────────────────────────────────
  const activeNotify = active?.notify ?? 'all';
  const replyAuthor = replyTo ? userById.get(replyTo.authorId)?.name ?? 'Невідомий' : '';

  // Вміст екрана розмови: однаковий для комп'ютера (колонка) і телефона (екран, що виїжджає)
  const threadInner = (
    <>
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <MessageSquare className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">Оберіть розмову ліворуч або створіть новий канал</p>
          </div>
        ) : (
          <>
            <header className={`${mobile ? 'pt-safe' : ''} border-b border-gray-200 bg-white shrink-0`}>
              <div className={`${mobile ? 'h-14 pl-1 pr-1' : 'px-5 py-3'} flex items-center justify-between gap-2`}>
                <div className="flex items-center gap-1.5 min-w-0">
                  {mobile && (
                    <button
                      onClick={backToList}
                      aria-label="Назад до списку розмов"
                      className="w-11 h-11 flex items-center justify-center text-gray-600 active:bg-gray-100 rounded-xl shrink-0"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                  )}
                  <button
                    onClick={() => setDetailsOpen(o => !o)}
                    className="flex items-center gap-2 min-w-0 text-left rounded-lg hover:bg-gray-50 px-1.5 py-1"
                    aria-label="Деталі розмови"
                  >
                    {active.kind === 'dm' ? (
                      userById.get(active.peerId ?? '')?.avatar
                        ? <img src={userById.get(active.peerId!)!.avatar} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                        : null
                    ) : active.memberIds === null
                      ? <Hash className="w-4 h-4 text-gray-400 shrink-0" />
                      : <Lock className="w-4 h-4 text-gray-400 shrink-0" />}
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-gray-900 truncate">{titleOf(active)}</span>
                      {active.kind === 'channel' && (
                        <span className="block text-[11px] text-gray-400 truncate">
                          {active.topic
                            || (active.memberIds === null ? 'Відкритий канал' : `${active.memberIds.length} учасн.`)}
                        </span>
                      )}
                    </span>
                    {activeNotify === 'none' && <BellOff className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
                  </button>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!mobile && chat.connection !== 'online' && (
                    <span className="text-[11px] text-amber-600 flex items-center gap-1 mr-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {chat.connection === 'connecting' ? 'Підключення…' : 'Немає зв’язку'}
                    </span>
                  )}
                  {mobile && chat.connection !== 'online' && <Loader2 className="w-4 h-4 animate-spin text-amber-500 mr-1" />}
                  <button
                    onClick={() => setDetailsOpen(o => !o)}
                    aria-label="Деталі розмови"
                    title="Деталі"
                    className={`${mobile ? 'w-11 h-11' : 'p-2'} flex items-center justify-center rounded-lg transition ${
                      detailsOpen ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <Info className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </header>

            <div className="flex-1 min-h-0 flex">
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
                {chat.error && (
                  <p className="px-4 py-1.5 text-xs text-red-500 bg-red-50 border-b border-red-100">{chat.error}</p>
                )}
                <MessageFeed
                  key={`feed-${active.id}`}
                  chat={chat}
                  myId={myId}
                  isAdmin={!!isAdmin}
                  userById={userById}
                  mobile={mobile}
                  unreadAtOpen={unreadAtOpen}
                  onReply={setReplyTo}
                />
                <Composer
                  key={`composer-${active.id}`}
                  conversationId={active.id}
                  users={users.filter(u => u.id !== myId)}
                  mobile={mobile}
                  disabled={chat.connection === 'offline'}
                  replyTo={replyTo}
                  replyAuthor={replyAuthor}
                  onCancelReply={() => setReplyTo(null)}
                  onSend={chat.send}
                />
              </div>

              {detailsOpen && (
                <ChannelDetails
                  conv={active}
                  chat={chat}
                  users={users}
                  myId={myId}
                  mobile={mobile}
                  onClose={() => setDetailsOpen(false)}
                  onGone={() => { setDetailsOpen(false); if (mobile) closeThread(); }}
                />
              )}
            </div>
          </>
        )}
    </>
  );

  return (
    // flex-1 + min-h-0, а не h-full: батьківський <main> — колонка, і без
    // min-h-0 стрічка розпирала б сторінку замість того, щоб прокручуватись
    <div className={`flex-1 min-h-0 flex bg-white overflow-hidden ${mobile ? '' : 'rounded-xl shadow-sm border border-gray-200'}`}>

      {/* ── Бічна панель ── */}
      {/* На телефоні список лишається під екраном розмови й трохи відсувається та затемнюється:
          так видно, що розмова «лежить» поверх нього, а не замінила його */}
      <motion.aside
        className={`flex ${mobile ? 'w-full' : 'w-64 lg:w-72 border-r border-gray-200 shrink-0'} flex-col bg-gray-50/60 min-h-0`}
        initial={false}
        animate={mobile ? { x: mobileThreadOpen ? -56 : 0, opacity: mobileThreadOpen ? 0.55 : 1 } : undefined}
        transition={SPRING.push}
        // Поки поверх лежить розмова, список не має ловити ні фокус, ні дотики, ні читач екрана
        inert={mobile && mobileThreadOpen ? true : undefined}
      >
        <div className="px-3 py-3 border-b border-gray-200 bg-white shrink-0">
          {!mobile && (
            <div className="flex items-center justify-between mb-2.5 px-1">
              <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-500" />
                Чат
                <ConnectionDot state={chat.connection} />
              </h2>
            </div>
          )}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Пошук розмови…"
              className={`w-full pl-9 pr-3 ${mobile ? 'py-2.5' : 'py-1.5'} text-sm bg-gray-100 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition`}
            />
          </div>
          {mobile && chat.connection !== 'online' && (
            <p className="mt-2 text-[11px] text-amber-600 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {chat.connection === 'connecting' ? 'Підключення…' : 'Немає зв’язку — перепідключаємось'}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain hidden-scrollbar py-1">
          {renderSection('channels', 'Канали', sections.channels, () => setIsNewChannelOpen(true), 'Створити канал')}
          {renderSection('dms', 'Особисті', sections.dms, () => setIsPeoplePickerOpen(true), 'Написати колезі')}
        </div>
      </motion.aside>

      {/* ── Стрічка ── */}
      {mobile ? (
        <AnimatePresence onExitComplete={() => chat.closeConversation()}>
          {mobileThreadOpen && (
            <motion.section
              key="thread"
              className="flex flex-col min-w-0 min-h-0 fixed inset-x-0 top-0 z-30 bg-white shadow-[-12px_0_32px_rgba(0,0,0,0.12)]"
              style={{ height: viewport ? viewport.height : '100%', top: viewport ? viewport.top : 0 }}
              // Екран виїжджає справа, як у месенджерах; при закритті їде назад так само
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={SPRING.push}
              // Потягнути від лівого краю вправо → назад до списку
              drag="x"
              dragListener={false}
              dragControls={backDrag}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0, right: 0.9 }}
              onDragEnd={(_, info) => { if (shouldDismiss(info.offset.x, info.velocity.x, 90, 480)) backToList(); }}
            >
              {/* Смужка біля лівого краю: з неї починається жест «назад» (touch-action: none, інакше
                  браузер забере рух собі). Вузька, щоб не заважати прокрутці й виділенню тексту. */}
              <div
                className="absolute left-0 inset-y-0 w-5 z-40"
                style={{ touchAction: 'none' }}
                onPointerDown={e => backDrag.start(e)}
                aria-hidden
              />
              {threadInner}
            </motion.section>
          )}
        </AnimatePresence>
      ) : (
        <section className="flex flex-1 flex-col min-w-0 min-h-0">
          {threadInner}
        </section>
      )}

      {isNewChannelOpen && (
        <NewChannelDialog
          users={users}
          myId={myId}
          onClose={() => setIsNewChannelOpen(false)}
          onCreate={async (title, memberIds) => {
            const id = await chat.createChannel(title, memberIds);
            setIsNewChannelOpen(false);
            openConversation(id);
          }}
        />
      )}

      {isPeoplePickerOpen && (
        <PeoplePicker
          users={users.filter(u => u.id !== myId)}
          onClose={() => setIsPeoplePickerOpen(false)}
          onPick={async peerId => {
            const id = await chat.openDm(peerId);
            setIsPeoplePickerOpen(false);
            openConversation(id);
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
    connecting: { color: 'bg-amber-400 animate-pulse', title: 'Підключення…' },
    offline:    { color: 'bg-gray-300', title: 'Немає зв’язку — перепідключаємось' },
  }[state];
  return <span className={`w-1.5 h-1.5 rounded-full ${map.color}`} title={map.title} />;
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
    <Sheet
      title="Новий канал"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-11 sm:h-9 px-4 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition">
            Скасувати
          </button>
          <button
            onClick={submit}
            disabled={!title.trim() || busy}
            className="h-11 sm:h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Створити
          </button>
        </div>
      }
    >
      <div className="px-5 py-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Назва</label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            maxLength={80}
            placeholder="Наприклад: реклама"
            className="w-full px-3 py-2.5 sm:py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={e => setIsPrivate(e.target.checked)}
            className="mt-1 w-4 h-4"
          />
          <span>
            <span className="block text-sm font-medium text-gray-700">Закритий канал</span>
            <span className="block text-xs text-gray-500">
              Бачитимуть лише обрані. Відкритий канал доступний усій команді.
            </span>
          </span>
        </label>

        {isPrivate && (
          <ul className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-60 overflow-y-auto">
            {users.filter(u => u.id !== myId).map(u => {
              const on = selected.includes(u.id);
              return (
                <li key={u.id}>
                  <button
                    onClick={() => setSelected(prev => (on ? prev.filter(x => x !== u.id) : [...prev, u.id]))}
                    className="w-full flex items-center gap-3 px-3 min-h-[52px] sm:min-h-[44px] hover:bg-gray-50 active:bg-gray-50 transition text-left"
                  >
                    <img src={u.avatar} alt="" className="w-7 h-7 rounded-lg object-cover" />
                    <span className="flex-1 text-sm text-gray-700 truncate">{u.name}</span>
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${on ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                      {on && <Check className="w-3.5 h-3.5 text-white" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </Sheet>
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const filtered = users.filter(u => u.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Sheet title="Написати колезі" onClose={onClose} size="sm">
      <div className="px-5 py-3 border-b border-gray-100 sticky top-0 bg-white">
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Пошук…"
          className="w-full px-3 py-2.5 sm:py-2 text-sm bg-gray-100 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Нікого не знайдено</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {filtered.map(u => (
            <li key={u.id}>
              <button
                disabled={busyId !== null}
                onClick={async () => { setBusyId(u.id); try { await onPick(u.id); } finally { setBusyId(null); } }}
                className="w-full flex items-center gap-3 px-5 min-h-[56px] sm:min-h-[48px] hover:bg-blue-50 active:bg-blue-50 transition text-left"
              >
                <img src={u.avatar} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-200" />
                <span className="flex-1 text-sm text-gray-700 truncate">{u.name}</span>
                {busyId === u.id && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/**
 * Пісочниця мобільної версії: справжній MobileShell на вигаданих даних, без
 * сервера (нічого не пише в базу, не запускає cron і не шле в Telegram).
 *
 * Запуск: npx vite --port 5199, далі відкрити
 *   http://localhost:5199/scratch/mobile-preview.html
 * у вікні розміром із телефон (≈390×844).
 *
 * Контекст підміняємо повністю: чого немає в списку — приходить порожньою
 * функцією. Змінні дії (виконати задачу, створити задачу, прочитати
 * сповіщення) реалізовано на локальному стані, щоб їх можна було помацати.
 */
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { AppContext } from '../src/App';
import MobileShell from '../src/components/mobile/MobileShell';

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}T00:00:00.000Z`;
};

const avatar = (hue: number, letter: string) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' fill='hsl(${hue},60%,55%)'/><text x='40' y='54' font-size='38' fill='white' text-anchor='middle' font-family='sans-serif'>${letter}</text></svg>`);

const users = [
  { id: 'u1', name: 'Максим Гнатик', avatar: avatar(220, 'М') },
  { id: 'u2', name: 'Ірина Блюс', avatar: avatar(340, 'І') },
  { id: 'u3', name: 'Марек Новак', avatar: avatar(140, 'М') },
];

const boards = [{ id: 'b1', title: 'Маркетинг' }];
const lists = [
  { id: 'l1', title: 'Беклог', order: 0, boardId: 'b1' },
  { id: 'l2', title: 'Готуємо до роботи', order: 1, boardId: 'b1' },
  { id: 'l3', title: 'В роботі', order: 2, boardId: 'b1' },
  { id: 'l4', title: 'Зроблено', order: 3, boardId: 'b1' },
];
const projects = [
  { id: 'p1', title: 'Мерч для Павел', color: '#f97316', status: 'active', managerIds: ['u1'], createdAt: '', deadline: null },
  { id: 'p2', title: 'Оптимізація організації подій', color: '#d946ef', status: 'active', managerIds: [], createdAt: '', deadline: null },
];

const mk = (id: string, listId: string, title: string, deadline: string | null, extra: any = {}) => ({
  id, listId, title, description: '', deadline, assigneeId: 'u1', subtasks: [], comments: [], attachments: [], order: 0, ...extra,
});

const initialCards = [
  mk('c1', 'l3', 'Розробити систему створення етикеток для базових продуктів компанії Pawell', iso(-3), { subtasks: [{ id: 's1', title: 'Макет', completed: true }, { id: 's2', title: 'Друк', completed: false }], comments: [{ id: 'm1' }], projectId: 'p2' }),
  mk('c2', 'l3', 'Подарунки для команди', iso(0), { subtasks: [{ id: 's3', title: 'Список', completed: true }, { id: 's4', title: 'Замовити', completed: false }, { id: 's5', title: 'Упакувати', completed: false }] }),
  mk('c3', 'l2', 'Зареєструвати Василину на вебінар «Ринок праці Defense Tech 2026»', iso(0)),
  mk('c4', 'l2', 'Отримати відповідь по гранту', iso(1), { projectId: 'p1' }),
  mk('c5', 'l1', 'Передати в оплату членство в IRON', iso(4)),
  mk('c6', 'l1', 'Додати етикетки нові', null),
  mk('c7', 'l3', 'Написати до Kill house та запропонувати пропелери', iso(12), { assigneeId: 'u2', projectId: 'p1' }),
  mk('c8', 'l4', 'Надрукувати наліпки по Паверблок', iso(-6), { isCompleted: true }),
  mk('c9', 'l2', 'Підготувати презентацію для Японії', iso(2), { assigneeId: 'u3' }),
];

const conversations = [
  { id: 'cv1', kind: 'channel', title: 'Загальний', memberIds: null, unread: 3, createdAt: iso(-30), lastMessageAt: iso(0) },
  { id: 'cv2', kind: 'dm', title: '', memberIds: ['u1', 'u2'], peerId: 'u2', unread: 0, createdAt: iso(-10), lastMessageAt: iso(-1) },
];
const messages = [
  { id: 'ms1', conversationId: 'cv1', authorId: 'u2', text: 'Всім привіт! Нагадую про планування на ранок.', createdAt: new Date(Date.now() - 3600_000).toISOString() },
  { id: 'ms2', conversationId: 'cv1', authorId: 'u3', text: 'Привіт, я підготував презентацію для Японії — гляньте, будь ласка.', createdAt: new Date(Date.now() - 1800_000).toISOString() },
  { id: 'ms3', conversationId: 'cv1', authorId: 'u1', text: 'Дякую, дивлюсь!', createdAt: new Date(Date.now() - 600_000).toISOString() },
];

const initialNotifs = [
  { id: 'n1', userId: 'u1', title: 'Вас призначено', message: 'Ірина призначила вас на «Подарунки для команди»', cardId: 'c2', read: false, createdAt: new Date().toISOString() },
  { id: 'n2', userId: 'u1', title: 'Нагадування', message: 'Завтра дедлайн: «Отримати відповідь по гранту»', cardId: 'c4', read: true, createdAt: new Date(Date.now() - 86400000).toISOString() },
];

function Preview() {
  const [cards, setCards] = useState<any[]>(initialCards);
  const [notifs, setNotifs] = useState<any[]>(initialNotifs);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const state: any = useMemo(() => ({
    users, boards, lists, projects, cards, tags: [], notifications: notifs, events: [], contentPlans: [], userGroups: [],
  }), [cards, notifs]);

  const base: any = {
    state,
    currentUser: { userId: 'u1', name: 'Максим Гнатик', email: 'max@example.com', role: 'admin' },
    hasEditRights: true,
    canView: () => true,
    activeView: 'board',
    activeBoardId: 'b1',
    activeProjectId: null,
    openCardId, setOpenCardId,
    updateCard: (id: string, u: any) => setCards(cs => cs.map(c => (c.id === id ? { ...c, ...u } : c))),
    addCard: (listId: string, title: string, init: any = {}) =>
      setCards(cs => [...cs, mk('n' + Date.now(), listId, title, init.deadline ?? null, { assigneeId: init.assigneeId ?? null })]),
    markNotificationAsRead: (id: string) => setNotifs(ns => ns.map(n => (n.id === id ? { ...n, read: true } : n))),
    confirmAction: (_m: string, fn: () => void) => fn(),
  };
  const ctx = new Proxy(base, { get: (t, k) => (k in t ? t[k as string] : () => {}) });

  const chat: any = {
    conversations, totalUnread: 3, connection: 'online', activeId,
    messages: activeId === 'cv1' ? messages : [], loadingMessages: false, hasMore: false, error: null,
    openConversation: setActiveId, loadOlder: async () => {}, send: async () => {}, edit: async () => {}, remove: async () => {},
    createChannel: async () => 'cv1', openDm: async () => 'cv2', reload: async () => {},
  };

  return (
    <AppContext.Provider value={ctx}>
      <MobileShell chat={chat} notifications={notifs} unreadCount={notifs.filter(n => !n.read).length} isOffline={false} />
    </AppContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);

/**
 * Пісочниця чату: справжні ChatView + useChat, але «сервер» — це підміна fetch та
 * EventSource у пам'яті сторінки. Нічого не пишеться в базу, cron не запускається.
 *
 * Запуск: npx vite --port 5199, далі
 *   http://localhost:5199/scratch/chat-preview.html            — комп'ютер
 *   http://localhost:5199/scratch/chat-preview.html?mobile      — телефон (вікно ≈390×844)
 * Імітувати нове повідомлення від колеги: у консолі window.__incoming('general', 'текст').
 */
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { AppContext } from '../src/App';
import ChatView from '../src/components/ChatView';
import MobileShell from '../src/components/mobile/MobileShell';
import { useChat } from '../src/hooks/useChat';
import { toggleReaction } from '../src/lib/chat';

const avatar = (hue: number, letter: string) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' fill='hsl(${hue},60%,55%)'/><text x='40' y='54' font-size='38' fill='white' text-anchor='middle' font-family='sans-serif'>${letter}</text></svg>`);
const photo = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='300'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#6366f1'/><stop offset='1' stop-color='#ec4899'/></linearGradient></defs><rect width='480' height='300' fill='url(#g)'/><text x='240' y='165' font-size='34' fill='white' text-anchor='middle' font-family='sans-serif'>Макет банера</text></svg>`);

const users = [
  { id: 'u1', name: 'Максим Гнатик', avatar: avatar(220, 'М') },
  { id: 'u2', name: 'Ірина Блюс', avatar: avatar(340, 'І') },
  { id: 'u3', name: 'Марек Новак', avatar: avatar(140, 'М') },
  { id: 'u4', name: 'Олена Кравець', avatar: avatar(30, 'О') },
];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

interface Conv {
  id: string; kind: 'channel' | 'dm'; title: string; memberIds: string[] | null; createdBy: string; createdAt: string;
  topic?: string; lastMessageAt?: string; lastMessagePreview?: string; lastMessageAuthorId?: string;
  unread: number; mentionUnread: number; notify: 'all' | 'mentions' | 'none'; peerId?: string | null;
}
const convs: Conv[] = [
  { id: 'general', kind: 'channel', title: 'Загальний', memberIds: null, createdBy: 'system', createdAt: '2020-01-01T00:00:00Z', topic: 'Новини команди та все, що стосується всіх', unread: 2, mentionUnread: 1, notify: 'all' },
  { id: 'ads', kind: 'channel', title: 'реклама', memberIds: ['u1', 'u2', 'u3'], createdBy: 'u1', createdAt: minutesAgo(9000), topic: 'Кампанії Meta та Google', unread: 0, mentionUnread: 0, notify: 'all' },
  { id: 'design', kind: 'channel', title: 'дизайн', memberIds: null, createdBy: 'u2', createdAt: minutesAgo(9000), unread: 4, mentionUnread: 0, notify: 'none', lastMessageAt: minutesAgo(300), lastMessagePreview: 'нові версії лендінгу в фігмі', lastMessageAuthorId: 'u2' },
  { id: 'dm_u1__u2', kind: 'dm', title: '', memberIds: ['u1', 'u2'], createdBy: 'u2', createdAt: minutesAgo(9000), unread: 1, mentionUnread: 0, notify: 'all', peerId: 'u2', lastMessageAt: minutesAgo(12), lastMessagePreview: 'Глянеш макет до обіду?', lastMessageAuthorId: 'u2' },
  { id: 'dm_u1__u3', kind: 'dm', title: '', memberIds: ['u1', 'u3'], createdBy: 'u1', createdAt: minutesAgo(9000), unread: 0, mentionUnread: 0, notify: 'all', peerId: 'u3', lastMessageAt: minutesAgo(1500), lastMessagePreview: 'Дякую!', lastMessageAuthorId: 'u1' },
];

let n = 0;
const msg = (conversationId: string, authorId: string, ago: number, text: string, extra: any = {}) =>
  ({ id: `m${++n}`, conversationId, authorId, text, createdAt: minutesAgo(ago), ...extra });

const messages: Record<string, any[]> = {
  general: [
    msg('general', 'u2', 3000, 'Всім доброго ранку! Нагадую: у п’ятницю підсумки місяця о *15:00*.'),
    msg('general', 'u3', 2990, 'Буду. Таблицю з цифрами залишу тут https://docs.google.com/spreadsheets/d/abc123/edit#gid=0', { reactions: { '👍': ['u1', 'u2'], '🙏': ['u4'] } }),
    msg('general', 'u3', 2989, 'і ще: `npm run build` на проді проходить, можна деплоїти'),
    msg('general', 'u4', 1500, 'Ось макет банера для Black Friday', { attachments: [{ name: 'banner.png', url: photo, isImage: true }, { name: 'бриф-кампанії.pdf', url: '#', isImage: false }], reactions: { '🔥': ['u1'] } }),
    msg('general', 'u1', 1490, 'Супер, дякую! Беремо перший варіант.', { replyTo: { id: 'm4', authorId: 'u4', preview: 'Ось макет банера для Black Friday' } }),
    msg('general', 'u2', 20, 'Ще раз по підсумках — додайте свої цифри до четверга'),
    msg('general', 'u3', 6, '@Максим Гнатик глянеш бюджет на грудень? Треба погодити сьогодні', { mentions: ['u1'] }),
    msg('general', 'u4', 2, 'Я теж можу допомогти з цим'),
  ],
  ads: [msg('ads', 'u2', 200, 'Кампанія стартувала, CTR 2.4%'), msg('ads', 'u1', 190, 'Чудово 👍')],
  design: [msg('design', 'u2', 300, 'нові версії лендінгу в фігмі')],
  'dm_u1__u2': [msg('dm_u1__u2', 'u1', 30, 'Привіт, є хвилинка?'), msg('dm_u1__u2', 'u2', 12, 'Глянеш макет до обіду?')],
  'dm_u1__u3': [msg('dm_u1__u3', 'u3', 1510, 'Залив файл на диск'), msg('dm_u1__u3', 'u1', 1500, 'Дякую!')],
};

// ── Підміна сервера ───────────────────────────────────────────────────────────
const listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
class FakeEventSource {
  onerror: any = null;
  readyState = 1;
  constructor(_url: string) {
    setTimeout(() => (listeners.ready || []).forEach(l => l(new MessageEvent('ready', { data: '{}' }))), 50);
  }
  addEventListener(type: string, fn: any) { (listeners[type] ||= []).push(fn); }
  close() { this.readyState = 2; }
  static CLOSED = 2;
}
(window as any).EventSource = FakeEventSource;
const emit = (type: string, data: any) => (listeners[type] || []).forEach(l => l(new MessageEvent(type, { data: JSON.stringify(data) })));

(window as any).__incoming = (conversationId: string, text: string, authorId = 'u2') => {
  const m = msg(conversationId, authorId, 0, text);
  (messages[conversationId] ||= []).push(m);
  const c = convs.find(x => x.id === conversationId)!;
  Object.assign(c, { lastMessageAt: m.createdAt, lastMessagePreview: text, lastMessageAuthorId: authorId });
  emit('message', m);
};

const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!url.pathname.startsWith('/api/chat')) return realFetch(input, init);
  const method = (init?.method || 'GET').toUpperCase();
  const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
  await new Promise(r => setTimeout(r, 60));

  const p = url.pathname;
  if (p === '/api/chat/ticket') return json({ ticket: 't' });
  if (p === '/api/chat/conversations' && method === 'GET') return json({ conversations: convs });
  if (p === '/api/chat/conversations' && method === 'POST') {
    if (body.kind === 'dm') return json({ conversation: convs.find(c => c.peerId === body.peerId) ?? convs[3] });
    const c: Conv = { id: 'c' + Date.now(), kind: 'channel', title: body.title, memberIds: body.memberIds ?? null, createdBy: 'u1', createdAt: new Date().toISOString(), unread: 0, mentionUnread: 0, notify: 'all' };
    convs.push(c); messages[c.id] = [];
    return json({ conversation: c });
  }
  let mm: RegExpMatchArray | null;
  if ((mm = p.match(/^\/api\/chat\/conversations\/([^/]+)\/notify$/))) {
    convs.find(c => c.id === mm![1])!.notify = body.level; return json({ success: true });
  }
  if ((mm = p.match(/^\/api\/chat\/conversations\/([^/]+)\/members$/))) {
    const c = convs.find(x => x.id === mm![1])!; c.memberIds = [...new Set([...(c.memberIds ?? []), ...body.userIds])]; return json({ conversation: c });
  }
  if ((mm = p.match(/^\/api\/chat\/conversations\/([^/]+)\/members\/([^/]+)$/))) {
    const c = convs.find(x => x.id === mm![1])!; c.memberIds = (c.memberIds ?? []).filter(id => id !== mm![2]); return json({ conversation: c });
  }
  if ((mm = p.match(/^\/api\/chat\/conversations\/([^/]+)\/archive$/))) {
    convs.splice(convs.findIndex(c => c.id === mm![1]), 1); return json({ success: true });
  }
  if ((mm = p.match(/^\/api\/chat\/conversations\/([^/]+)$/)) && method === 'PATCH') {
    const c = convs.find(x => x.id === mm![1])!; Object.assign(c, body); return json({ conversation: c });
  }
  if (p === '/api/chat/messages' && method === 'GET') {
    return json({ messages: messages[url.searchParams.get('conversationId')!] ?? [], hasMore: false });
  }
  if (p === '/api/chat/messages' && method === 'POST') {
    const orig = body.replyToId ? (messages[body.conversationId] ?? []).find(m => m.id === body.replyToId) : null;
    const m = msg(body.conversationId, 'u1', 0, body.text, {
      ...(orig ? { replyTo: { id: orig.id, authorId: orig.authorId, preview: orig.text.slice(0, 60) } } : {}),
      ...(body.attachments?.length ? { attachments: body.attachments } : {}),
    });
    (messages[body.conversationId] ||= []).push(m);
    Object.assign(convs.find(c => c.id === body.conversationId)!, { lastMessageAt: m.createdAt, lastMessagePreview: body.text, lastMessageAuthorId: 'u1' });
    return json({ message: m });
  }
  if ((mm = p.match(/^\/api\/chat\/messages\/([^/]+)\/reactions$/))) {
    const m = messages[body.conversationId].find(x => x.id === mm![1]);
    m.reactions = toggleReaction(m.reactions, body.emoji, 'u1'); return json({ message: m });
  }
  if ((mm = p.match(/^\/api\/chat\/messages\/([^/]+)$/))) {
    const list = messages[body.conversationId ?? url.searchParams.get('conversationId')!];
    const m = list.find(x => x.id === mm![1]);
    if (method === 'PUT') Object.assign(m, { text: body.text, editedAt: new Date().toISOString() });
    if (method === 'DELETE') Object.assign(m, { text: '', deletedAt: new Date().toISOString() });
    return json({ message: m });
  }
  if (p === '/api/chat/read') {
    const c = convs.find(x => x.id === body.conversationId); if (c) { c.unread = 0; c.mentionUnread = 0; } return json({ success: true });
  }
  return json({}, 404);
};

function Preview() {
  const mobile = location.search.includes('mobile');
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const state = useMemo(() => ({ users, cards: [], boards: [], lists: [], projects: [], tags: [], notifications: [], events: [] }), []);
  const base: any = {
    state,
    currentUser: { userId: 'u1', name: 'Максим Гнатик', email: 'max@example.com', role: 'admin', avatar: users[0].avatar },
    hasEditRights: true, canView: () => true, activeView: mobile ? 'chat' : 'chat', activeBoardId: null, activeProjectId: null,
    openCardId, setOpenCardId,
    confirmAction: (_m: string, fn: () => void) => fn(),
  };
  const ctx = new Proxy(base, { get: (t, k) => (k in t ? t[k as string] : () => {}) });
  const chat = useChat('u1');

  return (
    <AppContext.Provider value={ctx}>
      {mobile ? (
        <MobileShell chat={chat} notifications={[]} unreadCount={0} isOffline={false} />
      ) : (
        <div className="h-screen p-6 bg-slate-50 flex flex-col"><ChatView chat={chat} /></div>
      )}
    </AppContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);

import React, { useEffect, useState } from 'react';
import { Bell, Check, ChevronLeft, ListChecks, MessageSquare, User as UserIcon } from 'lucide-react';
import { useAppContext } from '../../App';
import type { Card, NotificationItem } from '../../types';
import type { UseChat } from '../../hooks/useChat';
import ChatView from '../ChatView';
import MyProfileView from '../MyProfileView';
import CardModal from '../CardModal';
import MobileTasks from './MobileTasks';
import { setUiMode } from '../../hooks/useIsMobile';

type Tab = 'tasks' | 'chat' | 'profile';

const TITLES: Record<Tab, string> = { tasks: 'Задачі', chat: 'Чат', profile: 'Кабінет' };

interface Props {
  chat: UseChat;
  notifications: NotificationItem[];
  unreadCount: number;
  isOffline: boolean;
}

/**
 * Мобільна оболонка: верхня панель, один екран, нижня навігація.
 *
 * Лише те, що потрібно в дорозі: задачі, чат, особистий кабінет і картка задачі.
 * Решта розділів (аналітика, витрати, діаграми…) лишається в повній версії.
 * Дані й дії — ті самі, що й на десктопі (useAppContext), окремого шару немає.
 */
export default function MobileShell({ chat, notifications, unreadCount, isOffline }: Props) {
  const { state, currentUser, activeView, openCardId, setOpenCardId, markNotificationAsRead } = useAppContext();

  const [tab, setTab] = useState<Tab>(activeView === 'chat' ? 'chat' : activeView === 'profile' ? 'profile' : 'tasks');
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  // Картка за посиланням чи зі сповіщення (openCardId ставить App) — відкриваємо одразу
  useEffect(() => {
    if (!openCardId) return;
    const card = state.cards.find(c => c.id === openCardId);
    if (card) {
      setTab('tasks');
      setOpenCard(card);
      setIsNotifOpen(false);
    }
    setOpenCardId(null);
  }, [openCardId, state.cards]);

  // Відкрита картка має бути «живою»: після правки беремо свіжу версію зі стану
  const liveOpenCard = openCard ? state.cards.find(c => c.id === openCard.id) ?? null : null;

  const me = state.users.find(u => u.id === currentUser?.userId);

  return (
    <div className="mobile-shell fixed inset-0 flex flex-col bg-slate-50 text-gray-900 font-sans">
      {/* Верхня панель */}
      <header className="shrink-0 bg-white border-b border-gray-200 pt-safe">
        <div className="h-14 px-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">{TITLES[tab]}</h1>
          <div className="flex items-center gap-1">
            {isOffline && (
              <span className="mr-1 px-2 py-1 rounded-lg bg-yellow-100 text-yellow-800 text-xs font-medium">Офлайн</span>
            )}
            <button
              onClick={() => setIsNotifOpen(true)}
              aria-label={unreadCount > 0 ? `Сповіщення, нових: ${unreadCount}` : 'Сповіщення'}
              className="relative w-11 h-11 flex items-center justify-center text-gray-600 rounded-xl active:bg-gray-100"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Екран. Чат сам керує прокруткою (стрічка + поле вводу), решта прокручується тут */}
      <main className={`flex-1 min-h-0 ${tab === 'chat' ? 'flex flex-col' : 'overflow-y-auto'}`}>
        {tab === 'tasks' && <MobileTasks onOpenCard={setOpenCard} />}
        {tab === 'chat' && <ChatView chat={chat} mobile />}
        {tab === 'profile' && (
          <div className="p-4 pb-8">
            <MyProfileView mobile />
            <button
              onClick={() => setUiMode('desktop')}
              className="w-full h-12 mt-6 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl"
            >
              Відкрити повну версію
            </button>
          </div>
        )}
      </main>

      {/* Нижня навігація */}
      <nav className="shrink-0 bg-white border-t border-gray-200 pb-safe" aria-label="Розділи">
        <ul className="grid grid-cols-3 h-16">
          <TabButton active={tab === 'tasks'} label="Задачі" onClick={() => setTab('tasks')}>
            <ListChecks className="w-6 h-6" />
          </TabButton>
          <TabButton active={tab === 'chat'} label="Чат" badge={chat.totalUnread} onClick={() => setTab('chat')}>
            <MessageSquare className="w-6 h-6" />
          </TabButton>
          <TabButton active={tab === 'profile'} label="Кабінет" onClick={() => setTab('profile')}>
            {me?.avatar
              ? <img src={me.avatar} alt="" className={`w-6 h-6 rounded-full object-cover border-2 ${tab === 'profile' ? 'border-blue-600' : 'border-transparent'}`} />
              : <UserIcon className="w-6 h-6" />}
          </TabButton>
        </ul>
      </nav>

      {isNotifOpen && (
        <NotificationsScreen
          items={notifications}
          onClose={() => setIsNotifOpen(false)}
          onRead={markNotificationAsRead}
          onOpenCard={cardId => {
            const card = state.cards.find(c => c.id === cardId);
            if (card) { setTab('tasks'); setOpenCard(card); setIsNotifOpen(false); }
          }}
        />
      )}

      {liveOpenCard && <CardModal card={liveOpenCard} onClose={() => setOpenCard(null)} />}
    </div>
  );
}

function TabButton({ active, label, badge, onClick, children }: {
  active: boolean; label: string; badge?: number; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <li className="contents">
      <button
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        aria-label={badge && badge > 0 ? `${label}, непрочитаних: ${badge}` : label}
        className={`relative flex flex-col items-center justify-center gap-0.5 ${active ? 'text-blue-600' : 'text-gray-500'}`}
      >
        <span className="relative">
          {children}
          {badge !== undefined && badge > 0 && (
            <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </span>
        <span className="text-[11px] font-medium">{label}</span>
      </button>
    </li>
  );
}

function NotificationsScreen({ items, onClose, onRead, onOpenCard }: {
  items: NotificationItem[];
  onClose: () => void;
  onRead: (id: string) => void;
  onOpenCard: (cardId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-50" role="dialog" aria-modal="true" aria-label="Сповіщення">
      <header className="shrink-0 bg-white border-b border-gray-200 pt-safe">
        <div className="h-14 px-2 flex items-center">
          <button onClick={onClose} aria-label="Назад" className="w-11 h-11 flex items-center justify-center text-gray-600">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="text-lg font-bold text-gray-900 ml-1">Сповіщення</h2>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto pb-safe">
        {items.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-16 px-6">Нових сповіщень немає. Тут з’являться згадки й нагадування про задачі.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map(n => (
              <li key={n.id} className={`flex items-start gap-2 pl-4 pr-2 py-3 ${n.read ? 'bg-white opacity-70' : 'bg-blue-50/50'}`}>
                <button
                  disabled={!n.cardId}
                  onClick={() => { if (n.cardId) { onRead(n.id); onOpenCard(n.cardId); } }}
                  className="flex-1 min-w-0 text-left min-h-[44px]"
                >
                  <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5 break-words">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('uk-UA')}</p>
                </button>
                {!n.read && (
                  <button onClick={() => onRead(n.id)} aria-label="Позначити прочитаним" className="w-11 h-11 shrink-0 flex items-center justify-center text-blue-600">
                    <Check className="w-5 h-5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Підказка для тих, хто на вузькому екрані свідомо відкрив повну версію:
 * без неї повернутись у мобільну було б нічим (лише через ?ui=mobile).
 */
export function MobileVersionPill() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setNarrow(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  if (!narrow) return null;
  return (
    <button
      onClick={() => setUiMode('auto')}
      className="fixed bottom-4 right-4 z-40 h-11 px-4 rounded-full bg-gray-900 text-white text-sm font-medium shadow-lg print:hidden"
    >
      Мобільна версія
    </button>
  );
}

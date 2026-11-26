import React, { useEffect, useState } from 'react';
import { Bell, BellOff, AtSign, Check, ChevronLeft, Hash, Loader2, Lock, LogOut, Pencil, Plus, Trash2, UserMinus, X } from 'lucide-react';
import { useAppContext } from '../../App';
import { ChatConversationView, ChatNotifyLevel, User } from '../../types';
import type { UseChat } from '../../hooks/useChat';
import Sheet from './Sheet';

const NOTIFY_OPTIONS: { level: ChatNotifyLevel; title: string; hint: string; icon: React.ReactNode }[] = [
  { level: 'all', title: 'Усі повідомлення', hint: 'Пуш і лічильник на кожне нове', icon: <Bell className="w-4 h-4" /> },
  { level: 'mentions', title: 'Лише згадки', hint: 'Тільки коли пишуть @ви. В особистих листуваннях — усе', icon: <AtSign className="w-4 h-4" /> },
  { level: 'none', title: 'Вимкнено', hint: 'Без пушів і лічильників. Згадки лишаються в дзвіночку', icon: <BellOff className="w-4 h-4" /> },
];

/** Зручна підказка для шапки: що зараз з сповіщеннями */
export function notifyLabel(level: ChatNotifyLevel): string {
  return NOTIFY_OPTIONS.find(o => o.level === level)?.title ?? 'Усі повідомлення';
}

/**
 * Деталі розмови: тема, сповіщення, учасники, вихід і архівація.
 *
 * На комп'ютері це бічна панель праворуч від стрічки, на телефоні — окремий
 * екран із кнопкою «Назад» (як у месенджерах), а не вузька смужка збоку.
 */
export default function ChannelDetails({
  conv, chat, users, myId, mobile, onClose, onGone,
}: {
  conv: ChatConversationView;
  chat: UseChat;
  users: User[];
  myId: string;
  mobile: boolean;
  onClose: () => void;
  /** Розмова зникла для нас (вийшли чи заархівували) — треба повернутись до списку */
  onGone: () => void;
}) {
  const { currentUser, confirmAction } = useAppContext();
  const isAdmin = currentUser?.role === 'admin';
  const isChannel = conv.kind === 'channel';
  const isOpen = conv.memberIds === null;
  const canManage = isChannel && (isAdmin || conv.createdBy === myId);
  const isGeneral = conv.id === 'general';

  const userById = new Map(users.map(u => [u.id, u]));
  const members = isOpen ? users : (conv.memberIds ?? []).map(id => userById.get(id)).filter((u): u is User => !!u);
  const peer = conv.kind === 'dm' && conv.peerId ? userById.get(conv.peerId) : null;

  const [title, setTitle] = useState(conv.title);
  const [topic, setTopic] = useState(conv.topic ?? '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Розмову змінили з іншого пристрою чи вкладки — підхоплюємо
  useEffect(() => { setTitle(conv.title); setTopic(conv.topic ?? ''); }, [conv.id, conv.title, conv.topic]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try { await fn(); } catch (e: any) { setError(e.message || 'Не вдалось виконати'); } finally { setBusy(null); }
  };

  const saveTopic = () => {
    if (topic.trim() === (conv.topic ?? '')) return;
    run('topic', () => chat.updateChannel(conv.id, { topic }));
  };

  const saveTitle = () => {
    const next = title.trim();
    setEditingTitle(false);
    if (!next || next === conv.title) { setTitle(conv.title); return; }
    run('title', () => chat.updateChannel(conv.id, { title: next }));
  };

  const leave = () => confirmAction(`Вийти з каналу «${conv.title}»?`, () =>
    run('leave', async () => { await chat.removeMember(conv.id, myId); onGone(); }));

  const archive = () => confirmAction(`Архівувати канал «${conv.title}»? Він зникне зі списків для всіх.`, () =>
    run('archive', async () => { await chat.archiveChannel(conv.id); onGone(); }));

  const body = (
    <div className="divide-y divide-gray-100">
      {/* Назва й тип */}
      <section className="px-5 py-4">
        {peer ? (
          <div className="flex items-center gap-3">
            <img src={peer.avatar} alt="" className="w-14 h-14 rounded-xl object-cover" />
            <div className="min-w-0">
              <p className="font-bold text-gray-900 truncate">{peer.name}</p>
              <p className="text-xs text-gray-400">Особисте листування</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {isOpen ? <Hash className="w-5 h-5 text-gray-400 shrink-0" /> : <Lock className="w-5 h-5 text-gray-400 shrink-0" />}
              {editingTitle ? (
                <input
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(conv.title); setEditingTitle(false); } }}
                  maxLength={80}
                  className="flex-1 min-w-0 px-2 py-1 text-base font-bold border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100"
                />
              ) : (
                <h3 className="flex-1 min-w-0 text-base font-bold text-gray-900 truncate">{conv.title}</h3>
              )}
              {canManage && !isGeneral && !editingTitle && (
                <button onClick={() => setEditingTitle(true)} aria-label="Перейменувати" className="p-2 -mr-2 text-gray-400 hover:text-blue-600">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {isOpen ? 'Відкритий канал — бачить уся команда' : `Закритий канал — ${members.length} учасн.`}
            </p>
          </>
        )}
      </section>

      {/* Тема */}
      {isChannel && (
        <section className="px-5 py-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Тема</label>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onBlur={saveTopic}
            rows={2}
            maxLength={250}
            placeholder="Про що цей канал? Додайте короткий опис"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
          />
        </section>
      )}

      {/* Сповіщення */}
      <section className="px-5 py-4">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Сповіщення</h4>
        <div className="space-y-1.5">
          {NOTIFY_OPTIONS.map(o => {
            const on = (conv.notify ?? 'all') === o.level;
            return (
              <button
                key={o.level}
                onClick={() => run('notify', () => chat.setNotify(conv.id, o.level))}
                className={`w-full flex items-start gap-3 px-3 py-2.5 min-h-[52px] rounded-xl border text-left transition ${
                  on ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className={`mt-0.5 ${on ? 'text-blue-600' : 'text-gray-400'}`}>{o.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-medium ${on ? 'text-blue-800' : 'text-gray-800'}`}>{o.title}</span>
                  <span className="block text-xs text-gray-500">{o.hint}</span>
                </span>
                {on && <Check className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* Учасники */}
      {isChannel && (
        <section className="px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Учасники · {members.length}
            </h4>
            {!isOpen && (
              <button
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-1 h-9 px-2 -mr-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg"
              >
                <Plus className="w-4 h-4" /> Додати
              </button>
            )}
          </div>
          <ul className="space-y-0.5 max-h-72 overflow-y-auto">
            {members.map(u => (
              <li key={u.id} className="flex items-center gap-2.5 min-h-[44px]">
                <img src={u.avatar} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">
                  {u.name}
                  {u.id === myId && <span className="text-gray-400"> (ви)</span>}
                  {u.id === conv.createdBy && <span className="ml-1.5 text-[10px] font-semibold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">власник</span>}
                </span>
                {!isOpen && canManage && u.id !== myId && u.id !== conv.createdBy && (
                  <button
                    onClick={() => confirmAction(`Прибрати ${u.name} з каналу?`, () => run('rm' + u.id, () => chat.removeMember(conv.id, u.id)))}
                    aria-label={`Прибрати ${u.name}`}
                    className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    {busy === 'rm' + u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="px-5 py-3 text-sm text-red-500">{error}</p>}

      {/* Небезпечні дії */}
      {isChannel && (!isOpen || (canManage && !isGeneral)) && (
        <section className="px-5 py-4 space-y-2">
          {!isOpen && (
            <button
              onClick={leave}
              disabled={busy === 'leave'}
              className="w-full flex items-center gap-2.5 min-h-[48px] px-3 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-xl"
            >
              <LogOut className="w-4 h-4" /> Вийти з каналу
            </button>
          )}
          {canManage && !isGeneral && (
            <button
              onClick={archive}
              disabled={busy === 'archive'}
              className="w-full flex items-center gap-2.5 min-h-[48px] px-3 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-xl"
            >
              <Trash2 className="w-4 h-4" /> Архівувати канал
            </button>
          )}
        </section>
      )}

      {addOpen && (
        <AddMembers
          candidates={users.filter(u => !(conv.memberIds ?? []).includes(u.id))}
          onClose={() => setAddOpen(false)}
          onAdd={async ids => { await chat.addMembers(conv.id, ids); setAddOpen(false); }}
        />
      )}
    </div>
  );

  if (mobile) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Деталі розмови">
        <header className="shrink-0 border-b border-gray-200 pt-safe">
          <div className="h-14 px-2 flex items-center">
            <button onClick={onClose} aria-label="Назад" className="w-11 h-11 flex items-center justify-center text-gray-600">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 ml-1">Деталі</h2>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain pb-safe">{body}</div>
      </div>
    );
  }

  return (
    <aside className="w-80 shrink-0 border-l border-gray-200 bg-white flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-bold text-gray-800">Деталі</h2>
        <button onClick={onClose} aria-label="Закрити" className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{body}</div>
    </aside>
  );
}

function AddMembers({ candidates, onClose, onAdd }: {
  candidates: User[];
  onClose: () => void;
  onAdd: (ids: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try { await onAdd(selected); } catch (e: any) { setError(e.message || 'Не вдалось додати'); setBusy(false); }
  };

  return (
    <Sheet
      title="Додати до каналу"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          {error && <span className="flex-1 text-xs text-red-500">{error}</span>}
          <button onClick={onClose} className="h-11 sm:h-9 px-4 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">Скасувати</button>
          <button
            onClick={submit}
            disabled={selected.length === 0 || busy}
            className="h-11 sm:h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Додати{selected.length > 0 ? ` (${selected.length})` : ''}
          </button>
        </div>
      }
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10 px-6">Усі з команди вже в каналі</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {candidates.map(u => {
            const on = selected.includes(u.id);
            return (
              <li key={u.id}>
                <button
                  onClick={() => setSelected(prev => (on ? prev.filter(x => x !== u.id) : [...prev, u.id]))}
                  className="w-full flex items-center gap-3 px-5 min-h-[56px] sm:min-h-[48px] active:bg-gray-50 text-left"
                >
                  <img src={u.avatar} alt="" className="w-8 h-8 rounded-lg object-cover" />
                  <span className="flex-1 text-sm text-gray-800 truncate">{u.name}</span>
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${on ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                    {on && <Check className="w-3.5 h-3.5 text-white" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

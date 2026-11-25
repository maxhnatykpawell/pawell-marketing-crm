import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../App';
import { changePassword, uploadFile } from '../api';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Card } from '../types';
import CardModal from './CardModal';
import MyPlan from './MyPlan';
import {
  Mail, FileText, CheckCircle2, AlertCircle, Lock, Eye, EyeOff, Check, LogOut, Calendar, Edit2, ArrowRight, Settings, Camera, X,
} from 'lucide-react';

/**
 * @param mobile Мобільна версія: задачі там — окрема вкладка, а розділів «Контент» і «Дошка»
 *               немає, тож блоки задач і контенту ховаємо, лишаючи профіль і налаштування.
 */
export default function MyProfileView({ mobile = false }: { mobile?: boolean }) {
  const { state, currentUser, logout, updateUser, setActiveBoardId, setActiveView } = useAppContext();

  const user = state.users.find(u => u.id === currentUser?.userId);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');

  // Card modal
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Avatar upload
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Password change form
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // Зміна пароля — не на видноті: ховається за шестернею й відкривається діалогом
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const closeSettings = () => {
    setIsSettingsOpen(false);
    // Нічого з уведеного не лишаємо в пам'яті форми
    setPwForm({ current: '', next: '', confirm: '' });
    setShowPw({ current: false, next: false, confirm: false });
    setPwError('');
    setPwSuccess(false);
  };
  useEffect(() => {
    if (!isSettingsOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSettings(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSettingsOpen]);

  // Profile edit
  const [editName, setEditName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name || '');
  const [nameSaving, setNameSaving] = useState(false);

  const myCards = state.cards.filter(c => c.assigneeId === currentUser?.userId);
  const myActiveCards = myCards.filter(c => !c.isCompleted);
  const myContent = (state.contentPlans || []).filter(c => c.assigneeId === currentUser?.userId);
  const myEvents = (state.events || []).filter(e => e.assigneeIds?.includes(currentUser?.userId || ''));

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Підзавдання, призначені на мене й ще не виконані (у невиконаних задачах)
  const mySubtaskCount = state.cards.reduce(
    (n, c) => (c.isCompleted ? n : n + (c.subtasks || []).filter(s => s.assigneeId === currentUser?.userId && !s.completed).length),
    0,
  );
  // Події, що ще не закінчились, найближчі першими
  const upcomingEvents = myEvents
    .filter(e => new Date(e.endDate || e.startDate).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const isThisMonth = (dateString: string | null) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const nowD = new Date();
    return date.getMonth() === nowD.getMonth() && date.getFullYear() === nowD.getFullYear();
  };

  const myCardsThisMonth = myCards.filter(c => isThisMonth(c.deadline));
  const myTotalStoryPoints = myCardsThisMonth.filter(c => c.isCompleted).reduce((sum, c) => sum + (c.storyPoints || 0), 0);

  const getDeadlineStatus = (deadline: string | null | undefined, isCompleted?: boolean) => {
    if (!deadline) return null;
    if (isCompleted) return null; // виконані завдання не мають статусу дедлайну
    const d = new Date(deadline);
    d.setHours(0, 0, 0, 0);
    const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
    if (diff < 0) return 'overdue';
    if (diff === 0) return 'today';
    if (diff <= 3) return 'soon';
    return 'ok';
  };

  const deadlineConfig = {
    overdue: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700', label: 'Протерміновано' },
    today: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', label: 'Сьогодні' },
    soon: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700', label: 'Скоро' },
    ok: { bg: 'bg-white', border: 'border-gray-100', text: 'text-gray-500', badge: 'bg-gray-100 text-gray-600', label: '' },
  };

  const sortedCards = [...myActiveCards].sort((a, b) => {
    const order = { overdue: 0, today: 1, soon: 2, ok: 3 };
    const sa = getDeadlineStatus(a.deadline, a.isCompleted) || 'ok';
    const sb = getDeadlineStatus(b.deadline, b.isCompleted) || 'ok';
    return order[sa] - order[sb];
  });

  const getListTitle = (listId: string) => state.lists.find(l => l.id === listId)?.title || '—';
  const getBoardId = (listId: string) => state.lists.find(l => l.id === listId)?.boardId;
  const getCardTags = (card: Card) => state.tags?.filter(t => card.tagIds?.includes(t.id)) || [];

  const handleOpenCard = (card: Card) => {
    // Set active board so that when user navigates to board after, it's correct
    const boardId = getBoardId(card.listId);
    if (boardId) setActiveBoardId(boardId);
    setSelectedCard(card);
  };

  const handleGoToBoard = (card: Card) => {
    const boardId = getBoardId(card.listId);
    if (boardId) setActiveBoardId(boardId);
    setActiveView('board');
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) { setPwError('Заповніть усі поля'); return; }
    if (pwForm.next.length < 6) { setPwError('Новий пароль мінімум 6 символів'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('Паролі не співпадають'); return; }
    setPwLoading(true);
    try {
      await changePassword(pwForm.current, pwForm.next);
      setPwSuccess(true);
      setPwForm({ current: '', next: '', confirm: '' });
      setTimeout(() => closeSettings(), 1600);
    } catch (err: any) {
      setPwError(err.message || 'Помилка зміни пароля');
    } finally {
      setPwLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!nameValue.trim() || !user) return;
    setNameSaving(true);
    updateUser(user.id, { name: nameValue.trim() });
    setTimeout(() => { setNameSaving(false); setEditName(false); }, 600);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setAvatarUploading(true);
    try {
      const attachment = await uploadFile(file);
      updateUser(user.id, { avatar: attachment.url });
    } catch {
      alert('Помилка завантаження фото');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  if (!user || !currentUser) return null;

  const roleLabel = currentUser.role === 'admin' ? 'Адміністратор' : 'Член команди';
  const roleColor = currentUser.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';

  const overdueCount = myActiveCards.filter(c => getDeadlineStatus(c.deadline, c.isCompleted) === 'overdue').length;
  const todayCount = myActiveCards.filter(c => getDeadlineStatus(c.deadline, c.isCompleted) === 'today').length;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-8">
      {/* Profile Hero */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="h-20 profile-aurora" aria-hidden="true" />
        <div className="px-4 sm:px-8 pb-6">
          <div className="flex items-end justify-between -mt-10 mb-3">
            <div className="relative group/avatar">
              {avatarUploading ? (
                <div className="w-20 h-20 rounded-2xl border-4 border-white shadow-lg bg-gray-100 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                </div>
              ) : (
                <img src={user.avatar} alt={user.name} className="w-20 h-20 rounded-2xl border-4 border-white shadow-lg object-cover" />
              )}
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-400 border-2 border-white" title="Онлайн" />
              {/* Upload overlay */}
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity hidden sm:flex items-center justify-center gap-1 flex-col cursor-pointer disabled:cursor-wait"
                title="Змінити фото"
              >
                <Camera className="w-6 h-6 text-white" />
                <span className="text-white text-[10px] font-semibold">Фото</span>
              </button>
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                aria-label="Змінити фото"
                className="sm:hidden absolute -bottom-2 -left-2 w-11 h-11 rounded-full bg-blue-600 text-white border-2 border-white shadow flex items-center justify-center disabled:opacity-60"
              >
                <Camera className="w-5 h-5" />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Налаштування акаунта"
              title="Налаштування акаунта"
              className="w-11 h-11 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition border border-gray-200"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition border border-gray-200 hover:border-red-200"
            >
              <LogOut className="w-4 h-4" />
              Вийти
            </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0">
              {editName ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    autoFocus
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    className="min-w-0 w-full text-2xl font-bold text-gray-900 border-b-2 border-blue-500 outline-none bg-transparent"
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditName(false); }}
                  />
                  <button onClick={handleSaveName} disabled={nameSaving} aria-label="Зберегти ім’я" className="p-2.5 sm:p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-2xl font-bold text-gray-900 break-words min-w-0">{user.name}</h2>
                  <button onClick={() => { setEditName(true); setNameValue(user.name); }} aria-label="Змінити ім’я" className="p-2.5 sm:p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition shrink-0">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${roleColor}`}>{roleLabel}</span>
                {user.role && <span className="text-sm font-semibold text-gray-700">{user.role}</span>}
                <div className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0 break-all">
                  <Mail className="w-3.5 h-3.5" />
                  {currentUser.email}
                </div>
              </div>
            </div>

            {/* Stats */}
            <dl className="grid grid-cols-3 md:flex gap-2 pt-3 md:pt-0 border-t border-gray-100 md:border-0">
              {[
                { label: 'Задачі', value: myActiveCards.length },
                { label: 'Підзавдання', value: mySubtaskCount },
                { label: 'Події попереду', value: upcomingEvents.length },
              ].map(stat => (
                <div key={stat.label} className="md:min-w-[104px] rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                  <dd className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{stat.value}</dd>
                  <dt className="text-xs text-gray-500 mt-1">{stat.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Ліворуч — головне: персональний план */}
        <div className="lg:col-span-2 min-w-0">
          <MyPlan onOpenCard={handleOpenCard} storyPoints={myTotalStoryPoints} />
        </div>

        {/* Праворуч — що ще попереду: події й контент. На телефоні цих розділів немає. */}
        <aside className={`space-y-6 min-w-0 lg:sticky lg:top-4 ${mobile ? 'hidden' : ''}`}>
          <section aria-labelledby="my-events-title" className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between gap-2">
              <h3 id="my-events-title" className="font-bold text-gray-800 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-600" />
                Найближчі події
                {upcomingEvents.length > 0 && (
                  <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full tabular-nums">{upcomingEvents.length}</span>
                )}
              </h3>
              <button
                onClick={() => setActiveView('events')}
                className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2 py-1 rounded-lg transition"
              >
                Усі <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {upcomingEvents.length === 0 ? (
              <p className="px-5 py-8 text-sm text-center text-gray-400">Найближчих подій на вас немає</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {upcomingEvents.slice(0, 5).map(ev => {
                  const start = new Date(ev.startDate);
                  const end = new Date(ev.endDate || ev.startDate);
                  const ongoing = start.getTime() <= now.getTime() + 86399000 && end.getTime() >= now.getTime();
                  const sameDay = start.toDateString() === end.toDateString();
                  return (
                    <li key={ev.id}>
                      <button
                        onClick={() => setActiveView('events')}
                        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50/80 transition"
                      >
                        <span className="w-11 shrink-0 rounded-lg bg-purple-50 text-purple-700 text-center py-1 leading-none">
                          <span className="block text-base font-bold tabular-nums">{format(start, 'd')}</span>
                          <span className="block text-[10px] font-semibold uppercase mt-0.5">{format(start, 'MMM', { locale: uk })}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-gray-800 truncate">{ev.title}</span>
                          <span className="block text-xs text-gray-500 truncate">
                            {ongoing && <span className="text-green-600 font-semibold">Триває · </span>}
                            {sameDay ? format(start, 'd MMMM', { locale: uk }) : `${format(start, 'd MMM', { locale: uk })} – ${format(end, 'd MMM', { locale: uk })}`}
                            {ev.location ? ` · ${ev.location}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="my-content-title" className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between gap-2">
              <h3 id="my-content-title" className="font-bold text-gray-800 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                Мій контент-план
                {myContent.length > 0 && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full tabular-nums">{myContent.length}</span>
                )}
              </h3>
              <button
                onClick={() => setActiveView('content')}
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg transition"
              >
                Усі <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {myContent.length === 0 ? (
              <p className="px-5 py-8 text-sm text-center text-gray-400">Контенту на вас немає</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {myContent.slice(0, 5).map(item => (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveView('content')}
                      className="group w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50/80 transition"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-gray-800 group-hover:text-indigo-700 truncate">{item.focus || item.description || 'Без назви'}</span>
                        <span className="block text-xs text-gray-500 truncate">
                          {item.channel}{item.publishDate ? ` · ${format(new Date(item.publishDate), 'd MMM', { locale: uk })}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{item.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {isSettingsOpen && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40"
          onClick={closeSettings}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-settings-title"
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] overflow-y-auto pb-safe"
          >
            <div className="flex items-center justify-between pl-5 pr-2 pt-2 pb-1 border-b border-gray-100">
              <h2 id="account-settings-title" className="font-bold text-gray-900 flex items-center gap-2">
                <Settings className="w-4 h-4 text-gray-500" />
                Налаштування акаунта
              </h2>
              <button onClick={closeSettings} aria-label="Закрити" className="w-11 h-11 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 pt-4">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <Lock className="w-4 h-4 text-gray-500" />
                Змінити пароль
              </h3>
              <p className="text-xs text-gray-500 mt-1">Новий пароль має містити щонайменше 6 символів.</p>
            </div>
            <form onSubmit={handlePasswordChange} className="px-5 pt-3 pb-5 space-y-3">
              {[
                { key: 'current', label: 'Поточний пароль', showKey: 'current' as const },
                { key: 'next', label: 'Новий пароль', showKey: 'next' as const },
                { key: 'confirm', label: 'Підтвердити пароль', showKey: 'confirm' as const },
              ].map(({ key, label, showKey }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <div className="relative">
                    <input
                      type={showPw[showKey] ? 'text' : 'password'}
                      value={(pwForm as any)[key]}
                      onChange={e => { setPwForm({ ...pwForm, [key]: e.target.value }); setPwError(''); setPwSuccess(false); }}
                      placeholder="••••••••"
                      autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                      className="w-full px-3 pr-11 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw({ ...showPw, [showKey]: !showPw[showKey] })}
                      aria-label={showPw[showKey] ? 'Сховати пароль' : 'Показати пароль'}
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-gray-400 hover:text-gray-600"
                    >
                      {showPw[showKey] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}

              {pwError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <p className="text-xs text-red-600">{pwError}</p>
                </div>
              )}
              {pwSuccess && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <p className="text-xs text-green-600">Пароль успішно змінено!</p>
                </div>
              )}

              <button
                type="submit"
                disabled={pwLoading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition disabled:opacity-60"
              >
                {pwLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock className="w-4 h-4" />}
                Зберегти пароль
              </button>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Card Modal */}
      {selectedCard && (
        <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  );
}

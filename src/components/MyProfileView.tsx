import React, { useState } from 'react';
import { useAppContext } from '../App';
import { changePassword } from '../api';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Card } from '../types';
import CardModal from './CardModal';
import {
  User as UserIcon, Mail, FileText, Clock,
  CheckCircle2, AlertCircle, Lock, Eye, EyeOff, Check,
  LogOut, Calendar, Edit2, ArrowRight, Kanban,
  ChevronRight, Tag, CheckSquare, MessageSquare, Paperclip,
  Settings, Sparkles
} from 'lucide-react';

export default function MyProfileView() {
  const { state, currentUser, logout, updateUser, setActiveBoardId, setActiveView } = useAppContext();

  const user = state.users.find(u => u.id === currentUser?.userId);

  // Tab state
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');

  // Card modal
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Password change form
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // Profile edit
  const [editName, setEditName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name || '');
  const [nameSaving, setNameSaving] = useState(false);

  const myCards = state.cards.filter(c => c.assigneeId === currentUser?.userId);
  const myContent = (state.contentPlans || []).filter(c => c.assigneeId === currentUser?.userId);
  const myEvents = (state.events || []).filter(e => e.assigneeIds?.includes(currentUser?.userId || ''));

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const isThisMonth = (dateString: string | null) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const nowD = new Date();
    return date.getMonth() === nowD.getMonth() && date.getFullYear() === nowD.getFullYear();
  };

  const myCardsThisMonth = myCards.filter(c => isThisMonth(c.deadline));
  const myTotalStoryPoints = myCardsThisMonth.reduce((sum, c) => sum + (c.storyPoints || 0), 0);

  const getDeadlineStatus = (deadline: string | null) => {
    if (!deadline) return null;
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

  const sortedCards = [...myCards].sort((a, b) => {
    const order = { overdue: 0, today: 1, soon: 2, ok: 3 };
    const sa = getDeadlineStatus(a.deadline) || 'ok';
    const sb = getDeadlineStatus(b.deadline) || 'ok';
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

  if (!user || !currentUser) return null;

  const roleLabel = currentUser.role === 'admin' ? 'Адміністратор' : 'Член команди';
  const roleColor = currentUser.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';

  const overdueCount = myCards.filter(c => getDeadlineStatus(c.deadline) === 'overdue').length;
  const todayCount = myCards.filter(c => getDeadlineStatus(c.deadline) === 'today').length;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-8">
      {/* Profile Hero */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="h-28 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 relative">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.4) 0%, transparent 60%)' }} />
        </div>
        <div className="px-8 pb-6">
          <div className="flex items-end justify-between -mt-12 mb-4">
            <div className="relative">
              <img src={user.avatar} alt={user.name} className="w-24 h-24 rounded-2xl border-4 border-white shadow-lg object-cover" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-400 border-2 border-white" title="Онлайн" />
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition border border-gray-200 hover:border-red-200"
            >
              <LogOut className="w-4 h-4" />
              Вийти
            </button>
          </div>

          <div className="flex items-start justify-between">
            <div>
              {editName ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    autoFocus
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    className="text-2xl font-bold text-gray-900 border-b-2 border-blue-500 outline-none bg-transparent"
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditName(false); }}
                  />
                  <button onClick={handleSaveName} disabled={nameSaving} className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-2xl font-bold text-gray-900">{user.name}</h2>
                  <button onClick={() => { setEditName(true); setNameValue(user.name); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${roleColor}`}>{roleLabel}</span>
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Mail className="w-3.5 h-3.5" />
                  {currentUser.email}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="hidden md:flex gap-6 text-center">
              {[
                { label: 'Задачі', value: myCards.length, icon: Kanban, color: 'text-blue-600' },
                { label: 'Контент', value: myContent.length, icon: FileText, color: 'text-indigo-600' },
                { label: 'Події', value: myEvents.length, icon: Calendar, color: 'text-purple-600' },
              ].map(stat => (
                <div key={stat.label} className="flex flex-col items-center">
                  <stat.icon className={`w-5 h-5 mb-1 ${stat.color}`} />
                  <span className="text-2xl font-bold text-gray-900">{stat.value}</span>
                  <span className="text-xs text-gray-500">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Tasks + Content */}
        <div className="lg:col-span-2 space-y-6">

          {/* My Tasks */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Kanban className="w-5 h-5 text-blue-600" />
                Мої задачі
                <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">{myCards.length}</span>
                <span className="text-xs bg-yellow-100 text-yellow-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> {myTotalStoryPoints} SP (місяць)
                </span>
                {overdueCount > 0 && (
                  <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{overdueCount} протерміновано
                  </span>
                )}
                {todayCount > 0 && overdueCount === 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">{todayCount} сьогодні</span>
                )}
              </h3>
              <button
                onClick={() => setActiveView('board')}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition"
              >
                Усі задачі
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {myCards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-gray-400">
                <CheckCircle2 className="w-10 h-10 mb-3 text-gray-300" />
                <p className="text-sm font-medium">Задач немає — відпочивай! 🎉</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {(() => {
                  const groups: { title: string, color: string, cards: Card[] }[] = [];
                  const noProjectCards = sortedCards.filter(c => !c.projectId);
                  
                  (state.projects || []).forEach(p => {
                    const pCards = sortedCards.filter(c => c.projectId === p.id);
                    if (pCards.length > 0) {
                      groups.push({ title: p.title, color: p.color, cards: pCards });
                    }
                  });
                  
                  if (noProjectCards.length > 0) {
                    groups.push({ title: 'Без проєкту', color: '#9ca3af', cards: noProjectCards });
                  }

                  return groups.map((group, idx) => (
                    <div key={group.title} className={idx > 0 ? 'border-t border-gray-100' : ''}>
                      <div className="px-6 py-2.5 bg-gray-50 flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">{group.title}</span>
                        <span className="text-xs text-gray-400 ml-1">({group.cards.length})</span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {group.cards.map(card => {
                          const status = getDeadlineStatus(card.deadline) || 'ok';
                          const cfg = deadlineConfig[status];
                          const tags = getCardTags(card);
                          const completedSubs = card.subtasks?.filter(s => s.completed).length || 0;
                          const totalSubs = card.subtasks?.length || 0;

                          return (
                            <div
                              key={card.id}
                              onClick={() => handleOpenCard(card)}
                              className={`group flex items-start gap-4 px-6 py-4 cursor-pointer transition-all hover:bg-gray-50/80 ${status !== 'ok' ? cfg.bg : ''}`}
                            >
                              {/* Status indicator */}
                              <div className={`w-1 self-stretch rounded-full shrink-0 mt-1 ${status === 'overdue' ? 'bg-red-400' : status === 'today' ? 'bg-amber-400' : status === 'soon' ? 'bg-blue-400' : 'bg-gray-200'}`} />

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    {/* Tags */}
                                    {tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mb-1.5">
                                        {tags.map(tag => (
                                          <span key={tag.id} className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: tag.color }}>
                                            {tag.name}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-700 transition-colors leading-snug">
                                      {card.title}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                      {/* List name */}
                                      <span className="text-xs text-gray-400 flex items-center gap-1">
                                        <ChevronRight className="w-3 h-3" />
                                        {getListTitle(card.listId)}
                                      </span>
                                      {/* Subtasks */}
                                      {totalSubs > 0 && (
                                        <span className={`text-xs flex items-center gap-1 ${completedSubs === totalSubs ? 'text-green-600' : 'text-gray-400'}`}>
                                          <CheckSquare className="w-3 h-3" />
                                          {completedSubs}/{totalSubs}
                                        </span>
                                      )}
                                      {/* Comments */}
                                      {(card.comments?.length || 0) > 0 && (
                                        <span className="text-xs text-gray-400 flex items-center gap-1">
                                          <MessageSquare className="w-3 h-3" />
                                          {card.comments.length}
                                        </span>
                                      )}
                                      {/* Attachments */}
                                      {(card.attachments?.length || 0) > 0 && (
                                        <span className="text-xs text-gray-400 flex items-center gap-1">
                                          <Paperclip className="w-3 h-3" />
                                          {card.attachments.length}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Right side: deadline + actions */}
                                  <div className="flex flex-col items-end gap-2 shrink-0">
                                    {card.deadline && (
                                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${cfg.badge}`}>
                                        <Clock className="w-3 h-3" />
                                        {status === 'overdue' ? 'Прострочено ' : ''}
                                        {format(new Date(card.deadline), 'd MMM', { locale: uk })}
                                      </span>
                                    )}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={e => { e.stopPropagation(); handleGoToBoard(card); }}
                                        className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5 hover:underline"
                                        title="Відкрити на дошці"
                                      >
                                        На дошку
                                        <ArrowRight className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Arrow */}
                              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors shrink-0 mt-1" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* My Content */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Мій контент-план
                <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">{myContent.length}</span>
              </h3>
              {myContent.length > 0 && (
                <button
                  onClick={() => setActiveView('content')}
                  className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition"
                >
                  Контент-план <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {myContent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <FileText className="w-8 h-8 mb-2 text-gray-300" />
                <p className="text-sm">Контенту немає</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {myContent.slice(0, 8).map(item => (
                  <div
                    key={item.id}
                    onClick={() => setActiveView('content')}
                    className="px-6 py-3 flex items-center justify-between hover:bg-gray-50/70 transition cursor-pointer group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors truncate">{item.focus || item.description || 'Без назви'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.channel}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">{item.status}</span>
                      {item.publishDate && (
                        <span className="text-xs text-gray-400">{format(new Date(item.publishDate), 'd MMM', { locale: uk })}</span>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right — Password + Info */}
        <div className="space-y-6">
          {/* Change Password */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm">
                <Lock className="w-4 h-4 text-gray-500" />
                Змінити пароль
              </h3>
            </div>
            <form onSubmit={handlePasswordChange} className="px-5 py-5 space-y-3">
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
                      className="w-full px-3 pr-9 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw({ ...showPw, [showKey]: !showPw[showKey] })}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPw[showKey] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
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
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition disabled:opacity-60"
              >
                {pwLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock className="w-4 h-4" />}
                Зберегти пароль
              </button>
            </form>
          </div>

          {/* Profile info */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm mb-4">
              <UserIcon className="w-4 h-4 text-gray-500" />
              Інформація
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Ім'я</span>
                <span className="font-semibold text-gray-800">{user.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="font-semibold text-gray-800 truncate ml-4 max-w-[160px] text-right">{currentUser.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Роль</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${roleColor}`}>{roleLabel}</span>
              </div>
              {user.role && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Посада</span>
                  <span className="font-semibold text-gray-800">{user.role}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Card Modal */}
      {selectedCard && (
        <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  );
}

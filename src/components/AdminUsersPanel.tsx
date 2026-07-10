import React, { useState } from 'react';
import { useAppContext } from '../App';
import { changePassword, setUserCredentials, resetUserPassword, getAuthList, generateInviteToken, testPersonalNotification } from '../api';
import {
  Shield, User as UserIcon, Mail, Lock, Key, RefreshCw,
  Check, X, AlertCircle, Eye, EyeOff, ChevronDown, ChevronUp,
  Copy, CheckCheck, Plus, Edit3, Link, Settings2, Send, MessageCircle,
  ShieldCheck, ShieldOff, Sliders
} from 'lucide-react';
import { AccessRights } from '../types';

interface AuthEntry { userId: string; email: string; role: string; }

const viewsList = [
  { id: 'dashboard', label: 'Головна' },
  { id: 'projects', label: 'Проєкти' },
  { id: 'processes', label: 'Процеси' },
  { id: 'board', label: 'Дошка' },
  { id: 'content', label: 'Контент-план' },
  { id: 'events', label: 'Події' },
  { id: 'calendar', label: 'Календар' },
  { id: 'regulations', label: 'Регламенти' },
];

export default function AdminUsersPanel() {
  const { state, currentUser, updateUser } = useAppContext();
  const [authList, setAuthList] = useState<AuthEntry[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [form, setForm] = useState<{ userId: string; email: string; password: string; role: 'admin' | 'member' } | null>(null);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [rightsUserId, setRightsUserId] = useState<string | null>(null);
  const [rightsForm, setRightsForm] = useState<{ useCustom: boolean; rights: AccessRights; groupId: string | null } | null>(null);

  const [tempPassword, setTempPassword] = useState<{ userId: string; pass: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetLoading, setResetLoading] = useState<string | null>(null);
  
  const [inviteLoading, setInviteLoading] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<{ userId: string; link: string } | null>(null);

  // Telegram Chat ID editing
  const [telegramEdit, setTelegramEdit] = useState<{ userId: string; value: string } | null>(null);
  const [telegramSaving, setTelegramSaving] = useState<string | null>(null);
  const [telegramTesting, setTelegramTesting] = useState<string | null>(null);
  const [telegramTestResult, setTelegramTestResult] = useState<{ userId: string; ok: boolean; msg: string } | null>(null);

  const loadAuthList = async () => {
    setLoadingList(true);
    try {
      const list = await getAuthList();
      setAuthList(list);
    } catch {
      setAuthList([]);
    } finally {
      setLoadingList(false);
    }
  };

  const handleToggle = async () => {
    if (!expanded) await loadAuthList();
    setExpanded(v => !v);
  };

  const openForm = (userId: string) => {
    const existing = authList?.find(a => a.userId === userId);
    const user = state.users.find(u => u.id === userId);
    setForm({
      userId,
      email: existing?.email || (user?.email ?? ''),
      password: '',
      role: (existing?.role as 'admin' | 'member') || 'member',
    });
    setFormError('');
    setShowFormPassword(false);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.email || !form.password) { setFormError('Email та пароль обов\'язкові'); return; }
    if (form.password.length < 6) { setFormError('Пароль мінімум 6 символів'); return; }
    setFormLoading(true);
    setFormError('');
    try {
      await setUserCredentials(form.userId, form.email, form.password, form.role);
      await loadAuthList();
      setForm(null);
    } catch (err: any) {
      setFormError(err.message || 'Помилка');
    } finally {
      setFormLoading(false);
    }
  };

  const handleReset = async (userId: string) => {
    setResetLoading(userId);
    try {
      const { tempPassword: pass } = await resetUserPassword(userId);
      setTempPassword({ userId, pass });
      setCopied(false);
      setInviteLink(null);
    } catch (err: any) {
      alert(err.message || 'Помилка скидання');
    } finally {
      setResetLoading(null);
    }
  };

  const handleInvite = async (userId: string) => {
    setInviteLoading(userId);
    try {
      const token = await generateInviteToken(userId);
      const link = `${window.location.origin}?invite=${token}`;
      setInviteLink({ userId, link });
      setCopied(false);
      setTempPassword(null);
    } catch (err: any) {
      alert(err.message || 'Помилка генерації запрошення');
    } finally {
      setInviteLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const openRights = (userId: string) => {
    const user = state.users.find(u => u.id === userId);
    const group = state.userGroups?.find(g => g.id === user?.groupId);
    const defaultRights: AccessRights = {
      canEdit: true,
      allowedViews: ['dashboard', 'projects', 'processes', 'board', 'content', 'events', 'calendar', 'regulations'],
    };
    const hasCustom = !!user?.customRights;
    setRightsUserId(userId);
    setRightsForm({
      useCustom: hasCustom,
      groupId: user?.groupId ?? null,
      rights: user?.customRights || group?.rights || { ...defaultRights },
    });
  };

  const handleSaveRights = (userId: string) => {
    if (!rightsForm) return;
    if (!rightsForm.useCustom) {
      // Use group or defaults — clear customRights
      updateUser(userId, { customRights: null, groupId: rightsForm.groupId });
    } else {
      updateUser(userId, { customRights: rightsForm.rights, groupId: null });
    }
    setRightsUserId(null);
    setRightsForm(null);
  };

  const toggleRightsView = (viewId: string) => {
    if (!rightsForm) return;
    const views = rightsForm.rights.allowedViews;
    setRightsForm({
      ...rightsForm,
      rights: {
        ...rightsForm.rights,
        allowedViews: views.includes(viewId) ? views.filter(v => v !== viewId) : [...views, viewId],
      },
    });
  };

  const handleSaveTelegramId = async (userId: string) => {
    if (!telegramEdit || telegramEdit.userId !== userId) return;
    setTelegramSaving(userId);
    try {
      await updateUser(userId, { telegramChatId: telegramEdit.value.trim() || null });
      setTelegramEdit(null);
    } finally {
      setTelegramSaving(null);
    }
  };

  const handleTestTelegram = async (userId: string) => {
    setTelegramTesting(userId);
    setTelegramTestResult(null);
    try {
      await testPersonalNotification(userId);
      setTelegramTestResult({ userId, ok: true, msg: 'Тестове повідомлення надіслано!' });
    } catch (err: any) {
      setTelegramTestResult({ userId, ok: false, msg: err.message || 'Помилка надсилання' });
    } finally {
      setTelegramTesting(null);
      setTimeout(() => setTelegramTestResult(null), 5000);
    }
  };

  if (currentUser?.role !== 'admin') return null;

  return (
    <div className="mt-6 border border-blue-100 rounded-xl overflow-hidden bg-blue-50/40">
      {/* Header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-blue-50/60 transition"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-600/10 flex items-center justify-center">
            <Shield className="w-4 h-4 text-blue-600" />
          </div>
          <span className="font-bold text-gray-800 text-sm">Управління доступом</span>
          <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">Адмін</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-blue-100 bg-white/60">
          {loadingList ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {state.users.map(user => {
                const auth = authList?.find(a => a.userId === user.id);
                const hasAccess = !!auth;
                const isEditingThis = form?.userId === user.id;
                const tempForThis = tempPassword?.userId === user.id ? tempPassword.pass : null;

                return (
                  <div key={user.id} className="px-5 py-4">
                    {/* User row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-full border border-gray-200 shrink-0 object-cover" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800 text-sm">{user.name}</span>
                            {hasAccess && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${auth.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                                {auth.role === 'admin' ? 'Адмін' : 'Член команди'}
                              </span>
                            )}
                          </div>
                          {hasAccess ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 text-gray-400" />
                              <span className="text-xs text-gray-500">{auth.email}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <X className="w-3 h-3 text-red-400" />
                              Доступу немає
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => isEditingThis ? setForm(null) : openForm(user.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            isEditingThis
                              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              : hasAccess
                              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                          }`}
                        >
                          {isEditingThis ? <X className="w-3.5 h-3.5" /> : hasAccess ? <Edit3 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                          {isEditingThis ? 'Скасувати' : hasAccess ? 'Змінити' : 'Дати доступ'}
                        </button>

                        {/* Rights button */}
                        <button
                          onClick={() => {
                            if (rightsUserId === user.id) { setRightsUserId(null); setRightsForm(null); }
                            else openRights(user.id);
                          }}
                          title="Налаштувати права доступу"
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            rightsUserId === user.id
                              ? 'bg-violet-100 text-violet-700'
                              : user.customRights
                              ? 'bg-violet-50 text-violet-700 border border-violet-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          Права
                          {user.customRights && <ShieldCheck className="w-3 h-3 text-violet-500" />}
                        </button>

                        {!hasAccess && !isEditingThis && (
                          <button
                            onClick={() => handleInvite(user.id)}
                            disabled={inviteLoading === user.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition disabled:opacity-60"
                          >
                            {inviteLoading === user.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                            ) : (
                              <Link className="w-3.5 h-3.5" />
                            )}
                            Запросити
                          </button>
                        )}

                        {hasAccess && (
                          <button
                            onClick={() => handleReset(user.id)}
                            disabled={resetLoading === user.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition disabled:opacity-60"
                          >
                            {resetLoading === user.id
                              ? <div className="w-3.5 h-3.5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
                              : <RefreshCw className="w-3.5 h-3.5" />
                            }
                            Скинути пароль
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Temp password result */}
                    {tempForThis && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-amber-800 font-medium">Новий тимчасовий пароль згенеровано.</p>
                          <p className="text-sm font-mono font-bold text-amber-900 mt-1 tracking-wider bg-white px-2 py-1 rounded border border-amber-200 inline-block">
                            {tempForThis}
                          </p>
                          <p className="text-[10px] text-amber-600 mt-1">Обов'язково скопіюйте і передайте його користувачу!</p>
                        </div>
                        <button
                          onClick={() => copyToClipboard(tempForThis)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 rounded text-xs font-semibold text-amber-700 hover:bg-amber-50 transition"
                        >
                          {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied ? 'Скопійовано' : 'Копіювати'}
                        </button>
                      </div>
                    )}

                    {/* Invite Link Notification */}
                    {inviteLink?.userId === user.id && (
                      <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                        <div className="flex-1 overflow-hidden">
                          <p className="text-xs text-indigo-800 font-medium mb-1 flex items-center gap-1.5">
                            <Link className="w-3.5 h-3.5" />
                            Посилання-запрошення готове
                          </p>
                          <p className="text-xs font-mono text-indigo-900 bg-white px-2 py-1.5 rounded border border-indigo-200 truncate" title={inviteLink.link}>
                            {inviteLink.link}
                          </p>
                          <p className="text-[10px] text-indigo-600 mt-1">Надішліть це посилання користувачу. Він сам встановить свій email та пароль.</p>
                        </div>
                        <button
                          onClick={() => copyToClipboard(inviteLink.link)}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-300 rounded text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition mt-6"
                        >
                          {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied ? 'Скопійовано' : 'Копіювати'}
                        </button>
                      </div>
                    )}

                    {/* ── Rights Panel ── */}
                    {rightsUserId === user.id && rightsForm && (
                      <div className="mt-3 bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-violet-800 uppercase tracking-wider flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5" />
                            Права доступу &mdash; {user.name}
                          </p>
                        </div>

                        {/* Mode selector */}
                        <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
                          <button
                            onClick={() => setRightsForm({ ...rightsForm, useCustom: false, groupId: null })}
                            className={`py-2 px-2 rounded-lg border transition text-center ${
                              !rightsForm.useCustom && !rightsForm.groupId ? 'bg-white border-violet-400 text-violet-700 shadow-sm' : 'bg-white/60 border-violet-100 text-gray-500 hover:border-violet-300'
                            }`}
                          >
                            Стандартні
                          </button>
                          <button
                            onClick={() => setRightsForm({ ...rightsForm, useCustom: false, groupId: rightsForm.groupId || (state.userGroups?.[0]?.id ?? null) })}
                            className={`py-2 px-2 rounded-lg border transition text-center ${
                              !rightsForm.useCustom && rightsForm.groupId ? 'bg-white border-violet-400 text-violet-700 shadow-sm' : 'bg-white/60 border-violet-100 text-gray-500 hover:border-violet-300'
                            }`}
                          >
                            Група
                          </button>
                          <button
                            onClick={() => setRightsForm({ ...rightsForm, useCustom: true, groupId: null })}
                            className={`py-2 px-2 rounded-lg border transition text-center ${
                              rightsForm.useCustom ? 'bg-white border-violet-400 text-violet-700 shadow-sm' : 'bg-white/60 border-violet-100 text-gray-500 hover:border-violet-300'
                            }`}
                          >
                            Індивідуальні
                          </button>
                        </div>

                        {/* Group selector */}
                        {!rightsForm.useCustom && rightsForm.groupId !== null && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Група</label>
                            {(state.userGroups || []).length === 0 ? (
                              <p className="text-xs text-gray-400 italic">Немає жодної групи. Створіть групу у розділі «Групи та Права».</p>
                            ) : (
                              <select
                                value={rightsForm.groupId || ''}
                                onChange={e => setRightsForm({ ...rightsForm, groupId: e.target.value || null })}
                                className="w-full px-3 py-2 text-sm border border-violet-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-500 bg-white"
                              >
                                {(state.userGroups || []).map(g => (
                                  <option key={g.id} value={g.id}>{g.name} ({g.rights.allowedViews.length} розділів{!g.rights.canEdit ? ', лише перегляд' : ''})</option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}

                        {/* Custom rights editor */}
                        {rightsForm.useCustom && (
                          <div className="space-y-3">
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 bg-white rounded-lg px-3 py-2 border border-violet-100">
                              <input
                                type="checkbox"
                                checked={rightsForm.rights.canEdit}
                                onChange={e => setRightsForm({ ...rightsForm, rights: { ...rightsForm.rights, canEdit: e.target.checked } })}
                                className="rounded text-violet-600 focus:ring-violet-500"
                              />
                              Дозволити редагування (створювати/видаляти/змінювати)
                            </label>

                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-2">Доступні розділи</label>
                              <div className="grid grid-cols-2 gap-2">
                                {viewsList.map(v => (
                                  <label key={v.id} className="flex items-center gap-2 text-xs text-gray-700 bg-white px-2.5 py-2 rounded-lg border border-violet-100 hover:border-violet-300 cursor-pointer transition">
                                    <input
                                      type="checkbox"
                                      checked={rightsForm.rights.allowedViews.includes(v.id)}
                                      onChange={() => toggleRightsView(v.id)}
                                      className="rounded text-violet-600 focus:ring-violet-500"
                                    />
                                    {v.label}
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Standard rights notice */}
                        {!rightsForm.useCustom && !rightsForm.groupId && (
                          <p className="text-xs text-gray-500 bg-white/80 rounded-lg px-3 py-2 border border-violet-100">
                            Користувач матиме повний доступ до всіх розділів із правом редагування.
                          </p>
                        )}

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleSaveRights(user.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Зберегти
                          </button>
                          <button
                            onClick={() => { setRightsUserId(null); setRightsForm(null); }}
                            className="px-4 py-2 bg-white border border-violet-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition"
                          >
                            Скасувати
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Edit form */}
                    {isEditingThis && form && (
                      <form onSubmit={handleFormSubmit} className="mt-3 bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                          {hasAccess ? 'Змінити облікові дані' : 'Встановити доступ'}
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 font-medium mb-1">Email</label>
                            <div className="relative">
                              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                              <input
                                type="email"
                                value={form.email}
                                onChange={e => setForm({ ...form, email: e.target.value })}
                                placeholder="email@example.com"
                                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 font-medium mb-1">
                              {hasAccess ? 'Новий пароль' : 'Пароль'}
                            </label>
                            <div className="relative">
                              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                              <input
                                type={showFormPassword ? 'text' : 'password'}
                                value={form.password}
                                onChange={e => setForm({ ...form, password: e.target.value })}
                                placeholder="мін. 6 символів"
                                className="w-full pl-8 pr-8 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              />
                              <button type="button" onClick={() => setShowFormPassword(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                                {showFormPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 font-medium mb-1">Роль</label>
                          <div className="flex gap-2">
                            {(['member', 'admin'] as const).map(r => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setForm({ ...form, role: r })}
                                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${
                                  form.role === r
                                    ? r === 'admin'
                                      ? 'bg-purple-600 text-white border-purple-600'
                                      : 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                {r === 'admin' ? '👑 Адмін' : '👤 Член команди'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {formError && (
                          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <p className="text-xs text-red-600">{formError}</p>
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <button
                            type="submit"
                            disabled={formLoading}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-60"
                          >
                            {formLoading
                              ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : <Check className="w-3.5 h-3.5" />
                            }
                            Зберегти
                          </button>
                          <button
                            type="button"
                            onClick={() => setForm(null)}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-lg transition"
                          >
                            Скасувати
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Telegram Chat ID */}
                    <div className="mt-3 bg-sky-50/70 border border-sky-100 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <MessageCircle className="w-3.5 h-3.5 text-sky-600" />
                          <span className="text-xs font-semibold text-sky-800">Telegram Chat ID</span>
                          {user.telegramChatId && (
                            <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">✓ Налаштовано</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {user.telegramChatId && telegramEdit?.userId !== user.id && (
                            <button
                              onClick={() => handleTestTelegram(user.id)}
                              disabled={telegramTesting === user.id}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-sky-100 hover:bg-sky-200 text-sky-700 rounded-lg transition disabled:opacity-60"
                            >
                              {telegramTesting === user.id
                                ? <div className="w-3 h-3 border-2 border-sky-300 border-t-sky-600 rounded-full animate-spin" />
                                : <Send className="w-3 h-3" />
                              }
                              Тест
                            </button>
                          )}
                          <button
                            onClick={() => telegramEdit?.userId === user.id ? setTelegramEdit(null) : setTelegramEdit({ userId: user.id, value: user.telegramChatId || '' })}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-white border border-sky-200 hover:bg-sky-50 text-sky-700 rounded-lg transition"
                          >
                            {telegramEdit?.userId === user.id ? <X className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
                            {telegramEdit?.userId === user.id ? 'Скасувати' : (user.telegramChatId ? 'Змінити' : 'Вказати')}
                          </button>
                        </div>
                      </div>

                      {telegramEdit?.userId === user.id ? (
                        <div className="space-y-2">
                          <div className="bg-sky-100/60 rounded-lg px-2.5 py-2 text-[10px] text-sky-700 leading-relaxed">
                            <span className="font-bold">Як отримати Chat ID:</span> Попросіть людину написати боту
                            {' '}<span className="font-mono bg-white px-1 py-0.5 rounded border border-sky-200">/start</span>{' '}
                            або будь-яке повідомлення, а потім відкрийте
                            {' '}<span className="font-mono bg-white px-1 py-0.5 rounded border border-sky-200">https://api.telegram.org/bot{'{TOKEN}'}/getUpdates</span>{' '}
                            та знайдіть поле <span className="font-mono">message.chat.id</span>.
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={telegramEdit.value}
                              onChange={e => setTelegramEdit({ ...telegramEdit, value: e.target.value })}
                              placeholder="Наприклад: 123456789"
                              className="flex-1 px-3 py-1.5 text-xs border border-sky-200 rounded-lg outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 font-mono"
                            />
                            <button
                              onClick={() => handleSaveTelegramId(user.id)}
                              disabled={telegramSaving === user.id}
                              className="flex items-center gap-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-60"
                            >
                              {telegramSaving === user.id
                                ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                : <Check className="w-3 h-3" />
                              }
                              Зберегти
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500 font-mono">
                          {user.telegramChatId
                            ? <span className="text-sky-700 font-semibold">{user.telegramChatId}</span>
                            : <span className="text-gray-400 italic">Не вказано — персональні сповіщення не надсилатимуться</span>
                          }
                        </div>
                      )}

                      {/* Test result */}
                      {telegramTestResult?.userId === user.id && (
                        <div className={`mt-2 text-xs px-2.5 py-1.5 rounded-lg font-medium ${
                          telegramTestResult.ok
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {telegramTestResult.ok ? '✅ ' : '❌ '}{telegramTestResult.msg}
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

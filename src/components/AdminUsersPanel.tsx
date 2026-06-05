import React, { useState } from 'react';
import { useAppContext } from '../App';
import { changePassword, setUserCredentials, resetUserPassword, getAuthList } from '../api';
import {
  Shield, User as UserIcon, Mail, Lock, Key, RefreshCw,
  Check, X, AlertCircle, Eye, EyeOff, ChevronDown, ChevronUp,
  Copy, CheckCheck, Plus, Edit3
} from 'lucide-react';

interface AuthEntry { userId: string; email: string; role: string; }

export default function AdminUsersPanel() {
  const { state, currentUser } = useAppContext();
  const [authList, setAuthList] = useState<AuthEntry[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [form, setForm] = useState<{ userId: string; email: string; password: string; role: 'admin' | 'member' } | null>(null);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const [tempPassword, setTempPassword] = useState<{ userId: string; pass: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetLoading, setResetLoading] = useState<string | null>(null);

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
    } catch (err: any) {
      alert(err.message || 'Помилка скидання');
    } finally {
      setResetLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
                      <div className="mt-3 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <Key className="w-4 h-4 text-amber-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-amber-700 font-semibold">Тимчасовий пароль:</p>
                          <p className="text-sm font-mono font-bold text-amber-800 mt-0.5">{tempForThis}</p>
                        </div>
                        <button
                          onClick={() => copyToClipboard(tempForThis)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 transition"
                        >
                          {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied ? 'Скопійовано' : 'Копіювати'}
                        </button>
                        <button onClick={() => setTempPassword(null)} className="text-amber-400 hover:text-amber-600">
                          <X className="w-4 h-4" />
                        </button>
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

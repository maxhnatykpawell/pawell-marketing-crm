/**
 * Центр доступу — повноекранне вікно для адміна: люди, їхній вхід у систему,
 * рівні доступу, команди (групи) та їхній склад.
 *
 * Розкладка «список ліворуч — деталі праворуч»: раніше все це жило акордеоном
 * у вузькому вікні команди, де на одну людину виходило по три вкладені панелі
 * і щоб порівняти двох людей, доводилось безперервно гортати.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../App';
import {
  setUserCredentials, resetUserPassword, getAuthList,
  generateInviteToken, testPersonalNotification,
} from '../api';
import {
  X, Search, Users, Shield, Plus, Trash2, Check, Mail, Lock, Eye, EyeOff,
  Link as LinkIcon, RefreshCw, Copy, CheckCheck, Send, MessageCircle,
  AlertCircle, Crown, UserRound, Layers, Eye as ViewIcon,
} from 'lucide-react';
import { AccessRights, User, UserGroup } from '../types';
import { DEFAULT_ALLOWED_VIEWS } from '../lib/views';
import AccessViewsPicker from './AccessViewsPicker';

interface AuthEntry { userId: string; email: string; role: string }
type Tab = 'people' | 'groups';
type Mode = 'default' | 'group' | 'custom';

const NEW_GROUP = '__new__';

const card = 'bg-white rounded-2xl border border-gray-200/80 shadow-sm';
const input =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition';
const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition disabled:opacity-50';
const btnGhost =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition disabled:opacity-50';

const Avatar: React.FC<{ user: User; size?: string }> = ({ user, size = 'w-10 h-10' }) =>
  user.avatar ? (
    <img src={user.avatar} alt={user.name} className={`${size} rounded-full object-cover border border-gray-200 shrink-0`} />
  ) : (
    <div className={`${size} rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0`}>
      {user.name.slice(0, 1).toUpperCase()}
    </div>
  );

const Section: React.FC<{ icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }> = ({
  icon, title, hint, children,
}) => (
  <section className={`${card} p-6`}>
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">{icon}</div>
      <div>
        <h3 className="font-bold text-gray-900 leading-tight">{title}</h3>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
    </div>
    {children}
  </section>
);

export default function AccessCenter({ onClose }: { onClose: () => void }) {
  const {
    state, currentUser, updateUser,
    addUserGroup, updateUserGroup, deleteUserGroup, confirmAction,
  } = useAppContext();

  const [tab, setTab] = useState<Tab>('people');
  const [query, setQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(state.users[0]?.id ?? null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(state.userGroups?.[0]?.id ?? null);
  const [authList, setAuthList] = useState<AuthEntry[] | null>(null);

  useEffect(() => {
    getAuthList().then(setAuthList).catch(() => setAuthList([]));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (currentUser?.role !== 'admin') return null;

  const groups = state.userGroups || [];
  const q = query.trim().toLowerCase();
  const users = state.users.filter((u) => !q || u.name.toLowerCase().includes(q));
  const shownGroups = groups.filter((g) => !q || g.name.toLowerCase().includes(q));
  const groupOf = (u: User) => groups.find((g) => g.id === u.groupId);

  return (
    <div className="fixed inset-0 z-[60] bg-gray-50 flex flex-col">
      {/* ── Верхня панель ───────────────────────────────────────────── */}
      <header className="h-16 shrink-0 bg-white border-b border-gray-200 px-6 flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 leading-tight">Доступ і команди</h1>
            <p className="text-xs text-gray-500">Хто що бачить, у якій команді і як входить</p>
          </div>
        </div>

        <nav className="flex bg-gray-100 rounded-xl p-1 ml-4">
          {([
            ['people', 'Люди', state.users.length, <UserRound key="p" className="w-4 h-4" />],
            ['groups', 'Команди', groups.length, <Users key="g" className="w-4 h-4" />],
          ] as const).map(([id, label, count, icon]) => (
            <button
              key={id}
              onClick={() => { setTab(id); setQuery(''); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
                tab === id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {icon}
              {label}
              <span className={`text-[11px] px-1.5 rounded-full ${tab === id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-500'}`}>
                {count}
              </span>
            </button>
          ))}
        </nav>

        <button
          onClick={onClose}
          title="Закрити (Esc)"
          className="ml-auto p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* ── Список ──────────────────────────────────────────────── */}
        <aside className="w-80 shrink-0 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === 'people' ? 'Пошук людини' : 'Пошук команди'}
                className={`${input} pl-9 bg-gray-50`}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {tab === 'people' &&
              users.map((u) => {
                const auth = authList?.find((a) => a.userId === u.id);
                const g = groupOf(u);
                const active = u.id === selectedUserId;
                return (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUserId(u.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${
                      active ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-gray-50'
                    }`}
                  >
                    <Avatar user={u} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-gray-900 truncate">{u.name}</span>
                        {auth?.role === 'admin' && <Crown className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {u.customRights ? 'Індивідуальні права' : g ? `Команда: ${g.name}` : 'Стандартні права'}
                      </div>
                    </div>
                    {authList && !auth && (
                      <span title="Ще не має входу в систему" className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    )}
                  </button>
                );
              })}

            {tab === 'groups' && (
              <>
                {shownGroups.map((g) => {
                  const count = state.users.filter((u) => u.groupId === g.id).length;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroupId(g.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${
                        g.id === selectedGroupId ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm text-gray-900 truncate">{g.name}</div>
                        <div className="text-xs text-gray-500">
                          {count} {count === 1 ? 'людина' : 'людей'} · {g.rights.allowedViews.length} розділів
                          {!g.rights.canEdit && ' · перегляд'}
                        </div>
                      </div>
                    </button>
                  );
                })}
                <button
                  onClick={() => setSelectedGroupId(NEW_GROUP)}
                  className={`w-full mt-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 border-dashed text-sm font-semibold transition ${
                    selectedGroupId === NEW_GROUP
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  <Plus className="w-4 h-4" /> Нова команда
                </button>
              </>
            )}
          </div>
        </aside>

        {/* ── Деталі ──────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-8">
            {tab === 'people' ? (
              state.users.find((u) => u.id === selectedUserId) ? (
                <PersonDetail
                  key={selectedUserId}
                  user={state.users.find((u) => u.id === selectedUserId)!}
                  auth={authList?.find((a) => a.userId === selectedUserId)}
                  groups={groups}
                  reloadAuth={() => getAuthList().then(setAuthList).catch(() => {})}
                  updateUser={updateUser}
                />
              ) : (
                <Empty text="Оберіть людину зі списку" />
              )
            ) : selectedGroupId === NEW_GROUP || groups.find((g) => g.id === selectedGroupId) ? (
              <GroupDetail
                key={selectedGroupId}
                group={groups.find((g) => g.id === selectedGroupId) ?? null}
                users={state.users}
                onCreate={(data, memberIds) => {
                  const id = addUserGroup(data);
                  if (id) {
                    memberIds.forEach((uid) => updateUser(uid, { groupId: id, customRights: null }));
                    setSelectedGroupId(id);
                  }
                }}
                onUpdate={(g, data, memberIds) => {
                  updateUserGroup(g.id, data);
                  state.users.forEach((u) => {
                    const was = u.groupId === g.id;
                    const now = memberIds.includes(u.id);
                    if (now && !was) updateUser(u.id, { groupId: g.id, customRights: null });
                    if (!now && was) updateUser(u.id, { groupId: null });
                  });
                }}
                onDelete={(g) =>
                  confirmAction(
                    `Видалити команду «${g.name}»? Її учасники повернуться до стандартних прав.`,
                    () => {
                      deleteUserGroup(g.id);
                      setSelectedGroupId(null);
                    },
                  )
                }
              />
            ) : (
              <Empty text="Оберіть команду або створіть нову" />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="py-24 text-center text-gray-400">{text}</div>
);

/* ═══════════════════════ Людина ═══════════════════════ */

function PersonDetail({
  user, auth, groups, reloadAuth, updateUser,
}: {
  user: User;
  auth?: AuthEntry;
  groups: UserGroup[];
  reloadAuth: () => void;
  updateUser: (id: string, updates: Partial<User>) => void;
}) {
  const hasAccess = !!auth;

  // ── Вхід у систему ──
  const [editLogin, setEditLogin] = useState(false);
  const [email, setEmail] = useState(auth?.email || user.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>((auth?.role as 'admin' | 'member') || 'member');
  const [showPass, setShowPass] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [secret, setSecret] = useState<{ kind: 'password' | 'invite'; value: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'reset' | 'invite' | null>(null);

  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return setLoginError("Email та пароль обов'язкові");
    if (password.length < 6) return setLoginError('Пароль мінімум 6 символів');
    setLoginBusy(true);
    setLoginError('');
    try {
      await setUserCredentials(user.id, email, password, role);
      reloadAuth();
      setEditLogin(false);
      setPassword('');
    } catch (err: any) {
      setLoginError(err.message || 'Помилка');
    } finally {
      setLoginBusy(false);
    }
  };

  const reset = async () => {
    setBusy('reset');
    try {
      const { tempPassword } = await resetUserPassword(user.id);
      setSecret({ kind: 'password', value: tempPassword });
      setCopied(false);
    } catch (err: any) {
      alert(err.message || 'Помилка скидання');
    } finally {
      setBusy(null);
    }
  };

  const invite = async () => {
    setBusy('invite');
    try {
      const token = await generateInviteToken(user.id);
      setSecret({ kind: 'invite', value: `${window.location.origin}?invite=${token}` });
      setCopied(false);
    } catch (err: any) {
      alert(err.message || 'Помилка генерації запрошення');
    } finally {
      setBusy(null);
    }
  };

  // ── Права ──
  const initialMode: Mode = user.customRights ? 'custom' : user.groupId ? 'group' : 'default';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [groupId, setGroupId] = useState<string>(user.groupId || groups[0]?.id || '');
  const [rights, setRights] = useState<AccessRights>(
    user.customRights || groups.find((g) => g.id === user.groupId)?.rights || {
      canEdit: true,
      allowedViews: [...DEFAULT_ALLOWED_VIEWS],
    },
  );
  const [saved, setSaved] = useState(false);

  const dirty =
    mode !== initialMode ||
    (mode === 'group' && groupId !== (user.groupId || '')) ||
    (mode === 'custom' && JSON.stringify(rights) !== JSON.stringify(user.customRights));

  const saveRights = () => {
    if (mode === 'custom') updateUser(user.id, { customRights: rights, groupId: null });
    else if (mode === 'group' && groupId) updateUser(user.id, { customRights: null, groupId });
    else updateUser(user.id, { customRights: null, groupId: null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // ── Telegram ──
  const [tg, setTg] = useState(user.telegramChatId || '');
  const [tgMsg, setTgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tgBusy, setTgBusy] = useState(false);

  const testTg = async () => {
    setTgBusy(true);
    try {
      await testPersonalNotification(user.id);
      setTgMsg({ ok: true, text: 'Тестове повідомлення надіслано' });
    } catch (err: any) {
      setTgMsg({ ok: false, text: err.message || 'Помилка надсилання' });
    } finally {
      setTgBusy(false);
      setTimeout(() => setTgMsg(null), 5000);
    }
  };

  const modes: { id: Mode; title: string; text: string }[] = [
    { id: 'default', title: 'Стандартні', text: 'Усі розділи, крім чутливих, із правом редагування' },
    { id: 'group', title: 'Як у команди', text: 'Права беруться з команди й змінюються разом із нею' },
    { id: 'custom', title: 'Індивідуальні', text: 'Окремий набір розділів лише для цієї людини' },
  ];

  return (
    <div className="space-y-6">
      {/* Шапка */}
      <div className="flex items-center gap-4">
        <Avatar user={user} size="w-16 h-16" />
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{user.name}</h2>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
            {hasAccess ? (
              <>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${auth!.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {auth!.role === 'admin' ? 'Адмін' : 'Член команди'}
                </span>
                <span>{auth!.email}</span>
              </>
            ) : (
              <span className="text-amber-600">Ще не має входу в систему</span>
            )}
          </div>
        </div>
      </div>

      {/* Права */}
      <Section icon={<Shield className="w-5 h-5" />} title="Рівень доступу" hint="Що людина бачить і чи може змінювати дані">
        <div className="grid grid-cols-3 gap-3">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              disabled={m.id === 'group' && groups.length === 0}
              className={`text-left p-4 rounded-xl border-2 transition disabled:opacity-40 ${
                mode === m.id ? 'border-indigo-500 bg-indigo-50/60' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-sm text-gray-900">{m.title}</div>
              <div className="text-xs text-gray-500 mt-1 leading-snug">
                {m.id === 'group' && groups.length === 0 ? 'Спершу створіть команду' : m.text}
              </div>
            </button>
          ))}
        </div>

        {mode === 'group' && groups.length > 0 && (
          <div className="mt-5">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Команда</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={input}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} — {g.rights.allowedViews.length} розділів{!g.rights.canEdit ? ', лише перегляд' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === 'custom' && (
          <div className="mt-5 space-y-4">
            <label className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100 text-sm font-semibold text-gray-800 cursor-pointer">
              <input
                type="checkbox"
                checked={rights.canEdit}
                onChange={(e) => setRights({ ...rights, canEdit: e.target.checked })}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              Дозволити редагування (створювати, видаляти, змінювати)
            </label>
            <AccessViewsPicker allowedViews={rights.allowedViews} onChange={(v) => setRights({ ...rights, allowedViews: v })} />
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-emerald-600 flex items-center gap-1"><Check className="w-4 h-4" />Збережено</span>}
          <button onClick={saveRights} disabled={!dirty} className={btnPrimary}>
            <Check className="w-4 h-4" /> Зберегти права
          </button>
        </div>
      </Section>

      {/* Вхід */}
      <Section icon={<Lock className="w-5 h-5" />} title="Вхід у систему" hint="Email, пароль, роль, запрошення">
        {!editLogin ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEditLogin(true)} className={hasAccess ? btnGhost : btnPrimary}>
              {hasAccess ? 'Змінити email / пароль / роль' : 'Дати доступ'}
            </button>
            {!hasAccess && (
              <button onClick={invite} disabled={busy === 'invite'} className={btnGhost}>
                <LinkIcon className="w-4 h-4" /> Запросити за посиланням
              </button>
            )}
            {hasAccess && (
              <button onClick={reset} disabled={busy === 'reset'} className={btnGhost}>
                <RefreshCw className={`w-4 h-4 ${busy === 'reset' ? 'animate-spin' : ''}`} /> Скинути пароль
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={submitLogin} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className={`${input} pl-9`} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{hasAccess ? 'Новий пароль' : 'Пароль'}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="мін. 6 символів" className={`${input} pl-9 pr-9`} />
                  <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {(['member', 'admin'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${
                    role === r
                      ? r === 'admin' ? 'bg-violet-600 text-white border-violet-600' : 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {r === 'admin' ? 'Адмін' : 'Член команди'}
                </button>
              ))}
            </div>
            {loginError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 shrink-0" /> {loginError}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEditLogin(false)} className={btnGhost}>Скасувати</button>
              <button type="submit" disabled={loginBusy} className={btnPrimary}>Зберегти</button>
            </div>
          </form>
        )}

        {secret && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                {secret.kind === 'password' ? 'Тимчасовий пароль' : 'Посилання-запрошення'}
              </p>
              <p className="mt-2 font-mono text-sm bg-white border border-amber-200 rounded-lg px-3 py-1.5 break-all">{secret.value}</p>
              <p className="text-xs text-amber-700 mt-2">
                {secret.kind === 'password'
                  ? "Скопіюйте й передайте людині — повторно його не показати."
                  : 'Людина сама задасть email і пароль за цим посиланням.'}
              </p>
            </div>
            <button onClick={() => copy(secret.value)} className={`${btnGhost} shrink-0`}>
              {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Скопійовано' : 'Копіювати'}
            </button>
          </div>
        )}
      </Section>

      {/* Telegram */}
      <Section icon={<MessageCircle className="w-5 h-5" />} title="Telegram" hint="Куди надсилати персональні сповіщення">
        <div className="flex gap-2">
          <input value={tg} onChange={(e) => setTg(e.target.value)} placeholder="Chat ID, наприклад 123456789" className={`${input} font-mono`} />
          <button
            onClick={() => updateUser(user.id, { telegramChatId: tg.trim() || null })}
            disabled={tg.trim() === (user.telegramChatId || '')}
            className={btnPrimary}
          >
            Зберегти
          </button>
          {user.telegramChatId && (
            <button onClick={testTg} disabled={tgBusy} className={btnGhost}>
              <Send className="w-4 h-4" /> Тест
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-3 leading-relaxed">
          Попросіть людину написати боту <span className="font-mono">/start</span>, потім відкрийте{' '}
          <span className="font-mono">api.telegram.org/bot&#123;TOKEN&#125;/getUpdates</span> і знайдіть{' '}
          <span className="font-mono">message.chat.id</span>.
        </p>
        {tgMsg && (
          <div className={`mt-3 text-sm px-3 py-2 rounded-xl border ${tgMsg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {tgMsg.text}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ═══════════════════════ Команда ═══════════════════════ */

function GroupDetail({
  group, users, onCreate, onUpdate, onDelete,
}: {
  group: UserGroup | null;
  users: User[];
  onCreate: (data: Omit<UserGroup, 'id'>, memberIds: string[]) => void;
  onUpdate: (g: UserGroup, data: Partial<UserGroup>, memberIds: string[]) => void;
  onDelete: (g: UserGroup) => void;
}) {
  const [name, setName] = useState(group?.name || '');
  const [rights, setRights] = useState<AccessRights>(
    group?.rights || { canEdit: true, allowedViews: [...DEFAULT_ALLOWED_VIEWS] },
  );
  const [members, setMembers] = useState<string[]>(
    group ? users.filter((u) => u.groupId === group.id).map((u) => u.id) : [],
  );
  const [saved, setSaved] = useState(false);

  const currentMembers = useMemo(
    () => (group ? users.filter((u) => u.groupId === group.id).map((u) => u.id) : []),
    [group, users],
  );
  const dirty =
    !group ||
    name.trim() !== group.name ||
    JSON.stringify(rights) !== JSON.stringify(group.rights) ||
    [...members].sort().join() !== [...currentMembers].sort().join();

  const toggleMember = (id: string) =>
    setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const save = () => {
    if (!name.trim()) return;
    if (group) onUpdate(group, { name: name.trim(), rights }, members);
    else onCreate({ name: name.trim(), rights }, members);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{group ? group.name : 'Нова команда'}</h2>
          <p className="text-sm text-gray-500 mt-1">
            Усі учасники отримують однакові права, а зарплатні відомості команди можна зібрати одним PDF.
          </p>
        </div>
        {group && (
          <button onClick={() => onDelete(group)} className={`${btnGhost} text-red-600 hover:bg-red-50 hover:border-red-200`}>
            <Trash2 className="w-4 h-4" /> Видалити
          </button>
        )}
      </div>

      <Section icon={<Layers className="w-5 h-5" />} title="Основне">
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Назва команди</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Наприклад: Sales" className={input} />
      </Section>

      <Section icon={<Shield className="w-5 h-5" />} title="Права команди" hint="Застосовуються до кожного учасника">
        <div className="space-y-4">
          <label className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100 text-sm font-semibold text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={rights.canEdit}
              onChange={(e) => setRights({ ...rights, canEdit: e.target.checked })}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span className="flex-1">Дозволити редагування</span>
            {!rights.canEdit && (
              <span className="text-xs text-red-600 flex items-center gap-1 font-bold"><ViewIcon className="w-3.5 h-3.5" />лише перегляд</span>
            )}
          </label>
          <AccessViewsPicker allowedViews={rights.allowedViews} onChange={(v) => setRights({ ...rights, allowedViews: v })} />
        </div>
      </Section>

      <Section
        icon={<Users className="w-5 h-5" />}
        title={`Учасники (${members.length})`}
        hint="Людина може бути лише в одній команді"
      >
        <div className="grid grid-cols-2 gap-2">
          {users.map((u) => {
            const on = members.includes(u.id);
            const other = users.length && u.groupId && u.groupId !== group?.id;
            return (
              <label
                key={u.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition ${
                  on ? 'border-indigo-300 bg-indigo-50/60' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleMember(u.id)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <Avatar user={u} size="w-8 h-8" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-900 truncate">{u.name}</div>
                  {u.customRights && (
                    <div className="text-[11px] text-amber-600">має індивідуальні права — буде скинуто</div>
                  )}
                  {!u.customRights && other && (
                    <div className="text-[11px] text-gray-400">зараз в іншій команді — буде переведено</div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-2 px-2 py-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-emerald-600 flex items-center gap-1"><Check className="w-4 h-4" />Збережено</span>}
        <button onClick={save} disabled={!name.trim() || !dirty} className={btnPrimary}>
          <Check className="w-4 h-4" /> {group ? 'Зберегти команду' : 'Створити команду'}
        </button>
      </div>
    </div>
  );
}

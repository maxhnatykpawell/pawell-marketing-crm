import React, { useState, useEffect } from 'react';
import { useAppContext } from '../App';
import {
  Settings, ChevronDown, ChevronUp, Check, Clock,
  Megaphone, Plus, Trash2, Edit3, X, Send, ToggleLeft, ToggleRight,
  Bell, BellOff, MessageCircle, AlarmClock, FileText
} from 'lucide-react';
import {
  getAnnouncements, createAnnouncement, updateAnnouncement,
  deleteAnnouncement, testAnnouncement
} from '../api';
import { ScheduledAnnouncement, PersonalNotificationSettings, NotificationTemplates } from '../types';

// ── Days config ───────────────────────────────────────────────────────────────

const DAY_LABELS = [
  { value: 1, short: 'Пн' },
  { value: 2, short: 'Вт' },
  { value: 3, short: 'Ср' },
  { value: 4, short: 'Чт' },
  { value: 5, short: 'Пт' },
  { value: 6, short: 'Сб' },
  { value: 0, short: 'Нд' },
];

function formatDays(days: number[]): string {
  if (days.length === 7) return 'Щодня';
  const sorted = [...days].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  const labels = sorted.map(d => DAY_LABELS.find(l => l.value === d)?.short || '');
  // Check if it's Mon-Fri
  if (days.length === 5 && [1,2,3,4,5].every(d => days.includes(d))) return 'Пн–Пт';
  return labels.join(', ');
}

// ── Blank form ────────────────────────────────────────────────────────────────

const blankForm = (): Partial<ScheduledAnnouncement> => ({
  label: '',
  text: '',
  time: '09:00',
  days: [1, 2, 3, 4, 5],
  enabled: true,
});

// ── Announcement Form ─────────────────────────────────────────────────────────

function AnnouncementForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: Partial<ScheduledAnnouncement>;
  onSave: (data: Partial<ScheduledAnnouncement>) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<Partial<ScheduledAnnouncement>>(initial);

  const toggleDay = (d: number) => {
    const cur = form.days || [];
    setForm({ ...form, days: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d] });
  };

  const setAllDays = () => setForm({ ...form, days: [0,1,2,3,4,5,6] });
  const setWeekdays = () => setForm({ ...form, days: [1,2,3,4,5] });

  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm space-y-4">
      {/* Label */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Назва оголошення</label>
        <input
          value={form.label || ''}
          onChange={e => setForm({ ...form, label: e.target.value })}
          placeholder="Наприклад: Ранковий стендап"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
        />
      </div>

      {/* Text */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">
          Текст повідомлення
          <span className="ml-1 font-normal text-gray-400">(Telegram Markdown підтримується)</span>
        </label>
        <textarea
          value={form.text || ''}
          onChange={e => setForm({ ...form, text: e.target.value })}
          placeholder={"*Доброго ранку, команда!* 🌅\n\nНагадую про поточні задачі..."}
          rows={5}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 resize-y font-mono"
        />
      </div>

      {/* Time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Час відправки</label>
          <input
            type="time"
            value={form.time || '09:00'}
            onChange={e => setForm({ ...form, time: e.target.value })}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
          />
        </div>

        {/* Quick presets */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Швидкий вибір</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={setWeekdays}
              className="flex-1 py-2 rounded-lg text-xs font-semibold border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition"
            >
              Пн–Пт
            </button>
            <button
              type="button"
              onClick={setAllDays}
              className="flex-1 py-2 rounded-lg text-xs font-semibold border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition"
            >
              Щодня
            </button>
          </div>
        </div>
      </div>

      {/* Days of week */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2">Дні тижня</label>
        <div className="flex gap-1.5 flex-wrap">
          {DAY_LABELS.map(({ value, short }) => {
            const selected = (form.days || []).includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleDay(value)}
                className={`w-9 h-9 rounded-lg text-xs font-bold border transition ${
                  selected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >
                {short}
              </button>
            );
          })}
        </div>
        {(form.days || []).length === 0 && (
          <p className="text-[11px] text-red-500 mt-1">Оберіть хоча б один день</p>
        )}
      </div>

      {/* Enabled */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
        <span className="text-sm font-medium text-gray-700">Активне</span>
        <button
          type="button"
          onClick={() => setForm({ ...form, enabled: !form.enabled })}
          className="text-indigo-600 transition"
        >
          {form.enabled
            ? <ToggleRight className="w-7 h-7" />
            : <ToggleLeft className="w-7 h-7 text-gray-400" />
          }
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={isSaving || !form.label || !form.text || !form.time || !(form.days || []).length}
          onClick={() => onSave(form)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
        >
          {isSaving
            ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Check className="w-3.5 h-3.5" />
          }
          Зберегти
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition"
        >
          Скасувати
        </button>
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function AdminSettingsPanel() {
  const { state, updateSettings, currentUser } = useAppContext();
  const [expanded, setExpanded] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Announcements state
  const [announcements, setAnnouncements] = useState<ScheduledAnnouncement[]>([]);
  const [loadingAnns, setLoadingAnns] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Personal notifications state
  const DEFAULT_TEMPLATES: NotificationTemplates = {
    taskAssigned: '🎯 *Тобі призначено нову задачу!*\n\n📌 *{{taskTitle}}*\n📅 Дедлайн: {{deadline}}\n🗂 Проєкт: {{projectName}}',
    taskOverdue: '⚠️ *Задача протермінована!*\n\n📌 *{{taskTitle}}*\n📅 Дедлайн був: {{deadline}}\n⏰ Прострочено на {{daysOverdue}} дн.',
    dailyDigestHeader: '📋 *Твої задачі на сьогодні, {{assigneeName}}!*\n\n',
    dailyDigestItem: '🔹 *{{taskTitle}}* — до {{deadline}}\n',
  };
  const defaultPNSettings: PersonalNotificationSettings = {
    enabled: true,
    notifyOnAssign: true,
    notifyOnOverdue: true,
    dailyDigestEnabled: true,
    dailyDigestTime: '08:30',
    templates: DEFAULT_TEMPLATES,
  };
  const [pnSettings, setPnSettings] = useState<PersonalNotificationSettings>(
    state?.personalNotifications || defaultPNSettings
  );
  const [pnSaving, setPnSaving] = useState(false);
  const [pnSaveOk, setPnSaveOk] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // Parse existing cron to HH:mm
  useEffect(() => {
    if (state?.aiReportSchedule) {
      const parts = state.aiReportSchedule.split(' ');
      if (parts.length === 5) {
        const m = parts[0].padStart(2, '0');
        const h = parts[1].padStart(2, '0');
        if (!isNaN(Number(m)) && !isNaN(Number(h))) {
          setScheduleTime(`${h}:${m}`);
        }
      }
    }
  }, [state?.aiReportSchedule]);

  // Load announcements when expanded
  useEffect(() => {
    if (!expanded) return;
    setLoadingAnns(true);
    getAnnouncements()
      .then(setAnnouncements)
      .catch(() => setAnnouncements([]))
      .finally(() => setLoadingAnns(false));
  }, [expanded]);

  if (currentUser?.role !== 'admin') return null;

  const handleSaveAISchedule = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    const [h, m] = scheduleTime.split(':');
    const cronExpr = `${parseInt(m, 10)} ${parseInt(h, 10)} * * *`;
    updateSettings({ aiReportSchedule: cronExpr });
    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 800);
  };

  const handleCreateAnnouncement = async (data: Partial<ScheduledAnnouncement>) => {
    setFormSaving(true);
    try {
      const created = await createAnnouncement(data);
      setAnnouncements(prev => [...prev, created]);
      setIsAdding(false);
    } catch (err: any) {
      alert(err.message || 'Помилка створення');
    } finally {
      setFormSaving(false);
    }
  };

  const handleUpdateAnnouncement = async (id: string, data: Partial<ScheduledAnnouncement>) => {
    setFormSaving(true);
    try {
      await updateAnnouncement(id, data);
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, ...data } : a));
      setEditingId(null);
    } catch (err: any) {
      alert(err.message || 'Помилка оновлення');
    } finally {
      setFormSaving(false);
    }
  };

  const handleToggleEnabled = async (ann: ScheduledAnnouncement) => {
    try {
      await updateAnnouncement(ann.id, { enabled: !ann.enabled });
      setAnnouncements(prev => prev.map(a => a.id === ann.id ? { ...a, enabled: !a.enabled } : a));
    } catch (err: any) {
      alert(err.message || 'Помилка');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAnnouncement(id);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      setDeleteConfirmId(null);
    } catch (err: any) {
      alert(err.message || 'Помилка видалення');
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      await testAnnouncement(id);
      setTestResult({ id, ok: true });
    } catch {
      setTestResult({ id, ok: false });
    } finally {
      setTestingId(null);
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  const handleSavePersonalNotifications = async () => {
    setPnSaving(true);
    setPnSaveOk(false);
    try {
      // Use syncState-compatible approach via updateSettings
      const newState = { ...state, personalNotifications: pnSettings };
      await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify(newState),
      });
      setPnSaveOk(true);
      setTimeout(() => setPnSaveOk(false), 3000);
    } catch {
      alert('Помилка збереження');
    } finally {
      setPnSaving(false);
    }
  };

  return (
    <div className="mt-4 border border-indigo-100 rounded-xl overflow-hidden bg-indigo-50/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-indigo-50/60 transition"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/10 flex items-center justify-center">
            <Settings className="w-4 h-4 text-indigo-600" />
          </div>
          <span className="font-bold text-gray-800 text-sm">Налаштування системи</span>
          <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">Адмін</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-indigo-100 bg-white/60 p-5 space-y-5">

          {/* ── AI Report Schedule ─────────────────────────────── */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-gray-500" />
              Розклад ШІ-звіту
            </h4>
            <p className="text-xs text-gray-500 mb-3">Оберіть час, коли бот автоматично надсилатиме щоденний звіт у Telegram.</p>
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSaveAISchedule}
                disabled={isSaving}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition text-white ${
                  saveSuccess ? 'bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'
                } disabled:opacity-70`}
              >
                {isSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Check className="w-3.5 h-3.5" />
                }
                {saveSuccess ? 'Збережено' : 'Зберегти розклад'}
              </button>
            </div>
            {state?.aiReportSchedule && (
              <p className="text-[10px] text-gray-400 font-mono mt-2">Cron: {state.aiReportSchedule}</p>
            )}
          </div>

          {/* ── Scheduled Announcements ────────────────────────── */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-indigo-500" />
                Заплановані оголошення
              </h4>
              <span className="text-xs text-gray-400">Europe/Kyiv</span>
            </div>

            <div className="p-4 space-y-3">
              {loadingAnns ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {announcements.length === 0 && !isAdding && (
                    <p className="text-sm text-gray-400 text-center py-4 italic">
                      Немає оголошень. Додайте перше ↓
                    </p>
                  )}

                  {announcements.map(ann => (
                    <div key={ann.id}>
                      {editingId === ann.id ? (
                        <AnnouncementForm
                          initial={ann}
                          onSave={data => handleUpdateAnnouncement(ann.id, data)}
                          onCancel={() => setEditingId(null)}
                          isSaving={formSaving}
                        />
                      ) : (
                        <div className={`border rounded-xl p-3.5 transition ${ann.enabled ? 'border-indigo-100 bg-indigo-50/30' : 'border-gray-100 bg-gray-50/50 opacity-60'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-gray-800 text-sm">{ann.label}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ann.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {ann.enabled ? 'Активне' : 'Вимкнено'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                                <Clock className="w-3 h-3 shrink-0" />
                                {ann.time} · {formatDays(ann.days)}
                              </p>
                              <p className="text-xs text-gray-600 mt-2 bg-white border border-gray-100 rounded-lg px-2.5 py-2 font-mono leading-relaxed whitespace-pre-wrap line-clamp-3">
                                {ann.text}
                              </p>
                            </div>

                            {/* Actions column */}
                            <div className="flex flex-col items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleToggleEnabled(ann)}
                                title={ann.enabled ? 'Вимкнути' : 'Увімкнути'}
                                className="p-1.5 rounded-lg hover:bg-white transition text-gray-400 hover:text-indigo-600"
                              >
                                {ann.enabled
                                  ? <ToggleRight className="w-5 h-5 text-indigo-600" />
                                  : <ToggleLeft className="w-5 h-5" />
                                }
                              </button>
                              <button
                                onClick={() => { setEditingId(ann.id); setIsAdding(false); }}
                                title="Редагувати"
                                className="p-1.5 rounded-lg hover:bg-white transition text-gray-400 hover:text-indigo-600"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleTest(ann.id)}
                                disabled={testingId === ann.id}
                                title="Надіслати зараз"
                                className="p-1.5 rounded-lg hover:bg-white transition text-gray-400 hover:text-blue-600 disabled:opacity-50"
                              >
                                {testingId === ann.id
                                  ? <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                                  : <Send className="w-4 h-4" />
                                }
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(ann.id)}
                                title="Видалити"
                                className="p-1.5 rounded-lg hover:bg-white transition text-gray-400 hover:text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Test result */}
                          {testResult?.id === ann.id && (
                            <div className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${testResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                              {testResult.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                              {testResult.ok ? 'Повідомлення надіслано в Telegram!' : 'Помилка відправки. Перевірте токен бота.'}
                            </div>
                          )}

                          {/* Delete confirm */}
                          {deleteConfirmId === ann.id && (
                            <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                              <p className="text-xs text-red-700 font-medium">Видалити це оголошення?</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleDelete(ann.id)}
                                  className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition"
                                >
                                  Так, видалити
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="px-3 py-1 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition"
                                >
                                  Скасувати
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add form */}
                  {isAdding && (
                    <AnnouncementForm
                      initial={blankForm()}
                      onSave={handleCreateAnnouncement}
                      onCancel={() => setIsAdding(false)}
                      isSaving={formSaving}
                    />
                  )}

                  {/* Add button */}
                  {!isAdding && editingId === null && (
                    <button
                      onClick={() => { setIsAdding(true); setEditingId(null); }}
                      className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 rounded-xl transition font-medium text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Додати оголошення
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

          {/* ── Personal Notifications ────────────────────────────────────── */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-sky-600" />
                Персональні Telegram-сповіщення
              </h4>
              <button
                onClick={() => setPnSettings(s => ({ ...s, enabled: !s.enabled }))}
                className="text-sky-600 transition"
              >
                {pnSettings.enabled
                  ? <ToggleRight className="w-7 h-7" />
                  : <ToggleLeft className="w-7 h-7 text-gray-400" />
                }
              </button>
            </div>

            <div className={`p-4 space-y-4 ${!pnSettings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
              {/* Event toggles */}
              <div className="grid grid-cols-1 gap-2.5">
                <label className="flex items-center justify-between bg-sky-50/60 border border-sky-100 rounded-xl px-3.5 py-2.5 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-sky-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">🎯 Призначення задачі</p>
                      <p className="text-[11px] text-gray-500">Коли виконавцю призначають задачу</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setPnSettings(s => ({ ...s, notifyOnAssign: !s.notifyOnAssign }))}
                    className="text-sky-600"
                  >
                    {pnSettings.notifyOnAssign ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6 text-gray-300" />}
                  </button>
                </label>

                <label className="flex items-center justify-between bg-orange-50/60 border border-orange-100 rounded-xl px-3.5 py-2.5 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <AlarmClock className="w-4 h-4 text-orange-500" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">⚠️ Протерміновані задачі</p>
                      <p className="text-[11px] text-gray-500">Щоденне нагадування про прострочені задачі</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setPnSettings(s => ({ ...s, notifyOnOverdue: !s.notifyOnOverdue }))}
                    className="text-orange-500"
                  >
                    {pnSettings.notifyOnOverdue ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6 text-gray-300" />}
                  </button>
                </label>

                <label className="flex items-center justify-between bg-green-50/60 border border-green-100 rounded-xl px-3.5 py-2.5 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-green-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">📋 Щоденний дайджест</p>
                      <p className="text-[11px] text-gray-500">Особисті задачі на сьогодні кожному</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setPnSettings(s => ({ ...s, dailyDigestEnabled: !s.dailyDigestEnabled }))}
                    className="text-green-600"
                  >
                    {pnSettings.dailyDigestEnabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6 text-gray-300" />}
                  </button>
                </label>
              </div>

              {/* Digest time */}
              {pnSettings.dailyDigestEnabled && (
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-600 font-medium">Час дайджесту:</span>
                  <input
                    type="time"
                    value={pnSettings.dailyDigestTime}
                    onChange={e => setPnSettings(s => ({ ...s, dailyDigestTime: e.target.value }))}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-sky-400"
                  />
                  <span className="text-[10px] text-gray-400">Протерміновані надсилаються через 5 хв.</span>
                </div>
              )}

              {/* Template editor */}
              <div>
                <button
                  onClick={() => setShowTemplates(v => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-gray-800 transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {showTemplates ? 'Сприхнути шаблони' : 'Налаштувати шаблони повідомлень'}
                </button>

                {showTemplates && (
                  <div className="mt-3 space-y-3">
                    <div className="text-[10px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      <span className="font-bold">Доступні змінні:</span>{' '}
                      <code>{{taskTitle}}</code>{' '}·{' '}
                      <code>{{assigneeName}}</code>{' '}·{' '}
                      <code>{{deadline}}</code>{' '}·{' '}
                      <code>{{projectName}}</code>{' '}·{' '}
                      <code>{{daysOverdue}}</code>
                    </div>

                    {([
                      { key: 'taskAssigned', label: '🎯 Призначення задачі', hint: 'taskTitle, assigneeName, deadline, projectName' },
                      { key: 'taskOverdue', label: '⚠️ Протермінована задача', hint: 'taskTitle, deadline, daysOverdue' },
                      { key: 'dailyDigestHeader', label: '📋 Шапка дайджесту', hint: 'assigneeName' },
                      { key: 'dailyDigestItem', label: '🔹 Рядок задачі', hint: 'taskTitle, deadline' },
                    ] as { key: keyof NotificationTemplates; label: string; hint: string }[]).map(({ key, label, hint }) => (
                      <div key={key}>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                          {label}
                          <span className="ml-1 font-normal text-gray-400">({hint})</span>
                        </label>
                        <textarea
                          value={pnSettings.templates[key]}
                          onChange={e => setPnSettings(s => ({ ...s, templates: { ...s.templates, [key]: e.target.value } }))}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400 resize-y font-mono"
                        />
                        <button
                          onClick={() => setPnSettings(s => ({ ...s, templates: { ...s.templates, [key]: DEFAULT_TEMPLATES[key] } }))}
                          className="mt-1 text-[10px] text-gray-400 hover:text-gray-600 transition"
                        >
                          ↺ Повернути за замовчунням
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Save button */}
              <button
                onClick={handleSavePersonalNotifications}
                disabled={pnSaving}
                className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition text-white ${
                  pnSaveOk ? 'bg-green-600' : 'bg-sky-600 hover:bg-sky-700'
                } disabled:opacity-60`}
              >
                {pnSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Check className="w-3.5 h-3.5" />
                }
                {pnSaveOk ? 'Збережено ✅' : 'Зберегти налаштування'}
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

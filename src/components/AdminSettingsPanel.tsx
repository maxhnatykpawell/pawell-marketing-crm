import React, { useState, useEffect } from 'react';
import { useAppContext } from '../App';
import { Settings, ChevronDown, ChevronUp, Check, Clock } from 'lucide-react';

export default function AdminSettingsPanel() {
  const { state, updateSettings, currentUser } = useAppContext();
  const [expanded, setExpanded] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Parse existing cron to HH:mm
  useEffect(() => {
    if (state?.aiReportSchedule) {
      // Assuming format "M H * * *"
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

  if (currentUser?.role !== 'admin') return null;

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    
    // Convert HH:mm to cron "M H * * *"
    const [h, m] = scheduleTime.split(':');
    const cron = `${parseInt(m, 10)} ${parseInt(h, 10)} * * *`;
    
    updateSettings({ aiReportSchedule: cron });
    
    // Simulate network delay for UI feedback
    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 800);
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
        <div className="border-t border-indigo-100 bg-white/60 p-5 space-y-4">
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
                onClick={handleSave}
                disabled={isSaving}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition text-white ${
                  saveSuccess ? 'bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'
                } disabled:opacity-70`}
              >
                {isSaving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : saveSuccess ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                {saveSuccess ? 'Збережено' : 'Зберегти розклад'}
              </button>
            </div>
            
            {state?.aiReportSchedule && (
              <p className="text-[10px] text-gray-400 font-mono mt-2 flex items-center gap-1">
                Cron: {state.aiReportSchedule}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

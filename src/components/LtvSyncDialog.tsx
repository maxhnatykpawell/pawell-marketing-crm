import React, { useState } from 'react';
import { X, Loader2, AlertTriangle, Gem } from 'lucide-react';
import PeriodPicker, { PeriodKey, PeriodValue, makePeriod, describePeriod } from './PeriodPicker';

/** «Весь час» дає повні когорти; решта пресетів обрізає історію покупок */
const LTV_PRESETS: PeriodKey[] = ['all', 'ytd', 'year', 'custom'];

interface Props {
  onClose: () => void;
  onConfirm: (period: PeriodValue) => void;
  syncing: boolean;
  error?: string | null;
}

export default function LtvSyncDialog({ onClose, onConfirm, syncing, error }: Props) {
  const [period, setPeriod] = useState<PeriodValue>(() => makePeriod('all'));

  const isAllTime = period.key === 'all';
  const rangeIncomplete = !isAllTime && (!period.from || !period.to);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-black text-gray-800 flex items-center gap-2">
            <Gem className="w-5 h-5 text-purple-600" />
            Розрахунок LTV
          </h3>
          <button
            onClick={onClose}
            disabled={syncing}
            className="text-gray-400 hover:text-gray-600 transition disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Період вивантаження угод
            </p>
            <PeriodPicker
              value={period}
              onChange={setPeriod}
              presets={LTV_PRESETS}
              disabled={syncing}
            />
          </div>

          {isAllTime ? (
            <div className="flex gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-gray-400 mt-px" />
              <span>
                Тягне всі угоди за всю історію — може зайняти багато часу і навантажити CRM.
                Натомість когорти будуть повні, і LTV — коректний.
              </span>
            </div>
          ) : (
            <div className="flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500 mt-px" />
              <span>
                <strong>LTV буде занижений.</strong> Покупки поза періодом {describePeriod(period)} не
                потраплять у розрахунок, тож накопичений дохід клієнтів, які купували й раніше,
                виявиться обрізаним. Для коректного LTV беріть «Весь час».
              </span>
            </div>
          )}

          {error && (
            <div className="flex gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500 mt-px" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={syncing}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition disabled:opacity-40"
          >
            Скасувати
          </button>
          <button
            onClick={() => onConfirm(period)}
            disabled={syncing || rangeIncomplete}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing && <Loader2 className="w-4 h-4 animate-spin" />}
            {syncing ? 'Рахуємо...' : 'Порахувати'}
          </button>
        </div>

      </div>
    </div>
  );
}

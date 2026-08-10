import React, { useState, useEffect } from 'react';
import { format, subDays, startOfMonth, startOfYear } from 'date-fns';
import { AlertCircle } from 'lucide-react';

/**
 * Спільний вибір періоду. Використовується і на дашборді (вибір денних знімків),
 * і в синхронізації LTV (діапазон запиту до CRM), тому набір пресетів задається
 * ззовні через `presets` — компонент не знає, куди його вставили.
 */

export type PeriodKey =
  | 'today' | 'yesterday' | '7d' | '30d' | 'month'
  | 'ytd' | 'year' | 'all' | 'custom';

export interface PeriodValue {
  key: PeriodKey;
  /** YYYY-MM-DD; null означає «без нижньої межі» (тільки для 'all') */
  from: string | null;
  /** YYYY-MM-DD; null означає «без верхньої межі» (тільки для 'all') */
  to: string | null;
}

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today:     'Сьогодні',
  yesterday: 'Вчора',
  '7d':      '7 днів',
  '30d':     '30 днів',
  month:     'Місяць',
  ytd:       'З початку року',
  year:      'Цей рік',
  all:       'Весь час',
  custom:    'Довільно',
};

/** Межі періоду для пресету. Для 'custom' межі задає користувач, тож тут null. */
export function resolvePeriod(key: PeriodKey, now: Date = new Date()): { from: string | null; to: string | null } {
  const d = (x: Date) => format(x, 'yyyy-MM-dd');
  const today = d(now);

  switch (key) {
    case 'today':     return { from: today, to: today };
    case 'yesterday': { const y = d(subDays(now, 1)); return { from: y, to: y }; }
    case '7d':        return { from: d(subDays(now, 6)),  to: today };
    case '30d':       return { from: d(subDays(now, 29)), to: today };
    case 'month':     return { from: d(startOfMonth(now)), to: today };
    case 'ytd':       return { from: d(startOfYear(now)),  to: today };
    case 'year':      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    case 'all':       return { from: null, to: null };
    case 'custom':    return { from: null, to: null };
  }
}

/** Зібрати готове значення для пресету */
export function makePeriod(key: PeriodKey, now?: Date): PeriodValue {
  return { key, ...resolvePeriod(key, now) };
}

/** Людський підпис періоду — для заголовків і попереджень */
export function describePeriod(v: PeriodValue): string {
  if (v.key === 'all' || (!v.from && !v.to)) return 'за весь час';
  if (v.from && v.to && v.from === v.to) return v.from;
  return `${v.from ?? '…'} — ${v.to ?? '…'}`;
}

interface Props {
  value: PeriodValue;
  onChange: (next: PeriodValue) => void;
  /** Які пресети показувати; 'custom' вмикає поля з датами */
  presets: PeriodKey[];
  /**
   * Точність довільного діапазону. 'month' — коли дані існують лише помісячно
   * (аналітика клієнтів), інакше поля обіцяли б точність, якої немає.
   */
  granularity?: 'day' | 'month';
  /** Заблокувати вибір (напр. поки триває синхронізація) */
  disabled?: boolean;
  className?: string;
}

export default function PeriodPicker({
  value, onChange, presets, granularity = 'day', disabled, className = '',
}: Props) {
  const byMonth = granularity === 'month';
  /** 'YYYY-MM-DD' → 'YYYY-MM' для полів типу month */
  const toField = (v: string) => (byMonth ? v.slice(0, 7) : v);
  /** Назад: початок місяця для «з», кінець — для «до» */
  const fromField = (v: string, edge: 'from' | 'to') => {
    if (!byMonth || !v) return v;
    if (edge === 'from') return `${v}-01`;
    const [y, m] = v.split('-').map(Number);
    return `${v}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  };

  // Локальний стан полів: доки користувач друкує, діапазон може бути невалідним,
  // і повідомляти про такий назовні не варто.
  const [draftFrom, setDraftFrom] = useState(value.from ?? '');
  const [draftTo, setDraftTo]     = useState(value.to ?? '');

  useEffect(() => {
    setDraftFrom(value.from ?? '');
    setDraftTo(value.to ?? '');
  }, [value.from, value.to]);

  const isCustom = value.key === 'custom';
  const invalid = isCustom && !!draftFrom && !!draftTo && draftFrom > draftTo;

  const selectPreset = (key: PeriodKey) => {
    if (key === 'custom') {
      // Стартуємо довільний діапазон від того, що зараз показано — так користувач
      // бачить знайомі дати замість порожніх полів.
      const seed = value.from && value.to
        ? { from: value.from, to: value.to }
        : resolvePeriod('30d');
      onChange({ key: 'custom', from: seed.from, to: seed.to });
      return;
    }
    onChange(makePeriod(key));
  };

  const commitCustom = (from: string, to: string) => {
    if (!from || !to || from > to) return;
    onChange({ key: 'custom', from, to });
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5 flex-wrap">
        {presets.map(p => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => selectPreset(p)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed ${
              value.key === p
                ? 'bg-white text-violet-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {isCustom && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            з
            <input
              type={byMonth ? 'month' : 'date'}
              value={toField(draftFrom)}
              disabled={disabled}
              max={toField(draftTo) || undefined}
              onChange={e => {
                const v = fromField(e.target.value, 'from');
                setDraftFrom(v);
                commitCustom(v, draftTo);
              }}
              className="border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700 outline-none focus:border-violet-400 disabled:opacity-50"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            до
            <input
              type={byMonth ? 'month' : 'date'}
              value={toField(draftTo)}
              disabled={disabled}
              min={toField(draftFrom) || undefined}
              onChange={e => {
                const v = fromField(e.target.value, 'to');
                setDraftTo(v);
                commitCustom(draftFrom, v);
              }}
              className="border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700 outline-none focus:border-violet-400 disabled:opacity-50"
            />
          </label>

          {invalid && (
            <span className="flex items-center gap-1 text-[11px] text-red-500">
              <AlertCircle className="w-3 h-3" />
              Початок пізніше за кінець
            </span>
          )}
        </div>
      )}
    </div>
  );
}

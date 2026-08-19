/**
 * Вибір розділів, доступних людині або групі.
 *
 * Один компонент на всі три місця, де це налаштовується (створення групи,
 * редагування групи, персональні права користувача). Раніше та сама сітка
 * прапорців була скопійована тричі — і в усіх трьох копіях бракувало «Витрат».
 */

import React from 'react';
import { Check, Square, AlertTriangle } from 'lucide-react';
import { GRANTABLE_VIEWS, ALWAYS_ALLOWED_VIEWS, VIEWS } from '../lib/views';

interface Props {
  allowedViews: string[];
  onChange: (views: string[]) => void;
}

export default function AccessViewsPicker({ allowedViews, onChange }: Props) {
  const toggle = (id: string) => {
    onChange(
      allowedViews.includes(id)
        ? allowedViews.filter(v => v !== id)
        : [...allowedViews, id],
    );
  };

  const allIds = GRANTABLE_VIEWS.map(v => v.id);
  const allSelected = allIds.every(id => allowedViews.includes(id));

  const alwaysLabels = VIEWS
    .filter(v => ALWAYS_ALLOWED_VIEWS.includes(v.id))
    .map(v => v.label)
    .join(' і ');

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-semibold text-gray-500">Доступні розділи</label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(allIds)}
            disabled={allSelected}
            className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded transition disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Check className="w-3 h-3" /> Відкрити все
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={allowedViews.length === 0}
            className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded transition disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Square className="w-3 h-3" /> Зняти все
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {GRANTABLE_VIEWS.map(v => {
          const on = allowedViews.includes(v.id);
          return (
            <label
              key={v.id}
              title={v.hint}
              className={`flex items-start gap-2 text-sm px-2 py-1.5 rounded border cursor-pointer transition ${
                v.sensitive && on
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-gray-50 border-gray-100 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(v.id)}
                className="rounded text-indigo-600 focus:ring-indigo-500 mt-0.5 shrink-0"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1">
                  {v.label}
                  {v.sensitive && (
                    <AlertTriangle
                      className={`w-3 h-3 shrink-0 ${on ? 'text-amber-500' : 'text-gray-300'}`}
                    />
                  )}
                </span>
                {v.hint && (
                  <span className="block text-[10px] leading-snug opacity-70 mt-0.5">{v.hint}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {alwaysLabels && (
        <p className="text-[10px] text-gray-400 mt-2 leading-snug">
          {alwaysLabels} доступні всім і не потребують окремого дозволу.
        </p>
      )}
    </div>
  );
}

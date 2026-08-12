import React from 'react';
import { SlidersHorizontal, ChevronDown, ChevronUp, RotateCcw, AlertTriangle, Check, Loader2 } from 'lucide-react';
import {
  RfmThresholds, RFM_RULES, RFM_STYLES, DEFAULT_RFM_THRESHOLDS, checkRfmThresholds,
} from '../../lib/clientAnalytics';

const fmt = (n: number) => n.toLocaleString('uk-UA');

/**
 * Панель порогів сегментації.
 *
 * Сенс у тому, щоб «хто чемпіон» було рішенням команди, а не константою в коді:
 * «3 угоди за 90 днів» осмислене для швидких продажів і безглузде для довгого
 * циклу, і хто саме має рацію — видно лише з реальних чисел.
 *
 * Тому редагування працює як чернетка: пороги застосовуються до вибірки одразу,
 * а в спільний стан ідуть окремою дією. Так можна покрутити числа й подивитись,
 * куди поїхали сегменти, не нав'язавши проміжний варіант усій команді.
 */
export default function SegmentSettings({
  draft, onDraftChange, onSave, onReset, saved, saving, canEdit, counts, totalClients,
}: {
  /** Пороги, які зараз застосовані до вибірки (чернетка) */
  draft: RfmThresholds;
  onDraftChange: (next: RfmThresholds) => void;
  onSave: () => void;
  /** Повернути чернетку до збереженого командного варіанта */
  onReset: () => void;
  /** Збережений командний варіант — з ним порівнюємо чернетку */
  saved: RfmThresholds;
  saving: boolean;
  canEdit: boolean;
  /** Скільки клієнтів у кожному сегменті за поточної чернетки */
  counts: Record<string, number>;
  totalClients: number;
}) {
  const [open, setOpen] = React.useState(false);

  const dirty = (Object.keys(DEFAULT_RFM_THRESHOLDS) as (keyof RfmThresholds)[])
    .some(k => draft[k] !== saved[k]);
  const isDefault = (Object.keys(DEFAULT_RFM_THRESHOLDS) as (keyof RfmThresholds)[])
    .every(k => draft[k] === DEFAULT_RFM_THRESHOLDS[k]);

  const warnings = checkRfmThresholds(draft);

  const set = (key: keyof RfmThresholds, value: number) =>
    onDraftChange({ ...draft, [key]: value });

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="mx-auto w-full max-w-[1600px] px-6">
        <div className="flex flex-wrap items-center gap-3 py-2.5">
          <button
            onClick={() => setOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition ${
              open || dirty
                ? 'bg-purple-50 border-purple-200 text-purple-700'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Пороги сегментів
            {dirty && (
              <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                не збережено
              </span>
            )}
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <span className="text-xs text-gray-500">
            {isDefault
              ? 'Стандартні пороги — підлаштуйте під свій цикл угоди'
              : 'Пороги змінені під ваш цикл угоди'}
          </span>

          {/* Розклад по сегментах видно і згорнутим: це головний результат
              налаштування, і заради нього не варто відкривати панель. */}
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            {RFM_RULES.map(r => (
              <span
                key={r.label}
                title={`${r.label}: ${r.describe(draft)}`}
                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${RFM_STYLES[r.label].color}`}
              >
                {r.label} {fmt(counts[r.label] ?? 0)}
              </span>
            ))}
          </div>
        </div>

        {open && (
          <div className="pb-5 pt-1 space-y-3">
            <p className="text-xs text-gray-500">
              Правила перевіряються згори вниз, і перше, що спрацювало, забирає клієнта —
              тож «Чемпіон» завжди виграє в «Лояльного». Числа застосовуються до вибірки одразу;
              щоб їх побачила команда, натисніть «Зберегти для команди».
            </p>

            {warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1.5">
                {warnings.map((w, i) => (
                  <p key={i} className="flex items-start gap-2 text-xs text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              {RFM_RULES.map(rule => {
                const count = counts[rule.label] ?? 0;
                const pct = totalClients > 0 ? Math.round((count / totalClients) * 1000) / 10 : 0;
                return (
                  <div
                    key={rule.label}
                    className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2"
                  >
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${RFM_STYLES[rule.label].color}`}>
                      {rule.label}
                    </span>

                    <span className="text-xs text-gray-500 flex-1 min-w-[220px]">
                      {rule.describe(draft)}
                    </span>

                    {rule.fields.map(f => (
                      <label key={f.key} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        {f.label}
                        <input
                          type="number"
                          min={1}
                          disabled={!canEdit}
                          value={draft[f.key]}
                          onChange={e => set(f.key, Math.max(1, Math.round(Number(e.target.value) || 1)))}
                          className="w-20 border border-gray-200 rounded-md px-2 py-1 text-xs outline-none focus:border-purple-400 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                        />
                        {f.unit}
                      </label>
                    ))}

                    <span className="text-xs whitespace-nowrap w-32 text-right">
                      <strong className="text-gray-800">{fmt(count)}</strong>
                      <span className="text-gray-400"> клієнтів · {pct}%</span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={onSave}
                disabled={!canEdit || !dirty || saving}
                title={canEdit ? 'Зробити ці пороги спільними для всієї команди' : 'Потрібні права на редагування'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Зберегти для команди
              </button>

              <button
                onClick={onReset}
                disabled={!dirty}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Відкотити до збереженого
              </button>

              <button
                onClick={() => onDraftChange({ ...DEFAULT_RFM_THRESHOLDS })}
                disabled={isDefault}
                className="px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Стандартні значення
              </button>

              {!canEdit && (
                <span className="text-xs text-gray-400">
                  Ви можете крутити числа для себе, але зберегти їх для команди — ні.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

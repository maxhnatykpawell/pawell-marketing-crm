import React, { useMemo, useState } from 'react';
import { X, Save, Calculator, AlertTriangle, RefreshCw } from 'lucide-react';
import { PayrollDocument } from '../../types';
import {
  PayrollModule,
  PayrollTemplate,
  describeModule,
  evaluateModules,
  hasOwnInput,
  initialValues,
} from '../../lib/payrollEngine';
import { useAppContext } from '../../App';
import { format } from 'date-fns';

interface PayrollFormProps {
  initialData?: PayrollDocument | null;
  /** Поточний шаблон посади — за ним створюється новий документ */
  template: PayrollTemplate;
  /** Шаблон, за яким має рахуватися відкритий документ (його знімок) */
  documentTemplate: PayrollTemplate;
  initialValuesFromDoc?: Record<string, number>;
  userId: string;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (doc: Omit<PayrollDocument, 'id' | 'createdAt'>) => Promise<void>;
}

const formatMoney = (val: number) =>
  Math.round(val).toLocaleString('uk-UA');

/** Число з двома знаками, коли воно не ціле: оклад за годину рідко буває рівним */
const formatNumber = (val: number) =>
  Number.isInteger(val) ? val.toLocaleString('uk-UA') : val.toFixed(2);

/** Колірна схема секцій — тон лівої полоски-акценту та фон підсумкового рядка */
const SECTION_ACCENT: Record<string, { border: string; totalBg: string; totalText: string }> = {
  neutral: { border: 'border-l-blue-400', totalBg: 'bg-blue-50/60', totalText: 'text-blue-900' },
  income:  { border: 'border-l-emerald-400', totalBg: 'bg-emerald-50/60', totalText: 'text-emerald-900' },
  deduction: { border: 'border-l-rose-400', totalBg: 'bg-rose-50/60', totalText: 'text-rose-900' },
};

export const PayrollForm: React.FC<PayrollFormProps> = ({
  initialData,
  template,
  documentTemplate,
  initialValuesFromDoc,
  userId,
  readOnly = false,
  onClose,
  onSave,
}) => {
  const currentMonth = format(new Date(), 'yyyy-MM');
  const { state } = useAppContext();
  const user = state.users.find((u) => u.id === userId);

  const [period, setPeriod] = useState(initialData?.period || currentMonth);
  /**
   * Документ рахується за власним шаблоном, а не за поточним: зміна ставки
   * в грудні не має переписувати вже виплачений жовтень. Оновлення — окрема
   * свідома дія через кнопку нижче.
   */
  const [activeTemplate, setActiveTemplate] = useState<PayrollTemplate>(
    initialData ? documentTemplate : template
  );
  const [values, setValues] = useState<Record<string, number>>(() =>
    initialData ? { ...initialValuesFromDoc } : initialValues(template.modules)
  );
  const [isSaving, setIsSaving] = useState(false);

  const result = useMemo(
    () => evaluateModules(activeTemplate.modules, values),
    [activeTemplate, values]
  );

  const byKey = useMemo(
    () => new Map(activeTemplate.modules.map((m) => [m.key, m])),
    [activeTemplate]
  );

  /**
   * Документ відстав від поточного шаблону — або бо шаблон відтоді правили,
   * або бо документ узагалі старший за модульну систему.
   */
  const outdated =
    !!initialData &&
    activeTemplate.id !== template.id
      ? 'other'
      : !!initialData && JSON.stringify(template.modules) !== JSON.stringify(activeTemplate.modules)
      ? 'changed'
      : null;
  const isPreModular = !!initialData && !initialData.templateId;

  const sections = useMemo(() => {
    const used = new Set(activeTemplate.modules.map((m) => m.sectionId));
    const known = [...activeTemplate.sections].sort((a, b) => a.order - b.order);
    // Модулі з невідомою секцією не мають зникати з документа
    const orphanIds = [...used].filter((id) => !known.some((s) => s.id === id));
    return [
      ...known,
      ...orphanIds.map((id, i) => ({ id, title: 'Інше', order: 900 + i, tone: 'neutral' as const })),
    ].filter((s) => used.has(s.id));
  }, [activeTemplate]);

  const setValue = (key: string, raw: string) => {
    setValues((prev) => ({ ...prev, [key]: raw === '' ? 0 : Number(raw) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    setIsSaving(true);
    try {
      await onSave({
        userId,
        period,
        templateId: activeTemplate.id,
        templateSnapshot: activeTemplate,
        values,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const renderModule = (m: PayrollModule, isLast: boolean) => {
    const amount = result.amounts[m.key] || 0;
    const issue = result.issues.find((i) => i.key === m.key);
    const showsInput = hasOwnInput(m);
    // У «input» введене число і є сумою, але для наочності (якщо це дохід/відрахування)
    // краще виводити його і в колонці підсумків, щоб воно візуально додавалося до загальної суми секції.
    const showsAmount = m.kind !== 'input' || m.role !== 'info';
    // Формула може рахувати не гроші (відсоток виконання, коефіцієнт) — тоді
    // одиниця в модулі підказує, що ₴ дописувати не треба.
    // Але коли у формули є власне поле, одиниця описує саме те, що вводять
    // (години), а порахований результат — усе одно гроші.
    const isMoney = m.kind !== 'formula' || showsInput || !m.unit || m.unit === '₴';

    return (
      <div
        key={m.id}
        className={`flex items-center gap-4 py-3 px-4 transition-colors hover:bg-gray-50/80 ${
          !isLast ? 'border-b border-gray-100' : ''
        }`}
      >
        {/* Назва та підказка */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-700 leading-snug">{m.label}</div>
          {(m.hint || m.kind !== 'input') && (
            <div className="text-[11px] text-gray-400 leading-tight mt-0.5 truncate">
              {m.hint || describeModule(m, byKey)}
            </div>
          )}
          {issue && (
            <div className="text-[11px] text-red-500 flex items-center gap-1 mt-0.5">
              <AlertTriangle size={11} /> {issue.message}
            </div>
          )}
        </div>

        {/* Поле вводу */}
        <div className="w-28 shrink-0">
          {showsInput ? (
            <div className="relative">
              <input
                type="number"
                step="any"
                disabled={readOnly}
                value={values[m.key] ?? ''}
                onChange={(e) => setValue(m.key, e.target.value)}
                className="w-full pl-3 pr-10 py-1.5 text-right text-sm border border-gray-200 rounded-lg bg-white
                  disabled:bg-gray-50 disabled:text-gray-500
                  focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400
                  transition-all"
                placeholder="0"
              />
              <span 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none max-w-[45px] truncate text-right"
                title={m.kind === 'percent' ? '%' : m.unit || ''}
              >
                {m.kind === 'percent' ? '%' : m.unit || ''}
              </span>
            </div>
          ) : null}
        </div>

        {/* Порахована сума */}
        <div className="w-28 text-right shrink-0">
          {showsAmount && (
            <span
              className={`text-sm font-semibold tabular-nums ${
                amount < 0 ? 'text-rose-600' : 'text-gray-800'
              }`}
            >
              {isMoney
                ? `${formatMoney(amount)} ₴`
                : `${formatNumber(amount)} ${m.unit}`}
            </span>
          )}
        </div>
      </div>
    );
  };

  const structuralIssues = result.issues.filter((i) => !byKey.has(i.key));

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 mx-4 flex flex-col"
        style={{ maxHeight: 'calc(100vh - 4rem)' }}
      >
        {/* ─── Шапка ─────────────────────────────────────────────────── */}
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-start sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Calculator size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                Зарплатний документ
              </h2>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                {user?.avatar && (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-4 h-4 rounded-full object-cover ring-1 ring-gray-200"
                  />
                )}
                {user?.name && <span className="font-medium text-gray-600">{user.name}</span>}
                <span className="text-gray-300">·</span>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[11px] font-medium">
                  {activeTemplate.name}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ─── Тіло ──────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="px-6 py-5 space-y-5">
            {/* Місяць */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-600">Місяць та рік</label>
              <input
                type="month"
                value={period}
                disabled={readOnly}
                onChange={(e) => setPeriod(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400
                  disabled:bg-gray-50 transition-all"
                required
              />
            </div>

            {/* Попередження про застарілий шаблон */}
            {outdated && !readOnly && (
              <div className="flex items-center justify-between gap-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-sm text-amber-800">
                  <span className="font-medium">
                    {isPreModular
                      ? 'Документ створено ще за старою схемою.'
                      : outdated === 'other'
                      ? 'Працівнику призначено іншу посаду.'
                      : 'Шаблон посади змінився після створення документа.'}
                  </span>{' '}
                  Він і далі рахується як був — щоб не переписати вже виплачений місяць. Переведення на
                  «{template.name}» перенесе введені числа за збігом ключів; те, чого в новому шаблоні
                  немає, зникне з документа.
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTemplate(template)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-amber-300 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-100 shrink-0"
                >
                  <RefreshCw size={14} />
                  Перевести
                </button>
              </div>
            )}

            {/* Структурні помилки */}
            {structuralIssues.length > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1">
                {structuralIssues.map((i, idx) => (
                  <div key={idx} className="text-sm text-red-700 flex items-center gap-2">
                    <AlertTriangle size={14} /> {i.message}
                  </div>
                ))}
              </div>
            )}

            {/* Порожній шаблон */}
            {activeTemplate.modules.length === 0 && (
              <div className="py-12 text-center text-gray-500 border border-dashed border-gray-200 rounded-2xl">
                <p className="font-medium text-gray-600">У шаблоні «{activeTemplate.name}» немає модулів</p>
                <p className="text-sm mt-1">Додайте їх у Налаштування → Шаблони посад</p>
              </div>
            )}

            {/* ─── Секції — одна під одною ────────────────────────── */}
            {sections.map((section) => {
              const accent = SECTION_ACCENT[section.tone || 'neutral'] || SECTION_ACCENT.neutral;
              const modules = activeTemplate.modules
                .filter((m) => m.sectionId === section.id)
                .sort((a, b) => a.order - b.order);
              const sectionTotal = modules
                .filter((m) => m.role !== 'info')
                .reduce((s, m) => s + (result.amounts[m.key] || 0), 0);
              const hasTotal = modules.some((m) => m.role !== 'info');

              return (
                <div key={section.id} className="space-y-0">
                  {/* Заголовок секції */}
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 px-4 pb-2">
                    {section.title}
                  </h3>

                  {/* Карточка секції */}
                  <div
                    className={`rounded-xl border border-gray-200/80 bg-white overflow-hidden
                      border-l-[3px] ${accent.border} shadow-sm`}
                  >
                    {modules.map((m, idx) => renderModule(m, idx === modules.length - 1 && !hasTotal))}

                    {/* Підсумок секції */}
                    {hasTotal && (
                      <div
                        className={`flex items-center justify-between px-4 py-3
                          border-t border-gray-100 ${accent.totalBg}`}
                      >
                        <span className={`text-sm font-semibold ${accent.totalText}`}>
                          Разом у секції
                        </span>
                        <span className={`text-base font-bold tabular-nums ${accent.totalText}`}>
                          {formatMoney(sectionTotal)} ₴
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── Підсумкова панель ────────────────────────────────── */}
          <div className="sticky bottom-0 bg-gradient-to-t from-white via-white to-white/95 px-6 pt-3 pb-5 space-y-4">
            {/* Зведення */}
            <div className="flex items-stretch gap-3">
              <div className="flex-1 rounded-xl bg-emerald-50 border border-emerald-200/60 px-4 py-3 text-center">
                <div className="text-[11px] uppercase tracking-wide font-medium text-emerald-600/80">
                  Нараховано
                </div>
                <div className="text-lg font-bold text-emerald-700 tabular-nums mt-0.5">
                  {formatMoney(result.income)} ₴
                </div>
              </div>
              <div className="flex-1 rounded-xl bg-rose-50 border border-rose-200/60 px-4 py-3 text-center">
                <div className="text-[11px] uppercase tracking-wide font-medium text-rose-600/80">
                  Відрахування
                </div>
                <div className="text-lg font-bold text-rose-700 tabular-nums mt-0.5">
                  {formatMoney(result.deductions)} ₴
                </div>
              </div>
              <div className="flex-[1.3] rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 px-4 py-3 text-center shadow-lg">
                <div className="text-[11px] uppercase tracking-wide font-medium text-gray-400">
                  До виплати
                </div>
                <div className="text-xl font-bold text-white tabular-nums mt-0.5">
                  {formatMoney(result.balance)} ₴
                </div>
              </div>
            </div>

            {/* Кнопки */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl
                  hover:bg-gray-50 hover:border-gray-300 transition-all"
              >
                {readOnly ? 'Закрити' : 'Скасувати'}
              </button>
              {!readOnly && (
                <button
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2 text-sm text-white font-medium rounded-xl
                    bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700
                    shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50"
                >
                  <Save size={16} />
                  {isSaving ? 'Збереження…' : 'Зберегти документ'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

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

const TONE_STYLES: Record<string, { card: string; head: string; divider: string }> = {
  neutral: { card: 'bg-blue-50/50 border-blue-100', head: 'text-gray-800', divider: 'border-blue-200' },
  income: { card: 'bg-green-50/50 border-green-100', head: 'text-gray-800', divider: 'border-green-200' },
  deduction: { card: 'bg-red-50/50 border-red-100', head: 'text-gray-800', divider: 'border-red-200' },
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

  const renderModule = (m: PayrollModule) => {
    const amount = result.amounts[m.key] || 0;
    const issue = result.issues.find((i) => i.key === m.key);
    const showsInput = hasOwnInput(m);
    // У «input» введене число і є сумою — другий раз його показувати нема сенсу
    const showsAmount = m.kind !== 'input';
    // Формула може рахувати не гроші (відсоток виконання, коефіцієнт) — тоді
    // одиниця в модулі підказує, що ₴ дописувати не треба
    const isMoney = m.kind !== 'formula' || !m.unit || m.unit === '₴';

    return (
      <div key={m.id} className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <label className="text-gray-700 block leading-snug">{m.label}</label>
          {(m.hint || m.kind !== 'input') && (
            <span className="text-xs text-gray-400 block">{m.hint || describeModule(m, byKey)}</span>
          )}
          {issue && (
            <span className="text-xs text-red-500 flex items-center gap-1 mt-0.5">
              <AlertTriangle size={12} /> {issue.message}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {showsInput ? (
            <div className="relative w-24">
              <input
                type="number"
                step="any"
                disabled={readOnly}
                value={values[m.key] ?? ''}
                onChange={(e) => setValue(m.key, e.target.value)}
                className="w-full pl-3 pr-7 py-1.5 text-right border border-gray-300 rounded-lg bg-white disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="0"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">
                {m.kind === 'percent' ? '%' : m.unit || ''}
              </span>
            </div>
          ) : (
            <div className="w-24" />
          )}

          <span className={`w-28 text-right font-medium ${amount < 0 ? 'text-red-600' : 'text-gray-700'}`}>
            {showsAmount
              ? isMoney
                ? `${formatMoney(amount)} ₴`
                : `${formatNumber(amount)} ${m.unit}`
              : ''}
          </span>
        </div>
      </div>
    );
  };

  const structuralIssues = result.issues.filter((i) => !byKey.has(i.key));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl my-8 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
              <Calculator size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-800 uppercase">Зарплатний документ</h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                {user?.avatar && (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-5 h-5 rounded-full object-cover border border-gray-200"
                  />
                )}
                {user?.name && <span>{user.name}</span>}
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                  {activeTemplate.name}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="font-medium text-gray-700">Місяць та рік:</label>
            <input
              type="month"
              value={period}
              disabled={readOnly}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:bg-gray-50"
              required
            />
          </div>

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

          {structuralIssues.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1">
              {structuralIssues.map((i, idx) => (
                <div key={idx} className="text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle size={14} /> {i.message}
                </div>
              ))}
            </div>
          )}

          {activeTemplate.modules.length === 0 && (
            <div className="py-12 text-center text-gray-500 border border-dashed border-gray-200 rounded-2xl">
              <p className="font-medium text-gray-600">У шаблоні «{activeTemplate.name}» немає модулів</p>
              <p className="text-sm mt-1">Додайте їх у Налаштування → Шаблони посад</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {sections.map((section) => {
              const tone = TONE_STYLES[section.tone || 'neutral'];
              const modules = activeTemplate.modules
                .filter((m) => m.sectionId === section.id)
                .sort((a, b) => a.order - b.order);
              const sectionTotal = modules
                .filter((m) => m.role !== 'info')
                .reduce((s, m) => s + (result.amounts[m.key] || 0), 0);
              const hasTotal = modules.some((m) => m.role !== 'info');

              return (
                <div key={section.id} className="space-y-3">
                  <h3 className={`font-semibold pb-2 border-b ${tone.head}`}>{section.title}</h3>
                  <div className={`rounded-xl p-4 space-y-4 border ${tone.card}`}>
                    {modules.map(renderModule)}
                    {hasTotal && (
                      <div className={`flex justify-between items-center pt-3 border-t ${tone.divider}`}>
                        <span className="font-semibold text-gray-800">Разом у секції</span>
                        <span className="font-bold text-lg">{formatMoney(sectionTotal)} ₴</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap justify-end items-center gap-4 pt-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Нараховано:</span>
              <span className="font-semibold text-gray-900">{formatMoney(result.income)} ₴</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Відрахування:</span>
              <span className="font-semibold text-gray-900">{formatMoney(result.deductions)} ₴</span>
            </div>
            <div className="flex items-center gap-6 bg-gray-900 text-white px-8 py-4 rounded-xl shadow-lg">
              <span className="text-xl uppercase tracking-wider">Баланс</span>
              <span className="text-3xl font-bold">{formatMoney(result.balance)} ₴</span>
            </div>
          </div>
        </form>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-2xl sticky bottom-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            {readOnly ? 'Закрити' : 'Скасувати'}
          </button>
          {!readOnly && (
            <button
              onClick={handleSubmit}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              <Save size={18} />
              {isSaving ? 'Збереження...' : 'Зберегти документ'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import {
  BALANCE_VAR,
  DEDUCTIONS_VAR,
  INCOME_VAR,
  PayrollModule,
  PayrollStep,
  PayrollStepOp,
  hasOwnInput,
  stepsToFormula,
} from '../../lib/payrollEngine';

/**
 * Збирання формули кроками замість набору виразу.
 *
 * Кроки виконуються згори вниз: узяли перший модуль, додали другий, помножили
 * на число. Старшинства операцій тут немає навмисно — у зарплаті воно лише дає
 * тихо помилитись, а порядок «як написано» видно оком.
 *
 * Компонент не зберігає кроки: на кожну зміну він віддає готовий рядок формули,
 * і саме рядок лишається тим, що зберігається й рахується. Тому вийти в
 * текстовий режим можна будь-коли, нічого не втративши.
 *
 * Стан кроків тримається всередині, бо недозаповнений крок («+ …» без обраного
 * модуля) у формулу не потрапляє — інакше рядок, який щойно почали додавати,
 * зникав би під руками.
 */

const OP_LABELS: Record<PayrollStepOp, string> = {
  '+': '+  додати',
  '-': '−  відняти',
  '*': '×  помножити на',
  '/': '÷  поділити на',
};

const OPS: PayrollStepOp[] = ['+', '-', '*', '/'];

/** Значення селекта, яке означає «тут буде число, а не модуль» */
const NUMBER_OPTION = '__number__';

const selectCls =
  'px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/50';

export interface FormulaBuilderProps {
  /** Кроки, з яких стартуємо; далі компонент веде їх сам */
  initialSteps: PayrollStep[];
  /** Інші модулі шаблону — з них складається список вибору */
  modules: PayrollModule[];
  onChange: (formula: string) => void;
}

const FormulaBuilder: React.FC<FormulaBuilderProps> = ({ initialSteps, modules, onChange }) => {
  const [steps, setSteps] = useState<PayrollStep[]>(initialSteps);

  const apply = (next: PayrollStep[]) => {
    // Перший крок ніколи не має операції — інакше формула почнеться з «+»
    const normalized = next.map((s, i) => (i === 0 ? { ...s, op: null } : { ...s, op: s.op ?? '+' }));
    setSteps(normalized);
    onChange(stepsToFormula(normalized));
  };

  const patch = (index: number, change: Partial<PayrollStep>) =>
    apply(steps.map((s, i) => (i === index ? { ...s, ...change } : s)));

  const addStep = () =>
    apply([...steps, { op: steps.length === 0 ? null : '+', operand: { kind: 'ref', key: '' } }]);

  const removeStep = (index: number) => apply(steps.filter((_, i) => i !== index));

  const moveStep = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    apply(next);
  };

  /** Модулі з власним полем вводу мають ще й «кількість» — це `ключ.n` */
  const countable = modules.filter(hasOwnInput);

  const formula = stepsToFormula(steps);

  return (
    <div className="space-y-2">
      {steps.length === 0 && (
        <p className="text-xs text-gray-400">
          Порожньо. Додайте перший крок — з нього почнеться обчислення.
        </p>
      )}

      {steps.map((step, i) => {
        const isNumber = step.operand.kind === 'number';
        const selectValue = isNumber ? NUMBER_OPTION : step.operand.key;

        return (
          <div key={i} className="flex items-center gap-2 flex-wrap">
            {/* Перший крок задає, з чого починаємо; решта — що з цим робимо */}
            {i === 0 ? (
              <span className="text-xs font-medium text-gray-500 w-[152px] shrink-0">Почати з</span>
            ) : (
              <select
                className={`${selectCls} w-[152px] shrink-0`}
                value={step.op ?? '+'}
                onChange={(e) => patch(i, { op: e.target.value as PayrollStepOp })}
              >
                {OPS.map((op) => (
                  <option key={op} value={op}>{OP_LABELS[op]}</option>
                ))}
              </select>
            )}

            <select
              className={`${selectCls} flex-1 min-w-[180px] ${!isNumber && !step.operand.key ? 'border-amber-400 bg-amber-50' : ''}`}
              value={selectValue}
              onChange={(e) => {
                const v = e.target.value;
                patch(i, {
                  operand: v === NUMBER_OPTION
                    ? { kind: 'number', value: 0 }
                    : { kind: 'ref', key: v },
                });
              }}
            >
              <option value="">— оберіть —</option>
              {modules.length > 0 && (
                <optgroup label="Модулі">
                  {modules.map((mod) => (
                    <option key={mod.id} value={mod.key}>{mod.label}</option>
                  ))}
                </optgroup>
              )}
              {countable.length > 0 && (
                <optgroup label="Введені числа (не сума)">
                  {countable.map((mod) => (
                    <option key={`${mod.id}.n`} value={`${mod.key}.n`}>
                      {mod.label}: кількість
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Підсумки">
                <option value={INCOME_VAR}>Усі нарахування</option>
                <option value={DEDUCTIONS_VAR}>Усі відрахування</option>
                <option value={BALANCE_VAR}>До виплати</option>
              </optgroup>
              <optgroup label="Інше">
                <option value={NUMBER_OPTION}>Число…</option>
              </optgroup>
            </select>

            {isNumber && (
              <input
                type="number"
                step="any"
                className={`${selectCls} w-28 shrink-0`}
                value={step.operand.value}
                onChange={(e) =>
                  patch(i, { operand: { kind: 'number', value: Number(e.target.value) || 0 } })
                }
              />
            )}

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => moveStep(i, -1)}
                disabled={i === 0}
                title="Вище"
                className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-400"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => moveStep(i, 1)}
                disabled={i === steps.length - 1}
                title="Нижче"
                className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-400"
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => removeStep(i)}
                title="Прибрати крок"
                className="p-1.5 text-gray-400 hover:text-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addStep}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition"
      >
        <Plus size={14} /> Додати крок
      </button>

      {/* Готовий вираз показуємо завжди: конструктор не має бути чорною
          скринькою, а той, хто звик до формул, одразу бачить звичний рядок. */}
      {formula && (
        <div className="text-xs text-gray-500 pt-1">
          Вийде: <code className="px-1.5 py-0.5 bg-gray-100 rounded font-mono text-gray-700">{formula}</code>
        </div>
      )}
    </div>
  );
};

export default FormulaBuilder;

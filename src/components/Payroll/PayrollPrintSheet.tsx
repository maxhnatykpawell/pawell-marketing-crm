import React from 'react';
import { PayrollTemplate, evaluateModules, hasOwnInput } from '../../lib/payrollEngine';

const formatMoney = (val: number) => Math.round(val).toLocaleString('uk-UA');

const formatNumber = (val: number) =>
  Number.isInteger(val) ? val.toLocaleString('uk-UA') : val.toFixed(2);

interface PayrollPrintSheetProps {
  userName?: string;
  period: string;
  template: PayrollTemplate;
  values: Record<string, number>;
  /** Починати з нової сторінки — для зведеного PDF з кількох працівників */
  pageBreak?: boolean;
}

/** Друкований вигляд одного зарплатного документа (для PDF) */
export const PayrollPrintSheet: React.FC<PayrollPrintSheetProps> = ({
  userName,
  period,
  template,
  values,
  pageBreak = false,
}) => {
  const result = evaluateModules(template.modules, values);

  const used = new Set(template.modules.map((m) => m.sectionId));
  const known = [...template.sections].sort((a, b) => a.order - b.order);
  const orphanIds = [...used].filter((id) => !known.some((s) => s.id === id));
  const sections = [
    ...known,
    ...orphanIds.map((id, i) => ({ id, title: 'Інше', order: 900 + i })),
  ].filter((s) => used.has(s.id));

  return (
    <div
      className="p-10 text-gray-900"
      style={{ fontFamily: 'sans-serif', breakBefore: pageBreak ? 'page' : undefined }}
    >
      <h1 className="text-2xl font-bold">Зарплатний документ</h1>
      <p className="text-sm text-gray-600 mt-1">
        {userName} · {template.name} · {period}
      </p>
      {sections.map((section) => {
        const modules = template.modules
          .filter((m) => m.sectionId === section.id)
          .sort((a, b) => a.order - b.order);
        const total = modules
          .filter((m) => m.role !== 'info')
          .reduce((sum, m) => sum + (result.amounts[m.key] || 0), 0);
        return (
          <table key={section.id} className="w-full mt-6 text-sm border-collapse" style={{ breakInside: 'avoid' }}>
            <thead>
              <tr>
                <th colSpan={2} className="text-left text-xs uppercase tracking-wider text-gray-500 pb-1 border-b-2 border-gray-300">
                  {section.title}
                </th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => {
                const amount = result.amounts[m.key] || 0;
                const isMoney = m.kind !== 'formula' || hasOwnInput(m) || !m.unit || m.unit === '₴';
                return (
                  <tr key={m.id} className="border-b border-gray-200">
                    <td className="py-1.5 pr-4">{m.label}</td>
                    <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
                      {isMoney ? `${formatMoney(amount)} ₴` : `${formatNumber(amount)} ${m.unit}`}
                    </td>
                  </tr>
                );
              })}
              {modules.some((m) => m.role !== 'info') && (
                <tr className="font-semibold">
                  <td className="py-1.5">Разом у секції</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(total)} ₴</td>
                </tr>
              )}
            </tbody>
          </table>
        );
      })}
      <div className="mt-8 pt-4 border-t-2 border-gray-800 space-y-1 text-sm" style={{ breakInside: 'avoid' }}>
        <div className="flex justify-between"><span>Нараховано</span><span>{formatMoney(result.income)} ₴</span></div>
        <div className="flex justify-between"><span>Відрахування</span><span>{formatMoney(result.deductions)} ₴</span></div>
        <div className="flex justify-between text-lg font-bold"><span>До виплати</span><span>{formatMoney(result.balance)} ₴</span></div>
      </div>
    </div>
  );
};

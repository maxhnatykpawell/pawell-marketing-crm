import React, { useMemo, useState } from 'react';
import { Settings, Plus, FileText, User as UserIcon, Trash2, Layers } from 'lucide-react';
import { useAppContext } from '../../App';
import { PayrollSettingsModal } from './PayrollSettingsModal';
import { PayrollForm } from './PayrollForm';
import { PayrollDocument, PayrollSettings } from '../../types';
import { evaluateModules } from '../../lib/payrollEngine';
import { documentView, templateForUser } from '../../lib/payrollTemplates';

/**
 * Старі підписи лишаються за замовчуванням: за ними читаються документи,
 * створені до модульних шаблонів.
 */
const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  labels: {
    baseSalary: 'Ставка',
    workingDaysInMonth: 'Кількість робочих днів в місяці',
    salaryPerDay: 'Оклад за 1 день',
    salaryPerHour: 'Оклад за 1 годину',
    workedDays: 'Відпрацьованих днів',
    paidVacationDays: 'Днів у оплачуваній відпустці',
    overtimeHours: 'Кількість понаднормових годин',
    businessTripDays: 'Кількість днів у відрядженні',
    teamBonus: 'Командний бонус',
    additionalActivity: 'Додаткова діяльність',
    sum: 'Сума',
    tax: 'Податок',
    amountReceived: 'Сума яка прийшла на карту',
    companyDebts: 'Будь які види боргів перед компанією',
    balance: 'Баланс',
  },
  customBonuses: [],
  customDeductions: [],
  templates: [],
  assignments: {},
};

export const PayrollView: React.FC = () => {
  const {
    state,
    currentUser,
    addPayroll,
    updatePayroll,
    deletePayroll,
    updatePayrollSettings,
    confirmAction,
  } = useAppContext();

  const isAdmin = currentUser?.role === 'admin';
  const payrolls = state.payrolls || [];
  const effectiveSettings = state.payrollSettings || DEFAULT_PAYROLL_SETTINGS;

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<PayrollDocument | null | undefined>(undefined);
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser?.userId || '');

  const targetUserId = isAdmin ? selectedUserId : currentUser?.userId || '';

  const handleSaveDoc = async (doc: Omit<PayrollDocument, 'id' | 'createdAt'>) => {
    if (editingDoc) {
      await updatePayroll(editingDoc.id, doc);
    } else {
      await addPayroll(doc);
    }
  };

  const handleDeleteDoc = (docId: string) => {
    confirmAction('Ви дійсно хочете видалити цей зарплатний документ?', () => {
      deletePayroll(docId);
    });
  };

  /** Кожен документ рахується за власним шаблоном — своїм знімком або старою схемою */
  const summarize = (doc: PayrollDocument) => {
    const { template, values } = documentView(doc, effectiveSettings);
    const result = evaluateModules(template.modules, values);
    return { ...result, templateName: template.name };
  };

  const visiblePayrolls = payrolls.filter((p) => p.userId === targetUserId);

  /** Поточний шаблон посади — за ним створюється новий документ */
  const current = useMemo(
    () => templateForUser(effectiveSettings, editingDoc?.userId || targetUserId),
    [effectiveSettings, editingDoc, targetUserId]
  );

  const docView = useMemo(
    () => (editingDoc ? documentView(editingDoc, effectiveSettings) : null),
    [editingDoc, effectiveSettings]
  );

  const selectedUser = state.users.find((u) => u.id === targetUserId);

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-gray-50/50 relative min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Зарплатні документи</h1>
            <p className="text-gray-500 mt-1">Керування нарахуваннями та виплатами</p>
          </div>
          <div className="flex gap-3">
            {isAdmin && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
              >
                <Settings size={18} />
                Налаштування
              </button>
            )}
            <button
              onClick={() => {
                if (!targetUserId) {
                  alert('Спочатку оберіть працівника');
                  return;
                }
                setEditingDoc(null);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/30 font-medium"
            >
              <Plus size={18} />
              Створити документ
            </button>
          </div>
        </div>

        {isAdmin && (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-gray-500">
              <UserIcon size={20} />
              <span className="font-medium text-gray-700">Працівник:</span>
            </div>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 max-w-sm px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-gray-50 hover:bg-gray-100/50 transition-colors"
            >
              <option value="">Оберіть працівника</option>
              {state.users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            {selectedUser && (
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium border flex items-center gap-1.5 ${
                  current.isLegacy
                    ? 'bg-gray-50 text-gray-600 border-gray-200'
                    : 'bg-blue-50 text-blue-600 border-blue-100'
                }`}
                title={current.isLegacy ? 'Посаду ще не призначено' : 'Шаблон посади'}
              >
                <Layers size={12} />
                {current.template.name}
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visiblePayrolls
            .slice()
            .sort((a, b) => b.period.localeCompare(a.period))
            .map((doc) => {
              const { income, deductions, balance, templateName } = summarize(doc);
              const user = state.users.find((u) => u.id === doc.userId);
              return (
                <div
                  key={doc.id}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group relative"
                  onClick={() => setEditingDoc(doc)}
                >
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDoc(doc.id);
                      }}
                      className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title="Видалити документ"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <FileText size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">{doc.period}</h3>
                        {isAdmin && <p className="text-sm text-gray-500">{user?.name}</p>}
                      </div>
                    </div>
                    <span
                      className="text-xs font-semibold px-2 py-1 bg-gray-100 text-gray-600 rounded-full max-w-[45%] truncate"
                      title={templateName}
                    >
                      {templateName}
                    </span>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-gray-50">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Нараховано:</span>
                      <span className="font-medium text-gray-900">
                        {Math.round(income).toLocaleString('uk-UA')} ₴
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Відрахування:</span>
                      <span className="font-medium text-gray-900">
                        {Math.round(deductions).toLocaleString('uk-UA')} ₴
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-3 mt-3 border-t border-gray-50">
                      <span className="text-gray-900 font-medium">Баланс:</span>
                      <span className={`font-bold text-lg ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {Math.round(balance).toLocaleString('uk-UA')} ₴
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          {visiblePayrolls.length === 0 && (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-500 bg-white rounded-3xl border border-dashed border-gray-200">
              <FileText size={48} className="text-gray-300 mb-4" />
              <p className="text-lg font-medium text-gray-600">Немає зарплатних документів</p>
              <p className="text-sm mt-1">
                {!targetUserId
                  ? 'Оберіть працівника для перегляду документів'
                  : 'Для обраного працівника ще не створено жодного документа'}
              </p>
            </div>
          )}
        </div>
      </div>

      {isSettingsOpen && (
        <PayrollSettingsModal
          settings={effectiveSettings}
          onClose={() => setIsSettingsOpen(false)}
          onSave={async (newSettings) => updatePayrollSettings(newSettings)}
        />
      )}

      {editingDoc !== undefined && (
        <PayrollForm
          initialData={editingDoc}
          template={current.template}
          documentTemplate={docView?.template || current.template}
          initialValuesFromDoc={docView?.values}
          userId={editingDoc?.userId || targetUserId}
          onClose={() => setEditingDoc(undefined)}
          onSave={handleSaveDoc}
        />
      )}
    </div>
  );
};

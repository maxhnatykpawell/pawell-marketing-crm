import React, { useState, useMemo } from 'react';
import { Settings, Plus, FileText, Search, User as UserIcon, Trash2 } from 'lucide-react';
import { useAppContext } from '../../App';
import { PayrollSettingsModal } from './PayrollSettingsModal';
import { PayrollForm } from './PayrollForm';
import { PayrollDocument, PayrollSettings } from '../../types';

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
};

/** Merge global settings with per-user profile overrides */
function getSettingsForUser(settings: PayrollSettings, userId: string): PayrollSettings {
  const userProfile = settings.userProfiles?.[userId];
  if (!userProfile) return settings;
  
  // If user has a profile, use their custom bonuses/deductions instead of global
  return {
    ...settings,
    customBonuses: userProfile.customBonuses?.length ? userProfile.customBonuses : settings.customBonuses,
    customDeductions: userProfile.customDeductions?.length ? userProfile.customDeductions : settings.customDeductions,
  };
}

export const PayrollView: React.FC = () => {
  const { state, currentUser, addPayroll, updatePayroll, deletePayroll, updatePayrollSettings, confirmAction } = useAppContext();
  const isAdmin = currentUser?.role === 'admin';
  const payrolls = state.payrolls || [];
  const effectiveSettings = state.payrollSettings || DEFAULT_PAYROLL_SETTINGS;

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<PayrollDocument | null | undefined>(undefined);
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser?.userId || '');

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

  const getDocSummary = (doc: PayrollDocument) => {
    const docSettings = getSettingsForUser(effectiveSettings, doc.userId);

    const totalCustomBonuses = Object.entries(doc.customBonusesValues || {}).reduce((sum, [id, val]) => {
      const field = docSettings.customBonuses.find(b => b.id === id);
      const numVal = Number(val) || 0;
      if (!field || !field.type || field.type === 'fixed') return sum + numVal;
      if (field.type === 'multiplier') return sum + (numVal * (field.multiplierRate || 0));
      if (field.type === 'percentage') return sum + (numVal * (field.percentRate || 0) / 100);
      return sum;
    }, 0);

    const workedDaysIncome = doc.workedDays * (doc.workingDaysInMonth > 0 ? doc.baseSalary / doc.workingDaysInMonth : 0);
    const teamBonusAmount = (workedDaysIncome * doc.teamBonusPercent) / 100;
    const sum = workedDaysIncome + teamBonusAmount + doc.additionalActivity + totalCustomBonuses;
    
    const taxAmount = (sum * doc.taxPercent) / 100;
    
    const totalCustomDeductions = Object.entries(doc.customDeductionsValues || {}).reduce((sum, [id, val]) => {
      const field = docSettings.customDeductions.find(d => d.id === id);
      const numVal = Number(val) || 0;
      if (!field || !field.type || field.type === 'fixed') return sum + numVal;
      if (field.type === 'multiplier') return sum + (numVal * (field.multiplierRate || 0));
      if (field.type === 'percentage') return sum + (numVal * (field.percentRate || 0) / 100);
      return sum;
    }, 0);

    const balance = sum - taxAmount - doc.amountReceived - doc.companyDebts - totalCustomDeductions;
    
    return { sum, balance };
  };

  // Determine which user we're working with
  const targetUserId = isAdmin ? selectedUserId : currentUser?.userId || '';

  const visiblePayrolls = isAdmin 
    ? payrolls.filter(p => p.userId === selectedUserId)
    : payrolls.filter(p => p.userId === currentUser?.userId);

  // Compute per-user settings for the form
  const formSettings = useMemo(
    () => getSettingsForUser(effectiveSettings, editingDoc?.userId || targetUserId),
    [effectiveSettings, editingDoc, targetUserId]
  );

  const selectedUser = state.users.find(u => u.id === targetUserId);

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-gray-50/50 relative min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
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

        {/* Admin Filters */}
        {isAdmin && (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
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
              {state.users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            {selectedUser && effectiveSettings.userProfiles?.[targetUserId] && (
              <span className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-full font-medium border border-blue-100">
                Індивідуальний профіль
              </span>
            )}
          </div>
        )}

        {/* Documents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visiblePayrolls.sort((a, b) => b.period.localeCompare(a.period)).map(doc => {
            const { sum, balance } = getDocSummary(doc);
            const user = state.users.find(u => u.id === doc.userId);
            return (
              <div 
                key={doc.id} 
                className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group relative"
                onClick={() => setEditingDoc(doc)}
              >
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc.id); }}
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
                  <span className="text-xs font-semibold px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                    Архів
                  </span>
                </div>
                
                <div className="space-y-3 pt-4 border-t border-gray-50">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Нараховано:</span>
                    <span className="font-medium text-gray-900">{Math.round(sum).toLocaleString('uk-UA')} ₴</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Виплачено (на карту):</span>
                    <span className="font-medium text-gray-900">{Math.round(doc.amountReceived).toLocaleString('uk-UA')} ₴</span>
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
          settings={formSettings}
          userId={targetUserId}
          onClose={() => setEditingDoc(undefined)}
          onSave={handleSaveDoc}
        />
      )}
    </div>
  );
};

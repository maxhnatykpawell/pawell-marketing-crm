import React, { useState } from 'react';
import { Settings, Plus, FileText, Search, User as UserIcon } from 'lucide-react';
import { useAppContext } from '../../App';
import { PayrollSettingsModal } from './PayrollSettingsModal';
import { PayrollForm } from './PayrollForm';
import { PayrollDocument } from '../../types';

export const PayrollView: React.FC = () => {
  const { state, currentUser, addPayroll, updatePayroll, deletePayroll, updatePayrollSettings } = useAppContext();
  const isAdmin = currentUser?.role === 'admin';
  const payrolls = state.payrolls || [];

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

  const getDocSummary = (doc: PayrollDocument) => {
    const totalCustomBonuses = Object.values(doc.customBonusesValues || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
    const workedDaysIncome = doc.workedDays * (doc.workingDaysInMonth > 0 ? doc.baseSalary / doc.workingDaysInMonth : 0);
    const teamBonusAmount = (workedDaysIncome * doc.teamBonusPercent) / 100;
    const sum = workedDaysIncome + teamBonusAmount + doc.additionalActivity + totalCustomBonuses;
    
    const taxAmount = (sum * doc.taxPercent) / 100;
    const totalCustomDeductions = Object.values(doc.customDeductionsValues || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
    const balance = sum - taxAmount - doc.amountReceived - doc.companyDebts - totalCustomDeductions;
    
    return { sum, balance };
  };

  const visiblePayrolls = isAdmin 
    ? payrolls.filter(p => p.userId === selectedUserId)
    : payrolls.filter(p => p.userId === currentUser?.userId);

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
              onClick={() => setEditingDoc(null)}
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
                className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group"
                onClick={() => setEditingDoc(doc)}
              >
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
              <p className="text-sm mt-1">Для обраного працівника ще не створено жодного документа</p>
            </div>
          )}
        </div>
      </div>

      {isSettingsOpen && state.payrollSettings && (
        <PayrollSettingsModal
          settings={state.payrollSettings}
          onClose={() => setIsSettingsOpen(false)}
          onSave={async (newSettings) => updatePayrollSettings(newSettings)}
        />
      )}

      {editingDoc !== undefined && state.payrollSettings && (
        <PayrollForm
          initialData={editingDoc}
          settings={state.payrollSettings}
          userId={isAdmin ? selectedUserId : currentUser?.userId || ''}
          onClose={() => setEditingDoc(undefined)}
          onSave={handleSaveDoc}
        />
      )}
    </div>
  );
};

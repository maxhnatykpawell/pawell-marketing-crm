import React, { useState, useEffect } from 'react';
import { X, Save, Calculator } from 'lucide-react';
import { PayrollDocument, PayrollSettings, CustomPayrollField } from '../../types';
import { useAppContext } from '../../App';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

interface PayrollFormProps {
  initialData?: PayrollDocument | null;
  settings: PayrollSettings;
  userId: string;
  onClose: () => void;
  onSave: (doc: Omit<PayrollDocument, 'id' | 'createdAt'>) => Promise<void>;
}

export const PayrollForm: React.FC<PayrollFormProps> = ({
  initialData,
  settings,
  userId,
  onClose,
  onSave,
}) => {
  const currentMonth = format(new Date(), 'yyyy-MM');
  const { state } = useAppContext();
  const userName = state.users.find(u => u.id === userId)?.name;
  const userAvatar = state.users.find(u => u.id === userId)?.avatar;
  
  const [period, setPeriod] = useState(initialData?.period || currentMonth);
  const [baseSalary, setBaseSalary] = useState(initialData?.baseSalary || 0);
  const [workingDaysInMonth, setWorkingDaysInMonth] = useState(initialData?.workingDaysInMonth || 21);
  const [workedDays, setWorkedDays] = useState(initialData?.workedDays || 0);
  const [paidVacationDays, setPaidVacationDays] = useState(initialData?.paidVacationDays || 0);
  const [overtimeHours, setOvertimeHours] = useState(initialData?.overtimeHours || 0);
  const [businessTripDays, setBusinessTripDays] = useState(initialData?.businessTripDays || 0);
  const [teamBonusPercent, setTeamBonusPercent] = useState(initialData?.teamBonusPercent || 0);
  const [additionalActivity, setAdditionalActivity] = useState(initialData?.additionalActivity || 0);
  const [taxPercent, setTaxPercent] = useState(initialData?.taxPercent || 0);
  const [amountReceived, setAmountReceived] = useState(initialData?.amountReceived || 0);
  const [companyDebts, setCompanyDebts] = useState(initialData?.companyDebts || 0);
  
  const [customBonusesValues, setCustomBonusesValues] = useState<Record<string, number>>(
    initialData?.customBonusesValues || {}
  );
  const [customDeductionsValues, setCustomDeductionsValues] = useState<Record<string, number>>(
    initialData?.customDeductionsValues || {}
  );
  
  const [isSaving, setIsSaving] = useState(false);

  // Calculations
  const salaryPerDay = workingDaysInMonth > 0 ? baseSalary / workingDaysInMonth : 0;
  const salaryPerHour = salaryPerDay / 8;
  const workedDaysIncome = workedDays * salaryPerDay;
  const teamBonusAmount = (workedDaysIncome * teamBonusPercent) / 100;
  
  const totalCustomBonuses = Object.entries(customBonusesValues).reduce((sum, [id, val]) => {
    const field = settings.customBonuses.find(b => b.id === id);
    const numVal = Number(val) || 0;
    if (!field || !field.type || field.type === 'fixed') return sum + numVal;
    if (field.type === 'multiplier') return sum + (numVal * (field.multiplierRate || 0));
    if (field.type === 'percentage') return sum + (numVal * (field.percentRate || 0) / 100);
    return sum;
  }, 0);
  const sum = workedDaysIncome + teamBonusAmount + additionalActivity + totalCustomBonuses;
  
  const taxAmount = (sum * taxPercent) / 100;
  
  const totalCustomDeductions = Object.entries(customDeductionsValues).reduce((sum, [id, val]) => {
    const field = settings.customDeductions.find(d => d.id === id);
    const numVal = Number(val) || 0;
    if (!field || !field.type || field.type === 'fixed') return sum + numVal;
    if (field.type === 'multiplier') return sum + (numVal * (field.multiplierRate || 0));
    if (field.type === 'percentage') return sum + (numVal * (field.percentRate || 0) / 100);
    return sum;
  }, 0);
  
  const balance = sum - taxAmount - amountReceived - companyDebts - totalCustomDeductions;

  const handleCustomBonusChange = (id: string, value: string) => {
    setCustomBonusesValues({ ...customBonusesValues, [id]: Number(value) });
  };

  const handleCustomDeductionChange = (id: string, value: string) => {
    setCustomDeductionsValues({ ...customDeductionsValues, [id]: Number(value) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave({
      userId,
      period,
      baseSalary,
      workingDaysInMonth,
      workedDays,
      paidVacationDays,
      overtimeHours,
      businessTripDays,
      teamBonusPercent,
      additionalActivity,
      customBonusesValues,
      taxPercent,
      amountReceived,
      companyDebts,
      customDeductionsValues,
    });
    setIsSaving(false);
    onClose();
  };

  const renderCustomField = (
    field: CustomPayrollField, 
    value: number | undefined, 
    onChange: (id: string, val: string) => void
  ) => {
    const numVal = value || 0;
    let computedAmount = 0;
    
    if (!field.type || field.type === 'fixed') {
      computedAmount = numVal;
    } else if (field.type === 'multiplier') {
      computedAmount = numVal * (field.multiplierRate || 0);
    } else if (field.type === 'percentage') {
      computedAmount = numVal * (field.percentRate || 0) / 100;
    }

    return (
      <div key={field.id} className="flex justify-between items-center gap-4">
        <label className="text-gray-700 flex-1">
          {field.label}
          {field.type === 'multiplier' && (
            <span className="text-xs text-gray-400 block">
              {formatMoney(field.multiplierRate || 0)} ₴ / {field.multiplierUnit || 'шт'}
            </span>
          )}
          {field.type === 'percentage' && (
            <span className="text-xs text-gray-400 block">
              {field.percentRate || 0}% від суми
            </span>
          )}
        </label>
        
        <div className="flex items-center justify-end gap-3">
          <input
            type="number"
            value={value || ''}
            onChange={(e) => onChange(field.id, e.target.value)}
            className="w-24 px-3 py-1.5 text-right border border-gray-300 rounded-lg bg-white"
            placeholder={field.type === 'multiplier' ? 'К-сть' : 'Сума'}
          />
          {(field.type === 'multiplier' || field.type === 'percentage') && (
            <span className="w-24 text-right font-medium text-gray-600">
              {formatMoney(computedAmount)}
            </span>
          )}
        </div>
      </div>
    );
  };

  const formatMoney = (val: number) => Math.round(val).toLocaleString('uk-UA');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-8 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
              <Calculator size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-800 uppercase">
                Зарплатний документ
              </h2>
              {userName && (
                <div className="flex items-center gap-2 mt-1">
                  {userAvatar && (
                    <img src={userAvatar} alt={userName} className="w-5 h-5 rounded-full object-cover border border-gray-200" />
                  )}
                  <span className="text-sm text-gray-500">{userName}</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-8 flex-1">
          <div className="flex items-center gap-4">
            <label className="font-medium text-gray-700">Місяць та рік:</label>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Інформація для обчислення */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800 pb-2 border-b">Інформація, яка потрібна для обчислення</h3>
              
              <div className="bg-blue-50/50 rounded-xl p-4 space-y-4 border border-blue-100">
                <div className="flex justify-between items-center">
                  <label className="text-gray-700">{settings.labels.baseSalary}</label>
                  <input
                    type="number"
                    value={baseSalary || ''}
                    onChange={(e) => setBaseSalary(Number(e.target.value))}
                    className="w-32 px-3 py-1.5 text-right border border-gray-300 rounded-lg bg-white"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <label className="text-gray-700">{settings.labels.workingDaysInMonth}</label>
                  <input
                    type="number"
                    value={workingDaysInMonth || ''}
                    onChange={(e) => setWorkingDaysInMonth(Number(e.target.value))}
                    className="w-32 px-3 py-1.5 text-right border border-gray-300 rounded-lg bg-white"
                  />
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                  <span className="text-gray-700">{settings.labels.salaryPerDay}</span>
                  <span className="font-medium">{formatMoney(salaryPerDay)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">{settings.labels.salaryPerHour}</span>
                  <span className="font-medium">{formatMoney(salaryPerHour)}</span>
                </div>
              </div>
            </div>

            {/* Нарахування коштів */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800 pb-2 border-b">Інформація про нарахування коштів, прихід</h3>
              
              <div className="bg-green-50/50 rounded-xl p-4 space-y-4 border border-green-100">
                <div className="flex items-center gap-4">
                  <label className="flex-1 text-gray-700">{settings.labels.workedDays}</label>
                  <input
                    type="number"
                    value={workedDays || ''}
                    onChange={(e) => setWorkedDays(Number(e.target.value))}
                    className="w-20 px-3 py-1.5 text-right border border-gray-300 rounded-lg bg-white"
                  />
                  <span className="w-24 text-right font-medium">{formatMoney(workedDaysIncome)}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <label className="text-gray-700">{settings.labels.paidVacationDays}</label>
                  <input
                    type="number"
                    value={paidVacationDays || ''}
                    onChange={(e) => setPaidVacationDays(Number(e.target.value))}
                    className="w-20 px-3 py-1.5 text-right border border-gray-300 rounded-lg bg-white"
                  />
                  <span className="w-24 text-right font-medium">0</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <label className="text-gray-700">{settings.labels.overtimeHours}</label>
                  <input
                    type="number"
                    value={overtimeHours || ''}
                    onChange={(e) => setOvertimeHours(Number(e.target.value))}
                    className="w-20 px-3 py-1.5 text-right border border-gray-300 rounded-lg bg-white"
                  />
                  <span className="w-24 text-right font-medium">0</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <label className="text-gray-700">{settings.labels.businessTripDays}</label>
                  <input
                    type="number"
                    value={businessTripDays || ''}
                    onChange={(e) => setBusinessTripDays(Number(e.target.value))}
                    className="w-20 px-3 py-1.5 text-right border border-gray-300 rounded-lg bg-white"
                  />
                  <span className="w-24 text-right font-medium">0</span>
                </div>
                
                <div className="flex items-center gap-4">
                  <label className="flex-1 text-gray-700">{settings.labels.teamBonus}</label>
                  <div className="relative w-20">
                    <input
                      type="number"
                      value={teamBonusPercent || ''}
                      onChange={(e) => setTeamBonusPercent(Number(e.target.value))}
                      className="w-full pl-3 pr-6 py-1.5 text-right border border-gray-300 rounded-lg bg-white"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                  </div>
                  <span className="w-24 text-right font-medium">{formatMoney(teamBonusAmount)}</span>
                </div>

                {settings.customBonuses?.map(bonus => 
                  renderCustomField(bonus, customBonusesValues[bonus.id], handleCustomBonusChange)
                )}
                
                <div className="flex justify-between items-center">
                  <label className="text-gray-700">{settings.labels.additionalActivity}</label>
                  <input
                    type="number"
                    value={additionalActivity || ''}
                    onChange={(e) => setAdditionalActivity(Number(e.target.value))}
                    className="w-24 px-3 py-1.5 text-right border border-gray-300 rounded-lg bg-white"
                  />
                </div>
                
                <div className="flex justify-between items-center pt-2 border-t border-green-200">
                  <span className="font-semibold text-gray-800">{settings.labels.sum}</span>
                  <span className="font-bold text-lg">{formatMoney(sum)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Відрахування */}
          <div className="space-y-4 max-w-md ml-auto">
            <h3 className="font-semibold text-gray-800 pb-2 border-b">Інформація про відрахування</h3>
            
            <div className="bg-red-50/50 rounded-xl p-4 space-y-4 border border-red-100">
              <div className="flex items-center gap-4">
                <label className="flex-1 text-gray-700">{settings.labels.tax}</label>
                <div className="relative w-20">
                  <input
                    type="number"
                    value={taxPercent || ''}
                    onChange={(e) => setTaxPercent(Number(e.target.value))}
                    className="w-full pl-3 pr-6 py-1.5 text-right border border-gray-300 rounded-lg bg-white"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                </div>
                <span className="w-24 text-right font-medium">{formatMoney(taxAmount)}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <label className="text-gray-700">{settings.labels.amountReceived}</label>
                <input
                  type="number"
                  value={amountReceived || ''}
                  onChange={(e) => setAmountReceived(Number(e.target.value))}
                  className="w-32 px-3 py-1.5 text-right border border-gray-300 rounded-lg bg-white"
                />
              </div>
              
              <div className="flex justify-between items-center">
                <label className="text-gray-700">{settings.labels.companyDebts}</label>
                <input
                  type="number"
                  value={companyDebts || ''}
                  onChange={(e) => setCompanyDebts(Number(e.target.value))}
                  className="w-32 px-3 py-1.5 text-right border border-gray-300 rounded-lg bg-white"
                />
              </div>

              {settings.customDeductions?.map(deduction => 
                renderCustomField(deduction, customDeductionsValues[deduction.id], handleCustomDeductionChange)
              )}
            </div>
          </div>

          {/* Баланс */}
          <div className="flex justify-end pt-4">
            <div className="flex items-center gap-6 bg-gray-900 text-white px-8 py-4 rounded-xl shadow-lg">
              <span className="text-xl uppercase tracking-wider">{settings.labels.balance}</span>
              <span className="text-3xl font-bold">{formatMoney(balance)} ₴</span>
            </div>
          </div>
        </form>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-2xl sticky bottom-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Скасувати
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            <Save size={18} />
            {isSaving ? 'Збереження...' : 'Зберегти документ'}
          </button>
        </div>
      </div>
    </div>
  );
};

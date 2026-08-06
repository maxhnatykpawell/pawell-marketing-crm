import React, { useState } from 'react';
import { X, Plus, Trash2, Users, ChevronRight, User as UserIcon } from 'lucide-react';
import { PayrollSettings, PayrollUserProfile, User, CustomPayrollField } from '../../types';
import { useAppContext } from '../../App';

interface PayrollSettingsModalProps {
  settings: PayrollSettings;
  onClose: () => void;
  onSave: (newSettings: PayrollSettings) => Promise<void>;
}

type SettingsTab = 'global' | 'users';

const CustomFieldEditor: React.FC<{
  field: CustomPayrollField;
  onChange: (field: CustomPayrollField) => void;
  onRemove: () => void;
}> = ({ field, onChange, onRemove }) => {
  const type = field.type || 'fixed';
  
  return (
    <div className="flex flex-col gap-2 p-3 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-center gap-3">
        <select
          value={type}
          onChange={(e) => onChange({ ...field, type: e.target.value as any })}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option value="fixed">Фікс. сума</option>
          <option value="multiplier">Ставка</option>
          <option value="percentage">Відсоток</option>
        </select>
        <input
          type="text"
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
          placeholder="Назва"
        />
        <button
          onClick={onRemove}
          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Видалити"
        >
          <Trash2 size={16} />
        </button>
      </div>
      
      {type === 'multiplier' && (
        <div className="flex items-center gap-2 pl-1 bg-gray-50/50 p-2 rounded-lg border border-gray-100">
          <span className="text-xs text-gray-500 font-medium">Платити:</span>
          <div className="relative w-24">
            <input
              type="number"
              value={field.multiplierRate || ''}
              onChange={(e) => onChange({ ...field, multiplierRate: Number(e.target.value) })}
              className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm pr-6"
              placeholder="0"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">₴</span>
          </div>
          <span className="text-xs text-gray-500 font-medium">за 1</span>
          <input
            type="text"
            value={field.multiplierUnit || ''}
            onChange={(e) => onChange({ ...field, multiplierUnit: e.target.value })}
            className="w-32 px-2 py-1 border border-gray-300 rounded-md text-sm"
            placeholder="клієнта / годину"
          />
        </div>
      )}
      
      {type === 'percentage' && (
        <div className="flex items-center gap-2 pl-1 bg-gray-50/50 p-2 rounded-lg border border-gray-100">
          <span className="text-xs text-gray-500 font-medium">Платити:</span>
          <div className="relative w-24">
            <input
              type="number"
              value={field.percentRate || ''}
              onChange={(e) => onChange({ ...field, percentRate: Number(e.target.value) })}
              className="w-full pl-2 pr-6 py-1 border border-gray-300 rounded-md text-sm"
              placeholder="0"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
          </div>
          <span className="text-xs text-gray-500 font-medium">від введеної суми</span>
        </div>
      )}
    </div>
  );
};

export const PayrollSettingsModal: React.FC<PayrollSettingsModalProps> = ({
  settings,
  onClose,
  onSave,
}) => {
  const { state } = useAppContext();
  const [activeTab, setActiveTab] = useState<SettingsTab>('users');
  const [labels, setLabels] = useState(settings.labels);
  const [customBonuses, setCustomBonuses] = useState<CustomPayrollField[]>(settings.customBonuses || []);
  const [customDeductions, setCustomDeductions] = useState<CustomPayrollField[]>(settings.customDeductions || []);
  const [userProfiles, setUserProfiles] = useState<Record<string, PayrollUserProfile>>(
    settings.userProfiles || {}
  );
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const handleLabelChange = (key: keyof typeof labels, value: string) => {
    setLabels({ ...labels, [key]: value });
  };

  // ── Global custom bonuses/deductions ──────────────────────────────────────
  const addCustomBonus = () => {
    setCustomBonuses([...customBonuses, { id: crypto.randomUUID(), label: 'Новий бонус', type: 'fixed' }]);
  };
  const removeCustomBonus = (id: string) => {
    setCustomBonuses(customBonuses.filter((b) => b.id !== id));
  };
  const updateCustomBonus = (id: string, updated: CustomPayrollField) => {
    setCustomBonuses(customBonuses.map((b) => (b.id === id ? updated : b)));
  };
  const addCustomDeduction = () => {
    setCustomDeductions([...customDeductions, { id: crypto.randomUUID(), label: 'Нове відрахування', type: 'fixed' }]);
  };
  const removeCustomDeduction = (id: string) => {
    setCustomDeductions(customDeductions.filter((d) => d.id !== id));
  };
  const updateCustomDeduction = (id: string, updated: CustomPayrollField) => {
    setCustomDeductions(customDeductions.map((d) => (d.id === id ? updated : d)));
  };

  // ── Per-user profile management ───────────────────────────────────────────
  const getOrCreateProfile = (userId: string): PayrollUserProfile => {
    return userProfiles[userId] || { customBonuses: [], customDeductions: [] };
  };

  const updateProfile = (userId: string, profile: PayrollUserProfile) => {
    setUserProfiles({ ...userProfiles, [userId]: profile });
  };

  const addUserBonus = (userId: string) => {
    const profile = getOrCreateProfile(userId);
    updateProfile(userId, {
      ...profile,
      customBonuses: [...profile.customBonuses, { id: crypto.randomUUID(), label: 'Новий бонус', type: 'fixed' }],
    });
  };

  const removeUserBonus = (userId: string, bonusId: string) => {
    const profile = getOrCreateProfile(userId);
    updateProfile(userId, {
      ...profile,
      customBonuses: profile.customBonuses.filter((b) => b.id !== bonusId),
    });
  };

  const updateUserBonus = (userId: string, bonusId: string, updated: CustomPayrollField) => {
    const profile = getOrCreateProfile(userId);
    updateProfile(userId, {
      ...profile,
      customBonuses: profile.customBonuses.map((b) => (b.id === bonusId ? updated : b)),
    });
  };

  const addUserDeduction = (userId: string) => {
    const profile = getOrCreateProfile(userId);
    updateProfile(userId, {
      ...profile,
      customDeductions: [...profile.customDeductions, { id: crypto.randomUUID(), label: 'Нове відрахування', type: 'fixed' }],
    });
  };

  const removeUserDeduction = (userId: string, deductionId: string) => {
    const profile = getOrCreateProfile(userId);
    updateProfile(userId, {
      ...profile,
      customDeductions: profile.customDeductions.filter((d) => d.id !== deductionId),
    });
  };

  const updateUserDeduction = (userId: string, deductionId: string, updated: CustomPayrollField) => {
    const profile = getOrCreateProfile(userId);
    updateProfile(userId, {
      ...profile,
      customDeductions: profile.customDeductions.map((d) => (d.id === deductionId ? updated : d)),
    });
  };

  const copyGlobalToUser = (userId: string) => {
    const profile = getOrCreateProfile(userId);
    updateProfile(userId, {
      customBonuses: [
        ...profile.customBonuses,
        ...customBonuses.map((b) => ({ ...b, id: crypto.randomUUID() })),
      ],
      customDeductions: [
        ...profile.customDeductions,
        ...customDeductions.map((d) => ({ ...d, id: crypto.randomUUID() })),
      ],
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSave({
      labels,
      customBonuses,
      customDeductions,
      userProfiles,
    });
    setIsSaving(false);
    onClose();
  };

  const selectedProfile = selectedProfileUserId ? getOrCreateProfile(selectedProfileUserId) : null;
  const selectedUser = state.users.find((u) => u.id === selectedProfileUserId);

  const getUserProfileCount = (userId: string) => {
    const p = userProfiles[userId];
    if (!p) return 0;
    return (p.customBonuses?.length || 0) + (p.customDeductions?.length || 0);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-8 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-2xl font-semibold text-gray-800">Налаштування зарплатних документів</h2>
          <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6 bg-gray-50/50">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'users'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users size={16} />
            Профілі працівників
          </button>
          <button
            onClick={() => setActiveTab('global')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'global'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Глобальні налаштування
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8 flex-1">
          {activeTab === 'global' && (
            <>
              {/* Стандартні поля */}
              <section>
                <h3 className="text-lg font-medium text-gray-900 mb-4 border-b pb-2">Назви стандартних полів</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(labels).map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                      <label className="text-xs text-gray-500 mb-1 capitalize">{key}</label>
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => handleLabelChange(key as any, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Глобальні кастомні бонуси */}
              <section>
                <div className="flex items-center justify-between mb-4 border-b pb-2">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Глобальні бонуси (шаблон)</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Застосовуються для працівників без індивідуального профілю</p>
                  </div>
                  <button
                    onClick={addCustomBonus}
                    className="flex items-center gap-1 text-sm text-green-600 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus size={16} /> Додати бонус
                  </button>
                </div>
                {customBonuses.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">Немає глобальних бонусів</p>
                ) : (
                  <div className="space-y-3">
                    {customBonuses.map((bonus) => (
                      <CustomFieldEditor
                        key={bonus.id}
                        field={bonus}
                        onChange={(f) => updateCustomBonus(bonus.id, f)}
                        onRemove={() => removeCustomBonus(bonus.id)}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Глобальні кастомні відрахування */}
              <section>
                <div className="flex items-center justify-between mb-4 border-b pb-2">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Глобальні відрахування (шаблон)</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Застосовуються для працівників без індивідуального профілю</p>
                  </div>
                  <button
                    onClick={addCustomDeduction}
                    className="flex items-center gap-1 text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus size={16} /> Додати відрахування
                  </button>
                </div>
                {customDeductions.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">Немає глобальних відрахувань</p>
                ) : (
                  <div className="space-y-3">
                    {customDeductions.map((deduction) => (
                      <CustomFieldEditor
                        key={deduction.id}
                        field={deduction}
                        onChange={(f) => updateCustomDeduction(deduction.id, f)}
                        onRemove={() => removeCustomDeduction(deduction.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === 'users' && (
            <div className="flex gap-6 min-h-[400px]">
              {/* Users list */}
              <div className="w-56 shrink-0 space-y-1 border-r pr-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Працівники</p>
                {state.users.map((user) => {
                  const count = getUserProfileCount(user.id);
                  const isActive = selectedProfileUserId === user.id;
                  return (
                    <button
                      key={user.id}
                      onClick={() => setSelectedProfileUserId(user.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-all ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-7 h-7 rounded-full object-cover border border-gray-200 shrink-0"
                      />
                      <span className="flex-1 truncate font-medium">{user.name}</span>
                      {count > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full leading-none">
                          {count}
                        </span>
                      )}
                      <ChevronRight size={14} className={`shrink-0 ${isActive ? 'text-blue-500' : 'text-gray-400'}`} />
                    </button>
                  );
                })}
              </div>

              {/* User profile editor */}
              <div className="flex-1 min-w-0">
                {!selectedProfileUserId ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <UserIcon size={48} className="mb-3 text-gray-300" />
                    <p className="text-lg font-medium text-gray-500">Оберіть працівника</p>
                    <p className="text-sm mt-1">Для налаштування індивідуальних бонусів та відрахувань</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={selectedUser?.avatar || ''}
                          alt={selectedUser?.name || ''}
                          className="w-10 h-10 rounded-full object-cover border-2 border-blue-200"
                        />
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{selectedUser?.name}</h3>
                          <p className="text-xs text-gray-500">Індивідуальний профіль нарахувань</p>
                        </div>
                      </div>
                      {(customBonuses.length > 0 || customDeductions.length > 0) && (
                        <button
                          onClick={() => copyGlobalToUser(selectedProfileUserId)}
                          className="text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-blue-200"
                        >
                          Копіювати з глобальних
                        </button>
                      )}
                    </div>

                    {/* User Bonuses */}
                    <section>
                      <div className="flex items-center justify-between mb-3 border-b pb-2">
                        <h4 className="font-medium text-gray-800">Бонуси (Доходи)</h4>
                        <button
                          onClick={() => addUserBonus(selectedProfileUserId)}
                          className="flex items-center gap-1 text-sm text-green-600 hover:bg-green-50 px-3 py-1 rounded-lg transition-colors"
                        >
                          <Plus size={14} /> Додати
                        </button>
                      </div>
                      {(selectedProfile?.customBonuses?.length || 0) === 0 ? (
                        <div className="bg-gray-50 rounded-xl p-4 text-center">
                          <p className="text-sm text-gray-500">
                            Немає індивідуальних бонусів.
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Будуть використані глобальні налаштування ({customBonuses.length} бонус{customBonuses.length === 1 ? '' : 'ів'})
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedProfile!.customBonuses.map((bonus) => (
                            <CustomFieldEditor
                              key={bonus.id}
                              field={bonus}
                              onChange={(f) => updateUserBonus(selectedProfileUserId, bonus.id, f)}
                              onRemove={() => removeUserBonus(selectedProfileUserId, bonus.id)}
                            />
                          ))}
                        </div>
                      )}
                    </section>

                    {/* User Deductions */}
                    <section>
                      <div className="flex items-center justify-between mb-3 border-b pb-2">
                        <h4 className="font-medium text-gray-800">Відрахування (Витрати)</h4>
                        <button
                          onClick={() => addUserDeduction(selectedProfileUserId)}
                          className="flex items-center gap-1 text-sm text-red-600 hover:bg-red-50 px-3 py-1 rounded-lg transition-colors"
                        >
                          <Plus size={14} /> Додати
                        </button>
                      </div>
                      {(selectedProfile?.customDeductions?.length || 0) === 0 ? (
                        <div className="bg-gray-50 rounded-xl p-4 text-center">
                          <p className="text-sm text-gray-500">
                            Немає індивідуальних відрахувань.
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Будуть використані глобальні налаштування ({customDeductions.length} відрахуван{customDeductions.length === 1 ? 'ня' : 'ь'})
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedProfile!.customDeductions.map((deduction) => (
                            <CustomFieldEditor
                              key={deduction.id}
                              field={deduction}
                              onChange={(f) => updateUserDeduction(selectedProfileUserId, deduction.id, f)}
                              onRemove={() => removeUserDeduction(selectedProfileUserId, deduction.id)}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-2xl sticky bottom-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Скасувати
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Збереження...' : 'Зберегти налаштування'}
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { AppState, PayrollSettings } from '../../types';

interface PayrollSettingsModalProps {
  settings: PayrollSettings;
  onClose: () => void;
  onSave: (newSettings: PayrollSettings) => Promise<void>;
}

export const PayrollSettingsModal: React.FC<PayrollSettingsModalProps> = ({
  settings,
  onClose,
  onSave,
}) => {
  const [labels, setLabels] = useState(settings.labels);
  const [customBonuses, setCustomBonuses] = useState(settings.customBonuses || []);
  const [customDeductions, setCustomDeductions] = useState(settings.customDeductions || []);
  const [isSaving, setIsSaving] = useState(false);

  const handleLabelChange = (key: keyof typeof labels, value: string) => {
    setLabels({ ...labels, [key]: value });
  };

  const addCustomBonus = () => {
    setCustomBonuses([...customBonuses, { id: crypto.randomUUID(), label: 'Новий бонус' }]);
  };

  const removeCustomBonus = (id: string) => {
    setCustomBonuses(customBonuses.filter((b) => b.id !== id));
  };

  const updateCustomBonus = (id: string, label: string) => {
    setCustomBonuses(customBonuses.map((b) => (b.id === id ? { ...b, label } : b)));
  };

  const addCustomDeduction = () => {
    setCustomDeductions([...customDeductions, { id: crypto.randomUUID(), label: 'Нове відрахування' }]);
  };

  const removeCustomDeduction = (id: string) => {
    setCustomDeductions(customDeductions.filter((d) => d.id !== id));
  };

  const updateCustomDeduction = (id: string, label: string) => {
    setCustomDeductions(customDeductions.map((d) => (d.id === id ? { ...d, label } : d)));
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSave({
      labels,
      customBonuses,
      customDeductions,
    });
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-2xl font-semibold text-gray-800">Налаштування зарплатних документів</h2>
          <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8">
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

          {/* Кастомні бонуси */}
          <section>
            <div className="flex items-center justify-between mb-4 border-b pb-2">
              <h3 className="text-lg font-medium text-gray-900">Кастомні бонуси (Доходи)</h3>
              <button
                onClick={addCustomBonus}
                className="flex items-center gap-1 text-sm text-green-600 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={16} /> Додати бонус
              </button>
            </div>
            {customBonuses.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Немає кастомних бонусів</p>
            ) : (
              <div className="space-y-3">
                {customBonuses.map((bonus) => (
                  <div key={bonus.id} className="flex items-center gap-3">
                    <input
                      type="text"
                      value={bonus.label}
                      onChange={(e) => updateCustomBonus(bonus.id, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      placeholder="Назва бонусу"
                    />
                    <button
                      onClick={() => removeCustomBonus(bonus.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Кастомні відрахування */}
          <section>
            <div className="flex items-center justify-between mb-4 border-b pb-2">
              <h3 className="text-lg font-medium text-gray-900">Кастомні відрахування (Витрати)</h3>
              <button
                onClick={addCustomDeduction}
                className="flex items-center gap-1 text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={16} /> Додати відрахування
              </button>
            </div>
            {customDeductions.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Немає кастомних відрахувань</p>
            ) : (
              <div className="space-y-3">
                {customDeductions.map((deduction) => (
                  <div key={deduction.id} className="flex items-center gap-3">
                    <input
                      type="text"
                      value={deduction.label}
                      onChange={(e) => updateCustomDeduction(deduction.id, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      placeholder="Назва відрахування"
                    />
                    <button
                      onClick={() => removeCustomDeduction(deduction.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
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

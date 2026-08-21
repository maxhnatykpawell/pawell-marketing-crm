import React, { useMemo, useState } from 'react';
import { X, Plus, Trash2, Layers, Users, Wand2, Save } from 'lucide-react';
import { PayrollSettings } from '../../types';
import {
  PayrollAssignment,
  PayrollModule,
  PayrollTemplate,
  describeModule,
  evaluateModules,
  resolveModules,
  suggestKey,
} from '../../lib/payrollEngine';
import { legacyTemplate, newId } from '../../lib/payrollTemplates';
import { ModuleEditor, PayrollTemplateEditor } from './PayrollTemplateEditor';
import { useAppContext } from '../../App';

interface PayrollSettingsModalProps {
  settings: PayrollSettings;
  onClose: () => void;
  onSave: (newSettings: PayrollSettings) => Promise<void>;
}

type SettingsTab = 'templates' | 'assignments';

const inputCls =
  'px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50';

/** Поле, яке має сенс міняти індивідуально, не чіпаючи шаблон посади */
function overridableField(m: PayrollModule): { field: keyof PayrollModule; label: string } | null {
  if (m.kind === 'constant') return { field: 'value', label: 'Сума, ₴' };
  if (m.kind === 'rate' && !m.rateSource) return { field: 'rate', label: 'Ставка, ₴' };
  if (m.kind === 'percent' && m.fixedPercent) return { field: 'percent', label: 'Відсоток' };
  if (m.kind === 'input') return { field: 'defaultValue', label: 'За замовчуванням' };
  return null;
}

// ── Призначення посад ───────────────────────────────────────────────────────

interface AssignmentsPanelProps {
  settings: PayrollSettings;
  templates: PayrollTemplate[];
  assignments: Record<string, PayrollAssignment>;
  onChange: (assignments: Record<string, PayrollAssignment>) => void;
  onCreateTemplate: (template: PayrollTemplate) => void;
}

const AssignmentsPanel: React.FC<AssignmentsPanelProps> = ({
  settings,
  templates,
  assignments,
  onChange,
  onCreateTemplate,
}) => {
  const { state } = useAppContext();
  const [userId, setUserId] = useState<string>(state.users[0]?.id || '');
  const [expandedExtraId, setExpandedExtraId] = useState<string>('');

  const user = state.users.find((u) => u.id === userId);
  const assignment = assignments[userId];
  const template = templates.find((t) => t.id === assignment?.templateId);

  const patch = (p: Partial<PayrollAssignment>) => {
    if (!userId) return;
    onChange({
      ...assignments,
      [userId]: { templateId: assignment?.templateId || '', ...assignment, ...p },
    });
  };

  const assign = (templateId: string) => {
    if (!userId) return;
    if (!templateId) {
      const next = { ...assignments };
      delete next[userId];
      onChange(next);
      return;
    }
    // Правки прив'язані до id модулів конкретної посади: при зміні посади
    // вони стосувалися б чужих модулів, тому не переносяться
    onChange({ ...assignments, [userId]: { templateId } });
  };

  /** Перенести стару зашиту схему працівника в повноцінний шаблон посади */
  const migrateFromLegacy = () => {
    if (!user) return;
    const source = legacyTemplate(settings, userId);
    const created: PayrollTemplate = {
      ...source,
      id: newId(),
      name: `Схема ${user.name}`,
      description: 'Перенесено зі старих налаштувань',
      modules: source.modules.map((m) => ({ ...m })),
      updatedAt: new Date().toISOString(),
    };
    onCreateTemplate(created);
    onChange({ ...assignments, [userId]: { templateId: created.id } });
  };

  const effectiveModules = useMemo(
    () => resolveModules(template, assignment),
    [template, assignment]
  );
  const check = useMemo(() => evaluateModules(effectiveModules, {}), [effectiveModules]);

  const disabled = new Set<string>(assignment?.disabledModuleIds || []);
  const overrides = assignment?.overrides || {};

  const toggleModule = (moduleId: string) => {
    const next = new Set(disabled);
    if (next.has(moduleId)) next.delete(moduleId);
    else next.add(moduleId);
    patch({ disabledModuleIds: [...next] });
  };

  const setOverride = (moduleId: string, field: string, value: number | undefined) => {
    const next = { ...overrides };
    if (value === undefined) {
      const rest = { ...next[moduleId] };
      delete (rest as any)[field];
      if (Object.keys(rest).length === 0) delete next[moduleId];
      else next[moduleId] = rest;
    } else {
      next[moduleId] = { ...next[moduleId], [field]: value };
    }
    patch({ overrides: next });
  };

  const addExtraModule = () => {
    if (!template) return;
    const label = 'Індивідуальний модуль';
    const key = suggestKey(label, effectiveModules.map((m) => m.key));
    const order = Math.max(0, ...effectiveModules.map((m) => m.order + 1), 0);
    const created: PayrollModule = {
      id: newId(),
      key,
      label,
      kind: 'constant',
      role: 'income',
      sectionId: template.sections[0]?.id || 'sec',
      order,
      value: 0,
    };
    patch({ extraModules: [...(assignment?.extraModules || []), created] });
    setExpandedExtraId(created.id);
  };

  const patchExtra = (id: string, p: Partial<PayrollModule>) => {
    patch({
      extraModules: (assignment?.extraModules || []).map((m) => (m.id === id ? { ...m, ...p } : m)),
    });
  };

  return (
    <div className="flex gap-6 items-start">
      <div className="w-56 shrink-0 space-y-1 max-h-[55vh] overflow-y-auto">
        {state.users.map((u) => {
          const a = assignments[u.id];
          const t = templates.find((x) => x.id === a?.templateId);
          return (
            <button
              key={u.id}
              onClick={() => setUserId(u.id)}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                u.id === userId
                  ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200'
                  : 'text-gray-700 hover:bg-gray-100 border border-transparent'
              }`}
            >
              <span className="block truncate">{u.name}</span>
              <span className="block text-xs text-gray-400 truncate">{t?.name || 'Стара схема'}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-w-0 space-y-4">
        {!user ? (
          <p className="text-gray-500 py-8 text-center">Оберіть працівника</p>
        ) : (
          <>
            <div className="flex items-end gap-3 flex-wrap">
              <label className="space-y-1 flex-1 min-w-[220px]">
                <span className="text-xs font-medium text-gray-500">Посада (шаблон зарплати)</span>
                <select
                  className={`${inputCls} w-full bg-white`}
                  value={assignment?.templateId || ''}
                  onChange={(e) => assign(e.target.value)}
                >
                  <option value="">Стара схема (як було до шаблонів)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              {!assignment && (
                <button
                  onClick={migrateFromLegacy}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50"
                  title="Створити шаблон посади з поточних старих налаштувань цього працівника"
                >
                  <Wand2 size={16} /> Перенести стару схему в шаблон
                </button>
              )}
            </div>

            {!template ? (
              <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-4">
                Поки посада не призначена, документи цього працівника рахуються за старою схемою зі
                старих налаштувань. Уже збережені документи це не зачіпає — кожен із них рахується за
                власним знімком.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Модулі посади</h4>
                  <p className="text-xs text-gray-500">
                    Зніміть галочку, щоб прибрати модуль саме в цієї людини, або задайте їй іншу ставку.
                    Шаблон посади при цьому не змінюється.
                  </p>
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
                    {template.modules.map((m) => {
                      const isOff = disabled.has(m.id);
                      const ov = overridableField(m);
                      const current = ov ? (overrides[m.id]?.[ov.field] as number | undefined) : undefined;
                      return (
                        <div key={m.id} className="flex items-center gap-3 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!isOff}
                            onChange={() => toggleModule(m.id)}
                            className="w-4 h-4 rounded border-gray-300 shrink-0"
                          />
                          <div className={`flex-1 min-w-0 ${isOff ? 'opacity-40' : ''}`}>
                            <span className="text-sm text-gray-800 block truncate">{m.label}</span>
                            <span className="text-xs text-gray-400 block truncate">
                              {describeModule(m, new Map(template.modules.map((x) => [x.key, x])))}
                            </span>
                          </div>
                          {ov && !isOff && (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-gray-500">{ov.label}</span>
                              <input
                                type="number"
                                step="any"
                                className={`${inputCls} w-28 ${current !== undefined ? 'border-blue-400 bg-blue-50' : ''}`}
                                placeholder={String((m[ov.field] as number) ?? 0)}
                                value={current ?? ''}
                                onChange={(e) =>
                                  setOverride(
                                    m.id,
                                    ov.field,
                                    e.target.value === '' ? undefined : Number(e.target.value)
                                  )
                                }
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Індивідуальні модулі</h4>
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
                    {(assignment?.extraModules || []).map((m) => (
                      <div key={m.id}>
                        <div className="flex items-center gap-3 px-3 py-2">
                          <button
                            onClick={() => setExpandedExtraId(expandedExtraId === m.id ? '' : m.id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <span className="text-sm text-gray-800 block truncate">{m.label}</span>
                            <span className="text-xs text-gray-400 block truncate">
                              {describeModule(m, new Map(effectiveModules.map((x) => [x.key, x])))}
                            </span>
                          </button>
                          <button
                            onClick={() =>
                              patch({
                                extraModules: (assignment?.extraModules || []).filter((x) => x.id !== m.id),
                              })
                            }
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {expandedExtraId === m.id && (
                          <ModuleEditor
                            module={m}
                            siblings={effectiveModules}
                            sections={[...template.sections].sort((a, b) => a.order - b.order)}
                            onChange={(p) => patchExtra(m.id, p)}
                            onRenameKey={(key) => patchExtra(m.id, { key })}
                          />
                        )}
                      </div>
                    ))}
                    <button
                      onClick={addExtraModule}
                      className="w-full flex items-center gap-1.5 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50/50 font-medium"
                    >
                      <Plus size={14} /> Додати модуль лише для {user.name}
                    </button>
                  </div>
                </div>

                {check.issues.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
                    {check.issues.map((i, idx) => (
                      <div key={idx} className="text-sm text-red-700">{i.message}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ── Модалка ─────────────────────────────────────────────────────────────────

export const PayrollSettingsModal: React.FC<PayrollSettingsModalProps> = ({
  settings,
  onClose,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('templates');
  const [templates, setTemplates] = useState<PayrollTemplate[]>(settings.templates || []);
  const [assignments, setAssignments] = useState<Record<string, PayrollAssignment>>(
    settings.assignments || {}
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Старі поля лишаємо як є: за ними читаються документи, створені до шаблонів
      await onSave({ ...settings, templates, assignments });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string; Icon: typeof Layers }> = [
    { id: 'templates', label: 'Шаблони посад', Icon: Layers },
    { id: 'assignments', label: 'Призначення', Icon: Users },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl flex flex-col max-h-[92vh]">
        <div className="p-6 border-b flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold text-gray-800">Налаштування зарплат</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Посада описується модулями — додавайте, множте, ставте пороги й формули
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pt-4 flex gap-2 border-b">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'templates' ? (
            <PayrollTemplateEditor templates={templates} onChange={setTemplates} />
          ) : (
            <AssignmentsPanel
              settings={settings}
              templates={templates}
              assignments={assignments}
              onChange={setAssignments}
              onCreateTemplate={(t) => setTemplates((prev) => [...prev, t])}
            />
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50"
          >
            Скасувати
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-medium disabled:opacity-50"
          >
            <Save size={18} />
            {isSaving ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
};

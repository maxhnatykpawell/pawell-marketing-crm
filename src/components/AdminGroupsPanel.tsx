import React, { useState } from 'react';
import { useAppContext } from '../App';
import { Shield, Plus, X, Edit3, Trash2, Check, AlertCircle } from 'lucide-react';
import { AccessRights, UserGroup } from '../types';
import { DEFAULT_ALLOWED_VIEWS } from '../lib/views';
import AccessViewsPicker from './AccessViewsPicker';

export default function AdminGroupsPanel() {
  const { state, currentUser, addUserGroup, updateUserGroup, deleteUserGroup, confirmAction } = useAppContext();
  const [expanded, setExpanded] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const defaultRights: AccessRights = {
    canEdit: true,
    allowedViews: [...DEFAULT_ALLOWED_VIEWS],
  };

  const [form, setForm] = useState<{ name: string; rights: AccessRights } | null>(null);

  if (currentUser?.role !== 'admin') return null;

  const openAdd = () => {
    setEditingGroupId(null);
    setForm({ name: '', rights: { ...defaultRights } });
  };

  const openEdit = (group: UserGroup) => {
    setEditingGroupId(group.id);
    setForm({ name: group.name, rights: { ...group.rights } });
  };

  const handleSave = () => {
    if (!form || !form.name.trim()) return;
    
    if (editingGroupId) {
      updateUserGroup(editingGroupId, { name: form.name.trim(), rights: form.rights });
    } else {
      addUserGroup({ name: form.name.trim(), rights: form.rights });
    }
    setForm(null);
    setEditingGroupId(null);
  };

  return (
    <div className="mt-4 border border-indigo-100 rounded-xl overflow-hidden bg-indigo-50/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-indigo-50/60 transition"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/10 flex items-center justify-center">
            <Shield className="w-4 h-4 text-indigo-600" />
          </div>
          <span className="font-bold text-gray-800 text-sm">Групи та Права</span>
        </div>
        <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
          {state.userGroups?.length || 0}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-indigo-100 bg-white/60 p-4 space-y-4">
          
          <div className="space-y-3">
            {(state.userGroups || []).map(group => {
              const isEditing = editingGroupId === group.id;
              
              if (isEditing && form) {
                return (
                  <div key={group.id} className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Назва групи</label>
                      <input 
                        value={form.name} 
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
                      />
                    </div>
                    
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                        <input 
                          type="checkbox" 
                          checked={form.rights.canEdit}
                          onChange={e => setForm({ ...form, rights: { ...form.rights, canEdit: e.target.checked } })}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        Дозволити редагування (створювати/видаляти/змінювати)
                      </label>
                      <p className="text-[10px] text-gray-500 ml-6 mt-0.5">Якщо вимкнено, користувачі цієї групи зможуть лише переглядати інформацію.</p>
                    </div>

                    <AccessViewsPicker
                      allowedViews={form.rights.allowedViews}
                      onChange={views => setForm({ ...form, rights: { ...form.rights, allowedViews: views } })}
                    />

                    <div className="flex gap-2 pt-2">
                      <button onClick={handleSave} className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition flex-1">
                        <Check className="w-3.5 h-3.5" /> Зберегти
                      </button>
                      <button onClick={() => { setForm(null); setEditingGroupId(null); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition">
                        Скасувати
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={group.id} className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:border-indigo-200 transition">
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                      {group.name}
                      {!group.rights.canEdit && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase">Read-only</span>}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {group.rights.allowedViews.length} розділів доступно
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => openEdit(group)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => confirmAction(`Ви впевнені, що хочете видалити групу "${group.name}"? Користувачі цієї групи повернуться до стандартних прав.`, () => deleteUserGroup(group.id))} 
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add New Group Form */}
            {form && !editingGroupId ? (
              <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Назва групи</label>
                  <input 
                    value={form.name} 
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Наприклад: Sales"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
                  />
                </div>
                
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <input 
                      type="checkbox" 
                      checked={form.rights.canEdit}
                      onChange={e => setForm({ ...form, rights: { ...form.rights, canEdit: e.target.checked } })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    Дозволити редагування
                  </label>
                </div>

                <AccessViewsPicker
                  allowedViews={form.rights.allowedViews}
                  onChange={views => setForm({ ...form, rights: { ...form.rights, allowedViews: views } })}
                />

                <div className="flex gap-2 pt-2">
                  <button onClick={handleSave} className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition flex-1">
                    <Check className="w-3.5 h-3.5" /> Створити
                  </button>
                  <button onClick={() => setForm(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition">
                    Скасувати
                  </button>
                </div>
              </div>
            ) : (
              !form && (
                <button 
                  onClick={openAdd}
                  className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 rounded-xl transition font-medium text-sm"
                >
                  <Plus className="w-4 h-4" /> Додати групу
                </button>
              )
            )}
          </div>

        </div>
      )}
    </div>
  );
}

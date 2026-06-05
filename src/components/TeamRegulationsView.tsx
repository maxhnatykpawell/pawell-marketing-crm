import React, { useState, useEffect } from 'react';
import { useAppContext } from '../App';
import { User } from '../types';
import { Target, Activity, Shield, Save, Users, Edit2, Calendar } from 'lucide-react';

const DAYS = [
  { key: 'monday', label: 'Понеділок' },
  { key: 'tuesday', label: 'Вівторок' },
  { key: 'wednesday', label: 'Середа' },
  { key: 'thursday', label: 'Четвер' },
  { key: 'friday', label: "П'ятниця" },
  { key: 'saturday', label: 'Субота' },
  { key: 'sunday', label: 'Неділя' }
];

export default function TeamRegulationsView() {
  const { state, updateUser } = useAppContext();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<User>>({});

  useEffect(() => {
    if (!selectedUserId && state.users.length > 0) {
      setSelectedUserId(state.users[0].id);
    }
  }, [state.users, selectedUserId]);

  const selectedUser = state.users.find(u => u.id === selectedUserId);

  const handleSelectUser = (id: string) => {
    setSelectedUserId(id);
    setIsEditing(false);
    setFormData({});
  };

  const startEditing = () => {
    if (selectedUser) {
      setFormData(selectedUser);
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    if (selectedUserId) {
      updateUser(selectedUserId, formData);
      setIsEditing(false);
    }
  };

  const handleScheduleChange = (dayKey: string, val: string) => {
    setFormData(prev => ({
      ...prev,
      weeklySchedule: {
        ...(prev.weeklySchedule || {}),
        [dayKey]: val
      }
    }));
  };

  return (
    <div className="flex h-full gap-6 w-full max-w-6xl mx-auto">
      {/* Sidebar - Users List */}
      <div className="w-64 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden flex-shrink-0 relative h-[calc(100vh-120px)]">
        <div className="p-4 border-b border-gray-100 flex items-center bg-gray-50 flex-shrink-0">
          <Users className="w-5 h-5 text-blue-600 mr-2" />
          <h2 className="font-bold text-gray-800">Команда</h2>
        </div>
        <div className="p-2 space-y-1 overflow-y-auto flex-1 hidden-scrollbar">
          {state.users.map(u => (
            <button
              key={u.id}
              onClick={() => handleSelectUser(u.id)}
              className={`w-full flex items-center px-3 py-2.5 rounded-lg transition ${selectedUserId === u.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full border border-gray-200 mr-3 shrink-0 bg-white" />
              <div className="text-left overflow-hidden">
                <span className="block font-medium truncate text-sm">{u.name}</span>
                <span className="block text-xs opacity-70 truncate">{u.role || 'Роль не вказана'}</span>
              </div>
            </button>
          ))}
          {state.users.length === 0 && (
            <div className="p-4 text-center text-sm text-gray-500">Немає користувачів.</div>
          )}
        </div>
      </div>

      {/* Main Content - Regulations */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-120px)] overflow-hidden">
        {selectedUser ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0 bg-gray-50/50">
              <div className="flex items-center space-x-4">
                <img src={selectedUser.avatar} alt={selectedUser.name} className="w-14 h-14 rounded-full border border-gray-200 bg-white shadow-sm" />
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedUser.name}</h2>
                  {!isEditing ? (
                    <p className="text-gray-500 font-medium text-sm mt-0.5">{selectedUser.role || 'Роль не вказана'}</p>
                  ) : (
                    <input 
                      type="text" 
                      value={formData.role || ''} 
                      onChange={e => setFormData({...formData, role: e.target.value})}
                      placeholder="Введіть посаду/роль..."
                      className="mt-1 px-3 py-1.5 text-sm border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md outline-none w-64 bg-white"
                    />
                  )}
                </div>
              </div>
              <div>
                {!isEditing ? (
                  <button onClick={startEditing} className="flex items-center px-4 py-2 bg-white border border-gray-200 shadow-sm text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">
                    <Edit2 className="w-4 h-4 mr-2 text-gray-400" />
                    Редагувати
                  </button>
                ) : (
                  <div className="flex space-x-2">
                    <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 font-medium rounded-lg transition">Скасувати</button>
                    <button onClick={handleSave} className="flex items-center px-4 py-2 bg-blue-600 text-white shadow-md font-medium rounded-lg hover:bg-blue-700 transition">
                      <Save className="w-4 h-4 mr-2" />
                      Зберегти
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-8 space-y-8 flex-1 overflow-y-auto hidden-scrollbar">
              {/* Операційна діяльність */}
              <div className="border border-gray-100 rounded-xl p-6 bg-white overflow-hidden shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] border-t border-t-blue-50">
                <h3 className="flex items-center text-lg font-bold text-gray-800 mb-4 inline-flex">
                  <div className="p-1.5 bg-green-50 rounded-lg mr-3"><Activity className="w-5 h-5 text-green-600" /></div>
                  Операційна діяльність (Тижневий шаблон)
                </h3>
                
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-600 mb-2">Загальний опис</h4>
                  {!isEditing ? (
                    <div className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm bg-gray-50/50 p-3 rounded-lg border border-gray-100">
                      {selectedUser.operationalDuties || <span className="text-gray-400 italic">Загальний опис діяльності відсутній.</span>}
                    </div>
                  ) : (
                    <textarea 
                      value={formData.operationalDuties || ''}
                      onChange={e => setFormData({...formData, operationalDuties: e.target.value})}
                      placeholder="Опишіть основні процеси, зони відповідальності..."
                      className="w-full h-24 p-3 border border-gray-300 rounded-xl focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none text-sm leading-relaxed resize-y bg-gray-50 focus:bg-white transition"
                    />
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-600 mb-3 flex items-center">
                    <Calendar className="w-4 h-4 mr-2 opacity-70" /> 
                    Графік на тиждень
                  </h4>
                  <div className="space-y-4">
                    {DAYS.map(day => {
                      const value = isEditing 
                        ? formData.weeklySchedule?.[day.key] || '' 
                        : selectedUser.weeklySchedule?.[day.key] || '';
                      
                      if (!isEditing && !value) {
                        return null;
                      }
                      
                      return (
                        <div key={day.key} className="flex flex-col sm:flex-row gap-2 sm:gap-4 border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                          <div className="sm:w-32 font-semibold text-gray-700 shrink-0 pt-1 text-sm">{day.label}</div>
                          <div className="flex-1">
                            {isEditing ? (
                              <textarea
                                value={value}
                                onChange={(e) => handleScheduleChange(day.key, e.target.value)}
                                placeholder={`Задачі на ${day.label.toLowerCase()}...`}
                                className="w-full h-20 p-2.5 border border-gray-300 rounded-lg focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none text-sm leading-relaxed resize-y bg-gray-50 focus:bg-white transition"
                              />
                            ) : (
                              <div className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm bg-blue-50/30 p-2.5 rounded-lg border border-blue-100/50">
                                {value}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    
                    {!isEditing && (!selectedUser.weeklySchedule || Object.values(selectedUser.weeklySchedule).every(v => !v)) && (
                      <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-500 text-center">
                        <span className="italic block">Щоденний розклад порожній.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Цілі та KPI */}
              <div className="border border-gray-100 rounded-xl p-6 bg-white overflow-hidden shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] border-t border-t-orange-50">
                <h3 className="flex items-center text-lg font-bold text-gray-800 mb-4 inline-flex">
                  <div className="p-1.5 bg-orange-50 rounded-lg mr-3"><Target className="w-5 h-5 text-orange-600" /></div>
                  Цілі та KPI
                </h3>
                {!isEditing ? (
                  <div className="text-gray-700 whitespace-pre-wrap leading-relaxed min-h-[60px] text-sm">
                    {selectedUser.goals || <span className="text-gray-400 italic">Цілі не описані.</span>}
                  </div>
                ) : (
                  <textarea 
                    value={formData.goals || ''}
                    onChange={e => setFormData({...formData, goals: e.target.value})}
                    placeholder="Опишіть основні цілі (Goals) та ключові показники ефективності (KPI)..."
                    className="w-full h-32 p-4 border border-gray-300 rounded-xl focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none text-sm leading-relaxed resize-y bg-gray-50 focus:bg-white transition"
                  />
                )}
              </div>
              
              {!isEditing && !selectedUser.operationalDuties && !selectedUser.goals && (!selectedUser.weeklySchedule || Object.values(selectedUser.weeklySchedule).every(v => !v)) && (
                <div className="p-8 mt-4 text-center bg-gray-50/50 border border-dashed border-gray-200 rounded-xl">
                  <Shield className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Регламент для цього співробітника поки що порожній</p>
                  <button onClick={startEditing} className="mt-4 px-4 py-2 text-sm bg-white border shadow-sm rounded-lg hover:bg-gray-50 transition text-blue-600 font-medium">
                    Заповнити регламент
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-10 text-center">
            <div>
              <Users className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium text-lg">Оберіть учасника команди зліва</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

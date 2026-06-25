import React, { useState, useEffect } from 'react';
import { Project, ProjectStatus } from '../types';
import { useAppContext } from '../App';
import { X, Calendar, Users, Palette, Check, FolderOpen } from 'lucide-react';

interface Props {
  project?: Project;
  onClose: () => void;
}

const COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#d946ef', // fuchsia
  '#f43f5e', // rose
  '#64748b', // slate
];

const STATUS_LABELS: Record<ProjectStatus, string> = {
  'planning': 'Планування',
  'active': 'В процесі',
  'on-hold': 'На паузі',
  'completed': 'Завершено',
};

export default function ProjectModal({ project, onClose }: Props) {
  const { state, addProject, updateProject, currentUser } = useAppContext();
  
  const [title, setTitle] = useState(project?.title || '');
  const [description, setDescription] = useState(project?.description || '');
  const [color, setColor] = useState(project?.color || COLORS[5]); // Default blue
  const [status, setStatus] = useState<ProjectStatus>(project?.status || 'planning');
  const [managerIds, setManagerIds] = useState<string[]>(project?.managerIds || (currentUser ? [currentUser.userId] : []));
  const [deadline, setDeadline] = useState(project?.deadline || '');
  const [groupName, setGroupName] = useState(project?.groupName || '');

  const [isManagerDropdownOpen, setIsManagerDropdownOpen] = useState(false);

  // Collect unique existing group names for autocomplete
  const existingGroups = Array.from(
    new Set(
      (state.projects || [])
        .map(p => p.groupName)
        .filter((g): g is string => !!g && g.trim() !== '')
    )
  ).sort();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.manager-dropdown')) {
        setIsManagerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const data = {
      title: title.trim(),
      description: description.trim(),
      color,
      status,
      managerIds,
      deadline: deadline || null,
      groupName: groupName.trim() || null,
    };

    if (project) {
      updateProject(project.id, data);
    } else {
      addProject(data);
    }
    onClose();
  };

  const toggleManager = (id: string) => {
    setManagerIds(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div 
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl relative flex flex-col max-h-[90vh] my-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-800">
            {project ? 'Редагувати проєкт' : 'Новий проєкт'}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-5 custom-scrollbar">
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Назва проєкту *</label>
            <input
              type="text"
              autoFocus
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
              placeholder="Наприклад: Ребрендинг компанії"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 text-gray-400" />
              Група (папка)
            </label>
            <input
              type="text"
              list="group-suggestions"
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
              placeholder="Наприклад: Q3 2025 або Клієнти…"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
            />
            {existingGroups.length > 0 && (
              <datalist id="group-suggestions">
                {existingGroups.map(g => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            )}
            {groupName.trim() === '' && (
              <p className="text-xs text-gray-400 mt-1">Залиште порожнім — проєкт буде в «Без групи»</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Опис (опціонально)</label>
            <textarea
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none min-h-[100px] resize-y"
              placeholder="Короткий опис цілей та завдань проєкту..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as ProjectStatus)}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white"
              >
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-400" />
                Дедлайн
              </label>
              <input
                type="date"
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-gray-400" />
              Колір мітки
            </label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                  style={{ backgroundColor: c }}
                >
                  {color === c && <Check className="w-4 h-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="relative manager-dropdown">
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-gray-400" />
              Менеджери проєкту
            </label>
            <div 
              onClick={() => setIsManagerDropdownOpen(!isManagerDropdownOpen)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl bg-white cursor-pointer hover:border-blue-400 transition min-h-[42px] flex items-center gap-2 flex-wrap"
            >
              {managerIds.length === 0 ? (
                <span className="text-gray-400 text-sm">Оберіть менеджерів...</span>
              ) : (
                managerIds.map(id => {
                  const user = state.users.find(u => u.id === id);
                  if (!user) return null;
                  return (
                    <div key={id} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium border border-blue-100">
                      <img src={user.avatar} className="w-4 h-4 rounded-full" alt="" />
                      {user.name}
                      <button 
                        type="button" 
                        onClick={(e) => { e.stopPropagation(); toggleManager(id); }}
                        className="hover:text-blue-900 ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {isManagerDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto p-1">
                {state.users.map(user => {
                  const isSelected = managerIds.includes(user.id);
                  return (
                    <div
                      key={user.id}
                      onClick={() => toggleManager(user.id)}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <img src={user.avatar} className="w-6 h-6 rounded-full" alt="" />
                      <span className="text-sm font-medium text-gray-700">{user.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </form>

        <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-xl transition"
          >
            Скасувати
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-sm"
          >
            {project ? 'Зберегти зміни' : 'Створити проєкт'}
          </button>
        </div>
      </div>
    </div>
  );
}

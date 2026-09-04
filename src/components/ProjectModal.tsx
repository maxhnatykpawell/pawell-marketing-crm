import React, { useState, useEffect } from 'react';
import { Project, ProjectStatus } from '../types';
import { useAppContext } from '../App';
import { X, Calendar, Users, Palette, Check, FolderOpen, Lock, Globe, Crown, UserPlus, AlertTriangle } from 'lucide-react';
import { canManageProjectAccess, projectAccessIds } from '../lib/projectAccess';

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
  const [ownerId, setOwnerId] = useState<string>(project?.ownerId || currentUser?.userId || '');
  const [memberIds, setMemberIds] = useState<string[]>(project?.memberIds || []);

  const [isManagerDropdownOpen, setIsManagerDropdownOpen] = useState(false);
  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);

  /**
   * Склад доступу міняють адмін і власник. Новий проєкт створює власник, тож
   * там питати нема про що.
   */
  const canManageAccess = project
    ? canManageProjectAccess(project, currentUser || { userId: '' })
    : true;

  const isRestricted = memberIds.length > 0;
  const accessIds = projectAccessIds({ ownerId, managerIds, memberIds });

  /**
   * Виконавці, які після закриття проєкту не побачать власних задач.
   *
   * Найімовірніша поломка цієї механіки — закрити проєкт і забути про людей,
   * які вже в ньому працюють: задача лишається призначеною, а на екрані її
   * немає. Тому показуємо їх одразу й даємо додати одним рухом.
   */
  const strandedAssignees = !project || !isRestricted ? [] : Array.from(new Set(
    state.cards
      .filter(c => c.projectId === project.id && c.assigneeId)
      .map(c => c.assigneeId as string)
      .filter(id => !accessIds.includes(id)),
  )).map(id => state.users.find(u => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);

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
      const target = e.target as Element;
      if (!target.closest('.manager-dropdown')) setIsManagerDropdownOpen(false);
      if (!target.closest('.member-dropdown')) setIsMemberDropdownOpen(false);
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
      // Поля доступу пише лише той, хто має на це право: інакше менеджер,
      // редагуючи назву, тихо перезаписав би склад доступу тим, що бачив.
      ...(canManageAccess ? { ownerId: ownerId || null, memberIds } : {}),
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

  const toggleMember = (id: string) => {
    setMemberIds(prev =>
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

          {/*
            Доступ до проєкту. Порожній список учасників — проєкт спільний;
            перший доданий учасник закриває його для решти команди. Правило
            описане в lib/projectAccess, тут лише його видима частина.
          */}
          {canManageAccess && (
            <div className="pt-4 border-t border-gray-100 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-gray-400" />
                  Доступ до проєкту
                </label>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
                    isRestricted ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                 : 'bg-gray-100 text-gray-600 border border-gray-200'
                  }`}
                >
                  {isRestricted ? <><Lock className="w-3 h-3" /> Лише для своїх</>
                                : <><Globe className="w-3 h-3" /> Бачить уся команда</>}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-gray-400" />
                  Власник
                </label>
                <select
                  value={ownerId}
                  onChange={e => setOwnerId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="">Без власника</option>
                  {state.users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div className="relative member-dropdown">
                <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-gray-400" />
                  Учасники з доступом
                </label>
                <div
                  onClick={() => setIsMemberDropdownOpen(!isMemberDropdownOpen)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl bg-white cursor-pointer hover:border-blue-400 transition min-h-[42px] flex items-center gap-2 flex-wrap"
                >
                  {memberIds.length === 0 ? (
                    <span className="text-gray-400 text-sm">Нікого не додано — проєкт відкритий</span>
                  ) : (
                    memberIds.map(id => {
                      const user = state.users.find(u => u.id === id);
                      if (!user) return null;
                      return (
                        <div key={id} className="flex items-center gap-1.5 bg-amber-50 text-amber-800 px-2 py-0.5 rounded text-xs font-medium border border-amber-100">
                          <img src={user.avatar} className="w-4 h-4 rounded-full" alt="" />
                          {user.name}
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); toggleMember(id); }}
                            className="hover:text-amber-950 ml-1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {isMemberDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto p-1">
                    {state.users.map(user => {
                      const isSelected = memberIds.includes(user.id);
                      // Власник і менеджери мають доступ і без цього списку —
                      // кажемо про це, щоб їх не додавали «про всяк випадок».
                      const already = !isSelected && (user.id === ownerId || managerIds.includes(user.id));
                      return (
                        <div
                          key={user.id}
                          onClick={() => toggleMember(user.id)}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition"
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <img src={user.avatar} className="w-6 h-6 rounded-full" alt="" />
                          <span className="text-sm font-medium text-gray-700">{user.name}</span>
                          {already && <span className="text-[11px] text-gray-400 ml-auto">уже має доступ</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-1.5">
                  {isRestricted
                    ? 'Проєкт і його задачі бачать лише власник, менеджери й ці люди. Адміністратори бачать усе.'
                    : 'Поки нікого не додано, проєкт і його задачі бачить уся команда. Додайте бодай одного — і проєкт закриється для решти.'}
                </p>
              </div>

              {strandedAssignees.length > 0 && (
                <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 text-xs text-red-800">
                    <p className="font-semibold mb-0.5">Втратять свої задачі з очей</p>
                    <p className="mb-1.5">
                      У цьому проєкті є задачі, призначені на {strandedAssignees.map(u => u.name).join(', ')}.
                      Без доступу вони їх не побачать.
                    </p>
                    <button
                      type="button"
                      onClick={() => setMemberIds(prev => [...prev, ...strandedAssignees.map(u => u.id)])}
                      className="font-semibold text-red-700 hover:text-red-900 underline"
                    >
                      Додати їх до проєкту
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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

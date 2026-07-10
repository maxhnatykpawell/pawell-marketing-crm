import React, { useState } from 'react';
import { useAppContext } from '../App';
import { Project } from '../types';
import ProjectModal from './ProjectModal';
import {
  FolderKanban, FolderOpen, Folder, Plus, Calendar, CheckSquare,
  Trash2, Edit2, Play, Pause, CheckCircle2, ChevronDown, ChevronRight,
  Pencil, Check, X
} from 'lucide-react';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

const UNGROUPED_KEY = '__ungrouped__';

export default function ProjectsView() {
  const { state, currentUser, deleteProject, updateProject, setActiveView, setActiveProjectId, confirmAction, hasEditRights } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>();
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed'>('all');

  // Which groups are collapsed
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Inline group rename state: { groupKey: 'currentName', value: 'editing...' }
  const [renamingGroup, setRenamingGroup] = useState<{ key: string; value: string } | null>(null);

  const projects = state.projects || [];

  const filteredProjects = projects.filter(p => {
    if (filterStatus === 'active') return p.status !== 'completed';
    if (filterStatus === 'completed') return p.status === 'completed';
    return true;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Build groups: Map<groupKey, { label, projects }>
  const groupMap = new Map<string, { label: string; projects: Project[] }>();
  filteredProjects.forEach(p => {
    const key = p.groupName?.trim() || UNGROUPED_KEY;
    const label = key === UNGROUPED_KEY ? 'Без групи' : key;
    if (!groupMap.has(key)) groupMap.set(key, { label, projects: [] });
    groupMap.get(key)!.projects.push(p);
  });

  // Named groups first (sorted), then ungrouped
  const sortedKeys = [
    ...[...groupMap.keys()].filter(k => k !== UNGROUPED_KEY).sort(),
    ...(groupMap.has(UNGROUPED_KEY) ? [UNGROUPED_KEY] : []),
  ];

  const toggleCollapse = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleEdit = (p: Project) => {
    setEditingProject(p);
    setIsModalOpen(true);
  };

  const handleOpenProjectBoard = (p: Project) => {
    setActiveProjectId(p.id);
    setActiveView('board');
  };

  // Rename group: update all projects in the group
  const handleRenameCommit = (oldKey: string) => {
    if (!renamingGroup) return;
    const newName = renamingGroup.value.trim();
    const group = groupMap.get(oldKey);
    if (!group) return;
    group.projects.forEach(p => {
      updateProject(p.id, { groupName: newName || null });
    });
    setRenamingGroup(null);
  };

  // Delete group: clear groupName for all projects inside
  const handleDeleteGroup = (key: string) => {
    const group = groupMap.get(key);
    if (!group) return;
    confirmAction(
      `Видалити групу «${group.label}»? Проєкти залишаться, але перейдуть у «Без групи».`,
      () => {
        group.projects.forEach(p => updateProject(p.id, { groupName: null }));
      }
    );
  };

  const getStatusIcon = (status: Project['status']) => {
    switch (status) {
      case 'active': return <Play className="w-3.5 h-3.5" />;
      case 'on-hold': return <Pause className="w-3.5 h-3.5" />;
      case 'completed': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'planning': return <Calendar className="w-3.5 h-3.5" />;
    }
  };

  const getStatusBg = (status: Project['status']) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'on-hold': return 'bg-amber-100 text-amber-700';
      case 'completed': return 'bg-purple-100 text-purple-700';
      case 'planning': return 'bg-blue-100 text-blue-700';
    }
  };

  const getStatusLabel = (status: Project['status']) => {
    switch (status) {
      case 'active': return 'В процесі';
      case 'on-hold': return 'На паузі';
      case 'completed': return 'Завершено';
      case 'planning': return 'Планування';
    }
  };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-2">
            <FolderKanban className="w-6 h-6 text-blue-600" />
            Проєкти
          </h1>
          <p className="text-sm text-gray-500 max-w-xl">
            Організація та групування пов'язаних завдань. Проєкти дозволяють відслідковувати прогрес по великих цілях.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-gray-100 p-1 rounded-xl flex">
            {[
              { id: 'all', label: 'Всі' },
              { id: 'active', label: 'Активні' },
              { id: 'completed', label: 'Завершені' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilterStatus(f.id as any)}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${filterStatus === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {hasEditRights && (isAdmin || currentUser) && (
            <button
              onClick={() => { setEditingProject(undefined); setIsModalOpen(true); }}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition shadow-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Новий проєкт
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
            <FolderKanban className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Немає проєктів</h3>
          <p className="text-gray-500 max-w-md mb-6">Створіть свій перший проєкт, щоб згрупувати задачі та відстежувати загальний прогрес.</p>
          {hasEditRights && (
            <button
              onClick={() => { setEditingProject(undefined); setIsModalOpen(true); }}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition"
            >
              Створити проєкт
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {sortedKeys.map(groupKey => {
            const group = groupMap.get(groupKey)!;
            const isCollapsed = collapsedGroups.has(groupKey);
            const isUngrouped = groupKey === UNGROUPED_KEY;
            const isRenaming = renamingGroup?.key === groupKey;

            return (
              <div key={groupKey} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Group header */}
                <div
                  className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none hover:bg-gray-50 transition group border-b border-gray-100"
                  onClick={() => {
                    if (!isRenaming) toggleCollapse(groupKey);
                  }}
                >
                  <span className="text-gray-400 shrink-0">
                    {isCollapsed
                      ? <ChevronRight className="w-4 h-4" />
                      : <ChevronDown className="w-4 h-4" />}
                  </span>

                  <span className="text-gray-400 shrink-0">
                    {isCollapsed
                      ? <Folder className="w-4.5 h-4.5" />
                      : <FolderOpen className="w-4.5 h-4.5 text-blue-500" />}
                  </span>

                  {/* Name / inline edit */}
                  {isRenaming && !isUngrouped ? (
                    <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        className="flex-1 text-sm font-semibold text-gray-800 border border-blue-400 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-blue-300"
                        value={renamingGroup.value}
                        onChange={e => setRenamingGroup({ key: groupKey, value: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameCommit(groupKey);
                          if (e.key === 'Escape') setRenamingGroup(null);
                        }}
                      />
                      <button
                        onClick={() => handleRenameCommit(groupKey)}
                        className="p-1 text-green-600 hover:bg-green-50 rounded-lg transition"
                        title="Зберегти"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setRenamingGroup(null)}
                        className="p-1 text-gray-400 hover:bg-gray-100 rounded-lg transition"
                        title="Скасувати"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <span className={`flex-1 text-sm font-semibold ${isUngrouped ? 'text-gray-400 italic' : 'text-gray-800'}`}>
                      {group.label}
                    </span>
                  )}

                  <span className="text-xs text-gray-400 font-medium shrink-0 ml-1">
                    {group.projects.length} {group.projects.length === 1 ? 'проєкт' : group.projects.length < 5 ? 'проєкти' : 'проєктів'}
                  </span>

                  {/* Group actions — only for named groups, admin */}
                  {hasEditRights && isAdmin && !isUngrouped && !isRenaming && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setRenamingGroup({ key: groupKey, value: group.label })}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="Перейменувати групу"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(groupKey)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Видалити групу"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Projects grid */}
                {!isCollapsed && (
                  <div className="p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {group.projects.map(project => {
                        const projectCards = state.cards.filter(c => c.projectId === project.id);
                        const totalCards = projectCards.length;

                        const completedCards = projectCards.filter(c => {
                          const boardLists = state.lists.filter(l =>
                            state.boards?.length
                              ? l.boardId === (state.lists.find(x => x.id === c.listId)?.boardId || state.boards[0].id)
                              : true
                          ).sort((a, b) => a.order - b.order);
                          const lastList = boardLists[boardLists.length - 1];
                          return lastList && c.listId === lastList.id;
                        }).length;

                        const progress = totalCards === 0 ? 0 : Math.round((completedCards / totalCards) * 100);

                        return (
                          <div key={project.id} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 transition flex flex-col">
                            <div className="h-1.5 w-full" style={{ backgroundColor: project.color }} />
                            <div className="p-4 flex-1 flex flex-col">
                              <div className="flex justify-between items-start mb-3">
                                <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 uppercase tracking-wide ${getStatusBg(project.status)}`}>
                                  {getStatusIcon(project.status)}
                                  {getStatusLabel(project.status)}
                                </span>
                                {hasEditRights && (isAdmin || project.managerIds.includes(currentUser?.userId || '')) && (
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => handleEdit(project)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Редагувати">
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => confirmAction('Видалити цей проєкт? Задачі не будуть видалені, але втратять прив\'язку до проєкту.', () => deleteProject(project.id))}
                                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                      title="Видалити"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              <h3 className="text-base font-bold text-gray-900 mb-1 leading-tight">{project.title}</h3>
                              {project.description && (
                                <p className="text-sm text-gray-500 line-clamp-2 mb-3">{project.description}</p>
                              )}

                              <div className="mt-auto space-y-3 pt-3">
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                  <div className="flex items-center gap-1.5" title="Дедлайн">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {project.deadline ? format(new Date(project.deadline), 'd MMM yyyy', { locale: uk }) : 'Без дедлайну'}
                                  </div>
                                  <div className="flex items-center gap-1.5" title="Задачі (Виконано / Всього)">
                                    <CheckSquare className="w-3.5 h-3.5" />
                                    {completedCards} / {totalCards}
                                  </div>
                                </div>

                                <div>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="font-medium text-gray-700">Прогрес</span>
                                    <span className="font-bold text-gray-900">{progress}%</span>
                                  </div>
                                  <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full transition-all duration-500 ease-out"
                                      style={{ width: `${progress}%`, backgroundColor: project.color }}
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                                  <div className="flex -space-x-2">
                                    {project.managerIds.slice(0, 3).map(id => {
                                      const user = state.users.find(u => u.id === id);
                                      if (!user) return null;
                                      return <img key={id} src={user.avatar} className="w-6 h-6 rounded-full border-2 border-white ring-1 ring-gray-100" title={user.name} alt="" />;
                                    })}
                                    {project.managerIds.length > 3 && (
                                      <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-100 text-gray-600 text-[10px] font-bold flex items-center justify-center">
                                        +{project.managerIds.length - 3}
                                      </div>
                                    )}
                                    {project.managerIds.length === 0 && (
                                      <span className="text-xs text-gray-400">Немає менеджерів</span>
                                    )}
                                  </div>

                                  <button
                                    onClick={() => handleOpenProjectBoard(project)}
                                    className="text-xs font-medium text-blue-600 hover:text-blue-800 transition px-2 py-1 hover:bg-blue-50 rounded-lg"
                                  >
                                    Дошка задач →
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <ProjectModal
          project={editingProject}
          onClose={() => { setIsModalOpen(false); setEditingProject(undefined); }}
        />
      )}
    </div>
  );
}

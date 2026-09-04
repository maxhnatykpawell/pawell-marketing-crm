/**
 * Пісочниця для доступів до проєктів: справжні ProjectsView і ProjectModal на
 * вигаданій команді.
 *
 * Потрібна, щоб побачити правило доступу очима різних людей, не заводячи
 * облікові записи й не входячи в систему. Перемикач угорі підміняє того, хто
 * дивиться, а стан звужується тим самим scopeStateToUser, що й у застосунку —
 * тобто перевіряємо саме бойове правило, а не його переказ.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { AppContext } from '../src/App';
import ProjectsView from '../src/components/ProjectsView';
import { scopeStateToUser } from '../src/lib/projectAccess';
import { Card, Project } from '../src/types';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.toISOString().slice(0, 10)}T00:00:00.000Z`;
};

const users = [
  { id: 'u1', name: 'Максим (власник)', avatar: 'https://i.pravatar.cc/40?img=12' },
  { id: 'u2', name: 'Олена (менеджер)', avatar: 'https://i.pravatar.cc/40?img=45' },
  { id: 'u3', name: 'Ігор (учасник)', avatar: 'https://i.pravatar.cc/40?img=33' },
  { id: 'u9', name: 'Ніна (не додана)', avatar: 'https://i.pravatar.cc/40?img=24' },
];

const initialProjects: Project[] = [
  {
    id: 'p1', title: 'Осінній запуск', description: 'Відкритий проєкт — бачить уся команда',
    color: '#6366f1', status: 'active', ownerId: 'u1', managerIds: ['u1', 'u2'], memberIds: [],
    deadline: day(16), createdAt: day(-30),
  },
  {
    id: 'p2', title: 'Ребрендинг (закритий)', description: 'Доступ лише в своїх',
    color: '#f43f5e', status: 'planning', ownerId: 'u1', managerIds: ['u2'], memberIds: ['u3'],
    deadline: day(40), createdAt: day(-10),
  },
  {
    id: 'p3', title: 'Проєкт з історії', description: 'Полів доступу не має — лишається відкритим',
    color: '#22c55e', status: 'active', managerIds: ['u2'], deadline: null, createdAt: day(-90),
  } as Project,
];

const initialCards: Card[] = [
  { id: 'c1', listId: 'l1', title: 'Бриф', description: '', deadline: day(2), assigneeId: 'u2', subtasks: [], comments: [], attachments: [], order: 0, projectId: 'p1' },
  { id: 'c2', listId: 'l1', title: 'Гайдлайн', description: '', deadline: day(5), assigneeId: 'u3', subtasks: [], comments: [], attachments: [], order: 1, projectId: 'p2' },
  // Задача закритого проєкту на людині, якій доступу не дали — саме про такі
  // модалка проєкту й попереджає
  { id: 'c3', listId: 'l1', title: 'Логотип', description: '', deadline: day(7), assigneeId: 'u9', subtasks: [], comments: [], attachments: [], order: 2, projectId: 'p2' },
  { id: 'c4', listId: 'l2', title: 'Задача без проєкту', description: '', deadline: null, assigneeId: 'u9', subtasks: [], comments: [], attachments: [], order: 3, projectId: null },
];

const VIEWERS = [
  { userId: 'u1', role: 'member' as const, label: 'Максим — власник' },
  { userId: 'u2', role: 'member' as const, label: 'Олена — менеджер' },
  { userId: 'u3', role: 'member' as const, label: 'Ігор — учасник' },
  { userId: 'u9', role: 'member' as const, label: 'Ніна — не додана' },
  { userId: 'u9', role: 'admin' as const, label: 'Ніна, але адміністратор' },
];

function Harness() {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [cards] = useState<Card[]>(initialCards);
  const [viewerIndex, setViewerIndex] = useState(0);

  const viewer = VIEWERS[viewerIndex];
  const currentUser = {
    userId: viewer.userId,
    role: viewer.role,
    name: users.find(u => u.id === viewer.userId)?.name || '',
    email: '', avatar: '',
  };

  const fullState: any = {
    projects, cards, users,
    lists: [{ id: 'l1', title: 'В роботі', order: 0, boardId: 'b1' }],
    boards: [{ id: 'b1', title: 'Маркетинг' }], tags: [], userGroups: [],
  };

  // Те саме звуження, що робить App перед тим, як покласти стан у контекст
  const state = scopeStateToUser(fullState, currentUser);

  const value: any = {
    state,
    currentUser,
    hasEditRights: true,
    setActiveView: (view: string) => console.log('[access] setActiveView', view),
    setActiveProjectId: (id: string | null) => console.log('[access] setActiveProjectId', id),
    confirmAction: (message: string, onConfirm: () => void) => { console.log('[access] confirm', message); onConfirm(); },
    addProject: (p: any) => {
      console.log('[access] addProject', JSON.stringify(p));
      setProjects(prev => [...prev, { ...p, id: `new-${prev.length + 1}`, createdAt: day(0) }]);
    },
    updateProject: (id: string, updates: any) => {
      console.log('[access] updateProject', id, JSON.stringify(updates));
      setProjects(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));
    },
    deleteProject: (id: string) => setProjects(prev => prev.filter(p => p.id !== id)),
  };

  return (
    <AppContext.Provider value={value}>
      <div className="bg-gray-100 min-h-screen p-6 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-500 mr-2">Дивиться:</span>
          {VIEWERS.map((v, i) => (
            <button
              key={v.label}
              onClick={() => setViewerIndex(i)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                i === viewerIndex ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {v.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400">
            видно проєктів: {state.projects.length} з {projects.length} · карток: {state.cards.length} з {cards.length}
          </span>
        </div>
        <ProjectsView />
      </div>
    </AppContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);

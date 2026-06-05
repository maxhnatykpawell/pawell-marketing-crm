import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState, AuthUser, Card, List, User, Tag, ContentPlanItem, EventItem, Metric } from './types';
import { fetchState, syncState, getMe } from './api';
import { v4 as uuidv4 } from 'uuid';
import Board from './components/Board';
import ContentPlanView from './components/ContentPlanView';
import TeamManager from './components/TeamManager';
import EventCalendarView from './components/EventCalendarView';
import MasterCalendarView from './components/MasterCalendarView';
import EventPageView from './components/EventPageView';
import TeamRegulationsView from './components/TeamRegulationsView';
import DashboardView from './components/DashboardView';
import MyProfileView from './components/MyProfileView';
import LoginPage from './components/LoginPage';
import ProjectsView from './components/ProjectsView';
import { Loader2, Users, Kanban, Calendar, CalendarDays, LayoutGrid, BookOpen, BarChart, User as UserIcon, LogOut, FolderKanban } from 'lucide-react';

type ActiveView = 'dashboard' | 'projects' | 'board' | 'content' | 'events' | 'calendar' | 'event-details' | 'regulations' | 'profile';

interface AppContextType {
  state: AppState;
  currentUser: AuthUser | null;
  logout: () => void;
  moveCard: (cardId: string, toListId: string) => void;
  addCard: (listId: string, title: string) => void;
  updateCard: (cardId: string, updates: Partial<Card>) => void;
  deleteCard: (cardId: string) => void;
  addList: (title: string) => void;
  deleteList: (listId: string) => void;
  addTag: (tag: Omit<Tag, 'id'>) => void;
  deleteTag: (tagId: string) => void;
  updateTag: (tagId: string, updates: Partial<Tag>) => void;
  addUser: (name: string, avatar?: string) => void;
  updateUser: (userId: string, updates: Partial<User>) => void;
  deleteUser: (userId: string) => void;
  addContentPlan: (item: Omit<ContentPlanItem, 'id'>) => void;
  updateContentPlan: (id: string, updates: Partial<ContentPlanItem>) => void;
  deleteContentPlan: (id: string) => void;
  updateSettings: (updates: Partial<Pick<AppState, 'contentPlanChannels' | 'contentPlanStatuses' | 'contentPlanColumns'>>) => void;
  addEvent: (item: Omit<EventItem, 'id'>) => void;
  updateEvent: (id: string, updates: Partial<EventItem>) => void;
  deleteEvent: (id: string) => void;
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addBoard: (title: string) => void;
  deleteBoard: (id: string) => void;
  activeBoardId: string | null;
  setActiveBoardId: (id: string | null) => void;
  activeEventId: string | null;
  setActiveEventId: (id: string | null) => void;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  updateMetric: (id: string, updates: Partial<Metric>) => void;
  importTrelloBoard: (trelloJson: string) => void;
  confirmAction: (message: string, onConfirm: () => void) => void;
}

export const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
};

// ── Loading Screen ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 mb-6">
        <span className="text-white font-black text-2xl">K</span>
      </div>
      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      <p className="text-gray-500 text-sm mt-3">Завантаження...</p>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isTeamManagerOpen, setIsTeamManagerOpen] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void } | null>(null);

  const confirmAction = useCallback((message: string, onConfirm: () => void) => {
    setConfirmDialog({ message, onConfirm });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setCurrentUser(null);
    setState(null);
    setAuthChecked(true);
    setLoading(false);
  }, []);

  // ── Auth check on startup ──────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setAuthChecked(true);
      setLoading(false);
      return;
    }
    getMe()
      .then(user => {
        setCurrentUser(user);
        return fetchState();
      })
      .then(data => {
        const stateWithDefaults = {
          ...data,
          metrics: data.metrics || [
            { id: 'm1', title: 'Охоплення аудиторії', value: '124.5K', trend: '+12%', trendPositive: true },
            { id: 'm2', title: 'Лідів (MQL)', value: '840', trend: '+5%', trendPositive: true },
            { id: 'm3', title: 'Бюджет використано', value: '$4,250', trend: '-2%', trendPositive: false },
            { id: 'm4', title: 'Вартість ліда (CPA)', value: '$5.05', trend: '-8%', trendPositive: true }
          ]
        };
        setState(stateWithDefaults);
        if (stateWithDefaults.boards && stateWithDefaults.boards.length > 0) {
          setActiveBoardId(stateWithDefaults.boards[0].id);
        }
        setLoading(false);
        setAuthChecked(true);
      })
      .catch(() => {
        localStorage.removeItem('auth_token');
        setLoading(false);
        setAuthChecked(true);
      });
  }, []);

  // ── Real-time sync: poll for remote changes every 30s ─────────────────────
  useEffect(() => {
    if (!currentUser) return;

    const lastModifiedRef = { current: '' };

    const poll = async () => {
      try {
        const newState = await fetchState();
        const newTs: string = (newState as any).lastModified || '';
        if (newTs && newTs !== lastModifiedRef.current) {
          lastModifiedRef.current = newTs;
          setState(newState);
        }
      } catch { /* silent - don't interrupt user on poll error */ }
    };

    const interval = setInterval(poll, 30000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [currentUser]);

  // ── Handle login from LoginPage ────────────────────────────────────────────
  const handleLogin = useCallback((user: AuthUser, _token: string) => {
    setCurrentUser(user);
    setLoading(true);
    fetchState()
      .then(data => {
        const stateWithDefaults = {
          ...data,
          metrics: data.metrics || [
            { id: 'm1', title: 'Охоплення аудиторії', value: '124.5K', trend: '+12%', trendPositive: true },
            { id: 'm2', title: 'Лідів (MQL)', value: '840', trend: '+5%', trendPositive: true },
            { id: 'm3', title: 'Бюджет використано', value: '$4,250', trend: '-2%', trendPositive: false },
            { id: 'm4', title: 'Вартість ліда (CPA)', value: '$5.05', trend: '-8%', trendPositive: true }
          ]
        };
        setState(stateWithDefaults);
        if (stateWithDefaults.boards && stateWithDefaults.boards.length > 0) {
          setActiveBoardId(stateWithDefaults.boards[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const saveState = useCallback((newState: AppState) => {
    setState(newState);
    syncState(newState).catch(console.error);
  }, []);

  // ── State mutations ────────────────────────────────────────────────────────

  const moveCard = useCallback((cardId: string, toListId: string) => {
    if (!state) return;
    saveState({ ...state, cards: state.cards.map(c => c.id === cardId ? { ...c, listId: toListId } : c) });
  }, [state, saveState]);

  const addCard = useCallback((listId: string, title: string) => {
    if (!state) return;
    const newCard: Card = {
      id: uuidv4(), listId, title, description: '', deadline: null,
      assigneeId: null, subtasks: [], comments: [], attachments: [],
      order: state.cards.filter(c => c.listId === listId).length
    };
    saveState({ ...state, cards: [...state.cards, newCard] });
  }, [state, saveState]);

  const updateCard = useCallback((cardId: string, updates: Partial<Card>) => {
    if (!state) return;
    saveState({ ...state, cards: state.cards.map(c => c.id === cardId ? { ...c, ...updates } : c) });
  }, [state, saveState]);

  const deleteCard = useCallback((cardId: string) => {
    if (!state) return;
    saveState({ ...state, cards: state.cards.filter(c => c.id !== cardId) });
  }, [state, saveState]);

  const addList = useCallback((title: string) => {
    if (!state) return;
    const targetBoardId = activeBoardId || (state.boards && state.boards.length > 0 ? state.boards[0].id : undefined);
    const newList: List = { id: uuidv4(), title, order: state.lists.filter(l => l.boardId === targetBoardId).length, boardId: targetBoardId };
    saveState({ ...state, lists: [...state.lists, newList] });
  }, [state, saveState, activeBoardId]);

  const deleteList = useCallback((listId: string) => {
    if (!state) return;
    saveState({ ...state, lists: state.lists.filter(l => l.id !== listId), cards: state.cards.filter(c => c.listId !== listId) });
  }, [state, saveState]);

  const addTag = useCallback((tag: Omit<Tag, 'id'>) => {
    if (!state) return;
    saveState({ ...state, tags: [...(state.tags || []), { ...tag, id: uuidv4() }] });
  }, [state, saveState]);

  const deleteTag = useCallback((tagId: string) => {
    if (!state) return;
    saveState({
      ...state,
      tags: state.tags?.filter(t => t.id !== tagId) || [],
      cards: state.cards.map(c => ({ ...c, tagIds: c.tagIds?.filter(tId => tId !== tagId) || [] }))
    });
  }, [state, saveState]);

  const updateTag = useCallback((tagId: string, updates: Partial<Tag>) => {
    if (!state) return;
    saveState({ ...state, tags: state.tags?.map(t => t.id === tagId ? { ...t, ...updates } : t) || [] });
  }, [state, saveState]);

  const addUser = useCallback((name: string, avatar?: string) => {
    if (!state) return;
    const newUser: User = { id: uuidv4(), name, avatar: avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random` };
    saveState({ ...state, users: [...state.users, newUser] });
  }, [state, saveState]);

  const updateUser = useCallback((userId: string, updates: Partial<User>) => {
    if (!state) return;
    saveState({ ...state, users: state.users.map(u => u.id === userId ? { ...u, ...updates } : u) });
    // Refresh currentUser if updating own profile
    if (currentUser && userId === currentUser.userId) {
      if (updates.name) setCurrentUser(prev => prev ? { ...prev, name: updates.name! } : prev);
      if (updates.avatar) setCurrentUser(prev => prev ? { ...prev, avatar: updates.avatar! } : prev);
    }
  }, [state, saveState, currentUser]);

  const deleteUser = useCallback((userId: string) => {
    if (!state) return;
    saveState({
      ...state,
      users: (state.users || []).filter(u => u.id !== userId),
      cards: (state.cards || []).map(c => ({ ...c, assigneeId: c.assigneeId === userId ? null : c.assigneeId, subtasks: (c.subtasks || []).map(st => ({ ...st, assigneeId: st.assigneeId === userId ? null : st.assigneeId })) })),
      contentPlans: (state.contentPlans || []).map(cp => ({ ...cp, assigneeId: cp.assigneeId === userId ? null : cp.assigneeId })),
      events: (state.events || []).map(e => ({ ...e, assigneeIds: (e.assigneeIds || []).filter(id => id !== userId) }))
    });
  }, [state, saveState]);

  const addContentPlan = useCallback((item: Omit<ContentPlanItem, 'id'>) => {
    if (!state) return;
    saveState({ ...state, contentPlans: [...(state.contentPlans || []), { ...item, id: uuidv4() }] });
  }, [state, saveState]);

  const updateContentPlan = useCallback((id: string, updates: Partial<ContentPlanItem>) => {
    if (!state) return;
    saveState({ ...state, contentPlans: (state.contentPlans || []).map(cp => cp.id === id ? { ...cp, ...updates } : cp) });
  }, [state, saveState]);

  const deleteContentPlan = useCallback((id: string) => {
    if (!state) return;
    saveState({ ...state, contentPlans: (state.contentPlans || []).filter(cp => cp.id !== id) });
  }, [state, saveState]);

  const updateSettings = useCallback((updates: Partial<Pick<AppState, 'contentPlanChannels' | 'contentPlanStatuses' | 'contentPlanColumns'>>) => {
    if (!state) return;
    saveState({ ...state, ...updates });
  }, [state, saveState]);

  const addEvent = useCallback((item: Omit<EventItem, 'id'>) => {
    if (!state) return;
    saveState({ ...state, events: [...(state.events || []), { ...item, id: uuidv4() }] });
  }, [state, saveState]);

  const updateEvent = useCallback((id: string, updates: Partial<EventItem>) => {
    if (!state) return;
    saveState({ ...state, events: (state.events || []).map(e => e.id === id ? { ...e, ...updates } : e) });
  }, [state, saveState]);

  const deleteEvent = useCallback((id: string) => {
    if (!state) return;
    saveState({ ...state, events: (state.events || []).filter(e => e.id !== id) });
  }, [state, saveState]);

  const addProject = useCallback((project: Omit<Project, 'id' | 'createdAt'>) => {
    if (!state) return;
    const newProject: Project = { ...project, id: uuidv4(), createdAt: new Date().toISOString() };
    saveState({ ...state, projects: [...(state.projects || []), newProject] });
  }, [state, saveState]);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    if (!state) return;
    saveState({ ...state, projects: (state.projects || []).map(p => p.id === id ? { ...p, ...updates } : p) });
  }, [state, saveState]);

  const deleteProject = useCallback((id: string) => {
    if (!state) return;
    saveState({ 
      ...state, 
      projects: (state.projects || []).filter(p => p.id !== id),
      cards: state.cards.map(c => c.projectId === id ? { ...c, projectId: null } : c)
    });
    if (activeProjectId === id) setActiveProjectId(null);
  }, [state, saveState, activeProjectId]);

  const addBoard = useCallback((title: string) => {
    if (!state) return;
    const newBoard = { id: uuidv4(), title };
    saveState({ ...state, boards: [...(state.boards || []), newBoard] });
    setActiveBoardId(newBoard.id);
  }, [state, saveState]);

  const deleteBoard = useCallback((id: string) => {
    if (!state) return;
    const remainingBoards = (state.boards || []).filter(b => b.id !== id);
    const listsToRemove = state.lists.filter(l => l.boardId === id).map(l => l.id);
    saveState({ ...state, boards: remainingBoards, lists: state.lists.filter(l => l.boardId !== id), cards: state.cards.filter(c => !listsToRemove.includes(c.listId)) });
    if (activeBoardId === id) setActiveBoardId(remainingBoards.length > 0 ? remainingBoards[0].id : null);
  }, [state, saveState, activeBoardId]);

  const updateMetric = useCallback((id: string, updates: Partial<Metric>) => {
    if (!state) return;
    saveState({ ...state, metrics: (state.metrics || []).map(m => m.id === id ? { ...m, ...updates } : m) });
  }, [state, saveState]);

  const importTrelloBoard = useCallback((trelloJson: string) => {
    if (!state) return;
    try {
      const data = JSON.parse(trelloJson);
      if (!data.name || !data.lists || !data.cards) { alert('Некоректний формат Trello JSON.'); return; }
      const boardId = uuidv4();
      const newBoard = { id: boardId, title: data.name || 'Імпорт з Trello' };
      const listIdMap: Record<string, string> = {};
      const newLists: List[] = data.lists.map((l: any, i: number) => { const id = uuidv4(); listIdMap[l.id] = id; return { id, title: l.name, order: i, boardId }; });
      const trelloMemberMap: Record<string, string> = {};
      const newUsers: User[] = [];
      const existingUsers = state.users || [];
      if (data.members) {
        data.members.forEach((m: any) => {
          const userMatch = existingUsers.find(u => (u.name.toLowerCase() === m.fullName?.toLowerCase()) || (u.name.toLowerCase() === m.username?.toLowerCase()));
          if (userMatch) { trelloMemberMap[m.id] = userMatch.id; }
          else { const newId = uuidv4(); trelloMemberMap[m.id] = newId; newUsers.push({ id: newId, name: m.fullName || m.username || 'Невідомий користувач', avatar: m.avatarUrl ? `${m.avatarUrl}/170.png` : `https://ui-avatars.com/api/?name=${encodeURIComponent(m.fullName || m.username || 'U')}&background=random` }); }
        });
      }
      const trelloColorToHex: Record<string, string> = { blue: '#3b82f6', green: '#22c55e', orange: '#f97316', red: '#ef4444', yellow: '#eab308', purple: '#a855f7', pink: '#ec4899', sky: '#0ea5e9', lime: '#84cc16', black: '#1f2937' };
      const trelloLabelMap: Record<string, string> = {};
      const newTags: Tag[] = [];
      const existingTags = state.tags || [];
      if (data.labels) {
        data.labels.forEach((l: any) => {
          if (!l.name && !l.color) return;
          const labelName = l.name || (l.color ? `Тег: ${l.color}` : 'Тег');
          const tagMatch = existingTags.find(t => t.name.toLowerCase() === labelName.toLowerCase());
          if (tagMatch) { trelloLabelMap[l.id] = tagMatch.id; }
          else { const newId = uuidv4(); trelloLabelMap[l.id] = newId; newTags.push({ id: newId, name: labelName, color: l.color ? (trelloColorToHex[l.color] || '#3b82f6') : '#3b82f6' }); }
        });
      }
      const newCards: Card[] = data.cards.filter((c: any) => !c.closed && listIdMap[c.idList]).map((c: any, i: number) => ({
        id: uuidv4(), listId: listIdMap[c.idList], title: c.name, description: c.desc || '',
        deadline: c.due ? new Date(c.due).toISOString().split('T')[0] : null,
        assigneeId: (c.idMembers && c.idMembers.length > 0) ? (trelloMemberMap[c.idMembers[0]] || null) : null,
        tagIds: (c.idLabels && c.idLabels.length > 0) ? c.idLabels.map((idL: string) => trelloLabelMap[idL]).filter(Boolean) : [],
        subtasks: [], comments: [], attachments: [], order: i,
      }));
      saveState({ ...state, users: [...existingUsers, ...newUsers], tags: [...existingTags, ...newTags], boards: [...(state.boards || []), newBoard], lists: [...state.lists, ...newLists], cards: [...state.cards, ...newCards] });
      setActiveBoardId(boardId);
      alert('Дошку успішно імпортовано!');
    } catch (e) { console.error(e); alert('Помилка імпорту. Перевірте формат JSON.'); }
  }, [state, saveState]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!authChecked || loading) return <LoadingScreen />;
  if (!currentUser) return <LoginPage onLogin={handleLogin} />;
  if (!state) return <LoadingScreen />;

  const navItems: { view: ActiveView; label: string; Icon: any }[] = [
    { view: 'dashboard', label: 'Головна', Icon: BarChart },
    { view: 'projects', label: 'Проєкти', Icon: FolderKanban },
    { view: 'board', label: 'Дошка', Icon: Kanban },
    { view: 'content', label: 'Контент-план', Icon: Calendar },
    { view: 'events', label: 'Події', Icon: CalendarDays },
    { view: 'calendar', label: 'Календар', Icon: LayoutGrid },
    { view: 'regulations', label: 'Регламенти', Icon: BookOpen },
  ];

  return (
    <AppContext.Provider value={{
      state, currentUser, logout,
      moveCard, addCard, updateCard, deleteCard, addList, deleteList,
      addTag, deleteTag, updateTag, addUser, updateUser, deleteUser,
      addContentPlan, updateContentPlan, deleteContentPlan, updateSettings,
      addEvent, updateEvent, deleteEvent, addProject, updateProject, deleteProject, addBoard, deleteBoard,
      activeBoardId, setActiveBoardId, activeEventId, setActiveEventId, activeProjectId, setActiveProjectId,
      activeView, setActiveView, updateMetric, importTrelloBoard, confirmAction
    }}>
      <div className="min-h-screen bg-blue-50/50 flex flex-col font-sans text-gray-900">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 w-full">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-lg">K</div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Kanban Master
              </h1>
            </div>

            <div className="flex space-x-1 pl-4 border-l border-gray-200">
              {navItems.map(({ view, label, Icon }) => (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition ${activeView === view ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-3">
            <div className="flex -space-x-2">
              {state.users.slice(0, 5).map(u => (
                <img key={u.id} src={u.avatar} alt={u.name} title={u.name} className="w-8 h-8 rounded-full border-2 border-white" />
              ))}
              {state.users.length > 5 && (
                <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 z-10">
                  +{state.users.length - 5}
                </div>
              )}
            </div>

            <button
              onClick={() => setIsTeamManagerOpen(true)}
              className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              <Users className="w-4 h-4 mr-2" />
              Team
            </button>

            {/* My profile button */}
            <button
              onClick={() => setActiveView('profile')}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition border ${activeView === 'profile' ? 'border-blue-200 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
              title={currentUser.name}
            >
              <img
                src={state.users.find(u => u.id === currentUser.userId)?.avatar || ''}
                alt={currentUser.name}
                className="w-7 h-7 rounded-full border border-gray-200 object-cover"
              />
              <span className={`text-sm font-medium hidden lg:block ${activeView === 'profile' ? 'text-blue-700' : 'text-gray-700'}`}>
                {currentUser.name.split(' ')[0]}
              </span>
              {currentUser.role === 'admin' && (
                <span className="hidden lg:block text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full">Admin</span>
              )}
            </button>
          </div>
        </header>

        {/* Main */}
        <main className={`flex-1 p-6 h-[calc(100vh-73px)] ${activeView === 'board' ? 'overflow-hidden' : 'overflow-auto hidden-scrollbar'}`}>
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'projects' && <ProjectsView />}
          {activeView === 'board' && <Board />}
          {activeView === 'content' && <ContentPlanView />}
          {activeView === 'events' && <EventCalendarView />}
          {activeView === 'calendar' && <MasterCalendarView />}
          {activeView === 'event-details' && <EventPageView />}
          {activeView === 'regulations' && <TeamRegulationsView />}
          {activeView === 'profile' && <MyProfileView />}
        </main>

        {/* Modals */}
        {isTeamManagerOpen && <TeamManager onClose={() => setIsTeamManagerOpen(false)} />}

        {confirmDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Підтвердження дії</h3>
              <p className="text-gray-600 mb-6">{confirmDialog.message}</p>
              <div className="flex justify-end space-x-3">
                <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition">
                  Скасувати
                </button>
                <button
                  onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition"
                >
                  Підтвердити
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}

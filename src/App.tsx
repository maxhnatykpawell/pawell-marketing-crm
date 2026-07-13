import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState, AuthUser, Card, List, User, Tag, ContentPlanItem, EventItem, Metric, Project, Process, UserGroup, AccessRights, NotificationItem } from './types';
import { fetchState, syncState, getMe, estimateTaskTime, createEntity, updateEntity, deleteEntity, processOfflineQueue, sendCardAssignedNotification } from './api';
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
import InvitePage from './components/InvitePage';
import ProjectsView from './components/ProjectsView';
import ProcessTreeView from './components/ProcessTreeView';
import { Loader2, Users, Kanban, Calendar, CalendarDays, LayoutGrid, BookOpen, BarChart, User as UserIcon, LogOut, FolderKanban, GitMerge, Bell, Check } from 'lucide-react';

type ActiveView = 'dashboard' | 'projects' | 'processes' | 'board' | 'content' | 'events' | 'calendar' | 'event-details' | 'regulations' | 'profile';

interface AppContextType {
  state: AppState;
  currentUser: AuthUser | null;
  hasEditRights: boolean;
  logout: () => void;
  moveCard: (cardId: string, toListId: string, targetCardId?: string) => void;
  addCard: (listId: string, title: string, initialValues?: { assigneeId?: string | null; tagIds?: string[] }) => void;
  updateCard: (cardId: string, updates: Partial<Card>) => void;
  deleteCard: (cardId: string) => void;
  clearList: (listId: string) => void;
  addList: (title: string) => void;
  deleteList: (listId: string) => void;
  updateList: (listId: string, updates: Partial<List>) => void;
  moveList: (draggedListId: string, targetListId: string) => void;
  addTag: (tag: Omit<Tag, 'id'>) => void;
  deleteTag: (tagId: string) => void;
  updateTag: (tagId: string, updates: Partial<Tag>) => void;
  addUser: (name: string, avatar?: string) => void;
  updateUser: (userId: string, updates: Partial<User>) => void;
  deleteUser: (userId: string) => void;
  addContentPlan: (item: Omit<ContentPlanItem, 'id'>) => void;
  updateContentPlan: (id: string, updates: Partial<ContentPlanItem>) => void;
  deleteContentPlan: (id: string) => void;
  importContentPlans: (plans: Omit<ContentPlanItem, 'id'>[]) => void;
  addUserGroup: (group: Omit<UserGroup, 'id'>) => void;
  updateUserGroup: (id: string, updates: Partial<UserGroup>) => void;
  deleteUserGroup: (id: string) => void;
  updateSettings: (updates: Partial<Pick<AppState, 'contentPlanChannels' | 'contentPlanStatuses' | 'contentPlanColumns' | 'aiReportSchedule'>>) => void;
  addEvent: (item: Omit<EventItem, 'id'>) => void;
  updateEvent: (id: string, updates: Partial<EventItem>) => void;
  deleteEvent: (id: string) => void;
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addProcess: (process: Omit<Process, 'id' | 'createdAt'>) => void;
  updateProcess: (id: string, updates: Partial<Process>) => void;
  deleteProcess: (id: string) => void;
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
  createNotification: (notification: NotificationItem) => void;
  markNotificationAsRead: (id: string) => void;
  openCardId: string | null;
  setOpenCardId: (id: string | null) => void;
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
  const [activeView, setActiveView] = useState<ActiveView>('profile');
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void } | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  // Use a ref so callbacks always have the latest currentUser without re-creating on every render
  const currentUserRef = React.useRef<AuthUser | null>(null);
  React.useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const confirmAction = useCallback((message: string, onConfirm: () => void) => {
    setConfirmDialog({ message, onConfirm });
  }, []);

  // createNotification: stable ref, no stale closure issues
  const createNotification = useCallback((notification: NotificationItem) => {
    setState(prev => prev ? { ...prev, notifications: [...(prev.notifications || []), notification] } : prev);
    createEntity('notifications', notification).catch(console.error);
  }, []); // no deps — uses setState functional form which is always safe

  const markNotificationAsRead = useCallback((id: string) => {
    setState(prev => prev ? {
      ...prev,
      notifications: (prev.notifications || []).map(n => n.id === id ? { ...n, read: true } : n)
    } : prev);
    updateEntity('notifications', id, { read: true }).catch(console.error);
  }, []); // no deps

  // ── Network listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      processOfflineQueue().catch(console.error);
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) {
      processOfflineQueue().catch(console.error);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!state || !currentUser) return;
    
    const userRecord = state.users.find(u => u.id === currentUser.userId);
    const userGroup = state.userGroups?.find(g => g.id === userRecord?.groupId);
    
    const defaultRights = { 
      allowedViews: ['dashboard', 'projects', 'processes', 'board', 'content', 'events', 'calendar', 'regulations', 'profile'] 
    };
    
    const currentRights = currentUser.role === 'admin' 
      ? defaultRights 
      : (userRecord?.customRights || userGroup?.rights || defaultRights);

    const isAllowed = currentRights.allowedViews.includes(activeView) || activeView === 'profile' || (activeView === 'event-details' && currentRights.allowedViews.includes('events'));

    if (!isAllowed) {
      if (currentRights.allowedViews.length > 0) {
        setActiveView(currentRights.allowedViews[0] as ActiveView);
      } else {
        setActiveView('profile');
      }
    }
  }, [activeView, state, currentUser]);

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
        const res = await fetch('/api/status', { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });
        if (res.ok) {
          const data = await res.json();
          const newTs = data.lastModified;
          if (newTs && newTs !== lastModifiedRef.current) {
            lastModifiedRef.current = newTs;
            const newState = await fetchState();
            setState(newState);
          }
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

  const moveCard = useCallback((cardId: string, toListId: string, targetCardId?: string) => {
    if (!state) return;
    
    setState(prev => {
      if (!prev) return prev;
      let cards = [...prev.cards];
      const draggedCardIdx = cards.findIndex(c => c.id === cardId);
      if (draggedCardIdx === -1) return prev;
      
      const draggedCard = { ...cards[draggedCardIdx], listId: toListId };
      
      const targetListCards = cards.filter(c => c.listId === toListId && c.id !== cardId).sort((a, b) => a.order - b.order);
      
      if (targetCardId) {
        const targetIdx = targetListCards.findIndex(c => c.id === targetCardId);
        if (targetIdx !== -1) {
          targetListCards.splice(targetIdx, 0, draggedCard);
        } else {
          targetListCards.push(draggedCard);
        }
      } else {
        targetListCards.push(draggedCard);
      }
      
      targetListCards.forEach((c, idx) => {
        c.order = idx;
      });
      
      const updatedCardsMap = new Map(targetListCards.map(c => [c.id, c]));
      cards = cards.map(c => updatedCardsMap.has(c.id) ? updatedCardsMap.get(c.id)! : c);
      
      // Update in background
      targetListCards.forEach(c => {
        updateEntity('cards', c.id, { listId: c.listId, order: c.order }).catch(console.error);
      });
      
      return { ...prev, cards };
    });
  }, [state]);

  const updateCardAsync = useCallback((cardId: string, updates: Partial<Card>) => {
    setState(prev => {
      if (!prev) return prev;
      return { ...prev, cards: prev.cards.map(c => c.id === cardId ? { ...c, ...updates } : c) };
    });
    updateEntity('cards', cardId, updates).catch(console.error);
  }, []);

  const addCard = useCallback((listId: string, title: string, initialValues?: { assigneeId?: string | null; tagIds?: string[] }) => {
    if (!state) return;
    const listCards = state.cards.filter(c => c.listId === listId);
    const minOrder = listCards.length > 0 ? Math.min(...listCards.map(c => c.order)) : 0;
    const newCard: Card = {
      id: uuidv4(), listId, title, description: '', deadline: null,
      assigneeId: initialValues?.assigneeId ?? null,
      tagIds: initialValues?.tagIds ?? [],
      subtasks: [], comments: [], attachments: [],
      order: minOrder - 1,
      projectId: activeProjectId
    };
    setState(prev => prev ? { ...prev, cards: [...prev.cards, newCard] } : prev);
    createEntity('cards', newCard).catch(console.error);

    // Auto-estimate time using AI
    estimateTaskTime(title, '').then(estimatedMinutes => {
      updateCardAsync(newCard.id, { estimatedMinutes });
    });

    // Notify assignee if assigned on creation
    if (newCard.assigneeId && newCard.assigneeId !== currentUser?.userId) {
      createNotification({
        id: uuidv4(),
        userId: newCard.assigneeId,
        title: 'Нове завдання',
        message: `Вам призначено завдання: "${newCard.title}"`,
        cardId: newCard.id,
        read: false,
        createdAt: new Date().toISOString()
      });
    }
  }, [state, activeProjectId, updateCardAsync, currentUser, createNotification]);

  const updateCard = useCallback((cardId: string, updates: Partial<Card>) => {
    setState(prev => {
      if (!prev) return prev;
      const prevCard = prev.cards.find(c => c.id === cardId);
      
      // Trigger in-app notification if assignee changed
      if (updates.assigneeId && updates.assigneeId !== prevCard?.assigneeId) {
        const cu = currentUserRef.current;
        if (updates.assigneeId !== cu?.userId) {
          const notif: NotificationItem = {
            id: uuidv4(),
            userId: updates.assigneeId,
            title: 'Нове завдання',
            message: `Вам призначено завдання: "${updates.title || prevCard?.title || 'Без назви'}"`,
            cardId,
            read: false,
            createdAt: new Date().toISOString()
          };
          // fire-and-forget outside setState to avoid nested state updates
          setTimeout(() => {
            setState(p => p ? { ...p, notifications: [...(p.notifications || []), notif] } : p);
            createEntity('notifications', notif).catch(console.error);
          }, 0);
        }
        // Telegram notification
        sendCardAssignedNotification(cardId, updates.assigneeId);
      }

      // Subtask assignee changes
      if (updates.subtasks && prevCard?.subtasks) {
        const cu = currentUserRef.current;
        updates.subtasks.forEach(newSt => {
          const oldSt = prevCard.subtasks?.find(s => s.id === newSt.id);
          if (newSt.assigneeId && newSt.assigneeId !== oldSt?.assigneeId && newSt.assigneeId !== cu?.userId) {
            const notif: NotificationItem = {
              id: uuidv4(),
              userId: newSt.assigneeId,
              title: 'Нова підзадача',
              message: `Вам призначено підзадачу "${newSt.title}" у картці "${updates.title || prevCard.title || 'Без назви'}"`,
              cardId,
              read: false,
              createdAt: new Date().toISOString()
            };
            setTimeout(() => {
              setState(p => p ? { ...p, notifications: [...(p.notifications || []), notif] } : p);
              createEntity('notifications', notif).catch(console.error);
            }, 0);
          }
        });
      }

      return { ...prev, cards: prev.cards.map(c => c.id === cardId ? { ...c, ...updates } : c) };
    });
    updateEntity('cards', cardId, updates).catch(console.error);
  }, []); // stable — reads state via setState functional form, user via ref

  const deleteCard = useCallback((cardId: string) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, cards: prev.cards.filter(c => c.id !== cardId) } : prev);
    deleteEntity('cards', cardId).catch(console.error);
  }, [state]);

  const clearList = useCallback((listId: string) => {
    if (!state) return;
    const cardsToDelete = state.cards.filter(c => c.listId === listId);
    setState(prev => prev ? { ...prev, cards: prev.cards.filter(c => c.listId !== listId) } : prev);
    cardsToDelete.forEach(c => deleteEntity('cards', c.id).catch(console.error));
  }, [state]);

  const addList = useCallback((title: string) => {
    if (!state) return;
    const targetBoardId = activeBoardId || (state.boards && state.boards.length > 0 ? state.boards[0].id : undefined);
    const newList: List = { id: uuidv4(), title, order: state.lists.filter(l => l.boardId === targetBoardId).length, boardId: targetBoardId };
    setState(prev => prev ? { ...prev, lists: [...prev.lists, newList] } : prev);
    createEntity('lists', newList).catch(console.error);
  }, [state, activeBoardId]);

  const deleteList = useCallback((listId: string) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, lists: prev.lists.filter(l => l.id !== listId), cards: prev.cards.filter(c => c.listId !== listId) } : prev);
    deleteEntity('lists', listId).catch(console.error);
    // Also delete associated cards optimally via API if needed, but for now we delete the list.
    state.cards.filter(c => c.listId === listId).forEach(c => deleteEntity('cards', c.id).catch(console.error));
  }, [state]);

  const updateList = useCallback((listId: string, updates: Partial<List>) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, lists: prev.lists.map(l => l.id === listId ? { ...l, ...updates } : l) } : prev);
    updateEntity('lists', listId, updates).catch(console.error);
  }, [state]);

  const moveList = useCallback((draggedListId: string, targetListId: string) => {
    if (!state) return;
    
    const draggedList = state.lists.find(l => l.id === draggedListId);
    if (!draggedList) return;
    const boardId = draggedList.boardId;
    
    let boardLists = state.lists.filter(l => l.boardId === boardId).sort((a, b) => a.order - b.order);
    
    const dragIdx = boardLists.findIndex(l => l.id === draggedListId);
    const dropIdx = boardLists.findIndex(l => l.id === targetListId);
    if (dragIdx === -1 || dropIdx === -1 || dragIdx === dropIdx) return;
    
    const [removed] = boardLists.splice(dragIdx, 1);
    boardLists.splice(dropIdx, 0, removed);
    
    const updatedLists = boardLists.map((l, idx) => ({ ...l, order: idx }));
    
    setState(prev => {
      if (!prev) return prev;
      const otherLists = prev.lists.filter(l => l.boardId !== boardId);
      return { ...prev, lists: [...otherLists, ...updatedLists] };
    });
    
    updatedLists.forEach(l => {
      updateEntity('lists', l.id, { order: l.order }).catch(console.error);
    });
  }, [state]);

  const addTag = useCallback((tag: Omit<Tag, 'id'>) => {
    if (!state) return;
    const newTag = { ...tag, id: uuidv4() };
    setState(prev => prev ? { ...prev, tags: [...(prev.tags || []), newTag] } : prev);
    createEntity('tags', newTag).catch(console.error);
  }, [state]);

  const deleteTag = useCallback((tagId: string) => {
    if (!state) return;
    setState(prev => prev ? {
      ...prev,
      tags: prev.tags?.filter(t => t.id !== tagId) || [],
      cards: prev.cards.map(c => ({ ...c, tagIds: c.tagIds?.filter(tId => tId !== tagId) || [] }))
    } : prev);
    deleteEntity('tags', tagId).catch(console.error);
    // update associated cards
    state.cards.filter(c => c.tagIds?.includes(tagId)).forEach(c => {
      updateEntity('cards', c.id, { tagIds: c.tagIds?.filter(tId => tId !== tagId) || [] }).catch(console.error);
    });
  }, [state]);

  const updateTag = useCallback((tagId: string, updates: Partial<Tag>) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, tags: prev.tags?.map(t => t.id === tagId ? { ...t, ...updates } : t) || [] } : prev);
    updateEntity('tags', tagId, updates).catch(console.error);
  }, [state]);

  const addUser = useCallback((name: string, avatar?: string) => {
    if (!state) return;
    const newUser: User = { id: uuidv4(), name, avatar: avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random` };
    setState(prev => prev ? { ...prev, users: [...prev.users, newUser] } : prev);
    createEntity('users', newUser).catch(console.error);
  }, [state]);

  const updateUser = useCallback((userId: string, updates: Partial<User>) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, users: prev.users.map(u => u.id === userId ? { ...u, ...updates } : u) } : prev);
    updateEntity('users', userId, updates).catch(console.error);
    // Refresh currentUser if updating own profile
    if (currentUser && userId === currentUser.userId) {
      if (updates.name) setCurrentUser(prev => prev ? { ...prev, name: updates.name! } : prev);
      if (updates.avatar) setCurrentUser(prev => prev ? { ...prev, avatar: updates.avatar! } : prev);
    }
  }, [state, currentUser]);

  const deleteUser = useCallback((userId: string) => {
    if (!state) return;
    setState(prev => prev ? {
      ...prev,
      users: (prev.users || []).filter(u => u.id !== userId),
      cards: (prev.cards || []).map(c => ({ ...c, assigneeId: c.assigneeId === userId ? null : c.assigneeId, subtasks: (c.subtasks || []).map(st => ({ ...st, assigneeId: st.assigneeId === userId ? null : st.assigneeId })) })),
      contentPlans: (prev.contentPlans || []).map(cp => ({ ...cp, assigneeId: cp.assigneeId === userId ? null : cp.assigneeId })),
      events: (prev.events || []).map(e => ({ ...e, assigneeIds: (e.assigneeIds || []).filter(id => id !== userId) }))
    } : prev);
    deleteEntity('users', userId).catch(console.error);
  }, [state]);

  const addContentPlan = useCallback((item: Omit<ContentPlanItem, 'id'>) => {
    if (!state) return;
    const newCp = { ...item, id: uuidv4() };
    setState(prev => prev ? { ...prev, contentPlans: [...(prev.contentPlans || []), newCp] } : prev);
    createEntity('contentPlans', newCp).catch(console.error);
  }, [state]);

  const updateContentPlan = useCallback((id: string, updates: Partial<ContentPlanItem>) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, contentPlans: (prev.contentPlans || []).map(cp => cp.id === id ? { ...cp, ...updates } : cp) } : prev);
    updateEntity('contentPlans', id, updates).catch(console.error);
  }, [state]);

  const deleteContentPlan = useCallback((id: string) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, contentPlans: prev.contentPlans?.filter(cp => cp.id !== id) || [] } : prev);
    deleteEntity('contentPlans', id).catch(console.error);
  }, [state]);

  const importContentPlans = useCallback((plans: Omit<ContentPlanItem, 'id'>[]) => {
    if (!state) return;
    const newItems = plans.map(p => ({ ...p, id: uuidv4() }));
    setState(prev => prev ? { ...prev, contentPlans: [...(prev.contentPlans || []), ...newItems] } : prev);
    newItems.forEach(item => {
      createEntity('contentPlans', item).catch(console.error);
    });
  }, [state]);

  const addUserGroup = useCallback((group: Omit<UserGroup, 'id'>) => {
    if (!state) return;
    const newGroup = { ...group, id: uuidv4() };
    setState(prev => prev ? { ...prev, userGroups: [...(prev.userGroups || []), newGroup] } : prev);
    createEntity('userGroups', newGroup).catch(console.error);
  }, [state]);

  const updateUserGroup = useCallback((id: string, updates: Partial<UserGroup>) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, userGroups: (prev.userGroups || []).map(g => g.id === id ? { ...g, ...updates } : g) } : prev);
    updateEntity('userGroups', id, updates).catch(console.error);
  }, [state]);

  const deleteUserGroup = useCallback((id: string) => {
    if (!state) return;
    setState(prev => prev ? { 
      ...prev, 
      userGroups: (prev.userGroups || []).filter(g => g.id !== id),
      users: prev.users.map(u => u.groupId === id ? { ...u, groupId: null } : u)
    } : prev);
    deleteEntity('userGroups', id).catch(console.error);
  }, [state]);

  const updateSettings = useCallback((updates: Partial<Pick<AppState, 'contentPlanChannels' | 'contentPlanStatuses' | 'contentPlanColumns' | 'aiReportSchedule'>>) => {
    if (!state) return;
    saveState({ ...state, ...updates });
  }, [state, saveState]);

  const addEvent = useCallback((item: Omit<EventItem, 'id'>) => {
    if (!state) return;
    const newEvent = { ...item, id: uuidv4() };
    setState(prev => prev ? { ...prev, events: [...(prev.events || []), newEvent] } : prev);
    createEntity('events', newEvent).catch(console.error);
  }, [state]);

  const updateEvent = useCallback((id: string, updates: Partial<EventItem>) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, events: (prev.events || []).map(e => e.id === id ? { ...e, ...updates } : e) } : prev);
    updateEntity('events', id, updates).catch(console.error);
  }, [state]);

  const deleteEvent = useCallback((id: string) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, events: (prev.events || []).filter(e => e.id !== id) } : prev);
    deleteEntity('events', id).catch(console.error);
  }, [state]);

  const addProject = useCallback((project: Omit<Project, 'id' | 'createdAt'>) => {
    if (!state) return;
    const newProject: Project = { ...project, id: uuidv4(), createdAt: new Date().toISOString() };
    setState(prev => prev ? { ...prev, projects: [...(prev.projects || []), newProject] } : prev);
    createEntity('projects', newProject).catch(console.error);
  }, [state]);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, projects: (prev.projects || []).map(p => p.id === id ? { ...p, ...updates } : p) } : prev);
    updateEntity('projects', id, updates).catch(console.error);
  }, [state]);

  const deleteProject = useCallback((id: string) => {
    if (!state) return;
    setState(prev => prev ? { 
      ...prev, 
      projects: (prev.projects || []).filter(p => p.id !== id),
      cards: prev.cards.map(c => c.projectId === id ? { ...c, projectId: null } : c)
    } : prev);
    deleteEntity('projects', id).catch(console.error);
    if (activeProjectId === id) setActiveProjectId(null);
  }, [state, activeProjectId]);

  const addProcess = useCallback((process: Omit<Process, 'id' | 'createdAt'>) => {
    if (!state) return;
    const newProcess: Process = { ...process, id: uuidv4(), createdAt: new Date().toISOString() };
    setState(prev => prev ? { ...prev, processes: [...(prev.processes || []), newProcess] } : prev);
    createEntity('processes', newProcess).catch(console.error);
  }, [state]);

  const updateProcess = useCallback((id: string, updates: Partial<Process>) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, processes: (prev.processes || []).map(p => p.id === id ? { ...p, ...updates } : p) } : prev);
    updateEntity('processes', id, updates).catch(console.error);
  }, [state]);

  const deleteProcess = useCallback((id: string) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, processes: (prev.processes || []).filter(p => p.id !== id) } : prev);
    deleteEntity('processes', id).catch(console.error);
  }, [state]);

  const addBoard = useCallback((title: string) => {
    if (!state) return;
    const newBoard = { id: uuidv4(), title };
    setState(prev => prev ? { ...prev, boards: [...(prev.boards || []), newBoard] } : prev);
    createEntity('boards', newBoard).catch(console.error);
    setActiveBoardId(newBoard.id);
  }, [state]);

  const deleteBoard = useCallback((id: string) => {
    if (!state) return;
    setState(prev => {
      if (!prev) return prev;
      const remainingBoards = (prev.boards || []).filter(b => b.id !== id);
      const listsToRemove = prev.lists.filter(l => l.boardId === id).map(l => l.id);
      return { ...prev, boards: remainingBoards, lists: prev.lists.filter(l => l.boardId !== id), cards: prev.cards.filter(c => !listsToRemove.includes(c.listId)) };
    });
    deleteEntity('boards', id).catch(console.error);
    if (activeBoardId === id) {
      const remainingBoards = (state.boards || []).filter(b => b.id !== id);
      setActiveBoardId(remainingBoards.length > 0 ? remainingBoards[0].id : null);
    }
  }, [state, activeBoardId]);

  const updateMetric = useCallback((id: string, updates: Partial<Metric>) => {
    if (!state) return;
    setState(prev => prev ? { ...prev, metrics: (prev.metrics || []).map(m => m.id === id ? { ...m, ...updates } : m) } : prev);
    updateEntity('metrics', id, updates).catch(console.error);
  }, [state]);

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
      const checklistsByCard: Record<string, any[]> = {};
      if (data.checklists) {
        data.checklists.forEach((cl: any) => {
          if (!checklistsByCard[cl.idCard]) checklistsByCard[cl.idCard] = [];
          if (cl.checkItems) {
            checklistsByCard[cl.idCard].push(...cl.checkItems.map((item: any) => ({
              id: uuidv4(),
              title: item.name,
              completed: item.state === 'complete'
            })));
          }
        });
      }
      const newCards: Card[] = data.cards.filter((c: any) => !c.closed && listIdMap[c.idList]).map((c: any, i: number) => ({
        id: uuidv4(), listId: listIdMap[c.idList], title: c.name, description: c.desc || '',
        deadline: c.due ? new Date(c.due).toISOString().split('T')[0] : null,
        assigneeId: (c.idMembers && c.idMembers.length > 0) ? (trelloMemberMap[c.idMembers[0]] || null) : null,
        tagIds: (c.idLabels && c.idLabels.length > 0) ? c.idLabels.map((idL: string) => trelloLabelMap[idL]).filter(Boolean) : [],
        subtasks: checklistsByCard[c.id] || [], comments: [], attachments: [], order: i,
      }));
      saveState({ ...state, users: [...existingUsers, ...newUsers], tags: [...existingTags, ...newTags], boards: [...(state.boards || []), newBoard], lists: [...state.lists, ...newLists], cards: [...state.cards, ...newCards] });
      setActiveBoardId(boardId);
      alert('Дошку успішно імпортовано!');
    } catch (e) { console.error(e); alert('Помилка імпорту. Перевірте формат JSON.'); }
  }, [state, saveState]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!authChecked || loading) return <LoadingScreen />;
  
  const urlParams = new URLSearchParams(window.location.search);
  const inviteToken = urlParams.get('invite');
  
  if (!currentUser) {
    if (inviteToken) {
      return <InvitePage token={inviteToken} onSuccess={handleLogin} />;
    }
    return <LoginPage onLogin={handleLogin} />;
  }
  
  if (!state) return <LoadingScreen />;

  const userRecord = state.users.find(u => u.id === currentUser.userId);
  const userGroup = state.userGroups?.find(g => g.id === userRecord?.groupId);
  
  const defaultRights: AccessRights = { 
    canEdit: true, 
    allowedViews: ['dashboard', 'projects', 'processes', 'board', 'content', 'events', 'calendar', 'regulations', 'profile'] 
  };
  
  const currentRights: AccessRights = currentUser.role === 'admin' 
    ? defaultRights 
    : (userRecord?.customRights || userGroup?.rights || defaultRights);

  const hasEditRights = currentRights.canEdit;

  let allNavItems: { view: ActiveView; label: string; Icon: any }[] = [
    { view: 'dashboard', label: 'Головна', Icon: BarChart },
    { view: 'projects', label: 'Проєкти', Icon: FolderKanban },
    { view: 'processes', label: 'Процеси', Icon: GitMerge },
    { view: 'board', label: 'Дошка', Icon: Kanban },
    { view: 'content', label: 'Контент-план', Icon: Calendar },
    { view: 'events', label: 'Події', Icon: CalendarDays },
    { view: 'calendar', label: 'Календар', Icon: LayoutGrid },
    { view: 'regulations', label: 'Регламенти', Icon: BookOpen },
  ];

  const navItems = allNavItems.filter(item => currentRights.allowedViews.includes(item.view));

  const myNotifications = (state.notifications || []).filter(n => n.userId === currentUser.userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const unreadCount = myNotifications.filter(n => !n.read).length;

  return (
    <AppContext.Provider value={{
      state, currentUser, hasEditRights, logout,
      moveCard, addCard, updateCard, deleteCard, clearList, addList, deleteList, updateList, moveList,
      addTag, deleteTag, updateTag, addUser, updateUser, deleteUser,
      addContentPlan, updateContentPlan, deleteContentPlan, importContentPlans, 
      addUserGroup, updateUserGroup, deleteUserGroup, updateSettings,
      addEvent, updateEvent, deleteEvent, addProject, updateProject, deleteProject, addProcess, updateProcess, deleteProcess, addBoard, deleteBoard,
      activeBoardId, setActiveBoardId, activeEventId, setActiveEventId, activeProjectId, setActiveProjectId,
      activeView, setActiveView, updateMetric, importTrelloBoard, confirmAction,
      createNotification, markNotificationAsRead,
      openCardId, setOpenCardId
    }}>
      <div className="min-h-screen bg-blue-50/50 flex flex-col font-sans text-gray-900">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 w-full print:hidden">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-lg">P</div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                PAWELL - Marketing Workspace
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
            <div className="flex items-center space-x-3 relative">
              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                  )}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                      <h3 className="font-semibold text-gray-800">Сповіщення</h3>
                      {unreadCount > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{unreadCount} нових</span>}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {myNotifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-500">Немає сповіщень</div>
                      ) : (
                        myNotifications.map(notif => (
                          <div
                            key={notif.id}
                            className={`p-4 border-b border-gray-50 transition flex gap-3 ${notif.read ? 'opacity-60' : 'bg-blue-50/30'} ${notif.cardId ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-gray-50'}`}
                            onClick={() => {
                              if (notif.cardId) {
                                markNotificationAsRead(notif.id);
                                setNotificationsOpen(false);
                                setActiveView('board');
                                setOpenCardId(notif.cardId);
                              }
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <p className="text-sm font-semibold text-gray-900">{notif.title}</p>
                                {notif.cardId && <span className="text-xs text-blue-500 font-medium">→ відкрити</span>}
                              </div>
                              <p className="text-sm text-gray-600 mt-0.5 break-words">{notif.message}</p>
                              <span className="text-xs text-gray-400 mt-2 block">{new Date(notif.createdAt).toLocaleString('uk-UA')}</span>
                            </div>
                            {!notif.read && (
                              <button
                                onClick={e => { e.stopPropagation(); markNotificationAsRead(notif.id); }}
                                className="shrink-0 p-1.5 h-fit text-blue-600 hover:bg-blue-100 rounded-lg transition"
                                title="Позначити прочитаним"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {isOffline && (
                <div className="hidden md:flex items-center px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded-lg text-xs font-medium border border-yellow-200 shadow-sm animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>
                  Офлайн. Зміни зберігаються локально
                </div>
              )}
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
        <main className={`flex-1 p-6 h-[calc(100vh-73px)] print:h-auto print:overflow-visible print:p-0 flex flex-col ${['board', 'processes'].includes(activeView) ? 'overflow-hidden' : 'overflow-auto hidden-scrollbar'}`}>
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'projects' && <ProjectsView />}
          {activeView === 'processes' && <ProcessTreeView />}
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

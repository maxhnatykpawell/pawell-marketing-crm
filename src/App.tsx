import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState, Card, List, User, Tag, ContentPlanItem, EventItem, Metric } from './types';
import { fetchState, syncState } from './api';
import { v4 as uuidv4 } from 'uuid';
import Board from './components/Board';
import ContentPlanView from './components/ContentPlanView';
import TeamManager from './components/TeamManager';
import EventCalendarView from './components/EventCalendarView';
import MasterCalendarView from './components/MasterCalendarView';
import EventPageView from './components/EventPageView';
import TeamRegulationsView from './components/TeamRegulationsView';
import DashboardView from './components/DashboardView';
import { Loader2, Users, Kanban, Calendar, CalendarDays, LayoutGrid, BookOpen, BarChart } from 'lucide-react';

interface AppContextType {
  state: AppState;
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
  addBoard: (title: string) => void;
  deleteBoard: (id: string) => void;
  activeBoardId: string | null;
  setActiveBoardId: (id: string | null) => void;
  activeEventId: string | null;
  setActiveEventId: (id: string | null) => void;
  activeView: 'dashboard' | 'board' | 'content' | 'events' | 'calendar' | 'event-details' | 'regulations';
  setActiveView: (view: 'dashboard' | 'board' | 'content' | 'events' | 'calendar' | 'event-details' | 'regulations') => void;
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

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTeamManagerOpen, setIsTeamManagerOpen] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'board' | 'content' | 'events' | 'calendar' | 'event-details' | 'regulations'>('dashboard');
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void } | null>(null);

  const confirmAction = useCallback((message: string, onConfirm: () => void) => {
    setConfirmDialog({ message, onConfirm });
  }, []);

  useEffect(() => {
    fetchState().then(data => {
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
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  const saveState = useCallback((newState: AppState) => {
    setState(newState);
    syncState(newState).catch(console.error);
  }, []);

  const moveCard = useCallback((cardId: string, toListId: string) => {
    if (!state) return;
    saveState({
      ...state,
      cards: state.cards.map(c => c.id === cardId ? { ...c, listId: toListId } : c)
    });
  }, [state, saveState]);

  const addCard = useCallback((listId: string, title: string) => {
    if (!state) return;
    const newCard: Card = {
      id: uuidv4(),
      listId,
      title,
      description: '',
      deadline: null,
      assigneeId: null,
      subtasks: [],
      comments: [],
      attachments: [],
      order: state.cards.filter(c => c.listId === listId).length
    };
    saveState({ ...state, cards: [...state.cards, newCard] });
  }, [state, saveState]);

  const updateCard = useCallback((cardId: string, updates: Partial<Card>) => {
    if (!state) return;
    saveState({
      ...state,
      cards: state.cards.map(c => c.id === cardId ? { ...c, ...updates } : c)
    });
  }, [state, saveState]);

  const deleteCard = useCallback((cardId: string) => {
    if (!state) return;
    saveState({
      ...state,
      cards: state.cards.filter(c => c.id !== cardId)
    });
  }, [state, saveState]);

  const addList = useCallback((title: string) => {
    if (!state) return;
    const targetBoardId = activeBoardId || (state.boards && state.boards.length > 0 ? state.boards[0].id : undefined);
    
    const newList: List = {
      id: uuidv4(),
      title,
      order: state.lists.filter(l => l.boardId === targetBoardId).length,
      boardId: targetBoardId
    };
    saveState({ ...state, lists: [...state.lists, newList] });
  }, [state, saveState, activeBoardId]);

  const deleteList = useCallback((listId: string) => {
    if (!state) return;
    saveState({
      ...state,
      lists: state.lists.filter(l => l.id !== listId),
      cards: state.cards.filter(c => c.listId !== listId)
    });
  }, [state, saveState]);

  const addTag = useCallback((tag: Omit<Tag, 'id'>) => {
    if (!state) return;
    const newTag = { ...tag, id: uuidv4() };
    saveState({ ...state, tags: [...(state.tags || []), newTag] });
  }, [state, saveState]);

  const deleteTag = useCallback((tagId: string) => {
    if (!state) return;
    saveState({
      ...state,
      tags: state.tags?.filter(t => t.id !== tagId) || [],
      cards: state.cards.map(c => ({
        ...c,
        tagIds: c.tagIds?.filter(tId => tId !== tagId) || []
      }))
    });
  }, [state, saveState]);

  const updateTag = useCallback((tagId: string, updates: Partial<Tag>) => {
    if (!state) return;
    saveState({
      ...state,
      tags: state.tags?.map(t => t.id === tagId ? { ...t, ...updates } : t) || []
    });
  }, [state, saveState]);

  const addUser = useCallback((name: string, avatar?: string) => {
    if (!state) return;
    const newUser: User = {
      id: uuidv4(),
      name,
      avatar: avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
    };
    saveState({ ...state, users: [...state.users, newUser] });
  }, [state, saveState]);

  const updateUser = useCallback((userId: string, updates: Partial<User>) => {
    if (!state) return;
    saveState({
      ...state,
      users: state.users.map(u => u.id === userId ? { ...u, ...updates } : u)
    });
  }, [state, saveState]);

  const deleteUser = useCallback((userId: string) => {
    if (!state) return;
    saveState({
      ...state,
      users: (state.users || []).filter(u => u.id !== userId),
      cards: (state.cards || []).map(c => ({
        ...c,
        assigneeId: c.assigneeId === userId ? null : c.assigneeId,
        subtasks: (c.subtasks || []).map(st => ({
          ...st,
          assigneeId: st.assigneeId === userId ? null : st.assigneeId
        }))
      })),
      contentPlans: (state.contentPlans || []).map(cp => ({
        ...cp,
        assigneeId: cp.assigneeId === userId ? null : cp.assigneeId
      })),
      events: (state.events || []).map(e => ({
        ...e,
        assigneeIds: (e.assigneeIds || []).filter(id => id !== userId)
      }))
    });
  }, [state, saveState]);

  const addContentPlan = useCallback((item: Omit<ContentPlanItem, 'id'>) => {
    if (!state) return;
    const newItem = { ...item, id: uuidv4() };
    saveState({ ...state, contentPlans: [...(state.contentPlans || []), newItem] });
  }, [state, saveState]);

  const updateContentPlan = useCallback((id: string, updates: Partial<ContentPlanItem>) => {
    if (!state) return;
    saveState({
      ...state,
      contentPlans: (state.contentPlans || []).map(cp => cp.id === id ? { ...cp, ...updates } : cp)
    });
  }, [state, saveState]);

  const deleteContentPlan = useCallback((id: string) => {
    if (!state) return;
    saveState({
      ...state,
      contentPlans: (state.contentPlans || []).filter(cp => cp.id !== id)
    });
  }, [state, saveState]);

  const updateSettings = useCallback((updates: Partial<Pick<AppState, 'contentPlanChannels' | 'contentPlanStatuses' | 'contentPlanColumns'>>) => {
    if (!state) return;
    saveState({
      ...state,
      ...updates
    });
  }, [state, saveState]);

  const addEvent = useCallback((item: Omit<EventItem, 'id'>) => {
    if (!state) return;
    const newItem = { ...item, id: uuidv4() };
    saveState({ ...state, events: [...(state.events || []), newItem] });
  }, [state, saveState]);

  const updateEvent = useCallback((id: string, updates: Partial<EventItem>) => {
    if (!state) return;
    saveState({
      ...state,
      events: (state.events || []).map(e => e.id === id ? { ...e, ...updates } : e)
    });
  }, [state, saveState]);

  const deleteEvent = useCallback((id: string) => {
    if (!state) return;
    saveState({
      ...state,
      events: (state.events || []).filter(e => e.id !== id)
    });
  }, [state, saveState]);

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
    
    saveState({
      ...state,
      boards: remainingBoards,
      lists: state.lists.filter(l => l.boardId !== id),
      cards: state.cards.filter(c => !listsToRemove.includes(c.listId))
    });
    
    if (activeBoardId === id) {
      setActiveBoardId(remainingBoards.length > 0 ? remainingBoards[0].id : null);
    }
  }, [state, saveState, activeBoardId]);

  const updateMetric = useCallback((id: string, updates: Partial<Metric>) => {
    if (!state) return;
    const newMetrics = (state.metrics || []).map(m => m.id === id ? { ...m, ...updates } : m);
    saveState({ ...state, metrics: newMetrics });
  }, [state, saveState]);

  const importTrelloBoard = useCallback((trelloJson: string) => {
    if (!state) return;
    try {
      const data = JSON.parse(trelloJson);
      if (!data.name || !data.lists || !data.cards) {
        alert("Некоректний формат Trello JSON.");
        return;
      }

      const boardId = uuidv4();
      const newBoard: BoardItem = { id: boardId, title: data.name || "Імпорт з Trello" };

      const listIdMap: Record<string, string> = {};
      const newLists: List[] = data.lists.map((l: any, i: number) => {
        const id = uuidv4();
        listIdMap[l.id] = id;
        return {
          id,
          title: l.name,
          order: i,
          boardId
        };
      });

      const trelloMemberMap: Record<string, string> = {}; 
      const newUsers: User[] = [];
      const existingUsers = state.users || [];
      
      if (data.members) {
        data.members.forEach((m: any) => {
          const userMatch = existingUsers.find(u => (u.name.toLowerCase() === m.fullName?.toLowerCase()) || (u.name.toLowerCase() === m.username?.toLowerCase()));
          if (userMatch) {
            trelloMemberMap[m.id] = userMatch.id;
          } else {
            const newId = uuidv4();
            trelloMemberMap[m.id] = newId;
            newUsers.push({
              id: newId,
              name: m.fullName || m.username || 'Невідомий користувач',
              avatar: m.avatarUrl ? `${m.avatarUrl}/170.png` : `https://ui-avatars.com/api/?name=${encodeURIComponent(m.fullName || m.username || 'U')}&background=random`
            });
          }
        });
      }

      const trelloColorToHex: Record<string, string> = {
        blue: '#3b82f6', green: '#22c55e', orange: '#f97316', red: '#ef4444',
        yellow: '#eab308', purple: '#a855f7', pink: '#ec4899', sky: '#0ea5e9',
        lime: '#84cc16', black: '#1f2937'
      };

      const trelloLabelMap: Record<string, string> = {};
      const newTags: Tag[] = [];
      const existingTags = state.tags || [];

      if (data.labels) {
        data.labels.forEach((l: any) => {
          if (!l.name && !l.color) return;
          const labelName = l.name || (l.color ? `Тег: ${l.color}` : 'Тег');
          const tagMatch = existingTags.find(t => t.name.toLowerCase() === labelName.toLowerCase());
          if (tagMatch) {
            trelloLabelMap[l.id] = tagMatch.id;
          } else {
            const newId = uuidv4();
            trelloLabelMap[l.id] = newId;
            newTags.push({
              id: newId,
              name: labelName,
              color: l.color ? (trelloColorToHex[l.color] || '#3b82f6') : '#3b82f6'
            });
          }
        });
      }

      const newCards: Card[] = data.cards
        .filter((c: any) => !c.closed && listIdMap[c.idList])
        .map((c: any, i: number) => {
          const assigneeId = (c.idMembers && c.idMembers.length > 0) ? (trelloMemberMap[c.idMembers[0]] || null) : null;
          const tagIds = (c.idLabels && c.idLabels.length > 0) ? c.idLabels.map((idL: string) => trelloLabelMap[idL]).filter(Boolean) : [];
          
          return {
            id: uuidv4(),
            listId: listIdMap[c.idList],
            title: c.name,
            description: c.desc || "",
            deadline: c.due ? new Date(c.due).toISOString().split('T')[0] : null,
            assigneeId,
            tagIds,
            subtasks: [],
            comments: [],
            attachments: [],
            order: i,
          };
        });

      saveState({
        ...state,
        users: [...existingUsers, ...newUsers],
        tags: [...existingTags, ...newTags],
        boards: [...(state.boards || []), newBoard],
        lists: [...state.lists, ...newLists],
        cards: [...state.cards, ...newCards]
      });

      setActiveBoardId(boardId);
      alert("Дошку успішно імпортовано!");
    } catch (e) {
      console.error(e);
      alert("Помилка імпорту. Перевірте формат JSON.");
    }
  }, [state, saveState]);

  if (loading || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ 
      state, moveCard, addCard, updateCard, deleteCard, addList, deleteList, addTag, deleteTag, updateTag, addUser, updateUser, deleteUser,
      addContentPlan, updateContentPlan, deleteContentPlan, updateSettings,
      addEvent, updateEvent, deleteEvent,
      addBoard, deleteBoard, activeBoardId, setActiveBoardId,
      activeEventId, setActiveEventId, activeView, setActiveView,
      updateMetric, importTrelloBoard, confirmAction
    }}>
      <div className="min-h-screen bg-blue-50/50 flex flex-col font-sans text-gray-900">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 w-full">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-lg">K</div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Kanban Master
              </h1>
            </div>
            
            <div className="flex space-x-1 pl-4 border-l border-gray-200">
              <button 
                onClick={() => setActiveView('dashboard')}
                className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition ${activeView === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <BarChart className="w-4 h-4 mr-2" />
                Головна
              </button>
              <button 
                onClick={() => setActiveView('board')}
                className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition ${activeView === 'board' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <Kanban className="w-4 h-4 mr-2" />
                Дошка
              </button>
              <button 
                onClick={() => setActiveView('content')}
                className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition ${activeView === 'content' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <Calendar className="w-4 h-4 mr-2" />
                Контент-план
              </button>
              <button 
                onClick={() => setActiveView('events')}
                className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition ${activeView === 'events' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <CalendarDays className="w-4 h-4 mr-2" />
                Події
              </button>
              <button 
                onClick={() => setActiveView('calendar')}
                className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition ${activeView === 'calendar' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <LayoutGrid className="w-4 h-4 mr-2" />
                Календар
              </button>
              <button 
                onClick={() => setActiveView('regulations')}
                className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition ${activeView === 'regulations' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <BookOpen className="w-4 h-4 mr-2" />
                Регламенти
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-4">
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
          </div>
        </header>
        
        <main className={`flex-1 p-6 h-[calc(100vh-73px)] ${activeView === 'board' ? 'overflow-hidden' : 'overflow-auto hidden-scrollbar'}`}>
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'board' && <Board />}
          {activeView === 'content' && <ContentPlanView />}
          {activeView === 'events' && <EventCalendarView />}
          {activeView === 'calendar' && <MasterCalendarView />}
          {activeView === 'event-details' && <EventPageView />}
          {activeView === 'regulations' && <TeamRegulationsView />}
        </main>

        {isTeamManagerOpen && (
          <TeamManager onClose={() => setIsTeamManagerOpen(false)} />
        )}

        {confirmDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Підтвердження дії</h3>
              <p className="text-gray-600 mb-6">{confirmDialog.message}</p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Скасувати
                </button>
                <button
                  onClick={() => {
                    confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  }}
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

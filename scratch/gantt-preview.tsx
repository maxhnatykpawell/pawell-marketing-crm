/**
 * Пісочниця для діаграми Ганта: справжній компонент на вигаданому проєкті.
 *
 * Потрібна, щоб дивитись на верстку й перевіряти перетягування без входу в
 * систему. Контекст підміняємо мінімальним — беремо лише те, що читає сам
 * ProjectGanttView.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { AppContext } from '../src/App';
import ProjectGanttView from '../src/components/ProjectGanttView';
import { Card } from '../src/types';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.toISOString().slice(0, 10)}T00:00:00.000Z`;
};

const initialCards: Card[] = [
  {
    id: 'c1', listId: 'l1', title: 'Дослідження ринку', description: '',
    startDate: day(-4), deadline: day(2), assigneeId: 'u1', isCompleted: false,
    subtasks: [
      { id: 's1', title: 'Опитування клієнтів', completed: true, startDate: day(-4), deadline: day(-2) },
      { id: 's2', title: 'Аналіз конкурентів', completed: false, startDate: day(-1), deadline: day(2) },
    ],
    comments: [], attachments: [], order: 0, projectId: 'p1',
  },
  {
    id: 'c2', listId: 'l1', title: 'Креативна концепція', description: '',
    startDate: day(1), deadline: day(9), assigneeId: 'u1', isCompleted: false,
    subtasks: [
      { id: 's3', title: 'Мудборд', completed: false, startDate: day(1), deadline: day(3) },
      { id: 's4', title: 'Три варіанти ключового візуалу', completed: false },
    ],
    comments: [], attachments: [], order: 1, projectId: 'p1',
  },
  {
    id: 'c3', listId: 'l1', title: 'Зйомка', description: '',
    deadline: day(-1), assigneeId: null, isCompleted: false,
    subtasks: [], comments: [], attachments: [], order: 2, projectId: 'p1',
  },
  {
    id: 'c4', listId: 'l1', title: 'Запуск кампанії', description: '',
    assigneeId: null, deadline: null, isCompleted: false,
    subtasks: [
      { id: 's5', title: 'Налаштувати кабінет', completed: false, startDate: day(10), deadline: day(12) },
      { id: 's6', title: 'Залити креативи', completed: false, startDate: day(12), deadline: day(14) },
    ],
    comments: [], attachments: [], order: 3, projectId: 'p1',
  },
  {
    id: 'c5', listId: 'l1', title: 'Звіт по результатах', description: '',
    assigneeId: null, deadline: null, isCompleted: false,
    subtasks: [], comments: [], attachments: [], order: 4, projectId: 'p1',
  },
];

function Harness() {
  const [cards, setCards] = useState<Card[]>(initialCards);

  const value: any = {
    state: {
      cards,
      projects: [{
        id: 'p1', title: 'Осінній запуск', color: '#6366f1', status: 'active',
        managerIds: [], deadline: day(16), createdAt: day(-30),
      }],
      users: [{ id: 'u1', name: 'Максим Гнатик', avatar: '' }],
      lists: [{ id: 'l1', title: 'В роботі', order: 0 }],
      tags: [], boards: [],
    },
    activeProjectId: 'p1',
    hasEditRights: true,
    setActiveView: (view: string) => console.log('[gantt] setActiveView', view),
    updateCard: (cardId: string, updates: Partial<Card>) => {
      console.log('[gantt] updateCard', cardId, JSON.stringify(updates));
      setCards(prev => prev.map(c => (c.id === cardId ? { ...c, ...updates } : c)));
    },
  };

  return (
    <AppContext.Provider value={value}>
      <div className="bg-gray-100 min-h-screen p-6">
        <ProjectGanttView />
      </div>
    </AppContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);

/**
 * Пісочниця для дошки: справжній Board на вигаданих даних.
 *
 * Заведена заради одного питання — чи видно вхід у діаграму Ганта, коли
 * проєктів більше, ніж уміщує рядок. Саме в цьому випадку кнопку й зносило за
 * правий край стрічки, що прокручується, і знайти її було майже неможливо.
 *
 * Контекст підміняємо повністю: усе, чого Board і його діти не знайдуть у
 * списку нижче, приходить порожньою функцією — пісочниці не треба вміти
 * зберігати, їй треба намалювати.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { AppContext } from '../src/App';
import Board from '../src/components/Board';

const users = [
  { id: 'u1', name: 'Максим Гнатик', avatar: 'https://i.pravatar.cc/40?img=12' },
  { id: 'u2', name: 'Олена Ковальчук', avatar: '' },
];

const projects = [
  { id: 'p1', title: 'Осінній запуск', color: '#6366f1', status: 'active', managerIds: ['u1'], createdAt: '', deadline: null },
  { id: 'p2', title: 'Ребрендинг', color: '#f43f5e', status: 'planning', managerIds: ['u1'], createdAt: '', deadline: null },
  { id: 'p3', title: 'Контент-фабрика', color: '#22c55e', status: 'active', managerIds: [], createdAt: '', deadline: null },
  { id: 'p4', title: 'Партнерська програма', color: '#f59e0b', status: 'active', managerIds: [], createdAt: '', deadline: null },
  { id: 'p5', title: 'Мобільний застосунок', color: '#0ea5e9', status: 'on-hold', managerIds: [], createdAt: '', deadline: null },
  { id: 'p6', title: 'Ярмарок вакансій', color: '#8b5cf6', status: 'active', managerIds: [], createdAt: '', deadline: null },
  { id: 'p7', title: 'Оновлення сайту', color: '#14b8a6', status: 'active', managerIds: [], createdAt: '', deadline: null },
];

const lists = [
  { id: 'l1', title: 'До роботи', order: 0, boardId: 'b1' },
  { id: 'l2', title: 'В роботі', order: 1, boardId: 'b1' },
  { id: 'l3', title: 'Готово', order: 2, boardId: 'b1' },
];

// Свої адреси, а не зовнішні: зовнішня адреса читається як посилання, і
// обкладинкою стати не може — саме так, як у застосунку з /uploads/…
const img = (id, name, color) => ({
  id, name, kind: 'file',
  url: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'><rect width='600' height='400' fill='${color}'/><text x='300' y='210' font-size='48' fill='white' text-anchor='middle' font-family='sans-serif'>${name}</text></svg>`),
});
const doc = (id, name) => ({ id, name, url: '/uploads/' + name, kind: 'file' });

const cards = [
  // Обкладинку не вибирали — має стати найсвіже фото (друге)
  { id: 'c1', listId: 'l1', title: 'Бриф', description: '', deadline: null, assigneeId: 'u1', subtasks: [], comments: [],
    attachments: [doc('f0', 'brief.pdf'), img('f1', 'first.jpg', '%23475569'), img('f2', 'second.jpg', '%230ea5e9')], order: 0, projectId: 'p1' },
  // Обкладинку вибрали руками — має лишитись перше фото
  { id: 'c2', listId: 'l2', title: 'Креативи', description: '', deadline: null, assigneeId: 'u2', subtasks: [], comments: [],
    attachments: [img('f3', 'a.png', '%2316a34a'), img('f4', 'b.png', '%23f59e0b')], coverAttachmentId: 'f3', order: 1, projectId: 'p1' },
  // Обкладинку прибрали руками — фото є, обкладинки бути не має
  { id: 'c3', listId: 'l2', title: 'Гайдлайн', description: '', deadline: null, assigneeId: null, subtasks: [], comments: [],
    attachments: [img('f5', 'c.jpg', '%23e11d48')], coverAttachmentId: null, order: 2, projectId: 'p2' },
  // Тільки документ — обкладинки немає
  { id: 'c4', listId: 'l1', title: 'Кошторис', description: '', deadline: null, assigneeId: null, subtasks: [], comments: [],
    attachments: [doc('f6', 'budget.xlsx')], order: 3, projectId: 'p1' },
];

function Harness() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const base: Record<string, any> = {
    state: { users, projects, lists, cards, tags: [], boards: [{ id: 'b1', title: 'Маркетинг' }], userGroups: [] },
    currentUser: { userId: 'u1', role: 'admin', name: 'Максим', email: '', avatar: '' },
    hasEditRights: true,
    activeBoardId: 'b1',
    activeProjectId,
    setActiveProjectId,
    openCardId: null,
    setActiveView: (view: string) => console.log('[board] setActiveView', view),
    confirmAction: (message: string, onConfirm: () => void) => { console.log('[board] confirm', message); onConfirm(); },
    canView: () => true,
  };

  // Усе, чого немає вище, — порожня функція: клацання в пісочниці нічого не
  // зберігають, і падати через це вона не має.
  const value = new Proxy(base, {
    get: (target, key: string) => (key in target ? target[key] : () => {}),
    has: () => true,
  });

  return (
    <AppContext.Provider value={value as any}>
      <div className="bg-gray-100 min-h-screen p-6 h-screen flex flex-col">
        <Board />
      </div>
    </AppContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);

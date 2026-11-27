/**
 * Пісочниця для «Структури відділу».
 *
 * Стан живе в пам'яті сторінки: нічого не йде в мережу й базу. Додавання,
 * зміна й видалення посад працюють справжнім кодом дерева — підмінено лише
 * контекст застосунку. `?empty` показує порожній стан, `?view` — режим без
 * прав редагування.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { AppContext } from '../src/App';
import OrgStructureView from '../src/components/OrgStructureView';
import { reparentOnDelete } from '../src/lib/orgStructure';
import type { OrgPosition } from '../src/types';

const avatar = (seed: string) => `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}`;
const users = ['Олена Коваль', 'Максим Гнатик', 'Ірина Мельник', 'Андрій Шевчук', 'Софія Бондар'].map((name, i) => ({
  id: `u${i + 1}`, name, avatar: avatar(name), role: ['Head of Marketing', 'Performance', 'SMM', 'Дизайнер', 'Копірайтер'][i],
}));

const doc = (id: string, name: string, kind: 'file' | 'link' = 'link') => ({ id, name, url: 'https://example.com/' + id, kind });
const p = (id: string, title: string, parentId: string | null, userId: string | null, order = 0, extra: Partial<OrgPosition> = {}): OrgPosition => ({
  id, title, parentId, userId, order, regulations: [], instructions: [], createdAt: `2026-01-01T00:00:0${order}Z`, ...extra,
});

const seed: OrgPosition[] = [
  p('head', 'Керівник відділу маркетингу', null, 'u1', 0, {
    color: '#2563eb',
    regulations: [doc('r1', 'Регламент планування кампаній')],
    instructions: [doc('i1', 'Посадова інструкція керівника', 'file')],
  }),
  p('perf', 'Performance-маркетолог', 'head', 'u2', 0, { regulations: [doc('r2', 'Регламент запуску реклами'), doc('r3', 'Бюджетування')], instructions: [doc('i2', 'Інструкція performance')] }),
  p('smm', 'SMM-менеджер', 'head', 'u3', 1, { instructions: [doc('i3', 'Інструкція SMM')] }),
  p('copy', 'Копірайтер', 'smm', 'u5', 0),
  p('stories', 'Stories-мейкер', 'smm', null, 1),
  p('design', 'Арт-директор', null, 'u4', 1, { color: '#7c3aed' }),
  p('motion', 'Моушн-дизайнер', 'design', null, 0),
  p('graph', 'Графічний дизайнер', 'design', null, 1),
];

function Harness() {
  const params = new URLSearchParams(location.search);
  const [positions, setPositions] = useState<OrgPosition[]>(params.has('empty') ? [] : seed);

  const value: Record<string, any> = {
    state: { users, orgPositions: positions },
    hasEditRights: !params.has('view'),
    confirmAction: (_m: string, ok: () => void) => ok(),
    addOrgPosition: (data: Omit<OrgPosition, 'id' | 'createdAt'>) => {
      const created: OrgPosition = { ...data, id: 'n' + Math.random().toString(36).slice(2, 8), createdAt: new Date().toISOString() };
      setPositions(prev => [...prev, created]);
      return created;
    },
    updateOrgPosition: (id: string, updates: Partial<OrgPosition>) =>
      setPositions(prev => prev.map(x => (x.id === id ? { ...x, ...updates } : x))),
    deleteOrgPosition: (id: string) =>
      setPositions(prev => {
        const moved = new Map(reparentOnDelete(prev, id).map(m => [m.id, m]));
        return prev.filter(x => x.id !== id).map(x => (moved.has(x.id) ? { ...x, parentId: moved.get(x.id)!.parentId, order: moved.get(x.id)!.order } : x));
      }),
  };

  const ctx = new Proxy(value, { get: (t, k: string) => (k in t ? t[k] : () => {}), has: () => true });

  return (
    <AppContext.Provider value={ctx as any}>
      <div className="bg-gray-50 h-screen p-6 flex flex-col">
        <OrgStructureView />
      </div>
    </AppContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);

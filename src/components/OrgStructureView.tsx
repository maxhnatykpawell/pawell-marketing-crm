import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, FileText, Network, Plus, UserRound } from 'lucide-react';
import { useAppContext } from '../App';
import type { OrgPosition } from '../types';
import {
  buildForest, branchColor, canReparent, nextOrder, docCount, descendantCount, BRANCH_COLORS, type OrgNode,
} from '../lib/orgStructure';
import { pluralUk } from '../lib/plural';
import OrgPositionPanel from './OrgPositionPanel';

/**
 * Структура відділу: схема посад з гілками, виконавцями й прикріпленими
 * регламентами та посадовими інструкціями.
 *
 * Розкладку дерева робить сама сторінка — позиції руками не розставляються,
 * тож схема завжди акуратна. Змінити підпорядкування можна перетягуванням
 * картки на іншу посаду; кинути на порожнє місце — зробити посаду окремою гілкою.
 */
export default function OrgStructureView() {
  const { state, hasEditRights, addOrgPosition, updateOrgPosition } = useAppContext();
  const positions = state.orgPositions || [];
  const users = state.users;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // id щойно створеної посади: панель одразу виділяє її назву для заміни
  const [freshId, setFreshId] = useState<string | null>(null);

  const forest = useMemo(() => buildForest(positions), [positions]);
  const selected = positions.find(p => p.id === selectedId) || null;

  // Видалили виділену посаду (тут чи в іншій вкладці) — закриваємо панель
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === 'Escape' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') setSelectedId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId]);

  // Нова посада може опинитись за межами екрана — плавно підводимо до неї
  useEffect(() => {
    if (!freshId) return;
    const el = document.querySelector(`[data-org-id="${freshId}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [freshId, positions.length]);

  const vacancies = positions.filter(p => !p.userId || !users.some(u => u.id === p.userId)).length;

  const addPosition = (parentId: string | null) => {
    const created = addOrgPosition({
      title: parentId ? 'Нова посада' : 'Нова гілка',
      parentId,
      userId: null,
      order: nextOrder(positions, parentId),
      regulations: [],
      instructions: [],
      // Нова гілка бере наступний колір із палітри, щоб гілки відрізнялись одразу
      ...(parentId ? {} : { color: pickBranchColor(positions) }),
    });
    setSelectedId(created.id);
    setFreshId(created.id);
  };

  const reparent = (id: string, parentId: string | null) => {
    const current = positions.find(p => p.id === id);
    if (!current || (current.parentId ?? null) === parentId) return;
    if (!canReparent(positions, id, parentId)) return;
    updateOrgPosition(id, { parentId, order: nextOrder(positions.filter(p => p.id !== id), parentId) });
  };

  const endDrag = () => { setDragId(null); setOverId(null); };

  const renderNode = (node: OrgNode): React.ReactNode => {
    const p = node.position;
    const color = branchColor(positions, p.id);
    const user = users.find(u => u.id === p.userId);
    const isSelected = selectedId === p.id;
    const isDragging = dragId === p.id;
    const isDropTarget = !!dragId && overId === p.id && canReparent(positions, dragId, p.id);
    const docs = docCount(p);
    const below = descendantCount(node);

    return (
      <li key={p.id}>
        <div
          data-org-id={p.id}
          draggable={hasEditRights}
          onDragStart={e => { setDragId(p.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); }}
          onDragEnd={endDrag}
          onDragOver={e => {
            if (dragId && canReparent(positions, dragId, p.id)) { e.preventDefault(); e.stopPropagation(); setOverId(p.id); }
          }}
          onDrop={e => {
            if (!dragId) return;
            e.preventDefault();
            e.stopPropagation();
            reparent(dragId, p.id);
            endDrag();
          }}
          className={`org-card group ${isSelected ? 'org-card-selected' : ''} ${isDropTarget ? 'org-card-drop' : ''} ${isDragging ? 'opacity-40' : ''}`}
          style={{ ['--org-accent' as string]: color }}
          onClick={e => { e.stopPropagation(); setSelectedId(isSelected ? null : p.id); }}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(isSelected ? null : p.id); } }}
          aria-pressed={isSelected}
          aria-label={`${p.title}${user ? `, ${user.name}` : ', вакансія'}`}
        >
          <div className="h-1.5 rounded-t-xl" style={{ backgroundColor: color }} />
          <div className="px-3 pt-2.5 pb-3">
            <div className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{p.title || 'Без назви'}</div>
            <div className="mt-2 flex items-center gap-2 min-h-[28px]">
              {user ? (
                <>
                  <img src={user.avatar} alt="" className="w-6 h-6 rounded-full bg-gray-100 object-cover shrink-0" />
                  <span className="text-xs text-gray-600 truncate">{user.name}</span>
                </>
              ) : (
                <>
                  <span className="w-6 h-6 rounded-full border border-dashed border-gray-300 flex items-center justify-center shrink-0">
                    <UserRound className="w-3.5 h-3.5 text-gray-300" />
                  </span>
                  <span className="text-xs text-gray-400 italic">Вакансія</span>
                </>
              )}
            </div>
            {(docs > 0 || below > 0) && (
              <div className="mt-2 flex items-center gap-2.5 text-[11px] text-gray-400">
                {p.regulations.length > 0 && (
                  <span className="inline-flex items-center gap-1" title="Регламенти"><BookOpen className="w-3 h-3" />{p.regulations.length}</span>
                )}
                {p.instructions.length > 0 && (
                  <span className="inline-flex items-center gap-1" title="Посадові інструкції"><FileText className="w-3 h-3" />{p.instructions.length}</span>
                )}
                {below > 0 && <span className="ml-auto" title="Посад у підпорядкуванні">↓ {below}</span>}
              </div>
            )}
          </div>

          {hasEditRights && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); addPosition(p.id); }}
              title="Додати підлеглу посаду"
              aria-label="Додати підлеглу посаду"
              className="org-add"
              style={{ borderColor: color, color }}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {node.children.length > 0 && <ul>{node.children.map(renderNode)}</ul>}
      </li>
    );
  };

  return (
    <div className="flex flex-1 w-full min-h-0 gap-4">
      <div className="flex-1 min-w-0 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">Структура відділу</h2>
            <p className="text-sm text-gray-500">
              {positions.length === 0
                ? 'Схема посад, виконавців і документів'
                : `${positions.length} ${pluralUk(positions.length, 'посада', 'посади', 'посад')} · ${forest.length} ${pluralUk(forest.length, 'гілка', 'гілки', 'гілок')}${vacancies ? ` · вакансій: ${vacancies}` : ''}`}
            </p>
          </div>
          {hasEditRights && positions.length > 0 && (
            <button
              type="button"
              onClick={() => addPosition(null)}
              className="px-3.5 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" /> Нова гілка
            </button>
          )}
        </div>

        <div
          className="flex-1 overflow-auto org-canvas"
          onClick={() => setSelectedId(null)}
          onDragOver={e => { if (dragId) { e.preventDefault(); setOverId(null); } }}
          onDrop={e => { if (dragId) { e.preventDefault(); reparent(dragId, null); endDrag(); } }}
        >
          {positions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-16">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <Network className="w-8 h-8 text-blue-500" />
              </div>
              <p className="text-lg font-semibold text-gray-800">Схеми ще немає</p>
              <p className="text-sm text-gray-500 mt-1 max-w-sm">
                Почніть із керівника відділу, а далі додавайте підлеглих. До кожної посади можна прикріпити регламент і посадову інструкцію.
              </p>
              {hasEditRights && (
                <button
                  type="button"
                  onClick={() => addPosition(null)}
                  className="mt-5 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Створити першу посаду
                </button>
              )}
            </div>
          ) : (
            <div className="org-forest">
              {forest.map(root => (
                <div key={root.position.id} className="org-tree" style={{ ['--org-line' as string]: branchColor(positions, root.position.id) + '66' }}>
                  <ul>{renderNode(root)}</ul>
                </div>
              ))}
            </div>
          )}
          {hasEditRights && dragId && positions.length > 0 && (
            <div className="sticky left-0 bottom-0 pointer-events-none px-4 pb-3">
              <div className="inline-block text-xs text-gray-500 bg-white/90 border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
                Киньте на посаду — підпорядкувати. Киньте на порожнє місце — зробити окремою гілкою.
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <OrgPositionPanel
          key={selected.id}
          position={selected}
          positions={positions}
          color={branchColor(positions, selected.id)}
          autoFocusTitle={freshId === selected.id}
          onClose={() => setSelectedId(null)}
          onAddChild={() => addPosition(selected.id)}
        />
      )}
    </div>
  );
}

/** Наступний колір палітри, якого ще немає серед коренів гілок */
function pickBranchColor(positions: OrgPosition[]): string {
  const used = new Set(positions.filter(p => !p.parentId).map(p => p.color));
  return BRANCH_COLORS.find(c => !used.has(c)) ?? BRANCH_COLORS[positions.length % BRANCH_COLORS.length];
}

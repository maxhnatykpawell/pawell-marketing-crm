import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Trash2, X } from 'lucide-react';
import { useAppContext } from '../App';
import type { OrgPosition } from '../types';
import {
  BRANCH_COLORS, canReparent, moveAmongSiblings, nextOrder, subtreeIds,
} from '../lib/orgStructure';
import OrgDocList from './OrgDocList';

interface Props {
  position: OrgPosition;
  positions: OrgPosition[];
  /** Колір з урахуванням успадкування від предків */
  color: string;
  autoFocusTitle: boolean;
  onClose: () => void;
  onAddChild: () => void;
}

/**
 * Панель вибраної посади: назва, виконавець, підпорядкування, колір гілки і два
 * списки документів. Кожна зміна пишеться одразу, як тільки її зроблено.
 */
export default function OrgPositionPanel({ position, positions, color, autoFocusTitle, onClose, onAddChild }: Props) {
  const { state, hasEditRights, updateOrgPosition, deleteOrgPosition, confirmAction } = useAppContext();
  const [title, setTitle] = useState(position.title);

  const commitTitle = () => {
    const next = title.trim();
    if (!next) { setTitle(position.title); return; }
    if (next !== position.title) updateOrgPosition(position.id, { title: next });
  };

  const subordinates = positions.filter(p => p.parentId === position.id).length;
  const ownSubtree = subtreeIds(positions, position.id);
  const parentOptions = positions
    .filter(p => !ownSubtree.has(p.id))
    .sort((a, b) => a.title.localeCompare(b.title, 'uk'));

  const move = (dir: -1 | 1) => {
    for (const m of moveAmongSiblings(positions, position.id, dir)) updateOrgPosition(m.id, { order: m.order });
  };

  const handleParent = (value: string) => {
    const parentId = value || null;
    if (!canReparent(positions, position.id, parentId)) return;
    updateOrgPosition(position.id, {
      parentId,
      order: nextOrder(positions.filter(p => p.id !== position.id), parentId),
    });
  };

  const handleDelete = () => {
    const note = subordinates > 0
      ? ` Її підлеглі (${subordinates}) піднімуться на рівень вище.`
      : '';
    confirmAction(`Видалити посаду «${position.title}»?${note} Прикріплені документи буде відв'язано.`, () => {
      deleteOrgPosition(position.id);
      onClose();
    });
  };

  const fieldClass = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500';
  const labelClass = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';
  const assignee = state.users.find(u => u.id === position.userId);

  return (
    <aside
      className="org-panel w-[380px] max-w-[45%] shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden"
      aria-label="Посада"
    >
      <div className="h-1.5 shrink-0" style={{ backgroundColor: color }} />
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-start gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <label className={labelClass} htmlFor="org-title">Посада</label>
          <input
            id="org-title"
            value={title}
            disabled={!hasEditRights}
            autoFocus={autoFocusTitle}
            onFocus={e => { if (autoFocusTitle) e.currentTarget.select(); }}
            onChange={e => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') { setTitle(position.title); e.currentTarget.blur(); }
            }}
            className="w-full text-lg font-bold text-gray-900 bg-transparent rounded-md px-1 -mx-1 py-0.5 outline-none hover:bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 disabled:hover:bg-transparent"
          />
        </div>
        <button type="button" onClick={onClose} title="Закрити (Esc)" className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto hidden-scrollbar px-5 py-4 space-y-6">
        <div>
          <label className={labelClass} htmlFor="org-user">Хто на посаді</label>
          <div className="flex items-center gap-2.5">
            {assignee && <img src={assignee.avatar} alt="" className="w-9 h-9 rounded-full bg-gray-100 object-cover shrink-0" />}
            <select
              id="org-user"
              value={position.userId ?? ''}
              disabled={!hasEditRights}
              onChange={e => updateOrgPosition(position.id, { userId: e.target.value || null })}
              className={fieldClass}
            >
              <option value="">Вакансія</option>
              {state.users.map(u => (
                <option key={u.id} value={u.id}>{u.name}{u.role ? ` — ${u.role}` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {hasEditRights && (
          <div>
            <label className={labelClass} htmlFor="org-parent">Підпорядковується</label>
            <select id="org-parent" value={position.parentId ?? ''} onChange={e => handleParent(e.target.value)} className={fieldClass}>
              <option value="">Нікому — вершина гілки</option>
              {parentOptions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={() => move(-1)} className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1" title="Посунути лівіше серед колег">
                <ArrowLeft className="w-3.5 h-3.5" /> Лівіше
              </button>
              <button type="button" onClick={() => move(1)} className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1" title="Посунути правіше серед колег">
                Правіше <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {hasEditRights && (
          <div>
            <span className={labelClass}>Колір гілки</span>
            <div className="flex flex-wrap items-center gap-2">
              {BRANCH_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => updateOrgPosition(position.id, { color: c })}
                  aria-label={`Колір ${c}`}
                  aria-pressed={color === c}
                  className="w-6 h-6 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400"
                  style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : undefined }}
                />
              ))}
              {position.color && position.parentId && (
                <button type="button" onClick={() => updateOrgPosition(position.id, { color: '' })} className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 ml-1">
                  Як у керівника
                </button>
              )}
            </div>
          </div>
        )}

        <OrgDocList
          title="Регламенти"
          hint="Прикріпіть правила роботи цієї посади: файл або посилання на документ."
          docs={position.regulations || []}
          canEdit={hasEditRights}
          accent={color}
          onChange={next => updateOrgPosition(position.id, { regulations: next })}
        />

        <OrgDocList
          title="Посадова інструкція"
          hint="Прикріпіть посадову інструкцію: файл або посилання на документ."
          docs={position.instructions || []}
          canEdit={hasEditRights}
          accent={color}
          onChange={next => updateOrgPosition(position.id, { instructions: next })}
        />
      </div>

      {hasEditRights && (
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/60">
          <button type="button" onClick={onAddChild} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Підлегла посада
          </button>
          <button type="button" onClick={handleDelete} className="px-2.5 py-1.5 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Видалити
          </button>
        </div>
      )}
    </aside>
  );
}

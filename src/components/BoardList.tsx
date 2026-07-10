import React, { useState } from 'react';
import { List } from '../types';
import { useAppContext } from '../App';
import BoardCard from './BoardCard';
import { Plus, MoreHorizontal, Trash2, Eye, EyeOff, CheckSquare, X, Check, ArrowDownAZ } from 'lucide-react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { cn } from '../utils';

interface Props {
  list: List;
  filterAssigneeId?: string | null;
  filterTagId?: string | null;
  filterOverdue?: boolean;
  index: number;
}

export default function BoardList({ list, filterAssigneeId, filterTagId, filterOverdue, index }: Props) {
  const { state, addCard, deleteList, clearList, updateList, updateCard, deleteCard, confirmAction, hasEditRights, activeProjectId } = useAppContext();
  const [isAdding, setIsAdding] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [limit, setLimit] = useState(10);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  // Filter and sort cards
  const cards = state.cards
    .filter(c => c.listId === list.id && (!activeProjectId || c.projectId === activeProjectId))
    .filter(c => {
      if (filterAssigneeId) {
        if (filterAssigneeId === 'unassigned') {
          if (c.assigneeId) return false;
        } else {
          if (c.assigneeId !== filterAssigneeId) return false;
        }
      }
      if (filterTagId && (!c.tagIds || !c.tagIds.includes(filterTagId))) return false;
      if (filterOverdue) {
        const isOverdue = c.deadline && new Date(c.deadline) < new Date() && c.listId !== state.lists[state.lists.length - 1]?.id && !c.isCompleted;
        if (!isOverdue) return false;
      }
      return true;
    })
    .sort((a, b) => a.order - b.order);

  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCardTitle.trim()) {
      // Apply active filters to the new card so it stays visible
      const initialValues: { assigneeId?: string | null; tagIds?: string[] } = {};
      if (filterAssigneeId) initialValues.assigneeId = filterAssigneeId;
      if (filterTagId) initialValues.tagIds = [filterTagId];
      addCard(list.id, newCardTitle.trim(), initialValues);
      setNewCardTitle('');
      setIsAdding(false);
    }
  };

  const sortCardsByDeadline = () => {
    setMenuOpen(false);
    
    // Sort logic: empty deadlines at the bottom, closest deadlines at the top
    const sorted = [...cards].sort((a, b) => {
      // Completed cards can go to the bottom too if desired, but we'll stick to deadline first
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });

    // Assign sequential orders (spaced by 1000 for safety)
    sorted.forEach((c, idx) => {
      const newOrder = idx * 1000;
      if (c.order !== newOrder) {
        updateCard(c.id, { order: newOrder });
      }
    });
  };

  return (
    <Draggable draggableId={list.id} index={index} isDragDisabled={!hasEditRights}>
      {(providedList, snapshotList) => (
        <div 
          ref={providedList.innerRef}
          {...providedList.draggableProps}
          {...providedList.dragHandleProps}
          style={providedList.draggableProps.style}
          className={cn(
            "w-80 shrink-0 bg-gray-100 rounded-xl flex flex-col max-h-full border border-transparent transition duration-200 shadow-sm",
            snapshotList.isDragging && "shadow-xl border-blue-300 ring-2 ring-blue-500/20 rotate-1 opacity-95"
          )}
        >
      {selectionMode ? (
        <div className="px-4 py-3 flex items-center justify-between bg-blue-50 border-b border-blue-100 rounded-t-xl min-h-[48px]">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setSelectedCardIds(selectedCardIds.length === cards.length ? [] : cards.map(c => c.id))}
              className="text-blue-600 font-medium text-sm flex items-center hover:text-blue-800 transition"
            >
              <CheckSquare className="w-4 h-4 mr-1.5" />
              {selectedCardIds.length === cards.length ? 'Зняти всі' : 'Вибрати всі'}
            </button>
            <span className="text-sm text-blue-800 font-semibold ml-2 bg-blue-100 px-2 py-0.5 rounded-full">{selectedCardIds.length}</span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => {
                if (selectedCardIds.length === 0) return;
                selectedCardIds.forEach(id => updateCard(id, { isCompleted: true }));
                setSelectionMode(false);
                setSelectedCardIds([]);
              }}
              title="Позначити виконаними"
              disabled={selectedCardIds.length === 0}
              className="p-1.5 hover:bg-blue-200 text-blue-700 rounded transition disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
            </button>
            <button 
              onClick={() => {
                if (selectedCardIds.length === 0) return;
                confirmAction(`Видалити вибрані задачі (${selectedCardIds.length})?`, () => {
                  selectedCardIds.forEach(id => deleteCard(id));
                  setSelectionMode(false);
                  setSelectedCardIds([]);
                });
              }}
              title="Видалити вибрані"
              disabled={selectedCardIds.length === 0}
              className="p-1.5 hover:bg-red-100 text-red-600 rounded transition disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-blue-200 mx-1"></div>
            <button 
              onClick={() => { setSelectionMode(false); setSelectedCardIds([]); }}
              className="p-1.5 hover:bg-blue-200 text-blue-600 rounded transition"
              title="Скасувати виділення"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 flex items-center justify-between group min-h-[48px]">
          <h3 className="font-semibold text-gray-800 tracking-tight flex items-center gap-2">
            {list.title}
            {list.excludeFromAI && <EyeOff className="w-3.5 h-3.5 text-gray-400" title="Виключено зі звіту ШІ" />}
          </h3>
          {hasEditRights && (
            <div className="relative">
            <button 
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 opacity-0 group-hover:opacity-100 transition"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20">
                <button
                  onClick={() => { 
                    setMenuOpen(false);
                    setSelectionMode(true);
                    setSelectedCardIds([]);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center"
                >
                  <CheckSquare className="w-4 h-4 mr-2 text-gray-500" />
                  Виділити задачі
                </button>
                <button
                  onClick={sortCardsByDeadline}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center"
                >
                  <ArrowDownAZ className="w-4 h-4 mr-2 text-gray-500" />
                  Сортувати за датою
                </button>
                <button
                  onClick={() => { 
                    setMenuOpen(false);
                    updateList(list.id, { excludeFromAI: !list.excludeFromAI });
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center"
                >
                  {list.excludeFromAI ? <Eye className="w-4 h-4 mr-2 text-gray-500" /> : <EyeOff className="w-4 h-4 mr-2 text-gray-500" />}
                  {list.excludeFromAI ? 'Включити в звіт ШІ' : 'Виключити зі звіту ШІ'}
                </button>
                <div className="h-px bg-gray-100 my-1"></div>
                <button
                  onClick={() => { 
                    setMenuOpen(false);
                    confirmAction('Видалити всі задачі в цій колонці?', () => clearList(list.id));
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Видалити всі задачі
                </button>
                <div className="h-px bg-gray-100 my-1"></div>
                <button
                  onClick={() => { 
                    setMenuOpen(false);
                    confirmAction('Ви впевнені, що хочете видалити колонку та всі її задачі?', () => deleteList(list.id));
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Видалити колонку
                </button>
              </div>
            </>
          )}
        </div>
        )}
      </div>
      )}

      <div className="px-3 pb-2 pt-1">
        {hasEditRights && (
          isAdding ? (
            <form onSubmit={handleAddCard} className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 border-b-gray-300">
              <textarea
                autoFocus
                className="w-full text-sm resize-none focus:outline-none bg-transparent"
                placeholder="Введіть назву задачі..."
                rows={2}
                value={newCardTitle}
                onChange={e => setNewCardTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddCard(e);
                  }
                }}
              />
              {filterOverdue && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 mb-1">
                  ⚠️ Встановіть дедлайн у картці, щоб вона відображалась у фільтрі «Протерміновані»
                </p>
              )}
              <div className="flex items-center space-x-2 mt-2">
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 transition"
                >
                  Додати задачу
                </button>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-2 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 text-sm font-medium rounded-md transition"
                >
                  Скасувати
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full flex items-center px-3 py-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200/70 font-medium rounded-lg text-sm transition"
            >
              <Plus className="w-4 h-4 mr-2" />
              Додати задачу
            </button>
          )
        )}
      </div>

      <Droppable droppableId={list.id} type="CARD">
        {(providedDrop, snapshotDrop) => (
          <div 
            ref={providedDrop.innerRef}
            {...providedDrop.droppableProps}
            className={cn(
              "flex-1 overflow-y-auto px-3 pb-3 hidden-scrollbar h-full min-h-[50px] transition-colors",
              snapshotDrop.isDraggingOver && "bg-blue-50/50 rounded-b-xl"
            )}
          >
            <div className="min-h-[10px]">
              {cards.slice(0, limit).map((card, cardIndex) => (
                <BoardCard 
                  key={card.id} 
                  card={card} 
                  index={cardIndex}
                  selectionMode={selectionMode}
                  isSelected={selectedCardIds.includes(card.id)}
                  onToggleSelect={() => {
                    if (selectedCardIds.includes(card.id)) {
                      setSelectedCardIds(prev => prev.filter(id => id !== card.id));
                    } else {
                      setSelectedCardIds(prev => [...prev, card.id]);
                    }
                  }}
                />
              ))}
              {providedDrop.placeholder}
            </div>
        {cards.length > limit && (
          <button
            onClick={() => setLimit(l => l + 10)}
            className="w-full text-sm text-blue-600 font-medium py-2 hover:bg-blue-50 rounded-lg transition mt-2"
          >
            Показати ще ({cards.length - limit})
          </button>
        )}
          </div>
        )}
      </Droppable>

        </div>
      )}
    </Draggable>
  );
}

import React, { useState } from 'react';
import { List } from '../types';
import { useAppContext } from '../App';
import BoardCard from './BoardCard';
import { Plus, MoreHorizontal, Trash2 } from 'lucide-react';
import { cn } from '../utils';

interface Props {
  list: List;
  key?: React.Key;
}

export default function BoardList({ list }: Props) {
  const { state, addCard, deleteList, clearList, moveCard, moveList, activeProjectId, confirmAction } = useAppContext();
  const [isAdding, setIsAdding] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [limit, setLimit] = useState(10);

  // Filter and sort cards
  const cards = state.cards
    .filter(c => c.listId === list.id && (!activeProjectId || c.projectId === activeProjectId))
    .sort((a, b) => a.order - b.order);

  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCardTitle.trim()) {
      addCard(list.id, newCardTitle.trim());
      setNewCardTitle('');
      setIsAdding(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const cardId = e.dataTransfer.getData('cardId');
    if (cardId) {
      moveCard(cardId, list.id);
      return;
    }
    
    const draggedListId = e.dataTransfer.getData('listId');
    if (draggedListId && draggedListId !== list.id) {
      moveList(draggedListId, list.id);
    }
  };

  return (
    <div 
      draggable
      onDragStart={(e) => {
        // Only set data if not dragging a card (handled by stopPropagation in Card)
        e.dataTransfer.setData('listId', list.id);
      }}
      className={cn(
        "w-80 shrink-0 bg-gray-100 rounded-xl flex flex-col max-h-full border border-transparent transition duration-200 shadow-sm cursor-grab active:cursor-grabbing",
        isDragOver && "bg-blue-50/70 border-blue-300 shadow-md ring-2 ring-blue-500/20"
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="px-4 py-3 flex items-center justify-between group">
        <h3 className="font-semibold text-gray-800 tracking-tight">{list.title}</h3>
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
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20">
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
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3 hidden-scrollbar h-full min-h-[50px]">
        {cards.slice(0, limit).map(card => (
          <BoardCard key={card.id} card={card} />
        ))}
        {cards.length > limit && (
          <button
            onClick={() => setLimit(l => l + 10)}
            className="w-full text-sm text-blue-600 font-medium py-2 hover:bg-blue-50 rounded-lg transition mt-2"
          >
            Показати ще ({cards.length - limit})
          </button>
        )}
      </div>

      <div className="px-3 pb-3 pt-2 mt-auto">
        {isAdding ? (
          <form onSubmit={handleAddCard} className="mt-2 bg-white rounded-lg shadow-sm border border-gray-200 p-2 border-b-gray-300">
            <textarea
              autoFocus
              className="w-full text-sm resize-none focus:outline-none bg-transparent"
              placeholder="Enter a title for this card..."
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
            <div className="flex items-center space-x-2 mt-2">
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 transition"
              >
                Add card
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-2 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 text-sm font-medium rounded-md transition"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full flex items-center px-3 py-2 text-gray-500 hover:text-gray-800 hover:bg-gray-200/70 font-medium rounded-lg text-sm transition"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add a card
          </button>
        )}
      </div>
    </div>
  );
}

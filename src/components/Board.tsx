import React, { useState } from 'react';
import { useAppContext } from '../App';
import BoardList from './BoardList';
import { Plus, Trash2, DownloadCloud, FolderKanban, Filter } from 'lucide-react';
import TrelloImportModal from './TrelloImportModal';

export default function Board() {
  const { state, addList, activeBoardId, setActiveBoardId, activeProjectId, setActiveProjectId, addBoard, deleteBoard, confirmAction } = useAppContext();
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [isAddingBoard, setIsAddingBoard] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [filterAssigneeId, setFilterAssigneeId] = useState<string | null>(null);
  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const [filterOverdue, setFilterOverdue] = useState(false);

  const boards = state.boards || [];
  const projects = state.projects || [];
  
  const currentBoardLists = activeBoardId 
    ? state.lists.filter(l => l.boardId === activeBoardId || (!l.boardId && boards.length > 0 && boards[0].id === activeBoardId)) 
    : state.lists;

  const sortedLists = [...currentBoardLists].sort((a, b) => a.order - b.order);

  const handleAddList = (e: React.FormEvent) => {
    e.preventDefault();
    if (newListTitle.trim()) {
      addList(newListTitle.trim());
      setNewListTitle('');
      setIsAddingList(false);
    }
  };

  const handleAddBoard = (e: React.FormEvent) => {
    e.preventDefault();
    if (newBoardTitle.trim()) {
      addBoard(newBoardTitle.trim());
      setNewBoardTitle('');
      setIsAddingBoard(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Board tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-6 w-full shrink-0">
        {boards.map(b => (
          <div 
            key={b.id} 
            className={`group flex items-center space-x-2 px-4 py-2 rounded-lg cursor-pointer transition ${activeBoardId === b.id ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'}`}
          >
            <span onClick={() => setActiveBoardId(b.id)} className="font-medium select-none">{b.title}</span>
            {activeBoardId === b.id && (
              <button 
                onClick={(e) => { e.stopPropagation(); confirmAction('Ви впевнені, що хочете видалити дошку та усі її списки?', () => deleteBoard(b.id)); }} 
                className="opacity-0 group-hover:opacity-100 hover:text-red-300 transition"
                title="Видалити дошку"
              >
                <Trash2 className="w-4 h-4 ml-2" />
              </button>
            )}
          </div>
        ))}
        {isAddingBoard ? (
          <form onSubmit={handleAddBoard} className="flex items-center bg-white px-2 py-1.5 rounded-lg border border-gray-200 shadow-sm w-64">
            <input
              type="text"
              autoFocus
              className="w-full text-sm focus:outline-none px-2"
              placeholder="Назва дошки..."
              value={newBoardTitle}
              onChange={e => setNewBoardTitle(e.target.value)}
              onBlur={() => { if (!newBoardTitle.trim()) setIsAddingBoard(false); }}
            />
            <button type="submit" className="text-blue-600 hover:text-blue-800 p-1">
              <Plus className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <button 
            onClick={() => setIsAddingBoard(true)} 
            className="flex items-center px-4 py-2 bg-white/50 hover:bg-white text-gray-600 border border-dashed border-gray-300 rounded-lg transition"
          >
             <Plus className="w-4 h-4 mr-2 text-gray-400" /> Додати дошку
          </button>
        )}
        <button 
          onClick={() => setIsImportModalOpen(true)} 
          className="flex items-center ml-auto px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition text-sm font-medium shrink-0"
        >
          <DownloadCloud className="w-4 h-4 mr-2" /> Імпорт з Trello
        </button>
      </div>

      {/* Project tabs */}
      {projects.length > 0 && (
        <div className="flex items-center gap-2 mb-4 w-full overflow-x-auto hidden-scrollbar pb-1">
          <div className="flex items-center text-sm font-semibold text-gray-500 mr-2 shrink-0">
            <FolderKanban className="w-4 h-4 mr-1.5" /> Фільтр:
          </div>
          <button
            onClick={() => setActiveProjectId(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition shrink-0 ${!activeProjectId ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Усі задачі
          </button>
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => setActiveProjectId(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition shrink-0 flex items-center gap-2 ${activeProjectId === p.id ? 'bg-gray-800 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
              {p.title}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 w-full bg-white p-3 rounded-xl border border-gray-200 shadow-sm shrink-0">
        <div className="flex items-center text-sm font-semibold text-gray-500 shrink-0">
          <Filter className="w-4 h-4 mr-1.5" /> Фільтри:
        </div>
        
        <select 
          value={filterAssigneeId || ''} 
          onChange={e => setFilterAssigneeId(e.target.value || null)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50"
        >
          <option value="">Усі виконавці</option>
          {state.users.map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        <select 
          value={filterTagId || ''} 
          onChange={e => setFilterTagId(e.target.value || null)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50"
        >
          <option value="">Усі теги</option>
          {state.tags?.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none ml-2 hover:text-blue-600 transition">
          <input 
            type="checkbox" 
            checked={filterOverdue} 
            onChange={e => setFilterOverdue(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
          />
          Протерміновані
        </label>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4 custom-scrollbar">
        <div className="flex items-start space-x-6 h-full w-max shrink-0">
          {sortedLists.map(list => (
            <BoardList 
              key={list.id} 
              list={list} 
              filterAssigneeId={filterAssigneeId}
              filterTagId={filterTagId}
              filterOverdue={filterOverdue}
            />
          ))}
          
          <div className="w-80 shrink-0">
          {isAddingList ? (
            <form onSubmit={handleAddList} className="bg-gray-100/80 backdrop-blur rounded-xl p-3 shadow-sm border border-gray-200">
              <input
                type="text"
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                placeholder="List title..."
                value={newListTitle}
                onChange={e => setNewListTitle(e.target.value)}
                onBlur={() => { if (!newListTitle.trim()) setIsAddingList(false); }}
              />
              <div className="flex items-center space-x-2 mt-3">
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                >
                  Add list
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingList(false)}
                  className="px-3 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 text-sm font-medium rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsAddingList(true)}
              className="w-full flex items-center px-4 py-3 bg-white/60 hover:bg-white/90 text-gray-700 font-medium rounded-xl border border-dashed border-gray-300 hover:border-gray-400 transition shadow-sm backdrop-blur"
            >
              <Plus className="w-5 h-5 mr-2 text-gray-500" />
              Add another list
            </button>
          )}
        </div>
      </div>
      </div>
      
      {isImportModalOpen && (
        <TrelloImportModal onClose={() => setIsImportModalOpen(false)} />
      )}
    </div>
  );
}

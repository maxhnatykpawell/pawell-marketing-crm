import React, { useState } from 'react';
import { useAppContext } from '../App';
import { Process } from '../types';
import { Plus, Edit3, Kanban, Trash2, GitMerge } from 'lucide-react';
import ProcessEditor from './ProcessEditor';
import ProcessTracker from './ProcessTracker';

export default function ProcessTreeView() {
  const { state, addProcess, deleteProcess, confirmAction, hasEditRights } = useAppContext();
  const processes = state.processes || [];
  
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(processes[0]?.id || null);
  const [mode, setMode] = useState<'editor' | 'tracker'>('tracker');

  const selectedProcess = processes.find(p => p.id === selectedProcessId);

  const handleCreateProcess = () => {
    const title = prompt('Назва нового процесу:');
    if (title) {
      addProcess({ title, nodes: [], edges: [] });
    }
  };

  const handleDelete = (id: string) => {
    confirmAction('Ви впевнені, що хочете видалити цей процес? Всі зв\'язки проєктів з цим процесом будуть збережені, але сам процес зникне.', () => {
      deleteProcess(id);
      if (selectedProcessId === id) setSelectedProcessId(null);
    });
  };

  return (
    <div className="flex flex-1 w-full h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Процеси</h2>
          {hasEditRights && (
            <button onClick={handleCreateProcess} className="p-1 hover:bg-gray-200 rounded text-gray-600 transition" title="Створити новий процес">
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="p-2 flex-1 overflow-y-auto hidden-scrollbar">
          {processes.length === 0 ? (
            <p className="text-sm text-gray-500 p-2 text-center">Немає створених процесів</p>
          ) : (
            processes.map(p => (
              <div
                key={p.id}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition mb-1 ${selectedProcessId === p.id ? 'bg-blue-100 text-blue-800 font-medium' : 'hover:bg-gray-200 text-gray-700'}`}
                onClick={() => setSelectedProcessId(p.id)}
              >
                <span className="truncate pr-2">{p.title}</span>
                {hasEditRights && selectedProcessId === p.id && (
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="text-red-500 hover:text-red-700 p-1" title="Видалити">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedProcess ? (
          <>
            <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between z-10 shrink-0">
              <h2 className="text-xl font-bold text-gray-800">{selectedProcess.title}</h2>
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setMode('tracker')}
                  className={`flex items-center px-4 py-1.5 text-sm font-medium rounded-md transition ${mode === 'tracker' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  <Kanban className="w-4 h-4 mr-2" /> Трекер
                </button>
                {hasEditRights && (
                  <button
                    onClick={() => setMode('editor')}
                    className={`flex items-center px-4 py-1.5 text-sm font-medium rounded-md transition ${mode === 'editor' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    <Edit3 className="w-4 h-4 mr-2" /> Редактор
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 relative bg-gray-50/50">
              {mode === 'editor' ? (
                <ProcessEditor process={selectedProcess} />
              ) : (
                <ProcessTracker process={selectedProcess} />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <GitMerge className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-lg">Виберіть процес зліва або створіть новий</p>
          </div>
        )}
      </div>
    </div>
  );
}

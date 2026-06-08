import React, { useState } from 'react';
import { useAppContext } from '../App';
import { Users, Plus, X, Edit2, Trash2, Sparkles } from 'lucide-react';
import { User } from '../types';
import AdminUsersPanel from './AdminUsersPanel';
import AdminSettingsPanel from './AdminSettingsPanel';

export default function TeamManager({ onClose }: { onClose: () => void }) {
  const { state, addUser, updateUser, deleteUser, confirmAction } = useAppContext();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (userName.trim()) {
      addUser(userName.trim());
      setUserName('');
      setIsAdding(false);
    }
  };

  const handleUpdate = (e: React.FormEvent, userId: string) => {
    e.preventDefault();
    if (userName.trim()) {
      updateUser(userId, { name: userName.trim() });
      setUserName('');
      setEditingId(null);
    }
  };

  const startEdit = (user: User) => {
    setUserName(user.name);
    setEditingId(user.id);
    setIsAdding(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center text-lg font-bold text-gray-900">
            <Users className="w-5 h-5 mr-2 text-blue-600" />
            Team Members
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[75vh] hidden-scrollbar space-y-4">
          {/* Users list */}
          <div className="space-y-4">
            {state.users.map(u => {
              // Calculate workload for this week
              const isThisWeek = (dateString: string | null) => {
                if (!dateString) return false;
                const date = new Date(dateString);
                const now = new Date();
                const currentDay = now.getDay() === 0 ? 7 : now.getDay();
                const startOfWeek = new Date(now);
                startOfWeek.setDate(now.getDate() - currentDay + 1);
                startOfWeek.setHours(0, 0, 0, 0);
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                endOfWeek.setHours(23, 59, 59, 999);
                return date >= startOfWeek && date <= endOfWeek;
              };

              const isThisMonth = (dateString: string | null) => {
                if (!dateString) return false;
                const date = new Date(dateString);
                const now = new Date();
                return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
              };

              const userCardsThisWeek = state.cards.filter(c => 
                c.assigneeId === u.id && 
                c.listId !== state.lists[state.lists.length - 1]?.id && 
                isThisWeek(c.deadline)
              );
              
              const userCardsThisMonth = state.cards.filter(c => 
                c.assigneeId === u.id && 
                isThisMonth(c.deadline)
              );

              const totalMinutes = userCardsThisWeek.reduce((sum, c) => sum + (c.estimatedMinutes || 0), 0);
              const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
              const maxHours = 40; // Default 40h work week
              const isOverloaded = totalHours > maxHours;
              const progressPercent = Math.min(100, (totalHours / maxHours) * 100);

              const totalStoryPoints = userCardsThisMonth.filter(c => c.isCompleted).reduce((sum, c) => sum + (c.storyPoints || 0), 0);

              return (
                <div key={u.id} className="flex flex-col bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:border-gray-300 transition">
                  <div className="flex items-center justify-between mb-3">
                    {editingId === u.id ? (
                      <form onSubmit={e => handleUpdate(e, u.id)} className="flex-1 flex gap-2 w-full">
                        <input
                          autoFocus
                          type="text"
                          value={userName}
                          onChange={e => setUserName(e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-blue-500 rounded-md outline-none text-sm focus:ring-2 focus:ring-blue-200"
                        />
                        <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md">Save</button>
                        <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-md">Cancel</button>
                      </form>
                    ) : (
                      <>
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-full border border-gray-200 shrink-0 object-cover" />
                          <div>
                            <span className="font-semibold text-gray-800 truncate block">{u.name}</span>
                            {u.email && <span className="text-xs text-gray-400">{u.email}</span>}
                          </div>
                        </div>
                        <div className="flex items-center space-x-1 shrink-0 ml-3">
                          <button onClick={() => startEdit(u)} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition" title="Edit">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => confirmAction(`Remove ${u.name} from the board?`, () => deleteUser(u.id))}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Workload Progress */}
                  <div className="mt-1">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Навантаження (тиждень)</span>
                      <span className={`text-xs font-bold ${isOverloaded ? 'text-red-600' : 'text-gray-700'}`}>
                        {totalHours} / {maxHours} год
                      </span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ease-out ${isOverloaded ? 'bg-red-500' : 'bg-green-500'}`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    {isOverloaded && (
                      <p className="text-red-500 text-[10px] mt-1 font-medium text-right">⚠️ Перевантаження</p>
                    )}
                  </div>

                  {/* Story Points */}
                  <div className="mt-3 flex justify-between items-center pt-2 border-t border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Story Points (місяць)</span>
                    <span className="flex items-center text-yellow-700 bg-yellow-50 border border-yellow-100 px-2 py-0.5 rounded text-xs font-bold">
                      <Sparkles className="w-3 h-3 mr-1" /> {totalStoryPoints} SP
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add member */}
          {isAdding ? (
            <form onSubmit={handleAdd} className="bg-blue-50 rounded-lg p-3 border border-blue-100 flex gap-2 w-full shadow-sm">
              <input
                autoFocus
                type="text"
                value={userName}
                onChange={e => setUserName(e.target.value)}
                placeholder="Enter member name..."
                className="flex-1 px-3 py-1.5 border border-blue-300 rounded-md outline-none text-sm focus:ring-2 focus:ring-blue-200 bg-white"
              />
              <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md disabled:opacity-50">Add</button>
              <button type="button" onClick={() => setIsAdding(false)} className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm font-semibold rounded-md">Cancel</button>
            </form>
          ) : (
            <button
              onClick={() => { setIsAdding(true); setUserName(''); setEditingId(null); }}
              className="w-full flex items-center justify-center p-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50 border border-dashed border-gray-300 hover:border-blue-300 rounded-lg transition font-medium"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Member
            </button>
          )}

          {/* Admin panel (only visible to admins) */}
          <AdminUsersPanel />
          <AdminSettingsPanel />
        </div>
      </div>
    </div>
  );
}

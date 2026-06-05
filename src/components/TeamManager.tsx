import React, { useState } from 'react';
import { useAppContext } from '../App';
import { Users, Plus, X, Edit2, Trash2 } from 'lucide-react';
import { User } from '../types';

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
        
        <div className="p-6 overflow-y-auto max-h-[60vh] hidden-scrollbar space-y-4">
          {state.users.map(u => (
            <div key={u.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:border-gray-300 transition">
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
                    <span className="font-semibold text-gray-800 truncate">{u.name}</span>
                  </div>
                  <div className="flex items-center space-x-1 shrink-0 ml-3">
                    <button onClick={() => startEdit(u)} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition" title="Edit">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        confirmAction(`Remove ${u.name} from the board?`, () => deleteUser(u.id));
                      }} 
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition" 
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {isAdding ? (
            <form onSubmit={handleAdd} className="bg-blue-50 rounded-lg p-3 border border-blue-100 flex gap-2 w-full mt-4 shadow-sm">
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
              className="w-full flex items-center justify-center p-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50 border border-dashed border-gray-300 hover:border-blue-300 rounded-lg mt-4 transition font-medium"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Member
            </button>
          )}

        </div>
      </div>
    </div>
  );
}

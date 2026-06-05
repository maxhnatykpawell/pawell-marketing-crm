import React, { useState } from 'react';
import { useAppContext } from '../App';
import { X, Plus, Trash2, GripVertical, PenLine, Settings } from 'lucide-react';

export default function ContentPlanSettings({ onClose }: { onClose: () => void }) {
  const { state, updateSettings } = useAppContext();
  const [activeTab, setActiveTab] = useState<'columns' | 'channels' | 'statuses'>('columns');

  // Fallbacks if not present in older states
  const rawChannels = state.contentPlanChannels || [
    { name: 'Instagram', color: '#fce7f3' },
    { name: 'Telegram', color: '#e0f2fe' },
    { name: 'LinkedIn', color: '#dbeafe' },
    { name: 'YouTube', color: '#fee2e2' },
    { name: 'TikTok', color: '#f1f5f9' },
    { name: 'Blog', color: '#fef3c7' },
    { name: 'Facebook', color: '#e0e7ff' }
  ];

  const DEFAULT_CHANNEL_COLORS: Record<string, string> = {
    'Instagram': '#fce7f3',
    'Telegram': '#e0f2fe',
    'LinkedIn': '#dbeafe',
    'YouTube': '#fee2e2',
    'TikTok': '#f1f5f9',
    'Blog': '#fef3c7',
    'Facebook': '#e0e7ff'
  };

  const channels = rawChannels.map(ch => typeof ch === 'string' ? { name: ch, color: DEFAULT_CHANNEL_COLORS[ch] || '#f3f4f6' } : ch);
  const statuses = state.contentPlanStatuses || ['Ідея', 'В роботі', 'На погодженні', 'Заплановано', 'Опубліковано', 'Відхилено'];
  const columns = state.contentPlanColumns || [
    { id: 'focus', title: 'Фокус на 2 тижні / Тема', visible: true },
    { id: 'channel', title: 'Канал', visible: true },
    { id: 'description', title: 'Короткий опис', visible: true },
    { id: 'assignee', title: 'Відповідальний', visible: true },
    { id: 'status', title: 'Статус', visible: true },
    { id: 'tags', title: 'Теги', visible: true },
    { id: 'publishDate', title: 'Дата', visible: true },
    { id: 'engagement', title: 'Охоплення/Взаємодія', visible: true }
  ];

  const [newItem, setNewItem] = useState('');
  const [newChannelColor, setNewChannelColor] = useState('#e0f2fe');

  const PRESET_COLORS = ['#fce7f3', '#e0f2fe', '#dbeafe', '#fee2e2', '#f1f5f9', '#fef3c7', '#e0e7ff', '#dcfce7'];

  const handleAddChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (newItem.trim() && !channels.find(c => c.name === newItem.trim())) {
      updateSettings({ contentPlanChannels: [...rawChannels, { name: newItem.trim(), color: newChannelColor }] });
      setNewItem('');
    }
  };

  const handleRemoveChannel = (chName: string) => {
    updateSettings({ contentPlanChannels: rawChannels.filter(c => {
      const name = typeof c === 'string' ? c : c.name;
      return name !== chName;
    }) });
  };

  const handleAddStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (newItem.trim() && !statuses.includes(newItem.trim())) {
      updateSettings({ contentPlanStatuses: [...statuses, newItem.trim()] });
      setNewItem('');
    }
  };

  const handleRemoveStatus = (st: string) => {
    updateSettings({ contentPlanStatuses: statuses.filter(s => s !== st) });
  };

  const toggleColumn = (id: string) => {
    updateSettings({
      contentPlanColumns: columns.map(c => c.id === id ? { ...c, visible: !c.visible } : c)
    });
  };

  const renameColumn = (id: string, newTitle: string) => {
    updateSettings({
      contentPlanColumns: columns.map(c => c.id === id ? { ...c, title: newTitle } : c)
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center text-lg font-bold text-gray-900">
            <Settings className="w-5 h-5 mr-2 text-blue-600" />
            Налаштування таблиці
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-gray-200">
          <button 
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'columns' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
            onClick={() => { setActiveTab('columns'); setNewItem(''); }}
          >
            Колонки
          </button>
          <button 
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'channels' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
            onClick={() => { setActiveTab('channels'); setNewItem(''); }}
          >
            Канали
          </button>
          <button 
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'statuses' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
            onClick={() => { setActiveTab('statuses'); setNewItem(''); }}
          >
            Статуси
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[60vh] hidden-scrollbar min-h-[300px]">
          
          {activeTab === 'columns' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">Вимкніть колонки які вам не потрібні, або перейменуйте їх.</p>
              {columns.map(col => (
                <div key={col.id} className={`flex items-center justify-between p-3 rounded-lg border transition ${col.visible ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50 opacity-60'}`}>
                  <div className="flex items-center space-x-3 flex-1">
                    <input 
                      type="checkbox" 
                      checked={col.visible} 
                      onChange={() => toggleColumn(col.id)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300"
                    />
                    <input 
                      type="text" 
                      value={col.title}
                      onChange={(e) => renameColumn(col.id, e.target.value)}
                      className="flex-1 bg-transparent border-none outline-none font-medium text-gray-700 focus:ring-0"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'channels' && (
            <div className="space-y-4">
              <form onSubmit={handleAddChannel} className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <input
                  type="text"
                  value={newItem}
                  onChange={e => setNewItem(e.target.value)}
                  placeholder="Новий канал..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md outline-none text-sm focus:ring-2 focus:ring-blue-200 transition bg-white"
                />
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center space-x-1.5">
                    {PRESET_COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewChannelColor(color)}
                          className={`w-5 h-5 rounded-full border border-gray-300 transition ${newChannelColor === color ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : ''}`}
                          style={{ backgroundColor: color }}
                        />
                    ))}
                  </div>
                  <button type="submit" disabled={!newItem.trim()} className="px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md disabled:opacity-50">Додати</button>
                </div>
              </form>
              <div className="space-y-2">
                {channels.map(ch => (
                  <div key={ch.name} className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition" style={{ backgroundColor: ch.color !== 'transparent' ? ch.color : undefined }}>
                    <span className="text-sm font-medium text-gray-800">{ch.name}</span>
                    <button onClick={() => handleRemoveChannel(ch.name)} className="p-1 text-gray-400 hover:text-red-500 rounded transition bg-white/50 hover:bg-white">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'statuses' && (
            <div className="space-y-4">
              <form onSubmit={handleAddStatus} className="flex gap-2">
                <input
                  type="text"
                  value={newItem}
                  onChange={e => setNewItem(e.target.value)}
                  placeholder="Новий статус..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md outline-none text-sm focus:ring-2 focus:ring-blue-200 transition"
                />
                <button type="submit" disabled={!newItem.trim()} className="px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md disabled:opacity-50">Додати</button>
              </form>
              <div className="space-y-2">
                {statuses.map(st => (
                  <div key={st} className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition">
                    <span className="text-sm font-medium text-gray-700">{st}</span>
                    <button onClick={() => handleRemoveStatus(st)} className="p-1 text-gray-400 hover:text-red-500 rounded transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

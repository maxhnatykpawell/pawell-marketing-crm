import React, { useState } from 'react';
import { EventItem } from '../types';
import { useAppContext } from '../App';
import { X } from 'lucide-react';

interface Props {
  event: EventItem | null; // if null, mode is Add
  onClose: () => void;
}

export default function EventDialog({ event, onClose }: Props) {
  const { state, addEvent, updateEvent } = useAppContext();
  const isEditing = !!event;
  
  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [startDate, setStartDate] = useState(event?.startDate ? event.startDate.split('T')[0] : new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(event?.endDate ? event.endDate.split('T')[0] : new Date().toISOString().split('T')[0]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(event?.assigneeIds || []);
  const [websiteUrl, setWebsiteUrl] = useState(event?.websiteUrl || '');

  const toggleAssignee = (id: string) => {
    if (assigneeIds.includes(id)) {
      setAssigneeIds(assigneeIds.filter(a => a !== id));
    } else {
      setAssigneeIds([...assigneeIds, id]);
    }
  };

  const handleSave = () => {
    const payload = {
      title,
      description,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      assigneeIds,
      websiteUrl
    };

    if (isEditing) {
      updateEvent(event.id, payload);
    } else {
      addEvent(payload);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">
            {isEditing ? 'Редагувати подію' : 'Додати подію'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Назва події / Виставки</label>
            <input 
              type="text" 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              placeholder="Напр. Web Summit 2026"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата початку</label>
              <input 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата завершення</label>
              <input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Посилання на сайт</label>
            <input 
              type="url" 
              value={websiteUrl} 
              onChange={e => setWebsiteUrl(e.target.value)} 
              placeholder="https://..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Опис</label>
            <textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder="Про що ця подія, основна мета..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition min-h-[100px] resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Делегація (хто їде)</label>
            <div className="flex flex-wrap gap-2">
              {state.users.map(u => {
                const isSelected = assigneeIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => toggleAssignee(u.id)}
                    className={`flex items-center px-3 py-1.5 rounded-full border text-sm transition ${isSelected ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    <img src={u.avatar} alt={u.name} className="w-5 h-5 rounded-full mr-2" />
                    {u.name}
                  </button>
                );
              })}
              {state.users.length === 0 && <span className="text-sm text-gray-500">Немає членів команди. Додайте їх у Team Settings.</span>}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 font-medium rounded-lg transition">
            Скасувати
          </button>
          <button 
            onClick={handleSave} 
            disabled={!title.trim() || !startDate || !endDate}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}

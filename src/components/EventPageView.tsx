import React, { useState, useEffect } from 'react';
import { useAppContext } from '../App';
import { ArrowLeft, Save, MapPin, Globe, Calendar, Users, FileText, Target, Box, Flag } from 'lucide-react';
import { EventItem } from '../types';

const EditableTextArea = ({ 
  value, 
  onChange, 
  placeholder, 
  activeClassName,
  minHeight = '100px'
}: { 
  value: string; 
  onChange: (val: string) => void; 
  placeholder: string;
  activeClassName: string;
  minHeight?: string;
}) => {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <textarea
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setIsEditing(false)}
        placeholder={placeholder}
        style={{ minHeight }}
        className={`w-full p-3 border rounded-xl transition resize-y text-sm bg-white shadow-sm outline-none ${activeClassName}`}
      />
    );
  }

  return (
    <div 
      onClick={() => setIsEditing(true)}
      style={{ minHeight }}
      className="w-full p-3 border border-transparent rounded-xl hover:border-gray-200 bg-gray-50 hover:bg-gray-100 cursor-pointer transition text-sm text-gray-800 whitespace-pre-wrap"
    >
      {value || <span className="text-gray-400 italic hover:text-gray-500 transition-colors">{placeholder}</span>}
    </div>
  );
};

export default function EventPageView() {
  const { state, activeEventId, setActiveView, updateEvent, setActiveEventId } = useAppContext();
  
  const event = state.events?.find(e => e.id === activeEventId);
  
  const [formData, setFormData] = useState<Partial<EventItem>>({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!event) return;
    
    setFormData(current => {
      // If we switched to a new event, load it and reset dirty state
      if (current.id !== event.id) {
        setIsDirty(false);
        return event;
      }
      
      // If we are currently editing this same event, ignore external updates to prevent overwriting user input
      if (isDirty) {
        return current;
      }
      
      // Otherwise, load the event
      return event;
    });
  }, [event, isDirty]);

  if (!event) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center p-10 bg-white rounded-xl shadow-sm border border-gray-200">
        <p className="text-gray-500 mb-4">Подія не знайдена.</p>
        <button 
          onClick={() => { setActiveView('events'); setActiveEventId(null); }}
          className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg"
        >
          Повернутися до списку
        </button>
      </div>
    );
  }

  const handleChange = (field: keyof EventItem, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    if (activeEventId) {
      updateEvent(activeEventId, formData);
      setIsDirty(false);
    }
  };

  const toggleAssignee = (id: string) => {
    const current = formData.assigneeIds || [];
    if (current.includes(id)) {
      handleChange('assigneeIds', current.filter(a => a !== id));
    } else {
      handleChange('assigneeIds', [...current, id]);
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <div className="flex items-center">
          <button 
            onClick={() => { setActiveView('events'); setActiveEventId(null); }}
            className="p-2 mr-4 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-gray-800">Деталі події / виставки</h2>
        </div>
        
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className={`flex items-center px-4 py-2 font-medium rounded-lg transition ${isDirty ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
        >
          <Save className="w-4 h-4 mr-2" />
          Зберегти зміни
        </button>
      </div>

      {/* Main Content scrollable */}
      <div className="flex-1 overflow-y-auto hidden-scrollbar p-6 space-y-8">
        
        {/* Title area */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Назва події</label>
          <input
            type="text"
            value={formData.title || ''}
            onChange={e => handleChange('title', e.target.value)}
            className="w-full text-2xl font-bold text-gray-900 border-b-2 border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none transition py-1 bg-transparent"
            placeholder="Введіть назву..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left Column - Details */}
          <div className="md:col-span-2 space-y-8">
            
            <section>
              <h3 className="flex items-center text-lg font-bold text-gray-800 mb-3">
                <FileText className="w-5 h-5 mr-no mb-0.5 text-blue-500 mr-2" /> 
                Основний опис
              </h3>
              <EditableTextArea
                value={formData.description || ''}
                onChange={val => handleChange('description', val)}
                placeholder="Що це за подія, для чого вона?"
                activeClassName="border-blue-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                minHeight="100px"
              />
            </section>

            <section>
              <h3 className="flex items-center text-lg font-bold text-gray-800 mb-3">
                <Target className="w-5 h-5 text-orange-500 mr-2" /> 
                Цілі участі
              </h3>
              <EditableTextArea
                value={formData.goals || ''}
                onChange={val => handleChange('goals', val)}
                placeholder="Чого ми хочемо досягти на цій виставці? KPI, потрібні знайомства..."
                activeClassName="border-orange-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                minHeight="100px"
              />
            </section>

            <section>
              <h3 className="flex items-center text-lg font-bold text-gray-800 mb-3">
                <Box className="w-5 h-5 text-purple-500 mr-2" /> 
                Інформація про стенд (Booth / Stand)
              </h3>
              <EditableTextArea
                value={formData.boothInfo || ''}
                onChange={val => handleChange('boothInfo', val)}
                placeholder="Номер стенду, локація в залі, які матеріали потрібно підготувати для стенду..."
                activeClassName="border-purple-300 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                minHeight="100px"
              />
            </section>

            <section>
              <h3 className="flex items-center text-lg font-bold text-gray-800 mb-3">
                <Flag className="w-5 h-5 text-green-500 mr-2" /> 
                Логістика та деталі (Квитки / Готель)
              </h3>
              <EditableTextArea
                value={formData.logisticsNotes || ''}
                onChange={val => handleChange('logisticsNotes', val)}
                placeholder="Інформація про авіаквитки, готель, трансфери, інші організаційні моменти..."
                activeClassName="border-green-300 focus:border-green-500 focus:ring-1 focus:ring-green-500"
                minHeight="120px"
              />
            </section>

            <section>
              <h3 className="flex items-center text-lg font-bold text-gray-800 mb-3">
                <FileText className="w-5 h-5 text-gray-500 mr-2" /> 
                Детальні Нотатки
              </h3>
              <EditableTextArea
                value={formData.detailedNotes || ''}
                onChange={val => handleChange('detailedNotes', val)}
                placeholder="Вільні нотатки, розклад зустрічей під час події..."
                activeClassName="border-gray-300 focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                minHeight="200px"
              />
            </section>
          </div>

          {/* Right Column - Meta Data */}
          <div className="space-y-6">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-5">
              
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 mr-2 opacity-70" /> Дати
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={formData.startDate ? formData.startDate.split('T')[0] : ''}
                    onChange={e => handleChange('startDate', new Date(e.target.value).toISOString())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm"
                  />
                  <input
                    type="date"
                    value={formData.endDate ? formData.endDate.split('T')[0] : ''}
                    onChange={e => handleChange('endDate', new Date(e.target.value).toISOString())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <MapPin className="w-4 h-4 mr-2 opacity-70" /> Локація / Місто
                </label>
                <input
                  type="text"
                  value={formData.location || ''}
                  onChange={e => handleChange('location', e.target.value)}
                  placeholder="Введіть локацію..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <Globe className="w-4 h-4 mr-2 opacity-70" /> Сайт події
                </label>
                <input
                  type="url"
                  value={formData.websiteUrl || ''}
                  onChange={e => handleChange('websiteUrl', e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
              <label className="flex items-center text-sm font-medium text-gray-700 mb-3">
                <Users className="w-4 h-4 mr-2 opacity-70" /> Делегація
              </label>
              
              <div className="grid grid-cols-1 gap-2">
                {state.users.map(u => {
                  const isSelected = (formData.assigneeIds || []).includes(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleAssignee(u.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition ${isSelected ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center">
                        <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full mr-3" />
                        <span className="font-medium">{u.name}</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                        {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                      </div>
                    </button>
                  );
                })}
                {state.users.length === 0 && (
                  <span className="text-sm text-gray-500 italic block mt-2">Немає членів команди.</span>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

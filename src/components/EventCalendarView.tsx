import React, { useState } from 'react';
import { useAppContext } from '../App';
import { EventItem } from '../types';
import { Plus, Calendar as CalendarIcon, MapPin, Globe, Users, Trash2, ArrowUpRight } from 'lucide-react';
import EventDialog from './EventDialog';

export default function EventCalendarView() {
  const { state, deleteEvent, setActiveView, setActiveEventId, confirmAction } = useAppContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);

  const events = state.events || [];
  
  // Sort events chronologically
  const sortedEvents = [...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const handleOpenDetails = (event: EventItem) => {
    setActiveEventId(event.id);
    setActiveView('event-details');
  };

  const handleAddNew = () => {
    setEditingEvent(null);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingEvent(null);
  };
  
  const formatDateRange = (start: string, end: string) => {
    const d1 = new Date(start);
    const d2 = new Date(end);
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    
    if (d1.getTime() === d2.getTime()) {
      return d1.toLocaleDateString('uk-UA', { ...options, year: 'numeric' });
    }
    
    if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) {
      return `${d1.getDate()} - ${d2.toLocaleDateString('uk-UA', { ...options, year: 'numeric' })}`;
    }
    
    return `${d1.toLocaleDateString('uk-UA', options)} - ${d2.toLocaleDateString('uk-UA', { ...options, year: 'numeric' })}`;
  };

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col transition-all duration-300">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            Події та Виставки
          </h2>
          <p className="text-gray-500 text-sm mt-1">Планування делегацій та важливих заходів</p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Додати подію
        </button>
      </div>

      <div className="flex-1 overflow-y-auto hidden-scrollbar pb-10 space-y-4">
        {sortedEvents.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 border-dashed">
            <div className="w-16 h-16 bg-blue-50 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <CalendarIcon className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium text-gray-800 mb-1">Немає запланованих подій</h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">Додайте інформацію про майбутні виставки, конференції або збори.</p>
            <button
              onClick={handleAddNew}
              className="inline-flex items-center px-4 py-2 bg-blue-50 text-blue-600 font-medium rounded-lg hover:bg-blue-100 transition"
            >
              <Plus className="w-4 h-4 mr-2" />
              Додати подію
            </button>
          </div>
        ) : (
          sortedEvents.map(event => {
            const hasPassed = new Date(event.endDate).getTime() < new Date().setHours(0, 0, 0, 0);
            
            return (
              <div 
                key={event.id} 
                onClick={() => handleOpenDetails(event)}
                className={`bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition group cursor-pointer ${hasPassed ? 'opacity-60 saturate-50' : ''}`}
              >
                <div className="p-6 sm:flex sm:items-start gap-6">
                  {/* Date Block */}
                  <div className="flex-shrink-0 bg-blue-50 text-blue-700 rounded-lg p-4 text-center sm:w-32 mb-4 sm:mb-0">
                    <CalendarIcon className="w-6 h-6 mx-auto mb-2 opacity-80" />
                    <div className="text-sm font-semibold tracking-tight leading-tight">
                      {formatDateRange(event.startDate, event.endDate)}
                    </div>
                  </div>
                  
                  {/* Content Block */}
                  <div className="flex-grow min-w-0">
                    <div className="flex justify-between items-start">
                      <h3 className="text-xl font-bold text-gray-900 truncate pr-4">{event.title}</h3>
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); confirmAction('Видалити подію?', () => deleteEvent(event.id)); }} 
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" 
                          title="Видалити"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {event.description && (
                      <p className="text-gray-600 mt-2 text-sm leading-relaxed whitespace-pre-wrap line-clamp-3">
                        {event.description}
                      </p>
                    )}
                    
                    <div className="mt-4 flex flex-wrap gap-4 items-center text-sm">
                      {event.websiteUrl && (
                        <a 
                          href={event.websiteUrl.startsWith('http') ? event.websiteUrl : `https://${event.websiteUrl}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-flex items-center text-blue-600 hover:text-blue-800 transition font-medium"
                        >
                          <Globe className="w-4 h-4 mr-1.5 opacity-70" />
                          Сайт події
                          <ArrowUpRight className="w-3.5 h-3.5 ml-0.5 opacity-70" />
                        </a>
                      )}
                      
                      {event.assigneeIds && event.assigneeIds.length > 0 && (
                        <div className="flex items-center text-gray-500 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100">
                          <Users className="w-4 h-4 mr-2" />
                          <div className="flex -space-x-1.5">
                            {event.assigneeIds.map(id => {
                              const u = state.users.find(u => u.id === id);
                              if (!u) return null;
                              return <img key={id} src={u.avatar} alt={u.name} title={u.name} className="w-5 h-5 rounded-full border border-white" />;
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {dialogOpen && (
        <EventDialog event={editingEvent} onClose={handleCloseDialog} />
      )}
    </div>
  );
}

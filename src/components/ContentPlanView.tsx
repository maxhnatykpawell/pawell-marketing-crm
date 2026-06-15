import React, { useState } from 'react';
import { useAppContext } from '../App';
import { Plus, Trash2, Settings } from 'lucide-react';
import { ContentPlanItem } from '../types';
import { v4 as uuidv4 } from 'uuid';
import TagPicker from './TagPicker';
import ContentPlanSettings from './ContentPlanSettings';
import ChannelPicker from './ChannelPicker';
import ContentPlanImportModal from './ContentPlanImportModal';
import { DownloadCloud } from 'lucide-react';

const DEFAULT_CHANNELS = [
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
const DEFAULT_STATUSES = ['Ідея', 'В роботі', 'На погодженні', 'Заплановано', 'Опубліковано', 'Відхилено'];
const DEFAULT_COLUMNS = [
  { id: 'focus', title: 'Фокус на 2 тижні / Тема', visible: true },
  { id: 'channel', title: 'Канал', visible: true },
  { id: 'description', title: 'Короткий опис', visible: true },
  { id: 'assignee', title: 'Відповідальний', visible: true },
  { id: 'status', title: 'Статус', visible: true },
  { id: 'tags', title: 'Теги', visible: true },
  { id: 'publishDate', title: 'Дата', visible: true },
  { id: 'engagement', title: 'Охоплення/Взаємодія', visible: true }
];

export default function ContentPlanView() {
  const { state, addContentPlan, updateContentPlan, deleteContentPlan, confirmAction } = useAppContext();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const rawChannels = state.contentPlanChannels || DEFAULT_CHANNELS;
  const channels = rawChannels.map(ch => typeof ch === 'string' ? { name: ch, color: DEFAULT_CHANNEL_COLORS[ch] || '#f3f4f6' } : ch);
  const statuses = state.contentPlanStatuses || DEFAULT_STATUSES;
  const columns = state.contentPlanColumns || DEFAULT_COLUMNS;
  
  // Create a helper to check column visibility
  const isColVisible = (id: string) => columns.find(c => c.id === id)?.visible !== false;
  const colTitle = (id: string, defaultTitle: string) => columns.find(c => c.id === id)?.title || defaultTitle;

  // Filter and sort plans by date
  const filteredPlans = (state.contentPlans || []).filter(plan => {
    if (filterChannel !== 'all') {
      const planChannels = plan.channels || (plan.channel ? [plan.channel] : []);
      if (!planChannels.includes(filterChannel)) return false;
    }
    if (filterAssignee !== 'all') {
      if (filterAssignee === 'unassigned') {
        if (plan.assigneeId) return false;
      } else {
        if (plan.assigneeId !== filterAssignee) return false;
      }
    }
    if (filterStatus !== 'all') {
      if (plan.status !== filterStatus) return false;
    }
    return true;
  });

  const sortedPlans = [...filteredPlans].sort((a, b) => {
    if (!a.publishDate) return 1;
    if (!b.publishDate) return -1;
    return new Date(a.publishDate).getTime() - new Date(b.publishDate).getTime();
  });

  const handleAddRow = () => {
    addContentPlan({
      focus: '',
      channel: channels[0]?.name || '',
      channels: [channels[0]?.name || ''],
      description: '',
      assigneeId: null,
      status: statuses[0] || '',
      tagIds: [],
      publishDate: null,
      engagement: ''
    });
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex flex-col gap-4 bg-gray-50 flex-shrink-0">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Контент-план</h2>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition"
            >
              <DownloadCloud className="w-4 h-4 mr-2" />
              Імпорт CSV
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition"
            >
              <Settings className="w-4 h-4 mr-2" />
              Налаштування
            </button>
            <button
              onClick={handleAddRow}
              className="flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
            >
              <Plus className="w-4 h-4 mr-2" />
              Додати публікацію
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-600">Фільтри:</span>
          
          <select 
            value={filterChannel} 
            onChange={(e) => setFilterChannel(e.target.value)}
            className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-w-[140px]"
          >
            <option value="all">Усі канали</option>
            {channels.map(ch => (
              <option key={ch.name} value={ch.name}>{ch.name}</option>
            ))}
          </select>

          <select 
            value={filterAssignee} 
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-w-[160px]"
          >
            <option value="all">Усі виконавці</option>
            <option value="unassigned">Не призначено</option>
            {state.users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-w-[140px]"
          >
            <option value="all">Усі статуси</option>
            {statuses.map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
          
          {(filterChannel !== 'all' || filterAssignee !== 'all' || filterStatus !== 'all') && (
            <button 
              onClick={() => {
                setFilterChannel('all');
                setFilterAssignee('all');
                setFilterStatus('all');
              }}
              className="flex items-center text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1.5 rounded transition"
            >
              Скинути
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto hidden-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wider sticky top-0 z-10">
              {isColVisible('focus') && <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[200px]">{colTitle('focus', 'Фокус на 2 тижні / Тема')}</th>}
              {isColVisible('channel') && <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[200px]">{colTitle('channel', 'Канал')}</th>}
              {isColVisible('description') && <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[200px]">{colTitle('description', 'Короткий опис')}</th>}
              {isColVisible('assignee') && <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[150px]">{colTitle('assignee', 'Відповідальний')}</th>}
              {isColVisible('status') && <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[140px]">{colTitle('status', 'Статус')}</th>}
              {isColVisible('tags') && <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[150px]">{colTitle('tags', 'Теги')}</th>}
              {isColVisible('publishDate') && <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[140px]">{colTitle('publishDate', 'Дата')}</th>}
              {isColVisible('engagement') && <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[200px]">{colTitle('engagement', 'Охоплення/Взаємодія')}</th>}
              <th className="px-4 py-3 font-semibold border-b border-gray-200 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {sortedPlans.map(plan => {
              const rowChannels = plan.channels || (plan.channel ? [plan.channel] : []);
              const mainChannel = rowChannels[0];
              const channelColor = mainChannel ? channels.find(c => c.name === mainChannel)?.color : undefined;
              const hasColor = channelColor && channelColor !== 'transparent';
              const isPublished = plan.status === 'Опубліковано';
              
              return (
              <tr 
                key={plan.id} 
                className={`hover:bg-black/[0.03] group transition ${isPublished ? 'opacity-60 bg-gray-100' : ''}`} 
                style={isPublished ? undefined : { backgroundColor: hasColor ? channelColor : undefined }}
              >
                {isColVisible('focus') && (
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={plan.focus}
                      onChange={(e) => updateContentPlan(plan.id, { focus: e.target.value })}
                      placeholder="..."
                      className={`w-full bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 rounded px-2 py-1 border border-transparent hover:border-gray-200 transition ${isPublished ? 'line-through text-gray-500' : ''}`}
                    />
                  </td>
                )}
                {isColVisible('channel') && (
                  <td className="px-4 py-2">
                    <ChannelPicker
                      selectedChannels={rowChannels}
                      options={channels}
                      onChange={(newChannels) => updateContentPlan(plan.id, { channels: newChannels, channel: newChannels[0] || '' })}
                    />
                  </td>
                )}
                {isColVisible('description') && (
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={plan.description}
                      onChange={(e) => updateContentPlan(plan.id, { description: e.target.value })}
                      placeholder="..."
                      className="w-full bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 rounded px-2 py-1 border border-transparent hover:border-gray-200 transition"
                    />
                  </td>
                )}
                {isColVisible('assignee') && (
                  <td className="px-4 py-2">
                    <select
                      value={plan.assigneeId || ''}
                      onChange={(e) => updateContentPlan(plan.id, { assigneeId: e.target.value || null })}
                      className="w-full bg-transparent outline-none cursor-pointer hover:bg-gray-100 rounded px-2 py-1 border border-transparent hover:border-gray-200 transition"
                    >
                      <option value="">Не призначено</option>
                      {state.users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </td>
                )}
                {isColVisible('status') && (
                  <td className="px-4 py-2">
                    <select
                      value={plan.status}
                      onChange={(e) => updateContentPlan(plan.id, { status: e.target.value })}
                      className="w-full bg-transparent outline-none cursor-pointer hover:bg-gray-100 rounded px-2 py-1 border border-transparent hover:border-gray-200 transition"
                    >
                      {statuses.map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </td>
                )}
                {isColVisible('tags') && (
                  <td className="px-4 py-2">
                    <TagPicker
                      selectedTagIds={plan.tagIds || []}
                      onChange={(newTagIds) => updateContentPlan(plan.id, { tagIds: newTagIds })}
                      compact={true}
                    />
                  </td>
                )}
                {isColVisible('publishDate') && (
                  <td className="px-4 py-2">
                    <input
                      type="date"
                      value={plan.publishDate ? plan.publishDate.split('T')[0] : ''}
                      onChange={(e) => updateContentPlan(plan.id, { publishDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      className="w-full bg-transparent outline-none cursor-pointer hover:bg-gray-100 rounded px-2 py-1 border border-transparent hover:border-gray-200 transition text-gray-700"
                    />
                  </td>
                )}
                {isColVisible('engagement') && (
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={plan.engagement}
                      onChange={(e) => updateContentPlan(plan.id, { engagement: e.target.value })}
                      placeholder="..."
                      className="w-full bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 rounded px-2 py-1 border border-transparent hover:border-gray-200 transition"
                    />
                  </td>
                )}
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => {
                      confirmAction('Ви впевнені, що хочете видалити цей рядок?', () => {
                        deleteContentPlan(plan.id);
                      });
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white/50 rounded transition opacity-0 group-hover:opacity-100"
                    title="Видалити"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            )})}
            {sortedPlans.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  Немає запланованих публікацій. Додайте першу, щоб почати!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isSettingsOpen && (
        <ContentPlanSettings onClose={() => setIsSettingsOpen(false)} />
      )}
      {isImportModalOpen && (
        <ContentPlanImportModal onClose={() => setIsImportModalOpen(false)} />
      )}
    </div>
  );
}

import React, { useState, useRef } from 'react';
import { Card, Subtask, Comment } from '../types';
import { useAppContext } from '../App';
import { uploadFile, reviewPlanWithAI } from '../api';
import {
  X, Calendar, AlignLeft, CheckSquare, Paperclip, Trash2,
  FolderKanban, Clock, Sparkles, Plus, Tag, Users, MessageSquare,
  Image, Eye, MoreHorizontal, Circle, CheckCircle2, ChevronDown,
  User as UserIcon, Check
} from 'lucide-react';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import TagPicker from './TagPicker';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  card: Card;
  onClose: () => void;
}

// Avatar initials helper
function AvatarFallback({ name, color }: { name: string; color?: string }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ backgroundColor: color || '#f59e0b' }}
    >
      {initials}
    </div>
  );
}

export default function CardModal({ card, onClose }: Props) {
  const { state, updateCard, deleteCard, confirmAction, currentUser } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUserRecord = state.users.find(u => u.id === currentUser?.userId) || state.users[0];

  const list = state.lists.find(l => l.id === card.listId);

  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Which "add" panels are open
  const [openPanel, setOpenPanel] = useState<'members' | 'date' | 'checklist' | 'attachment' | null>(null);

  const handleReviewPlan = async () => {
    if (!card.title) return;
    setIsReviewing(true);
    try {
      const { explanation, newSubtasks, storyPoints } = await reviewPlanWithAI(card.title, card.description || '', card.subtasks || []);
      const newSubtaskObjects: Subtask[] = newSubtasks.map((st: string) => ({
        id: uuidv4(), title: st, completed: false
      }));
      const newComment: Comment = {
        id: uuidv4(),
        authorId: currentUserRecord?.id || '',
        text: `🤖 **Мудрий Менеджер (AI):**\n\nОцінка задачі: **${storyPoints} SP**\n\n${explanation}`,
        createdAt: new Date().toISOString()
      };
      updateCard(card.id, {
        subtasks: [...(card.subtasks || []), ...newSubtaskObjects],
        comments: [...(card.comments || []), newComment],
        storyPoints
      });
    } catch {
      alert('Помилка при зверненні до ШІ. Перевірте API ключ.');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleUpdate = (updates: Partial<Card>) => updateCard(card.id, updates);

  const handleTitleBlur = () => {
    if (title.trim() !== card.title) {
      handleUpdate({ title: title.trim() || 'Без назви' });
      if (!title.trim()) setTitle('Без назви');
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== card.description) handleUpdate({ description });
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    const newSubtask: Subtask = { id: uuidv4(), title: newSubtaskTitle.trim(), completed: false };
    handleUpdate({ subtasks: [...(card.subtasks || []), newSubtask] });
    setNewSubtaskTitle('');
  };

  const toggleSubtask = (subtaskId: string) => {
    handleUpdate({
      subtasks: card.subtasks.map(st =>
        st.id === subtaskId ? { ...st, completed: !st.completed } : st
      )
    });
  };

  const deleteSubtask = (subtaskId: string) => {
    handleUpdate({ subtasks: card.subtasks.filter(st => st.id !== subtaskId) });
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    const newComment: Comment = {
      id: uuidv4(),
      authorId: currentUserRecord?.id || '',
      text: newCommentText.trim(),
      createdAt: new Date().toISOString()
    };
    handleUpdate({ comments: [...(card.comments || []), newComment] });
    setNewCommentText('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const attachment = await uploadFile(file);
      attachment.id = uuidv4();
      handleUpdate({ attachments: [...(card.attachments || []), attachment] });
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Assignee: the main card assigneeId
  const assignees = card.assigneeId ? [state.users.find(u => u.id === card.assigneeId)].filter(Boolean) : [];

  // Tags
  const selectedTags = (card.tagIds || []).map(id => state.tags.find(t => t.id === id)).filter(Boolean);

  // Progress
  const subtasks = card.subtasks || [];
  const completedCount = subtasks.filter(s => s.completed).length;
  const progressPct = subtasks.length ? Math.round((completedCount / subtasks.length) * 100) : 0;

  // Sorted comments (newest last)
  const sortedComments = [...(card.comments || [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 bg-gray-900/50 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden mb-8"
        style={{ minHeight: 480 }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          {/* List badge */}
          <button className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition">
            {list?.title || 'Без списку'}
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          </button>

          <div className="flex items-center gap-1">
            <button className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition" title="Обкладинка">
              <Image className="w-4.5 h-4.5" />
            </button>
            <button className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition" title="Переглянути">
              <Eye className="w-4.5 h-4.5" />
            </button>
            <button className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition" title="Більше">
              <MoreHorizontal className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Two-column body ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ══ LEFT COLUMN ══ */}
          <div className="flex-1 px-6 py-3 overflow-y-auto hidden-scrollbar space-y-5">

            {/* Title */}
            <div className="flex items-start gap-3">
              <button
                onClick={() => handleUpdate({ isCompleted: !card.isCompleted })}
                className="mt-1 shrink-0 text-gray-300 hover:text-blue-500 transition"
                title={card.isCompleted ? 'Відмітити як невиконане' : 'Відмітити як виконане'}
              >
                {card.isCompleted
                  ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                  : <Circle className="w-5 h-5" />}
              </button>
              <textarea
                className="flex-1 text-2xl font-bold text-gray-900 bg-transparent resize-none outline-none leading-tight focus:bg-gray-50 rounded-lg px-2 py-1 -ml-2 transition min-h-[2.5rem]"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                rows={title.length > 40 ? 2 : 1}
              />
              {card.storyPoints && (
                <span className="shrink-0 mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  <Sparkles className="w-3 h-3 mr-1" />
                  {card.storyPoints} SP
                </span>
              )}
            </div>

            {/* Quick action toolbar */}
            <div className="flex items-center gap-2 flex-wrap pl-8">
              <button
                onClick={() => setOpenPanel(openPanel === 'members' ? null : 'members')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Додати
              </button>
              <button
                onClick={() => setOpenPanel(openPanel === 'date' ? null : 'date')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition font-medium"
              >
                <Calendar className="w-3.5 h-3.5" />
                Дати
              </button>
              <button
                onClick={() => { setOpenPanel(null); setShowSubtaskInput(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition font-medium"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                Перелік
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition font-medium"
              >
                <Paperclip className="w-3.5 h-3.5" />
                Вкладення
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

              {/* AI button */}
              <button
                onClick={handleReviewPlan}
                disabled={isReviewing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition font-medium disabled:opacity-50 border border-indigo-100"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isReviewing ? 'ШІ думає…' : 'ШІ аналіз'}
              </button>
            </div>

            {/* Date quick-panel */}
            {openPanel === 'date' && (
              <div className="ml-8 p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Дедлайн</span>
                </div>
                <input
                  type="date"
                  value={card.deadline ? card.deadline.split('T')[0] : ''}
                  onChange={e => handleUpdate({ deadline: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Оцінка часу (хв)</span>
                </div>
                <input
                  type="number"
                  min="0"
                  placeholder="Хвилин"
                  value={card.estimatedMinutes || ''}
                  onChange={e => handleUpdate({ estimatedMinutes: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
                <div className="flex items-center gap-2 mt-1">
                  <FolderKanban className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Проєкт</span>
                </div>
                <select
                  value={card.projectId || ''}
                  onChange={e => handleUpdate({ projectId: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  <option value="">Без проєкту</option>
                  {(state.projects || []).map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Members panel */}
            {openPanel === 'members' && (
              <div className="ml-8 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <UserIcon className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Виконавець</span>
                </div>
                <select
                  value={card.assigneeId || ''}
                  onChange={e => handleUpdate({ assigneeId: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  <option value="">Не призначено</option>
                  {state.users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Participants row */}
            {card.assigneeId && (
              <div className="pl-8">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Учасники</p>
                <div className="flex items-center gap-2">
                  {assignees.map(u => u && (
                    <React.Fragment key={u.id}>
                      {u.avatar
                        ? <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full border-2 border-white ring-1 ring-gray-200" title={u.name} />
                        : <AvatarFallback name={u.name} />}
                    </React.Fragment>
                  ))}
                  <button
                    onClick={() => setOpenPanel('members')}
                    className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition border border-dashed border-gray-300"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Tags row */}
            {(selectedTags.length > 0 || true) && (
              <div className="pl-8">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Мітки</p>
                <div className="flex items-center flex-wrap gap-2">
                  {selectedTags.map(tag => tag && (
                    <span
                      key={tag.id}
                      className="px-3 py-1 rounded-md text-sm font-semibold text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                  {/* TagPicker toggle */}
                  <TagPicker cardId={card.id} selectedTagIds={card.tagIds || []} compact />
                </div>
              </div>
            )}

            {/* Description */}
            <div className="pl-8">
              <div className="flex items-center gap-2 mb-2">
                <AlignLeft className="w-4 h-4 text-gray-500 -ml-6" />
                <p className="text-sm font-semibold text-gray-700">Опис</p>
              </div>
              <textarea
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition resize-none min-h-[90px]"
                placeholder="Додати детальніший опис..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                onBlur={handleDescriptionBlur}
              />
            </div>

            {/* Subtasks / Checklist */}
            {(subtasks.length > 0 || showSubtaskInput) && (
              <div className="pl-8">
                <div className="flex items-center gap-2 mb-2 -ml-6">
                  <CheckSquare className="w-4 h-4 text-gray-500" />
                  <p className="text-sm font-semibold text-gray-700 flex-1">Перелік</p>
                  <button
                    onClick={handleReviewPlan}
                    disabled={isReviewing}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
                  >
                    <Sparkles className="w-3 h-3" />
                    {isReviewing ? 'Аналіз…' : 'ШІ'}
                  </button>
                </div>

                {subtasks.length > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-gray-500 font-medium w-7 text-right">{progressPct}%</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${progressPct}%`, backgroundColor: progressPct === 100 ? '#22c55e' : '#3b82f6' }}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  {subtasks.map(st => (
                    <div key={st.id} className="flex items-start gap-2 py-1 px-2 rounded-lg hover:bg-gray-50 group transition">
                      <button
                        onClick={() => toggleSubtask(st.id)}
                        className="mt-0.5 shrink-0"
                      >
                        {st.completed
                          ? <CheckSquare className="w-4 h-4 text-blue-500" />
                          : <div className="w-4 h-4 border-2 border-gray-300 rounded" />}
                      </button>
                      <span className={`text-sm flex-1 ${st.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                        {st.title}
                      </span>
                      <button
                        onClick={() => deleteSubtask(st.id)}
                        className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500 p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {showSubtaskInput ? (
                  <form onSubmit={handleAddSubtask} className="mt-2 flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Новий пункт..."
                      value={newSubtaskTitle}
                      onChange={e => setNewSubtaskTitle(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-400"
                      onKeyDown={e => { if (e.key === 'Escape') setShowSubtaskInput(false); }}
                    />
                    <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
                      Додати
                    </button>
                    <button type="button" onClick={() => setShowSubtaskInput(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition">
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => setShowSubtaskInput(true)}
                    className="mt-2 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-2 py-1 rounded-lg transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Додати пункт
                  </button>
                )}
              </div>
            )}

            {/* Attachments (if any) */}
            {card.attachments && card.attachments.length > 0 && (
              <div className="pl-8">
                <div className="flex items-center gap-2 mb-2 -ml-6">
                  <Paperclip className="w-4 h-4 text-gray-500" />
                  <p className="text-sm font-semibold text-gray-700">Вкладення</p>
                </div>
                <div className="space-y-2">
                  {card.attachments.map(att => {
                    const isImage = att.name.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i);
                    return (
                      <div key={att.id} className="flex items-center gap-3 p-2 rounded-xl border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-white transition group">
                        {isImage
                          ? <img src={att.url} alt={att.name} className="w-12 h-12 object-cover rounded-lg border border-gray-200" />
                          : <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center text-[10px] font-bold text-gray-500">FILE</div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{att.name}</p>
                          <div className="flex gap-2 mt-1">
                            <a href={att.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Відкрити</a>
                            <a href={att.url} download={att.name} className="text-xs text-green-600 hover:underline">Завантажити</a>
                          </div>
                        </div>
                        <button
                          onClick={() => handleUpdate({ attachments: card.attachments.filter(a => a.id !== att.id) })}
                          className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Delete card button */}
            <div className="pl-8 pb-4">
              <button
                onClick={() => confirmAction('Видалити цю картку?', () => { deleteCard(card.id); onClose(); })}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Видалити картку
              </button>
            </div>
          </div>

          {/* ══ RIGHT COLUMN — Comments ══ */}
          <div className="w-72 shrink-0 border-l border-gray-100 bg-gray-50/60 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">Коментарі й активність</span>
              </div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-gray-500 hover:text-gray-800 font-medium transition"
              >
                {showDetails ? 'Сховати деталі' : 'Показати деталі'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto hidden-scrollbar px-4 py-3 space-y-4">
              {/* Comment input */}
              <div className="flex gap-2">
                {currentUserRecord?.avatar
                  ? <img src={currentUserRecord.avatar} alt="" className="w-7 h-7 rounded-full shrink-0 mt-0.5" />
                  : <AvatarFallback name={currentUserRecord?.name || 'U'} />}
                <form onSubmit={handleAddComment} className="flex-1">
                  <input
                    type="text"
                    value={newCommentText}
                    onChange={e => setNewCommentText(e.target.value)}
                    placeholder="Написати коментар..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition"
                  />
                  {newCommentText.trim() && (
                    <button
                      type="submit"
                      className="mt-1.5 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition"
                    >
                      Зберегти
                    </button>
                  )}
                </form>
              </div>

              {/* Activity / comments list */}
              <div className="space-y-4">
                {/* Card creation activity */}
                {showDetails && (
                  <div className="flex gap-2 items-start">
                    {currentUserRecord?.avatar
                      ? <img src={currentUserRecord.avatar} alt="" className="w-7 h-7 rounded-full shrink-0 mt-0.5" />
                      : <AvatarFallback name={currentUserRecord?.name || 'U'} />}
                    <div>
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">{currentUserRecord?.name}</span>
                        {' додав(ла) цю картку до '}
                        <span className="font-medium">{list?.title}</span>
                      </p>
                      <p className="text-xs text-blue-500 mt-0.5 hover:underline cursor-pointer">
                        {format(new Date(card.comments?.[0]?.createdAt || new Date()), 'd MMM. yyyy р., HH:mm', { locale: uk })}
                      </p>
                    </div>
                  </div>
                )}

                {sortedComments.map(comment => {
                  const author = state.users.find(u => u.id === comment.authorId);
                  const isAI = comment.text.startsWith('🤖');
                  return (
                    <div key={comment.id} className="flex gap-2 items-start">
                      {author?.avatar
                        ? <img src={author.avatar} alt="" className="w-7 h-7 rounded-full shrink-0 mt-0.5" />
                        : <AvatarFallback name={author?.name || '?'} color={isAI ? '#6366f1' : undefined} />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700">
                          <span className="font-semibold">{isAI ? 'ШІ Менеджер' : (author?.name || 'Unknown')}</span>
                          {' прокоментував(ла)'}
                        </p>
                        <div className={`mt-1 p-2.5 rounded-xl text-sm text-gray-700 whitespace-pre-wrap shadow-sm border ${isAI ? 'bg-indigo-50 border-indigo-100' : 'bg-white border-gray-200'}`}>
                          {comment.text}
                        </div>
                        <p className="text-xs text-blue-500 mt-1 hover:underline cursor-pointer">
                          {format(new Date(comment.createdAt), 'd MMM. yyyy р., HH:mm', { locale: uk })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

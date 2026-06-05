import React, { useState, useRef } from 'react';
import { Card, Subtask, Comment } from '../types';
import { useAppContext } from '../App';
import { uploadFile } from '../api';
import { X, Calendar, AlignLeft, CheckSquare, MessageSquare, Paperclip, User as UserIcon, Trash2, Link as LinkIcon } from 'lucide-react';
import { format } from 'date-fns';
import TagPicker from './TagPicker';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  card: Card;
  onClose: () => void;
}

export default function CardModal({ card, onClose }: Props) {
  const { state, updateCard, deleteCard, confirmAction } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const list = state.lists.find(l => l.id === card.listId);
  const assignee = state.users.find(u => u.id === card.assigneeId);

  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleUpdate = (updates: Partial<Card>) => {
    updateCard(card.id, updates);
  };

  const handleTitleBlur = () => {
    if (title.trim() !== card.title) {
      handleUpdate({ title: title.trim() || 'Untitled' });
      if (!title.trim()) setTitle('Untitled');
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== card.description) {
      handleUpdate({ description });
    }
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    const newSubtask: Subtask = { id: uuidv4(), title: newSubtaskTitle.trim(), completed: false };
    handleUpdate({ subtasks: [...(card.subtasks || []), newSubtask] });
    setNewSubtaskTitle('');
  };

  const updateSubtask = (subtaskId: string, updates: Partial<Subtask>) => {
    handleUpdate({
      subtasks: card.subtasks.map(st => st.id === subtaskId ? { ...st, ...updates } : st)
    });
  };

  const toggleSubtask = (subtaskId: string) => {
    const subtask = card.subtasks.find(st => st.id === subtaskId);
    if (subtask) {
      updateSubtask(subtaskId, { completed: !subtask.completed });
    }
  };

  const deleteSubtask = (subtaskId: string) => {
    handleUpdate({
      subtasks: card.subtasks.filter(st => st.id !== subtaskId)
    });
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    const newComment: Comment = {
      id: uuidv4(),
      authorId: state.users[0].id, // assume first user is current user for demo
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
    } catch (err) {
      console.error('Upload failed', err);
      alert('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between bg-gray-50/50">
          <div className="flex-1 mr-4">
            <input 
              type="text" 
              className="text-xl font-bold text-gray-900 w-full bg-transparent p-1 -ml-1 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded outline-none transition"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
            />
            <p className="text-sm text-gray-500 mt-1 pl-1">in list <span className="font-medium underline decoration-gray-300">{list?.title}</span></p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto hidden-scrollbar">
          <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="hidden-scrollbar col-span-1 md:col-span-3 space-y-8">
              
              {/* Description */}
              <div>
                <div className="flex items-center text-gray-700 font-semibold mb-3">
                  <AlignLeft className="w-5 h-5 mr-3 text-gray-400" />
                  Description
                </div>
                <div className="ml-8">
                  <textarea 
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition resize-y min-h-[100px]"
                    placeholder="Add a more detailed description..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    onBlur={handleDescriptionBlur}
                  />
                </div>
              </div>

              {/* Subtasks */}
              <div>
                <div className="flex items-center text-gray-700 font-semibold mb-3">
                  <CheckSquare className="w-5 h-5 mr-3 text-gray-400" />
                  Subtasks
                </div>
                <div className="ml-8 space-y-3">
                  {/* Progress bar */}
                  {card.subtasks && card.subtasks.length > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{Math.round((card.subtasks.filter(t => t.completed).length / card.subtasks.length) * 100)}%</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 transition-all duration-300 ease-out" 
                          style={{ width: `${(card.subtasks.filter(t => t.completed).length / card.subtasks.length) * 100}%` }} 
                        />
                      </div>
                    </div>
                  )}

                  {card.subtasks?.map(st => (
                    <div key={st.id} className="flex flex-col group pb-2 pt-1 border-b border-gray-50/50 last:border-0 hover:bg-gray-50/50 rounded-lg px-2 -mx-2 transition">
                      <div className="flex items-start mt-1">
                        <input 
                          type="checkbox" 
                          checked={st.completed} 
                          onChange={() => toggleSubtask(st.id)}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 mr-3 cursor-pointer mt-0.5"
                        />
                        <span className={`text-sm flex-1 break-words ${st.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {st.title}
                        </span>
                        <button 
                          onClick={() => deleteSubtask(st.id)}
                          className="text-gray-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-4 pl-7 mt-2">
                        {/* Assignee Picker */}
                        <div className="flex items-center text-xs bg-white border border-gray-200 rounded px-1.5 py-1 tag-hover:shadow-sm">
                          <UserIcon className="w-3 h-3 text-gray-400 mr-1" />
                          <select 
                            value={st.assigneeId || ''} 
                            onChange={e => updateSubtask(st.id, { assigneeId: e.target.value || null })}
                            className="bg-transparent text-gray-600 hover:text-gray-900 outline-none cursor-pointer max-w-[110px] truncate"
                          >
                            <option value="">Unassigned</option>
                            {state.users.map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        </div>
                        
                        {/* Deadline Picker */}
                        <div className="flex items-center text-xs bg-white border border-gray-200 rounded px-1.5 py-1">
                          <Calendar className="w-3 h-3 text-gray-400 mr-1" />
                          <input 
                            type="date" 
                            title="Set deadline"
                            value={st.deadline ? st.deadline.split('T')[0] : ''}
                            onChange={e => updateSubtask(st.id, { deadline: e.target.value ? new Date(e.target.value).toISOString() : null })}
                            className="bg-transparent text-gray-600 hover:text-gray-900 outline-none cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <form onSubmit={handleAddSubtask} className="mt-2">
                    <input 
                      type="text" 
                      placeholder="Add an item..." 
                      value={newSubtaskTitle}
                      onChange={e => setNewSubtaskTitle(e.target.value)}
                      className="text-sm bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none w-full py-1.5 transition"
                    />
                  </form>
                </div>
              </div>

              {/* Attachments */}
              <div>
                <div className="flex items-center justify-between mb-3 text-gray-700 font-semibold">
                  <div className="flex items-center">
                    <Paperclip className="w-5 h-5 mr-3 text-gray-400" />
                    Attachments
                  </div>
                </div>
                <div className="ml-8">
                  {card.attachments && card.attachments.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      {card.attachments.map(att => (
                        <div key={att.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300 transition group">
                          <div className="flex items-center overflow-hidden">
                            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center shrink-0 mr-3 text-gray-500 font-medium text-xs">
                              FILE
                            </div>
                            <span className="text-sm text-gray-700 font-medium truncate">{att.name}</span>
                          </div>
                          <div className="flex gap-2">
                            <a href={att.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs bg-blue-50 px-2 py-1 rounded">View</a>
                            <button 
                              onClick={() => handleUpdate({ attachments: card.attachments.filter(a => a.id !== att.id) })}
                              className="text-red-600 hover:underline text-xs bg-red-50 px-2 py-1 rounded"
                            >Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mb-4">No attachments yet.</p>
                  )}
                  
                  <div>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition disabled:text-gray-400 disabled:cursor-not-allowed"
                    >
                      {uploading ? 'Uploading...' : 'Add attachment'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Comments */}
              <div className="pb-8">
                <div className="flex items-center text-gray-700 font-semibold mb-4">
                  <MessageSquare className="w-5 h-5 mr-3 text-gray-400" />
                  Activity
                </div>
                <div className="ml-8 space-y-5">
                  <form onSubmit={handleAddComment} className="flex gap-3">
                    <img src={state.users[0].avatar} alt="" className="w-8 h-8 rounded-full border border-gray-200 shrink-0" />
                    <div className="flex-1 bg-white border border-gray-200 rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-500 transition overflow-hidden">
                      <textarea
                        value={newCommentText}
                        onChange={e => setNewCommentText(e.target.value)}
                        placeholder="Write a comment..."
                        className="w-full text-sm p-3 outline-none resize-none bg-transparent"
                        rows={2}
                      />
                      <div className="bg-gray-50 px-3 py-2 border-t border-gray-100 flex justify-end">
                        <button 
                          type="submit" 
                          disabled={!newCommentText.trim()}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </form>

                  {card.comments && [...card.comments].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(comment => {
                    const author = state.users.find(u => u.id === comment.authorId);
                    return (
                      <div key={comment.id} className="flex gap-3">
                        <img src={author?.avatar} alt="" className="w-8 h-8 rounded-full border border-gray-200 shrink-0" />
                        <div>
                          <div className="flex items-baseline gap-2">
                            <span className="font-semibold text-sm text-gray-900">{author?.name}</span>
                            <span className="text-xs text-gray-500">{format(new Date(comment.createdAt), 'MMM d, h:mm a')}</span>
                          </div>
                          <div className="bg-white border border-gray-200 rounded-lg p-3 mt-1 shadow-sm text-sm text-gray-700 whitespace-pre-wrap">
                            {comment.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Sidebar Actions */}
            <div className="col-span-1 border-l border-gray-100 pl-8 md:block flex flex-col gap-6">
              
              <div className="mb-6">
                <TagPicker cardId={card.id} selectedTagIds={card.tagIds || []} />
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Assignee</h4>
                <div className="bg-gray-50 rounded-lg p-1 border border-gray-200">
                  <select 
                    value={card.assigneeId || ''} 
                    onChange={e => handleUpdate({ assigneeId: e.target.value || null })}
                    className="w-full bg-transparent text-sm p-2 outline-none cursor-pointer"
                  >
                    <option value="">Unassigned</option>
                    {state.users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Deadline</h4>
                <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 flex items-center">
                  <Calendar className="w-4 h-4 ml-2 text-gray-500" />
                  <input 
                    type="date" 
                    value={card.deadline ? card.deadline.split('T')[0] : ''}
                    onChange={e => handleUpdate({ deadline: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    className="w-full bg-transparent text-sm p-2 outline-none cursor-pointer text-gray-700"
                  />
                </div>
              </div>
              
              <div className="mt-8">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Actions</h4>
                <div className="space-y-2">
                  <button 
                    onClick={() => {
                      confirmAction('Are you sure you want to delete this card?', () => {
                        deleteCard(card.id);
                        onClose();
                      });
                    }}
                    className="w-full flex items-center px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Card
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

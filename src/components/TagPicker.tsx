import React, { useState, useRef, useEffect } from 'react';
import { Tag } from '../types';
import { useAppContext } from '../App';
import { Check, Plus, Edit2, Trash2, X, Tag as TagIcon } from 'lucide-react';
import { cn } from '../utils';

const COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#f43f5e', // rose
  '#94a3b8'  // slate
];

interface Props {
  cardId?: string;
  selectedTagIds: string[];
  onChange?: (newTagIds: string[]) => void;
  compact?: boolean;
}

export default function TagPicker({ cardId, selectedTagIds, onChange, compact }: Props) {
  const { state, addTag, updateTag, deleteTag, updateCard } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState(COLORS[0]);
  
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setTimeout(() => setMode('list'), 200); // reset after close animation
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleTag = (tagId: string) => {
    const newTags = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter(id => id !== tagId)
      : [...selectedTagIds, tagId];
    
    if (onChange) {
      onChange(newTags);
    } else if (cardId) {
      updateCard(cardId, { tagIds: newTags });
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagName.trim()) return;
    addTag({ name: tagName.trim(), color: tagColor });
    setMode('list');
    setTagName('');
    setTagColor(COLORS[0]);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagName.trim() || !editingTag) return;
    updateTag(editingTag.id, { name: tagName.trim(), color: tagColor });
    setMode('list');
    setEditingTag(null);
  };

  const openCreate = () => {
    setTagName('');
    setTagColor(COLORS[0]);
    setMode('create');
  };

  const openEdit = (e: React.MouseEvent, tag: Tag) => {
    e.stopPropagation();
    setTagName(tag.name);
    setTagColor(tag.color);
    setEditingTag(tag);
    setMode('edit');
  };

  const cardTags = state.tags?.filter(t => selectedTagIds.includes(t.id)) || [];

  return (
    <div className="relative">
      {!compact && <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Теги</h4>}
      
      <div className={`flex flex-wrap gap-1.5 ${compact ? '' : 'mb-2'}`}>
        {cardTags.map(tag => (
          <span 
            key={tag.id}
            className="px-2.5 py-1 rounded text-xs font-semibold text-white flex items-center shadow-sm"
            style={{ backgroundColor: tag.color }}
          >
            {tag.name}
          </span>
        ))}
        {compact && (
          <button 
            onClick={() => setIsOpen(true)}
            className="flex items-center px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition"
            title="Додати тег"
          >
            <Plus className="w-3 h-3 text-gray-500" />
            {!cardTags.length && <span className="ml-1">Додати</span>}
          </button>
        )}
      </div>

      {!compact && (
        <button 
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center px-4 py-2 bg-gray-100/80 hover:bg-gray-200/80 text-gray-700 rounded-lg text-sm font-medium transition backdrop-blur-sm whitespace-nowrap"
        >
          <Plus className="w-4 h-4 mr-2 text-gray-500" />
          Додати тег
        </button>
      )}

      {isOpen && (
        <div ref={popoverRef} className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <button 
              className={cn("p-1 text-gray-400 hover:text-gray-700 rounded transition", mode === 'list' && "invisible")}
              onClick={() => setMode('list')}
            >
              <X className="w-4 h-4" />
            </button>
            <span className="font-semibold text-sm text-gray-800">
              {mode === 'list' ? 'Labels' : mode === 'create' ? 'Create Label' : 'Edit Label'}
            </span>
            <button className="p-1 text-gray-400 hover:text-gray-700 rounded transition" onClick={() => setIsOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-3 max-h-80 overflow-y-auto hidden-scrollbar">
            {mode === 'list' && (
              <div className="space-y-2">
                {state.tags && state.tags.length > 0 ? state.tags.map(tag => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <div key={tag.id} className="flex gap-2 items-center">
                      <button 
                        onClick={() => toggleTag(tag.id)}
                        className="flex-1 flex items-center px-3 py-2 rounded-lg text-white font-medium text-sm transition text-left hover:opacity-90 shadow-sm"
                        style={{ backgroundColor: tag.color }}
                      >
                        <span className="flex-1 truncate">{tag.name}</span>
                        {isSelected && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                      <button 
                        onClick={(e) => openEdit(e, tag)}
                        className="p-2 text-gray-500 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-lg transition"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  )
                }) : (
                  <p className="text-sm text-center text-gray-500 py-4">No labels created yet.</p>
                )}
                
                <button 
                  onClick={openCreate}
                  className="w-full flex justify-center items-center py-2 mt-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium text-sm rounded-lg transition"
                >
                  Create a new label
                </button>
              </div>
            )}

            {(mode === 'create' || mode === 'edit') && (
              <form onSubmit={mode === 'create' ? handleCreate : handleUpdate} className="space-y-4">
                {/* Preview */}
                <div className="p-4 bg-gray-50 rounded-lg flex justify-center">
                  <span 
                    className="px-3 py-1 rounded text-sm font-semibold text-white shadow-sm min-w-[4rem] text-center"
                    style={{ backgroundColor: tagColor }}
                  >
                    {tagName || 'Label Preview'}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Title</label>
                  <input 
                    type="text" 
                    value={tagName}
                    onChange={e => setTagName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Enter label title..."
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Select a color</label>
                  <div className="grid grid-cols-5 gap-2">
                    {COLORS.map(c => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setTagColor(c)}
                        className="w-full aspect-square rounded-md shadow-sm border border-black/10 flex items-center justify-center transition hover:ring-2 hover:ring-offset-1 hover:ring-gray-300"
                        style={{ backgroundColor: c }}
                      >
                        {tagColor === c && <Check className="w-4 h-4 text-white drop-shadow-md" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button 
                    type="submit" 
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg text-sm transition"
                    disabled={!tagName.trim()}
                  >
                    {mode === 'create' ? 'Create' : 'Save'}
                  </button>
                  {mode === 'edit' && editingTag && (
                    <button 
                      type="button"
                      onClick={() => {
                        deleteTag(editingTag.id);
                        setMode('list');
                      }}
                      className="px-3 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-lg text-sm transition"
                      title="Delete label"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

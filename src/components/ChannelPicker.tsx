import React, { useState, useRef, useEffect } from 'react';
import { Check, Plus, X } from 'lucide-react';

interface Props {
  selectedChannels: string[];
  options: { name: string; color: string }[];
  onChange: (channels: string[]) => void;
}

export default function ChannelPicker({ selectedChannels, options, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggle = (ch: string) => {
    if (selectedChannels.includes(ch)) {
      onChange(selectedChannels.filter(c => c !== ch));
    } else {
      onChange([...selectedChannels, ch]);
    }
  };

  return (
    <div className="relative flex items-center" ref={ref}>
      <div className="flex flex-wrap gap-1.5 items-center w-full min-h-[28px]">
        {selectedChannels.map(ch => {
          const color = options.find(o => o.name === ch)?.color || '#f3f4f6';
          return (
            <span key={ch} className="px-2 py-0.5 rounded text-xs font-medium text-gray-800 shadow-sm border border-black/5 flex items-center gap-1 group" style={{ backgroundColor: color }}>
              {ch}
              <button 
                onClick={(e) => { e.stopPropagation(); toggle(ch); }}
                className="hover:bg-black/10 rounded-full p-0.5 opacity-50 hover:opacity-100 transition"
              >
                <X className="w-3 h-3 text-gray-700" />
              </button>
            </span>
          );
        })}
        <button 
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
          className="flex items-center px-2 py-0.5 bg-white/50 hover:bg-white text-gray-700 rounded text-xs font-medium transition border border-gray-200/60 shadow-sm"
          title="Додати канал"
        >
          <Plus className="w-3 h-3 text-gray-500" />
          {selectedChannels.length === 0 && <span className="ml-1 text-gray-500">Додати</span>}
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-[60] top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 max-h-60 overflow-y-auto">
          {options.map(opt => {
            const isSelected = selectedChannels.includes(opt.name);
            return (
              <button
                key={opt.name}
                onClick={() => toggle(opt.name)}
                className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 transition"
              >
                <div className="flex items-center">
                  <span className="w-3 h-3 rounded-full mr-2 border border-black/10" style={{ backgroundColor: opt.color }} />
                  <span className="text-gray-700">{opt.name}</span>
                </div>
                {isSelected && <Check className="w-4 h-4 text-blue-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../types';
import { useAppContext } from '../App';
import { Calendar, AlignLeft, CheckSquare, MessageSquare, Paperclip, Clock, Sparkles, Check } from 'lucide-react';
import { format } from 'date-fns';
import { Draggable } from '@hello-pangea/dnd';
import CardModal from './CardModal';
import { cn } from '../utils';

interface Props {
  card: Card;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  index: number;
}

export default function BoardCard({ card, selectionMode, isSelected, onToggleSelect, index }: Props) {
  const { state, updateCard, hasEditRights } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);

  /**
   * Коротка зелена підсвітка на момент закриття таска.
   *
   * Перехід ловимо тут, а не в місці кліку, бо закрити картку можна і з модалки,
   * і масовою дією — а isCompleted у всіх трьох випадках приходить сюди зі
   * спільного стану. Порівняння з попереднім значенням у ref, а не в стані:
   * зайвий рендер на кожну чужу картку тут нікому не потрібен.
   */
  const [justCompleted, setJustCompleted] = useState(false);
  const wasCompleted = useRef(card.isCompleted);

  useEffect(() => {
    if (card.isCompleted && !wasCompleted.current) {
      setJustCompleted(true);
      const t = setTimeout(() => setJustCompleted(false), 1200);
      wasCompleted.current = card.isCompleted;
      return () => clearTimeout(t);
    }
    wasCompleted.current = card.isCompleted;
  }, [card.isCompleted]);

  const assignee = card.assigneeId ? state.users.find(u => u.id === card.assigneeId) : null;
  
  const totalSubtasks = card.subtasks?.length || 0;
  const completedSubtasks = card.subtasks?.filter(st => st.completed).length || 0;
  const hasDescription = card.description && card.description.trim().length > 0;
  const commentCount = card.comments?.length || 0;
  const attachmentCount = card.attachments?.length || 0;

  const cardTags = state.tags?.filter(t => card.tagIds?.includes(t.id)) || [];
  const project = state.projects?.find(p => p.id === card.projectId);

  // Unique subtask assignees (excluding the main card assignee to avoid duplication)
  const subtaskAssigneeIds = [...new Set(
    (card.subtasks || [])
      .map(st => st.assigneeId)
      .filter((id): id is string => !!id && id !== card.assigneeId)
  )];
  const subtaskAssignees = subtaskAssigneeIds
    .map(id => state.users.find(u => u.id === id))
    .filter(Boolean) as typeof state.users;

  const isOverdue = card.deadline && new Date(card.deadline) < new Date() && card.listId !== state.lists[state.lists.length - 1]?.id && !card.isCompleted; // basic logic, last list is done

  return (
    <>
      <Draggable draggableId={card.id} index={index} isDragDisabled={!hasEditRights || selectionMode}>
        {(provided, snapshot) => (
          <div 
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            style={provided.draggableProps.style}
            onClick={() => {
              if (selectionMode && onToggleSelect) {
                onToggleSelect();
              } else {
                setIsModalOpen(true);
              }
            }}
            className={cn(
              "rounded-lg shadow-sm hover:shadow-md border border-b-gray-300 cursor-pointer overflow-hidden group hover:ring-1 hover:ring-blue-500/50 transition-all flex flex-col relative mb-3",
              isSelected ? "border-blue-500 ring-2 ring-blue-500 bg-blue-50/50" : "border-gray-200 bg-white",
              snapshot.isDragging && "shadow-xl border-blue-500 ring-2 ring-blue-500 rotate-2 opacity-90 scale-105 z-50 bg-white",
              justCompleted && "card-completed-flash"
            )}
          >
        {selectionMode && (
          <div className="absolute top-2 right-2 z-10">
            <div className={cn(
              "w-4 h-4 rounded border flex items-center justify-center transition-colors",
              isSelected ? "bg-blue-600 border-blue-600" : "bg-white border-gray-400"
            )}>
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>
        )}
        {project && (
          <div className="h-1 w-full shrink-0" style={{ backgroundColor: project.color }} title={`Проєкт: ${project.title}`} />
        )}
        <div className="p-3">
          {cardTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {cardTags.map(tag => (
                <span 
                  key={tag.id} 
                  className="px-2 py-0.5 rounded text-[10px] font-semibold text-white truncate max-w-[120px]"
                  style={{ backgroundColor: tag.color }}
                  title={tag.name}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          <div className="flex justify-between items-start gap-2 mb-2">
            <div 
              className={`mt-0.5 ${hasEditRights ? 'cursor-pointer' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (hasEditRights) {
                  updateCard(card.id, { isCompleted: !card.isCompleted });
                }
              }}
            >
              <div className={cn(
                "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                card.isCompleted ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-green-400"
              )}>
                {card.isCompleted && <Check className="w-3 h-3 text-white" />}
              </div>
            </div>
            <h4 className={cn(
              "text-sm font-medium leading-snug break-words flex-1 transition-colors",
              card.isCompleted ? "text-gray-400 line-through" : "text-gray-800 group-hover:text-blue-700"
            )}>
              {card.title}
            </h4>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Meta tags (deadline, etc) */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {card.deadline && (
                <div className={cn(
                  "flex items-center px-1.5 py-0.5 rounded",
                  isOverdue ? "bg-red-100 text-red-700 font-medium" : "bg-gray-100 text-gray-600"
                )}>
                  <Calendar className="w-3 h-3 mr-1" />
                  {format(new Date(card.deadline), 'MMM d')}
                </div>
              )}
              
              {hasDescription && (
                <div title="This card has a description" className="flex items-center">
                  <AlignLeft className="w-3.5 h-3.5" />
                </div>
              )}

              {totalSubtasks > 0 && (
                <div className={cn(
                  "flex items-center",
                  completedSubtasks === totalSubtasks ? "text-green-600 font-medium" : ""
                )}>
                  <CheckSquare className="w-3.5 h-3.5 mr-1" />
                  {completedSubtasks}/{totalSubtasks}
                </div>
              )}

              {commentCount > 0 && (
                <div className="flex items-center">
                  <MessageSquare className="w-3.5 h-3.5 mr-1" />
                  {commentCount}
                </div>
              )}

              {attachmentCount > 0 && (
                <div className="flex items-center">
                  <Paperclip className="w-3.5 h-3.5 mr-1" />
                  {attachmentCount}
                </div>
              )}

              {card.storyPoints && (
                <div className="flex items-center text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded font-medium ml-1" title="Story Points">
                  <Sparkles className="w-3 h-3 mr-1" />
                  {card.storyPoints} SP
                </div>
              )}

              {card.estimatedMinutes && (
                <div className="flex items-center text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium ml-1">
                  <Clock className="w-3 h-3 mr-1" />
                  {card.estimatedMinutes >= 60 
                    ? `${Math.floor(card.estimatedMinutes / 60)}h ${card.estimatedMinutes % 60 > 0 ? `${card.estimatedMinutes % 60}m` : ''}`
                    : `${card.estimatedMinutes}m`}
                </div>
              )}
            </div>

            {/* Assignee Avatars */}
            <div className="ml-auto flex items-center gap-0.5">
              {/* Subtask assignees — tiny avatars */}
              {subtaskAssignees.slice(0, 3).map(u => (
                u.avatar
                  ? <img key={u.id} src={u.avatar} alt={u.name} title={u.name} className="w-4 h-4 rounded-full border border-white ring-1 ring-gray-200 -ml-1 first:ml-0" />
                  : <div key={u.id} title={u.name} className="w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center text-white text-[7px] font-bold border border-white ring-1 ring-gray-200 -ml-1 first:ml-0">{u.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}</div>
              ))}
              {subtaskAssignees.length > 3 && (
                <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-[7px] font-bold border border-white -ml-1">
                  +{subtaskAssignees.length - 3}
                </div>
              )}
              {/* Main card assignee */}
              {assignee && (
                <img
                  src={assignee.avatar}
                  alt={assignee.name}
                  title={assignee.name}
                  className="w-6 h-6 rounded-full block border border-gray-200 ml-1"
                />
              )}
            </div>
          </div>
        </div>
          </div>
        )}
      </Draggable>

      {isModalOpen && (
        <CardModal card={card} onClose={() => setIsModalOpen(false)} />
      )}
    </>
  );
}

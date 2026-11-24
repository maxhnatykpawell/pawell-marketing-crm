import React, { useState, useEffect } from 'react';
import { useAppContext } from '../App';
import BoardList from './BoardList';
import CardModal from './CardModal';
import { Plus, Trash2, DownloadCloud, FolderKanban, Filter, CalendarRange, Target, FileText, Info, ChevronDown, ChevronUp, ExternalLink, Link2, Check, RotateCcw, Pencil } from 'lucide-react';
import ProjectModal from './ProjectModal';
import { canManageProjectAccess } from '../lib/projectAccess';
import { buildShareLink } from '../lib/deepLink';
import { applyProjectListOrder, reorderListIds } from '../lib/listOrder';
import TrelloImportModal from './TrelloImportModal';
import ProjectAssistant from './ProjectAssistant';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';

export default function Board() {
  const { state, addList, activeBoardId, setActiveBoardId, activeProjectId, setActiveProjectId, setActiveView, addBoard, deleteBoard, confirmAction, hasEditRights, moveList, moveCard, openCardId, setOpenCardId, updateProject, currentUser } = useAppContext();
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [isAddingBoard, setIsAddingBoard] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [filterAssigneeId, setFilterAssigneeId] = useState<string | null>(null);
  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [notifCard, setNotifCard] = useState<typeof state.cards[0] | null>(null);
  const [isProjectInfoOpen, setIsProjectInfoOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // When openCardId is set (from notification click), find the card and open its modal
  useEffect(() => {
    if (!openCardId) return;
    const card = state.cards.find(c => c.id === openCardId);
    if (card) {
      // Switch to the correct board first
      const list = state.lists.find(l => l.id === card.listId);
      if (list?.boardId && list.boardId !== activeBoardId) {
        setActiveBoardId(list.boardId);
      }
      setNotifCard(card);
      setOpenCardId(null);
    }
  }, [openCardId, state.cards]);

  const boards = state.boards || [];
  const projects = state.projects || [];
  
  const currentBoardLists = activeBoardId 
    ? state.lists.filter(l => l.boardId === activeBoardId || (!l.boardId && boards.length > 0 && boards[0].id === activeBoardId)) 
    : state.lists;

  // У проєкті колонки йдуть у його власному порядку (якщо задано), інакше — шаблонному порядку дошки
  const activeProjectForOrder = activeProjectId ? projects.find(p => p.id === activeProjectId) : undefined;
  // Той самий доступ, що й у списку проєктів: власник/керівник або хто керує доступом
  const canEditActiveProject = !!activeProjectForOrder && hasEditRights &&
    (canManageProjectAccess(activeProjectForOrder, currentUser || { userId: '' }) ||
      activeProjectForOrder.managerIds.includes(currentUser?.userId || ''));
  const hasCustomListOrder =!!activeProjectForOrder?.listOrder?.length;
  const sortedLists = applyProjectListOrder<typeof currentBoardLists[number]>(currentBoardLists,activeProjectForOrder?.listOrder);

  const handleAddList = (e: React.FormEvent) => {
    e.preventDefault();
    if (newListTitle.trim()) {
      addList(newListTitle.trim());
      setNewListTitle('');
      setIsAddingList(false);
    }
  };

  const handleAddBoard = (e: React.FormEvent) => {
    e.preventDefault();
    if (newBoardTitle.trim()) {
      addBoard(newBoardTitle.trim());
      setNewBoardTitle('');
      setIsAddingBoard(false);
    }
  };

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId, type } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === 'LIST') {
      const targetList = sortedLists[destination.index];
      if (targetList) {
        if (activeProjectId) {
          // Всередині проєкту міняємо порядок лише для нього — шаблон дошки лишається незмінним
          updateProject(activeProjectId, { listOrder: reorderListIds(sortedLists.map(l => l.id), draggableId, targetList.id) });
        } else {
          moveList(draggableId, targetList.id);
        }
      }
    } else if (type === 'CARD') {
      const toListId = destination.droppableId;
      
      let destVisibleCards = state.cards
        .filter(c => c.listId === toListId && (
          activeProjectId
            ? c.projectId === activeProjectId
            : (!c.projectId || (!!filterAssigneeId && filterAssigneeId !== 'unassigned'))
        ))
        .filter(c => {
          if (filterAssigneeId) {
            if (filterAssigneeId === 'unassigned') {
              if (c.assigneeId) return false;
            } else {
              if (c.assigneeId !== filterAssigneeId) return false;
            }
          }
          if (filterTagId && (!c.tagIds || !c.tagIds.includes(filterTagId))) return false;
          if (filterOverdue) {
            const isOverdue = c.deadline && new Date(c.deadline) < new Date() && c.listId !== state.lists[state.lists.length - 1]?.id && !c.isCompleted;
            if (!isOverdue) return false;
          }
          return true;
        })
        .sort((a, b) => a.order - b.order);
      
      if (source.droppableId === destination.droppableId) {
        destVisibleCards = destVisibleCards.filter(c => c.id !== draggableId);
      }
      
      const targetCardId = destVisibleCards[destination.index]?.id;
      moveCard(draggableId, toListId, targetCardId);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Board tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-6 w-full shrink-0">
        {boards.map(b => (
          <div 
            key={b.id} 
            className={`group flex items-center space-x-2 px-4 py-2 rounded-lg cursor-pointer transition ${activeBoardId === b.id ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'}`}
          >
            <span onClick={() => setActiveBoardId(b.id)} className="font-medium select-none">{b.title}</span>
            {hasEditRights && activeBoardId === b.id && (
              <button 
                onClick={(e) => { e.stopPropagation(); confirmAction('Ви впевнені, що хочете видалити дошку та усі її списки?', () => deleteBoard(b.id)); }} 
                className="opacity-0 group-hover:opacity-100 hover:text-red-300 transition"
                title="Видалити дошку"
              >
                <Trash2 className="w-4 h-4 ml-2" />
              </button>
            )}
          </div>
        ))}
        {hasEditRights && (
          isAddingBoard ? (
            <form onSubmit={handleAddBoard} className="flex items-center bg-white px-2 py-1.5 rounded-lg border border-gray-200 shadow-sm w-64">
              <input
                type="text"
                autoFocus
                className="w-full text-sm focus:outline-none px-2"
                placeholder="Назва дошки..."
                value={newBoardTitle}
                onChange={e => setNewBoardTitle(e.target.value)}
                onBlur={() => { if (!newBoardTitle.trim()) setIsAddingBoard(false); }}
              />
              <button type="submit" className="text-blue-600 hover:text-blue-800 p-1">
                <Plus className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <button 
              onClick={() => setIsAddingBoard(true)} 
              className="flex items-center px-4 py-2 bg-white/50 hover:bg-white text-gray-600 border border-dashed border-gray-300 rounded-lg transition"
            >
               <Plus className="w-4 h-4 mr-2 text-gray-400" /> Додати дошку
            </button>
          )
        )}
        {hasEditRights && (
          <button 
            onClick={() => setIsImportModalOpen(true)} 
            className="flex items-center ml-auto px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition text-sm font-medium shrink-0"
          >
            <DownloadCloud className="w-4 h-4 mr-2" /> Імпорт з Trello
          </button>
        )}
      </div>

      {/* Project tabs */}
      {projects.length > 0 && (
        <div className="flex items-center gap-3 mb-4 w-full">
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto hidden-scrollbar pb-1">
          <div className="flex items-center text-sm font-semibold text-gray-500 mr-2 shrink-0">
            <FolderKanban className="w-4 h-4 mr-1.5" /> Фільтр:
          </div>
          <button
            onClick={() => setActiveProjectId(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition shrink-0 ${!activeProjectId ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Усі задачі
          </button>
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => setActiveProjectId(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition shrink-0 flex items-center gap-2 ${activeProjectId === p.id ? 'bg-gray-800 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
              {p.title}
            </button>
          ))}
        </div>

          {/*
            Перехід у план проєкту. Стоїть поза стрічкою проєктів навмисно:
            всередині неї кнопку зносило за правий край, щойно проєктів
            ставало більше, ніж уміщує рядок, — і знайти її можна було, лише
            прокрутивши стрічку до кінця.

            Коли проєкт не вибрано, кнопка лишається на місці неактивною:
            діаграма буває тільки в конкретного проєкту, і сказати про це
            прямо краще, ніж зникнути й лишити людину шукати вхід.
          */}
          <button
            onClick={() => activeProjectId && setActiveView('gantt')}
            disabled={!activeProjectId}
            title={activeProjectId
              ? 'Діаграма Ганта цього проєкту'
              : 'Оберіть проєкт — і його задачі можна буде розкласти по днях'}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
              activeProjectId
                ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                : 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed'
            }`}
          >
            <CalendarRange className="w-4 h-4" />
            Діаграма Ганта →
          </button>

          {/* Посилання на вибраний проєкт — щоб колега одразу потрапив у нього, а не шукав по вкладках */}
          {activeProjectId && (
            <button
              onClick={async () => {
                const link = buildShareLink(window.location.origin, window.location.pathname, { view: 'board', project: activeProjectId, board: activeBoardId });
                try { await navigator.clipboard.writeText(link); } catch { window.prompt('Скопіюйте посилання:', link); return; }
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }}
              title="Скопіювати посилання на цей проєкт"
              className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            >
              {linkCopied ? <Check className="w-4 h-4 text-green-600" /> : <Link2 className="w-4 h-4" />}
              {linkCopied ? 'Скопійовано' : 'Посилання'}
            </button>
          )}

          {/* Швидке редагування інфо проєкту (мета, опис, файли, учасники) просто з дошки */}
          {canEditActiveProject && (
            <button
              onClick={() => setIsProjectModalOpen(true)}
              title="Редагувати інфо проєкту: назву, мету, опис, файли, доступ"
              className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            >
              <Pencil className="w-4 h-4" />
              Редагувати
            </button>
          )}

          {/* Повернення до шаблонного порядку колонок, якщо в проєкті його змінили */}
          {activeProjectId && hasCustomListOrder && hasEditRights && (
            <button
              onClick={() => updateProject(activeProjectId, { listOrder: [] })}
              title="Власний порядок колонок цього проєкту. Натисніть, щоб повернути шаблонний порядок дошки"
              className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
            >
              <RotateCcw className="w-4 h-4" />
              Шаблонний порядок
            </button>
          )}

          {/* Асистент одного проєкту: з'являється, лише коли проєкт вибрано, і знає тільки його */}
          {activeProjectId && <ProjectAssistant projectId={activeProjectId} />}
        </div>
      )}

      {/* Project info panel — collapsible banner when a project is selected */}
      {activeProjectId && (() => {
        const activeProject = projects.find(p => p.id === activeProjectId);
        if (!activeProject) return null;
        const hasGoal = !!activeProject.goal?.trim();
        const hasDescription = !!activeProject.description?.trim();
        const hasFiles = (activeProject.infoFiles?.length ?? 0) > 0;
        const hasAnyInfo = hasGoal || hasDescription || hasFiles;
        if (!hasAnyInfo) return null;
        return (
          <div
            className="mb-4 rounded-xl border overflow-hidden transition-all"
            style={{
              backgroundColor: activeProject.color + '0D',
              borderColor: activeProject.color + '30',
            }}
          >
            <button
              onClick={() => setIsProjectInfoOpen(prev => !prev)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition hover:opacity-80"
              style={{ color: activeProject.color }}
            >
              <Info className="w-4 h-4 shrink-0" />
              <span>Інфо про проєкт</span>
              <span className="ml-auto">
                {isProjectInfoOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </button>
            {isProjectInfoOpen && (
              <div className="px-4 pb-4 space-y-3 animate-in fade-in">
                {hasGoal && (
                  <div className="flex items-start gap-2">
                    <Target className="w-4 h-4 mt-0.5 shrink-0" style={{ color: activeProject.color }} />
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Мета</div>
                      <p className="text-sm text-gray-800 font-medium">{activeProject.goal}</p>
                    </div>
                  </div>
                )}
                {hasDescription && (
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 mt-0.5 shrink-0" style={{ color: activeProject.color }} />
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Опис</div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{activeProject.description}</p>
                    </div>
                  </div>
                )}
                {hasFiles && (
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 mt-0.5 shrink-0" style={{ color: activeProject.color }} />
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Інфо-файли</div>
                      <div className="flex flex-wrap gap-2">
                        {activeProject.infoFiles!.map(file => (
                          <a
                            key={file.id}
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition hover:shadow-sm"
                            style={{
                              color: activeProject.color,
                              borderColor: activeProject.color + '40',
                              backgroundColor: activeProject.color + '08',
                            }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {file.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 w-full bg-white p-3 rounded-xl border border-gray-200 shadow-sm shrink-0">
        <div className="flex items-center text-sm font-semibold text-gray-500 shrink-0">
          <Filter className="w-4 h-4 mr-1.5" /> Фільтри:
        </div>
        
        <select 
          value={filterAssigneeId || ''} 
          onChange={e => setFilterAssigneeId(e.target.value || null)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50"
        >
          <option value="">Усі виконавці</option>
          <option value="unassigned">Без виконавця</option>
          {state.users.map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        <select 
          value={filterTagId || ''} 
          onChange={e => setFilterTagId(e.target.value || null)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50"
        >
          <option value="">Усі теги</option>
          {state.tags?.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none ml-2 hover:text-blue-600 transition">
          <input 
            type="checkbox" 
            checked={filterOverdue} 
            onChange={e => setFilterOverdue(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
          />
          Протерміновані
        </label>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4 custom-scrollbar">
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="board" type="LIST" direction="horizontal">
            {(provided) => (
              <div 
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex items-start space-x-6 h-full w-max shrink-0"
              >
                {sortedLists.map((list, index) => (
                  <BoardList 
                    key={list.id} 
                    list={list} 
                    index={index}
                    filterAssigneeId={filterAssigneeId}
                    filterTagId={filterTagId}
                    filterOverdue={filterOverdue}
                  />
                ))}
                {provided.placeholder}
                {hasEditRights && (
            <div className="w-80 shrink-0">
              {isAddingList ? (
                <form onSubmit={handleAddList} className="bg-gray-100/80 backdrop-blur rounded-xl p-3 shadow-sm border border-gray-200">
                  <input
                    type="text"
                    autoFocus
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="List title..."
                    value={newListTitle}
                    onChange={e => setNewListTitle(e.target.value)}
                    onBlur={() => { if (!newListTitle.trim()) setIsAddingList(false); }}
                  />
                  <div className="flex items-center space-x-2 mt-3">
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                    >
                      Add list
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingList(false)}
                      className="px-3 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 text-sm font-medium rounded-lg transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setIsAddingList(true)}
                  className="w-full flex items-center px-4 py-3 bg-white/60 hover:bg-white/90 text-gray-700 font-medium rounded-xl border border-dashed border-gray-300 hover:border-gray-400 transition shadow-sm backdrop-blur"
                >
                  <Plus className="w-5 h-5 mr-2 text-gray-500" />
                  Add another list
                </button>
              )}
            </div>
          )}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
      
      {isImportModalOpen && (
        <TrelloImportModal onClose={() => setIsImportModalOpen(false)} />
      )}

      {/* Card modal opened from a notification */}
      {isProjectModalOpen && activeProjectForOrder && (
        <ProjectModal project={activeProjectForOrder} onClose={() => setIsProjectModalOpen(false)} />
      )}

      {notifCard && (
        <CardModal card={notifCard} onClose={() => setNotifCard(null)} />
      )}
    </div>
  );
}

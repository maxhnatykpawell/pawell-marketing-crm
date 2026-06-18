import React, { useState, useMemo } from 'react';
import { ReactFlow, Background, Controls, Edge, Node, Handle, Position, applyNodeChanges, NodeChange } from '@xyflow/react';
import { useCallback, useEffect } from 'react';
import '@xyflow/react/dist/style.css';
import { useAppContext } from '../App';
import { Process, ProcessNodeData, Project } from '../types';
import { FolderKanban, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface Props {
  process: Process;
}

// Custom Node for the Tracker
const TrackerNode = ({ data, id }: { data: ProcessNodeData & { projects: Project[], onProjectClick: (p: Project, nId: string) => void }, id: string }) => {
  return (
    <div className="bg-white rounded-xl shadow-md border-2 border-blue-200 min-w-[200px] max-w-[250px] overflow-visible">
      <Handle type="target" position={Position.Top} className="w-3 h-3" />
      <div className="bg-blue-50 p-3 border-b border-blue-100 flex justify-between items-center group relative rounded-t-[10px]">
        <div className="flex items-center space-x-2">
          <h4 className="font-bold text-gray-800 text-sm">{data.label}</h4>
          {data.requirements && data.requirements.length > 0 && (
            <div className="relative flex items-center">
              <Info className="w-4 h-4 text-blue-400 hover:text-blue-600 cursor-help" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-white border border-gray-200 shadow-xl rounded-lg p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <p className="text-xs font-bold text-gray-700 mb-2 uppercase">Вимоги етапу:</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  {data.requirements.map(req => (
                    <li key={req.id} className="flex items-start">
                      <span className="mr-1.5 mt-0.5">•</span>
                      <span>{req.label} {req.department && <span className="text-[10px] text-gray-400">({req.department})</span>}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
        <span className="bg-blue-200 text-blue-800 text-xs px-2 py-0.5 rounded-full font-medium">
          {data.projects.length}
        </span>
      </div>
      <div className="p-2 space-y-2 min-h-[50px] max-h-[300px] overflow-y-auto hidden-scrollbar nodrag rounded-b-[10px]">
        {data.projects.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">Немає проєктів</p>
        ) : (
          data.projects.map(p => {
            const entryDate = p.processEntryDates?.[id];
            let isOverdue = false;
            if (entryDate && data.timeLimitDays) {
              const days = differenceInDays(new Date(), new Date(entryDate));
              isOverdue = days > data.timeLimitDays;
            }

            return (
              <div 
                key={p.id} 
                onClick={(e) => { e.stopPropagation(); data.onProjectClick(p, id); }}
                className={`p-2 rounded border cursor-pointer hover:shadow-md transition ${isOverdue ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'} shadow-sm`}
              >
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color || '#3b82f6' }} />
                  <span className="text-sm font-medium text-gray-700 truncate">{p.title}</span>
                </div>
                {isOverdue && (
                  <div className="flex items-center text-xs text-red-600 mt-1">
                    <AlertCircle className="w-3 h-3 mr-1" /> Прострочено
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  );
};

const nodeTypes = { trackerNode: TrackerNode };

export default function ProcessTracker({ process }: Props) {
  const { state, updateProject, updateProcess, confirmAction } = useAppContext();
  
  const [selectedProjectState, setSelectedProjectState] = useState<{ project: Project; nodeId: string } | null>(null);
  const selectedProject = selectedProjectState?.project || null;
  const [addProjectModalOpen, setAddProjectModalOpen] = useState(false);
  
  // Get projects in this process
  const processProjects = useMemo(() => {
    return (state.projects || []).filter(p => p.processId === process.id);
  }, [state.projects, process.id]);

  // Handle Project click
  const handleProjectClick = (project: Project, nodeId: string) => {
    setSelectedProjectState({ project, nodeId });
  };

  const [nodes, setNodes] = useState<Node[]>([]);

  useEffect(() => {
    setNodes((process.nodes || []).map(n => ({
      ...n,
      type: 'trackerNode',
      data: {
        ...n.data,
        projects: processProjects.filter(p => p.activeProcessNodeIds?.includes(n.id) || p.currentProcessNodeId === n.id),
        onProjectClick: handleProjectClick
      }
    })));
  }, [process.nodes, processProjects]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    const updatedNodes = process.nodes.map(n => 
      n.id === node.id ? { ...n, position: node.position } : n
    );
    updateProcess(process.id, { nodes: updatedNodes as any });
  }, [process.nodes, process.id, updateProcess]);

  const edges: Edge[] = (process.edges || []).map(e => ({ ...e, type: 'smoothstep' }));

  // Finding available next nodes
  const nextNodes = useMemo(() => {
    if (!selectedProjectState || !selectedProjectState.nodeId) return [];
    const outgoingEdges = edges.filter(e => e.source === selectedProjectState.nodeId);
    const targetNodeIds = outgoingEdges.map(e => e.target);
    return process.nodes.filter(n => targetNodeIds.includes(n.id));
  }, [selectedProject, edges, process.nodes]);

  // Finding available previous nodes (for moving backward)
  const previousNodes = useMemo(() => {
    if (!selectedProjectState || !selectedProjectState.nodeId) return [];
    const incomingEdges = edges.filter(e => e.target === selectedProjectState.nodeId);
    const sourceNodeIds = incomingEdges.map(e => e.source);
    return process.nodes.filter(n => sourceNodeIds.includes(n.id));
  }, [selectedProject, edges, process.nodes]);

  const currentNode = useMemo(() => {
    if (!selectedProjectState) return null;
    return process.nodes.find(n => n.id === selectedProjectState.nodeId);
  }, [selectedProjectState, process.nodes]);

  const moveProject = (targetNodeIds: string[]) => {
    if (!selectedProject || !selectedProjectState || !currentNode) return;
    
    // Check requirements
    const reqs = currentNode.data.requirements || [];
    const completed = selectedProject.completedRequirements || {};
    const uncompletedReqs = reqs.filter(r => !completed[r.id]);
    
    if (uncompletedReqs.length > 0) {
      alert('Спочатку виконайте всі вимоги для переходу!');
      return;
    }

    const now = new Date().toISOString();
    
    const currentActiveIds = selectedProject.activeProcessNodeIds || 
                            (selectedProject.currentProcessNodeId ? [selectedProject.currentProcessNodeId] : []);
    const newActiveIds = currentActiveIds.filter(id => id !== selectedProjectState.nodeId);
    
    targetNodeIds.forEach(id => {
      if (!newActiveIds.includes(id)) {
        newActiveIds.push(id);
      }
    });

    const newEntryDates = { ...(selectedProject.processEntryDates || {}) };
    targetNodeIds.forEach(id => {
      newEntryDates[id] = now;
    });

    updateProject(selectedProject.id, {
      currentProcessNodeId: newActiveIds.length > 0 ? newActiveIds[0] : null,
      activeProcessNodeIds: newActiveIds.length > 0 ? newActiveIds : undefined,
      processEntryDates: newEntryDates
    });
    setSelectedProjectState(null);
  };

  const toggleRequirement = (reqId: string) => {
    if (!selectedProject) return;
    const completed = selectedProject.completedRequirements || {};
    const isCompleted = !!completed[reqId];
    updateProject(selectedProject.id, {
      completedRequirements: {
        ...completed,
        [reqId]: !isCompleted
      }
    });
    // Optimistic update of local state for fast UI reaction
    setSelectedProjectState(prev => prev ? ({
      ...prev,
      project: {
        ...prev.project,
        completedRequirements: { ...completed, [reqId]: !isCompleted }
      }
    }) : prev);
  };

  const addProjectToProcess = (projectId: string) => {
    const firstNode = process.nodes[0];
    if (!firstNode) {
      alert('Процес не має етапів!');
      return;
    }
    const now = new Date().toISOString();
    updateProject(projectId, {
      processId: process.id,
      currentProcessNodeId: firstNode.id,
      activeProcessNodeIds: [firstNode.id],
      processEntryDates: { [firstNode.id]: now },
      completedRequirements: {}
    });
    setAddProjectModalOpen(false);
  };

  const removeProjectFromProcess = () => {
    if (!selectedProject) return;
    confirmAction('Ви впевнені, що хочете забрати цей проєкт з поточного процесу?', () => {
      updateProject(selectedProject.id, {
        processId: null,
        currentProcessNodeId: null,
        activeProcessNodeIds: [],
        processEntryDates: {},
        completedRequirements: {}
      });
      setSelectedProjectState(null);
    });
  };

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        fitView
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background color="#ccc" gap={16} />
        <Controls />
      </ReactFlow>

      {/* Floating Add Project Button */}
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => setAddProjectModalOpen(true)}
          className="bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 px-4 py-2 rounded-lg shadow-md font-medium transition flex items-center"
        >
          <FolderKanban className="w-4 h-4 mr-2 text-blue-600" />
          Додати існуючий проєкт
        </button>
      </div>

      {/* Add Project Modal */}
      {addProjectModalOpen && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-20 flex items-center justify-center">
          <div className="bg-white p-6 rounded-xl shadow-xl w-96 max-w-full">
            <h3 className="text-lg font-bold mb-4">Додати проєкт до процесу</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(state.projects || []).filter(p => p.processId !== process.id).length === 0 ? (
                <p className="text-gray-500 text-sm">Немає доступних проєктів для додавання.</p>
              ) : (
                (state.projects || []).filter(p => p.processId !== process.id).map(p => (
                  <button
                    key={p.id}
                    onClick={() => addProjectToProcess(p.id)}
                    className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition"
                  >
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color || '#3b82f6' }} />
                      <span className="font-medium text-gray-800">{p.title}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setAddProjectModalOpen(false)} className="text-gray-600 font-medium px-4 py-2 rounded-lg hover:bg-gray-100">
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Move/Requirements Modal */}
      {selectedProject && currentNode && (
        <div className="absolute inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-gray-200 z-30 flex flex-col animate-in slide-in-from-right-8 duration-200">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedProject.color || '#3b82f6' }} />
              <h3 className="font-bold text-gray-800 truncate" title={selectedProject.title}>{selectedProject.title}</h3>
            </div>
            <button onClick={() => setSelectedProjectState(null)} className="text-gray-500 hover:text-gray-800">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          
          <div className="flex-1 p-5 overflow-y-auto space-y-6">
            {/* Current status */}
            <div>
              <p className="text-sm text-gray-500 mb-1">Поточний етап:</p>
              <p className="font-medium text-gray-800 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100">{currentNode.data.label}</p>
            </div>

            {/* Requirements */}
            {currentNode.data.requirements && currentNode.data.requirements.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Вимоги для переходу</p>
                <div className="space-y-2">
                  {currentNode.data.requirements.map(req => {
                    const isCompleted = selectedProject.completedRequirements?.[req.id] || false;
                    return (
                      <label key={req.id} className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition ${isCompleted ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex-shrink-0 mt-0.5">
                          {isCompleted ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          ) : (
                            <div className="w-5 h-5 border-2 border-gray-300 rounded-sm" />
                          )}
                        </div>
                        <div className="flex flex-col pt-0.5">
                          <span className={`text-sm ${isCompleted ? 'text-green-800 font-medium' : 'text-gray-700'}`}>{req.label}</span>
                          {req.department && (
                            <span className={`text-[10px] font-medium uppercase tracking-wider mt-0.5 ${isCompleted ? 'text-green-600' : 'text-gray-500'}`}>
                              Відділ: {req.department}
                            </span>
                          )}
                        </div>
                        {/* Hidden checkbox for accessibility */}
                        <input type="checkbox" className="sr-only" checked={isCompleted} onChange={() => toggleRequirement(req.id)} />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Next Nodes */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Перевести на наступний етап</p>
              {nextNodes.length === 0 ? (
                <div className="bg-gray-50 text-gray-500 p-4 rounded-lg text-sm text-center border border-gray-200">
                  Це останній етап процесу (немає вихідних зв'язків).
                </div>
              ) : (
                <div className="space-y-2">
                  {nextNodes.map(nn => {
                    const reqs = currentNode.data.requirements || [];
                    const completed = selectedProject.completedRequirements || {};
                    const allReqsMet = reqs.every(r => completed[r.id]);
                    return (
                      <button
                        key={nn.id}
                        onClick={() => moveProject([nn.id])}
                        disabled={!allReqsMet}
                        className={`w-full flex justify-between items-center p-3 rounded-lg border transition ${allReqsMet ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 shadow-md' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'}`}
                      >
                        <span className="font-medium">{nn.data.label}</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </button>
                    );
                  })}
                  
                  {nextNodes.length > 1 && (
                    <div className="pt-2 mt-2 border-t border-gray-200">
                      {(() => {
                         const reqs = currentNode.data.requirements || [];
                         const completed = selectedProject.completedRequirements || {};
                         const allReqsMet = reqs.every(r => completed[r.id]);
                         return (
                           <button
                             onClick={() => moveProject(nextNodes.map(n => n.id))}
                             disabled={!allReqsMet}
                             className={`w-full flex justify-center items-center p-3 rounded-lg border transition ${allReqsMet ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700 shadow-md' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'}`}
                           >
                             <FolderKanban className="w-4 h-4 mr-2" />
                             <span className="font-medium">Розгалузити на всі наступні етапи</span>
                           </button>
                         );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Previous Nodes */}
            {previousNodes.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Повернути назад</p>
                <div className="space-y-2">
                  {previousNodes.map(pn => (
                    <button
                      key={pn.id}
                      onClick={() => moveProject([pn.id])}
                      className="w-full flex justify-between items-center p-3 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 transition shadow-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                      <span className="font-medium">{pn.data.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-200">
             <button
                onClick={removeProjectFromProcess}
                className="w-full py-2 text-red-600 hover:bg-red-50 rounded-lg transition font-medium text-sm"
              >
                Забрати проєкт з цього процесу
              </button>
          </div>
        </div>
      )}
    </div>
  );
}

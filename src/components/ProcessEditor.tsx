import React, { useCallback, useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges, Connection, Edge, Node, NodeChange, EdgeChange, Panel } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppContext } from '../App';
import { Process, ProcessNodeData, ProcessRequirement } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { X, Plus, Trash2 } from 'lucide-react';

interface Props {
  process: Process;
}

export default function ProcessEditor({ process }: Props) {
  const { updateProcess } = useAppContext();
  
  const [nodes, setNodes] = useState<Node[]>(process.nodes as Node[]);
  const [edges, setEdges] = useState<Edge[]>(process.edges as Edge[]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);

  // Sync state when process changes from outside
  useEffect(() => {
    setNodes(process.nodes as Node[]);
    setEdges((process.edges as Edge[]).map(e => ({ ...e, type: 'smoothstep' })));
  }, [process.id]); // only reset completely if process ID changes to avoid jumpiness

  // Debounced save to backend
  useEffect(() => {
    const timer = setTimeout(() => {
      updateProcess(process.id, { nodes: nodes as any, edges: edges as any });
    }, 1000);
    return () => clearTimeout(timer);
  }, [nodes, edges, process.id, updateProcess]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, type: 'smoothstep' }, eds)),
    []
  );

  const addStageNode = () => {
    const newNode: Node = {
      id: uuidv4(),
      type: 'default',
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      data: { label: 'Новий етап', requirements: [] }
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  };

  const onEdgeClick = (_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  };

  const onPaneClick = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  const updateSelectedNodeData = (updates: Partial<ProcessNodeData>) => {
    if (!selectedNode) return;
    const updatedNode = { ...selectedNode, data: { ...selectedNode.data, ...updates } };
    setSelectedNode(updatedNode);
    setNodes(nds => nds.map(n => n.id === updatedNode.id ? updatedNode : n));
  };

  const addRequirement = () => {
    if (!selectedNode) return;
    const reqs = (selectedNode.data.requirements as ProcessRequirement[]) || [];
    updateSelectedNodeData({
      requirements: [...reqs, { id: uuidv4(), label: 'Нова вимога', type: 'checkbox' }]
    });
  };

  const updateRequirement = (reqId: string, label: string) => {
    if (!selectedNode) return;
    const reqs = (selectedNode.data.requirements as ProcessRequirement[]).map(r => 
      r.id === reqId ? { ...r, label } : r
    );
    updateSelectedNodeData({ requirements: reqs });
  };

  const deleteRequirement = (reqId: string) => {
    if (!selectedNode) return;
    const reqs = (selectedNode.data.requirements as ProcessRequirement[]).filter(r => r.id !== reqId);
    updateSelectedNodeData({ requirements: reqs });
  };

  const deleteSelectedNode = () => {
    if (!selectedNode) return;
    setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
    setEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        fitView
      >
        <Background color="#ccc" gap={16} />
        <Controls />
        <Panel position="top-left">
          <button
            onClick={addStageNode}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm font-medium transition flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" /> Додати етап
          </button>
        </Panel>
      </ReactFlow>

      {/* Node Settings Sidebar */}
      {selectedNode && (
        <div className="absolute top-4 right-4 w-80 bg-white rounded-xl shadow-xl border border-gray-200 flex flex-col z-10 max-h-[calc(100%-2rem)]">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
            <h3 className="font-bold text-gray-800">Налаштування етапу</h3>
            <button onClick={() => setSelectedNode(null)} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 overflow-y-auto flex-1 hidden-scrollbar space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Назва етапу</label>
              <input
                type="text"
                value={(selectedNode.data.label as string) || ''}
                onChange={(e) => updateSelectedNodeData({ label: e.target.value })}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Дедлайн (днів)</label>
              <input
                type="number"
                min="0"
                value={(selectedNode.data.timeLimitDays as number) || ''}
                onChange={(e) => updateSelectedNodeData({ timeLimitDays: parseInt(e.target.value) || undefined })}
                placeholder="Немає"
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">Кількість днів, дозволених для перебування на цьому етапі.</p>
            </div>
            
            <div className="pt-2 border-t border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Вимоги для переходу</label>
                <button onClick={addRequirement} className="text-blue-600 hover:text-blue-800 p-1">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              {(!selectedNode.data.requirements || (selectedNode.data.requirements as any[]).length === 0) ? (
                <p className="text-sm text-gray-400 italic">Немає вимог. Перехід вільний.</p>
              ) : (
                <div className="space-y-2">
                  {(selectedNode.data.requirements as ProcessRequirement[]).map(req => (
                    <div key={req.id} className="flex items-center space-x-2 bg-gray-50 p-2 rounded border border-gray-200">
                      <input
                        type="text"
                        value={req.label}
                        onChange={(e) => updateRequirement(req.id, e.target.value)}
                        className="flex-1 bg-transparent text-sm outline-none"
                        placeholder="Опис вимоги"
                      />
                      <button onClick={() => deleteRequirement(req.id)} className="text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <button
              onClick={deleteSelectedNode}
              className="w-full flex justify-center items-center px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition font-medium text-sm"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Видалити етап
            </button>
          </div>
        </div>
      )}

      {/* Edge Settings Sidebar */}
      {selectedEdge && (
        <div className="absolute top-4 right-4 w-64 bg-white rounded-xl shadow-xl border border-gray-200 flex flex-col z-10">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
            <h3 className="font-bold text-gray-800">Налаштування зв'язку</h3>
            <button onClick={() => setSelectedEdge(null)} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4">
            <p className="text-sm text-gray-600 mb-4">Виділено зв'язок між етапами.</p>
            <button
              onClick={() => {
                setEdges(eds => eds.filter(e => e.id !== selectedEdge.id));
                setSelectedEdge(null);
              }}
              className="w-full flex justify-center items-center px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition font-medium text-sm"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Видалити зв'язок
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

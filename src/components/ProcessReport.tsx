import React from 'react';
import { Process, ProcessNodeData, ProcessRequirement } from '../types';

interface Props {
  process: Process;
}

export default function ProcessReport({ process }: Props) {
  // Sort nodes roughly by X position to simulate a left-to-right flow, 
  // or just use their defined order. We'll use X position for a slightly better flow.
  const sortedNodes = [...(process.nodes || [])].sort((a, b) => a.position.x - b.position.x);

  return (
    <div className="hidden print:block w-full bg-white text-black p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Процес: {process.title}</h1>
        <p className="text-gray-500 mb-8 pb-4 border-b border-gray-200">
          Звіт згенеровано: {new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>

        <div className="space-y-6">
          {sortedNodes.map((node, index) => {
            const data = node.data as ProcessNodeData;
            const reqs = (data.requirements || []) as ProcessRequirement[];
            
            return (
              <div key={node.id} className="border-2 border-gray-200 rounded-lg p-5" style={{ pageBreakInside: 'avoid' }}>
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-bold text-blue-800">
                    <span className="text-blue-400 mr-2 text-lg">Крок {index + 1}:</span> 
                    {data.label}
                  </h2>
                  {data.timeLimitDays && (
                    <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold border border-yellow-200">
                      Дедлайн: {data.timeLimitDays} дн.
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
                    Вимоги для проходження етапу:
                  </h3>
                  {reqs.length === 0 ? (
                    <p className="text-gray-500 italic">Немає специфічних вимог. Перехід на наступний етап вільний.</p>
                  ) : (
                    <ul className="space-y-3">
                      {reqs.map(req => (
                        <li key={req.id} className="flex items-start">
                          <div className="w-5 h-5 border-2 border-gray-400 rounded-sm mt-0.5 mr-3 shrink-0" />
                          <div className="flex-1">
                            <p className="text-gray-900 font-medium text-base">{req.label}</p>
                            {req.department && (
                              <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide mt-1">
                                Відповідальний: {req.department}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
          
          {sortedNodes.length === 0 && (
            <p className="text-gray-500 italic text-center">Цей процес ще не містить жодного етапу.</p>
          )}
        </div>
      </div>
    </div>
  );
}

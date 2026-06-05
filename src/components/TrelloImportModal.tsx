import React, { useState } from 'react';
import { X, Upload } from 'lucide-react';
import { useAppContext } from '../App';

interface Props {
  onClose: () => void;
}

export default function TrelloImportModal({ onClose }: Props) {
  const { importTrelloBoard } = useAppContext();
  const [jsonText, setJsonText] = useState('');

  const handleImport = () => {
    if (jsonText.trim()) {
      importTrelloBoard(jsonText);
      onClose();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setJsonText(text);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Імпорт з Trello
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Експортуйте вашу дошку Trello у форматі JSON (Menu {'>'} Print and Export {'>'} Export as JSON) та завантажте файл сюди, або вставте вміст файлу у текстове поле нижче.
            </p>
            <div className="flex items-center border border-dashed border-gray-300 rounded-xl p-4 bg-gray-50 hover:bg-gray-100 transition cursor-pointer relative">
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload className="w-6 h-6 text-blue-500 mr-3" />
              <div className="text-sm">
                <span className="font-semibold text-blue-600">Натисніть щоб обрати файл</span> або перетягніть його сюди
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Або вставте JSON код:
            </label>
            <textarea
              className="w-full h-48 p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs bg-gray-50"
              placeholder='{"name": "Моя Дошка", "lists": [...], "cards": [...]}'
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
          </div>
        </div>
        
        <div className="p-6 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
          >
            Скасувати
          </button>
          <button
            onClick={handleImport}
            disabled={!jsonText.trim()}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition shadow-sm"
          >
            Імпортувати
          </button>
        </div>
      </div>
    </div>
  );
}

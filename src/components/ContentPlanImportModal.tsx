import React, { useState } from 'react';
import { X, UploadCloud, FileSpreadsheet, Check, AlertTriangle } from 'lucide-react';
import Papa from 'papaparse';
import { useAppContext } from '../App';
import { ContentPlanItem } from '../types';

interface Props {
  onClose: () => void;
}

export default function ContentPlanImportModal({ onClose }: Props) {
  const { importContentPlans, state } = useAppContext();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedCount, setParsedCount] = useState(0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.name.endsWith('.csv')) {
        setFile(selected);
        setError(null);
      } else {
        setError('Будь ласка, завантажте файл у форматі .csv');
        setFile(null);
      }
    }
  };

  const processImport = () => {
    if (!file) return;
    setLoading(true);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const defaultStatuses = state?.contentPlanStatuses || ['Ідея', 'В роботі', 'Заплановано', 'Опубліковано'];
          const defaultStatus = defaultStatuses[0];
          
          const newPlans: Omit<ContentPlanItem, 'id'>[] = [];
          
          results.data.forEach((row: any) => {
            // Find appropriate column names regardless of case/spacing
            const getCol = (possibleNames: string[]) => {
              const key = Object.keys(row).find(k => possibleNames.some(n => k.toLowerCase().includes(n)));
              return key ? row[key] : '';
            };

            const focus = getCol(['тема', 'фокус', 'заголовок', 'title', 'focus', 'назва']);
            const channelsStr = getCol(['канал', 'платформа', 'майданчик', 'channel']);
            const description = getCol(['опис', 'текст', 'контент', 'desc']);
            const dateStr = getCol(['дата', 'публікація', 'date']);
            const statusStr = getCol(['статус', 'status']);
            const engagement = getCol(['залученість', 'охоплення', 'engagement']);

            if (!focus) return; // Skip if no topic
            
            // Try to parse channels
            let channels = [channelsStr.trim()].filter(Boolean);
            if (channelsStr.includes(',')) channels = channelsStr.split(',').map(s => s.trim()).filter(Boolean);

            let publishDate = null;
            if (dateStr) {
              const d = new Date(dateStr);
              if (!isNaN(d.getTime())) publishDate = d.toISOString();
            }

            // Ensure status is valid, or fallback to default
            let finalStatus = statusStr.trim();
            if (!finalStatus || !defaultStatuses.includes(finalStatus)) finalStatus = defaultStatus;

            newPlans.push({
              focus: focus.trim(),
              channel: channels[0] || '',
              channels,
              description: description.trim(),
              publishDate,
              status: finalStatus,
              engagement: engagement.trim() || '0/0',
              assigneeId: null,
            });
          });

          setParsedCount(newPlans.length);
          
          if (newPlans.length > 0) {
            importContentPlans(newPlans);
            setTimeout(() => {
              onClose();
              alert(`Успішно імпортовано ${newPlans.length} записів контент-плану!`);
            }, 500);
          } else {
            setError('Не знайдено жодного коректного запису. Переконайтеся, що в таблиці є колонка "Тема" або "Фокус".');
            setLoading(false);
          }
        } catch (err) {
          setError('Помилка обробки файлу. Перевірте формат.');
          setLoading(false);
        }
      },
      error: (err) => {
        setError(err.message);
        setLoading(false);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-blue-50/50">
          <div className="flex items-center gap-2 text-blue-800">
            <FileSpreadsheet className="w-5 h-5" />
            <h2 className="text-lg font-bold">Імпорт з CSV</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100 mb-6 text-sm text-blue-800 space-y-2">
            <p className="font-semibold">Як імпортувати таблицю?</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700 ml-1">
              <li>Створіть таблицю в Excel або Google Sheets.</li>
              <li>Додайте колонки (назви можуть бути приблизними): <b>Тема, Канал, Текст, Дата, Статус</b>.</li>
              <li>Збережіть файл у форматі <b>.csv</b> <i>(Файл {'>'} Завантажити {'>'} Значення, розділені комами)</i>.</li>
              <li>Завантажте отриманий файл сюди.</li>
            </ol>
          </div>

          <div className="space-y-4">
            <label 
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                file ? 'border-green-500 bg-green-50' : 'border-blue-200 hover:border-blue-400 hover:bg-blue-50'
              }`}
            >
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              
              {file ? (
                <>
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                    <Check className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="font-semibold text-green-800">{file.name}</p>
                  <p className="text-sm text-green-600 mt-1">Файл готовий до імпорту</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3 text-blue-600">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <p className="font-semibold text-blue-900">Натисніть для завантаження</p>
                  <p className="text-sm text-blue-600 mt-1">Тільки файли .csv</p>
                </>
              )}
            </label>

            {error && (
              <div className="flex items-start gap-2 text-red-600 bg-red-50 p-3 rounded-lg border border-red-200 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 bg-gray-100 rounded-xl transition"
          >
            Скасувати
          </button>
          <button
            onClick={processImport}
            disabled={!file || loading}
            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition shadow-sm"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Імпортувати
          </button>
        </div>
      </div>
    </div>
  );
}

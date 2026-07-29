import React, { useState } from 'react';
import { X, DollarSign, Plus, Tag, Zap } from 'lucide-react';
import { Expense } from '../types';
import { useAppContext } from '../App';

const DEFAULT_CATEGORIES = [
  'Реклама',
  'Інструменти',
  'Дизайн',
  'Зарплата / підрядники',
  'Контент',
  'Заходи / події',
  'Програмне забезпечення',
  'Інше',
];

const DEFAULT_SOURCES = [
  'Meta Ads',
  'Google Ads',
  'TikTok Ads',
  'LinkedIn Ads',
  'YouTube Ads',
  'Canva',
  'Notion',
  'Figma',
  'ChatGPT / AI',
  'Фрілансери',
];

interface Props {
  expense?: Expense;
  onClose: () => void;
}

export default function ExpenseModal({ expense, onClose }: Props) {
  const { addExpense, updateExpense, updateSettings, state, currentUser } = useAppContext();

  const categories = state.expenseCategories?.length ? state.expenseCategories : DEFAULT_CATEGORIES;
  const sources = state.expenseSources?.length ? state.expenseSources : DEFAULT_SOURCES;

  const [title, setTitle] = useState(expense?.title ?? '');
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? '');
  const [currency, setCurrency] = useState<'UAH' | 'USD' | 'EUR'>(expense?.currency ?? 'UAH');
  const [category, setCategory] = useState(expense?.category ?? categories[0]);
  const [source, setSource] = useState(expense?.source ?? '');
  const [date, setDate] = useState(expense?.date ?? new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState(expense?.note ?? '');
  const [error, setError] = useState('');

  // Inline new category/source
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [addingSource, setAddingSource] = useState(false);
  const [newSource, setNewSource] = useState('');

  const handleAddCategory = () => {
    const val = newCategory.trim();
    if (!val || categories.includes(val)) { setAddingCategory(false); setNewCategory(''); return; }
    const updated = [...categories, val];
    updateSettings({ expenseCategories: updated });
    setCategory(val);
    setNewCategory('');
    setAddingCategory(false);
  };

  const handleAddSource = () => {
    const val = newSource.trim();
    if (!val || sources.includes(val)) { setAddingSource(false); setNewSource(''); return; }
    const updated = [...sources, val];
    updateSettings({ expenseSources: updated });
    setSource(val);
    setNewSource('');
    setAddingSource(false);
  };

  const handleSave = () => {
    if (!title.trim()) { setError('Введіть назву витрати'); return; }
    const parsed = parseFloat(amount.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) { setError('Введіть коректну суму'); return; }
    if (!date) { setError('Виберіть дату'); return; }

    const payload = {
      title: title.trim(),
      amount: parsed,
      currency,
      category,
      source: source || undefined,
      date,
      note: note.trim(),
      createdBy: currentUser?.userId ?? '',
      createdAt: expense?.createdAt ?? new Date().toISOString(),
    };

    if (expense) {
      updateExpense(expense.id, payload);
    } else {
      addExpense(payload);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {expense ? 'Редагувати витрату' : 'Нова витрата'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Назва <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Наприклад: Facebook Ads — липень"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-sm transition"
              autoFocus
            />
          </div>

          {/* Amount + Currency */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Сума <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-sm transition"
              />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Валюта</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value as 'UAH' | 'USD' | 'EUR')}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-emerald-500 text-sm bg-white"
              >
                <option value="UAH">₴ UAH</option>
                <option value="USD">$ USD</option>
                <option value="EUR">€ EUR</option>
              </select>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-gray-400" />
              Категорія <span className="text-red-500">*</span>
            </label>
            {addingCategory ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setAddingCategory(false); setNewCategory(''); } }}
                  placeholder="Назва нової категорії"
                  className="flex-1 px-3 py-2 rounded-lg border border-emerald-300 outline-none focus:ring-2 focus:ring-emerald-100 text-sm"
                  autoFocus
                />
                <button onClick={handleAddCategory} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition">Додати</button>
                <button onClick={() => { setAddingCategory(false); setNewCategory(''); }} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition">✕</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-emerald-500 text-sm bg-white"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                  onClick={() => setAddingCategory(true)}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition whitespace-nowrap"
                  title="Додати нову категорію"
                >
                  <Plus className="w-3.5 h-3.5" /> Нова
                </button>
              </div>
            )}
          </div>

          {/* Source */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-gray-400" />
              Джерело / Платформа
            </label>
            {addingSource ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSource}
                  onChange={e => setNewSource(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddSource(); if (e.key === 'Escape') { setAddingSource(false); setNewSource(''); } }}
                  placeholder="Назва нового джерела"
                  className="flex-1 px-3 py-2 rounded-lg border border-emerald-300 outline-none focus:ring-2 focus:ring-emerald-100 text-sm"
                  autoFocus
                />
                <button onClick={handleAddSource} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition">Додати</button>
                <button onClick={() => { setAddingSource(false); setNewSource(''); }} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition">✕</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-emerald-500 text-sm bg-white"
                >
                  <option value="">— Не вказано —</option>
                  {sources.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button
                  onClick={() => setAddingSource(true)}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition whitespace-nowrap"
                  title="Додати нове джерело"
                >
                  <Plus className="w-3.5 h-3.5" /> Нове
                </button>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">Наприклад: Meta Ads, Google Ads, Figma, Freelancer...</p>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Дата <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-sm transition"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Коментар</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Необов'язково…"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-sm resize-none transition"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition">
            Скасувати
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
          >
            {expense ? 'Зберегти зміни' : 'Додати витрату'}
          </button>
        </div>
      </div>
    </div>
  );
}

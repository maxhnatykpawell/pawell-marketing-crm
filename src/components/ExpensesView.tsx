import React, { useState, useMemo } from 'react';
import { useAppContext } from '../App';
import { Expense } from '../types';
import {
  Plus, Trash2, Pencil, TrendingDown, Filter,
  BarChart2, Download,
} from 'lucide-react';
import ExpenseModal from './ExpenseModal';

const CURRENCY_SYMBOL: Record<string, string> = {
  UAH: '₴',
  USD: '$',
  EUR: '€',
};

const CATEGORY_COLORS: Record<string, string> = {
  'Реклама': 'bg-blue-100 text-blue-700',
  'Інструменти': 'bg-purple-100 text-purple-700',
  'Дизайн': 'bg-pink-100 text-pink-700',
  'Зарплата / підрядники': 'bg-amber-100 text-amber-700',
  'Контент': 'bg-cyan-100 text-cyan-700',
  'Заходи / події': 'bg-orange-100 text-orange-700',
  'Програмне забезпечення': 'bg-indigo-100 text-indigo-700',
  'Інше': 'bg-gray-100 text-gray-600',
};

function catColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-600';
}

function formatAmount(amount: number, currency: string) {
  const sym = CURRENCY_SYMBOL[currency] ?? currency;
  return `${sym}${amount.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ExpensesView() {
  const { state, deleteExpense, confirmAction, currentUser } = useAppContext();

  const [activeMonthTab, setActiveMonthTab] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterAuthor, setFilterAuthor] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>(undefined);

  const expenses = state.expenses || [];

  // Unique categories from existing data + defaults
  const allCategories = useMemo(() => {
    const fromData = expenses.map(e => e.category);
    const fromSettings = state.expenseCategories || [];
    return [...new Set([...fromSettings, ...fromData])].sort();
  }, [expenses, state.expenseCategories]);

  // Filter
  const filtered = useMemo(() => expenses.filter(e => {
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    if (filterAuthor !== 'all' && e.createdBy !== filterAuthor) return false;
    return true;
  }), [expenses, filterCategory, filterAuthor]);

  // Group by month
  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const map: { month: string; expenses: Expense[] }[] = [];
    sorted.forEach(exp => {
      const d = new Date(exp.date);
      const label = d.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
      const key = label.charAt(0).toUpperCase() + label.slice(1);
      let g = map.find(g => g.month === key);
      if (!g) { g = { month: key, expenses: [] }; map.push(g); }
      g.expenses.push(exp);
    });
    return map;
  }, [filtered]);

  const availableMonths = grouped.map(g => g.month);

  // Default to current month if available, else first
  const nowLabel = (() => {
    const l = new Date().toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
    return l.charAt(0).toUpperCase() + l.slice(1);
  })();
  const currentMonth = activeMonthTab && availableMonths.includes(activeMonthTab)
    ? activeMonthTab
    : availableMonths.includes(nowLabel)
      ? nowLabel
      : availableMonths[0] ?? null;

  const activeGroup = grouped.find(g => g.month === currentMonth);
  const activeExpenses = activeGroup?.expenses ?? [];

  // Totals for active month
  const totalByMonth = useMemo(() => {
    const t: Record<string, number> = {};
    activeExpenses.forEach(e => {
      t[e.currency] = (t[e.currency] ?? 0) + e.amount;
    });
    return t;
  }, [activeExpenses]);

  // Totals by category
  const totalByCategory = useMemo(() => {
    const t: Record<string, { amount: number; currency: string }[]> = {};
    activeExpenses.forEach(e => {
      if (!t[e.category]) t[e.category] = [];
      const existing = t[e.category].find(x => x.currency === e.currency);
      if (existing) existing.amount += e.amount;
      else t[e.category].push({ amount: e.amount, currency: e.currency });
    });
    return t;
  }, [activeExpenses]);

  // CSV Export
  const handleExport = () => {
    if (!activeExpenses.length) return;
    const rows = [
      ['Назва', 'Сума', 'Валюта', 'Категорія', 'Дата', 'Автор', 'Коментар'],
      ...activeExpenses.map(e => [
        e.title,
        e.amount.toString(),
        e.currency,
        e.category,
        e.date,
        state.users.find(u => u.id === e.createdBy)?.name ?? e.createdBy,
        e.note ?? '',
      ]),
    ];
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${currentMonth ?? 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openAdd = () => { setEditingExpense(undefined); setIsModalOpen(true); };
  const openEdit = (exp: Expense) => { setEditingExpense(exp); setIsModalOpen(true); };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex flex-col gap-4 bg-gray-50 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Витрати відділу</h2>
              <p className="text-xs text-gray-500">Тільки адміни бачать цю сторінку</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
              title="Експорт CSV"
            >
              <Download className="w-4 h-4 mr-1.5" />
              CSV
            </button>
            <button
              onClick={openAdd}
              className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Додати витрату
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {currentMonth && (
          <div className="flex flex-wrap gap-3">
            {Object.entries(totalByMonth).map(([cur, total]) => (
              <div key={cur} className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-200 shadow-sm">
                <BarChart2 className="w-4 h-4 text-emerald-500" />
                <div>
                  <p className="text-xs text-gray-500 leading-none">Всього {cur}</p>
                  <p className="text-base font-bold text-gray-900 leading-tight mt-0.5">
                    {formatAmount(total as number, cur)}
                  </p>
                </div>
              </div>
            ))}
            {Object.keys(totalByMonth).length === 0 && (
              <p className="text-sm text-gray-400 py-1">Немає витрат за цей місяць</p>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Фільтри:
          </span>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 min-w-[160px]"
          >
            <option value="all">Усі категорії</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterAuthor}
            onChange={e => setFilterAuthor(e.target.value)}
            className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 min-w-[160px]"
          >
            <option value="all">Усі автори</option>
            {state.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {(filterCategory !== 'all' || filterAuthor !== 'all') && (
            <button
              onClick={() => { setFilterCategory('all'); setFilterAuthor('all'); }}
              className="text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1.5 rounded transition"
            >
              Скинути
            </button>
          )}
        </div>

        {/* Month tabs */}
        {availableMonths.length > 0 && (
          <div className="flex overflow-x-auto hidden-scrollbar -mb-4 -mx-6 px-6">
            <div className="flex space-x-6 border-b border-gray-200 w-full">
              {availableMonths.map(month => {
                const g = grouped.find(g => g.month === month)!;
                const totals = Object.entries(
                  g.expenses.reduce((acc, e) => {
                    acc[e.currency] = (acc[e.currency] ?? 0) + e.amount;
                    return acc;
                  }, {} as Record<string, number>)
                );
                return (
                  <button
                    key={month}
                    onClick={() => setActiveMonthTab(month)}
                    className={`pb-3 pt-1 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
                      currentMonth === month
                        ? 'border-emerald-600 text-emerald-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {month}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${currentMonth === month ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {g.expenses.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto hidden-scrollbar">
        {activeExpenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
              <TrendingDown className="w-7 h-7 text-emerald-400" />
            </div>
            <p className="text-gray-500 text-sm">Немає витрат. Натисніть «Додати витрату», щоб почати.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wider sticky top-0 z-10">
                <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[220px]">Назва</th>
                <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[140px]">Категорія</th>
                <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[120px] text-right">Сума</th>
                <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[110px]">Дата</th>
                <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[140px]">Автор</th>
                <th className="px-4 py-3 font-semibold border-b border-gray-200">Коментар</th>
                <th className="px-4 py-3 border-b border-gray-200 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {activeExpenses.map(exp => {
                const author = state.users.find(u => u.id === exp.createdBy);
                const isMine = exp.createdBy === currentUser?.userId;
                return (
                  <tr key={exp.id} className="hover:bg-gray-50/70 group transition">
                    <td className="px-4 py-3 font-medium text-gray-900">{exp.title}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${catColor(exp.category)}`}>
                        {exp.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                      {formatAmount(exp.amount, exp.currency)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(exp.date).toLocaleDateString('uk-UA')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {author && (
                          <img
                            src={author.avatar}
                            alt={author.name}
                            className="w-6 h-6 rounded-full border border-gray-200 object-cover"
                          />
                        )}
                        <span className="text-gray-700 text-sm">{author?.name ?? '—'}</span>
                        {isMine && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">Я</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm max-w-[200px] truncate">
                      {exp.note || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => openEdit(exp)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Редагувати"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => confirmAction('Видалити цю витрату?', () => deleteExpense(exp.id))}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                          title="Видалити"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Category summary footer */}
            {Object.keys(totalByCategory).length > 1 && (
              <tfoot>
                <tr>
                  <td colSpan={7} className="px-4 pt-4 pb-4">
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">По категоріях</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(totalByCategory).map(([cat, totals]) => (
                          <div key={cat} className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200 text-sm">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${catColor(cat)}`}>{cat}</span>
                            <span className="font-semibold text-gray-800">
                              {(totals as { amount: number; currency: string }[]).map(t => formatAmount(t.amount, t.currency)).join(' + ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {isModalOpen && (
        <ExpenseModal
          expense={editingExpense}
          onClose={() => { setIsModalOpen(false); setEditingExpense(undefined); }}
        />
      )}
    </div>
  );
}

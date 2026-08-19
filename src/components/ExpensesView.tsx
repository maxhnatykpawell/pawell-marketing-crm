import React, { useState, useMemo } from 'react';
import { useAppContext } from '../App';
import { Expense } from '../types';
import {
  Plus, Trash2, Pencil, TrendingDown, Filter,
  BarChart2, Download, Settings, X, Zap,
} from 'lucide-react';
import ExpenseModal from './ExpenseModal';
import { DEFAULT_CURRENCY_RATES } from '../lib/cac';

// ── Helpers ──────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOL: Record<string, string> = { UAH: '₴', USD: '$', EUR: '€' };

const PALETTE = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#84cc16',
  '#3b82f6', '#a78bfa', '#fb923c', '#4ade80', '#f472b6',
];

function palColor(i: number) { return PALETTE[i % PALETTE.length]; }

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
function catColor(cat: string) { return CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-600'; }

function fmt(amount: number, currency: string) {
  const sym = CURRENCY_SYMBOL[currency] ?? currency;
  return `${sym}${amount.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

interface BarEntry { label: string; amount: number; color: string }

function MiniBarChart({ data, title }: { data: BarEntry[]; title: string }) {
  const max = Math.max(...data.map(d => d.amount), 1);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">{title}</p>
      <div className="space-y-2.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-24 text-xs text-gray-600 truncate shrink-0" title={d.label}>{d.label}</div>
            <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                style={{
                  width: `${Math.max((d.amount / max) * 100, 4)}%`,
                  backgroundColor: d.color,
                }}
              >
                <span className="text-[10px] font-semibold text-white leading-none">
                  {Math.round((d.amount / max) * 100)}%
                </span>
              </div>
            </div>
            <div className="text-xs font-semibold text-gray-800 tabular-nums w-20 text-right shrink-0">
              {d.amount.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = ['Реклама','Інструменти','Дизайн','Зарплата / підрядники','Контент','Заходи / події','Програмне забезпечення','Інше'];
const DEFAULT_SOURCES = ['Meta Ads','Google Ads','TikTok Ads','LinkedIn Ads','YouTube Ads','Canva','Notion','Figma','ChatGPT / AI','Фрілансери'];

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { state, updateSettings } = useAppContext();
  const cats = state.expenseCategories?.length ? state.expenseCategories : DEFAULT_CATEGORIES;
  const srcs = state.expenseSources?.length ? state.expenseSources : DEFAULT_SOURCES;
  const rates = state.currencyRates ?? DEFAULT_CURRENCY_RATES;

  const [newCat, setNewCat] = useState('');
  const [newSrc, setNewSrc] = useState('');

  const setRate = (cur: 'USD' | 'EUR', raw: string) => {
    const v = parseFloat(raw.replace(',', '.'));
    if (!isFinite(v) || v <= 0) return;
    updateSettings({ currencyRates: { ...rates, [cur]: v } });
  };

  const addCat = () => {
    const v = newCat.trim();
    if (v && !cats.includes(v)) updateSettings({ expenseCategories: [...cats, v] });
    setNewCat('');
  };
  const removeCat = (c: string) => updateSettings({ expenseCategories: cats.filter(x => x !== c) });

  const addSrc = () => {
    const v = newSrc.trim();
    if (v && !srcs.includes(v)) updateSettings({ expenseSources: [...srcs, v] });
    setNewSrc('');
  };
  const removeSrc = (s: string) => updateSettings({ expenseSources: srcs.filter(x => x !== s) });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Налаштування витрат</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Categories */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Категорії</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {cats.map(c => (
                <span key={c} className={`inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium ${catColor(c)}`}>
                  {c}
                  <button onClick={() => removeCat(c)} className="hover:opacity-70 transition ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCat()}
                placeholder="Нова категорія..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              <button onClick={addCat} className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition">Додати</button>
            </div>
          </div>

          {/* Sources */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Джерела / Платформи</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {srcs.map((s, i) => (
                <span key={s} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: palColor(i) }}>
                  {s}
                  <button onClick={() => removeSrc(s)} className="hover:opacity-70 transition ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSrc}
                onChange={e => setNewSrc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSrc()}
                placeholder="Нове джерело (наприклад: Spotify Ads)..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              <button onClick={addSrc} className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition">Додати</button>
            </div>
          </div>

          {/* Курси валют — CAC на головній зводить усі витрати до гривні */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Курси валют</p>
            <p className="text-xs text-gray-500 mb-3">
              Скільки гривень коштує одна одиниця. За цим курсом витрати зводяться до гривні
              в розрахунку CAC на головній сторінці.
            </p>
            <div className="flex gap-3">
              {(['USD', 'EUR'] as const).map(cur => (
                <label key={cur} className="flex-1">
                  <span className="block text-xs text-gray-500 mb-1">
                    1 {CURRENCY_SYMBOL[cur]} = ₴
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={rates[cur]}
                    onBlur={e => setRate(cur, e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900 transition">Готово</button>
        </div>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function ExpensesView() {
  const { state, deleteExpense, confirmAction, currentUser } = useAppContext();

  const [activeMonthTab, setActiveMonthTab] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterAuthor, setFilterAuthor] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>(undefined);

  const expenses = state.expenses || [];
  const allCategories = useMemo(() => {
    const fromData = expenses.map(e => e.category);
    const fromSettings = state.expenseCategories || DEFAULT_CATEGORIES;
    return [...new Set([...fromSettings, ...fromData])].sort();
  }, [expenses, state.expenseCategories]);

  const allSources = useMemo(() => {
    const fromData = expenses.map(e => e.source).filter(Boolean) as string[];
    const fromSettings = state.expenseSources || DEFAULT_SOURCES;
    return [...new Set([...fromSettings, ...fromData])];
  }, [expenses, state.expenseSources]);

  const filtered = useMemo(() => expenses.filter(e => {
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    if (filterSource !== 'all' && e.source !== filterSource) return false;
    if (filterAuthor !== 'all' && e.createdBy !== filterAuthor) return false;
    return true;
  }), [expenses, filterCategory, filterSource, filterAuthor]);

  // Group by month (newest first)
  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
  const nowLabel = (() => {
    const l = new Date().toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
    return l.charAt(0).toUpperCase() + l.slice(1);
  })();
  const currentMonth = activeMonthTab && availableMonths.includes(activeMonthTab)
    ? activeMonthTab
    : availableMonths.includes(nowLabel) ? nowLabel : availableMonths[0] ?? null;

  const activeGroup = grouped.find(g => g.month === currentMonth);
  const activeExpenses = activeGroup?.expenses ?? [];

  // Totals
  const totalByMonth = useMemo(() => {
    const t: Record<string, number> = {};
    activeExpenses.forEach(e => { t[e.currency] = (t[e.currency] ?? 0) + e.amount; });
    return t;
  }, [activeExpenses]);

  // By source (for infographic) — UAH-only for simplicity; show all if mixed
  const bySource = useMemo(() => {
    const t: Record<string, Record<string, number>> = {};
    activeExpenses.forEach(e => {
      const key = e.source || '—';
      if (!t[key]) t[key] = {};
      t[key][e.currency] = (t[key][e.currency] ?? 0) + e.amount;
    });
    // Convert to flat list per primary currency
    return Object.entries(t).map(([label, byCur]) => {
      const entries = Object.entries(byCur);
      // pick UAH, else USD, else first
      const [cur, amount] = entries.find(([c]) => c === 'UAH') || entries.find(([c]) => c === 'USD') || entries[0];
      return { label, amount, currency: cur, allCurrencies: entries };
    }).sort((a, b) => b.amount - a.amount);
  }, [activeExpenses]);

  // By category
  const byCategory = useMemo(() => {
    const t: Record<string, number> = {};
    activeExpenses.forEach(e => {
      // normalise to single currency for chart (UAH preferred)
      if (e.currency === 'UAH') t[e.category] = (t[e.category] ?? 0) + e.amount;
      else t[e.category] = (t[e.category] ?? 0) + e.amount; // mixed ok
    });
    return Object.entries(t)
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [activeExpenses]);

  // Has meaningful source data
  const hasSourceData = bySource.some(s => s.label !== '—');
  const showInfographic = activeExpenses.length > 0;

  // CSV
  const handleExport = () => {
    if (!activeExpenses.length) return;
    const rows = [
      ['Назва', 'Сума', 'Валюта', 'Категорія', 'Джерело', 'Дата', 'Автор', 'Коментар'],
      ...activeExpenses.map(e => [
        e.title, e.amount.toString(), e.currency, e.category, e.source ?? '',
        e.date, state.users.find(u => u.id === e.createdBy)?.name ?? '', e.note ?? '',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
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
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-gray-200 flex flex-col gap-4 bg-gray-50 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Витрати відділу</h2>
              <p className="text-xs text-gray-500">Розділ видно тим, кому відкрито доступ до витрат</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSettingsOpen(true)} className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition" title="Налаштування">
              <Settings className="w-4 h-4 mr-1.5" /> Налаштування
            </button>
            <button onClick={handleExport} className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition" title="Експорт CSV">
              <Download className="w-4 h-4 mr-1.5" /> CSV
            </button>
            <button onClick={openAdd} className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition shadow-sm">
              <Plus className="w-4 h-4 mr-2" /> Додати витрату
            </button>
          </div>
        </div>

        {/* Summary totals */}
        {currentMonth && (
          <div className="flex flex-wrap gap-3">
            {Object.entries(totalByMonth).map(([cur, total]) => (
              <div key={cur} className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-200 shadow-sm">
                <BarChart2 className="w-4 h-4 text-emerald-500" />
                <div>
                  <p className="text-xs text-gray-500 leading-none">Всього {cur}</p>
                  <p className="text-base font-bold text-gray-900 leading-tight mt-0.5">{fmt(total as number, cur)}</p>
                </div>
              </div>
            ))}
            {activeExpenses.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-200 shadow-sm">
                <Zap className="w-4 h-4 text-amber-500" />
                <div>
                  <p className="text-xs text-gray-500 leading-none">Записів</p>
                  <p className="text-base font-bold text-gray-900 leading-tight mt-0.5">{activeExpenses.length}</p>
                </div>
              </div>
            )}
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
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-500 min-w-[150px]">
            <option value="all">Усі категорії</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
            className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-500 min-w-[150px]">
            <option value="all">Усі джерела</option>
            {allSources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterAuthor} onChange={e => setFilterAuthor(e.target.value)}
            className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-500 min-w-[140px]">
            <option value="all">Усі автори</option>
            {state.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {(filterCategory !== 'all' || filterSource !== 'all' || filterAuthor !== 'all') && (
            <button onClick={() => { setFilterCategory('all'); setFilterSource('all'); setFilterAuthor('all'); }}
              className="text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1.5 rounded transition">
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
                return (
                  <button key={month} onClick={() => setActiveMonthTab(month)}
                    className={`pb-3 pt-1 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
                      currentMonth === month ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}>
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

      {/* ── Main content ── */}
      <div className="flex-1 overflow-auto hidden-scrollbar">
        {activeExpenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
              <TrendingDown className="w-7 h-7 text-emerald-400" />
            </div>
            <p className="text-gray-500 text-sm">Немає витрат. Натисніть «Додати витрату», щоб почати.</p>
          </div>
        ) : (
          <div>
            {/* ── Infographic ── */}
            {showInfographic && (
              <div className="px-6 pt-5 pb-2">
                <div className={`grid gap-4 ${hasSourceData ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-lg'}`}>
                  {/* By source */}
                  {hasSourceData && (
                    <MiniBarChart
                      title="По джерелах / платформах"
                      data={bySource
                        .filter(s => s.label !== '—')
                        .map((s, i) => ({ label: s.label, amount: s.amount, color: palColor(i) }))}
                    />
                  )}
                  {/* By category */}
                  {byCategory.length > 0 && (
                    <MiniBarChart
                      title="По категоріях"
                      data={byCategory.map((c, i) => ({ label: c.label, amount: c.amount, color: palColor(i + 5) }))}
                    />
                  )}
                </div>
              </div>
            )}

            {/* ── Table ── */}
            <table className="w-full text-left border-collapse mt-4">
              <thead>
                <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wider sticky top-0 z-10">
                  <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[200px]">Назва</th>
                  <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[130px]">Категорія</th>
                  <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[130px]">Джерело</th>
                  <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[110px] text-right">Сума</th>
                  <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[100px]">Дата</th>
                  <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[130px]">Автор</th>
                  <th className="px-4 py-3 font-semibold border-b border-gray-200">Коментар</th>
                  <th className="px-4 py-3 border-b border-gray-200 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {activeExpenses.map(exp => {
                  const author = state.users.find(u => u.id === exp.createdBy);
                  const isMine = exp.createdBy === currentUser?.userId;
                  const srcIdx = allSources.indexOf(exp.source ?? '');
                  return (
                    <tr key={exp.id} className="hover:bg-gray-50/70 group transition">
                      <td className="px-4 py-3 font-medium text-gray-900">{exp.title}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${catColor(exp.category)}`}>
                          {exp.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {exp.source ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                            style={{ backgroundColor: palColor(srcIdx >= 0 ? srcIdx : 0) }}>
                            <Zap className="w-3 h-3" />
                            {exp.source}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                        {fmt(exp.amount, exp.currency)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(exp.date).toLocaleDateString('uk-UA')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {author && <img src={author.avatar} alt={author.name} className="w-6 h-6 rounded-full border border-gray-200 object-cover" />}
                          <span className="text-gray-700 text-sm">{author?.name ?? '—'}</span>
                          {isMine && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">Я</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm max-w-[180px] truncate">{exp.note || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button onClick={() => openEdit(exp)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Редагувати">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => confirmAction('Видалити цю витрату?', () => deleteExpense(exp.id))} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Видалити">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <ExpenseModal expense={editingExpense} onClose={() => { setIsModalOpen(false); setEditingExpense(undefined); }} />
      )}
      {isSettingsOpen && <SettingsPanel onClose={() => setIsSettingsOpen(false)} />}
    </div>
  );
}

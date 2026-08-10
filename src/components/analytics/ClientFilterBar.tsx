import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, X, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import {
  ClientFilters, EMPTY_FILTERS, RecencyBucket, RECENCY_LABELS, RFM_LABELS,
  countActiveFilters,
} from '../../lib/clientAnalytics';

/**
 * Затримка перед тим, як введений текст піде у фільтр.
 * Без неї кожен символ запускає перефільтрацію, сортування і перерахунок
 * розподілу по всій базі — на десятках тисяч клієнтів це відчутно гальмує.
 */
const SEARCH_DEBOUNCE_MS = 250;

interface Props {
  filters: ClientFilters;
  /** Приймає оновлювач, а не значення — інакше відкладений пошук міг би
   *  затерти фільтр, змінений уже після початку набору тексту. */
  onChange: React.Dispatch<React.SetStateAction<ClientFilters>>;
  tags: { tag: string; count: number }[];
  cohorts: { month: string; count: number }[];
  totalCount: number;
  filteredCount: number;
}

/** Один активний фільтр у вигляді знімного чіпа */
interface Chip {
  label: string;
  clear: () => void;
}

const num = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

const fmt = (n: number) => n.toLocaleString('uk-UA');

export default function ClientFilterBar({ filters, onChange, tags, cohorts, totalCount, filteredCount }: Props) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(filters);

  const patch = (p: Partial<ClientFilters>) => onChange(f => ({ ...f, ...p }));

  // Поле пошуку тримає власний стан, щоб набір тексту лишався миттєвим,
  // а важкий перерахунок запускався лише після паузи.
  const [draftSearch, setDraftSearch] = useState(filters.search);

  // Зовнішня зміна (напр. «Скинути все») має відображатись у полі
  useEffect(() => { setDraftSearch(filters.search); }, [filters.search]);

  useEffect(() => {
    if (draftSearch === filters.search) return;
    const t = setTimeout(() => onChange(f => ({ ...f, search: draftSearch })), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // filters.search навмисно поза залежностями: ефект має реагувати лише на
    // набір тексту, інакше він перезапускався б від власного ж результату.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSearch, onChange]);

  const toggleIn = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter(v => v !== value) : [...list, value];

  // ── Чіпи активних фільтрів ─────────────────────────────────────────────────
  const chips: Chip[] = [];

  if (filters.search.trim()) {
    chips.push({ label: `Назва: «${filters.search.trim()}»`, clear: () => patch({ search: '' }) });
  }
  for (const t of filters.tagsInclude) {
    chips.push({ label: t, clear: () => patch({ tagsInclude: filters.tagsInclude.filter(x => x !== t) }) });
  }
  for (const t of filters.tagsExclude) {
    chips.push({ label: `крім: ${t}`, clear: () => patch({ tagsExclude: filters.tagsExclude.filter(x => x !== t) }) });
  }
  for (const r of filters.rfm) {
    chips.push({ label: r, clear: () => patch({ rfm: filters.rfm.filter(x => x !== r) }) });
  }
  for (const r of filters.recency) {
    chips.push({ label: `покупка ${RECENCY_LABELS[r]}`, clear: () => patch({ recency: filters.recency.filter(x => x !== r) }) });
  }
  if (filters.cohortMonth) {
    chips.push({ label: `когорта ${filters.cohortMonth}`, clear: () => patch({ cohortMonth: null }) });
  }
  if (filters.revenueMin !== null || filters.revenueMax !== null) {
    chips.push({
      label: `дохід ${filters.revenueMin !== null ? fmt(filters.revenueMin) : '0'}–${filters.revenueMax !== null ? fmt(filters.revenueMax) : '∞'} ₴`,
      clear: () => patch({ revenueMin: null, revenueMax: null }),
    });
  }
  if (filters.dealsMin !== null || filters.dealsMax !== null) {
    chips.push({
      label: `угод ${filters.dealsMin ?? 0}–${filters.dealsMax ?? '∞'}`,
      clear: () => patch({ dealsMin: null, dealsMax: null }),
    });
  }
  if (filters.avgCheckMin !== null || filters.avgCheckMax !== null) {
    chips.push({
      label: `чек ${filters.avgCheckMin !== null ? fmt(filters.avgCheckMin) : '0'}–${filters.avgCheckMax !== null ? fmt(filters.avgCheckMax) : '∞'} ₴`,
      clear: () => patch({ avgCheckMin: null, avgCheckMax: null }),
    });
  }

  const pill = (active: boolean) =>
    `px-2.5 py-1 text-xs font-medium rounded-full border transition ${
      active
        ? 'bg-purple-600 border-purple-600 text-white'
        : 'bg-white border-gray-200 text-gray-600 hover:border-purple-300 hover:text-purple-700'
    }`;

  const rangeInputs = (
    label: string,
    minKey: keyof ClientFilters,
    maxKey: keyof ClientFilters,
    suffix?: string,
  ) => (
    <div>
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</p>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          placeholder="від"
          value={(filters[minKey] as number | null) ?? ''}
          onChange={e => patch({ [minKey]: num(e.target.value) } as Partial<ClientFilters>)}
          className="w-full min-w-0 border border-gray-200 rounded-md px-2 py-1 text-xs outline-none focus:border-purple-400"
        />
        <span className="text-gray-300 text-xs">—</span>
        <input
          type="number"
          placeholder="до"
          value={(filters[maxKey] as number | null) ?? ''}
          onChange={e => patch({ [maxKey]: num(e.target.value) } as Partial<ClientFilters>)}
          className="w-full min-w-0 border border-gray-200 rounded-md px-2 py-1 text-xs outline-none focus:border-purple-400"
        />
        {suffix && <span className="text-[11px] text-gray-400">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="border-b border-gray-100 bg-white flex-shrink-0">
      {/* Верхній рядок: пошук, лічильник, керування */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={draftSearch}
            onChange={e => setDraftSearch(e.target.value)}
            placeholder="Пошук за назвою клієнта..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-purple-400"
          />
        </div>

        <button
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition ${
            open || activeCount > 0
              ? 'bg-purple-50 border-purple-200 text-purple-700'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Фільтри
          {activeCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-purple-600 text-white rounded-full">
              {activeCount}
            </span>
          )}
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        <span className="text-sm text-gray-500 whitespace-nowrap">
          {filteredCount === totalCount
            ? <>Клієнтів: <strong className="text-gray-800">{fmt(totalCount)}</strong></>
            : <>Показано <strong className="text-gray-800">{fmt(filteredCount)}</strong> з {fmt(totalCount)}</>}
        </span>

        {activeCount > 0 && (
          <button
            onClick={() => onChange(EMPTY_FILTERS)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Скинути все
          </button>
        )}
      </div>

      {/* Чіпи активних фільтрів — щоб стан був видимий на будь-якій вкладці */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-6 pb-3">
          {chips.map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100 rounded-full"
            >
              {c.label}
              <button onClick={c.clear} className="p-0.5 hover:bg-purple-200 rounded-full transition">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Розгорнута панель */}
      {open && (
        <div className="px-6 pb-5 pt-1 space-y-4 bg-gray-50/60 border-t border-gray-100">

          {tags.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Теги <span className="normal-case font-normal text-gray-400">— клік вмикає, Alt+клік виключає</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(({ tag, count }) => {
                  const included = filters.tagsInclude.includes(tag);
                  const excluded = filters.tagsExclude.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={e => {
                        if (e.altKey) {
                          patch({
                            tagsExclude: toggleIn(filters.tagsExclude, tag),
                            tagsInclude: filters.tagsInclude.filter(t => t !== tag),
                          });
                        } else {
                          patch({
                            tagsInclude: toggleIn(filters.tagsInclude, tag),
                            tagsExclude: filters.tagsExclude.filter(t => t !== tag),
                          });
                        }
                      }}
                      title={excluded ? 'Виключено — Alt+клік щоб зняти' : 'Alt+клік щоб виключити'}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border transition ${
                        excluded
                          ? 'bg-red-50 border-red-200 text-red-600 line-through'
                          : included
                            ? 'bg-purple-600 border-purple-600 text-white'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-purple-300'
                      }`}
                    >
                      {tag} <span className="opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">RFM-сегмент</p>
              <div className="flex flex-wrap gap-1.5">
                {RFM_LABELS.map(label => (
                  <button
                    key={label}
                    onClick={() => patch({ rfm: toggleIn(filters.rfm, label as string) })}
                    className={pill(filters.rfm.includes(label))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Остання покупка</p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(RECENCY_LABELS) as RecencyBucket[]).map(b => (
                  <button
                    key={b}
                    onClick={() => patch({ recency: toggleIn(filters.recency, b) })}
                    className={pill(filters.recency.includes(b))}
                  >
                    {RECENCY_LABELS[b]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {rangeInputs('Дохід, ₴', 'revenueMin', 'revenueMax')}
            {rangeInputs('Кількість угод', 'dealsMin', 'dealsMax')}
            {rangeInputs('Середній чек, ₴', 'avgCheckMin', 'avgCheckMax')}

            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Когорта</p>
              <select
                value={filters.cohortMonth ?? ''}
                onChange={e => patch({ cohortMonth: e.target.value || null })}
                className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs outline-none focus:border-purple-400 bg-white"
              >
                <option value="">Усі когорти</option>
                {cohorts.map(({ month, count }) => (
                  <option key={month} value={month}>{month} ({count})</option>
                ))}
              </select>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

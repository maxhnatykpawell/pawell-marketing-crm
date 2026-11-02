import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { computeSources, AcquisitionInput, SourceStat } from '../../lib/monthlyReport';
import { normalizeSource, SourceCacResult } from '../../lib/cac';
import { sharePct } from '../../lib/dashboardMetrics';

/**
 * Джерела в одній таблиці.
 *
 * Раніше ті самі джерела були розкидані по чотирьох окремих картках (залучено,
 * клієнти, угоди, середній чек), кожна зі своїм порядком, своїм максимумом смужок і
 * назвами, обрізаними до «Рекоменд…». Порівняти одне джерело за всім ланцюгом —
 * від ліда до грошей — було неможливо. Тут рядок = джерело, колонки = ланцюг:
 * залучено → клієнти → конверсія → угоди → сума → CAC.
 */

const uah = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} ₴`;
const num = (n: number) => n.toLocaleString('uk-UA');

const Th = ({ children, right = true, hint }: { children: React.ReactNode; right?: boolean; hint?: string; key?: React.Key }) => (
  <th
    scope="col"
    title={hint}
    className={`px-3 py-2 text-xs font-bold text-gray-700 bg-gray-50 border-b border-gray-200 whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
  >
    {children}
  </th>
);

interface Props {
  aggregated: AcquisitionInput;
  /** CAC по джерелах; null — витрат немає або немає доступу до них */
  cac: SourceCacResult | null;
}

export default function SourceTable({ aggregated, cac }: Props) {
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => computeSources(aggregated), [aggregated]);
  const active = rows.filter(r => r.acquired > 0 || r.clients > 0 || r.deals > 0 || r.revenue > 0);
  const idle = rows.length - active.length;
  const shown = expanded ? rows : active;

  const totals = useMemo(() => {
    const t = rows.reduce(
      (s, r) => ({ acquired: s.acquired + r.acquired, clients: s.clients + r.clients, deals: s.deals + r.deals, revenue: s.revenue + r.revenue }),
      { acquired: 0, clients: 0, deals: 0, revenue: 0 },
    );
    return { ...t, conversion: t.acquired > 0 ? Math.round((t.clients / t.acquired) * 1000) / 10 : null };
  }, [rows]);

  const cacOf = (r: SourceStat): number | null => {
    const key = normalizeSource(r.source);
    return cac?.matched.find(m => normalizeSource(m.source) === key)?.cac ?? null;
  };
  const maxRevenue = Math.max(1, ...active.map(r => r.revenue));
  const hasCac = !!cac && cac.matched.length > 0;

  return (
    <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6">
      <div className="mb-4">
        <h3 className="text-base font-bold text-gray-900">Джерела: від залучення до грошей</h3>
        <p className="text-xs text-gray-600 mt-0.5 leading-snug max-w-3xl">
          Один рядок — одне джерело за обраний період. Конверсія — частка залучених, що стали клієнтами;
          «Частка» — внесок джерела в загальну суму угод{hasCac ? '; CAC — витрати на джерело ÷ його клієнти' : ''}.
        </p>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-4">За цей період CRM не повернула жодного джерела з даними.</p>
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <Th right={false}>Джерело</Th>
                <Th hint="Усі записи, створені в періоді (ліди + клієнти)">Залучено</Th>
                <Th hint="З них уже стали клієнтами">Клієнти</Th>
                <Th hint="Клієнти ÷ залучено">Конверсія</Th>
                <Th>Угод</Th>
                <Th>Сума угод</Th>
                <Th right={false} hint="Частка джерела в загальній сумі угод">Частка суми</Th>
                {hasCac && <Th hint="Витрати на джерело ÷ клієнти джерела">CAC</Th>}
              </tr>
            </thead>
            <tbody>
              {shown.map(r => {
                const share = sharePct(r.revenue, totals.revenue);
                const cacValue = cacOf(r);
                const dim = r.acquired === 0 && r.clients === 0 && r.deals === 0;
                return (
                  <tr key={r.source} className={`border-b border-gray-100 ${dim ? 'text-gray-400' : 'text-gray-900'}`}>
                    <td className="px-3 py-2.5 text-[13px] font-semibold">{r.source}</td>
                    <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{num(r.acquired)}</td>
                    <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{num(r.clients)}</td>
                    <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{r.conversion !== null ? `${r.conversion} %` : '—'}</td>
                    <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{num(r.deals)}</td>
                    <td className="px-3 py-2.5 text-[13px] text-right tabular-nums font-bold whitespace-nowrap">{uah(r.revenue)}</td>
                    <td className="px-3 py-2.5 w-[170px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden" aria-hidden>
                          <div className="h-full rounded-full bg-amber-500" style={{ width: `${r.revenue > 0 ? Math.max(3, (r.revenue / maxRevenue) * 100) : 0}%` }} />
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums text-gray-700">{share} %</span>
                      </div>
                    </td>
                    {hasCac && (
                      <td className="px-3 py-2.5 text-[13px] text-right tabular-nums whitespace-nowrap">
                        {cacValue !== null ? uah(cacValue) : <span className="text-gray-400" title="Немає витрат на це джерело">—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-bold text-gray-900">
                <td className="px-3 py-2.5 text-[13px]">Разом</td>
                <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{num(totals.acquired)}</td>
                <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{num(totals.clients)}</td>
                <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{totals.conversion !== null ? `${totals.conversion} %` : '—'}</td>
                <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{num(totals.deals)}</td>
                <td className="px-3 py-2.5 text-[13px] text-right tabular-nums whitespace-nowrap">{uah(totals.revenue)}</td>
                <td className="px-3 py-2.5 text-xs text-right text-gray-600">100 %</td>
                {hasCac && <td />}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {idle > 0 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 transition"
        >
          {expanded
            ? <>Приховати джерела без активності <ChevronUp className="w-3.5 h-3.5" /></>
            : <>Показати ще {idle} без активності за період <ChevronDown className="w-3.5 h-3.5" /></>}
        </button>
      )}
    </div>
  );
}

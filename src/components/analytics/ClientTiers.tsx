import React from 'react';
import { Layers, X } from 'lucide-react';
import { TierBreakdown, TierId, TIERS } from '../../lib/clientAnalytics';

const fmt = (n: number) => n.toLocaleString('uk-UA');

/** 1 клієнт · 2 клієнти · 5 клієнтів — інакше числа в картці читаються як машинний переклад */
function clientsWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'клієнтів';
  switch (n % 10) {
    case 1: return 'клієнт';
    case 2: case 3: case 4: return 'клієнти';
    default: return 'клієнтів';
  }
}

/**
 * Клієнти, розкладені на Tier 1–4 за доходом у періоді.
 *
 * Сенс блоку — назвати числа, які «топ-10 % дають N %» лишає за кадром:
 * скільки саме це клієнтів і з якої суми починається кожен тір. Клік по
 * рядку залишає у вибірці лише цей тір — так «хто саме ці 10 %» стає
 * списком, а не здогадкою.
 */
export default function ClientTiers({
  breakdown, focus, onFocus,
}: {
  breakdown: TierBreakdown;
  focus: TierId | null;
  onFocus: (tier: TierId | null) => void;
}) {
  const { stats, rankedCount, zeroRevenueCount, total } = breakdown;

  if (rankedCount === 0) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <h3 className="text-base font-black text-gray-800 mb-1">Тіри клієнтів</h3>
        <p className="text-sm text-gray-500">
          У вибірці немає жодного клієнта з доходом більшим за нуль — ранжувати нема кого.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h3 className="text-base font-black text-gray-800 flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-600" />
          Тіри клієнтів
        </h3>
        {focus !== null && (
          <button
            onClick={() => onFocus(null)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-full hover:bg-purple-100 transition"
          >
            Показано лише Tier {focus}
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-5">
        Ранг за доходом у періоді. Розподіляються <strong className="text-gray-700">{fmt(rankedCount)}</strong>{' '}
        клієнтів із доходом &gt; 0
        {zeroRevenueCount > 0 && (
          <>
            {' '}· <strong className="text-gray-700">{fmt(zeroRevenueCount)}</strong> без доходу в тіри не входять
          </>
        )}
        . Клік по рядку — показати лише цей тір.
      </p>

      <div className="space-y-1.5">
        {stats.map(s => {
          const meta = TIERS.find(t => t.id === s.tier)!;
          const active = focus === s.tier;
          return (
            <button
              key={s.tier}
              onClick={() => onFocus(active ? null : s.tier)}
              title={active ? 'Зняти обмеження' : `Показати лише ${meta.label}`}
              className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                active
                  ? 'border-purple-300 bg-purple-50/60 ring-1 ring-purple-200'
                  : 'border-gray-100 bg-gray-50/60 hover:border-purple-200 hover:bg-purple-50/30'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${meta.badge}`}>
                    {meta.label}
                  </span>
                  <span className="text-sm font-bold text-gray-800 whitespace-nowrap">
                    {fmt(s.count)} {clientsWord(s.count)}
                  </span>
                  <span className="text-xs text-gray-400 truncate">{meta.hint}</span>
                </span>
                <span className="flex items-baseline gap-3 whitespace-nowrap">
                  <span className="text-sm font-black text-gray-900">{fmt(s.revenue)} ₴</span>
                  <span className="text-xs font-bold text-purple-700 w-12 text-right">{s.revenueShare}%</span>
                </span>
              </div>

              {/* Смужка — частка доходу тіру, щоб перекіс було видно без читання чисел */}
              <div className="mt-2 h-1.5 bg-gray-200/70 rounded-full overflow-hidden">
                <div
                  className={`h-full ${meta.bar} rounded-full`}
                  style={{ width: `${Math.max(1, s.revenueShare)}%` }}
                />
              </div>

              <p className="mt-1.5 text-[11px] text-gray-500">
                Поріг входу <strong className="text-gray-700">{fmt(s.minRevenue)} ₴</strong>
                {' · '}діапазон {fmt(s.minRevenue)}–{fmt(s.maxRevenue)} ₴
                {' · '}у середньому {fmt(s.avgRevenue)} ₴
              </p>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-400 mt-4">
        Загальний дохід платників вибірки — {fmt(total)} ₴. Тіри перераховуються під поточні
        фільтри й період, тож це завжди ранг усередині того зрізу, який ви зараз дивитесь.
      </p>
    </div>
  );
}

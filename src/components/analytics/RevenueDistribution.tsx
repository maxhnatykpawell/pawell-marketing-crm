import React from 'react';
import { RevenueDistribution as Dist } from '../../lib/clientAnalytics';

const fmt = (n: number) => n.toLocaleString('uk-UA');

/**
 * Розподіл доходу по клієнтах вибірки.
 *
 * Сенс блоку — показати те, що середнє приховує. Якщо медіана вдесятеро менша
 * за середнє, а топ-10 % дають 80 % доходу, то «середній клієнт» — фікція,
 * і планувати за ARPU не можна.
 */
export default function RevenueDistribution({ dist }: { dist: Dist }) {
  if (dist.count === 0) return null;

  const maxBucket = Math.max(1, ...dist.buckets.map(b => b.count));
  const skewed = dist.median > 0 && dist.mean / dist.median >= 2;

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
      <h3 className="text-base font-black text-gray-800 mb-1">Розподіл доходу</h3>
      <p className="text-sm text-gray-500 mb-5">
        Як дохід розкладається по клієнтах вибірки — середнє саме по собі цього не показує.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Середнє (ARPU)', value: `${fmt(dist.mean)} ₴`, tone: 'text-purple-700', note: `${fmt(dist.total)} ₴ ÷ ${fmt(dist.count)}` },
          { label: 'Медіана', value: `${fmt(dist.median)} ₴`, tone: 'text-blue-700', note: 'половина клієнтів нижче' },
          { label: '90-й перцентиль', value: `${fmt(dist.p90)} ₴`, tone: 'text-emerald-700', note: '90 % клієнтів нижче' },
          {
            label: 'Топ-10 % дають',
            value: `${dist.top10Share}%`,
            tone: 'text-amber-700',
            note: `${fmt(dist.top10Count)} кл. · від ${fmt(dist.top10Threshold)} ₴`,
          },
        ].map(m => (
          <div key={m.label} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{m.label}</p>
            <p className={`text-xl font-black mt-1 ${m.tone}`}>{m.value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 truncate" title={m.note}>{m.note}</p>
          </div>
        ))}
      </div>

      {skewed && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-5">
          Середнє вище за медіану в {(dist.mean / dist.median).toFixed(1)}× — дохід сильно зміщений
          до кількох великих клієнтів. Медіана тут описує типового клієнта чесніше за ARPU.
        </p>
      )}

      {/* Медіана 0 — це не «мало даних», а «більшість вибірки не принесла нічого».
          Без цієї підказки три нулі поспіль читаються як зламаний розрахунок. */}
      {dist.median === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-5">
          Медіана 0 ₴ означає, що щонайменше половина клієнтів вибірки не принесла нічого за цей
          період{dist.p90 === 0 && ' — і навіть 90-й перцентиль нульовий, тобто таких понад 90 %'}.
          ARPU тут ділиться й на них теж, тому занижений. Щоб рахувати лише платників, поставте
          у фільтрі «Дохід, ₴» значення «від» = 1.
        </p>
      )}

      <div className="flex items-end gap-1.5 h-32">
        {dist.buckets.map((b, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 group">
            <span className="text-[10px] font-bold text-gray-500 opacity-0 group-hover:opacity-100 transition">
              {b.count}
            </span>
            <div
              className="w-full bg-gradient-to-t from-purple-500 to-purple-400 rounded-t transition-all hover:from-purple-600 hover:to-purple-500"
              style={{ height: `${Math.max(2, (b.count / maxBucket) * 100)}%` }}
              title={`${b.count} клієнтів · ${fmt(b.from)}${b.to === null ? '+' : `–${fmt(b.to)}`} ₴`}
            />
            <span className="text-[9px] text-gray-400 text-center leading-tight whitespace-nowrap">
              {b.to === null ? `${fmt(b.from)}+` : fmt(b.to)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-2 text-center">
        Дохід на клієнта, ₴ · останній стовпець — усі, хто вище 90-го перцентиля
      </p>
    </div>
  );
}

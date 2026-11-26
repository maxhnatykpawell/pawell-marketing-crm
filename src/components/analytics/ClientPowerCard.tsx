import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Gauge, X } from 'lucide-react';
import {
  MAX_SCORE, MIN_SCORE, POWER_TIERS, PowerSummary, PowerTier, TIER1_MIN, TIER2_MIN,
} from '../../lib/clientPower';
import type { PowerFocus } from '../../lib/analyticsViewState';

const fmt = (n: number) => n.toLocaleString('uk-UA');
const uah = (n: number) => `${fmt(Math.round(n))} ₴`;

/**
 * Тірування Pawell Power: скільки клієнтів у кожному з трьох тірів і скільки грошей
 * вони дали за вибраний період. Клік по тіру залишає в таблиці лише його.
 *
 * Окремо від «Тірів за доходом»: ті ділять клієнтів лише за гривнями, а тут тір
 * складається з п'яти ознак, і дві з них (оборот і частота) рахуються самі, а три
 * вводять люди. Поки ознаки не заповнено, тір попередній, і блок прямо каже скільки
 * клієнтів чекають оцінки.
 */
export default function ClientPowerCard({
  summary, focus, onFocus,
}: {
  summary: PowerSummary;
  focus: PowerFocus | null;
  onFocus: (f: PowerFocus | null) => void;
}) {
  const [showRules, setShowRules] = useState(false);
  const ranked = summary.rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="bg-white p-6 rounded-[20px] border border-gray-100 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h3 className="text-base font-black text-gray-800 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-indigo-600" />
          Pawell Power
        </h3>
        {focus !== null && (
          <button
            onClick={() => onFocus(null)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full hover:bg-indigo-100 transition"
          >
            {focus === 'incomplete' ? 'Лише без повної оцінки' : `Лише Tier ${focus}`}
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        5 питань по 1–3 бали ({MIN_SCORE}–{MAX_SCORE}). Тір визначає, хто веде клієнта й як часто з ним на звʼязку.
      </p>

      {ranked === 0 ? (
        <p className="text-sm text-gray-500">У вибірці немає клієнтів з оборотом — ранжувати нема кого.</p>
      ) : (
        <ul className="space-y-2">
          {POWER_TIERS.map(meta => {
            const row = summary.rows[meta.id - 1];
            const active = focus === meta.id;
            return (
              <li key={meta.id}>
                <button
                  onClick={() => onFocus(active ? null : (meta.id as PowerTier))}
                  aria-pressed={active}
                  className={`w-full text-left rounded-xl border px-3.5 py-3 transition ${
                    active ? 'border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-200' : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${meta.badge}`}>{meta.label}</span>
                    <span className="text-sm font-black text-gray-900 tabular-nums">
                      {fmt(row.count)} <span className="text-xs font-medium text-gray-400">клієнт.</span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden" aria-hidden>
                    <div className={`h-full ${meta.bar}`} style={{ width: `${Math.round(row.share * 100)}%` }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                    <span>{uah(row.revenue)} · {Math.round(row.share * 100)}% доходу</span>
                    {row.incomplete > 0 && <span className="text-amber-600">{fmt(row.incomplete)} попередніх</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {summary.incompleteTotal > 0 && (
        <button
          onClick={() => onFocus(focus === 'incomplete' ? null : 'incomplete')}
          className="mt-3 w-full text-left text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 hover:bg-amber-100 transition"
        >
          <b>{fmt(summary.incompleteTotal)}</b> клієнт. без повної оцінки: бракує потенціалу, контракту чи глибини акаунта.
          Тір для них попередній (відсутнє рахується як 1 бал). Натисніть, щоб показати лише їх.
        </button>
      )}
      {summary.unranked > 0 && (
        <p className="mt-2 text-[11px] text-gray-400">{fmt(summary.unranked)} клієнт. без обороту — поза тірами.</p>
      )}

      <button
        onClick={() => setShowRules(v => !v)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
        aria-expanded={showRules}
      >
        Як рахується {showRules ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {showRules && (
        <div className="mt-2 text-xs text-gray-600 space-y-2 border-t border-gray-100 pt-3">
          <ul className="list-disc pl-4 space-y-1">
            <li><b>Оборот за весь час</b> (авто): топ-10% клієнтів — 3, 11–40% — 2, решта — 1.</li>
            <li><b>Як часто купує</b> (авто): щомісяця або рамковий договір — 3, кілька разів на рік — 2, разово — 1.</li>
            <li><b>Потенціал на рік</b> (вручну): частка нашої виручки за 12 міс. — понад 5% — 3, 1–5% — 2, менше 1% — 1.</li>
            <li><b>Контракт</b> (вручну): великий — 3, середній — 2, малий чи немає — 1.</li>
            <li><b>Глибина акаунта</b> (вручну): 5+ контактів — 3, 2–4 — 2, один — 1.</li>
          </ul>
          <p>
            <b>Tier 1</b> — сума {TIER1_MIN}–{MAX_SCORE} <i>і обовʼязково повний акаунт</i> (5+ контактів щонайменше з 3 ланок).
            <b> Tier 2</b> — {TIER2_MIN}–{TIER1_MIN - 1} (або {TIER1_MIN}+ без повного акаунта).
            <b> Tier 3</b> — {MIN_SCORE}–{TIER2_MIN - 1}. Тіри переглядаємо раз на квартал.
          </p>
        </div>
      )}
    </div>
  );
}

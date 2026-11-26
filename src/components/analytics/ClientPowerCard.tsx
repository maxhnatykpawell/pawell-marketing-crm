import React, { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Gauge, X } from 'lucide-react';
import {
  MAX_SCORE, MIN_SCORE, POWER_CRITERION_LABELS, POWER_TIERS, PowerCriterion, PowerSummary, TIER1_MIN, TIER2_MIN,
} from '../../lib/clientPower';
import type { PowerFocus } from '../../lib/analyticsViewState';

const fmt = (n: number) => n.toLocaleString('uk-UA');
const uah = (n: number) => `${fmt(Math.round(n))} ₴`;

export interface PowerQueueItem {
  id: string;
  name: string;
  revenue: number;
  missing: PowerCriterion[];
}

/**
 * Тірування Pawell Power — головна секція вкладки «Сегментація».
 *
 * Дві задачі: (1) показати, скільки клієнтів у кожному з трьох тірів, і одним кліком
 * відкрити їх у списку; (2) вести людину до заповнення ручних ознак — тому нижче
 * черга найбільших клієнтів, яким бракує оцінки. Без цієї черги користувач мусив би
 * сам вгадувати, кого оцінювати першим, і ручні поля лишались би порожніми.
 */
export default function ClientPowerCard({
  summary, focus, onShow, queue, queueTotal, onEdit,
}: {
  summary: PowerSummary;
  /** Який фокус зараз активний у списку клієнтів */
  focus: PowerFocus | null;
  /** Показати клієнтів у списку (перемикає на вкладку «Клієнти») */
  onShow: (f: PowerFocus | null) => void;
  queue: PowerQueueItem[];
  queueTotal: number;
  onEdit: (clientId: string) => void;
}) {
  const [showRules, setShowRules] = useState(false);
  const ranked = summary.rows.reduce((s, r) => s + r.count, 0);

  return (
    <section aria-labelledby="power-title" className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 pt-5 pb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="power-title" className="text-base font-black text-gray-800 flex items-center gap-2">
            <Gauge className="w-5 h-5 text-indigo-600" />
            Pawell Power
          </h3>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Тір із п’яти ознак по 1–3 бали ({MIN_SCORE}–{MAX_SCORE}): оборот і частоту покупок рахуємо самі,
            потенціал, контракт і глибину акаунта вводить менеджер. Тір визначає, хто веде клієнта й як часто з ним на звʼязку.
          </p>
        </div>
        {focus !== null && (
          <button
            onClick={() => onShow(null)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full hover:bg-indigo-100 transition"
            title="У списку клієнтів зараз увімкнено цей відбір"
          >
            У списку: {focus === 'incomplete' ? 'без повної оцінки' : `Power Tier ${focus}`}
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {ranked === 0 ? (
        <p className="px-6 pb-6 text-sm text-gray-500">У вибірці немає клієнтів з оборотом — ранжувати нема кого.</p>
      ) : (
        <div className="px-6 pb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          {POWER_TIERS.map(meta => {
            const row = summary.rows[meta.id - 1];
            const active = focus === meta.id;
            return (
              <div
                key={meta.id}
                className={`rounded-2xl border p-4 flex flex-col ${active ? 'border-indigo-400 ring-1 ring-indigo-200 bg-indigo-50/40' : 'border-gray-100 bg-gray-50/50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${meta.badge}`}>{meta.label}</span>
                  <span className="text-[11px] text-gray-400 text-right">{meta.range}</span>
                </div>

                <p className="mt-3 text-3xl font-black text-gray-900 tabular-nums leading-none">
                  {fmt(row.count)}
                  <span className="ml-1.5 text-sm font-semibold text-gray-400">клієнт.</span>
                </p>

                <div className="mt-3 h-1.5 bg-gray-200/70 rounded-full overflow-hidden" aria-hidden>
                  <div className={`h-full ${meta.bar}`} style={{ width: `${Math.round(row.share * 100)}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-gray-600">
                  {uah(row.revenue)} · <b>{Math.round(row.share * 100)}%</b> доходу
                  {row.incomplete > 0 && <span className="text-amber-600"> · {fmt(row.incomplete)} попередніх</span>}
                </p>

                <dl className="mt-3 text-[11px] text-gray-500 space-y-0.5">
                  <div><dt className="inline font-semibold text-gray-600">Веде: </dt><dd className="inline">{meta.owner}</dd></div>
                  <div><dt className="inline font-semibold text-gray-600">На звʼязку: </dt><dd className="inline">{meta.cadence}</dd></div>
                  <div><dt className="inline font-semibold text-gray-600">Отримує: </dt><dd className="inline">{meta.gets}</dd></div>
                </dl>

                <button
                  onClick={() => onShow(meta.id)}
                  disabled={row.count === 0}
                  className="mt-4 inline-flex items-center justify-center gap-1.5 h-10 sm:h-9 px-3 text-sm font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Показати у списку <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Черга на оцінку: де саме людині діяти далі */}
      {queueTotal > 0 && (
        <div className="border-t border-gray-100 bg-amber-50/40 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <h4 className="text-sm font-bold text-gray-800">Потребують оцінки: {fmt(queueTotal)}</h4>
              <p className="text-xs text-gray-500">
                Їхній тір попередній — відсутні ознаки рахуються як 1 бал. Почніть із найбільших за доходом.
              </p>
            </div>
            <button
              onClick={() => onShow('incomplete')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
            >
              Усі у списку <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <ul className="divide-y divide-amber-100 bg-white border border-amber-100 rounded-xl overflow-hidden">
            {queue.map(item => (
              <li key={item.id}>
                <button
                  onClick={() => onEdit(item.id)}
                  className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left hover:bg-amber-50/60 transition"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-gray-800 truncate">{item.name}</span>
                    <span className="block text-[11px] text-gray-500 truncate">
                      Бракує: {item.missing.map(k => POWER_CRITERION_LABELS[k].toLowerCase()).join(', ')}
                    </span>
                  </span>
                  <span className="text-sm font-bold text-gray-700 tabular-nums whitespace-nowrap">{uah(item.revenue)}</span>
                  <span className="text-xs font-semibold text-indigo-600 whitespace-nowrap">Оцінити</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {summary.unranked > 0 && (
        <p className="px-6 pb-3 pt-3 text-[11px] text-gray-400">{fmt(summary.unranked)} клієнт. без обороту — поза тірами.</p>
      )}

      <div className="border-t border-gray-100 px-6 py-3">
        <button
          onClick={() => setShowRules(v => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          aria-expanded={showRules}
        >
          Як рахується {showRules ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showRules && (
          <div className="mt-3 text-xs text-gray-600 space-y-2">
            <ul className="list-disc pl-4 space-y-1">
              <li><b>Оборот за весь час</b> (авто): топ-10% клієнтів — 3, 11–40% — 2, решта — 1.</li>
              <li><b>Як часто купує</b> (авто): щомісяця або рамковий договір — 3, кілька разів на рік — 2, разово — 1.</li>
              <li><b>Потенціал на рік</b> (вручну): частка нашої виручки за 12 міс. — понад 5% — 3, 1–5% — 2, менше 1% — 1.</li>
              <li><b>Контракт</b> (вручну): великий — 3, середній — 2, малий чи немає — 1.</li>
              <li><b>Глибина акаунта</b> (вручну): 5+ контактів — 3, 2–4 — 2, один — 1.</li>
            </ul>
            <p>
              <b>Tier 1</b> — сума {TIER1_MIN}–{MAX_SCORE} <i>і обовʼязково повний акаунт</i> (5+ контактів щонайменше з 3 ланок).{' '}
              <b>Tier 2</b> — {TIER2_MIN}–{TIER1_MIN - 1} (або {TIER1_MIN}+ без повного акаунта).{' '}
              <b>Tier 3</b> — {MIN_SCORE}–{TIER2_MIN - 1}. Тіри переглядаємо раз на квартал.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

import React from 'react';
import { Repeat, X } from 'lucide-react';
import {
  CustomerMix as Mix, CustomerMixBucket, CustomerKind, MonthRange,
  CUSTOMER_KIND_STYLES as STYLES,
} from '../../lib/clientAnalytics';

const fmt = (n: number) => n.toLocaleString('uk-UA');

/** 1 клієнт · 2 клієнти · 5 клієнтів */
function clientsWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'клієнтів';
  switch (n % 10) {
    case 1: return 'клієнт';
    case 2: case 3: case 4: return 'клієнти';
    default: return 'клієнтів';
  }
}

/** 1 замовлення · 2 замовлення · 5 замовлень */
function ordersWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'замовлень';
  switch (n % 10) {
    case 1: return 'замовлення';
    case 2: case 3: case 4: return 'замовлення';
    default: return 'замовлень';
  }
}

function Half({
  bucket, active, onToggle,
}: {
  bucket: CustomerMixBucket;
  active: boolean;
  onToggle: () => void;
}) {
  const s = STYLES[bucket.kind];
  return (
    <button
      onClick={onToggle}
      title={active ? 'Зняти обмеження' : `Показати у вибірці лише цей бік: ${s.title.toLowerCase()}`}
      className={`text-left rounded-xl border px-4 py-3 transition ${
        active
          ? `${s.soft} ${s.border} ring-1 ring-purple-200`
          : 'border-gray-100 bg-gray-50/60 hover:border-purple-200 hover:bg-purple-50/30'
      }`}
    >
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{s.title}</p>
      <p className={`text-4xl font-black ${s.text} leading-tight mt-0.5`}>{bucket.dealsShare}%</p>
      <p className="text-xs text-gray-500 mt-1">
        {fmt(bucket.deals)} {ordersWord(bucket.deals)}
      </p>
      <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
        {fmt(bucket.revenue)} ₴ · <strong className="text-gray-600">{bucket.revenueShare}%</strong> доходу
        <br />
        {fmt(bucket.clients)} {clientsWord(bucket.clients)} · середній чек {fmt(bucket.avgCheck)} ₴
      </p>
    </button>
  );
}

/**
 * Скільки замовлень приносять нові клієнти, а скільки — постійні.
 *
 * Одна частка тут нічого не варта без другої: 70 % від нових — це або здоровий
 * ріст, або дірка в утриманні, і розрізняє їх лише те, скільки при цьому дають
 * постійні й з яким чеком. Тому обидва боки показані поруч, з доходом і чеком,
 * а не однією цифрою.
 *
 * Клік по боку залишає у вибірці лише його — «хто саме ці постійні» стає
 * списком у таблиці нижче.
 */
export default function CustomerMixCard({
  mix, focus, onFocus, range,
}: {
  mix: Mix;
  /** Показувати у вибірці лише цей бік; null = обидва */
  focus: CustomerKind | null;
  onFocus: (kind: CustomerKind | null) => void;
  /**
   * Межі періоду в місяцях; null = за весь час.
   *
   * Тут потрібен саме діапазон, а не його опис: пояснення спирається на межу
   * відсікання (`from`), і показувати замість неї весь період — значить
   * стверджувати, ніби постійні купували «до 2026-01 — 2026-12».
   */
  range: MonthRange | null;
}) {
  const toggle = (kind: CustomerKind) => onFocus(focus === kind ? null : kind);

  if (mix.totalDeals === 0) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <h3 className="text-base font-black text-gray-800 mb-1">Постійні й нові клієнти</h3>
        <p className="text-sm text-gray-500">
          У вибірці немає жодного замовлення — ділити нічого.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h3 className="text-base font-black text-gray-800 flex items-center gap-2">
          <Repeat className="w-4 h-4 text-purple-600" />
          Постійні й нові клієнти
        </h3>
        {focus !== null && (
          <button
            onClick={() => onFocus(null)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-full hover:bg-purple-100 transition"
          >
            Показано лише {STYLES[focus].title.toLowerCase()}
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-5">
        {mix.basis === 'period' && range ? (
          <>
            Постійний — той, чия перша покупка за весь час сталась{' '}
            <strong className="text-gray-700">раніше за {range.from}</strong>, тобто ще до початку
            періоду: тут він приходить уже не вперше. Новий — той, хто вперше купив у{' '}
            <strong className="text-gray-700">{range.from} — {range.to}</strong>.
          </>
        ) : (
          <>
            Періоду не вибрано, тож межа — <strong className="text-gray-700">друга покупка</strong>:
            постійний той, хто купував більше одного разу, новий — хто рівно раз.
          </>
        )}
      </p>

      {/* Смужка: обидва боки в одному масштабі, щоб перевагу було видно без чисел */}
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 mb-4">
        {(['returning', 'new', 'unknown'] as CustomerKind[]).map(k => (
          mix[k].dealsShare > 0 && (
            <div
              key={k}
              className={STYLES[k].bar}
              style={{ width: `${mix[k].dealsShare}%` }}
              title={`${STYLES[k].title}: ${mix[k].dealsShare}% замовлень`}
            />
          )
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Half bucket={mix.returning} active={focus === 'returning'} onToggle={() => toggle('returning')} />
        <Half bucket={mix.new}       active={focus === 'new'}       onToggle={() => toggle('new')} />
      </div>

      {/* Клієнти без жодного місяця покупки — показуємо, лише коли вони є:
          мовчазне округлення до 100 % приховало б, що частина даних неповна. */}
      {mix.unknown.deals > 0 && (
        <button
          onClick={() => toggle('unknown')}
          className="w-full mt-3 text-left rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-2.5 hover:bg-amber-50 transition"
        >
          <p className="text-[11px] text-amber-800">
            <strong>{mix.unknown.dealsShare}%</strong> замовлень ({fmt(mix.unknown.deals)}) — від{' '}
            {fmt(mix.unknown.clients)} {clientsWord(mix.unknown.clients)} без дат покупок: коли вони
            з'явились, невідомо, тож у жоден бік їх не зараховано.
          </p>
        </button>
      )}

      <p className="text-[11px] text-gray-400 mt-4">
        Усього у вибірці {fmt(mix.totalDeals)} {ordersWord(mix.totalDeals)} на {fmt(mix.totalRevenue)} ₴.
        Рахується під поточні фільтри й період.
      </p>
    </div>
  );
}

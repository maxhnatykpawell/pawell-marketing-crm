import React from 'react';
import { formatChange } from '../../lib/dashboardMetrics';

/**
 * Плитка показника головної панелі.
 *
 * Одна будова для всіх: назва → велике число → зміна → пояснення → тренд. Раніше
 * шість карток мали шість різних кольорових градієнтів і різну внутрішню будову, а
 * бейдж зміни стояв поруч із числом і виповзав за край картки, коли число довшало.
 * Тепер зміна лежить під числом, а колір плитки лише тонка смужка зверху — того ж
 * кольору, що й лінія цього показника на графіку нижче.
 */

/** Зміна до попереднього періоду: стрілка + знак + число; колір лише другий носій */
export function DeltaChip({ pct, good = 'up' }: { pct: number | null | undefined; good?: 'up' | 'down' }) {
  if (pct === null || pct === undefined) {
    return <span className="text-xs text-gray-500" title="Попередній період був нульовим — відсоток не визначений">— нема з чим порівняти</span>;
  }
  const rising = pct >= 0;
  const positive = pct === 0 ? null : good === 'up' ? rising : !rising;
  const tone =
    positive === null ? 'bg-gray-100 text-gray-800'
      : positive ? 'bg-emerald-100 text-emerald-900'
        : 'bg-red-100 text-red-900';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold whitespace-nowrap ${tone}`}>
      <span aria-hidden>{pct === 0 ? '■' : rising ? '▲' : '▼'}</span>
      {formatChange(pct)}
    </span>
  );
}

/** Міні-графік тренду по днях періоду */
function Spark({ points, color }: { points: number[]; color: string }) {
  const w = 120, h = 28;
  const max = Math.max(...points), min = Math.min(...points);
  const span = max - min || 1;
  const d = points
    .map((v, i) => `${i ? 'L' : 'M'}${((i * w) / (points.length - 1)).toFixed(1)} ${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-7" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

interface KpiTileProps {
  label: string;
  /** Число без одиниці — одиниця окремо, щоб не переноситись на інший рядок */
  value: string;
  unit?: string;
  /** undefined — зміни в принципі немає; null — база нульова */
  delta?: number | null;
  /** Чим менше, тим краще (витрати, CAC) — тоді зростання червоне */
  deltaGood?: 'up' | 'down';
  note?: React.ReactNode;
  /** Колір смужки зверху й тренду — як лінія цього показника на графіку */
  accent: string;
  trend?: number[];
  onClick?: () => void;
  title?: string;
  /** Службова позначка в куті, наприклад «дозріває» */
  badge?: React.ReactNode;
  key?: React.Key;
}

export default function KpiTile({
  label, value, unit, delta, deltaGood = 'up', note, accent, trend, onClick, title, badge,
}: KpiTileProps) {
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={`relative min-w-0 text-left bg-white rounded-2xl border border-gray-200 px-4 pt-4 pb-3 flex flex-col overflow-hidden ${
        onClick ? 'cursor-pointer hover:border-gray-300 hover:shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500' : ''
      }`}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />

      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold text-gray-700 leading-tight">{label}</p>
        {badge}
      </div>

      <p className="mt-1.5 flex items-baseline gap-1 whitespace-nowrap tabular-nums">
        <span className="text-[28px] leading-none font-extrabold text-gray-900">{value}</span>
        {unit && <span className="text-sm font-bold text-gray-500">{unit}</span>}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 min-h-[22px]">
        {delta !== undefined && <DeltaChip pct={delta} good={deltaGood} />}
      </div>

      {note && <p className="mt-1.5 text-xs text-gray-600 leading-snug">{note}</p>}

      {trend && trend.length > 1 && (
        <div className="mt-auto pt-2.5">
          <Spark points={trend} color={accent} />
        </div>
      )}
    </Tag>
  );
}

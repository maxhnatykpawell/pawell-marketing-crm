import React from 'react';

/**
 * Кільцева діаграма — частка кожного каналу в доході місяця.
 *
 * Своя SVG, а не recharts, з двох причин. Перша: документ для друку малюється в
 * прихованому вузлі, у якого немає розмірів, а recharts міряє контейнер — у PDF
 * діаграма вийшла б порожньою. Друга: тут потрібне саме кільце з шістьма
 * сегментами й підписами, і тримати заради нього залежність із власною
 * системою тем немає сенсу.
 *
 * Кільце свідомо обмежене шістьма сегментами: далі частки перестають читатись,
 * а сьомий колір довелось би вигадувати (див. groupChannels). Точні числа завжди
 * лежать у таблиці поруч — на кільці їх не читають, і воно не для цього.
 */

/**
 * Палітра сегментів.
 *
 * Це перші шість слотів перевіреної категоріальної палітри в незмінному порядку:
 * кольори призначаються по місцю в списку, а не по рангу, тож канал, що виріс,
 * не перефарбовує сусідів. Набір проходить перевірки на світлому тлі —
 * розрізнення при дальтонізмі (найгірша сусідня пара ΔE 9.1) і мінімальну
 * насиченість. Три з них не дотягують до контрасту 3:1 із білим, тому підписи
 * тексту й таблиця обов'язкові — вони тут і є.
 */
export const CHANNEL_COLORS = [
  '#2a78d6', // синій
  '#eb6834', // оранжевий
  '#1baf7a', // аква
  '#eda100', // жовтий
  '#e87ba4', // маджента
  '#008300', // зелений
] as const;

/** «Інші» — не канал, а залишок, тому нейтральний сірий, а не сьомий колір */
export const OTHER_COLOR = '#9ca3af';

export function channelColor(index: number, source?: string, otherLabel = 'Інші'): string {
  if (source === otherLabel) return OTHER_COLOR;
  return CHANNEL_COLORS[index] ?? OTHER_COLOR;
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  /** Що показати в підказці замість самого числа */
  hint?: string;
}

interface Props {
  slices: DonutSlice[];
  /** Число в центрі — зазвичай сума всіх сегментів */
  centerValue: string;
  centerLabel: string;
  /** Діаметр у пікселях; у друкованому документі менший */
  size?: number;
  /** Товщина кільця */
  thickness?: number;
}

/** Точка на колі: кут 0 — верх, далі за годинниковою */
function pointAt(cx: number, cy: number, r: number, fraction: number) {
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/**
 * Колір підпису на сегменті — від яскравості самого сегмента.
 *
 * Білий текст читається на синьому й зеленому, але зникає на жовтому. Який
 * канал виявиться найбільшим, наперед невідомо, тож колір підпису рахується, а
 * не вибирається на око.
 */
function inkOn(hex: string): string {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? '#1f2937' : '#ffffff';
}

export default function Donut({
  slices, centerValue, centerLabel, size = 200, thickness = 26,
}: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;

  if (total <= 0) {
    return (
      <svg width={size} height={size} role="img" aria-label="Немає даних для діаграми">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={thickness} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="text-[10px] fill-gray-400">
          немає даних
        </text>
      </svg>
    );
  }

  /*
    Сегменти — дуги обведення, а не заповнені сектори: так між ними тримається
    рівний проміжок тла (2 px), і суміжні кольори не злипаються в одну пляму.
    Проміжок віднімається від довжини дуги, тож сума часток лишається правдивою.
  */
  const circumference = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 2 : 0;

  let offset = 0;
  const arcs = slices.map((s, i) => {
    const fraction = s.value / total;
    const length = Math.max(0, fraction * circumference - gap);
    const arc = {
      ...s,
      i,
      fraction,
      /** Частка кільця, з якої сегмент починається — потрібна для підпису */
      start: offset / circumference,
      dash: `${length} ${circumference - length}`,
      rotate: (offset / circumference) * 360,
    };
    offset += fraction * circumference;
    return arc;
  });

  /** Найбільший сегмент підписуємо на самому кільці — решту читають у таблиці */
  const biggest = arcs.reduce((best, a) => (a.fraction > best.fraction ? a : best), arcs[0]);
  const labelPoint = pointAt(cx, cy, r, biggest.start + biggest.fraction / 2);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
         aria-label={`Розподіл по каналах: ${slices.map(s => `${s.label} ${Math.round((s.value / total) * 100)} %`).join(', ')}`}>
      {/* Доріжка під сегментами: без неї кільце з одним каналом виглядає обрізаним */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={thickness} />

      {arcs.map(a => (
        <circle
          key={`${a.label}-${a.i}`}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={a.color}
          strokeWidth={thickness}
          strokeDasharray={a.dash}
          // Обведення починається праворуч, тому все кільце повернуте на -90°
          transform={`rotate(${a.rotate - 90} ${cx} ${cy})`}
        >
          <title>{a.hint ?? `${a.label}: ${Math.round(a.fraction * 100)} %`}</title>
        </circle>
      ))}

      {/* Підпис найбільшого сегмента просто на кільці — щоб кільце можна було
          читати без легенди хоча б у головному */}
      {biggest.fraction >= 0.12 && (
        <text
          x={labelPoint.x}
          y={labelPoint.y}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: size > 160 ? 11 : 8, fontWeight: 700, fill: inkOn(biggest.color) }}
        >
          {Math.round(biggest.fraction * 100)}%
        </text>
      )}

      <text x={cx} y={cy - (size > 160 ? 6 : 4)} textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: size > 160 ? 15 : 11, fontWeight: 800, fill: '#111827' }}>
        {centerValue}
      </text>
      <text x={cx} y={cy + (size > 160 ? 12 : 8)} textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: size > 160 ? 9 : 7, fill: '#6b7280' }}>
        {centerLabel}
      </text>
    </svg>
  );
}

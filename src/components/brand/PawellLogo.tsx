import React, { useId } from 'react';

/**
 * Логотип PAWELL — єдине місце, де живе його векторна форма.
 *
 * Контури взято з оригінального файла бренду (pawell_logo_yellow_horizontal) без змін: рамка
 * зі скосом і шість літер. Колір не вшито: логотип одноколірний, тож його тон обирається там,
 * де він стоїть. Жовтий бренду на білому майже не читається (контраст ~1,3:1), тому на світлих
 * поверхнях (шапки, друк) беремо чорнильний тон, а жовтий лишаємо для темного тла.
 *
 *   • yellow  — на темному тлі (завантаження, вхід, плашка);
 *   • ink     — на світлому тлі (друковані звіти);
 *   • white   — на кольоровому тлі;
 *   • current — колір тексту навколо.
 */

export const BRAND = {
  yellow: '#f9db00',
  ink: '#0b0b0f',
} as const;

export type LogoTone = 'yellow' | 'ink' | 'white' | 'current';

const TONE: Record<LogoTone, string> = {
  yellow: BRAND.yellow,
  ink: BRAND.ink,
  white: '#ffffff',
  current: 'currentColor',
};

export const LOGO_VIEWBOX = { w: 352.54, h: 132.54 } as const;

// ── Контури (оригінал) ───────────────────────────────────────────────────────

/** Зовнішній контур рамки: за ним малюється лінія в анімації */
const FRAME_OUTER = 'M279.3,109.88H14.68l12.07-54.89c4.12-18.74,22.74-32.34,44.26-32.34h264.61l-12.07,54.89c-4.12,18.74-22.74,32.34-44.26,32.34Z';
/** Внутрішній контур: разом із зовнішнім дає рамку-кільце */
const FRAME_INNER = 'M18.42,106.88h260.88c20.13,0,37.51-12.61,41.33-29.98l11.27-51.25H71.02c-20.13,0-37.51,12.61-41.33,29.98l-11.27,51.25Z';
const FRAME = FRAME_OUTER + FRAME_INNER;

/** P, A, W, E, L, L */
const LETTERS = [
  'M49.98,73.27l-2.52,12.05h-14.18l7.85-37.05h30.1c9.02,0,12.72,1.06,12.72,5.77,0,.9-.17,1.91-.39,3.08l-1.51,7.29c-1.57,7.4-5.66,8.86-16.14,8.86h-15.92ZM68.87,60.16c.06-.28.11-.56.11-.84,0-1.12-.67-1.63-2.41-1.63h-13.28l-1.35,6.45h13.28c2.19,0,2.97-.67,3.36-2.58l.28-1.4Z',
  'M106.86,79.94h-14.01l-2.86,5.38h-15.52l22.87-37.05h18.05l7.17,37.05h-15.02l-.67-5.38ZM97.78,70.86h7.9l-1.46-11.88-6.45,11.88Z',
  'M159.6,85.32l-2.41-19.28-10.48,19.28h-17.04l-5.04-37.05h15.19l2.07,23.59,12.72-23.59h14.18l2.52,23.48,12.16-23.48h13.96l-20.79,37.05h-17.04Z',
  'M192.77,85.32l7.85-37.05h42.82l-2.02,9.42h-28.58l-.95,4.65h15.08l-1.91,8.86h-15.08l-1.01,4.71h28.58l-1.96,9.42h-42.82Z',
  'M240.07,85.32l7.85-37.05h14.24l-5.88,27.63h19.17l-1.96,9.42h-33.4Z',
  'M277.16,85.32l7.85-37.05h14.24l-5.88,27.63h19.17l-1.96,9.42h-33.4Z',
];

/** Літера P окремо: для компактних знаків (фавікон) */
export const LETTER_P = LETTERS[0];

/** Усі контури для скриптів, що малюють логотип поза React (генератор іконок) */
export const LOGO_PATHS = { frame: FRAME, letters: LETTERS } as const;

interface LogoProps {
  /** Висота; ширина виходить із пропорцій логотипа */
  height?: number | string;
  tone?: LogoTone;
  className?: string;
  /** Доступна назва; порожня — логотип суто декоративний */
  title?: string;
}

/** Статичний логотип */
export default function PawellLogo({ height = 24, tone = 'yellow', className, title = 'PAWELL' }: LogoProps) {
  return (
    <svg
      viewBox={`0 0 ${LOGO_VIEWBOX.w} ${LOGO_VIEWBOX.h}`}
      style={{ height, width: 'auto', aspectRatio: `${LOGO_VIEWBOX.w} / ${LOGO_VIEWBOX.h}` }}
      className={className}
      fill={TONE[tone]}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={FRAME} />
      {LETTERS.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/**
 * Логотип для світлих шапок інтерфейсу: прямо на білому, чорнильним контуром.
 * (Жовтий на білому не читається, а темна плашка під ним виглядала важко, тож тут лише контур.)
 */
export function PawellBadge({ size = 'md', className = '' }: { size?: 'sm' | 'md'; className?: string }) {
  return <PawellLogo height={size === 'sm' ? 34 : 44} tone="ink" className={`shrink-0 ${className}`} />;
}

/**
 * Логотип, що «малюється»: рамка виводиться лінією, літери спершу контуром, потім заливаються,
 * наприкінці по ньому проходить відблиск. Сама анімація в CSS (index.css, .pw-anim): тут лише
 * розмітка з потрібними класами.
 *
 * Кінцевий стан збігається з оригіналом піксель у піксель: лінія рамки наприкінці
 * підміняється точною заливкою, а контур літер зникає.
 */
export function PawellLogoAnimated({ height, tone = 'yellow', className }: Omit<LogoProps, 'title'>) {
  // Унікальні ідентифікатори: на сторінці може бути кілька копій логотипа
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const clip = `pw-clip-${uid}`;
  const grad = `pw-grad-${uid}`;
  const mask = `pw-mask-${uid}`;
  const color = TONE[tone];

  return (
    <svg
      viewBox={`0 0 ${LOGO_VIEWBOX.w} ${LOGO_VIEWBOX.h}`}
      // Розмір або задає висота, або (якщо її не передано) — клас із шириною, як у заставці
      style={height !== undefined
        ? { height, width: 'auto', aspectRatio: `${LOGO_VIEWBOX.w} / ${LOGO_VIEWBOX.h}` }
        : { aspectRatio: `${LOGO_VIEWBOX.w} / ${LOGO_VIEWBOX.h}` }}
      className={`pw-anim ${className ?? ''}`}
      role="img"
      aria-label="PAWELL"
      focusable="false"
    >
      <defs>
        <clipPath id={clip}><path d={FRAME_OUTER} /></clipPath>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={mask}>
          <g fill="#fff">
            <path d={FRAME} />
            {LETTERS.map((d, i) => <path key={i} d={d} />)}
          </g>
        </mask>
      </defs>

      {/* Рамка: товста лінія по зовнішньому контуру, обрізана ним самим — лишається смуга,
          що збігається з шириною рамки. Наприкінці її замінює точна заливка. */}
      <g clipPath={`url(#${clip})`}>
        <path className="pw-frame-stroke" d={FRAME_OUTER} pathLength={1} fill="none" stroke={color} strokeWidth={6} />
      </g>
      <path className="pw-frame-fill" d={FRAME} fill={color} />

      {LETTERS.map((d, i) => (
        <path
          key={i}
          className="pw-letter"
          d={d}
          pathLength={1}
          fill={color}
          stroke={color}
          strokeWidth={0.7}
          strokeLinejoin="round"
          style={{ ['--i' as any]: i }}
        />
      ))}

      <g mask={`url(#${mask})`}>
        <rect className="pw-shine" x={-90} y={0} width={80} height={LOGO_VIEWBOX.h} fill={`url(#${grad})`} transform="skewX(-18)" />
      </g>
    </svg>
  );
}

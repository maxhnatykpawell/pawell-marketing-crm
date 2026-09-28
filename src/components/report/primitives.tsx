import React from 'react';

/**
 * Спільні деталі друкованих звітів.
 *
 * Винесено з AnalyticsReport, коли поруч з'явився місячний звіт: два документа,
 * які лягають в одну теку й підписуються одним іменем, не мають відрізнятись
 * товщиною рамки й розміром шрифту в таблицях. Один набір цеглин — один вигляд.
 *
 * Розміри тут навмисно дрібні (8–9 pt): це папір, а не екран, і звіт має влазити
 * в сторінку без масштабування, яке браузер робить на свій розсуд.
 */

export const uah = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} ₴`;
export const num = (n: number) => n.toLocaleString('uk-UA');

/** Заголовок розділу разом із блоком, який він називає: розривати їх не можна */
export function Section({
  title, hint, children, breakBefore = false,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  breakBefore?: boolean;
}) {
  return (
    <section
      className="mt-6"
      style={{ breakInside: 'avoid', breakBefore: breakBefore ? 'page' : 'auto' }}
    >
      <h2 className="text-[13px] font-black text-gray-900 border-b-2 border-gray-900 pb-1 mb-2">
        {title}
      </h2>
      {hint && <p className="text-[9px] text-gray-500 mb-2 leading-snug">{hint}</p>}
      {children}
    </section>
  );
}

export type Align = 'left' | 'right' | 'center';

/** Класи пишемо повними: Tailwind збирає стилі зі статичного тексту, і
    `text-${align}` не потрапив би у збірку взагалі */
export const ALIGN: Record<Align, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

/** `key` в типі навмисно: без нього ці помічники не можна поставити в .map(),
    а React усе одно забирає його собі й у компонент не передає */
export const TH = ({ children, align = 'left' }: { children: React.ReactNode; align?: Align; key?: React.Key }) => (
  <th className={`border border-gray-300 bg-gray-100 px-1.5 py-1 text-[8px] font-bold uppercase tracking-wide text-gray-700 ${ALIGN[align]}`}>
    {children}
  </th>
);

export const TD = ({ children, align = 'left', bold = false }: { children: React.ReactNode; align?: Align; bold?: boolean }) => (
  <td className={`border border-gray-300 px-1.5 py-[3px] text-[9px] text-gray-800 ${ALIGN[align]} ${bold ? 'font-bold' : ''}`}>
    {children}
  </td>
);

/** Показник у шапці звіту — число і те, що воно означає */
export function Kpi({ label, value, note }: { label: string; value: string; note?: React.ReactNode; key?: React.Key }) {
  return (
    <div className="border border-gray-300 rounded px-2 py-1.5">
      <p className="text-[7.5px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-[15px] font-black text-gray-900 leading-tight">{value}</p>
      {note && <p className="text-[7.5px] text-gray-500 leading-tight">{note}</p>}
    </div>
  );
}

import React from 'react';
import { LinkProvider, LinkProviderId } from '../lib/links';
import { Link2, FileText } from 'lucide-react';

/**
 * Іконки зовнішніх сервісів для вкладень-посилань.
 *
 * Малюємо inline-SVG, а не тягнемо favicon сервісу: favicon вимагає мережевого
 * запиту на кожен рядок вкладення і зникає, коли робочий Google-акаунт закритий
 * для нашого домену — а іконка типу файлу має бути видна завжди й одразу.
 */

/** Аркуш із загнутим кутом — спільна основа для Docs/Sheets/Slides/Forms. */
function DocShape({ color, children }: { color: string; children?: React.ReactNode }) {
  return (
    <>
      <path d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill={color} />
      <path d="M13 2l5 5h-5z" fill="#fff" fillOpacity="0.35" />
      {children}
    </>
  );
}

const GLYPHS: Partial<Record<LinkProviderId, React.ReactNode>> = {
  'google-docs': (
    <DocShape color="#4285F4">
      <g fill="#fff">
        <rect x="7" y="11" width="8" height="1.2" rx="0.6" />
        <rect x="7" y="14" width="8" height="1.2" rx="0.6" />
        <rect x="7" y="17" width="5" height="1.2" rx="0.6" />
      </g>
    </DocShape>
  ),
  'google-sheets': (
    <DocShape color="#0F9D58">
      <g fill="#fff">
        <rect x="7" y="11" width="8" height="7.5" rx="0.6" />
      </g>
      <g stroke="#0F9D58" strokeWidth="1">
        <line x1="11" y1="11" x2="11" y2="18.5" />
        <line x1="7" y1="13.5" x2="15" y2="13.5" />
        <line x1="7" y1="16" x2="15" y2="16" />
      </g>
    </DocShape>
  ),
  'google-slides': (
    <DocShape color="#F4B400">
      <rect x="7" y="11.5" width="8" height="6" rx="0.8" fill="#fff" />
    </DocShape>
  ),
  'google-forms': (
    <DocShape color="#7248B9">
      <g fill="#fff">
        <rect x="7" y="11" width="2" height="2" rx="0.4" />
        <rect x="10.5" y="11.4" width="4.5" height="1.2" rx="0.6" />
        <rect x="7" y="14.5" width="2" height="2" rx="0.4" />
        <rect x="10.5" y="14.9" width="4.5" height="1.2" rx="0.6" />
      </g>
    </DocShape>
  ),
  'google-calendar': (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2.5" fill="#fff" stroke="#1A73E8" strokeWidth="1.6" />
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5V8H3z" fill="#1A73E8" />
      <text x="12" y="18" textAnchor="middle" fontSize="8" fontWeight="700" fill="#1A73E8" fontFamily="system-ui, sans-serif">31</text>
    </>
  ),
  'google-meet': (
    <>
      <rect x="2.5" y="6" width="12" height="12" rx="2" fill="#00832D" />
      <path d="M14.5 10.5l5-3.2a.8.8 0 0 1 1.2.7v7.9a.8.8 0 0 1-1.2.7l-5-3.2z" fill="#00AC47" />
    </>
  ),
  youtube: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="4" fill="#FF0000" />
      <path d="M10 9l5.5 3L10 15z" fill="#fff" />
    </>
  ),
  figma: (
    <>
      <path d="M9 2h3v6H9a3 3 0 1 1 0-6z" fill="#F24E1E" />
      <path d="M12 2h3a3 3 0 1 1 0 6h-3z" fill="#FF7262" />
      <path d="M9 8h3v6H9a3 3 0 1 1 0-6z" fill="#A259FF" />
      <path d="M9 14h3v3a3 3 0 1 1-3-3z" fill="#0ACF83" />
      <circle cx="15" cy="11" r="3" fill="#1ABCFE" />
    </>
  ),
};

/** Логотип Google Drive — власна геометрія, не вписується у форму аркуша. */
function DriveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 87.3 78" className={className} aria-hidden="true">
      <path fill="#0066da" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" />
      <path fill="#00ac47" d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44C.4 49.9 0 51.45 0 53h27.5z" />
      <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.4c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" />
      <path fill="#00832d" d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" />
      <path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
      <path fill="#ffba00" d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </svg>
  );
}

export default function FileTypeIcon({
  provider, className = 'w-5 h-5',
}: {
  provider: LinkProvider;
  className?: string;
}) {
  if (provider.id === 'google-drive') return <DriveIcon className={className} />;

  const glyph = GLYPHS[provider.id];
  if (glyph) {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        {glyph}
      </svg>
    );
  }

  if (provider.id === 'notion') {
    return <FileText className={className} style={{ color: provider.color }} aria-hidden="true" />;
  }
  return <Link2 className={className} style={{ color: provider.color }} aria-hidden="true" />;
}

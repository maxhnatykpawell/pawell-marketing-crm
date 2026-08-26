/**
 * Розпізнавання зовнішніх посилань — насамперед Google-файлів.
 *
 * Іконка тут важливіша за назву: у списку вкладень людина шукає «ту таблицю»
 * поглядом, а не читанням. Тому провайдер визначається з URL, а не з того, що
 * користувач вписав у поле «назва» — назву він може змінити чи лишити порожньою.
 */

export type LinkProviderId =
  | 'google-docs'
  | 'google-sheets'
  | 'google-slides'
  | 'google-forms'
  | 'google-drive'
  | 'google-calendar'
  | 'google-meet'
  | 'youtube'
  | 'figma'
  | 'notion'
  | 'link';

export interface LinkProvider {
  id: LinkProviderId;
  label: string;
  /** Основний колір бренду — для іконки та бейджа. */
  color: string;
  isGoogle: boolean;
}

const PROVIDERS: Record<LinkProviderId, LinkProvider> = {
  'google-docs':     { id: 'google-docs',     label: 'Google Документ',  color: '#4285F4', isGoogle: true },
  'google-sheets':   { id: 'google-sheets',   label: 'Google Таблиця',   color: '#0F9D58', isGoogle: true },
  'google-slides':   { id: 'google-slides',   label: 'Google Презентація', color: '#F4B400', isGoogle: true },
  'google-forms':    { id: 'google-forms',    label: 'Google Форма',     color: '#7248B9', isGoogle: true },
  'google-drive':    { id: 'google-drive',    label: 'Google Drive',     color: '#1A73E8', isGoogle: true },
  'google-calendar': { id: 'google-calendar', label: 'Google Календар',  color: '#1A73E8', isGoogle: true },
  'google-meet':     { id: 'google-meet',     label: 'Google Meet',      color: '#00832D', isGoogle: true },
  'youtube':         { id: 'youtube',         label: 'YouTube',          color: '#FF0000', isGoogle: false },
  'figma':           { id: 'figma',           label: 'Figma',            color: '#A259FF', isGoogle: false },
  'notion':          { id: 'notion',          label: 'Notion',           color: '#111827', isGoogle: false },
  'link':            { id: 'link',            label: 'Посилання',        color: '#6B7280', isGoogle: false },
};

export function getProvider(id: LinkProviderId): LinkProvider {
  return PROVIDERS[id] || PROVIDERS.link;
}

/** Чи є рядок схожим на зовнішнє посилання (а не на шлях у нашому сховищі). */
export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/**
 * Нормалізує те, що людина вставила: «docs.google.com/...» без схеми — теж
 * посилання, і клікати по ньому має сенс.
 */
export function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return '';
  if (isExternalUrl(url)) return url;
  if (url.startsWith('/')) return url;
  return `https://${url}`;
}

export function detectProvider(rawUrl: string): LinkProvider {
  const url = (rawUrl || '').trim().toLowerCase();
  if (!url) return PROVIDERS.link;

  let host = '';
  let path = '';
  try {
    const parsed = new URL(isExternalUrl(url) ? url : `https://${url}`);
    host = parsed.hostname;
    path = parsed.pathname;
  } catch {
    return PROVIDERS.link;
  }

  if (host === 'docs.google.com') {
    if (path.startsWith('/document')) return PROVIDERS['google-docs'];
    if (path.startsWith('/spreadsheets')) return PROVIDERS['google-sheets'];
    if (path.startsWith('/presentation')) return PROVIDERS['google-slides'];
    if (path.startsWith('/forms')) return PROVIDERS['google-forms'];
    return PROVIDERS['google-drive'];
  }
  if (host === 'sheets.google.com') return PROVIDERS['google-sheets'];
  if (host === 'slides.google.com') return PROVIDERS['google-slides'];
  if (host === 'forms.gle' || host === 'forms.google.com') return PROVIDERS['google-forms'];
  if (host === 'drive.google.com') return PROVIDERS['google-drive'];
  if (host === 'calendar.google.com') return PROVIDERS['google-calendar'];
  if (host === 'meet.google.com') return PROVIDERS['google-meet'];
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return PROVIDERS.youtube;
  if (host.endsWith('figma.com')) return PROVIDERS.figma;
  if (host.endsWith('notion.so') || host.endsWith('notion.site')) return PROVIDERS.notion;

  return PROVIDERS.link;
}

/**
 * Підказка назви для вкладення-посилання, коли людина не вписала свою.
 * Для Google-файлів у URL немає назви документа, тож чесніше показати тип
 * файлу, ніж хеш ідентифікатора.
 */
export function suggestLinkName(rawUrl: string): string {
  const provider = detectProvider(rawUrl);
  if (provider.isGoogle) return provider.label;
  try {
    const parsed = new URL(normalizeUrl(rawUrl));
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : parsed.hostname;
  } catch {
    return rawUrl;
  }
}

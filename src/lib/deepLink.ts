/**
 * Глибокі посилання: адреса сторінки відображає, де людина зараз знаходиться
 * (розділ, проєкт, дошка, подія, картка), тож адресу можна просто скопіювати
 * й надіслати колезі — він потрапить рівно туди, а не блукатиме вкладками.
 *
 * Формат: /?view=board&project=<id>&board=<id>&event=<id>&card=<id>
 * Чужі параметри (наприклад, invite) не чіпаємо.
 */

export interface DeepLinkTarget {
  view?: string | null;
  project?: string | null;
  board?: string | null;
  event?: string | null;
  card?: string | null;
}

const KEYS = ['view', 'project', 'board', 'event', 'card'] as const;

export function parseDeepLink(search: string): DeepLinkTarget {
  const p = new URLSearchParams(search);
  const out: DeepLinkTarget = {};
  for (const k of KEYS) {
    const v = p.get(k);
    if (v) out[k] = v;
  }
  return out;
}

/** Накладає ціль на існуючий search-рядок: порожні значення прибирає, чужі параметри лишає. */
export function applyDeepLink(search: string, target: DeepLinkTarget): string {
  const p = new URLSearchParams(search);
  for (const k of KEYS) {
    const v = target[k];
    if (v) p.set(k, v);
    else p.delete(k);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Повне посилання, яке можна надіслати іншій людині (без чужих параметрів на кшталт invite). */
export function buildShareLink(origin: string, pathname: string, target: DeepLinkTarget): string {
  return `${origin}${pathname}${applyDeepLink('', target)}`;
}

/**
 * Пуш-сповіщення: чиста логіка без мережі й без Node-залежностей, щоб її можна
 * було перевірити тестом (push.test.ts) і спільно використати на сервері.
 */

import { previewOf } from './chat';

export interface PushPayload {
  title: string;
  body: string;
  /** Куди перейти по кліку (відносна адреса застосунку) */
  url?: string;
  /** Однаковий tag замінює попереднє сповіщення, а не складає стос */
  tag?: string;
}

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Перевіряє підписку, що прийшла від браузера; повертає лише потрібні поля або null */
export function parseSubscription(input: unknown): PushSubscriptionJson | null {
  if (!input || typeof input !== 'object') return null;
  const s = input as any;
  if (typeof s.endpoint !== 'string' || s.endpoint.length > 2048) return null;
  try {
    // Пуш-сервіси працюють лише по https
    if (new URL(s.endpoint).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  const p256dh = s.keys?.p256dh;
  const auth = s.keys?.auth;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) return null;
  if (p256dh.length > 256 || auth.length > 256) return null;
  return { endpoint: s.endpoint, keys: { p256dh, auth } };
}

export interface ChatPushInput {
  /** Хто бачить розмову; null — усі користувачі (відкритий канал) */
  recipients: string[] | null;
  allUserIds: string[];
  authorId: string;
  /** Згаданих сповіщаємо окремо (з вищим пріоритетом), тож тут їх пропускаємо */
  mentioned: string[];
}

/** Кому слати пуш про нове повідомлення: усім учасникам, крім автора й згаданих */
export function chatPushTargets({ recipients, allUserIds, authorId, mentioned }: ChatPushInput): string[] {
  const skip = new Set([authorId, ...mentioned]);
  return (recipients ?? allUserIds).filter(id => !skip.has(id));
}

export function chatPushPayload(opts: {
  conversationId: string;
  kind: 'dm' | 'channel';
  channelTitle?: string;
  authorName: string;
  text: string;
}): PushPayload {
  return {
    title: opts.kind === 'dm' ? opts.authorName : `${opts.authorName} · ${opts.channelTitle || 'канал'}`,
    body: previewOf(opts.text, 120),
    url: '/?view=chat',
    // Серія повідомлень з однієї розмови замінює одне одного замість стосу
    tag: `chat-${opts.conversationId}`,
  };
}

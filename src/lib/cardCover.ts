/**
 * Обкладинка картки.
 *
 * Обкладинка — не окреме зображення, а одне з вкладень картки: те саме фото,
 * що лежить у списку файлів, показується згори на дошці. Другого місця, куди
 * можна залити картинку, немає навмисно — інакше довелося б пояснювати, чим
 * «фото картки» відрізняється від «вкладення-картинки», і чистити сховище від
 * копій.
 *
 * Вибір обкладинки має три стани, і кожен потрібен:
 *
 *   поля немає  — обкладинку не вибирали: беремо найсвіжіше фото. Так картки,
 *                 до яких фото чіпляли ще до появи обкладинок, отримують її
 *                 самі, без ручного проходу по всій дошці;
 *   null        — обкладинку прибрали руками. Саме тому «немає» і «прибрали» —
 *                 різні стани: інакше прибрана обкладинка поверталася б сама;
 *   id вкладення — вибране фото, навіть якщо потім залили новіші.
 */
import { Attachment, Card } from '../types';
import { isExternalUrl } from './links';

const IMAGE_NAME = /\.(jpeg|jpg|gif|png|webp|avif|svg)$/i;

/**
 * Чи це картинка, яку можна поставити обкладинкою.
 *
 * Посилання не годиться: у нього немає самого файлу, лише адреса чужої
 * сторінки. Правило те саме, що й у мініатюри в списку вкладень, — включно з
 * тим, що зовнішня адреса читається як посилання, навіть коли вкладення
 * позначене файлом. Інакше дошка показувала б обкладинку там, де картка
 * вважає це посиланням, і кнопки «зробити обкладинкою» поруч не було б.
 */
export function isImageAttachment(att: Pick<Attachment, 'name' | 'kind' | 'url'>): boolean {
  if (att.kind === 'link' || isExternalUrl(att.url || '')) return false;
  return IMAGE_NAME.test(att.name || '');
}

export function imageAttachments(card: Pick<Card, 'attachments'>): Attachment[] {
  return (card.attachments || []).filter(isImageAttachment);
}

/** Найсвіжіше залите фото: вкладення додаються в кінець списку. */
export function newestImage(card: Pick<Card, 'attachments'>): Attachment | null {
  const images = imageAttachments(card);
  return images.length ? images[images.length - 1] : null;
}

/**
 * Обкладинка картки або null, якщо її немає.
 *
 * Вибране вкладення, якого вже немає серед файлів, читаємо як «обкладинки
 * немає»: фото видалили, і підставляти замість нього інше — не те, чого
 * очікує людина, яка щойно його прибрала.
 */
export function resolveCover(card: Pick<Card, 'attachments' | 'coverAttachmentId'>): Attachment | null {
  if (card.coverAttachmentId === null) return null;
  if (card.coverAttachmentId) {
    const chosen = (card.attachments || []).find(a => a.id === card.coverAttachmentId);
    return chosen && isImageAttachment(chosen) ? chosen : null;
  }
  return newestImage(card);
}

/**
 * Яким стає вибір обкладинки після видалення вкладення.
 *
 * Повертає undefined, коли міняти нічого не треба, — щоб не писати в картку
 * поле заради поля.
 */
export function coverAfterRemoving(
  card: Pick<Card, 'attachments' | 'coverAttachmentId'>,
  removedId: string,
): { coverAttachmentId: string | null } | undefined {
  const cover = resolveCover(card);
  if (!cover || cover.id !== removedId) return undefined;
  // Прибрали саме те фото, що було обкладинкою. Якщо його обрали руками —
  // вибір разом із ним і зникає; якщо обкладинка була автоматичною, наступне
  // фото стане нею само, і писати нічого не треба.
  return card.coverAttachmentId ? { coverAttachmentId: null } : undefined;
}

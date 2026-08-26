/**
 * Назва документа для посилання, вставленого прямо в текст.
 *
 * Голий Google-URL у описі — це рядок на сто символів із самим лише
 * ідентифікатором: прочитати з нього, що всередині, неможливо. Тому посилання
 * на впізнані сервіси показуються назвою документа, а не адресою.
 *
 * Кеш тут модульний, а не в стані компонента: той самий бриф трапляється і в
 * описі, і в коментарях, і в сусідній картці, а запит має піти один раз на
 * сесію. Невдача теж кешується — інакше кожен перерендер повторював би похід
 * за назвою закритого документа.
 */

import { useEffect, useState } from 'react';
import { fetchLinkTitle } from '../api';

const cache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

function loadTitle(url: string): Promise<string | null> {
  const cached = inFlight.get(url);
  if (cached) return cached;

  const request = fetchLinkTitle(url).then(title => {
    cache.set(url, title);
    inFlight.delete(url);
    return title;
  });
  inFlight.set(url, request);
  return request;
}

/**
 * Повертає назву документа або null, поки її немає (чи не буде).
 * `enabled` вимикає запит для посилань, де назва не потрібна — наприклад для
 * звичайних сайтів, чий URL і так читабельний.
 */
export function useLinkTitle(url: string, enabled: boolean): string | null {
  const [title, setTitle] = useState<string | null>(() => (enabled ? cache.get(url) ?? null : null));

  useEffect(() => {
    if (!enabled) { setTitle(null); return; }
    if (cache.has(url)) { setTitle(cache.get(url) ?? null); return; }

    let alive = true;
    loadTitle(url).then(next => { if (alive) setTitle(next); });
    return () => { alive = false; };
  }, [url, enabled]);

  return title;
}

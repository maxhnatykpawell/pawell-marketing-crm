/**
 * Власні дані про клієнта поверх знімка з KeepInCRM.
 *
 * Модель «основа + правки»: оригінал клієнта (оборот, угоди, назва, контакти) приходить із
 * KeepInCRM і при кожній синхронізації оновлюється. Те, чого в CRM немає або що ми хочемо
 * вести самі, лежить у нашій базі окремо й НЕ затирається синхронізацією. Зараз це
 * відповідальний за клієнта: поля в KeepInCRM для цього немає.
 *
 * Відповідальний — користувач цього застосунку (з команди), а не вільний текст: так за ним
 * можна відбирати клієнтів, а після перейменування людини запис не розходиться з іменем.
 *
 * Чиста логіка без мережі й бази: clientProfile.test.ts.
 */

/** Те, що ми ведемо в себе про клієнта */
export interface ClientProfile {
  /** Користувач команди, який відповідає за клієнта; немає ключа — не призначено в нас */
  responsibleUserId?: string | null;
}

export interface ClientProfileRecord extends ClientProfile {
  updatedAt?: string;
  updatedBy?: string | null;
}

/**
 * Привести довільний ввід до профілю. Серверу тілу запиту довіряти не можна, а клієнту —
 * збереженому в базі (його міг писати хтось інший або старіша версія).
 * Усе, чого не впізнали, відкидається, а не перетворюється на «порожнього відповідального».
 */
export function sanitizeClientProfile(raw: unknown): ClientProfile {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: ClientProfile = {};
  const id = r.responsibleUserId;
  // id користувача йде в запити до бази: порожнє, задовге чи зі слешем відкидаємо
  if (typeof id === 'string' && id.trim() && id.length <= 200 && !id.includes('/') && !id.includes('..')) {
    out.responsibleUserId = id.trim();
  }
  return out;
}

export const isEmptyClientProfile = (p: ClientProfile): boolean => Object.keys(p).length === 0;

export interface ResolvedResponsible {
  /**
   *  • local      — призначено в нас (має пріоритет);
   *  • keepincrm  — у нас не призначено, але KeepInCRM віддала менеджера;
   *  • none       — ніхто не призначений.
   */
  source: 'local' | 'keepincrm' | 'none';
  /** Користувач команди (лише для local) */
  userId: string | null;
  name: string | null;
  /** Користувача вже немає в команді (звільнився, видалений) — запис лишився, ім'я невідоме */
  missing: boolean;
}

/**
 * Хто відповідає за клієнта: наше призначення, інакше те, що віддала KeepInCRM.
 *
 * @param users довідник команди: id → імʼя
 * @param keepinName імʼя менеджера з KeepInCRM, якщо воно є
 */
export function resolveResponsible(
  profile: ClientProfile | undefined,
  users: Map<string, string>,
  keepinName?: string | null,
): ResolvedResponsible {
  const id = profile?.responsibleUserId ?? null;
  if (id) {
    const name = users.get(id) ?? null;
    return { source: 'local', userId: id, name, missing: name === null };
  }
  if (keepinName) return { source: 'keepincrm', userId: null, name: keepinName, missing: false };
  return { source: 'none', userId: null, name: null, missing: false };
}

/** Фокус за відповідальним у таблиці: користувач, «без відповідального» або всі */
export type OwnerFocus = string | 'none' | null;

export const NO_OWNER = 'none';

export function matchesOwnerFocus(responsibleUserId: string | null | undefined, focus: OwnerFocus): boolean {
  if (focus === null) return true;
  if (focus === NO_OWNER) return !responsibleUserId;
  return responsibleUserId === focus;
}

/** Додати відповідального до клієнтів (лише з нашого призначення: KeepInCRM його не віддає списком) */
export function attachOwners<T extends { id: string }>(
  clients: T[], profiles: Record<string, ClientProfile>,
): (T & { responsibleUserId: string | null })[] {
  return clients.map(c => ({ ...c, responsibleUserId: profiles[c.id]?.responsibleUserId ?? null }));
}

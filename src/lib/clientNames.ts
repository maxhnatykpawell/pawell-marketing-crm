/**
 * Назва клієнта з відповіді KeepInCRM.
 *
 * Чому окремий модуль. Угоди (/agreements) приходять із вкладеним `client`, але імені
 * там може не бути: тоді в аналітиці з'являлось «Клієнт #1234» — номер замість назви.
 * Назва живе в різних полях залежно від типу клієнта (компанія чи людина) і форми
 * відповіді, тож шукаємо її у всіх відомих місцях, а не в одному.
 *
 * Чиста логіка без мережі й бази: clientNames.test.ts.
 */

/** Запасна назва, коли справжньої немає. Її ж розпізнаємо, щоб згодом підмінити. */
export const FALLBACK_NAME_PREFIX = 'Клієнт #';

export const fallbackName = (id: string): string => `${FALLBACK_NAME_PREFIX}${id}`;

export const isFallbackName = (name: unknown): boolean =>
  typeof name === 'string' && name.startsWith(FALLBACK_NAME_PREFIX);

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
};

/** «Ім'я Прізвище» з окремих частин */
function joinParts(o: any): string | null {
  if (!o || typeof o !== 'object') return null;
  const parts = [o.last_name ?? o.lastname ?? o.surname, o.first_name ?? o.firstname, o.middle_name ?? o.patronymic]
    .map(text)
    .filter((x): x is string => !!x);
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Найкраща назва з об'єкта клієнта; null — якщо ніде не знайшли.
 *
 * Порядок свідомий: спершу поля, що вже є відображуваною назвою, потім назва компанії,
 * потім людина. Номер чи пошту назвою не вважаємо.
 */
export function pickClientName(c: unknown): string | null {
  if (!c || typeof c !== 'object') return null;
  const o = c as Record<string, any>;

  // Контакти бувають масивом: беремо першого з іменем
  const contactOf = (list: unknown): string | null => {
    if (!Array.isArray(list)) return null;
    for (const c of list) {
      const n = (c && typeof c === 'object') ? (text((c as any).full_name) ?? text((c as any).name) ?? joinParts(c)) : null;
      if (n) return n;
    }
    return null;
  };

  return (
    text(o.name) ?? text(o.title) ?? text(o.full_name) ?? text(o.fullname) ?? text(o.display_name)
    ?? text(o.company_name) ?? text(o.company_title) ?? text(o.client_name) ?? text(o.person_name)
    ?? text(o.contact_name) ?? text(o.organization) ?? text(o.org_name) ?? text(o.label)
    // company / person інколи приходять не об'єктом, а просто рядком
    ?? text(o.company) ?? text(o.person)
    // Компанія
    ?? text(o.company?.name) ?? text(o.company?.title) ?? text(o.company?.full_name) ?? text(o.company?.short_name)
    // Людина
    ?? text(o.person?.full_name) ?? text(o.person?.name) ?? text(o.person?.title) ?? joinParts(o.person)
    ?? text(o.contact?.full_name) ?? text(o.contact?.name) ?? joinParts(o.contact)
    ?? text(o.primary_contact?.full_name) ?? text(o.primary_contact?.name) ?? joinParts(o.primary_contact)
    ?? contactOf(o.contacts) ?? contactOf(o.people) ?? contactOf(o.persons)
    ?? joinParts(o)
  );
}

/**
 * Підставити знайдені назви замість запасних. Клієнти зі справжньою назвою лишаються
 * як є: список імен міг бути неповним або застарілим.
 */
export function applyClientNames<T extends { id: string; name: string }>(
  clients: T[], names: Record<string, string> | null | undefined,
): T[] {
  if (!names) return clients;
  let changed = false;
  const out = clients.map(c => {
    if (!isFallbackName(c.name)) return c;
    const real = names[c.id];
    if (!real) return c;
    changed = true;
    return { ...c, name: real };
  });
  return changed ? out : clients;
}

/** Скільки клієнтів лишились без справжньої назви */
export const countFallbackNames = (clients: { name: string }[]): number =>
  clients.reduce((n, c) => n + (isFallbackName(c.name) ? 1 : 0), 0);

/**
 * Лише назви полів об'єкта (без значень) для діагностики: за ними видно, де саме API
 * тримає ім'я, не виносячи в лог персональні дані.
 */
export function describeShape(v: unknown, depth = 3): unknown {
  if (Array.isArray(v)) return v.length ? [describeShape(v[0], depth)] : [];
  if (v && typeof v === 'object') {
    if (depth <= 0) return 'object';
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, describeShape(x, depth - 1)]));
  }
  return v === null ? 'null' : typeof v;
}

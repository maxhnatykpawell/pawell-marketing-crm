/**
 * Відповідальний за клієнта і структура контактів — з відповіді KeepInCRM.
 *
 * У компанії-клієнта бувають різні люди з різними ролями (директор, технолог, закупівлі),
 * і в кожного свій номер. Для роботи з клієнтом важливо бачити саме цю структуру, а не
 * один «головний» телефон. Тому з картки клієнта витягуємо:
 *   • відповідального менеджера;
 *   • телефони й пошту самої компанії (загальні);
 *   • окремих людей: імʼя, роль, їхні телефони й пошту.
 *
 * Назви полів у відповіді CRM не задокументовані і залежать від типу клієнта, тож розбір
 * толерантний: шукає у кількох поширених місцях. Чого не знайшов — повертає порожнім, а не
 * вигадує: порожнє видно в інтерфейсі, а неправильний номер можна набрати.
 *
 * Чиста логіка без мережі: clientContacts.test.ts.
 */

import { pickClientName } from './clientNames';

export interface ContactPerson {
  name: string | null;
  /** Посада / роль: «Директор», «Технолог», «Закупівлі» */
  role: string | null;
  phones: string[];
  emails: string[];
  /** Основний контакт клієнта */
  primary: boolean;
}

export interface ResponsibleUser {
  id: string | null;
  name: string | null;
}

export interface ClientDetails {
  responsible: ResponsibleUser | null;
  /** Телефони й пошта самої компанії, не привʼязані до людини */
  companyPhones: string[];
  companyEmails: string[];
  contacts: ContactPerson[];
}

const str = (v: unknown): string | null => {
  if (typeof v === 'number' && isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t || null;
};

const digitsOf = (s: string) => s.replace(/\D/g, '');

/** Чи схоже значення на телефон: щонайменше 7 цифр і майже ніяких букв */
const looksLikePhone = (s: string): boolean => {
  const d = digitsOf(s);
  if (d.length < 7 || d.length > 15) return false;
  const letters = (s.match(/[A-Za-zА-Яа-яІіЇїЄє]/g) ?? []).length;
  return letters <= 3; // «+380 44 123-45-67 дод. 5» — ще телефон
};

// Коми, крапки з комою й двокрапки — це розділювачі в тексті, а не частина адреси
const EMAIL_RE = /[^\s@<>(),;:]+@[^\s@<>(),;:]+\.[^\s@<>(),;:]{2,}/;

/** Усі рядки з довільної форми: «0501», ["0501"], [{ number: "0501" }], { value: "0501" } */
function flatten(v: unknown, depth = 3): string[] {
  if (v == null || depth < 0) return [];
  if (typeof v === 'string' || typeof v === 'number') {
    const s = str(v);
    return s ? [s] : [];
  }
  if (Array.isArray(v)) return v.flatMap(x => flatten(x, depth - 1));
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const direct = [o.number, o.phone, o.value, o.tel, o.mobile, o.email, o.address, o.formatted]
      .map(str).filter((x): x is string => !!x);
    return direct.length > 0 ? direct : Object.values(o).flatMap(x => flatten(x, depth - 1));
  }
  return [];
}

/** Унікальні телефони (однакові цифри — той самий номер, навіть якщо записані по-різному) */
function phonesFrom(...values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values.flatMap(v => flatten(v))) {
    // В одному рядку їх може бути кілька: «050 111-22-33, 067 444-55-66»
    for (const piece of raw.split(/[;,\n]/)) {
      const p = piece.trim();
      if (!p || !looksLikePhone(p)) continue;
      const key = digitsOf(p).slice(-9);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

function emailsFrom(...values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values.flatMap(v => flatten(v))) {
    const m = raw.match(EMAIL_RE);
    if (!m) continue;
    const addr = m[0].replace(/\.+$/, ''); // «info@firm.ua.» — крапка наприкінці речення
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out;
}

function roleOf(o: Record<string, any>): string | null {
  const role = str(o.position) ?? str(o.job_title) ?? str(o.jobTitle) ?? str(o.post) ?? str(o.role) ?? str(o.job) ?? str(o.occupation);
  const dept = str(o.department) ?? str(o.division);
  if (role && dept) return `${role} · ${dept}`;
  return role ?? dept;
}

function personFrom(raw: unknown, primary: boolean): ContactPerson | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, any>;
  const phones = phonesFrom(o.phone, o.phones, o.mobile, o.cell, o.tel, o.telephone, o.work_phone, o.contact_phones);
  const emails = emailsFrom(o.email, o.emails, o.mail);
  const name = pickClientName(o);
  if (!name && phones.length === 0 && emails.length === 0) return null;
  return { name, role: roleOf(o), phones, emails, primary };
}

const PEOPLE_KEYS = ['contacts', 'people', 'persons', 'contact_persons', 'employees', 'members'] as const;
const SINGLE_KEYS = ['person', 'contact', 'primary_contact'] as const;
const RESPONSIBLE_KEYS = ['manager', 'responsible', 'responsible_user', 'owner', 'user', 'assignee', 'account_manager'] as const;
const RESPONSIBLE_ID_KEYS = ['manager_id', 'responsible_id', 'responsible_user_id', 'owner_id', 'user_id', 'assignee_id'] as const;

function responsibleFrom(o: Record<string, any>, users: Map<string, string>): ResponsibleUser | null {
  const lookup = (id: unknown): ResponsibleUser | null => {
    const key = id == null ? null : String(id);
    if (!key) return null;
    return { id: key, name: users.get(key) ?? null };
  };

  for (const k of RESPONSIBLE_KEYS) {
    const v = o[k];
    if (v == null || v === '') continue;
    if (typeof v === 'object') {
      const name = pickClientName(v);
      const id = (v as any).id != null ? String((v as any).id) : null;
      // Ім'я може бути лише в довіднику користувачів
      const resolved = name ?? (id ? users.get(id) ?? null : null);
      if (resolved || id) return { id, name: resolved };
    } else {
      // Скаляр: або ім'я, або id користувача
      const asId = lookup(v);
      if (asId?.name) return asId;
      const s = str(v);
      if (s && !/^\d+$/.test(s)) return { id: null, name: s };
      if (asId) return asId;
    }
  }
  for (const k of RESPONSIBLE_ID_KEYS) {
    const r = lookup(o[k]);
    if (r) return r;
  }
  return null;
}

/**
 * @param users довідник «id користувача → імʼя» з KeepInCRM: у картці клієнта менеджер
 *              нерідко приходить лише як id.
 */
export function normalizeClientDetails(raw: unknown, users: Map<string, string> = new Map()): ClientDetails {
  const empty: ClientDetails = { responsible: null, companyPhones: [], companyEmails: [], contacts: [] };
  if (!raw || typeof raw !== 'object') return empty;
  const o = raw as Record<string, any>;

  const contacts: ContactPerson[] = [];
  const seen = new Set<string>();
  const add = (p: ContactPerson | null) => {
    if (!p) return;
    const key = `${(p.name ?? '').toLowerCase()}|${p.phones[0] ? digitsOf(p.phones[0]).slice(-9) : p.emails[0] ?? ''}`;
    if (seen.has(key)) {
      // Той самий чоловік у двох полях: доповнюємо тим, чого бракувало
      const existing = contacts.find(c => `${(c.name ?? '').toLowerCase()}|${c.phones[0] ? digitsOf(c.phones[0]).slice(-9) : c.emails[0] ?? ''}` === key);
      if (existing) {
        existing.role ??= p.role;
        existing.primary ||= p.primary;
      }
      return;
    }
    seen.add(key);
    contacts.push(p);
  };

  for (const k of SINGLE_KEYS) add(personFrom(o[k], true));
  for (const k of PEOPLE_KEYS) {
    const list = o[k];
    if (Array.isArray(list)) list.forEach(item => add(personFrom(item, false)));
  }
  // Спершу основні, далі за алфавітом — порядок має бути передбачуваним
  contacts.sort((a, b) => Number(b.primary) - Number(a.primary) || (a.name ?? '').localeCompare(b.name ?? '', 'uk'));

  // Телефони компанії — ті, що не належать жодній людині
  const personPhones = new Set(contacts.flatMap(c => c.phones.map(p => digitsOf(p).slice(-9))));
  const personEmails = new Set(contacts.flatMap(c => c.emails.map(e => e.toLowerCase())));
  const companyPhones = phonesFrom(o.phone, o.phones, o.mobile, o.tel, o.telephone, o.contact_phones, o.company?.phone, o.company?.phones)
    .filter(p => !personPhones.has(digitsOf(p).slice(-9)));
  const companyEmails = emailsFrom(o.email, o.emails, o.mail, o.company?.email, o.company?.emails)
    .filter(e => !personEmails.has(e.toLowerCase()));

  return { responsible: responsibleFrom(o, users), companyPhones, companyEmails, contacts };
}

/** Чи знайшли хоч щось — інакше інтерфейс покаже діагностику замість порожнього блоку */
export const hasAnyDetails = (d: ClientDetails): boolean =>
  !!d.responsible || d.contacts.length > 0 || d.companyPhones.length > 0 || d.companyEmails.length > 0;

/** Для посилання tel: лишаємо цифри та «+» */
export const telHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`;

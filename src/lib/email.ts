/** Перевірка адреси пошти. Окремо від googleCalendar.ts: той тягне модулі Node, а це потрібно й браузеру. */
const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/;

export const isEmail = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v.trim());

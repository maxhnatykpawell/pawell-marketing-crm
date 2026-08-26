/**
 * Витягування назви документа зі сторінки за посиланням.
 *
 * Google не віддає назву файлу в самому URL — там лише ідентифікатор. Але
 * сторінка документа, відкритого «за посиланням», має звичайний <title>, тож
 * назву можна прочитати тим самим способом, яким її показує будь-який месенджер
 * у прев'ю. Для закритих документів Google натомість віддає сторінку входу —
 * її треба впізнати й не підставляти користувачу «Sign in» як назву файлу.
 *
 * Модуль чистий (рядок → рядок), щоб логіка перевірялась без мережі; сам запит
 * робить сервер (див. /api/link-title) — з браузера його блокує CORS.
 */

/** Максимум, який має сенс читати: <title> завжди в перших кілобайтах <head>. */
export const TITLE_FETCH_LIMIT = 256 * 1024;

const TITLE_TAG = /<title[^>]*>([\s\S]*?)<\/title>/i;
const OG_TITLE = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i;
const OG_TITLE_REVERSED = /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i;

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&amp;/g, '&');
}

/** Читає назву сторінки з HTML: спершу og:title, далі звичайний <title>. */
export function extractTitle(html: string): string | null {
  const match = OG_TITLE.exec(html) || OG_TITLE_REVERSED.exec(html) || TITLE_TAG.exec(html);
  if (!match) return null;
  const title = decodeEntities(match[1]).replace(/\s+/g, ' ').trim();
  return title || null;
}

/**
 * Прибирає хвіст сервісу: «Бюджет Q3 - Google Sheets» → «Бюджет Q3».
 * Локаль сторінки залежить від того, що віддасть Google, тож знімаємо і
 * англійські, і українські назви застосунків.
 */
export function stripServiceSuffix(title: string): string {
  const suffix = /\s*[-–—|]\s*(Google\s+(Docs|Sheets|Slides|Drive|Forms|Drawings|Документи|Таблиці|Презентації|Диск|Форми|Малюнки)|Google)\s*$/i;
  const cleaned = title.replace(suffix, '').trim();
  return cleaned || title.trim();
}

/**
 * Чи це насправді не назва документа, а сторінка входу / запиту доступу.
 *
 * Підставити «Sign in - Google Accounts» назвою вкладення гірше, ніж не
 * підставити нічого: людина збереже картку й не помітить, що назва фальшива.
 */
export function isAccessWall(title: string, finalUrl?: string): boolean {
  if (finalUrl) {
    try {
      const host = new URL(finalUrl).hostname;
      if (host === 'accounts.google.com' || host.endsWith('.accounts.google.com')) return true;
    } catch { /* некоректний URL — вирішуємо за назвою */ }
  }
  return /^(sign in|log in|увійти|увійдіть|вхід)\b|google accounts|облікові записи google|request access|запит доступу|немає доступу|access denied|error 40\d|not found/i
    .test(title.trim());
}

/** Повний шлях: HTML сторінки → назва документа (або null, якщо її там немає). */
export function titleFromHtml(html: string, finalUrl?: string): string | null {
  const raw = extractTitle(html);
  if (!raw) return null;
  if (isAccessWall(raw, finalUrl)) return null;
  const title = stripServiceSuffix(raw);
  // «Untitled document» — це не назва, а її відсутність
  if (/^(untitled (document|spreadsheet|presentation|form)|документ без назви|без назви)$/i.test(title)) return null;
  return title || null;
}

/* ───────────────────────── захист від SSRF ───────────────────────── */

/**
 * Внутрішні адреси, які сервер не має ходити за чужим бажанням.
 *
 * Ендпойнт бере URL з поля вводу, тож без цієї перевірки будь-хто з команди
 * міг би змусити сервер постукати у внутрішню мережу чи до метаданих хмари й
 * побачити відповідь у полі «назва».
 */
export function isPrivateAddress(address: string): boolean {
  const ip = address.trim().toLowerCase().replace(/^\[|\]$/g, '');

  if (ip === 'localhost' || ip.endsWith('.localhost')) return true;
  if (ip === '::1' || ip === '::' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  // IPv4, загорнутий в IPv6: ::ffff:127.0.0.1
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  const v4 = mapped ? mapped[1] : ip;

  const octets = v4.split('.');
  if (octets.length !== 4 || octets.some(o => !/^\d{1,3}$/.test(o))) return false;
  const [a, b] = octets.map(Number);
  if (octets.map(Number).some(n => n > 255)) return false;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;              // метадані хмарних провайдерів
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;    // CGNAT
  return false;
}

/** Чи дозволено ходити за цим посиланням із сервера. */
export function isFetchableUrl(rawUrl: string): boolean {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (!parsed.hostname) return false;
  if (isPrivateAddress(parsed.hostname)) return false;
  return true;
}

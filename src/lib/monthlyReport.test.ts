import {
  monthLabel, monthLabelIn, shiftMonth, currentMonth, lastClosedMonth, monthBounds,
  firstActiveMonth, availableMonths, hasMonthlyStats,
  computeMonthTotals, buildTrend, computeMovements, topClients,
  delta, formatPct, computeMonthSpend, monthlyReportToCsv, buildMonthlyReport, summarizeMonth,
} from './monthlyReport';
import { ClientRecord } from './clientAnalytics';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

/** Клієнт із помісячними сумами: { '2026-07': [дохід, угоди] } */
const client = (
  id: string,
  months: Record<string, [number, number]>,
  name = `Клієнт ${id}`,
): ClientRecord => {
  const monthlyStats = Object.fromEntries(
    Object.entries(months).map(([m, [revenue, deals]]) => [m, { revenue, deals }]),
  );
  const revenue = Object.values(monthlyStats).reduce((s, x) => s + x.revenue, 0);
  const agreementsCount = Object.values(monthlyStats).reduce((s, x) => s + x.deals, 0);
  return { id, name, revenue, agreementsCount, tags: [], monthlyStats };
};

console.log('\nМісяці');
{
  check('назва місяця', monthLabel('2026-08'), 'Серпень 2026');
  check('місцевий відмінок', monthLabelIn('2026-07'), 'липні 2026');
  check('сміття лишається як є', monthLabel('нема'), 'нема');
  check('зсув через рік назад', shiftMonth('2026-01', -1), '2025-12');
  check('зсув через рік вперед', shiftMonth('2025-12', 1), '2026-01');
  check('зсув на рік', shiftMonth('2026-08', -12), '2025-08');
  check('нульовий зсув', shiftMonth('2026-08', 0), '2026-08');
  check('поточний місяць', currentMonth(new Date('2026-03-15T10:00:00')), '2026-03');
  // Звіт за 3 число виглядав би обвалом, тому за замовчуванням — закритий місяць
  check('останній закритий', lastClosedMonth(new Date('2026-01-03T10:00:00')), '2025-12');
  check('межі місяця', monthBounds('2026-08'), { from: '2026-08-01', to: '2026-08-31' });
  check('лютий у високосному', monthBounds('2024-02'), { from: '2024-02-01', to: '2024-02-29' });
  check('лютий у звичайному', monthBounds('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
}

console.log('\nПерша активність');
{
  // Порожній місяць у monthlyStats не робить клієнта постійним
  check('порожні місяці не рахуються',
    firstActiveMonth(client('a', { '2026-05': [0, 0], '2026-07': [100, 1] })), '2026-07');
  check('немає активності — null', firstActiveMonth(client('b', { '2026-05': [0, 0] })), null);
  check('старий формат бере перелік місяців',
    firstActiveMonth({ id: 'c', name: 'C', revenue: 10, agreementsCount: 1, tags: [], purchaseMonths: ['2026-04', '2026-02'] }),
    '2026-02');
}

console.log('\nДоступні місяці');
{
  const data = [
    client('a', { '2026-06': [100, 1], '2026-08': [200, 1] }),
    client('b', { '2026-07': [50, 1], '2026-09': [0, 0] }),
  ];
  check('від найновішого, без порожніх', availableMonths(data), ['2026-08', '2026-07', '2026-06']);
  check('є суми по місяцях', hasMonthlyStats(data), true);
  check('старий формат — сум немає',
    hasMonthlyStats([{ id: 'x', name: 'X', revenue: 1, agreementsCount: 1, tags: [], purchaseMonths: ['2026-01'] }]),
    false);
}

// ── Основна вибірка для показників і руху ────────────────────────────────────
// Серпень: постійний (купував з червня), новий, повернувся (був у червні,
// у липні тиші), і той, хто відпав після липня.
const DATA: ClientRecord[] = [
  client('keep',  { '2026-06': [1000, 1], '2026-07': [2000, 2], '2026-08': [3000, 2] }, 'Тримається'),
  client('fresh', { '2026-08': [1500, 1] }, 'Новачок'),
  client('back',  { '2026-06': [500, 1], '2026-08': [900, 1] }, 'Повернувся'),
  client('gone',  { '2026-05': [400, 1], '2026-07': [800, 2] }, 'Відпав'),
];

console.log('\nПоказники місяця');
{
  const t = computeMonthTotals(DATA, '2026-08');
  check('дохід', t.revenue, 5400);
  check('угоди', t.deals, 4);
  check('активні клієнти', t.clients, 3);
  check('середній чек', t.avgCheck, 1350);
  check('дохід на клієнта', t.arpu, 1800);
  check('нових клієнтів', t.newClients, 1);
  check('дохід нових', t.newRevenue, 1500);
  check('постійних клієнтів', t.returningClients, 2);
  check('дохід постійних', t.returningRevenue, 3900);
  check('нові + постійні = разом', t.newRevenue + t.returningRevenue, t.revenue);

  const july = computeMonthTotals(DATA, '2026-07');
  check('липень: дохід', july.revenue, 2800);
  check('липень: усі постійні', july.newClients, 0);

  const empty = computeMonthTotals(DATA, '2026-09');
  check('порожній місяць не ділить на нуль', [empty.avgCheck, empty.arpu], [0, 0]);
  check('порожній місяць — нуль клієнтів', empty.clients, 0);
}

console.log('\nРух клієнтів');
{
  const m = computeMovements(DATA, '2026-08');
  const ids = (k: keyof typeof m) => m[k].clients.map(c => c.id);

  check('новий', ids('new'), ['fresh']);
  check('залишився', ids('kept'), ['keep']);
  check('повернувся після паузи', ids('reactivated'), ['back']);
  check('перестав купувати', ids('lost'), ['gone']);

  check('дохід групи «залишились»', m.kept.revenue, 3000);
  // Для втрачених у групі лежить те, що вони давали МИНУЛОГО місяця: саме це втрата
  check('втрата рахується минулим місяцем', m.lost.revenue, 800);
  check('зміна доходу того, хто лишився', m.kept.clients[0].delta, 1000);
  check('у втраченого зміна від\'ємна', m.lost.clients[0].delta, -800);
  check('у нового попереднього місяця немає', m.new.clients[0].prevRevenue, 0);

  // Клієнт, неактивний в обох місяцях, у рух не потрапляє взагалі
  const quiet = computeMovements([...DATA, client('old', { '2025-01': [100, 1] })], '2026-08');
  check('давно неактивний не рахується втратою', quiet.lost.clients.map(c => c.id), ['gone']);
}

console.log('\nНайбільші клієнти');
{
  const top = topClients(DATA, '2026-08');
  check('порядок за доходом місяця', top.map(c => c.id), ['keep', 'fresh', 'back']);
  check('втрачених у топі немає', top.some(c => c.kind === 'lost'), false);
  check('видно й попередній місяць', top[0].prevRevenue, 2000);
  check('ліміт ріже хвіст', topClients(DATA, '2026-08', 2).map(c => c.id), ['keep', 'fresh']);
}

console.log('\nТренд');
{
  const trend = buildTrend(DATA, '2026-08', 4);
  check('стільки місяців, скільки просили', trend.length, 4);
  check('за зростанням, закінчується звітним', trend.map(t => t.month), ['2026-05', '2026-06', '2026-07', '2026-08']);
  check('дохід по місяцях', trend.map(t => t.revenue), [400, 1500, 2800, 5400]);
}

console.log('\nЗміни');
{
  check('приріст', delta(120, 100), { current: 120, base: 100, diff: 20, pct: 20 });
  check('падіння', delta(80, 100).pct, -20);
  // Відсоток від нуля не визначений, і підставляти 100 % не можна
  check('нульова база — відсотка немає', delta(50, 0).pct, null);
  check('нуль проти нуля', delta(0, 0), { current: 0, base: 0, diff: 0, pct: null });
}

console.log('\nВідсоток зі знаком');
{
  check('приріст зі знаком', formatPct(12.34), '+12.3 %');
  check('падіння справжнім мінусом', formatPct(-8), '−8 %');
  check('нуль — теж плюс', formatPct(0), '+0 %');
  // Відсотка немає — прочерк, бо будь-яке число тут читач порівняє з сусідніми
  check('невизначений — прочерк', formatPct(null), '—');
}

console.log('\nГроші місяця');
{
  const expenses = [
    { amount: 10000, currency: 'UAH', category: 'Реклама', date: '2026-08-05' },
    { amount: 2000,  currency: 'UAH', category: 'Інструменти', date: '2026-08-20' },
    { amount: 5000,  currency: 'UAH', category: 'Реклама', date: '2026-07-10' },
    // Поза місяцем — не має потрапити нікуди
    { amount: 9999,  currency: 'UAH', category: 'Реклама', date: '2026-09-01' },
  ];
  const rates = { USD: 40, EUR: 45 };
  const aug = computeMonthTotals(DATA, '2026-08');
  const jul = computeMonthTotals(DATA, '2026-07');
  const s = computeMonthSpend(expenses, '2026-08', aug, jul, rates);

  check('усі витрати місяця', s.total, 12000);
  check('лише реклама', s.ads, 10000);
  check('минулий місяць', s.prevAds, 5000);
  check('категорії за спаданням', s.byCategory.map(c => c.category), ['Реклама', 'Інструменти']);
  // Нових клієнтів у серпні один — уся реклама місяця пішла на нього
  check('CAC за рекламою', s.cac, 10000);
  check('blended CAC — усі витрати', s.blendedCac, 12000);
  // У липні нових клієнтів не було, тож CAC минулого місяця не існує
  check('CAC без нових клієнтів не рахується', s.prevCac, null);
  check('зміни CAC немає, коли нема з чим порівняти', s.cacChange, null);
  check('дохід на 1 ₴ витрат', s.revenuePerSpend, 0.5);
  check('ДРВ', s.adShare, 185.2);
  check('валюта лише гривня', s.hasForeign, false);

  const empty = computeMonthSpend([], '2026-08', aug, jul, rates);
  check('без витрат — нуль записів', empty.count, 0);
  check('без витрат CAC невідомий', empty.cac, null);
  check('без витрат дохід на гривню не рахується', empty.revenuePerSpend, null);
}

console.log('\nЗвіт');
{
  const r = buildMonthlyReport(DATA, '2026-08', { trendMonths: 3, topLimit: 5 });
  check('звітний місяць', r.month, '2026-08');
  check('база порівняння', r.prevMonth, '2026-07');
  check('той самий місяць рік тому', r.yearAgoMonth, '2025-08');
  check('даних за рік тому немає', r.hasYearAgo, false);
  check('дохід звітного', r.totals.revenue, 5400);
  check('дохід базового', r.prevTotals.revenue, 2800);
  check('тренд обрізано до трьох', r.trend.length, 3);
  check('топ порахований', r.top.length, 3);
  check('клієнтів у базі', r.totalClients, 4);
  check('суми по місяцях є', r.hasMonthlyStats, true);

  const lines = summarizeMonth(r);
  check('підсумок не порожній', lines.length > 0, true);
  // Пробіл у 5 400 — той, який ставить toLocaleString('uk-UA'), а не звичайний
  check('перший рядок про дохід', lines[0].startsWith(`Дохід ${(5400).toLocaleString('uk-UA')} ₴`), true);
  check('видно напрямок зміни', lines[0].includes('більше'), true);
  check('порівняння з попереднім місяцем', lines[0].includes('липні 2026'), true);
  check('є рядок про рух клієнтів', lines.some(l => l.startsWith('Рух клієнтів')), true);
  check('названо найбільшого клієнта', lines.some(l => l.includes('Тримається')), true);
  check('без даних рік тому рядка про рік немає', lines.some(l => l.startsWith('Рік тому')), false);

  // Місяць без жодної угоди має давати звіт, а не порожнечу з NaN
  const emptyReport = buildMonthlyReport(DATA, '2026-12');
  check('порожній місяць: один рядок підсумку', summarizeMonth(emptyReport).length, 1);
  check('порожній місяць: так і написано',
    summarizeMonth(emptyReport)[0].includes('немає жодної угоди'), true);

  // Знімок старого формату: сум по місяцях немає, звіт має це показати, а не збрехати
  const oldFormat = buildMonthlyReport(
    [{ id: 'o', name: 'O', revenue: 100, agreementsCount: 1, tags: [], purchaseMonths: ['2026-08'] }],
    '2026-08',
  );
  check('старий формат: звіт неможливий', oldFormat.hasMonthlyStats, false);
  check('старий формат: нулі, а не помилка', oldFormat.totals.revenue, 0);
}

console.log('\nВивантаження CSV');
{
  const csv = monthlyReportToCsv(buildMonthlyReport(DATA, '2026-08'));
  const lines = csv.split('\r\n');
  check('шапка з місяцями в назвах колонок', lines[0].includes('Дохід 2026-08;Угод 2026-08'), true);
  // Усі чотири клієнти, включно з тим, хто відпав: по них і дзвонять
  check('рядок на кожного клієнта руху', lines.length, 5);
  check('втрачений теж у файлі', lines.some(l => l.startsWith('Відпав;Перестали купувати')), true);
  check('зміна доходу від\'ємна у втраченого', lines.find(l => l.startsWith('Відпав'))?.endsWith('-800;2026-05'), true);
  check('роздільник — крапка з комою', lines[1].split(';').length, 9);
}

console.log('\nПорівняння рік до року');
{
  const withYear = [...DATA, client('year', { '2025-08': [1000, 1], '2026-08': [1200, 1] }, 'Рік тому')];
  const r = buildMonthlyReport(withYear, '2026-08');
  check('дані рік тому знайдено', r.hasYearAgo, true);
  check('дохід рік тому', r.yearAgoTotals.revenue, 1000);
  check('рядок про рік з’явився', summarizeMonth(r).some(l => l.startsWith('Рік тому')), true);
}

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);

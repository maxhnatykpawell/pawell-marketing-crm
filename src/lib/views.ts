/**
 * Перелік розділів системи — єдине джерело правди про доступи.
 *
 * Раніше цей список існував у чотирьох копіях: двічі в адмінських панелях і
 * двічі в App.tsx, плюс окремо в асистента. Через це «Витрати» просто не було в
 * налаштуваннях прав — розділ існував, а видати до нього доступ було нічим.
 * Будь-який новий розділ мав ту саму долю, поки хтось не згадає про всі копії.
 *
 * Тепер розділ додається сюди — і одразу з'являється і в меню, і в правах, і в
 * перевірках асистента.
 */

export interface ViewDef {
  id: string;
  label: string;
  /**
   * Доступний завжди й не питає дозволу: власний профіль і чат. Такі розділи
   * не показуються серед прапорців, бо прапорець, який ні на що не впливає,
   * гірший за його відсутність.
   */
  always?: boolean;
  /**
   * Розділ із чутливими даними: видно те, що стосується всього відділу, а не
   * лише самої людини. Права на нього не даються за замовчуванням.
   */
  sensitive?: boolean;
  /** Що саме відкриється — показуємо адміну поруч із прапорцем */
  hint?: string;
}

export const VIEWS: ViewDef[] = [
  { id: 'dashboard',   label: 'Головна' },
  { id: 'projects',    label: 'Проєкти' },
  { id: 'processes',   label: 'Процеси' },
  { id: 'board',       label: 'Дошка' },
  { id: 'content',     label: 'Контент-план' },
  { id: 'events',      label: 'Події' },
  { id: 'calendar',    label: 'Календар' },
  { id: 'regulations', label: 'Регламенти' },
  {
    id: 'payroll',
    label: 'Зарплати',
    hint: 'Кожен бачить лише власну відомість; адмін — усі',
  },
  {
    id: 'expenses',
    label: 'Витрати',
    sensitive: true,
    hint: 'Увесь бюджет відділу, суми по джерелах і CAC на головній',
  },
  { id: 'profile', label: 'Мій профіль', always: true },
  { id: 'chat',    label: 'Чат',         always: true },
];

/** Розділи, які адмін роздає прапорцями */
export const GRANTABLE_VIEWS = VIEWS.filter(v => !v.always);

/** Розділи, доступні кожному без окремого дозволу */
export const ALWAYS_ALLOWED_VIEWS = VIEWS.filter(v => v.always).map(v => v.id);

/** Усі розділи — саме стільки має адміністратор */
export const ALL_VIEW_IDS = VIEWS.map(v => v.id);

/**
 * Що отримує звичайний учасник, поки йому не налаштували права окремо.
 *
 * Витрат тут немає навмисно: бюджет відділу — не те, що має відкриватись саме
 * собою. Адмін видає його свідомо, галочкою.
 */
export const DEFAULT_ALLOWED_VIEWS = VIEWS
  .filter(v => !v.sensitive)
  .map(v => v.id);

/**
 * Чи має право бачити розділ.
 *
 * Єдине місце, де це вирішується. Адмін бачить усе; решта — те, що видали,
 * плюс завжди доступні розділи. `event-details`, `gantt` і `analytics` — не
 * окремі права, а сторінки всередині «Подій», «Проєктів» і «Головної», тож і
 * права на них ті самі.
 *
 * Аналітика навмисно не має власного прапорця: ці числа й раніше відкривались
 * карткою LTV на головній. Окреме право означало б, що після оновлення розділ
 * зник у всіх, кому права вже налаштували вручну, — а він не новий, він лише
 * переїхав з модального вікна на власну вкладку.
 */
export function canViewSection(
  view: string,
  allowedViews: string[],
  role: string | undefined,
): boolean {
  if (role === 'admin') return true;
  if (ALWAYS_ALLOWED_VIEWS.includes(view)) return true;
  if (view === 'event-details') return allowedViews.includes('events');
  if (view === 'gantt') return allowedViews.includes('projects');
  if (view === 'analytics') return allowedViews.includes('dashboard');
  return allowedViews.includes(view);
}

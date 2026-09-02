import type { RfmThresholds } from './lib/clientAnalytics';

export type { RfmThresholds };

export interface ScheduledAnnouncement {
  id: string;
  label: string;
  text: string;
  time: string;
  days: number[];
  enabled: boolean;
  createdAt: string;
}

// ── Чат ───────────────────────────────────────────────────────────────────────

/**
 * Канал і особисте листування — одна й та сама сутність, різна лише видимість.
 * Завдяки цьому вся логіка (надсилання, непрочитане, згадки) написана один раз.
 */
export type ChatConversationKind = 'channel' | 'dm';

export interface ChatConversation {
  id: string;
  kind: ChatConversationKind;
  /** Назва каналу. Для особистих порожня — показуємо ім'я співрозмовника */
  title: string;
  /** null = канал відкритий усій команді; для особистих — рівно два id */
  memberIds: string[] | null;
  createdBy: string;
  createdAt: string;
  archived?: boolean;
  /** Оновлюються при кожному повідомленні — з них будується список розмов */
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastMessageAuthorId?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  authorId: string;
  text: string;
  createdAt: string;
  editedAt?: string;
  /**
   * Видалене повідомлення лишається рядком-заглушкою: прибрати його зовсім
   * означало б розірвати нитку розмови там, де на нього відповідали.
   */
  deletedAt?: string;
  /** id користувачів, згаданих через @ — за ними йдуть сповіщення */
  mentions?: string[];
}

/** Розмова в тому вигляді, в якому її віддає сервер конкретній людині */
export interface ChatConversationView extends ChatConversation {
  unread: number;
  /** Для особистих — з ким саме розмова */
  peerId?: string | null;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  cardId?: string;   // for direct navigation
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationTemplates {
  taskAssigned: string;      // Змінні: {{taskTitle}}, {{assigneeName}}, {{deadline}}, {{projectName}}
  taskOverdue: string;       // Змінні: {{taskTitle}}, {{deadline}}, {{daysOverdue}}
  dailyDigestHeader: string; // Шапка щоденного дайджесту
  dailyDigestItem: string;   // Рядок задачі: {{taskTitle}}, {{deadline}}
}

export interface PersonalNotificationSettings {
  enabled: boolean;
  notifyOnAssign: boolean;
  notifyOnOverdue: boolean;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;  // "HH:mm"
  templates: NotificationTemplates;
}

export interface AccessRights {
  canEdit: boolean;
  allowedViews: string[];
}

export interface UserGroup {
  id: string;
  name: string;
  rights: AccessRights;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Metric {
  id: string;
  title: string;
  value: string;
  trend?: string;
  trendPositive?: boolean;
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  role?: string;
  email?: string;
  operationalDuties?: string;
  weeklySchedule?: Record<string, string>;
  goals?: string;
  groupId?: string | null;
  customRights?: AccessRights | null;
  telegramChatId?: string | null;
}

export interface AuthUser {
  userId: string;
  email: string;
  role: 'admin' | 'member';
  name: string;
  avatar: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  assigneeId?: string | null;
  /** Початок роботи — друга межа смужки на діаграмі Ганта */
  startDate?: string | null;
  deadline?: string | null;
}

export interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  /**
   * 'link' — зовнішній файл (Google Docs/Sheets/Drive…), 'file' — завантажений
   * у наше сховище. Поле необов'язкове: у старих вкладень його немає, і вони
   * читаються як 'file'.
   */
  kind?: 'file' | 'link';
  /** Коли додали посилання — для файлів це є в метаданих сховища. */
  addedAt?: string;
}

export interface Card {
  id: string;
  listId: string;
  title: string;
  description: string;
  /** Початок роботи; разом із deadline дає смужку на діаграмі Ганта */
  startDate?: string | null;
  deadline: string | null;
  assigneeId: string | null;
  isCompleted?: boolean;
  subtasks: Subtask[];
  comments: Comment[];
  attachments: Attachment[];
  tagIds?: string[];
  order: number;
  projectId?: string | null;
  estimatedMinutes?: number;
  storyPoints?: number;
}

export interface List {
  id: string;
  title: string;
  order: number;
  boardId?: string;
  excludeFromAI?: boolean;
}

export interface ContentPlanItem {
  id: string;
  focus: string;
  channel: string;
  channels?: string[];
  description: string;
  assigneeId: string | null;
  status: string;
  tagIds?: string[];
  publishDate: string | null;
  engagement: string;
}

export interface ContentPlanColumn {
  id: string;
  title: string;
  visible: boolean;
}

export interface ContentPlanChannel {
  name: string;
  color: string;
}

export interface EventItem {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  assigneeIds: string[];
  websiteUrl: string;
  location?: string;
  boothInfo?: string;
  goals?: string;
  logisticsNotes?: string;
  detailedNotes?: string;
}

export interface BoardItem {
  id: string;
  title: string;
}

export type ProjectStatus = 'planning' | 'active' | 'on-hold' | 'completed';

export interface Project {
  id: string;
  title: string;
  description?: string;
  color: string;
  status: ProjectStatus;
  managerIds: string[];
  deadline?: string | null;
  createdAt: string;
  groupName?: string | null;
  processId?: string | null;
  currentProcessNodeId?: string | null;
  activeProcessNodeIds?: string[];
  processEntryDates?: Record<string, string>;
  completedRequirements?: Record<string, boolean>;
}

export interface ProcessRequirement {
  id: string;
  label: string;
  department?: string;
  type: 'checkbox';
}

export interface ProcessNodeData extends Record<string, unknown> {
  label: string;
  timeLimitDays?: number;
  requirements: ProcessRequirement[];
}

export interface ProcessNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: ProcessNodeData;
}

export interface ProcessEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface Process {
  id: string;
  title: string;
  nodes: ProcessNode[];
  edges: ProcessEdge[];
  createdAt: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: 'UAH' | 'USD' | 'EUR';
  category: string;
  source?: string;     // джерело витрати (Meta Ads, Google Ads тощо)
  date: string;        // YYYY-MM-DD
  createdBy: string;   // userId
  note?: string;
  createdAt: string;
}

export interface AppState {
  users: User[];
  userGroups?: UserGroup[];
  metrics?: Metric[];
  boards?: BoardItem[];
  lists: List[];
  cards: Card[];
  tags: Tag[];
  contentPlans: ContentPlanItem[];
  contentPlanChannels?: (string | ContentPlanChannel)[];
  contentPlanStatuses?: string[];
  contentPlanColumns?: ContentPlanColumn[];
  events?: EventItem[];
  projects?: Project[];
  processes?: Process[];
  aiReportSchedule?: string;
  announcements?: ScheduledAnnouncement[];
  personalNotifications?: PersonalNotificationSettings;
  notifications?: NotificationItem[];
  expenses?: Expense[];
  expenseCategories?: string[];
  expenseSources?: string[];
  /**
   * Курси валют для зведення витрат до гривні (скільки грн за 1 одиницю).
   * Потрібні CAC на головній: без них витрата в $100 і в 100 ₴ важили б однаково.
   */
  currencyRates?: { USD: number; EUR: number };
  lastModified?: string;
  keepincrm?: KeepInCRMSnapshot;
  payrolls?: PayrollDocument[];
  payrollSettings?: PayrollSettings;
  /**
   * Пороги сегментації клієнтів у розширеній аналітиці.
   *
   * Живуть у спільному стані, а не в localStorage: якщо кожен матиме свої
   * пороги, на спільній зустрічі «у нас 40 чемпіонів» і «у нас 12» будуть
   * однаково правдиві, і розмову про стратегію доведеться починати з того,
   * чиї числа правильні.
   */
  rfmThresholds?: RfmThresholds;
}

// ── Payroll Integration Types ───────────────────────────────────────────────

import type { PayrollTemplate, PayrollAssignment } from './lib/payrollEngine';

export type {
  PayrollTemplate,
  PayrollAssignment,
  PayrollModule,
  PayrollModuleKind,
  PayrollModuleRole,
  PayrollSection,
  PayrollTier,
} from './lib/payrollEngine';

export type PayrollFieldType = 'fixed' | 'multiplier' | 'percentage';

export interface CustomPayrollField {
  id: string;
  label: string;
  type?: PayrollFieldType; // 'fixed' is default for backwards compatibility
  
  // For 'multiplier' type
  multiplierRate?: number;
  multiplierUnit?: string;
  
  // For 'percentage' type
  percentRate?: number;
}

export interface PayrollUserProfile {
  customBonuses: CustomPayrollField[];
  customDeductions: CustomPayrollField[];
}

export interface PayrollSettings {
  labels: {
    baseSalary: string;
    workingDaysInMonth: string;
    salaryPerDay: string;
    salaryPerHour: string;
    workedDays: string;
    paidVacationDays: string;
    overtimeHours: string;
    businessTripDays: string;
    teamBonus: string;
    additionalActivity: string;
    sum: string;
    tax: string;
    amountReceived: string;
    companyDebts: string;
    balance: string;
  };
  customBonuses: CustomPayrollField[];
  customDeductions: CustomPayrollField[];
  /** Per-user overrides for custom bonuses/deductions */
  userProfiles?: Record<string, PayrollUserProfile>;

  /**
   * Модульна система: шаблони посад. Кожна посада описує свої КПІ набором
   * модулів, тому додати нову не означає правити код.
   */
  templates?: PayrollTemplate[];
  /** userId → шаблон посади плюс індивідуальні правки поверх нього */
  assignments?: Record<string, PayrollAssignment>;
}

export interface PayrollDocument {
  id: string;
  userId: string;
  period: string; // YYYY-MM

  /** Шаблон, за яким створено документ */
  templateId?: string;
  /**
   * Знімок шаблону на момент створення документа.
   *
   * Зарплатний документ — це фінансовий факт: якщо в жовтні ставка за лід
   * була 150 ₴, зміна шаблону в грудні не має переписувати жовтневу виплату.
   * Тому документ рахується за власним знімком, а не за поточним шаблоном.
   */
  templateSnapshot?: PayrollTemplate;
  /** Введені числа за ключем модуля */
  values?: Record<string, number>;

  // ── Спадщина: документи, створені до модульної системи ─────────────────────
  // Читаються через payrollTemplates.legacyDocumentView() і лишаються
  // валідними; нові документи цих полів не заповнюють.
  baseSalary?: number;
  workingDaysInMonth?: number;
  workedDays?: number;
  paidVacationDays?: number;
  overtimeHours?: number;
  businessTripDays?: number;
  teamBonusPercent?: number;
  additionalActivity?: number;
  customBonusesValues?: Record<string, number>;
  taxPercent?: number;
  amountReceived?: number;
  companyDebts?: number;
  customDeductionsValues?: Record<string, number>;

  createdAt: string;
}


// ── KeepInCRM Integration Types ───────────────────────────────────────────────

export interface KeepInCRMSourceStat {
  source: string;   // назва джерела
  count: number;    // кількість за день
}

export interface KeepInCRMAgreementStat {
  source: string;
  count: number;
  totalSum: number;
}

export interface KeepInCRMSnapshot {
  /** Дата, за яку знято зріз (ISO-рядок, тільки дата: 2026-07-20) */
  date: string;
  /** Записи когорти, що досі лишаються лідами, по джерелах */
  leadsToday: KeepInCRMSourceStat[];
  /** Записи когорти, що вже стали клієнтами, по джерелах */
  clientsToday: KeepInCRMSourceStat[];
  /**
   * Скільки всього записів залучено цього дня (ліди + клієнти) — знаменник конверсії.
   * Відсутнє у знімках, знятих до переходу на когортну модель.
   */
  totalAcquiredToday?: number;
  /** Скільки із залучених цього дня досі лишаються лідами */
  totalLeadsToday: number;
  /** Скільки із залучених цього дня вже стали клієнтами */
  totalClientsToday: number;
  /**
   * Когортна конверсія: totalClientsToday / totalAcquiredToday (0–100 %).
   * «Яка частка залучених у цей день стала клієнтами» — станом на lastSyncedAt.
   */
  conversionRateToday: number;
  /** Угоди за поточний день по джерелах */
  agreementsToday?: KeepInCRMAgreementStat[];
  /** Загальна кількість угод за день */
  totalAgreementsToday?: number;
  /** Загальна сума угод за день */
  totalAgreementsSumToday?: number;
  /** Час останньої синхронізації */
  lastSyncedAt: string;
  /** Помилка останньої синхронізації (якщо є) */
  lastSyncError?: string;
}

/** Агреговані показники за довільний період */
export interface KeepInCRMPeriodAggregated {
  totalAcquired: number;                   // усі залучені за період (ліди + клієнти)
  totalLeads: number;                      // з них досі лишаються лідами
  totalClients: number;                    // з них стали клієнтами
  avgConversionRate: number;               // когортна конверсія: totalClients / totalAcquired
  totalAgreements?: number;
  totalAgreementsSum?: number;
  acquiredBySource: KeepInCRMSourceStat[]; // усі залучені по джерелу за період
  leadsBySource: KeepInCRMSourceStat[];    // з них досі ліди
  clientsBySource: KeepInCRMSourceStat[];  // з них конвертувались
  agreementsBySource?: KeepInCRMAgreementStat[];
}

/** Порівняння поточного і попереднього еквівалентного периоду */
export interface KeepInCRMComparison {
  totalAcquired: number;
  totalLeads: number;
  totalClients: number;
  avgConversionRate: number;
  /**
   * % зміни відносно попереднього періоду (позитивне = ріст).
   * null, коли база нульова — відсоток від нуля не визначений.
   */
  acquiredChange: number | null;
  leadsChange: number | null;
  clientsChange: number | null;
  conversionChange: number | null;
  agreementsChange?: number | null;
  agreementsSumChange?: number | null;
}

/** Відповідь /api/keepincrm/history */
export interface KeepInCRMHistoryResponse {
  entries: KeepInCRMSnapshot[];            // знімки по дням
  period: { from: string; to: string };   // YYYY-MM-DD
  aggregated: KeepInCRMPeriodAggregated;
  comparison: KeepInCRMComparison | null; // null якщо порівняння не запитувалось
}

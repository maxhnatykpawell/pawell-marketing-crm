export interface ScheduledAnnouncement {
  id: string;
  label: string;
  text: string;
  time: string;
  days: number[];
  enabled: boolean;
  createdAt: string;
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
}

export interface Card {
  id: string;
  listId: string;
  title: string;
  description: string;
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
  lastModified?: string;
  keepincrm?: KeepInCRMSnapshot;
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
  /** Ліди за поточний день по джерелах */
  leadsToday: KeepInCRMSourceStat[];
  /** Клієнти (контрагенти) за поточний день по джерелах */
  clientsToday: KeepInCRMSourceStat[];
  /** Загальна кількість лідів за день */
  totalLeadsToday: number;
  /** Загальна кількість клієнтів за день */
  totalClientsToday: number;
  /** Конверсія лід → клієнт за день (0–100 %) */
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
  totalLeads: number;
  totalClients: number;
  avgConversionRate: number;               // середній % конверсії по дням
  totalAgreements?: number;
  totalAgreementsSum?: number;
  leadsBySource: KeepInCRMSourceStat[];    // зведені по джерелу за весь період
  clientsBySource: KeepInCRMSourceStat[];
  agreementsBySource?: KeepInCRMAgreementStat[];
}

/** Порівняння поточного і попереднього еквівалентного периоду */
export interface KeepInCRMComparison {
  totalLeads: number;
  totalClients: number;
  avgConversionRate: number;
  leadsChange: number;       // % зміна (позитивне = ріст)
  clientsChange: number;
  conversionChange: number;
  agreementsChange?: number;
  agreementsSumChange?: number;
}

/** Відповідь /api/keepincrm/history */
export interface KeepInCRMHistoryResponse {
  entries: KeepInCRMSnapshot[];            // знімки по дням
  period: { from: string; to: string };   // YYYY-MM-DD
  aggregated: KeepInCRMPeriodAggregated;
  comparison: KeepInCRMComparison | null; // null якщо порівняння не запитувалось
}

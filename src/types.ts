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
  lastModified?: string;
}

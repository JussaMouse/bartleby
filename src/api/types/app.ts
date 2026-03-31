export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ApiRequestContext {
  requestId: string;
  deviceId: string | null;
  sessionId: string | null;
}

export interface AppHealth {
  service: 'bartleby-app-api';
  version: 'v1';
  status: 'ok';
  timestamp: string;
}

export interface MobileNavItem {
  id: 'home' | 'chat' | 'lists' | 'capture' | 'activity' | 'settings';
  label: string;
  badge?: number;
}

export interface MobileFeedCard {
  id: string;
  type: 'summary' | 'task-list' | 'thread' | 'job';
  title: string;
  body: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface MobileFeedResponse {
  generatedAt: string;
  nav: MobileNavItem[];
  cards: MobileFeedCard[];
}

export interface AppThreadSummary {
  id: string;
  title: string;
  lastMessagePreview: string;
  updatedAt: string;
  unreadCount: number;
}

export interface AppMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  format: 'text' | 'voice-note' | 'transcript';
  text: string;
  createdAt: string;
  status?: 'pending' | 'completed' | 'failed';
}

export interface TaskListItem {
  id: string;
  title: string;
  context: string | null;
  dueDate: string | null;
  status: string;
}

export interface TaskListResponse {
  title: string;
  items: TaskListItem[];
}

export interface ActivityItem {
  id: string;
  channel: string;
  direction: string;
  text: string;
  timestamp: string;
  counterpart?: string;
}

export interface ActivityResponse {
  generatedAt: string;
  items: ActivityItem[];
}

export interface SettingsSummaryItem {
  key: string;
  value: string;
  category: 'server' | 'mobile' | 'privacy';
}

export interface SettingsSummaryResponse {
  items: SettingsSummaryItem[];
}

export interface CaptureResponse {
  captureId: string;
  kind: 'text' | 'voice';
  acceptedAt: string;
  threadId: string;
  messageId?: string;
  jobId?: string;
}

export interface AppEventRecord {
  id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface AppEventListResponse {
  items: AppEventRecord[];
}

export interface AppJob {
  id: string;
  kind: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  threadId: string | null;
  captureId: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
}

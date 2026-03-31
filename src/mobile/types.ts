import type { RuntimeActivityChannel } from '../services/runtime-activity.js';

export type MobileInteractionMode = 'home' | 'chat' | 'capture' | 'lists' | 'activity' | 'settings';

export interface MobileSessionState {
  mode: MobileInteractionMode;
  activeThreadId: string | null;
  pendingJobIds: string[];
}

export interface MobileThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
}

export interface MobileMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  format: 'text' | 'voice-note' | 'transcript';
  text: string;
  createdAt: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface MobileJob {
  id: string;
  type: 'voice-message';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  transcript?: string;
  replyText?: string;
  error?: string;
  threadId?: string;
}

export interface MobileActivityEvent {
  id: string;
  channel: RuntimeActivityChannel;
  direction: 'inbound' | 'outbound' | 'system';
  text: string;
  timestamp: string;
  counterpart?: string;
}

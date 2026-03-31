import { randomUUID } from 'crypto';

export type RuntimeActivityChannel = 'cli' | 'signal' | 'mobile';
export type RuntimeActivityDirection = 'inbound' | 'outbound' | 'system';

export interface RuntimeActivityItem {
  id: string;
  channel: RuntimeActivityChannel;
  direction: RuntimeActivityDirection;
  text: string;
  timestamp: string;
  counterpart?: string;
}

export class RuntimeActivityService {
  private history: RuntimeActivityItem[] = [];
  private readonly maxHistory = 200;

  record(event: Omit<RuntimeActivityItem, 'id' | 'timestamp'> & { timestamp?: string }): RuntimeActivityItem {
    const item: RuntimeActivityItem = {
      id: randomUUID(),
      timestamp: event.timestamp ?? new Date().toISOString(),
      ...event,
    };

    this.history.push(item);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return item;
  }

  list(limit = 50): RuntimeActivityItem[] {
    return this.history.slice(-limit).reverse();
  }
}

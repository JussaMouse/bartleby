// src/services/proactive.ts
import { GardenService } from './garden.js';
import { CalendarService } from './calendar.js';
import { MemoryService } from './memory.js';
import { debug } from '../utils/logger.js';

export class ProactiveService {
  constructor(
    private garden: GardenService,
    private calendar: CalendarService,
    private memory: MemoryService
  ) {}

  async getSessionOpener(): Promise<string | null> {
    const insights: string[] = [];

    // 1. Pending follow-ups
    const followups = this.memory.getPendingFollowups();
    if (followups.length > 0) {
      insights.push(`📝 Pending: "${followups[0].text}"`);
    }

    // 2. Stale inbox items
    try {
      const stale = this.garden.getStaleInboxItems(2);
      if (stale.length > 0) {
        insights.push(`📥 ${stale.length} inbox item(s) waiting > 2 days`);
      }
    } catch (err) {
      debug('Proactive: stale inbox check failed', { error: String(err) });
    }

    // 3. Overdue tasks
    try {
      const overdue = this.garden.getOverdueTasks();
      if (overdue.length > 0) {
        insights.push(`⚠️ ${overdue.length} overdue task(s)`);
      }
    } catch (err) {
      debug('Proactive: overdue check failed', { error: String(err) });
    }

    // 4. Today's events
    try {
      const todayEvents = this.calendar.getForDay(new Date());
      if (todayEvents.length > 0) {
        insights.push(`📅 ${todayEvents.length} event(s) today`);
      }
    } catch (err) {
      debug('Proactive: calendar check failed', { error: String(err) });
    }

    // 5. Last session context
    const lastSession = this.memory.getLastSession();
    if (lastSession) {
      const hoursSince = (Date.now() - new Date(lastSession.timestamp).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24 && lastSession.summary) {
        const summary = lastSession.summary.slice(0, 50);
        insights.push(`💭 Last: "${summary}..."`);
      }
    }

    // 6. Task completion rate
    try {
      const stats = this.garden.getTaskStats(7);
      if (stats.added > 5 && stats.completed / stats.added < 0.3) {
        insights.push(`📊 ${stats.completed}/${stats.added} tasks completed this week`);
      }
    } catch (err) {
      debug('Proactive: task stats failed', { error: String(err) });
    }

    return insights.length > 0 ? insights.join('\n') : null;
  }

  async getContextualReminder(input: string): Promise<string | null> {
    const related = this.memory.recallRelevant(input, 3);

    for (const episode of related) {
      if (episode.pendingFollowups.length > 0) {
        return `💭 Related: You mentioned "${episode.pendingFollowups[0]}"`;
      }
    }

    return null;
  }
}

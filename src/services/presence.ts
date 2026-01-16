// src/services/presence.ts
// The Presence Service - Bartleby's initiative layer
// Decides when and what Bartleby says unprompted

import { GardenService } from './garden.js';
import { CalendarService } from './calendar.js';
import { ContextService } from './context.js';
import { WeatherService } from './weather.js';
import { Config } from '../config.js';
import { debug } from '../utils/logger.js';

export type MomentType = 'morning' | 'evening' | 'weekly';

export interface PresenceConfig {
  startup: boolean;
  shutdown: boolean;
  scheduled: boolean;
  contextual: boolean;
  idle: boolean;
  idleMinutes: number;
  morningHour: number;
  eveningHour: number;
  weeklyDay: number;  // 0 = Sunday
  weeklyHour: number;
}

export class PresenceService {
  private presenceConfig: PresenceConfig;

  constructor(
    private config: Config,
    private context: ContextService,
    private garden: GardenService,
    private calendar: CalendarService,
    private weather?: WeatherService
  ) {
    // Load presence config from main config or use defaults
    this.presenceConfig = {
      startup: config.presence?.startup ?? true,
      shutdown: config.presence?.shutdown ?? true,
      scheduled: config.presence?.scheduled ?? true,
      contextual: config.presence?.contextual ?? true,
      idle: config.presence?.idle ?? false,
      idleMinutes: config.presence?.idleMinutes ?? 5,
      morningHour: config.presence?.morningHour ?? 8,
      eveningHour: config.presence?.eveningHour ?? 18,
      weeklyDay: config.presence?.weeklyDay ?? 0,
      weeklyHour: config.presence?.weeklyHour ?? 9,
    };
  }

  // === Lifecycle Moments ===

  /**
   * Called at REPL startup. Returns welcome + context message.
   */
  getStartupMessage(): string | null {
    if (!this.presenceConfig.startup) return null;

    const insights: string[] = [];

    // 1. Pending follow-ups from Personal Context
    try {
      const followups = this.context.getPendingFollowups();
      if (followups.length > 0) {
        insights.push(`📝 Pending: "${followups[0].text}"`);
      }
    } catch (err) {
      debug('Presence: followups check failed', { error: String(err) });
    }

    // 2. Stale inbox items
    try {
      const stale = this.garden.getStaleInboxItems(2);
      if (stale.length > 0) {
        insights.push(`📥 ${stale.length} inbox item(s) waiting > 2 days`);
      }
    } catch (err) {
      debug('Presence: stale inbox check failed', { error: String(err) });
    }

    // 3. Overdue actions
    try {
      const overdue = this.garden.getOverdueTasks();
      if (overdue.length > 0) {
        insights.push(`⚠️ ${overdue.length} overdue action(s)`);
      }
    } catch (err) {
      debug('Presence: overdue check failed', { error: String(err) });
    }

    // 4. Today's events
    try {
      const todayEvents = this.calendar.getForDay(new Date());
      if (todayEvents.length > 0) {
        insights.push(`📅 ${todayEvents.length} event(s) today`);
      }
    } catch (err) {
      debug('Presence: calendar check failed', { error: String(err) });
    }

    // 5. Last session context
    try {
      const lastSession = this.context.getLastSession();
      if (lastSession) {
        const hoursSince = (Date.now() - new Date(lastSession.timestamp).getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24 && lastSession.summary) {
          const summary = lastSession.summary.slice(0, 50);
          insights.push(`💭 Last: "${summary}..."`);
        }
      }
    } catch (err) {
      debug('Presence: last session check failed', { error: String(err) });
    }

    // 6. Task completion rate (gentle nudge if struggling)
    try {
      const stats = this.garden.getTaskStats(7);
      if (stats.added > 5 && stats.completed / stats.added < 0.3) {
        insights.push(`📊 ${stats.completed}/${stats.added} actions completed this week`);
      }
    } catch (err) {
      debug('Presence: task stats failed', { error: String(err) });
    }

    return insights.length > 0 ? insights.join('\n') : null;
  }

  /**
   * Called before REPL exits. Returns reflection/capture prompt.
   */
  getShutdownMessage(): string | null {
    if (!this.presenceConfig.shutdown) return null;

    const parts: string[] = [];

    // Tomorrow preview
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowEvents = this.calendar.getForDay(tomorrow);
      if (tomorrowEvents.length > 0) {
        parts.push(`📅 Tomorrow: ${tomorrowEvents.length} event(s)`);
        const first = tomorrowEvents[0];
        const time = new Date(first.start_time).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit' 
        });
        parts.push(`   First: ${first.title} at ${time}`);
      }
    } catch (err) {
      debug('Presence: tomorrow check failed', { error: String(err) });
    }

    // Capture prompt if had activity today
    try {
      const todayEpisodes = this.context.getTodayEpisodes();
      if (todayEpisodes.length > 0) {
        parts.push(`\n💭 Anything to capture before tomorrow?`);
      }
    } catch (err) {
      debug('Presence: today episodes check failed', { error: String(err) });
    }

    return parts.length > 0 ? parts.join('\n') : null;
  }

  // === Time-Based Moments ===

  /**
   * Called periodically by Scheduler. Returns time-appropriate message.
   */
  getScheduledMoment(momentType: MomentType): string | null {
    if (!this.presenceConfig.scheduled) return null;

    switch (momentType) {
      case 'morning':
        return this.getMorningReview();
      case 'evening':
        return this.getEveningWindDown();
      case 'weekly':
        return this.getWeeklyReview();
      default:
        return null;
    }
  }

  private getMorningReview(): string | null {
    const lines = ['☀️ **Morning Review**\n'];

    // Weather forecast (today + next 2 days)
    if (this.weather?.isAvailable()) {
      try {
        // Use sync wrapper - getMorningReviewAsync is the async version
        lines.push('🌤️ Weather loading...');
      } catch (err) {
        debug('Presence: morning weather failed', { error: String(err) });
      }
    }

    try {
      const todayEvents = this.calendar.getForDay(new Date());
      if (todayEvents.length > 0) {
        lines.push(`📅 ${todayEvents.length} event(s) today`);
        // Show first event
        const first = todayEvents[0];
        const time = new Date(first.start_time).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit' 
        });
        lines.push(`   First: ${first.title} at ${time}`);
      }
    } catch (err) {
      debug('Presence: morning calendar failed', { error: String(err) });
    }

    try {
      const tasks = this.garden.getTasks({ status: 'active' });
      lines.push(`📋 ${tasks.length} active action(s)`);

      const inbox = tasks.filter(t => t.context === '@inbox');
      if (inbox.length > 3) {
        lines.push(`📥 ${inbox.length} items in inbox - time to process?`);
      }
    } catch (err) {
      debug('Presence: morning tasks failed', { error: String(err) });
    }

    return lines.length > 1 ? lines.join('\n') : null;
  }

  /**
   * Async version of getMorningReview that includes weather forecast.
   * Used by scheduler for Signal notifications.
   */
  async getMorningReviewAsync(): Promise<string | null> {
    const lines = ['☀️ **Morning Review**\n'];

    // Weather forecast (today + next 2 days)
    if (this.weather?.isAvailable()) {
      try {
        const forecast = await this.weather.getForecast(3);
        if (forecast && forecast.length > 0) {
          lines.push('🌤️ **Weather**');
          lines.push(this.weather.formatForecast(forecast));
          lines.push('');
        }
      } catch (err) {
        debug('Presence: morning weather failed', { error: String(err) });
      }
    }

    try {
      const todayEvents = this.calendar.getForDay(new Date());
      if (todayEvents.length > 0) {
        lines.push(`📅 ${todayEvents.length} event(s) today`);
        const first = todayEvents[0];
        const time = new Date(first.start_time).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit' 
        });
        lines.push(`   First: ${first.title} at ${time}`);
      }
    } catch (err) {
      debug('Presence: morning calendar failed', { error: String(err) });
    }

    try {
      const tasks = this.garden.getTasks({ status: 'active' });
      lines.push(`📋 ${tasks.length} active action(s)`);

      const inbox = tasks.filter(t => t.context === '@inbox');
      if (inbox.length > 3) {
        lines.push(`📥 ${inbox.length} items in inbox - time to process?`);
      }
    } catch (err) {
      debug('Presence: morning tasks failed', { error: String(err) });
    }

    return lines.length > 1 ? lines.join('\n') : null;
  }

  private getEveningWindDown(): string | null {
    const lines = ['🌙 **Evening Wind-Down**\n'];

    try {
      const stats = this.garden.getTaskStats(1);
      lines.push(`Today: ${stats.completed} action(s) completed`);
    } catch (err) {
      debug('Presence: evening stats failed', { error: String(err) });
    }

    // Tomorrow preview
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowEvents = this.calendar.getForDay(tomorrow);
      if (tomorrowEvents.length > 0) {
        lines.push(`\n📅 Tomorrow: ${tomorrowEvents.length} event(s)`);
      }
    } catch (err) {
      debug('Presence: evening tomorrow failed', { error: String(err) });
    }

    lines.push(`\n💭 Anything to capture before bed?`);

    return lines.join('\n');
  }

  private getWeeklyReview(): string | null {
    const lines = ['📋 **Weekly Review**\n'];

    try {
      const stats = this.garden.getTaskStats(7);
      lines.push(`This week: ${stats.completed}/${stats.added} actions completed`);
    } catch (err) {
      debug('Presence: weekly stats failed', { error: String(err) });
    }

    try {
      const tasks = this.garden.getTasks({ status: 'active' });
      lines.push(`Active: ${tasks.length} action(s)`);

      const inbox = tasks.filter(t => t.context === '@inbox');
      if (inbox.length > 0) {
        lines.push(`Inbox: ${inbox.length} to process`);
      }
    } catch (err) {
      debug('Presence: weekly tasks failed', { error: String(err) });
    }

    try {
      const overdue = this.garden.getOverdueTasks();
      if (overdue.length > 0) {
        lines.push(`⚠️ Overdue: ${overdue.length}`);
      }
    } catch (err) {
      debug('Presence: weekly overdue failed', { error: String(err) });
    }

    lines.push(`\nReady to review? Try "show next actions"`);

    return lines.join('\n');
  }

  // === Contextual Moments ===

  /**
   * Called during conversation. Checks if there's relevant context to surface.
   */
  getContextualInterjection(userInput: string): string | null {
    if (!this.presenceConfig.contextual) return null;

    const inputLower = userInput.toLowerCase();

    // Check for name/topic mentions that match pending follow-ups
    try {
      const followups = this.context.getPendingFollowups();
      for (const followup of followups) {
        // Extract significant words (4+ chars) from follow-up
        const words = followup.text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        for (const word of words) {
          if (inputLower.includes(word)) {
            return `💭 By the way, you have a pending follow-up: "${followup.text}"`;
          }
        }
      }
    } catch (err) {
      debug('Presence: contextual followups failed', { error: String(err) });
    }

    // Check for topic overlap with recent conversations
    try {
      const related = this.context.recallRelevant(userInput, 1);
      if (related.length > 0 && related[0].pendingFollowups.length > 0) {
        return `💭 Related: "${related[0].pendingFollowups[0]}"`;
      }
    } catch (err) {
      debug('Presence: contextual recall failed', { error: String(err) });
    }

    return null;
  }

  /**
   * Called when user has been idle. Returns gentle nudge.
   */
  getIdleNudge(idleMinutes: number): string | null {
    if (!this.presenceConfig.idle) return null;
    if (idleMinutes < this.presenceConfig.idleMinutes) return null;

    try {
      const tasks = this.garden.getTasks({ status: 'active' });
      const inbox = tasks.filter(t => t.context === '@inbox');

      if (inbox.length > 3) {
        return `📥 You have ${inbox.length} items in your inbox. Want to process them?`;
      }
    } catch (err) {
      debug('Presence: idle nudge failed', { error: String(err) });
    }

    return null;
  }

  // === Config Accessors ===

  getConfig(): PresenceConfig {
    return { ...this.presenceConfig };
  }

  getMorningHour(): number {
    return this.presenceConfig.morningHour;
  }

  getEveningHour(): number {
    return this.presenceConfig.eveningHour;
  }

  getWeeklySchedule(): { day: number; hour: number } {
    return {
      day: this.presenceConfig.weeklyDay,
      hour: this.presenceConfig.weeklyHour,
    };
  }
}

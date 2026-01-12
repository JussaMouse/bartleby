// src/tools/scheduler.ts
import { Tool } from './types.js';

export const scheduleReminder: Tool = {
  name: 'scheduleReminder',
  description: 'Set a reminder for a specific time',

  routing: {
    patterns: [
      /^remind\s+me\s+(.+?)\s+(at|on|in)\s+(.+)$/i,
      /^set\s+reminder\s+(.+?)\s+(for|at|on|in)\s+(.+)$/i,
      /^schedule\s+reminder\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['remind', 'schedule', 'set'],
      nouns: ['reminder', 'alert', 'notification'],
    },
    examples: [
      'remind me to call dentist at 3pm',
      'set reminder check email in 2 hours',
      'remind me about meeting tomorrow at 9am',
    ],
    priority: 85,
  },

  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Reminder message' },
      when: { type: 'string', description: 'When to remind (date/time or relative)' },
    },
    required: ['message', 'when'],
  },

  parseArgs: (input) => {
    // Try to extract message and time
    let message = '';
    let when = '';

    // Pattern: "remind me <message> at/in/on <time>"
    const match = input.match(/^(?:remind\s+me|set\s+reminder)\s+(.+?)\s+(?:at|on|in|for)\s+(.+)$/i);
    if (match) {
      message = match[1].replace(/^to\s+/i, '').trim();
      when = match[2].trim();
    } else {
      // Fallback: everything after "remind me"
      message = input.replace(/^(remind\s+me|set\s+reminder|schedule\s+reminder)\s*/i, '').trim();
      when = 'in 1 hour'; // Default
    }

    // Parse relative times
    const whenDate = parseTimeString(when);

    return { message, when: whenDate.toISOString() };
  },

  execute: async (args, context) => {
    const { message, when } = args as { message: string; when: string };

    if (!message) {
      return 'Please provide a reminder message. Example: remind me to call dentist at 3pm';
    }

    const task = context.services.scheduler.scheduleReminder(message, when);
    const whenDate = new Date(task.nextRun);
    const formattedTime = whenDate.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return `✓ Reminder set: "${message}"\n  When: ${formattedTime}`;
  },
};

export const showScheduled: Tool = {
  name: 'showScheduled',
  description: 'Show all scheduled reminders',

  routing: {
    patterns: [
      /^(show|list|view)\s+(scheduled|reminders?)$/i,
      /^reminders?$/i,
      /^what('s| is)\s+scheduled$/i,
    ],
    keywords: {
      verbs: ['show', 'list', 'view'],
      nouns: ['scheduled', 'reminders', 'alerts'],
    },
    priority: 80,
  },

  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },

  execute: async (args, context) => {
    const tasks = context.services.scheduler.list();

    if (tasks.length === 0) {
      return 'No scheduled reminders. Use "remind me <message> at <time>" to create one.';
    }

    const lines = [`**Scheduled Reminders** (${tasks.length})\n`];
    tasks.forEach((task, index) => {
      const whenDate = new Date(task.nextRun);
      const formattedTime = whenDate.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

      const status = task.enabled ? '' : ' [disabled]';
      const recurring = task.scheduleType !== 'once' ? ' (recurring)' : '';

      lines.push(`**${index + 1}.** ${formattedTime}${recurring}${status}`);
      lines.push(`   "${task.actionPayload}"`);
    });

    lines.push('');
    lines.push('*Use "cancel reminder <number>" to remove.*');

    return lines.join('\n');
  },
};

export const cancelReminder: Tool = {
  name: 'cancelReminder',
  description: 'Cancel a scheduled reminder',

  routing: {
    patterns: [
      /^cancel\s+reminder\s+(\d+|.+)$/i,
      /^delete\s+reminder\s+(\d+|.+)$/i,
      /^remove\s+reminder\s+(\d+|.+)$/i,
    ],
    keywords: {
      verbs: ['cancel', 'delete', 'remove'],
      nouns: ['reminder', 'scheduled'],
    },
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      identifier: { type: 'string', description: 'Reminder number or partial message' },
    },
    required: ['identifier'],
  },

  parseArgs: (input) => {
    const identifier = input
      .replace(/^(cancel|delete|remove)\s+reminder\s*/i, '')
      .trim();
    return { identifier };
  },

  execute: async (args, context) => {
    const { identifier } = args as { identifier: string };

    if (!identifier) {
      return 'Please specify which reminder to cancel. Use "show reminders" to see the list.';
    }

    const tasks = context.services.scheduler.list();

    // Try to find by number
    const num = parseInt(identifier);
    if (!isNaN(num) && num > 0 && num <= tasks.length) {
      const task = tasks[num - 1];
      context.services.scheduler.cancel(task.id);
      return `✓ Cancelled reminder: "${task.actionPayload}"`;
    }

    // Try to find by message content
    const match = tasks.find(t =>
      String(t.actionPayload).toLowerCase().includes(identifier.toLowerCase())
    );

    if (match) {
      context.services.scheduler.cancel(match.id);
      return `✓ Cancelled reminder: "${match.actionPayload}"`;
    }

    return `No reminder found matching "${identifier}". Use "show reminders" to see the list.`;
  },
};

export const scheduleDailyReminder: Tool = {
  name: 'scheduleDailyReminder',
  description: 'Set a daily recurring reminder',

  routing: {
    patterns: [
      /^(daily|every\s+day)\s+at\s+(\d+(?::\d+)?)\s*(?:am|pm)?\s+(.+)$/i,
      /^remind\s+me\s+daily\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['remind', 'schedule'],
      nouns: ['daily', 'every day', 'recurring'],
    },
    priority: 70,
  },

  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Daily reminder message' },
      hour: { type: 'number', description: 'Hour of day (0-23)' },
    },
    required: ['message', 'hour'],
  },

  parseArgs: (input) => {
    // Parse "daily at 9am check email" or "remind me daily to exercise"
    const match = input.match(/(?:daily|every\s+day)\s+at\s+(\d+)(?::(\d+))?\s*(am|pm)?\s+(.+)$/i);
    if (match) {
      let hour = parseInt(match[1]);
      const ampm = match[3]?.toLowerCase();
      const message = match[4].trim();

      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;

      return { message, hour };
    }

    // Fallback: default to 9am
    const message = input
      .replace(/^(daily|every\s+day|remind\s+me\s+daily)\s*(to\s+)?/i, '')
      .trim();
    return { message, hour: 9 };
  },

  execute: async (args, context) => {
    const { message, hour } = args as { message: string; hour: number };

    if (!message) {
      return 'Please provide a message. Example: daily at 9am check email';
    }

    const task = context.services.scheduler.scheduleDaily(message, hour);
    const hourStr = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;

    return `✓ Daily reminder set: "${message}"\n  Time: ${hourStr} every day`;
  },
};

// Helper function to parse time strings
function parseTimeString(str: string): Date {
  const now = new Date();
  const lower = str.toLowerCase().trim();

  // Relative: "in X hours/minutes"
  const relativeMatch = lower.match(/^in\s+(\d+)\s+(minute|hour|day|week)s?$/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2];
    const ms = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    }[unit] || 60 * 60 * 1000;
    return new Date(now.getTime() + amount * ms);
  }

  // Time today: "at 3pm", "at 15:30"
  const timeMatch = lower.match(/^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]);
    const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const ampm = timeMatch[3];

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    const result = new Date(now);
    result.setHours(hour, minute, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }

    return result;
  }

  // Tomorrow
  if (lower.includes('tomorrow')) {
    const result = new Date(now);
    result.setDate(result.getDate() + 1);

    // Check for time component: "tomorrow at 3pm"
    const tomorrowTimeMatch = lower.match(/tomorrow\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (tomorrowTimeMatch) {
      let hour = parseInt(tomorrowTimeMatch[1]);
      const minute = tomorrowTimeMatch[2] ? parseInt(tomorrowTimeMatch[2]) : 0;
      const ampm = tomorrowTimeMatch[3];

      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;

      result.setHours(hour, minute, 0, 0);
    } else {
      result.setHours(9, 0, 0, 0); // Default to 9am
    }

    return result;
  }

  // Fallback: 1 hour from now
  return new Date(now.getTime() + 60 * 60 * 1000);
}

export const schedulerTools: Tool[] = [
  scheduleReminder,
  showScheduled,
  cancelReminder,
  scheduleDailyReminder,
];

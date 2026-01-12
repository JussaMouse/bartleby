// src/tools/calendar.ts
import { Tool } from './types.js';

export const showCalendar: Tool = {
  name: 'showCalendar',
  description: 'Show upcoming calendar events',

  routing: {
    patterns: [
      /^(show|view|list)?\s*calendar$/i,
      /^upcoming\s+events?$/i,
      /^what('s| is)\s+(on\s+)?(my\s+)?calendar/i,
    ],
    keywords: {
      verbs: ['show', 'view', 'list'],
      nouns: ['calendar', 'events', 'schedule'],
    },
    priority: 90,
  },

  execute: async (args, context) => {
    const events = context.services.calendar.getUpcoming(10);

    if (events.length === 0) {
      return 'No upcoming events.';
    }

    const lines = ['**Upcoming Events**'];
    for (const event of events) {
      const date = new Date(event.start_time);
      const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = event.all_day ? 'all day' : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      lines.push(`  ${dateStr} ${timeStr} - ${event.title}`);
    }

    return lines.join('\n');
  },
};

export const showToday: Tool = {
  name: 'showToday',
  description: "Show today's schedule",

  routing: {
    patterns: [
      /^today$/i,
      /^today('s)?\s+(schedule|events?|calendar)?$/i,
      /^what('s| is)\s+(happening\s+)?today/i,
    ],
    keywords: {
      verbs: ['show', 'what'],
      nouns: ['today', 'schedule'],
    },
    priority: 95,
  },

  execute: async (args, context) => {
    const events = context.services.calendar.getForDay(new Date());

    if (events.length === 0) {
      return "Nothing on today's calendar.";
    }

    const lines = ["**Today's Schedule**"];
    for (const event of events) {
      const date = new Date(event.start_time);
      const timeStr = event.all_day ? 'All day' : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      lines.push(`  ${timeStr} - ${event.title}`);
    }

    return lines.join('\n');
  },
};

export const addEvent: Tool = {
  name: 'addEvent',
  description: 'Create a calendar event',

  routing: {
    patterns: [
      /^add\s+event\s+["']?(.+?)["']?\s+(on|at|tomorrow|today)\s+(.+)$/i,
      /^schedule\s+["']?(.+?)["']?\s+(for|on|at|tomorrow)\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['add', 'schedule', 'create'],
      nouns: ['event', 'meeting', 'appointment'],
    },
    priority: 85,
  },

  parseArgs: (input) => {
    let startTime = new Date();
    const lower = input.toLowerCase();

    // Check for "tomorrow"
    if (lower.includes('tomorrow')) {
      startTime.setDate(startTime.getDate() + 1);
    }

    // Check for "today" (explicit, not needed but helps parsing)
    // Already defaults to today

    // Extract time: "at 10:30 am", "at 3pm", "at 15:00"
    const timeMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const ampm = timeMatch[3]?.toLowerCase();

      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      // Handle 24-hour format (no am/pm)
      if (!ampm && hour < 24) {
        // Assume PM for hours 1-6 without am/pm
        if (hour >= 1 && hour <= 6) hour += 12;
      }

      startTime.setHours(hour, minute, 0, 0);
    }

    // Extract title - more robust parsing
    // Remove command prefix
    let title = input
      .replace(/^(add\s+event|create\s+event|schedule)\s*/i, '')
      // Remove "today" and "tomorrow"
      .replace(/\b(today|tomorrow)\b/gi, '')
      // Remove time expressions
      .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\b/gi, '')
      // Remove prepositions
      .replace(/\b(on|for)\b/gi, '')
      // Stop at sentence boundary - only take first sentence/clause
      .split(/[.!?]|,\s*(and|then|also)\s+/i)[0]
      // Clean up extra whitespace
      .replace(/\s+/g, ' ')
      .trim();

    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + 1);

    return {
      title,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    };
  },

  execute: async (args, context) => {
    const { title, start_time, end_time } = args as {
      title: string;
      start_time: string;
      end_time: string;
    };

    if (!title) {
      return 'Please provide an event title. Example: add event "Meeting" at 3pm';
    }

    const event = context.services.calendar.create({
      title,
      start_time,
      end_time,
      all_day: false,
    });

    const date = new Date(event.start_time);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    return `✓ Created: ${event.title}\n  ${dateStr} at ${timeStr}`;
  },
};

export const calendarTools: Tool[] = [showCalendar, showToday, addEvent];

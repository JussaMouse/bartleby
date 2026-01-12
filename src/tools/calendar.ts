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
      /^today('s)?\s+(schedule|events?|calendar)$/i,
      /^what('s| is)\s+(happening\s+)?today\??$/i,
      /^(show|view)\s+today('s)?(\s+(schedule|events?|calendar))?$/i,
    ],
    keywords: {
      verbs: ['show', 'view'],
      nouns: ["today's schedule", "today's calendar", "today's events"],
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

    // Check for day of week
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayMatch = lower.match(/\b(sun|mon|tue|wed|thu|fri|sat)(?:day|s|nes|urs|ur)?\b/i);
    if (dayMatch) {
      const targetDay = days.findIndex(d => dayMatch[1].startsWith(d));
      if (targetDay >= 0) {
        const today = startTime.getDay();
        let daysToAdd = targetDay - today;
        if (daysToAdd <= 0) daysToAdd += 7; // Next week if today or past
        startTime.setDate(startTime.getDate() + daysToAdd);
      }
    }

    // Check for "tomorrow"
    if (lower.includes('tomorrow')) {
      startTime.setDate(startTime.getDate() + 1);
    }

    // Extract time - flexible: "at 3pm", "3pm", "3:30pm", "at 15:00", "8:00"
    const timeMatch = lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const ampm = timeMatch[3]?.toLowerCase();

      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      // Handle ambiguous times (no am/pm)
      if (!ampm) {
        // If hour looks like 24h format (>= 13), use as-is
        // Otherwise assume PM for 1-6, AM for 7-12
        if (hour < 13 && hour >= 1 && hour <= 6) hour += 12;
      }

      startTime.setHours(hour, minute, 0, 0);
    }

    // Extract title - remove all the temporal stuff
    let title = input
      .replace(/^(add\s+event|create\s+event|schedule)\s*/i, '')
      // Remove day of week
      .replace(/\b(sun|mon|tue|wed|thu|fri|sat)(?:day|s|nes|urs|ur)?\b/gi, '')
      // Remove "today" and "tomorrow"
      .replace(/\b(today|tomorrow)\b/gi, '')
      // Remove time expressions (with or without "at")
      .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(am|pm)?\b/gi, '')
      // Remove prepositions
      .replace(/\b(on|for|at)\b/gi, '')
      // Stop at sentence boundary
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

    // Check for first-time calendar use
    const hasOnboarded = context.services.memory.getFact('system', 'calendar_onboarded');
    const existingEvents = context.services.calendar.getUpcoming(1);
    const isFirstEvent = !hasOnboarded && existingEvents.length === 0;

    // Create the event
    const event = context.services.calendar.create({
      title,
      start_time,
      end_time,
      all_day: false,
    });

    const date = new Date(event.start_time);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    let response = `✓ Created: ${event.title}\n  ${dateStr} at ${timeStr}`;

    // First-time onboarding
    if (isFirstEvent) {
      context.services.memory.setFact('system', 'calendar_onboarded', true, { source: 'explicit' });
      
      response += `

───────────────────────────────────────────
📅 **Welcome to Bartleby's Calendar!**

Current defaults:
• Event duration: 1 hour
• Ambiguous times (1-6): afternoon
• Week starts: Sunday

To customize, just tell me naturally:
• "I prefer 30 minute meetings"
• "my week starts on Monday"

Or say "change calendar settings" anytime.

**Tip:** Add events like:
• "add event lunch 12pm"
• "add event dentist 2pm wednesday"
• "add event meeting tomorrow 9am"
───────────────────────────────────────────`;
    }

    return response;
  },
};

export const calendarTools: Tool[] = [showCalendar, showToday, addEvent];

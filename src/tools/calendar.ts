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

    // First-time onboarding - start the setup flow
    if (isFirstEvent) {
      // Don't mark as onboarded yet - that happens after setup completes
      context.services.memory.setFact('system', 'calendar_setup_pending', true, { source: 'explicit' });
      
      // Detect timezone
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const tzOffset = new Date().getTimezoneOffset();
      const tzHours = Math.abs(Math.floor(tzOffset / 60));
      const tzSign = tzOffset <= 0 ? '+' : '-';
      
      response += `

───────────────────────────────────────────
📅 **Welcome to Bartleby's Calendar!**

Let me ask a few quick questions to set things up.

**1. Timezone**
   Detected: ${tz} (UTC${tzSign}${tzHours})
   Is this correct? [yes / or tell me your timezone]

**2. Default event duration**
   How long are your typical meetings?
   [30m / 1h / 90m]

**3. Ambiguous times**
   When you say "3" without am/pm, assume:
   [morning / afternoon]

**4. Week starts on**
   [Sunday / Monday]

**5. Event reminders via Signal**
   Send a notification before events?
   [no / 15m / 30m / 1h]

Reply like: "yes, 1h, afternoon, Monday, 15m"
Or just "defaults" to accept: 1h, afternoon, Sunday, no reminders
───────────────────────────────────────────`;
    }

    return response;
  },
};

export const calendarSetup: Tool = {
  name: 'calendarSetup',
  description: 'Complete calendar setup / change calendar settings',

  routing: {
    patterns: [
      /^(yes|no|defaults?),?\s/i,
      /^(30m|1h|90m|morning|afternoon|sunday|monday|15m|30m),?\s/i,
      /^change\s+calendar\s+settings?$/i,
      /^calendar\s+settings?$/i,
      /^setup\s+calendar$/i,
    ],
    keywords: {
      verbs: ['change', 'setup', 'configure'],
      nouns: ['calendar settings', 'calendar setup'],
    },
    priority: 100, // High priority to catch setup responses
  },

  parseArgs: (input) => {
    const lower = input.toLowerCase().trim();
    
    // Check if this is "change settings" request
    if (lower.includes('change') || lower.includes('setup') || lower.includes('settings')) {
      return { action: 'start' };
    }
    
    // Check for defaults
    if (lower === 'defaults' || lower === 'default') {
      return {
        action: 'complete',
        timezone: 'auto',
        duration: 60,
        ambiguousTime: 'afternoon',
        weekStart: 'sunday',
        reminder: 'none',
      };
    }
    
    // Parse comma-separated answers
    const parts = lower.split(/[,\s]+/).filter(p => p.length > 0);
    
    let timezone = 'auto';
    let duration = 60;
    let ambiguousTime = 'afternoon';
    let weekStart = 'sunday';
    let reminder = 'none';
    
    for (const part of parts) {
      // Timezone confirmation
      if (part === 'yes' || part === 'correct') timezone = 'auto';
      
      // Duration
      if (part === '30m' || part === '30') duration = 30;
      if (part === '1h' || part === '60' || part === '60m') duration = 60;
      if (part === '90m' || part === '90') duration = 90;
      
      // Ambiguous time
      if (part === 'morning' || part === 'am') ambiguousTime = 'morning';
      if (part === 'afternoon' || part === 'pm') ambiguousTime = 'afternoon';
      
      // Week start
      if (part === 'sunday' || part === 'sun') weekStart = 'sunday';
      if (part === 'monday' || part === 'mon') weekStart = 'monday';
      
      // Reminder
      if (part === 'no' || part === 'none' || part === 'off') reminder = 'none';
      if (part === '15m' || part === '15') reminder = '15';
      if (part === '30m' && !lower.includes('duration')) reminder = '30'; // Avoid confusion with duration
      if (part === '1h' && lower.includes('remind')) reminder = '60';
    }
    
    return {
      action: 'complete',
      timezone,
      duration,
      ambiguousTime,
      weekStart,
      reminder,
    };
  },

  execute: async (args, context) => {
    const { action, timezone, duration, ambiguousTime, weekStart, reminder } = args as {
      action: string;
      timezone?: string;
      duration?: number;
      ambiguousTime?: string;
      weekStart?: string;
      reminder?: string;
    };

    // Check if setup is pending
    const setupPending = context.services.memory.getFact('system', 'calendar_setup_pending');
    
    // "change settings" command - show the setup prompt
    if (action === 'start') {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const tzOffset = new Date().getTimezoneOffset();
      const tzHours = Math.abs(Math.floor(tzOffset / 60));
      const tzSign = tzOffset <= 0 ? '+' : '-';
      
      context.services.memory.setFact('system', 'calendar_setup_pending', true, { source: 'explicit' });
      
      return `
📅 **Calendar Settings**

**1. Timezone**
   Detected: ${tz} (UTC${tzSign}${tzHours})
   Is this correct? [yes / or tell me your timezone]

**2. Default event duration**
   [30m / 1h / 90m]

**3. Ambiguous times (when you say "3" without am/pm)**
   [morning / afternoon]

**4. Week starts on**
   [Sunday / Monday]

**5. Event reminders via Signal**
   [no / 15m / 30m / 1h]

Reply like: "yes, 1h, afternoon, Monday, 15m"
Or just "defaults" to accept current settings.`;
    }

    // Not in setup mode and not a settings command
    if (!setupPending) {
      return "I'm not sure what you mean. Try 'change calendar settings' to configure your calendar.";
    }

    // Complete the setup
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Store preferences in memory
    context.services.memory.setFact('preference', 'event_duration', duration, { source: 'explicit' });
    context.services.memory.setFact('preference', 'ambiguous_time', ambiguousTime, { source: 'explicit' });
    context.services.memory.setFact('preference', 'week_start', weekStart, { source: 'explicit' });
    context.services.memory.setFact('preference', 'event_reminder', reminder, { source: 'explicit' });
    
    // Mark setup as complete
    context.services.memory.setFact('system', 'calendar_setup_pending', false, { source: 'explicit' });
    context.services.memory.setFact('system', 'calendar_onboarded', true, { source: 'explicit' });

    // Build .env output
    const reminderVal = reminder || 'none';
    
    return `
✓ **Calendar configured!**

Your settings:
• Timezone: ${tz}
• Default duration: ${duration || 60} minutes
• Ambiguous times: ${ambiguousTime || 'afternoon'}
• Week starts: ${weekStart || 'sunday'}
• Reminders: ${reminderVal === 'none' ? 'off' : reminderVal + ' before'}

───────────────────────────────────────────
**Copy to .env (optional):**

# Calendar Preferences
CALENDAR_TIMEZONE=${tz}
CALENDAR_DEFAULT_DURATION=${duration || 60}
CALENDAR_AMBIGUOUS_TIME=${ambiguousTime || 'afternoon'}
CALENDAR_WEEK_START=${weekStart || 'sunday'}
CALENDAR_REMINDER_MINUTES=${reminderVal === 'none' ? '0' : reminderVal}
SIGNAL_ENABLED=${reminderVal !== 'none' ? 'true' : 'false'}
───────────────────────────────────────────

These are saved to my memory. Add to .env for persistence across reinstalls.`;
  },
};

export const calendarTools: Tool[] = [showCalendar, showToday, addEvent, calendarSetup];

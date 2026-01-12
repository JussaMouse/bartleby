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
    let ambiguousHour: number | null = null;  // Track if time was ambiguous

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
    let minute = 0;
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const ampm = timeMatch[3]?.toLowerCase();

      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      // Handle ambiguous times (no am/pm)
      if (!ampm && hour < 13 && hour >= 1 && hour <= 12) {
        // This is ambiguous - mark it for potential clarification
        ambiguousHour = hour;
        // Default: assume PM for 1-6, AM for 7-12
        if (hour >= 1 && hour <= 6) hour += 12;
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
      ambiguousHour,  // Pass this to execute for "ask" preference handling
      minute,
    };
  },

  execute: async (args, context) => {
    const { title, start_time, end_time, ambiguousHour, minute } = args as {
      title: string;
      start_time: string;
      end_time: string;
      ambiguousHour: number | null;
      minute: number;
    };

    if (!title) {
      return 'Please provide an event title. Example: add event "Meeting" at 3pm';
    }

    // Check if we need to ask about ambiguous time
    if (ambiguousHour !== null) {
      const ambiguousPref = context.services.memory.getFact('preference', 'ambiguous_time');
      const pref = ambiguousPref?.value as string || 'afternoon';
      
      if (pref === 'ask') {
        // Store pending event data and ask for clarification
        context.services.memory.setFact('system', 'event_pending_clarification', {
          title,
          ambiguousHour,
          minute,
          baseDate: start_time,  // Has the correct date, just wrong hour potentially
        }, { source: 'explicit' });
        
        const dateObj = new Date(start_time);
        const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        
        return `
📅 **"${title}"** on ${dateStr}

You said **${ambiguousHour}${minute ? ':' + minute.toString().padStart(2, '0') : ''}** - did you mean:
→ **am** (${ambiguousHour}:${minute.toString().padStart(2, '0')} AM)
→ **pm** (${ambiguousHour + 12 > 12 ? ambiguousHour : ambiguousHour + 12}:${minute.toString().padStart(2, '0')} PM)`;
      }
      // Otherwise continue with default behavior (morning/afternoon already applied in parseArgs)
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

    // First-time onboarding - start the step-by-step setup flow
    if (isFirstEvent) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const tzOffset = new Date().getTimezoneOffset();
      const tzHours = Math.abs(Math.floor(tzOffset / 60));
      const tzSign = tzOffset <= 0 ? '+' : '-';
      
      // Initialize setup state
      context.services.memory.setFact('system', 'calendar_setup_step', 1, { source: 'explicit' });
      context.services.memory.setFact('system', 'calendar_setup_data', {}, { source: 'explicit' });
      context.services.memory.setFact('system', 'calendar_setup_pending', true, { source: 'explicit' });
      
      response += `

───────────────────────────────────────────
📅 **Welcome to Bartleby's Calendar!**

Let me set things up for you. Just answer each question.
(Or type "defaults" to skip with standard settings)

**Setup (1/5) - Timezone**
I detected: **${tz}** (UTC${tzSign}${tzHours})

Is this correct?
→ **yes** or type your timezone
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
      /^change\s+calendar\s+settings?$/i,
      /^calendar\s+settings?$/i,
      /^setup\s+calendar$/i,
      // Catch setup-specific responses
      /^(30m?|1h|60m?|90m?)$/i,
      /^(morning|afternoon|am|pm|ask)$/i,
      /^(sunday|monday|sun|mon)$/i,
      /^(15m?|none|off)$/i,
      /^defaults?$/i,
      // Confirmations (yes, no, cancel) - used by both setup and reset flows
      /^(yes|correct|y)$/i,
      /^yes\s+delete\s+events?$/i,
      /^(no|cancel|n)$/i,
    ],
    keywords: {
      verbs: ['change', 'setup', 'configure'],
      nouns: ['calendar settings', 'calendar setup'],
    },
    priority: 95,  // High priority to catch confirmations before keyword matching
  },

  execute: async (args, context) => {
    const input = context.input.toLowerCase().trim();
    
    // FIRST: Check if reset is pending - handle reset confirmations here
    const resetPending = context.services.memory.getFact('system', 'calendar_reset_pending');
    if (resetPending?.value) {
      return handleResetConfirmation(context, input);
    }
    
    // Get current setup state
    const setupStep = context.services.memory.getFact('system', 'calendar_setup_step');
    const currentStep = (setupStep?.value as number) || 0;
    
    // Check if this is "change settings" request to start fresh
    if (input.includes('change') || input.includes('setup') || input.includes('settings')) {
      return startSetup(context);
    }
    
    // Handle "defaults" - skip to end with defaults
    if (input === 'defaults' || input === 'default') {
      return completeSetup(context, {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        duration: 60,
        ambiguousTime: 'afternoon',
        weekStart: 'sunday',
        reminder: 'none',
      });
    }
    
    // Not in setup mode - only respond to setup commands
    if (currentStep === 0) {
      return "Try 'change calendar settings' to configure your calendar.";
    }
    
    // Process answer for current step and advance
    return processSetupStep(context, currentStep, input);
  },
};

// Helper function for reset confirmation (called from calendarSetup when reset is pending)
function handleResetConfirmation(context: import('./types.js').ToolContext, input: string): string {
  // Cancel
  if (input === 'cancel' || input === 'no' || input === 'n') {
    context.services.memory.setFact('system', 'calendar_reset_pending', false, { source: 'explicit' });
    return "Calendar reset cancelled. Your settings are unchanged.";
  }
  
  // Must be a "yes" to confirm
  if (!input.startsWith('yes') && input !== 'y' && input !== 'confirm') {
    return `Pending reset: type **yes**, **yes delete events**, or **cancel**.`;
  }
  
  // Confirm - do the reset
  const deleteEvents = input.includes('delete') && input.includes('event');
  
  // Clear the pending flag
  context.services.memory.setFact('system', 'calendar_reset_pending', false, { source: 'explicit' });
  
  // Clear calendar settings from memory
  context.services.memory.setFact('system', 'calendar_onboarded', false, { source: 'explicit' });
  context.services.memory.setFact('system', 'calendar_setup_pending', false, { source: 'explicit' });
  context.services.memory.setFact('system', 'calendar_setup_data', {}, { source: 'explicit' });
  
  // Clear preferences
  context.services.memory.setFact('preference', 'timezone', null, { source: 'explicit' });
  context.services.memory.setFact('preference', 'event_duration', null, { source: 'explicit' });
  context.services.memory.setFact('preference', 'ambiguous_time', null, { source: 'explicit' });
  context.services.memory.setFact('preference', 'week_start', null, { source: 'explicit' });
  context.services.memory.setFact('preference', 'event_reminder', null, { source: 'explicit' });
  
  let response = `✓ **Calendar settings reset**\n`;

  if (deleteEvents) {
    response += `
To delete events, run:
  rm database/calendar.sqlite3

Then restart Bartleby.

`;
  }

  response += `
**To restore old settings:** Copy your backed-up .env values and restart.

───────────────────────────────────────────
Let's set up your calendar preferences now.
`;

  // Start the setup flow immediately
  return response + startSetup(context);
}

// Helper functions for setup flow
function startSetup(context: import('./types.js').ToolContext): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzOffset = new Date().getTimezoneOffset();
  const tzHours = Math.abs(Math.floor(tzOffset / 60));
  const tzSign = tzOffset <= 0 ? '+' : '-';
  
  // Initialize setup state
  context.services.memory.setFact('system', 'calendar_setup_step', 1, { source: 'explicit' });
  context.services.memory.setFact('system', 'calendar_setup_data', {}, { source: 'explicit' });
  
  return `
📅 **Calendar Setup** (1/5)

**Timezone**
I detected: **${tz}** (UTC${tzSign}${tzHours})

Is this correct?
→ **yes** or type your timezone`;
}

function processSetupStep(context: import('./types.js').ToolContext, step: number, input: string): string {
  // Get accumulated data
  const dataFact = context.services.memory.getFact('system', 'calendar_setup_data');
  const data = (dataFact?.value as Record<string, unknown>) || {};
  
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  switch (step) {
    case 1: // Timezone
      data.timezone = (input === 'yes' || input === 'y' || input === 'correct') ? tz : input;
      context.services.memory.setFact('system', 'calendar_setup_data', data, { source: 'explicit' });
      context.services.memory.setFact('system', 'calendar_setup_step', 2, { source: 'explicit' });
      return `
✓ Timezone: ${data.timezone}

📅 **Calendar Setup** (2/5)

**Default event duration**
How long are your typical meetings?

→ **30m** / **1h** / **90m**`;

    case 2: // Duration
      if (input.includes('30')) data.duration = 30;
      else if (input.includes('90')) data.duration = 90;
      else data.duration = 60;
      
      context.services.memory.setFact('system', 'calendar_setup_data', data, { source: 'explicit' });
      context.services.memory.setFact('system', 'calendar_setup_step', 3, { source: 'explicit' });
      return `
✓ Duration: ${data.duration} minutes

📅 **Calendar Setup** (3/5)

**Ambiguous times**
When you say "meeting at 3" without am/pm, should I:

→ **morning** - assume AM
→ **afternoon** - assume PM  
→ **ask** - ask you to clarify`;

    case 3: // Ambiguous time
      if (input.includes('ask') || input.includes('clarif')) {
        data.ambiguousTime = 'ask';
      } else if (input.includes('morning') || input === 'am') {
        data.ambiguousTime = 'morning';
      } else {
        data.ambiguousTime = 'afternoon';
      }
      context.services.memory.setFact('system', 'calendar_setup_data', data, { source: 'explicit' });
      context.services.memory.setFact('system', 'calendar_setup_step', 4, { source: 'explicit' });
      return `
✓ Ambiguous times: ${data.ambiguousTime}

📅 **Calendar Setup** (4/5)

**Week starts on**

→ **Sunday** or **Monday**`;

    case 4: // Week start
      data.weekStart = (input.includes('mon')) ? 'monday' : 'sunday';
      context.services.memory.setFact('system', 'calendar_setup_data', data, { source: 'explicit' });
      context.services.memory.setFact('system', 'calendar_setup_step', 5, { source: 'explicit' });
      return `
✓ Week starts: ${data.weekStart}

📅 **Calendar Setup** (5/5)

**Event reminders**
Send a Signal notification before events start?

→ **no** / **15m** / **30m** / **1h**`;

    case 5: // Reminder
      if (input.includes('15')) data.reminder = '15';
      else if (input.includes('30')) data.reminder = '30';
      else if (input.includes('1h') || input.includes('60')) data.reminder = '60';
      else data.reminder = 'none';
      
      return completeSetup(context, data as unknown as SetupData);

    default:
      return startSetup(context);
  }
}

interface SetupData {
  timezone: string;
  duration: number;
  ambiguousTime: string;
  weekStart: string;
  reminder: string;
}

function completeSetup(context: import('./types.js').ToolContext, data: SetupData): string {
  const { timezone, duration, ambiguousTime, weekStart, reminder } = data;
  
  // Store preferences in memory
  context.services.memory.setFact('preference', 'timezone', timezone, { source: 'explicit' });
  context.services.memory.setFact('preference', 'event_duration', duration, { source: 'explicit' });
  context.services.memory.setFact('preference', 'ambiguous_time', ambiguousTime, { source: 'explicit' });
  context.services.memory.setFact('preference', 'week_start', weekStart, { source: 'explicit' });
  context.services.memory.setFact('preference', 'event_reminder', reminder, { source: 'explicit' });
  
  // Clear setup state
  context.services.memory.setFact('system', 'calendar_setup_step', 0, { source: 'explicit' });
  context.services.memory.setFact('system', 'calendar_setup_pending', false, { source: 'explicit' });
  context.services.memory.setFact('system', 'calendar_onboarded', true, { source: 'explicit' });

  const reminderDisplay = reminder === 'none' ? 'off' : reminder + ' before';
  
  return `
✓ **Calendar configured!**

Your settings:
• Timezone: ${timezone}
• Default duration: ${duration} minutes
• Ambiguous times: ${ambiguousTime}
• Week starts: ${weekStart}
• Reminders: ${reminderDisplay}

───────────────────────────────────────────
**Copy to .env (optional):**

# Calendar Preferences
CALENDAR_TIMEZONE=${timezone}
CALENDAR_DEFAULT_DURATION=${duration}
CALENDAR_AMBIGUOUS_TIME=${ambiguousTime}
CALENDAR_WEEK_START=${weekStart}
CALENDAR_REMINDER_MINUTES=${reminder === 'none' ? '0' : reminder}
SIGNAL_ENABLED=${reminder !== 'none' ? 'true' : 'false'}
───────────────────────────────────────────

Settings saved! You can change these anytime with "change calendar settings".`;
}

export const resetCalendar: Tool = {
  name: 'resetCalendar',
  description: 'Reset calendar settings and optionally clear all events',

  routing: {
    patterns: [
      /^reset\s+calendar$/i,
      /^clear\s+calendar\s+settings?$/i,
      /^reset\s+calendar\s+settings?$/i,
    ],
    keywords: {
      verbs: ['reset', 'clear'],
      nouns: ['calendar', 'calendar settings'],
    },
    priority: 90,
  },

  execute: async (args, context) => {
    // Start the reset flow - show warning and set pending flag
    // Confirmations (yes/no/cancel) are handled by calendarSetup which has broader patterns
    context.services.memory.setFact('system', 'calendar_reset_pending', true, { source: 'explicit' });
    
    const eventCount = context.services.calendar.getUpcoming(100).length;
    
    return `
⚠️ **Reset Calendar**

This will:
• Clear calendar settings (timezone, duration, reminders, etc.)
• Trigger onboarding again on your next event

You have **${eventCount} upcoming event(s)** - these will NOT be deleted.

**💾 Backup first!** Your current settings are in \`.env\`.
Copy the CALENDAR_* lines somewhere safe to restore later.

To confirm, type:
→ **yes** - reset settings only
→ **yes delete events** - reset settings AND clear all events
→ **cancel** - abort`;
  },
};

export const clarifyEventTime: Tool = {
  name: 'clarifyEventTime',
  description: 'Clarify am/pm for ambiguous event time',

  routing: {
    patterns: [
      /^(am|pm)$/i,
      /^(morning|afternoon)$/i,
    ],
    priority: 100,  // High priority to catch am/pm when event is pending
  },

  execute: async (args, context) => {
    const pendingEvent = context.services.memory.getFact('system', 'event_pending_clarification');
    
    if (!pendingEvent?.value) {
      // No pending event - this am/pm isn't for us
      return "I'm not sure what you mean. Try 'add event meeting at 3pm'.";
    }
    
    const { title, ambiguousHour, minute, baseDate } = pendingEvent.value as {
      title: string;
      ambiguousHour: number;
      minute: number;
      baseDate: string;
    };
    
    const input = context.input.toLowerCase().trim();
    const isPM = input === 'pm' || input === 'afternoon';
    
    // Calculate the correct hour
    let hour = ambiguousHour;
    if (isPM && hour < 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
    
    // Create the event with clarified time
    const startTime = new Date(baseDate);
    startTime.setHours(hour, minute, 0, 0);
    
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + 1);
    
    const event = context.services.calendar.create({
      title,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      all_day: false,
    });
    
    // Clear pending state
    context.services.memory.setFact('system', 'event_pending_clarification', null, { source: 'explicit' });
    
    const dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    return `✓ Created: ${event.title}\n  ${dateStr} at ${timeStr}`;
  },
};

export const calendarTools: Tool[] = [showCalendar, showToday, addEvent, calendarSetup, resetCalendar, clarifyEventTime];

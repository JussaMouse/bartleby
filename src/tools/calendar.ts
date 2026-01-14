// src/tools/calendar.ts
import { Tool } from './types.js';
import { debug } from '../utils/logger.js';

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
    const entries = context.services.calendar.getUpcoming(15);

    if (entries.length === 0) {
      return 'Nothing scheduled.';
    }

    // Group by type
    const events = entries.filter(e => e.entry_type === 'event');
    const deadlines = entries.filter(e => e.entry_type === 'deadline');
    const reminders = entries.filter(e => e.entry_type === 'reminder');

    const lines: string[] = [];

    if (events.length > 0) {
      lines.push('**📅 Upcoming Events**');
      for (const event of events) {
        const date = new Date(event.start_time);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = event.all_day ? 'all day' : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        lines.push(`  ${dateStr} ${timeStr} - ${event.title}`);
      }
    }

    if (deadlines.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('**⚠️ Deadlines**');
      for (const dl of deadlines) {
        const date = new Date(dl.start_time);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        lines.push(`  ${dateStr} - ${dl.title}`);
      }
    }

    if (reminders.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('**🔔 Reminders**');
      for (const rem of reminders) {
        const date = new Date(rem.start_time);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        lines.push(`  ${dateStr} ${timeStr} - ${rem.title}`);
      }
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
    const entries = context.services.calendar.getForDay(new Date());

    if (entries.length === 0) {
      return "Nothing scheduled for today.";
    }

    // Group by type
    const events = entries.filter(e => e.entry_type === 'event');
    const deadlines = entries.filter(e => e.entry_type === 'deadline');
    const reminders = entries.filter(e => e.entry_type === 'reminder');

    const lines: string[] = ["**Today's Schedule**", ''];

    if (events.length > 0) {
      lines.push('**📅 Events**');
      for (const event of events) {
        const date = new Date(event.start_time);
        const timeStr = event.all_day ? 'All day' : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        lines.push(`  ${timeStr} - ${event.title}`);
      }
    }

    if (deadlines.length > 0) {
      if (events.length > 0) lines.push('');
      lines.push('**⚠️ Due Today**');
      for (const dl of deadlines) {
        lines.push(`  ${dl.title}`);
      }
    }

    if (reminders.length > 0) {
      if (events.length > 0 || deadlines.length > 0) lines.push('');
      lines.push('**🔔 Reminders**');
      for (const rem of reminders) {
        const date = new Date(rem.start_time);
        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        lines.push(`  ${timeStr} - ${rem.title}`);
      }
    }

    return lines.join('\n');
  },
};

export const addEvent: Tool = {
  name: 'addEvent',
  description: 'Create a calendar event (wizard flow)',

  routing: {
    patterns: [
      /^(new|add|create)\s+event$/i,  // Bare command starts wizard
      /^(new|add)\s+event\s+.+$/i,    // With inline args - try to parse
      /^schedule\s+.+$/i,
    ],
    keywords: {
      verbs: ['add', 'schedule', 'create', 'new'],
      nouns: ['event', 'meeting', 'appointment'],
    },
    priority: 85,
  },

  parseArgs: (input) => {
    const lower = input.toLowerCase().trim();
    
    // Check if bare command (wizard mode)
    if (/^(new|add|create)\s+event$/i.test(lower)) {
      return { wizardMode: true };
    }
    
    // Otherwise try to parse inline
    return { wizardMode: false, rawInput: input };
  },

  execute: async (args, context) => {
    const { wizardMode, rawInput } = args as { wizardMode: boolean; rawInput?: string };
    
    // Start wizard mode - always clear any existing state and start fresh
    if (wizardMode) {
      context.services.context.setFact('system', 'event_wizard_pending', {
        step: 'title',
      }, { source: 'explicit' });
      
      return "📅 **New Event**\n\nWhat's the event?";
    }
    
    // Parse inline input
    const parsed = parseEventInput(rawInput || '');
    
    if (!parsed.title) {
      // Not enough info - start wizard
      context.services.context.setFact('system', 'event_wizard_pending', {
        step: 'title',
      }, { source: 'explicit' });
      
      return "📅 **New Event**\n\nWhat's the event?";
    }
    
    // If we have title but no time, ask for when
    if (!parsed.hasTime) {
      context.services.context.setFact('system', 'event_wizard_pending', {
        step: 'when',
        title: parsed.title,
      }, { source: 'explicit' });
      
      return `📅 **"${parsed.title}"**\n\nWhen? (e.g., tomorrow 3pm, 1/22 7:30am, friday 2pm)`;
    }
    
    // Check for ambiguous time
    if (parsed.ambiguousHour !== null) {
      const pref = context.services.config.calendar.ambiguousTime;
      if (pref === 'ask') {
        context.services.context.setFact('system', 'event_wizard_pending', {
          step: 'ampm',
          title: parsed.title,
          ambiguousHour: parsed.ambiguousHour,
          minute: parsed.minute,
          baseDate: parsed.startTime.toISOString(),
        }, { source: 'explicit' });
        
        return `📅 **"${parsed.title}"**

You said **${parsed.ambiguousHour}${parsed.minute ? ':' + parsed.minute.toString().padStart(2, '0') : ''}** - did you mean:
→ **am** or **pm**`;
      }
    }
    
    // We have everything - ask about reminder then create
    context.services.context.setFact('system', 'event_wizard_pending', {
      step: 'reminder',
      title: parsed.title,
      startTime: parsed.startTime.toISOString(),
    }, { source: 'explicit' });
    
    const dateStr = parsed.startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const timeStr = parsed.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    return `📅 **"${parsed.title}"**
  ${dateStr} at ${timeStr}

Reminder?
→ **none** / **15m** / **30m** / **1h**`;
  },
};

// Helper to parse event input for dates/times
function parseEventInput(input: string): {
  title: string;
  startTime: Date;
  hasTime: boolean;
  ambiguousHour: number | null;
  minute: number;
} {
  debug('parseEventInput START', { input });
  
  let startTime = new Date();
  let hasTime = false;
  let ambiguousHour: number | null = null;
  let minute = 0;
  
  // Remove command prefix
  let text = input
    .replace(/^(new|add|create)\s+event:?\s*/i, '')
    .replace(/^schedule\s*/i, '')
    .trim();
  
  // Check for date-first format: 1/22/26 7:30am title
  const dateFirstMatch = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(.+)$/i);
  debug('parseEventInput dateFirstMatch', { text, matched: !!dateFirstMatch, groups: dateFirstMatch });
  if (dateFirstMatch) {
    const [, m, d, y, hour, min, ampm, titlePart] = dateFirstMatch;
    const month = parseInt(m, 10) - 1;
    const day = parseInt(d, 10);
    let year = y ? parseInt(y, 10) : startTime.getFullYear();
    if (year < 100) year += 2000;
    
    let h = parseInt(hour, 10);
    minute = min ? parseInt(min, 10) : 0;
    
    if (ampm?.toLowerCase() === 'pm' && h < 12) h += 12;
    if (ampm?.toLowerCase() === 'am' && h === 12) h = 0;
    if (!ampm && h >= 1 && h <= 12) {
      ambiguousHour = h;
      if (h >= 1 && h <= 6) h += 12;
    }
    
    startTime = new Date(year, month, day, h, minute, 0, 0);
    hasTime = true;
    
    return { title: titlePart.trim(), startTime, hasTime, ambiguousHour, minute };
  }
  
  // Check for explicit date MM/DD or MM/DD/YY anywhere in text
  const dateMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1], 10) - 1;
    const day = parseInt(dateMatch[2], 10);
    let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : startTime.getFullYear();
    if (year < 100) year += 2000;
    startTime = new Date(year, month, day);
    text = text.replace(dateMatch[0], '').trim();
  }
  
  // Check for day of week
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayMatch = text.match(/\b(sun|mon|tue|wed|thu|fri|sat)(?:day|s|nes|urs|ur)?\b/i);
  if (dayMatch) {
    const targetDay = days.findIndex(d => dayMatch[1].toLowerCase().startsWith(d));
    if (targetDay >= 0) {
      const today = startTime.getDay();
      let daysToAdd = targetDay - today;
      if (daysToAdd <= 0) daysToAdd += 7;
      startTime.setDate(startTime.getDate() + daysToAdd);
    }
    text = text.replace(dayMatch[0], '').trim();
  }
  
  // Check for tomorrow
  if (/\btomorrow\b/i.test(text)) {
    startTime.setDate(startTime.getDate() + 1);
    text = text.replace(/\btomorrow\b/gi, '').trim();
  }
  
  // Check for today
  if (/\btoday\b/i.test(text)) {
    text = text.replace(/\btoday\b/gi, '').trim();
  }
  
  // Extract am/pm first (anywhere in text) - use simple string check
  const textLower = text.toLowerCase();
  const hasSpaceAm = textLower.includes(' am');
  const endsWithAm = textLower.endsWith('am');
  const hasSpacePm = textLower.includes(' pm');
  const endsWithPm = textLower.endsWith('pm');
  const ampm = hasSpaceAm || endsWithAm ? 'am' :
               hasSpacePm || endsWithPm ? 'pm' : null;
  
  debug('parseEventInput am/pm check', { text, textLower, hasSpaceAm, endsWithAm, hasSpacePm, endsWithPm, ampm });
  
  // Match time: HH:MM or just H (if followed by am/pm)
  const timeMatch = 
    text.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})/i) ||   // HH:MM
    text.match(/\b(?:at\s+)?(\d{1,2})(?=\s*(?:am|pm))/i);  // H before am/pm
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    if (!ampm && hour >= 1 && hour <= 12) {
      ambiguousHour = hour;
      if (hour >= 1 && hour <= 6) hour += 12;
    }
    
    startTime.setHours(hour, minute, 0, 0);
    hasTime = true;
    text = text.replace(timeMatch[0], '').replace(/\b(am|pm)\b/gi, '').trim();
  }
  
  // Clean up title
  const title = text
    .replace(/\b(on|for|at)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return { title, startTime, hasTime, ambiguousHour, minute };
}

// Tool to handle wizard responses
export const eventWizardResponse: Tool = {
  name: 'eventWizardResponse',
  description: 'Handle responses during event creation wizard',

  routing: {
    patterns: [], // No patterns - uses shouldHandle
    priority: 100,
  },

  shouldHandle: async (input, context) => {
    const pending = context.services.context.getFact('system', 'event_wizard_pending');
    if (!pending?.value) return false;
    
    const lower = input.toLowerCase().trim();
    
    // Don't intercept if user is clearly doing something else
    if (/^(new|add|create|capture|show|done|edit|delete|remove|help|quit|status|calendar|today)/i.test(lower)) {
      // Clear stale wizard state
      context.services.context.setFact('system', 'event_wizard_pending', null, { source: 'explicit' });
      return false;
    }
    
    return true;
  },

  execute: async (args, context) => {
    const pending = context.services.context.getFact('system', 'event_wizard_pending');
    if (!pending?.value) {
      return null; // Let other tools handle
    }
    
    const state = pending.value as {
      step: string;
      title?: string;
      startTime?: string;
      ambiguousHour?: number;
      minute?: number;
      baseDate?: string;
      reminderMinutes?: number;
    };
    
    const input = context.input.trim();
    
    debug('eventWizardResponse', { step: state.step, input, stateKeys: Object.keys(state) });
    
    switch (state.step) {
      case 'title': {
        // User provided the event title
        context.services.context.setFact('system', 'event_wizard_pending', {
          step: 'when',
          title: input,
        }, { source: 'explicit' });
        
        return `📅 **"${input}"**\n\nWhen? (e.g., tomorrow 3pm, 1/22 7:30am, friday 2pm)`;
      }
      
      case 'when': {
        // Parse the date/time
        const parsed = parseEventInput(input);
        debug('eventWizard when parse result', { 
          title: parsed.title, 
          hasTime: parsed.hasTime, 
          ambiguousHour: parsed.ambiguousHour,
          minute: parsed.minute,
          startTime: parsed.startTime.toISOString()
        });
        
        if (!parsed.hasTime && !parsed.title) {
          // Couldn't parse - try again
          return "I didn't understand that. Try: tomorrow 3pm, 1/22 7:30am, or friday 2pm";
        }
        
        // Use parsed time, keep the title from state
        const title = state.title!;
        
        // Check for ambiguous time
        if (parsed.ambiguousHour !== null) {
          const pref = context.services.config.calendar.ambiguousTime;
          if (pref === 'ask') {
            context.services.context.setFact('system', 'event_wizard_pending', {
              step: 'ampm',
              title,
              ambiguousHour: parsed.ambiguousHour,
              minute: parsed.minute,
              baseDate: parsed.startTime.toISOString(),
            }, { source: 'explicit' });
            
            return `You said **${parsed.ambiguousHour}${parsed.minute ? ':' + parsed.minute.toString().padStart(2, '0') : ''}** - did you mean:\n→ **am** or **pm**`;
          }
        }
        
        // Move to reminder step
        context.services.context.setFact('system', 'event_wizard_pending', {
          step: 'reminder',
          title,
          startTime: parsed.startTime.toISOString(),
        }, { source: 'explicit' });
        
        const dateStr = parsed.startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        const timeStr = parsed.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        
        return `📅 **"${title}"**\n  ${dateStr} at ${timeStr}\n\nReminder?\n→ **none** / **15m** / **30m** / **1h**`;
      }
      
      case 'ampm': {
        const lower = input.toLowerCase();
        const isPM = lower === 'pm' || lower === 'afternoon';
        const isAM = lower === 'am' || lower === 'morning';
        
        if (!isPM && !isAM) {
          return "Please type **am** or **pm**";
        }
        
        let hour = state.ambiguousHour!;
        if (isPM && hour < 12) hour += 12;
        if (isAM && hour === 12) hour = 0;
        
        const startTime = new Date(state.baseDate!);
        startTime.setHours(hour, state.minute || 0, 0, 0);
        
        context.services.context.setFact('system', 'event_wizard_pending', {
          step: 'reminder',
          title: state.title,
          startTime: startTime.toISOString(),
        }, { source: 'explicit' });
        
        const dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        
        return `📅 **"${state.title}"**\n  ${dateStr} at ${timeStr}\n\nReminder?\n→ **none** / **15m** / **30m** / **1h**`;
      }
      
      case 'reminder': {
        const lower = input.toLowerCase();
        let reminderMinutes = 0;
        
        if (lower.includes('15')) reminderMinutes = 15;
        else if (lower.includes('30')) reminderMinutes = 30;
        else if (lower.includes('1h') || lower.includes('60') || lower === 'hour') reminderMinutes = 60;
        // 'none', 'no', 'skip', etc. → 0
        
        // Move to extras step
        context.services.context.setFact('system', 'event_wizard_pending', {
          step: 'extras',
          title: state.title,
          startTime: state.startTime,
          reminderMinutes,
        }, { source: 'explicit' });
        
        return `Add anything else? (Enter to skip)\n→ **with <person>**, **at <location>**, **#tag**`;
      }
      
      case 'extras': {
        // Parse extras: with <person>, at <location>, #tags
        let location: string | undefined;
        let contacts: string[] = [];
        let tags: string[] = [];
        
        const text = input.trim();
        
        if (text && text !== '') {
          // Extract "with <person>" or "with <person1>, <person2>"
          const withMatch = text.match(/with\s+([^,#@]+?)(?=,\s*(?:at|#)|,\s*$|$)/gi);
          if (withMatch) {
            for (const match of withMatch) {
              const person = match.replace(/^with\s+/i, '').trim();
              if (person) contacts.push(person);
            }
          }
          
          // Extract "at <location>"
          const atMatch = text.match(/at\s+([^,#]+?)(?=,\s*(?:with|#)|,\s*$|$)/i);
          if (atMatch) {
            location = atMatch[1].trim();
          }
          
          // Extract #tags
          const tagMatches = text.match(/#(\w+)/g);
          if (tagMatches) {
            tags = tagMatches.map(t => t.slice(1));
          }
        }
        
        // Create the event!
        const startTime = new Date(state.startTime!);
        const endTime = new Date(startTime);
        endTime.setHours(endTime.getHours() + 1);
        
        const reminderMinutes = state.reminderMinutes || 0;
        
        // Build metadata for contacts and tags
        const metadata: Record<string, unknown> = {};
        if (contacts.length > 0) metadata.contacts = contacts;
        if (tags.length > 0) metadata.tags = tags;
        
        const event = context.services.calendar.create({
          title: state.title!,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          all_day: false,
          location,
          metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined,
        });
        
        // Clear wizard state
        context.services.context.setFact('system', 'event_wizard_pending', null, { source: 'explicit' });
        
        const dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        
        let response = `✓ Created: ${event.title}\n  ${dateStr} at ${timeStr}`;
        
        if (location) {
          response += `\n  📍 ${location}`;
        }
        if (contacts.length > 0) {
          response += `\n  👤 ${contacts.join(', ')}`;
        }
        if (tags.length > 0) {
          response += `\n  🏷️ ${tags.map(t => '#' + t).join(' ')}`;
        }
        
        // Schedule reminder if requested
        if (reminderMinutes > 0) {
          const reminderTime = new Date(startTime.getTime() - reminderMinutes * 60 * 1000);
          
          if (reminderTime > new Date()) {
            context.services.scheduler.create({
              type: 'reminder',
              scheduleType: 'once',
              scheduleValue: reminderTime.toISOString(),
              actionType: 'notify',
              actionPayload: `"${event.title}" starts in ${reminderMinutes} minutes`,
              nextRun: reminderTime.toISOString(),
              createdBy: 'system',
              relatedRecord: event.id,
            });
            response += `\n  🔔 Reminder: ${reminderMinutes}m before`;
          }
        }
        
        return response;
      }
      
      default:
        // Unknown state - clear and let other tools handle
        context.services.context.setFact('system', 'event_wizard_pending', null, { source: 'explicit' });
        return null;
    }
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
      /^(30m?|1h|1hr|60m?|90m?|hour)$/i,
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
    const resetPending = context.services.context.getFact('system', 'calendar_reset_pending');
    if (resetPending?.value) {
      return handleResetConfirmation(context, input);
    }
    
    // Get current setup state
    const setupStep = context.services.context.getFact('system', 'calendar_setup_step');
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
        dateFormat: 'mdy',
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
    context.services.context.setFact('system', 'calendar_reset_pending', false, { source: 'explicit' });
    return "Calendar reset cancelled. Your settings are unchanged.";
  }
  
  // Must be a "yes" to confirm
  if (!input.startsWith('yes') && input !== 'y' && input !== 'confirm') {
    return `Pending reset: type **yes**, **yes delete events**, or **cancel**.`;
  }
  
  // Confirm - do the reset
  const deleteEvents = input.includes('delete') && input.includes('event');
  
  // Clear the pending flag
  context.services.context.setFact('system', 'calendar_reset_pending', false, { source: 'explicit' });
  
  // Clear calendar settings from memory
  context.services.context.setFact('system', 'calendar_onboarded', false, { source: 'explicit' });
  context.services.context.setFact('system', 'calendar_setup_pending', false, { source: 'explicit' });
  context.services.context.setFact('system', 'calendar_setup_data', {}, { source: 'explicit' });
  
  // Clear preferences
  context.services.context.setFact('preference', 'timezone', null, { source: 'explicit' });
  context.services.context.setFact('preference', 'event_duration', null, { source: 'explicit' });
  context.services.context.setFact('preference', 'ambiguous_time', null, { source: 'explicit' });
  context.services.context.setFact('preference', 'week_start', null, { source: 'explicit' });
  context.services.context.setFact('preference', 'event_reminder', null, { source: 'explicit' });
  
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
  context.services.context.setFact('system', 'calendar_setup_step', 1, { source: 'explicit' });
  context.services.context.setFact('system', 'calendar_setup_data', {}, { source: 'explicit' });
  
  return `
📅 **Calendar Setup** (1/5)

**Timezone**
I detected: **${tz}** (UTC${tzSign}${tzHours})

Is this correct?
→ **yes** or type your timezone`;
}

function processSetupStep(context: import('./types.js').ToolContext, step: number, input: string): string {
  // Get accumulated data
  const dataFact = context.services.context.getFact('system', 'calendar_setup_data');
  const data = (dataFact?.value as Record<string, unknown>) || {};
  
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  switch (step) {
    case 1: // Timezone
      data.timezone = (input === 'yes' || input === 'y' || input === 'correct') ? tz : input;
      context.services.context.setFact('system', 'calendar_setup_data', data, { source: 'explicit' });
      context.services.context.setFact('system', 'calendar_setup_step', 2, { source: 'explicit' });
      return `
✓ Timezone: ${data.timezone}

📅 **Calendar Setup** (2/6)

**Default event duration**
How long are your typical meetings?

→ **30m** / **1h** / **90m**`;

    case 2: // Duration
      if (input.includes('30')) data.duration = 30;
      else if (input.includes('90')) data.duration = 90;
      else data.duration = 60;  // 1h, 1hr, 60m, hour, etc. all default to 60
      
      context.services.context.setFact('system', 'calendar_setup_data', data, { source: 'explicit' });
      context.services.context.setFact('system', 'calendar_setup_step', 3, { source: 'explicit' });
      return `
✓ Duration: ${data.duration} minutes

📅 **Calendar Setup** (3/6)

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
      context.services.context.setFact('system', 'calendar_setup_data', data, { source: 'explicit' });
      context.services.context.setFact('system', 'calendar_setup_step', 4, { source: 'explicit' });
      return `
✓ Ambiguous times: ${data.ambiguousTime}

📅 **Calendar Setup** (4/6)

**Week starts on**

→ **Sunday** or **Monday**`;

    case 4: // Week start
      data.weekStart = (input.includes('mon')) ? 'monday' : 'sunday';
      context.services.context.setFact('system', 'calendar_setup_data', data, { source: 'explicit' });
      context.services.context.setFact('system', 'calendar_setup_step', 5, { source: 'explicit' });
      return `
✓ Week starts: ${data.weekStart}

📅 **Calendar Setup** (5/6)

**Date format**
When you type dates like "1/11", how should I read them?

→ **mdy** - Month/Day (US: 1/11 = January 11)
→ **dmy** - Day/Month (intl: 1/11 = November 1)`;

    case 5: // Date format
      data.dateFormat = input.includes('dmy') ? 'dmy' : 'mdy';
      context.services.context.setFact('system', 'calendar_setup_data', data, { source: 'explicit' });
      
      // Check if Signal is configured
      const signalConfig = context.services.config.signal;
      const signalReady = signalConfig.enabled && signalConfig.number && signalConfig.recipient;
      
      if (!signalReady) {
        // Skip reminder step - Signal not configured
        data.reminder = 'none';
        context.services.context.setFact('system', 'calendar_setup_data', data, { source: 'explicit' });
        return `
✓ Date format: ${data.dateFormat === 'mdy' ? 'Month/Day (US)' : 'Day/Month (intl)'}

📅 **Calendar Setup** (6/6)

**Event reminders**
Signal notifications are not configured yet.

To enable reminders, add to .env:
  SIGNAL_ENABLED=true
  SIGNAL_CLI_PATH=/path/to/signal-cli
  SIGNAL_NUMBER=+1234567890
  SIGNAL_RECIPIENT=+0987654321

For now, setting reminders to **off**.
` + completeSetup(context, data as unknown as SetupData);
      }
      
      context.services.context.setFact('system', 'calendar_setup_step', 6, { source: 'explicit' });
      return `
✓ Date format: ${data.dateFormat === 'mdy' ? 'Month/Day (US)' : 'Day/Month (intl)'}

📅 **Calendar Setup** (6/6)

**Event reminders**
Send a Signal notification before events start?

→ **no** / **15m** / **30m** / **1h**`;

    case 6: // Reminder
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
  dateFormat: string;
  reminder: string;
}

function completeSetup(context: import('./types.js').ToolContext, data: SetupData): string {
  const { timezone, duration, ambiguousTime, weekStart, dateFormat, reminder } = data;
  
  // Store preferences in memory
  context.services.context.setFact('preference', 'timezone', timezone, { source: 'explicit' });
  context.services.context.setFact('preference', 'event_duration', duration, { source: 'explicit' });
  context.services.context.setFact('preference', 'ambiguous_time', ambiguousTime, { source: 'explicit' });
  context.services.context.setFact('preference', 'week_start', weekStart, { source: 'explicit' });
  context.services.context.setFact('preference', 'date_format', dateFormat, { source: 'explicit' });
  context.services.context.setFact('preference', 'event_reminder', reminder, { source: 'explicit' });
  
  // Clear setup state
  context.services.context.setFact('system', 'calendar_setup_step', 0, { source: 'explicit' });
  context.services.context.setFact('system', 'calendar_setup_pending', false, { source: 'explicit' });
  context.services.context.setFact('system', 'calendar_onboarded', true, { source: 'explicit' });

  const reminderDisplay = reminder === 'none' ? 'off' : reminder + ' before';
  const reminderMinutes = reminder === 'none' ? '0' : reminder;
  const dateFormatDisplay = dateFormat === 'mdy' ? 'Month/Day (US)' : 'Day/Month (intl)';
  
  return `
✓ **Calendar configured!**

Your settings:
• Timezone: ${timezone}
• Default duration: ${duration} minutes
• Ambiguous times: ${ambiguousTime}
• Week starts: ${weekStart}
• Date format: ${dateFormatDisplay}
• Reminders: ${reminderDisplay}

───────────────────────────────────────────
**Add to .env** (then restart Bartleby):

# Calendar Preferences
CALENDAR_TIMEZONE=${timezone}
CALENDAR_DEFAULT_DURATION=${duration}
CALENDAR_AMBIGUOUS_TIME=${ambiguousTime}
CALENDAR_WEEK_START=${weekStart}
CALENDAR_DATE_FORMAT=${dateFormat}
CALENDAR_EVENT_REMINDER_MINUTES=${reminderMinutes}${reminder !== 'none' ? '\nSIGNAL_ENABLED=true' : ''}
───────────────────────────────────────────

Copy these to your \`.env\` file. Bartleby reads settings from .env on startup.
Change anytime with "change calendar settings".`;
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
    context.services.context.setFact('system', 'calendar_reset_pending', true, { source: 'explicit' });
    
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
    const pendingEvent = context.services.context.getFact('system', 'event_pending_clarification');
    
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
    context.services.context.setFact('system', 'event_pending_clarification', null, { source: 'explicit' });
    
    const dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    return `✓ Created: ${event.title}\n  ${dateStr} at ${timeStr}`;
  },
};

export const calendarTools: Tool[] = [showCalendar, showToday, addEvent, eventWizardResponse, calendarSetup, resetCalendar, clarifyEventTime];

// src/tools/calendar.ts
import { Tool } from './types.js';
import { debug } from '../utils/logger.js';

export const showCalendar: Tool = {
  name: 'showCalendar',
  description: 'Show upcoming calendar events',

  routing: {
    patterns: [
      /^(show|view|list)?\s*cal(endar)?$/i,
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

    const lines: string[] = [];

    const formatReminder = (event: any): string | null => {
      if (event.reminder_minutes && event.reminder_minutes > 0) {
        const start = new Date(event.start_time);
        const reminderTime = new Date(start.getTime() - event.reminder_minutes * 60 * 1000);
        return reminderTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      }
      if (event.source_type === 'garden') {
        const tasks = context.services.scheduler.getByRelatedRecord(event.source_id, 'system');
        if (tasks.length > 0) {
          const nextRun = new Date(tasks[0].nextRun);
          return nextRun.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
      }
      return null;
    };

    if (events.length > 0) {
      lines.push('**📅 Upcoming Events**');
      for (const event of events) {
        const date = new Date(event.start_time);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = event.all_day ? 'all day' : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const reminderStr = formatReminder(event);
        const reminderNote = reminderStr ? ` (🔔 ${reminderStr})` : '';
        lines.push(`  ${dateStr} ${timeStr} - ${event.title}${reminderNote}`);
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

    const lines: string[] = ["**Today's Schedule**", ''];

    const formatReminder = (event: any): string | null => {
      if (event.reminder_minutes && event.reminder_minutes > 0) {
        const start = new Date(event.start_time);
        const reminderTime = new Date(start.getTime() - event.reminder_minutes * 60 * 1000);
        return reminderTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      }
      if (event.source_type === 'garden') {
        const tasks = context.services.scheduler.getByRelatedRecord(event.source_id, 'system');
        if (tasks.length > 0) {
          const nextRun = new Date(tasks[0].nextRun);
          return nextRun.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
      }
      return null;
    };

    if (events.length > 0) {
      lines.push('**📅 Events**');
      for (const event of events) {
        const date = new Date(event.start_time);
        const timeStr = event.all_day ? 'All day' : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const reminderStr = formatReminder(event);
        const reminderNote = reminderStr ? ` (🔔 ${reminderStr})` : '';
        lines.push(`  ${timeStr} - ${event.title}${reminderNote}`);
      }
    }

    if (deadlines.length > 0) {
      if (events.length > 0) lines.push('');
      lines.push('**⚠️ Due Today**');
      for (const dl of deadlines) {
        lines.push(`  ${dl.title}`);
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
    
    const dateStr = parsed.startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const timeStr = parsed.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    // If reminder was specified inline, create the event directly
    if (parsed.reminderMinutes !== null) {
      const endTime = new Date(parsed.startTime);
      endTime.setHours(endTime.getHours() + 1);
      
      // Build metadata for location and reminder
      const metadata: Record<string, unknown> = {};
      if (parsed.location) metadata.location = parsed.location;
      if (parsed.reminderMinutes > 0) metadata.reminder = parsed.reminderMinutes;

      // Create garden record (will auto-sync to calendar)
      const event = context.services.garden.create({
        type: 'event',
        title: parsed.title,
        status: 'active',
        start_time: parsed.startTime.toISOString(),
        end_time: endTime.toISOString(),
        all_day: parsed.allDay,
        contacts: parsed.contacts,
        metadata,
      });

      const whenStr = parsed.allDay ? dateStr : `${dateStr} at ${timeStr}`;
      let response = `✓ Created: "${event.title}"\n  ${whenStr}`;

      if (parsed.location) {
        response += `\n  📍 ${parsed.location}`;
      }
      if (parsed.contacts.length > 0) {
        response += `\n  👤 ${parsed.contacts.join(', ')}`;
      }
      if (parsed.tags.length > 0) {
        response += `\n  🏷️ ${parsed.tags.map(t => '#' + t).join(' ')}`;
      }
      if (parsed.reminderMinutes > 0) {
        response += `\n  🔔 Reminder: ${parsed.reminderMinutes}m before`;
      }

      // Set pending prompt for content/description
      context.services.context.setFact('system', 'pending_prompt', {
        recordId: event.id,
        recordType: 'event',
        recordTitle: event.title,
      }, { source: 'explicit' });

      return response + '\n\nDescription/notes (optional, Enter to skip):';
    }
    
    // Otherwise ask about reminder (carry contacts/location/tags through wizard)
    context.services.context.setFact('system', 'event_wizard_pending', {
      step: 'reminder',
      title: parsed.title,
      startTime: parsed.startTime.toISOString(),
      allDay: parsed.allDay,
      contacts: parsed.contacts,
      location: parsed.location,
      tags: parsed.tags,
    }, { source: 'explicit' });
    
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
  allDay: boolean;
  ambiguousHour: number | null;
  minute: number;
  reminderMinutes: number | null;
  contacts: string[];
  location: string | null;
  tags: string[];
} {
  let startTime = new Date();
  let hasTime = false;
  let ambiguousHour: number | null = null;
  let minute = 0;
  let reminderMinutes: number | null = null;
  let contacts: string[] = [];
  let location: string | null = null;
  let tags: string[] = [];
  
  // Remove command prefix
  let text = input
    .replace(/^(new|add|create)\s+event:?\s*/i, '')
    .replace(/^schedule\s*/i, '')
    .trim();
  
  // === KEYWORD-BASED PARSING ===
  // Supports: "picnic when sunday noon who nicole where lakeside"
  // Also supports colon-style: "time: 1/17 10am who:eileen where: HSR"
  
  // Extract "when <datetime>" or "time: <datetime>" - everything until next keyword or end
  const whenMatch = text.match(/\b(?:when|time)\s*:?\s*([^,]+?)(?=\s+(?:who|where|with)\b|\s+who:|\s+where:|\s*,|\s*$)/i);
  let whenClause: string | null = null;
  if (whenMatch) {
    whenClause = whenMatch[1].trim();
    text = text.replace(whenMatch[0], '').trim();
  }
  
  // Extract "who <names>" or "who: <names>" - space or comma separated names until next keyword
  const whoMatch = text.match(/\bwho\s*:?\s*([^,]+?)(?=\s+(?:when|time|where|with)\b|\s+when:|\s+time:|\s+where:|\s*,|\s*$)/i);
  if (whoMatch) {
    // Split by comma or space, filter empty
    const names = whoMatch[1].split(/[,\s]+/).filter(n => n.length > 0);
    contacts.push(...names);
    text = text.replace(whoMatch[0], '').trim();
  }
  
  // Extract "where <location>" or "where: <location>" - until next keyword or comma
  const whereMatch = text.match(/\bwhere\s*:?\s*([^,]+?)(?=\s+(?:when|time|who|with)\b|\s+when:|\s+time:|\s+who:|\s*,|\s*$)/i);
  if (whereMatch) {
    location = whereMatch[1].trim();
    text = text.replace(whereMatch[0], '').trim();
  }
  
  // Extract reminder: "1h reminder", "15m reminder", "30 min reminder"
  const reminderMatch = text.match(/(\d+)\s*(h(?:our)?|m(?:in(?:ute)?)?)\s*(?:reminder|before)?/i);
  if (reminderMatch) {
    const val = parseInt(reminderMatch[1], 10);
    const unit = reminderMatch[2].toLowerCase();
    reminderMinutes = unit.startsWith('h') ? val * 60 : val;
    text = text.replace(reminderMatch[0], '').trim();
  }
  
  // Also check older format: "remind me 15m before", "with 15m reminder"  
  if (reminderMinutes === null) {
    const oldReminderMatch = text.match(/(?:with\s+)?(\d+)\s*m(?:in(?:ute)?s?)?\s+(?:reminder|before)|remind(?:er)?(?:\s+me)?\s+(\d+)\s*m(?:in(?:ute)?s?)?(?:\s+before)?/i);
    if (oldReminderMatch) {
      reminderMinutes = parseInt(oldReminderMatch[1] || oldReminderMatch[2], 10);
      text = text.replace(oldReminderMatch[0], '').trim();
    }
  }
  
  // Remove "via signal" or similar (for future notification routing)
  text = text.replace(/\bvia\s+(signal|sms|email)\b/gi, '').trim();
  
  // Remove @context tags (events don't use contexts)
  text = text.replace(/@\w+/g, '').trim();
  
  // === FREEFORM PARSING (fallback if no keywords used) ===
  
  // Extract "with <person>" - but not "with 15m reminder" (already handled)
  if (contacts.length === 0) {
    const withMatch = text.match(/\bwith\s+([a-zA-Z][a-zA-Z\s]*?)(?=\s*$|\s*,|\s+(?:at|on|for)\b)/gi);
    if (withMatch) {
      for (const match of withMatch) {
        const person = match.replace(/^with\s+/i, '').trim();
        if (person && !person.match(/^\d+\s*m/i)) {
          contacts.push(person);
        }
      }
      text = text.replace(/\bwith\s+([a-zA-Z][a-zA-Z\s]*?)(?=\s*$|\s*,|\s+(?:at|on|for)\b)/gi, '').trim();
    }
  }
  
  // Extract "at <location>" - but not time like "at 9am"
  if (!location) {
    const atLocationMatch = text.match(/\bat\s+(?![\d])(the\s+)?([a-zA-Z][a-zA-Z\s']+?)(?=\s*$|\s*,|\s+(?:with|on|for)\b)/i);
    if (atLocationMatch) {
      location = (atLocationMatch[1] || '') + atLocationMatch[2];
      text = text.replace(atLocationMatch[0], '').trim();
    }
  }
  
  // Extract #tags
  const tagMatches = text.match(/#(\w+)/g);
  if (tagMatches) {
    tags = tagMatches.map(t => t.slice(1));
    text = text.replace(/#\w+/g, '').trim();
  }
  
  // If we extracted a "when" clause, parse it for date/time and prepend to remaining text
  if (whenClause) {
    text = whenClause + (text ? ' ' + text : '');
  }
  
  // Check for date-first format: 1/22/26 7:30am [title]
  // Title is optional (wizard mode provides just date/time)
  const dateFirstMatch = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?(?:\s+(.+))?$/i);
  if (dateFirstMatch) {
    const [, m, d, y, hour, min, ampm, titlePart = ''] = dateFirstMatch;
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

    return { title: titlePart.trim(), startTime, hasTime, allDay: false, ambiguousHour, minute, reminderMinutes, contacts, location, tags };
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
  
  // Check for day of week (sun, mon, tue/tues, wed, thu/thur/thurs, fri, sat)
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayMatch = text.match(/\b(sun|mon|tue|wed|thu|fri|sat)(?:day|s|sday|nes|nesday|urs|rsday|ur|r|ri|riday)?\b/i);
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
  
  // Check for "tonight" (today at 8pm default)
  if (/\btonight\b/i.test(text)) {
    startTime.setHours(20, 0, 0, 0); // 8pm
    hasTime = true;
    text = text.replace(/\btonight\b/gi, '').trim();
  }
  
  // Check for "this morning" / "this afternoon" / "this evening"
  if (/\bthis\s+morning\b/i.test(text)) {
    startTime.setHours(9, 0, 0, 0);
    hasTime = true;
    text = text.replace(/\bthis\s+morning\b/gi, '').trim();
  } else if (/\bthis\s+afternoon\b/i.test(text)) {
    startTime.setHours(14, 0, 0, 0);
    hasTime = true;
    text = text.replace(/\bthis\s+afternoon\b/gi, '').trim();
  } else if (/\bthis\s+evening\b/i.test(text)) {
    startTime.setHours(18, 0, 0, 0);
    hasTime = true;
    text = text.replace(/\bthis\s+evening\b/gi, '').trim();
  }
  
  // Check for tomorrow (with optional time of day modifier)
  if (/\btomorrow\s+night\b/i.test(text)) {
    startTime.setDate(startTime.getDate() + 1);
    startTime.setHours(20, 0, 0, 0); // 8pm
    hasTime = true;
    text = text.replace(/\btomorrow\s+night\b/gi, '').trim();
  } else if (/\btomorrow\s+morning\b/i.test(text)) {
    startTime.setDate(startTime.getDate() + 1);
    startTime.setHours(9, 0, 0, 0);
    hasTime = true;
    text = text.replace(/\btomorrow\s+morning\b/gi, '').trim();
  } else if (/\btomorrow\s+afternoon\b/i.test(text)) {
    startTime.setDate(startTime.getDate() + 1);
    startTime.setHours(14, 0, 0, 0);
    hasTime = true;
    text = text.replace(/\btomorrow\s+afternoon\b/gi, '').trim();
  } else if (/\btomorrow\s+evening\b/i.test(text)) {
    startTime.setDate(startTime.getDate() + 1);
    startTime.setHours(18, 0, 0, 0);
    hasTime = true;
    text = text.replace(/\btomorrow\s+evening\b/gi, '').trim();
  } else if (/\btomorrow\b/i.test(text)) {
    startTime.setDate(startTime.getDate() + 1);
    text = text.replace(/\btomorrow\b/gi, '').trim();
  }
  
  // Check for today
  if (/\btoday\b/i.test(text)) {
    text = text.replace(/\btoday\b/gi, '').trim();
  }

  // === NATURAL LANGUAGE DATE PARSING ===

  // Month names support: "March 15", "15 March", "Mar 15"
  const MONTHS: Record<string, number> = {
    'january': 0, 'jan': 0,
    'february': 1, 'feb': 1,
    'march': 2, 'mar': 2,
    'april': 3, 'apr': 3,
    'may': 4,
    'june': 5, 'jun': 5,
    'july': 6, 'jul': 6,
    'august': 7, 'aug': 7,
    'september': 8, 'sep': 8, 'sept': 8,
    'october': 9, 'oct': 9,
    'november': 10, 'nov': 10,
    'december': 11, 'dec': 11,
  };

  // Check for "March 15" or "Mar 15"
  const monthDayMatch = text.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (monthDayMatch) {
    const monthName = monthDayMatch[1].toLowerCase();
    const day = parseInt(monthDayMatch[2], 10);
    const month = MONTHS[monthName];

    if (month !== undefined) {
      const date = new Date(startTime);
      date.setMonth(month);
      date.setDate(day);

      // If date already passed this year, use next year
      if (date < new Date()) {
        date.setFullYear(date.getFullYear() + 1);
      }

      startTime = date;
      text = text.replace(monthDayMatch[0], '').trim();
    }
  }

  // Check for "15 March" or "15 Mar" (European format)
  const dayMonthMatch = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/i);
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1], 10);
    const monthName = dayMonthMatch[2].toLowerCase();
    const month = MONTHS[monthName];

    if (month !== undefined) {
      const date = new Date(startTime);
      date.setMonth(month);
      date.setDate(day);

      // If date already passed this year, use next year
      if (date < new Date()) {
        date.setFullYear(date.getFullYear() + 1);
      }

      startTime = date;
      text = text.replace(dayMonthMatch[0], '').trim();
    }
  }

  // Relative days: "next week"
  if (/\bnext\s+week\b/i.test(text)) {
    startTime.setDate(startTime.getDate() + 7);
    text = text.replace(/\bnext\s+week\b/gi, '').trim();
  }

  // Relative days: "in N days" or "N days from now"
  const inDaysMatch = text.match(/\b(?:in\s+)?(\d+)\s+days?(?:\s+from\s+now)?\b/i);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    startTime.setDate(startTime.getDate() + days);
    text = text.replace(inDaysMatch[0], '').trim();
  }

  // Relative times: "in N hours" or "N hours from now"
  const inHoursMatch = text.match(/\b(?:in\s+)?(\d+)\s+hours?(?:\s+from\s+now)?\b/i);
  if (inHoursMatch) {
    const hours = parseInt(inHoursMatch[1], 10);
    startTime.setHours(startTime.getHours() + hours);
    hasTime = true;
    text = text.replace(inHoursMatch[0], '').trim();
  }

  // Relative times: "in N minutes" or "N minutes from now"
  const inMinutesMatch = text.match(/\b(?:in\s+)?(\d+)\s+min(?:ute)?s?(?:\s+from\s+now)?\b/i);
  if (inMinutesMatch) {
    const minutes = parseInt(inMinutesMatch[1], 10);
    startTime.setMinutes(startTime.getMinutes() + minutes);
    hasTime = true;
    text = text.replace(inMinutesMatch[0], '').trim();
  }

  // Week references: "next Monday", "next Tuesday", etc.
  const WEEKDAYS: Record<string, number> = {
    'sunday': 0, 'sun': 0,
    'monday': 1, 'mon': 1,
    'tuesday': 2, 'tue': 2, 'tues': 2,
    'wednesday': 3, 'wed': 3,
    'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
    'friday': 5, 'fri': 5,
    'saturday': 6, 'sat': 6,
  };

  const nextWeekdayMatch = text.match(/\bnext\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/i);
  if (nextWeekdayMatch) {
    const dayName = nextWeekdayMatch[1].toLowerCase();
    const targetDay = WEEKDAYS[dayName];

    if (targetDay !== undefined) {
      const today = startTime.getDay();
      let daysUntil = targetDay - today;

      // "next Monday" means the Monday of next week (at least 7 days away)
      if (daysUntil <= 0) daysUntil += 7;
      else daysUntil += 7; // Force next week

      startTime.setDate(startTime.getDate() + daysUntil);
      text = text.replace(nextWeekdayMatch[0], '').trim();
    }
  }

  // Week references: "this Friday", "this Monday", etc.
  const thisWeekdayMatch = text.match(/\bthis\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/i);
  if (thisWeekdayMatch) {
    const dayName = thisWeekdayMatch[1].toLowerCase();
    const targetDay = WEEKDAYS[dayName];

    if (targetDay !== undefined) {
      const today = startTime.getDay();
      let daysUntil = targetDay - today;

      // "this Friday" means this week's Friday (0-6 days away)
      if (daysUntil < 0) daysUntil += 7;

      startTime.setDate(startTime.getDate() + daysUntil);
      text = text.replace(thisWeekdayMatch[0], '').trim();
    }
  }

  // === END NATURAL LANGUAGE DATE PARSING ===

  // Extract am/pm first (anywhere in text) - use simple string check
  const textLower = text.toLowerCase();
  const hasSpaceAm = textLower.includes(' am');
  const endsWithAm = textLower.endsWith('am');
  const hasSpacePm = textLower.includes(' pm');
  const endsWithPm = textLower.endsWith('pm');
  const ampm = hasSpaceAm || endsWithAm ? 'am' :
               hasSpacePm || endsWithPm ? 'pm' : null;
  
  // Match time: HH:MM or just H (with "at" prefix or am/pm suffix)
  const timeMatch = 
    text.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?/i) ||   // HH:MM [am/pm]
    text.match(/\bat\s+(\d{1,2})(?:\s*(am|pm))?\b/i) ||           // at H [am/pm]
    text.match(/\b(\d{1,2})\s*(am|pm)\b/i);                       // H am/pm
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    minute = timeMatch[2] && /^\d+$/.test(timeMatch[2]) ? parseInt(timeMatch[2], 10) : 0;
    
    // Get am/pm from match or from earlier detection
    const matchAmpm = (timeMatch[3] || timeMatch[2] || '').toLowerCase();
    const finalAmpm = (matchAmpm === 'am' || matchAmpm === 'pm') ? matchAmpm : ampm;
    
    if (finalAmpm === 'pm' && hour < 12) hour += 12;
    if (finalAmpm === 'am' && hour === 12) hour = 0;
    if (!finalAmpm && hour >= 1 && hour <= 12) {
      ambiguousHour = hour;
      if (hour >= 1 && hour <= 6) hour += 12;
    }
    
    startTime.setHours(hour, minute, 0, 0);
    hasTime = true;
    text = text.replace(timeMatch[0], '').trim();
  }
  
  // Clean up am/pm remnants, filler words, and extra punctuation
  text = text
    .replace(/\b(am|pm)\b/gi, '')
    .replace(/\b(on|for|at)\b/gi, '')
    .replace(/,\s*,/g, ',')           // double commas
    .replace(/,\s*$/g, '')            // trailing comma
    .replace(/^\s*,/g, '')            // leading comma
    .replace(/\s+/g, ' ')
    .trim();

  // All-day events are those without a specific time
  const allDay = !hasTime;

  return { title: text, startTime, hasTime, allDay, ambiguousHour, minute, reminderMinutes, contacts, location, tags };
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
      allDay?: boolean;
      ambiguousHour?: number;
      minute?: number;
      baseDate?: string;
      reminderMinutes?: number;
      contacts?: string[];
      location?: string | null;
      tags?: string[];
    };
    
    const input = context.input.trim();
    
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

        // Check if we parsed a date successfully
        // For all-day events, parsed.hasTime will be false but we should have a valid date
        const now = new Date();
        const timeDiff = Math.abs(parsed.startTime.getTime() - now.getTime());
        const parsedDate = timeDiff > 60000; // More than 1 minute difference means we parsed something

        if (!parsed.hasTime && !parsedDate) {
          // Couldn't parse - try again
          return "I didn't understand that. Try: tomorrow 3pm, friday, 1/22 7:30am, or next week";
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
          allDay: parsed.allDay,
        }, { source: 'explicit' });
        
        const dateStr = parsed.startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        const timeStr = parsed.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const whenStr = parsed.allDay ? dateStr : `${dateStr} at ${timeStr}`;

        return `📅 **"${title}"**\n  ${whenStr}\n\nReminder?\n→ **none** / **15m** / **30m** / **1h**`;
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
          allDay: false, // If we're in ampm step, it's not all-day
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
        
        // If contacts/location/tags were already parsed inline, skip extras step
        const hasExtras = (state.contacts && state.contacts.length > 0) || 
                          state.location || 
                          (state.tags && state.tags.length > 0);
        
        if (hasExtras) {
          // Create event directly with pre-parsed extras
          const startTime = new Date(state.startTime!);
          const endTime = new Date(startTime);
          endTime.setHours(endTime.getHours() + 1);
          
          // Resolve contact names to IDs
          let contactIds: string[] = [];
          let contactNames: string[] = [];
          let contactsCreated: string[] = [];
          
          if (state.contacts && state.contacts.length > 0) {
            const resolution = context.services.garden.resolveContacts(state.contacts);
            
            // Add resolved contacts
            for (const c of resolution.resolved) {
              contactIds.push(c.id);
              contactNames.push(c.title);
            }
            
            // Auto-create unresolved contacts
            for (const name of resolution.unresolved) {
              const newContact = context.services.garden.addContact(name);
              contactIds.push(newContact.id);
              contactNames.push(name);
              contactsCreated.push(name);
            }
            
            // For ambiguous, just use the name (user can clarify later)
            for (const { name } of resolution.ambiguous) {
              contactNames.push(name + ' (?)');
            }
          }
          
          const metadata: Record<string, unknown> = {};
          if (state.location) metadata.location = state.location;
          if (reminderMinutes > 0) metadata.reminder = reminderMinutes;
          if (state.tags && state.tags.length > 0) metadata.tags = state.tags;

          // Create garden record (will auto-sync to calendar)
          const event = context.services.garden.create({
            type: 'event',
            title: state.title!,
            status: 'active',
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            all_day: state.allDay || false,
            contacts: contactIds,
            metadata,
          });
          
          // Clear wizard state
          context.services.context.setFact('system', 'event_wizard_pending', null, { source: 'explicit' });
          
          const dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
          const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          
          let response = `✓ Created: "${event.title}"\n  ${dateStr} at ${timeStr}`;
          
          if (state.location) {
            response += `\n  📍 ${state.location}`;
          }
          if (contactNames.length > 0) {
            response += `\n  👤 ${contactNames.join(', ')}`;
          }
          if (state.tags && state.tags.length > 0) {
            response += `\n  🏷️ ${state.tags.map((t: string) => '#' + t).join(' ')}`;
          }
          if (contactsCreated.length > 0) {
            response += `\n✓ Created contact(s): ${contactsCreated.join(', ')}`;
          }
          if (reminderMinutes > 0) {
            response += `\n  🔔 Reminder: ${reminderMinutes}m before`;
          }

          // Set pending prompt for content/description
          context.services.context.setFact('system', 'pending_prompt', {
            recordId: event.id,
            recordType: 'event',
            recordTitle: event.title,
          }, { source: 'explicit' });

          return response + '\n\nDescription/notes (optional, Enter to skip):';
        }
        
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
        let parsedContactNames: string[] = [];
        let tags: string[] = [];
        
        const text = input.trim();
        
        if (text && text !== '') {
          // Extract "with <person>" or "with <person1>, <person2>"
          const withMatch = text.match(/with\s+([^,#@]+?)(?=,\s*(?:at|#)|,\s*$|$)/gi);
          if (withMatch) {
            for (const match of withMatch) {
              const person = match.replace(/^with\s+/i, '').trim();
              if (person) parsedContactNames.push(person);
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
        
        // Resolve contact names to IDs
        let contactIds: string[] = [];
        let contactNames: string[] = [];
        let contactsCreated: string[] = [];
        
        if (parsedContactNames.length > 0) {
          const resolution = context.services.garden.resolveContacts(parsedContactNames);
          
          for (const c of resolution.resolved) {
            contactIds.push(c.id);
            contactNames.push(c.title);
          }
          
          for (const name of resolution.unresolved) {
            const newContact = context.services.garden.addContact(name);
            contactIds.push(newContact.id);
            contactNames.push(name);
            contactsCreated.push(name);
          }
          
          for (const { name } of resolution.ambiguous) {
            contactNames.push(name + ' (?)');
          }
        }
        
        // Create the event!
        const startTime = new Date(state.startTime!);
        const endTime = new Date(startTime);
        endTime.setHours(endTime.getHours() + 1);
        
        const reminderMinutes = state.reminderMinutes || 0;
        
        // Build metadata
        const metadata: Record<string, unknown> = {};
        if (location) metadata.location = location;
        if (reminderMinutes > 0) metadata.reminder = reminderMinutes;
        if (tags.length > 0) metadata.tags = tags;

        // Create garden record (will auto-sync to calendar)
        const event = context.services.garden.create({
          type: 'event',
          title: state.title!,
          status: 'active',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          all_day: state.allDay || false,
          contacts: contactIds,
          metadata,
        });
        
        // Clear wizard state
        context.services.context.setFact('system', 'event_wizard_pending', null, { source: 'explicit' });
        
        const dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        
        let response = `✓ Created: ${event.title}\n  ${dateStr} at ${timeStr}`;
        
        if (location) {
          response += `\n  📍 ${location}`;
        }
        if (contactNames.length > 0) {
          response += `\n  👤 ${contactNames.join(', ')}`;
        }
        if (tags.length > 0) {
          response += `\n  🏷️ ${tags.map(t => '#' + t).join(' ')}`;
        }
        if (contactsCreated.length > 0) {
          response += `\n✓ Created contact(s): ${contactsCreated.join(', ')}`;
        }
        if (reminderMinutes > 0) {
          response += `\n  🔔 Reminder: ${reminderMinutes}m before`;
        }

        // Set pending prompt for content/description
        context.services.context.setFact('system', 'pending_prompt', {
          recordId: event.id,
          recordType: 'event',
          recordTitle: event.title,
        }, { source: 'explicit' });

        return response + '\n\nDescription/notes (optional, Enter to skip):';
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
    
    // Create garden record (will auto-sync to calendar)
    const event = context.services.garden.create({
      type: 'event',
      title,
      status: 'active',
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      all_day: false,
    });

    // Clear pending state
    context.services.context.setFact('system', 'event_pending_clarification', null, { source: 'explicit' });

    const dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    // Set pending prompt for content/description
    context.services.context.setFact('system', 'pending_prompt', {
      recordId: event.id,
      recordType: 'event',
      recordTitle: event.title,
    }, { source: 'explicit' });

    return `✓ Created: ${event.title}\n  ${dateStr} at ${timeStr}\n\nDescription/notes (optional, Enter to skip):`;
  },
};

// Edit Event Tool
export const editEvent: Tool = {
  name: 'editEvent',
  description: 'Edit or reschedule an existing event',

  routing: {
    patterns: [
      /^(edit|change|update)\s+event\s+(.+)$/i,
      /^reschedule\s+(.+?)\s+to\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['edit', 'change', 'update', 'reschedule'],
      nouns: ['event'],
    },
    examples: [
      'reschedule team meeting to tomorrow 3pm',
      'edit event dentist',
      'reschedule standup to next Monday 9am',
    ],
    priority: 85,
  },

  execute: async (args, context) => {
    const input = context.input;

    // Parse: "reschedule team meeting to tomorrow 3pm"
    const rescheduleMatch = input.match(/^reschedule\s+(.+?)\s+to\s+(.+)$/i);
    if (rescheduleMatch) {
      const eventName = rescheduleMatch[1].trim();
      const newTime = rescheduleMatch[2].trim();

      // Find event by title (fuzzy match)
      const events = context.services.garden.getByType('event');
      const event = events.find(e =>
        e.title.toLowerCase().includes(eventName.toLowerCase())
      );

      if (!event) {
        // Try to list similar events
        const similar = events.filter(e =>
          eventName.toLowerCase().split(' ').some(word =>
            e.title.toLowerCase().includes(word)
          )
        );

        if (similar.length > 0) {
          const list = similar.slice(0, 5).map(e => `  • ${e.title}`).join('\n');
          return `Event not found: "${eventName}"\n\nDid you mean one of these?\n${list}`;
        }

        return `Event not found: "${eventName}"\n\nUse "show events" to see all events.`;
      }

      // Parse new time using existing parser
      const parsed = parseEventInput(`temp event ${newTime}`);
      if (!parsed || !parsed.startTime) {
        return `Could not parse time: "${newTime}"\n\nTry formats like:\n  • tomorrow 3pm\n  • next Monday 10am\n  • March 15 at 2pm\n  • in 2 hours`;
      }

      // Calculate new end time (preserve duration)
      const oldStart = new Date(event.start_time!);
      const oldEnd = new Date(event.end_time!);
      const duration = oldEnd.getTime() - oldStart.getTime();
      const newEnd = new Date(parsed.startTime.getTime() + duration);

      // Update event
      const updated = context.services.garden.update(event.id, {
        start_time: parsed.startTime.toISOString(),
        end_time: newEnd.toISOString(),
      });

      if (!updated) {
        return `Failed to reschedule event.`;
      }

      // Format response
      const dateStr = parsed.startTime.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
      });
      const timeStr = parsed.startTime.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit'
      });

      return `✓ Rescheduled: "${event.title}"\n  ${dateStr} at ${timeStr}`;
    }

    // Parse: "edit event team meeting"
    const editMatch = input.match(/^(edit|change|update)\s+event\s+(.+)$/i);
    if (editMatch) {
      const eventName = editMatch[2].trim();

      // Find event
      const events = context.services.garden.getByType('event');
      const event = events.find(e =>
        e.title.toLowerCase().includes(eventName.toLowerCase())
      );

      if (!event) {
        // Try to list similar events
        const similar = events.filter(e =>
          eventName.toLowerCase().split(' ').some(word =>
            e.title.toLowerCase().includes(word)
          )
        );

        if (similar.length > 0) {
          const list = similar.slice(0, 5).map(e => `  • ${e.title}`).join('\n');
          return `Event not found: "${eventName}"\n\nDid you mean one of these?\n${list}`;
        }

        return `Event not found: "${eventName}"\n\nUse "show events" to see all events.`;
      }

      // Show current details and prompt for changes
      const startDate = new Date(event.start_time!);
      const endDate = new Date(event.end_time!);
      const dateStr = startDate.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
      });
      const timeStr = startDate.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit'
      });
      const durationMins = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

      let response = `📅 **${event.title}**\n`;
      response += `  When: ${dateStr} at ${timeStr}\n`;
      response += `  Duration: ${durationMins} minutes\n`;
      if (event.metadata?.location) response += `  📍 ${event.metadata.location}\n`;
      if (event.contacts && event.contacts.length > 0) {
        const contactNames = event.contacts.map(id => {
          const contact = context.services.garden.get(id);
          return contact ? contact.title : id;
        });
        response += `  👤 ${contactNames.join(', ')}\n`;
      }
      if (event.content) {
        const preview = event.content.substring(0, 60);
        const ellipsis = event.content.length > 60 ? '...' : '';
        response += `  📝 ${preview}${ellipsis}\n`;
      }

      response += `\n**What would you like to change?**\n`;
      response += `  • time <new-time> - Reschedule event\n`;
      response += `  • title <new-title> - Rename event\n`;
      response += `  • location <place> - Change location\n`;
      response += `  • description <text> - Update description\n`;
      response += `  • done - Finish editing\n\n`;
      response += `Example: time tomorrow 3pm`;

      // Set wizard state for multi-step editing
      context.services.context.setFact('system', 'event_edit_pending', {
        eventId: event.id,
      }, { source: 'explicit' });

      return response;
    }

    return 'Usage:\n  • reschedule <event> to <new-time>\n  • edit event <name>';
  },
};

// Handle event editing wizard responses
export const eventEditResponse: Tool = {
  name: 'eventEditResponse',
  description: 'Handle responses during event editing',

  routing: {
    patterns: [], // No patterns - uses shouldHandle
    priority: 100,
  },

  shouldHandle: async (input, context) => {
    const pending = context.services.context.getFact('system', 'event_edit_pending');
    return !!pending?.value;
  },

  execute: async (args, context) => {
    const input = context.input.trim();
    const pendingData = context.services.context.getFact('system', 'event_edit_pending')?.value as { eventId: string };

    if (!pendingData?.eventId) {
      return 'No event being edited.';
    }

    const event = context.services.garden.get(pendingData.eventId);
    if (!event) {
      context.services.context.setFact('system', 'event_edit_pending', null, { source: 'explicit' });
      return 'Event not found.';
    }

    // Handle "done" - finish editing
    if (/^done$/i.test(input)) {
      context.services.context.setFact('system', 'event_edit_pending', null, { source: 'explicit' });
      return `✓ Finished editing "${event.title}"`;
    }

    // Handle "time <new-time>" - reschedule
    const timeMatch = input.match(/^time\s+(.+)$/i);
    if (timeMatch) {
      const newTime = timeMatch[1].trim();

      // Parse new time
      const parsed = parseEventInput(`temp event ${newTime}`);
      if (!parsed || !parsed.startTime) {
        return `Could not parse time: "${newTime}"\n\nTry again or type "done" to finish.`;
      }

      // Calculate new end time (preserve duration)
      const oldStart = new Date(event.start_time!);
      const oldEnd = new Date(event.end_time!);
      const duration = oldEnd.getTime() - oldStart.getTime();
      const newEnd = new Date(parsed.startTime.getTime() + duration);

      // Update event
      context.services.garden.update(event.id, {
        start_time: parsed.startTime.toISOString(),
        end_time: newEnd.toISOString(),
      });

      const dateStr = parsed.startTime.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
      });
      const timeStr = parsed.startTime.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit'
      });

      return `✓ Rescheduled to ${dateStr} at ${timeStr}\n\nWhat else? (or type "done")`;
    }

    // Handle "title <new-title>" - rename
    const titleMatch = input.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      const newTitle = titleMatch[1].trim();

      context.services.garden.update(event.id, {
        title: newTitle,
      });

      return `✓ Renamed to "${newTitle}"\n\nWhat else? (or type "done")`;
    }

    // Handle "location <place>" - change location
    const locationMatch = input.match(/^location\s+(.+)$/i);
    if (locationMatch) {
      const newLocation = locationMatch[1].trim();

      const metadata = event.metadata || {};
      metadata.location = newLocation;

      context.services.garden.update(event.id, {
        metadata,
      });

      return `✓ Location changed to "${newLocation}"\n\nWhat else? (or type "done")`;
    }

    // Handle "description <text>" - update description
    const descMatch = input.match(/^description\s+(.+)$/i);
    if (descMatch) {
      const newDesc = descMatch[1].trim();

      context.services.garden.update(event.id, {
        content: newDesc,
      });

      return `✓ Description updated\n\nWhat else? (or type "done")`;
    }

    // Unknown command
    return `Unknown command: "${input}"\n\nAvailable commands:\n  • time <new-time>\n  • title <new-title>\n  • location <place>\n  • description <text>\n  • done`;
  },
};

export const calendarTools: Tool[] = [
  showCalendar,
  showToday,
  addEvent,
  eventWizardResponse,
  editEvent,
  eventEditResponse,
  calendarSetup,
  resetCalendar,
  clarifyEventTime,
];

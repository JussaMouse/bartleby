# Next Calendar Upgrade Plan

## Priority Ranking

Based on user value and implementation complexity:

1. **Natural Language Date Parsing** (High value, Medium complexity)
2. **Edit Event Tool** (High value, Low complexity)
3. **System Views Initialization** (Medium value, Low complexity)
4. **All-Day Events Enhancement** (Medium value, Low complexity)
5. **Enhanced Query Parser** (Low value, High complexity)
6. **Recurring Events** (High value, Very high complexity)

---

## 1. Natural Language Date Parsing (RECOMMENDED NEXT)

### Current State
- Basic `Date()` parsing works for: "2026-02-15", "tomorrow 2pm", "friday 3pm"
- calendar.ts has manual parser (lines 304-568) with regex patterns
- Handles: tomorrow, today, weekdays, MM/DD, "at 3pm"
- Does NOT handle: "next week", "in 2 hours", month names, relative times

### Goal
Enhance date parsing to handle natural expressions users expect.

### Implementation Plan

#### Phase 1: Extend Existing Parser (No Dependencies)

**File:** `src/tools/calendar.ts` lines 304-568 (parseEventInput function)

**Add support for:**

1. **Relative days:**
   - "next week" → +7 days
   - "in 3 days" → +3 days
   - "3 days from now" → +3 days

2. **Month names:**
   - "March 15" → 2026-03-15
   - "15 March" → 2026-03-15 (European format)
   - "Mar 15" → 2026-03-15 (abbreviated)

3. **Relative times:**
   - "in 2 hours" → current time + 2h
   - "in 30 minutes" → current time + 30m
   - "30 minutes from now" → same

4. **Week references:**
   - "next Monday" → next occurrence of Monday
   - "this Friday" → this week's Friday
   - "Monday next week" → Monday of next week

5. **Combined patterns:**
   - "next Tuesday at 3pm"
   - "March 15 at 10am"
   - "in 2 days at 2pm"

**Implementation Steps:**

```typescript
// 1. Add month name map
const MONTHS = {
  'january': 0, 'jan': 0,
  'february': 1, 'feb': 1,
  // ... all months
};

// 2. Add relative day patterns
if (/next\s+week/i.test(input)) {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
}

if (/in\s+(\d+)\s+(day|days)/i.test(input)) {
  const match = input.match(/in\s+(\d+)\s+(day|days)/i);
  const days = parseInt(match[1]);
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

// 3. Add relative time patterns
if (/in\s+(\d+)\s+(hour|hours)/i.test(input)) {
  const match = input.match(/in\s+(\d+)\s+(hour|hours)/i);
  const hours = parseInt(match[1]);
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date;
}

// 4. Add month name parsing
if (/([a-z]+)\s+(\d{1,2})/i.test(input)) {
  const match = input.match(/([a-z]+)\s+(\d{1,2})/i);
  const monthName = match[1].toLowerCase();
  const day = parseInt(match[2]);

  if (MONTHS[monthName] !== undefined) {
    const date = new Date();
    date.setMonth(MONTHS[monthName]);
    date.setDate(day);
    // If date already passed this year, use next year
    if (date < new Date()) {
      date.setFullYear(date.getFullYear() + 1);
    }
    return date;
  }
}

// 5. Add "next [weekday]" parsing
if (/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(input)) {
  const match = input.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  const targetDay = WEEKDAYS[match[1].toLowerCase()];
  const today = new Date();
  const currentDay = today.getDay();

  // Calculate days until next occurrence
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7; // Must be next week

  today.setDate(today.getDate() + daysUntil);
  return today;
}
```

**Testing:**
```bash
> new event team meeting next Tuesday at 3pm
> new event dentist March 15 at 2pm
> new event call in 2 hours
> new event standup in 30 minutes
```

**Effort:** 2-3 hours
**Risk:** Low (extends existing code, no new dependencies)
**Value:** High (major UX improvement)

#### Phase 2: Alternative - Add chrono-node Library (Optional)

If Phase 1 becomes too complex or buggy, consider adding chrono-node:

```bash
npm install chrono-node
```

**Pros:**
- Handles complex natural language: "next Tuesday at 3pm", "in 2 weeks", "Christmas Eve"
- Well-tested library
- Supports multiple languages

**Cons:**
- External dependency (adds ~100KB)
- Less control over parsing behavior
- May parse dates differently than expected

**Implementation:**
```typescript
import * as chrono from 'chrono-node';

function parseEventInput(input: string): Date | null {
  const results = chrono.parse(input);
  if (results.length === 0) return null;
  return results[0].start.date();
}
```

**Recommendation:** Try Phase 1 first. Only add chrono-node if patterns become unmanageable.

---

## 2. Edit Event Tool (HIGH PRIORITY)

### Current State
- No dedicated event editing tool
- Users must use generic `edit` command or manually edit markdown
- Awkward UX for changing event times

### Goal
Create dedicated tool for editing events with natural language.

### Implementation

**File:** `src/tools/calendar.ts` (new tool)

```typescript
export const editEvent: Tool = {
  name: 'editEvent',
  description: 'Edit an existing event',

  routing: {
    patterns: [
      /^(edit|change|update)\s+event\s+(.+)$/i,
      /^reschedule\s+(.+)\s+to\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['edit', 'change', 'update', 'reschedule'],
      nouns: ['event'],
    },
    priority: 85,
  },

  execute: async (args, context) => {
    const input = context.input;

    // Parse: "reschedule team meeting to tomorrow 3pm"
    const rescheduleMatch = input.match(/^reschedule\s+(.+?)\s+to\s+(.+)$/i);
    if (rescheduleMatch) {
      const eventName = rescheduleMatch[1];
      const newTime = rescheduleMatch[2];

      // Find event by title
      const events = context.services.garden.getByType('event');
      const event = events.find(e =>
        e.title.toLowerCase().includes(eventName.toLowerCase())
      );

      if (!event) {
        return `Event not found: "${eventName}"`;
      }

      // Parse new time
      const parsed = parseEventInput(newTime);
      if (!parsed || !parsed.startTime) {
        return `Could not parse time: "${newTime}"`;
      }

      // Calculate new end time
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

      return `✓ Rescheduled: "${event.title}"\n  ${dateStr} at ${timeStr}`;
    }

    // Parse: "edit event team meeting"
    const editMatch = input.match(/^(edit|change|update)\s+event\s+(.+)$/i);
    if (editMatch) {
      const eventName = editMatch[2];

      // Find event
      const events = context.services.garden.getByType('event');
      const event = events.find(e =>
        e.title.toLowerCase().includes(eventName.toLowerCase())
      );

      if (!event) {
        return `Event not found: "${eventName}"`;
      }

      // Start interactive editor (similar to contact editing)
      // Show current details and prompt for changes
      const startDate = new Date(event.start_time!);
      const dateStr = startDate.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });

      let response = `📅 **${event.title}**\n`;
      response += `  When: ${dateStr}\n`;
      if (event.metadata?.location) response += `  📍 ${event.metadata.location}\n`;
      if (event.contacts?.length) response += `  👤 ${event.contacts.join(', ')}\n`;
      response += `\nWhat would you like to change?\n`;
      response += `  • "time <new-time>" - Change when it happens\n`;
      response += `  • "title <new-title>" - Rename the event\n`;
      response += `  • "location <new-location>" - Change location\n`;
      response += `  • "add <person>" - Add attendee\n`;
      response += `  • "done" - Finish editing`;

      // Set wizard state for multi-step editing
      context.services.context.setFact('system', 'event_edit_pending', {
        eventId: event.id,
      }, { source: 'explicit' });

      return response;
    }

    return 'Usage: reschedule <event> to <new-time>\nOr: edit event <name>';
  },
};
```

**Testing:**
```bash
> reschedule team meeting to tomorrow 3pm
> edit event dentist
> time friday 2pm
> done
```

**Effort:** 3-4 hours
**Risk:** Low
**Value:** High (essential UX feature)

---

## 3. System Views Initialization (GOOD HOUSEKEEPING)

### Current State
- System views can be created manually via `create view` command
- No built-in views created at startup
- User must create common views like "Inbox", "Next Actions" themselves

### Goal
Auto-create standard GTD views on first run.

### Implementation

**File:** `src/services/garden.ts` - `initialize()` method

```typescript
private async initializeSystemViews() {
  // Check if system views already exist
  const existingViews = this.getByType('page').filter(p =>
    p.metadata?.systemView && p.metadata?.createdBy === 'system'
  );

  if (existingViews.length > 0) {
    debug('System views already initialized');
    return;
  }

  info('Initializing system views...');

  // Standard GTD views
  const systemViews = [
    {
      title: 'Inbox',
      querySpec: { type: 'item', status: 'active' },
      description: 'Unprocessed items waiting for clarification',
    },
    {
      title: 'Next Actions',
      querySpec: { type: 'action', status: 'active' },
      description: 'All active actions you can do now',
    },
    {
      title: 'Projects',
      querySpec: { type: 'project', status: 'active' },
      description: 'Outcomes requiring multiple actions',
    },
    {
      title: 'Waiting For',
      querySpec: { type: 'action', status: 'waiting' },
      description: 'Actions delegated or waiting on others',
    },
    {
      title: 'Someday Maybe',
      querySpec: { type: 'action', status: 'someday' },
      description: 'Future possibilities to review later',
    },
    {
      title: 'All Events',
      querySpec: { type: 'event', status: 'active' },
      description: 'Upcoming events and meetings',
    },
    {
      title: 'All Notes',
      querySpec: { type: 'note', status: 'active' },
      description: 'Reference notes and documentation',
    },
    {
      title: 'Contacts',
      querySpec: { type: 'contact', status: 'active' },
      description: 'People in your network',
    },
  ];

  for (const view of systemViews) {
    this.create({
      type: 'page',
      title: view.title,
      status: 'active',
      content: view.description,
      metadata: {
        systemView: true,
        createdBy: 'system',
        querySpec: view.querySpec,
        queryText: `showing ${view.querySpec.type}`,
      },
    });
    info(`Created system view: ${view.title}`);
  }
}

// Call from initialize() method
async initialize(): Promise<void> {
  // ... existing initialization code ...

  // Initialize system views (only on first run)
  await this.initializeSystemViews();

  // ... rest of initialization ...
}
```

**Testing:**
```bash
> rm -rf garden/ database/
> npm start
> show pages
[Should see 8 system views]
> open inbox
[Should show all items]
```

**Effort:** 1-2 hours
**Risk:** Low
**Value:** Medium (nice polish, better OOBE)

---

## 4. All-Day Events Enhancement

### Current State
- `all_day` field exists but not well-tested
- No clear UX for creating all-day events
- Calendar display may not distinguish all-day vs timed

### Goal
Proper support for events without specific times.

### Implementation

**Changes needed:**

1. **Detect all-day events in parser:**
```typescript
// If no time specified, treat as all-day
if (!input.includes(':') && !input.match(/\d{1,2}\s*(am|pm)/i)) {
  return {
    startTime: new Date(dateOnly),
    allDay: true,
  };
}
```

2. **Calendar display:**
```typescript
if (event.all_day) {
  return `📅 ${event.title} (all day)`;
} else {
  return `📅 ${timeStr} ${event.title}`;
}
```

3. **Update calendar.ts:**
```typescript
const event = context.services.garden.create({
  type: 'event',
  title: parsed.title,
  status: 'active',
  start_time: startDate.toISOString(),
  end_time: endDate.toISOString(),
  all_day: parsed.allDay || false,  // Add this
});
```

**Testing:**
```bash
> new event company holiday friday
> new event vacation next week
> show calendar
[All-day events should appear at top of day]
```

**Effort:** 2 hours
**Risk:** Low
**Value:** Medium

---

## 5. Enhanced Query Parser (LOWER PRIORITY)

### Current State
- `createView` tool has simple keyword matching
- Supports: "showing all notes", "showing actions in project"
- Does NOT support complex queries

### Goal
More sophisticated query parsing for power users.

### Future Capabilities

**Complex filters:**
```
> create view "Urgent Phone Calls" showing urgent actions @phone
> create view "This Week" showing events this week
> create view "Client Work" showing notes and actions in client-project
```

**Implementation approach:** Build mini query DSL or use existing patterns from search tools.

**Effort:** 6-8 hours
**Risk:** Medium
**Value:** Low (nice-to-have, not essential)

---

## 6. Recurring Events (FUTURE)

### Complexity
Very high - requires:
- Recurrence rule storage (RRULE format)
- Series vs instance distinction
- Edit series vs edit instance logic
- Exception dates handling
- Calendar expansion algorithm

### Recommendation
Defer until user requests. Most users can create separate events for now.

---

## Recommended Implementation Order

### Sprint 1: Essential UX (4-6 hours)
1. ✅ Natural Language Date Parsing (Phase 1) - 2-3 hours
2. ✅ Edit Event Tool - 3-4 hours

### Sprint 2: Polish (3-4 hours)
3. ✅ All-Day Events Enhancement - 2 hours
4. ✅ System Views Initialization - 1-2 hours

### Sprint 3: Advanced Features (Future)
5. ⏳ Enhanced Query Parser - 6-8 hours
6. ⏳ Recurring Events - 20+ hours

---

## Success Metrics

After Sprint 1 & 2, users should be able to:
- ✅ Create events naturally: "meeting next Tuesday at 3pm"
- ✅ Reschedule easily: "reschedule team meeting to friday"
- ✅ Create all-day events: "vacation next week"
- ✅ Find built-in views: "open inbox", "open next actions"
- ✅ Edit event times without touching markdown

These improvements make the calendar system production-ready for daily use.

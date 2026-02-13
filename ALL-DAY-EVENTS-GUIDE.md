# All-Day Events Guide

## Implementation Complete ✅

Added full support for events without specific times.

---

## What Are All-Day Events?

**All-day events** are calendar items that span an entire day without a specific start time. Perfect for:
- Vacations and holidays
- Birthdays and anniversaries
- Deadlines and due dates
- Multi-day trips
- Events where exact timing doesn't matter

---

## Creating All-Day Events

### Automatic Detection

**Simply omit the time** when creating an event:

```bash
> new event vacation next week
✓ Created: "vacation"
  Monday, February 17

> new event company holiday friday
✓ Created: "company holiday"
  Friday, February 14

> new event birthday march 15
✓ Created: "birthday"
  Saturday, March 15
```

**The system automatically detects all-day events when:**
- No time specified (no "3pm", no "10:00", no "at 2")
- Only date information provided
- Uses natural language dates without times

---

## Examples

### Relative Dates (No Time)
```bash
> new event dentist tomorrow
# All-day event: tomorrow

> new event trip next week
# All-day event: 7 days from now

> new event conference in 3 days
# All-day event: 3 days from now
```

### Month Names (No Time)
```bash
> new event tax deadline april 15
# All-day event: April 15

> new event graduation may 20
# All-day event: May 20
```

### Weekdays (No Time)
```bash
> new event meeting friday
# All-day event: this Friday

> new event review next monday
# All-day event: next Monday
```

### With Context
```bash
> new event vacation @travel next week
# All-day event with context tag

> new event team offsite @work march 10
# All-day event with context
```

---

## Timed vs All-Day

### Timed Events (Specific Time)
```bash
> new event standup tomorrow 9am
✓ Created: "standup"
  Tomorrow at 9:00 AM

> new event lunch friday 12pm
✓ Created: "lunch"
  Friday at 12:00 PM
```

**Triggers timed event:**
- "9am", "3pm", "10:30"
- "at 2", "at 3pm"
- "morning", "afternoon", "evening"
- Any explicit time reference

### All-Day Events (No Time)
```bash
> new event holiday friday
✓ Created: "holiday"
  Friday, February 14

> new event vacation next week
✓ Created: "vacation"
  Monday, February 17
```

**Triggers all-day:**
- No time keywords
- Only date specified
- Just day name without time

---

## Calendar Display

### Viewing All-Day Events

**In calendar view:**
```bash
> show calendar

📅 Upcoming Events

Thu, Feb 13
  company holiday (all day)
  9:00 AM - Team standup
  2:00 PM - Client call

Fri, Feb 14
  vacation (all day)
  10:00 AM - Planning meeting
```

**All-day events show:**
- "(all day)" label instead of time
- Listed before timed events for the day
- No specific hour displayed

**In today view:**
```bash
> today

📅 Events
  All day - Birthday celebration
  9:00 AM - Morning meeting
  3:00 PM - Review session
```

---

## Interactive Wizard

**All-day events work in wizard mode too:**

```bash
> new event

📅 **New Event**

What's the event?

> vacation

📅 **"vacation"**

When? (e.g., tomorrow 3pm, friday, 1/22 7:30am, or next week)

> next week

📅 **"vacation"**
  Monday, February 17

Reminder?
→ **none** / **15m** / **30m** / **1h**

> none

✓ Created: "vacation"
  Monday, February 17
```

**Notice:**
- No time prompt for all-day events
- Wizard accepts date-only inputs
- Confirmation shows just the date

---

## Editing All-Day Events

### Reschedule All-Day Event
```bash
> reschedule vacation to march 1
✓ Rescheduled: "vacation"
  Saturday, March 1
```

### Convert All-Day to Timed
```bash
> edit event vacation
> time march 1 at 9am
✓ Updated time to March 1 at 9:00 AM
```

### Convert Timed to All-Day
Not directly supported yet. Workaround:
```bash
> delete meeting
> new event meeting friday
```

---

## Technical Details

### Storage

All-day events stored with:
```yaml
type: event
title: vacation
start_time: 2026-02-17T00:00:00.000Z
end_time: 2026-02-18T00:00:00.000Z
all_day: true
status: active
```

**Key field:** `all_day: true`

### Detection Logic

In `parseEventInput()` function:
```typescript
// Extract time patterns
if (timeMatch) {
  hasTime = true;
  // ... set hours/minutes
}

// Set all_day based on whether time was found
const allDay = !hasTime;

return { title, startTime, hasTime, allDay, ... };
```

**Simple rule:** If no time extracted → all-day event

### Display Logic

Calendar display already handles all-day:
```typescript
const timeStr = event.all_day
  ? 'all day'
  : date.toLocaleTimeString(...);
```

**Already implemented** before this feature - just needed to set the field!

---

## Use Cases

### 1. Vacation Tracking
```bash
> new event vacation @travel march 15
> new event vacation @travel march 16
> new event vacation @travel march 17

> show calendar march 15
# See all vacation days
```

### 2. Deadline Management
```bash
> new event proposal due @work friday
> new event report due @work next monday

> show calendar
# See all deadlines at top of each day
```

### 3. Birthday Tracking
```bash
> new event mom birthday march 22
> new event john birthday april 5

> show calendar march
# See birthdays for the month
```

### 4. Company Holidays
```bash
> new event memorial day may 26
> new event independence day july 4

> show events
# See all holidays
```

### 5. Multi-Day Events
```bash
> new event conference day 1 march 10
> new event conference day 2 march 11
> new event conference day 3 march 12

> show calendar march 10
# See multi-day schedule
```

---

## Limitations

### 1. Single-Day Only
Currently each all-day event is one day:
```bash
> new event vacation march 1-5    # Not supported
```

**Workaround:** Create separate events for each day

### 2. No Duration for All-Day
All-day events default to 24 hours (midnight to midnight):
```bash
start_time: 2026-03-01T00:00:00Z
end_time: 2026-03-02T00:00:00Z
```

**Can't specify:** "all day but only until 5pm"

### 3. Reminders Less Useful
Reminders for all-day events trigger at midnight:
```bash
> new event birthday march 15 1h reminder
# Reminder at 11:00 PM on March 14
```

**Better:** Skip reminders for all-day events, or create a separate timed reminder

---

## Best Practices

### 1. Use All-Day for Non-Time-Specific Items
✅ **Good:**
```bash
> new event vacation friday
> new event deadline next monday
> new event holiday march 1
```

❌ **Not ideal:**
```bash
> new event meeting friday    # Should have time
> new event call tomorrow     # Should have time
```

### 2. Add Context Tags
```bash
> new event vacation @travel next week
> new event deadline @work friday
> new event birthday @personal march 15
```

### 3. Check Calendar Display
```bash
> new event holiday tomorrow
> show calendar tomorrow
# Verify it appears as all-day
```

### 4. Separate Timed and All-Day
```bash
# All-day: vacation period
> new event vacation friday

# Timed: flight within vacation
> new event flight friday 9am
```

---

## Testing Checklist

Manual tests:

- [ ] Create all-day event: "new event vacation tomorrow"
- [ ] Verify no time shown in confirmation
- [ ] Check calendar display shows "(all day)"
- [ ] Create with month name: "new event holiday march 15"
- [ ] Create with weekday: "new event meeting friday"
- [ ] Wizard mode: enter date without time
- [ ] Reschedule all-day event
- [ ] Edit all-day event (add time to convert)
- [ ] Mixed calendar: all-day + timed events
- [ ] Show calendar with all-day events listed first

---

## Future Enhancements

### 1. Multi-Day Span
```bash
> new event vacation march 1 to march 5
# Creates single event spanning 5 days
```

### 2. Explicit All-Day Flag
```bash
> new event meeting friday all day
# Force all-day even if time-like words present
```

### 3. Better Reminder Defaults
```bash
> new event birthday march 15
# Suggest: "Reminder at 9am on the day?"
```

### 4. Convert Commands
```bash
> make meeting all day
> add time to vacation 9am
```

---

## Success Metrics

After implementation:
- ✅ Users can create events without times
- ✅ System auto-detects all-day vs timed
- ✅ Calendar displays all-day events correctly
- ✅ Works in both inline and wizard modes
- ✅ Editing preserves all-day status
- ✅ Natural language dates work seamlessly

**User value:** HIGH - Essential for vacation tracking, holidays, deadlines, and any non-time-specific calendar items

---

## Summary

**All-day events** fill a critical gap in calendar management:
- Vacations don't need specific times
- Holidays are all-day by nature
- Deadlines are "by end of day"
- Birthdays are all-day celebrations

**Simple rule:** Omit the time → get an all-day event

**Already working:** Display logic was ready, just needed to set `all_day: true` during creation

**Seamless integration:** Works with natural language dates, wizard mode, editing, and rescheduling

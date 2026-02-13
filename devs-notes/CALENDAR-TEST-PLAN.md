# Calendar System Test Plan

## Test Status: Ready for User Testing

### Phase 1: Event Creation Tests

#### Test 1.1: Inline Event Creation
```bash
> new event team meeting tomorrow 2pm
```
**Expected:**
- ✅ Garden record created with `type: 'event'`
- ✅ `start_time` and `end_time` populated (ISO timestamps)
- ✅ Calendar entry auto-created via sync
- ✅ Content prompt appears
- ✅ Pressing Enter skips content
- ✅ Entering text saves to event.content

**Verification:**
```sql
SELECT id, type, title, start_time, end_time, content
FROM garden_records
WHERE type = 'event'
ORDER BY created_at DESC LIMIT 1;
```

#### Test 1.2: Event with Reminder
```bash
> new event dentist friday 3pm 15m reminder
```
**Expected:**
- ✅ Event created with `metadata.reminder = 15`
- ✅ Garden syncToCalendar schedules reminder via scheduler
- ✅ Reminder time = start_time - 15 minutes
- ✅ Content prompt appears

#### Test 1.3: Event with Contacts
```bash
> new event lunch with sarah tomorrow noon
```
**Expected:**
- ✅ Contact "sarah" resolved or created
- ✅ Event.contacts array contains sarah's ID
- ✅ Calendar metadata includes contact info
- ✅ Content prompt appears

#### Test 1.4: Event Wizard Flow
```bash
> new event
> Coffee chat
> tomorrow 10am
> 30m
> with mike at Cafe Luna
```
**Expected:**
- ✅ Wizard guides through title, time, reminder, extras
- ✅ Garden record created (not calendar entry)
- ✅ Contact "mike" created/linked
- ✅ Location stored in metadata
- ✅ Content prompt appears

### Phase 2: Garden-Calendar Sync Tests

#### Test 2.1: Event Appears in Calendar
```bash
> new event test sync tomorrow 11am
> show calendar
```
**Expected:**
- ✅ Event appears in calendar view
- ✅ Shows correct date and time
- ✅ Marked as 'event' type

#### Test 2.2: Event in Today View
```bash
> new event morning standup today 9am
> today
```
**Expected:**
- ✅ Event appears in today's schedule
- ✅ Shows with 📅 icon
- ✅ Displays time correctly

#### Test 2.3: Update Event Updates Calendar
```bash
> new event test update tomorrow 2pm
> edit <event-name> start_time <new-time>
```
**Expected:**
- ✅ Calendar entry updates automatically
- ✅ Old time removed from temporal index
- ✅ New time added to temporal index

#### Test 2.4: Complete Event Removes from Calendar
```bash
> new event test completion today 5pm
> done <event-id>
```
**Expected:**
- ✅ Event.status = 'completed'
- ✅ Event removed from calendar temporal index
- ✅ Reminder cancelled if scheduled

### Phase 3: Content Prompting Tests

#### Test 3.1: Add Content to Event
```bash
> new event planning meeting tomorrow 3pm
[Content prompt appears]
> Discuss Q2 roadmap and budget allocation
```
**Expected:**
- ✅ Prompt handler catches input
- ✅ event.content updated with description
- ✅ Confirmation message shows preview
- ✅ Content saved to markdown file

#### Test 3.2: Skip Content Prompt
```bash
> new event quick call tomorrow 4pm
[Content prompt appears]
> [Press Enter]
```
**Expected:**
- ✅ Prompt skipped
- ✅ Confirmation message shows "skipped"
- ✅ event.content remains empty

#### Test 3.3: View Event with Content
```bash
> open planning meeting
```
**Expected:**
- ✅ Shows event details (time, location, contacts)
- ✅ Shows content/description if present
- ✅ Shows "No description" if content empty

### Phase 4: Reminder Tests

#### Test 4.1: Reminder Scheduled
```bash
> new event important call tomorrow 2pm 30m reminder
```
**Expected:**
- ✅ Scheduler record created
- ✅ Reminder time = event start - 30 minutes
- ✅ Payload: "Event: important call"
- ✅ Related to event.id

**Verification:**
```sql
SELECT * FROM scheduled_tasks
WHERE related_record = '<event-id>'
AND type = 'reminder';
```

#### Test 4.2: Past Reminders Not Scheduled
```bash
> new event past event yesterday 2pm 15m reminder
```
**Expected:**
- ✅ Event created
- ✅ No reminder scheduled (time already passed)

#### Test 4.3: Update Event Updates Reminder
```bash
> new event meeting tomorrow 2pm 15m reminder
> edit <event> start_time <new-time>
```
**Expected:**
- ✅ Old reminder cancelled
- ✅ New reminder scheduled for new time - 15m

### Phase 5: Integration Tests

#### Test 5.1: Event in Project
```bash
> new event kickoff meeting tomorrow 10am +project-alpha
> open project-alpha
```
**Expected:**
- ✅ Event linked to project
- ✅ Event appears in project view
- ✅ Shows with event icon

#### Test 5.2: All-Day Event
```bash
> new event company holiday friday
[no time specified]
```
**Expected:**
- ✅ all_day = true
- ✅ Shows in calendar as all-day
- ✅ No specific time displayed

#### Test 5.3: Event from Dashboard
```
[Dashboard UI]
+ New Event → "Client presentation" → "Monday 3pm"
```
**Expected:**
- ✅ command-executor.executeCreateEvent called
- ✅ Garden record created
- ✅ Calendar synced
- ✅ Panel refreshes: calendar, today, events

### Phase 6: Persistence Tests

#### Test 6.1: Event Saved to File
```bash
> new event test persistence tomorrow 11am
[Add content: "Test description"]
```
**Expected:**
- ✅ File created: `garden/test-persistence.md`
- ✅ Frontmatter includes:
  - `type: event`
  - `start: <ISO timestamp>`
  - `end: <ISO timestamp>`
- ✅ Content appears in file body

#### Test 6.2: Edit File Syncs to Database
```bash
# Edit garden/test-persistence.md
# Change start time in frontmatter
```
**Expected:**
- ✅ File watcher detects change
- ✅ Database updated
- ✅ Calendar temporal index updated
- ✅ Reminder rescheduled if needed

#### Test 6.3: Database Rebuild from Files
```bash
> rm database/garden.sqlite3
> npm start
```
**Expected:**
- ✅ Database recreated
- ✅ Events parsed from markdown files
- ✅ start_time/end_time populated from frontmatter
- ✅ Calendar temporal index rebuilt
- ✅ All events appear in calendar

## Automated Test Script

```bash
#!/bin/bash
# Run from bartleby root directory

echo "=== Calendar System Tests ==="
echo ""

# Test 1: Check schema migration
echo "Test 1: Database schema..."
sqlite3 database/garden.sqlite3 "PRAGMA table_info(garden_records);" | grep -E "(start_time|end_time|all_day)"
if [ $? -eq 0 ]; then
    echo "✅ Schema updated with event fields"
else
    echo "❌ Schema missing event fields"
fi
echo ""

# Test 2: Create test event via garden service
echo "Test 2: Direct garden record creation..."
cat << 'EOF' | npm start
const event = context.services.garden.create({
  type: 'event',
  title: 'Test Event',
  status: 'active',
  start_time: new Date('2026-02-15T14:00:00Z').toISOString(),
  end_time: new Date('2026-02-15T15:00:00Z').toISOString(),
  all_day: false,
});
console.log('Event ID:', event.id);
quit
EOF
echo ""

# Test 3: Verify calendar entry exists
echo "Test 3: Calendar temporal index..."
sqlite3 database/calendar.sqlite3 "SELECT COUNT(*) FROM calendar_entries WHERE source_type = 'garden';"
echo ""

# Test 4: Check markdown file
echo "Test 4: Markdown persistence..."
ls -l garden/ | grep -i "test-event"
echo ""

echo "=== Manual Tests Required ==="
echo "1. Create event via CLI: 'new event test tomorrow 2pm'"
echo "2. Verify content prompt appears"
echo "3. Check 'show calendar' displays event"
echo "4. Check 'today' shows event if today"
echo "5. Edit event and verify calendar updates"
echo "6. Complete event and verify removed from calendar"
```

## Performance Tests

### Test P.1: Bulk Event Creation
```bash
for i in {1..100}; do
  echo "new event test-$i tomorrow ${i}pm"
done
```
**Expected:**
- ✅ All 100 events created
- ✅ Calendar index updated efficiently
- ✅ No memory leaks
- ✅ Response time < 100ms per event

### Test P.2: Large Calendar Query
```bash
> show calendar
[with 1000+ events]
```
**Expected:**
- ✅ Calendar loads in < 500ms
- ✅ Results paginated or limited
- ✅ No UI freezing

## Edge Cases

### Edge Case 1: Invalid Date
```bash
> new event test invalid-date asdfasdf
```
**Expected:**
- ✅ Error message: "Invalid date: asdfasdf"
- ✅ No record created
- ✅ Helpful suggestion shown

### Edge Case 2: Concurrent Updates
```bash
# Terminal 1: edit event A
# Terminal 2: edit event A
```
**Expected:**
- ✅ Last write wins
- ✅ No data corruption
- ✅ File watcher handles race condition

### Edge Case 3: Missing End Time
```bash
> new event test no-end tomorrow 2pm
[manually remove end_time from markdown]
```
**Expected:**
- ✅ syncToCalendar calculates default end (start + 1h)
- ✅ Calendar entry still created
- ✅ No errors

## Regression Tests

### Regression 1: Actions Still Work
```bash
> new action test action @home
> action due tomorrow 2pm
```
**Expected:**
- ✅ Actions still create correctly
- ✅ Timed actions still sync to calendar
- ✅ No interference from event logic

### Regression 2: Projects Still Work
```bash
> new project test project
[Content prompt]
> Project description
```
**Expected:**
- ✅ Content prompt works
- ✅ No event-specific code interferes

## Sign-off Checklist

Before merging calendar system upgrade:
- [ ] All Phase 1-6 tests pass
- [ ] Performance tests acceptable
- [ ] Edge cases handled gracefully
- [ ] No regressions in existing features
- [ ] README updated with new features
- [ ] IMPLEMENTATION-SUMMARY updated
- [ ] User documentation complete

## Known Issues / Future Work

1. **Natural language dates**: "next Tuesday" not yet parsed (simple Date() parsing only)
2. **Recurring events**: Not yet implemented
3. **Event editing**: No dedicated tool yet (use generic edit)
4. **Timezone handling**: Uses system timezone only
5. **All-day events**: Basic support, needs testing

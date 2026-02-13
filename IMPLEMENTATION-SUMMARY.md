# Implementation Summary: Rename 'entry' → 'page' + Events + System Views

## Completed Changes

### 1. Renamed RecordType: 'entry' → 'page'

**File: `src/services/garden.ts`**
- Updated RecordType enum
- Changed `'entry'` to `'page'` with comment: "User-created wiki page (arbitrary content)"
- Updated type comments to reflect new categorization

**Files Updated:**
- ✅ `src/services/garden.ts` - RecordType definition
- ✅ `src/tools/gtd.ts` - createEntry → createPage
- ✅ `src/tools/gtd.ts` - showByType tool (added 'page', kept 'entry' for backward compat)
- ✅ `src/tools/gtd.ts` - Tool exports updated
- ✅ `src/repl.ts` - Autocomplete (2 locations)
- ✅ `src/server/index.ts` - Autocomplete and type validation

### 2. Added 'event' as New RecordType

**File: `src/services/garden.ts`**
```typescript
export type RecordType =
  | 'page'      // User-created wiki page
  | 'event'     // Calendar event (specific time)
  // ...
```

**File: `src/server/command-executor.ts`**
- Updated `executeCreateEvent()` to create `type: 'event'` instead of `type: 'entry'`
- Changed metadata structure:
  - Before: `metadata: { entryType: 'event', dateStr: '...' }`
  - After: `metadata: { startTime: '...', endTime: '...' }`

**Files Updated:**
- ✅ `src/services/garden.ts` - Added 'event' to RecordType
- ✅ `src/server/command-executor.ts` - Event creation
- ✅ `src/tools/gtd.ts` - showByType supports events
- ✅ `src/repl.ts` - Autocomplete includes events
- ✅ `src/server/index.ts` - Type validation includes events

### 3. Added Prompted Content for Pages

**File: `src/tools/gtd.ts` - createPage tool**
```typescript
// After creating page, prompts for content
context.services.context.setFact('system', 'pending_prompt', {
  recordId: page.id,
  recordType: 'page',
  recordTitle: page.title,
}, { source: 'explicit' })

return `✓ Created page: "${page.title}"\n\nContent (optional, Enter to skip):`
```

**Behavior:**
- User creates page: `new page house rules`
- System prompts for content
- User enters content or presses Enter to skip
- promptHandler (Layer 0) captures next input

### 4. Created `createView` Tool

**File: `src/tools/gtd.ts` - NEW tool**

**Purpose:** Create custom system views (saved queries as pages)

**Usage:**
```
> create view "Notes List" showing all notes
✓ Created system view: "Notes List"
  Displays: note (active)

Description (optional, Enter to skip):
> All my reference notes in one place
✓ Added description to "Notes List"

> open notes list
**Notes List** (page)
────────────────────────────────────────
All my reference notes in one place

**Results:** (15)

  1. House Rules
  2. Meeting with Sarah 2026-02-10
  3. Q1 Planning Notes
  ...
```

**Features:**
- Parses query specifications: type, status, project filters
- Creates page with `metadata.systemView = true`
- Stores `querySpec` for dynamic execution
- Prompts for description (optional)
- User-created views (can be deleted)

**Supported Queries:**
- `showing all notes` → type: 'note'
- `showing actions` → type: 'action'
- `showing notes in client-work` → type: 'note', project: 'client-work'
- `showing active events` → type: 'event', status: 'active'

### 5. Updated `openPage` for System Views

**File: `src/tools/gtd.ts` - openPage tool**

**Added Logic:**
```typescript
// Special handling for system views: execute query dynamically
if (record.metadata?.systemView && record.metadata?.querySpec) {
  // Execute query
  let items = context.services.garden.getByType(querySpec.type)

  // Apply filters
  if (querySpec.status) items = items.filter(i => i.status === querySpec.status)
  if (querySpec.project) items = items.filter(i => i.project === querySpec.project)

  // Display results dynamically
  return formatted list...
}
```

**Behavior:**
- System views execute queries on-the-fly
- Results always current (no stale data)
- Shows description + filtered list

## Breaking Changes

- `new entry` no longer works → use `new page`
- `show entries` no longer works → use `show pages`
- `getByType('entry')` → must use `getByType('page')`
- Existing 'entry' records in database → need migration (see below)

## Database Migration Needed

**Current database may have:**
```sql
SELECT * FROM garden_records WHERE type = 'entry';
```

**Migration SQL:**
```sql
UPDATE garden_records
SET type = 'page'
WHERE type = 'entry'
  AND (metadata IS NULL OR metadata NOT LIKE '%entryType%');

-- Events stored as entries should become proper events
UPDATE garden_records
SET type = 'event',
    metadata = json_set(metadata, '$.startTime', json_extract(metadata, '$.dateStr'))
WHERE type = 'entry'
  AND metadata LIKE '%entryType%'
  AND json_extract(metadata, '$.entryType') = 'event';
```

**Note:** User said "i will be wiping bartleby again" so migration may not be needed for their database.

## Calendar System Upgrade (COMPLETED)

### ✅ 1. Calendar Event Creation Tool (DONE)

**Implemented:**
- ✅ `src/tools/calendar.ts` - All 4 event creation paths now create garden records
- ✅ Removed direct calendar.create() calls
- ✅ Events auto-sync to calendar temporal index via garden.syncToCalendar()
- ✅ Wizard UX maintained with improved architecture
- ✅ Reminders automatically scheduled from metadata.reminder

**Changes:**
- Lines ~242, 744, 870, 1336: Changed to garden.create({ type: 'event' })
- Removed manual reminder scheduling (handled by garden sync)
- All event paths now unified through garden service

### ✅ 2. Event Content Prompting (DONE)

**Implemented:**
- ✅ All event creation paths set `pending_prompt` fact
- ✅ User prompted for optional description/notes
- ✅ Press Enter to skip prompt
- ✅ prompt-handler.ts supports 'event' and 'page' types

**Changes:**
- calendar.ts: Added pending_prompt after event creation
- prompt-handler.ts: Extended recordType union to include 'event' and 'page'

### ✅ 3. Garden Schema Extension (DONE)

**Implemented:**
- ✅ Added `start_time: string` field (ISO datetime)
- ✅ Added `end_time: string` field (ISO datetime)
- ✅ Added `all_day: boolean` field (all-day event flag)
- ✅ Database migrations added for existing databases
- ✅ Updated create(), update(), rowToRecord(), syncToFile(), syncFromFile()

**Changes:**
- garden.ts: Schema updated with new columns
- garden.ts: syncToCalendar() extended to handle type: 'event'
- garden.ts: Automatic reminder scheduling for events

### ✅ 4. Command Executor Update (DONE)

**Implemented:**
- ✅ Dashboard event creation uses garden records
- ✅ Parses dateStr to ISO timestamps (basic parsing)
- ✅ Calculates end_time (1 hour default duration)
- ✅ Returns proper panel refresh list

**Changes:**
- command-executor.ts lines 126-159: Updated executeCreateEvent()

## What Still Needs Work

### 3. System View Initialization

**Needs:**
- Create built-in system views at startup:
  - Inbox (type: 'page', metadata: { systemView: true, createdBy: 'system', querySpec: { type: 'item', status: 'active' } })
  - Next Actions
  - Waiting For
  - Someday/Maybe
  - Projects (list)
  - Contacts (list)

**Location:** `src/services/garden.ts` - `initialize()` method

### 4. Enhanced Query Parser

**Current:** Simple keyword matching in `createView`
**Needs:** More sophisticated parsing
- Complex filters: "showing urgent actions @phone"
- Multiple types: "showing notes and actions in project-x"
- Date ranges: "showing events this week"
- Search content: "showing items matching 'client'"

## Testing Checklist

### Page Creation
- [ ] `new page house rules` → creates page, prompts for content
- [ ] Enter content → saves content
- [ ] Press Enter → skips content
- [ ] `open house rules` → displays page with content
- [ ] `show pages` → lists all pages

### Events
- [ ] Command parser creates `type: 'event'` records
- [ ] Events appear in autocomplete
- [ ] `show events` → lists all events
- [ ] Events have metadata.startTime

### System Views
- [ ] `create view "Notes" showing all notes` → creates system view
- [ ] Prompt for description → saves description
- [ ] `open notes` → executes query, shows dynamic list
- [ ] `show pages` → includes system views
- [ ] Queries filter correctly (type, status, project)

## Files Modified

| File | Lines Changed | Description |
|------|---------------|-------------|
| `src/services/garden.ts` | ~15 | RecordType definition |
| `src/tools/gtd.ts` | ~150 | createPage, createView, openPage, showByType |
| `src/server/command-executor.ts` | ~10 | Event creation |
| `src/repl.ts` | ~6 | Autocomplete (2 locations) |
| `src/server/index.ts` | ~4 | Autocomplete + validation |

**Total:** ~185 lines changed across 5 files

## Build Status

✅ **TypeScript compilation successful (0 errors)**

```bash
$ npm run build
> bartleby@0.0.1 build
> tsc
```

## Next Steps

1. **Test in REPL**
   ```bash
   npm start
   > new page test
   > create view "All Notes" showing all notes
   > open all notes
   ```

2. **Create database migration script** (if needed)

3. **Update calendar tool** to create garden records

4. **Initialize system views** at startup

5. **Update README** with new commands and concepts

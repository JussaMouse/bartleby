# Dashboard v2 - Command Bar First Architecture

**Status:** Design Spec
**Created:** 2026-02-11
**Goal:** Complete redesign with command bar as primary interface

## Design Principles

1. **Command bar is primary** - All actions go through natural language commands
2. **KISS** - Remove all complexity that doesn't serve the core use case
3. **Keyboard-first** - But fully functional with mouse
4. **Fast** - Minimal JavaScript, simple rendering, no frameworks
5. **Futureproof** - Easy to extend, easy to add features

## Visual Layout

```
┌─────────────────────────────────────────────────────────┐
│ Bartleby                     [connected]     [@user ▾]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔍  Type a command...                        [Cmd+K]   │
│                                                         │
├──────────────┬──────────────┬──────────────────────────┤
│ Inbox        │ Next Actions │ Today                    │
│              │              │                          │
│ • Item 1     │ @home        │ • Meeting 2pm           │
│ • Item 2     │ • Call Bob   │ • Deadline: Report      │
│              │              │                          │
│              │ @work        │ Overdue:                │
│              │ • Email Sue  │ • Call dentist          │
│              │              │                          │
└──────────────┴──────────────┴──────────────────────────┘
```

### When Command Bar is Active

```
Full viewport overlay with command bar focused:

┌─────────────────────────────────────────────────────────┐
│                                                         │
│                                                         │
│  🔍  note meeting with alice +project-x                │
│      ───────────────────────────────────────────       │
│                                                         │
│      Preview:                                           │
│      ✓ Create note "meeting with alice"                │
│        Project: project-x                               │
│                                                         │
│      [↵ Enter to create]  [⇥ Tab to edit fields]       │
│                                                         │
│                                                         │
│                                                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
                    [Esc to cancel]
```

## Core Components

### 1. Command Bar

**Always visible** at top of page, like a browser address bar.

**States:**
- **Idle**: Placeholder text, subtle styling
- **Focused**: Expands, shows command history hints
- **Typing**: Real-time parsing, shows suggestions
- **Preview**: Shows structured preview of what will happen
- **Executing**: Loading indicator

**Keyboard Shortcuts:**
- `Cmd+K` or `/` - Focus command bar
- `Esc` - Clear/unfocus
- `↵ Enter` - Execute command
- `⇥ Tab` - Switch to edit mode (opens form with pre-filled values)
- `↑/↓` - Navigate command history
- `Cmd+Shift+P` - Show command palette (all available commands)

**Voice Input (Mobile):**
- 🎤 Microphone button in command bar
- Tap once → start recording (visual indicator: red pulse)
- Tap again → stop recording and transcribe
- Transcription sent to command parser
- Uses Web Speech API (browser native)
- Fallback: text input on unsupported browsers

**Features:**
- **Immediate auto-suggestions** as you type (Google-style)
  - Debounced 150ms to avoid excessive API calls
  - Shows matching commands: "note" → suggests "note <title>", "note quick idea", etc.
  - Shows matching entities: "+proj" → suggests "+project-x", "+project-y"
  - Shows syntax hints: "action " → shows "action <title> [@context] [+project] [due:DATE]"
- **Command history** (↑/↓ to navigate)
  - Fetched from server on load
  - Recent 50 commands cached locally
  - Filtered as you type
- **Syntax highlighting** for +project #tags @context
  - Color-coded in real-time
  - Invalid syntax shown in red
- **Live preview** of parsed intent
  - Shows structured representation below input
  - Updates as you type
- **Error handling** with helpful hints
  - "Missing title" → shows examples
  - "Unknown project" → suggests creating it

### 2. Panel Grid

**Simple, responsive grid** below command bar.

**Default panels** on first load:
- Inbox (uncategorized captures)
- Next Actions (grouped by context)
- Today (today's events + overdue)

**Panel types:**
- `inbox` - Items to process
- `next-actions` - Actions grouped by @context
- `today` - Today's calendar + overdue
- `project:NAME` - Specific project view
- `note:ID` - Specific note view
- `calendar` - Full calendar view
- `notes` - All notes list
- `recent` - Recently updated items

**Panel features:**
- Drag to reorder
- Click [×] to close
- Auto-refresh via WebSocket
- Minimal interaction (reading mostly)
- Click item → opens in modal or new panel

### 3. Modal/Detail View

**When you need to edit or see detail**, modal overlays.

**Used for:**
- Editing an item after Tab from command preview
- Viewing full note content
- Detailed project breakdown

**Features:**
- Esc to close
- Simple form with structured fields
- Save → executes command
- Cancel → returns to panels

## Command Syntax

### Creating Items

```bash
# Notes
note <title> [+project] [#tag] [@context] [with @person]
note meeting notes +project-x #important
note quick idea

# Actions
action <title> [+project] [#tag] [@context] [due:DATE]
action call bob @phone +sales due:friday
action email team

# Projects
project <name> [#tag]
project website redesign #client

# Events
event <title> at <time> [+project]
event standup at 10am tomorrow
event launch at 2026-03-15 14:00
```

### Querying

```bash
# Show views (opens corresponding panel)
show inbox              → opens inbox panel
show next actions       → opens next-actions panel
show today             → opens today panel
show overdue           → opens panel with overdue actions
show notes             → opens notes panel
show projects          → opens projects panel
show calendar          → opens calendar panel
show project website-redesign  → opens project:website-redesign panel
show note abc123       → opens note:abc123 panel

# Search (opens search results panel)
find notes about meeting      → search-results panel
find actions for alice        → search-results panel
search #important             → search-results panel

# Lists (opens corresponding list panel)
list projects                 → projects panel
list notes in project-x       → filtered notes panel
list overdue actions          → overdue panel
```

**Command → Panel Mapping:**
- Query commands don't return data in command bar
- Instead, they open the appropriate panel
- Panel fetches data via existing WebSocket subscription
- Multiple panels can be open simultaneously

### Updating

```bash
# Move/reassign
move note-123 to +other-project
assign action-456 to @work

# Mark complete
done action-123
complete call bob

# Delete
delete note-456
delete project old-project
```

### Bulk Operations

```bash
# Multiple commands separated by semicolon
action call bob; action email sue; note follow up
```

## API Contract

### POST /api/command (Parse & Preview)

**Request:**
```json
{
  "input": "note meeting with alice +project-x #important"
}
```

**Response:**
```json
{
  "intent": "create_note",
  "confidence": "high",
  "parsed": {
    "type": "note",
    "title": "meeting with alice",
    "project": "project-x",
    "tags": ["important"]
  },
  "preview": {
    "action": "Create note",
    "summary": "\"meeting with alice\" in project-x #important",
    "fields": [
      { "label": "Title", "value": "meeting with alice" },
      { "label": "Project", "value": "project-x" },
      { "label": "Tags", "value": ["important"] }
    ]
  },
  "warnings": [],
  "suggestions": []
}
```

### POST /api/command/execute (Execute Command)

**Example 1: Create Command**

**Request:**
```json
{
  "intent": "create_note",
  "parsed": {
    "type": "note",
    "title": "meeting with alice",
    "project": "project-x",
    "tags": ["important"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "action": "created",
  "result": {
    "id": "abc123",
    "type": "note",
    "title": "meeting with alice",
    "project": "project-x",
    "tags": ["important"],
    "created_at": "2026-02-11T..."
  },
  "message": "Note created: \"meeting with alice\"",
  "panels_to_refresh": ["notes", "project:project-x"]
}
```

**Example 2: Query Command**

**Request:**
```json
{
  "intent": "show_panel",
  "parsed": {
    "panel": "notes"
  }
}
```

**Response:**
```json
{
  "success": true,
  "action": "open_panel",
  "panel": {
    "view": "notes",
    "title": "Notes"
  },
  "message": "Opening notes panel"
}
```

**Example 3: Query with Filter**

**Request:**
```json
{
  "intent": "show_project",
  "parsed": {
    "project": "website-redesign"
  }
}
```

**Response:**
```json
{
  "success": true,
  "action": "open_panel",
  "panel": {
    "view": "project:website-redesign",
    "title": "website-redesign"
  },
  "message": "Opening project: website-redesign"
}
```

### GET /api/command/suggestions (Autocomplete)

**Request:**
```
GET /api/command/suggestions?q=note+mee
```

**Response:**
```json
{
  "input": "note mee",
  "suggestions": [
    {
      "type": "completion",
      "text": "note meeting notes",
      "description": "Create note",
      "category": "command"
    },
    {
      "type": "history",
      "text": "note meeting with alice +project-x",
      "description": "From history (2 days ago)",
      "category": "history"
    }
  ]
}
```

**Request with entity prefix:**
```
GET /api/command/suggestions?q=note+test+%2Bpro
```

**Response:**
```json
{
  "input": "note test +pro",
  "suggestions": [
    {
      "type": "entity",
      "text": "+project-x",
      "description": "Project (5 notes, 3 actions)",
      "category": "project"
    },
    {
      "type": "entity",
      "text": "+project-alpha",
      "description": "Project (12 notes, 8 actions)",
      "category": "project"
    }
  ]
}
```

### Error Handling

**Request:**
```json
{
  "input": "note +project-x"
}
```

**Response:**
```json
{
  "intent": "create_note",
  "confidence": "low",
  "error": "Missing required field: title",
  "parsed": {
    "type": "note",
    "title": "",
    "project": "project-x"
  },
  "hint": "Try: note <title> +project-x",
  "suggestions": [
    "note meeting notes +project-x",
    "note ideas +project-x"
  ]
}
```

## File Structure

### Complete Rewrite

```
web/
├── index.html           # Minimal HTML shell
├── app-v2.js           # New dashboard (clean slate)
├── styles-v2.css       # New styles (clean slate)
└── legacy/             # Old dashboard (for reference)
    ├── app.js
    └── styles.css
```

### New app-v2.js Structure

```javascript
// ============================================
// STATE
// ============================================
const state = {
  panels: [],
  commandHistory: [],
  currentCommand: null,
  ws: null,
};

// ============================================
// COMMAND BAR
// ============================================
function initCommandBar() { }
function handleCommandInput(input) { }
function parseCommand(input) { }
function executeCommand(intent, parsed) { }
function showPreview(result) { }
function hidePreview() { }

// ============================================
// PANELS
// ============================================
function addPanel(view) { }
function removePanel(id) { }
function renderPanels() { }
function renderPanel(view, data) { }

// ============================================
// WEBSOCKET
// ============================================
function connectWebSocket() { }
function handleWSMessage(msg) { }

// ============================================
// RENDERING
// ============================================
function renderInbox(data) { }
function renderNextActions(data) { }
function renderToday(data) { }
function renderProject(data) { }
function renderNote(data) { }

// ============================================
// UTILITIES
// ============================================
function esc(str) { }
function showToast(msg) { }
function apiFetch(url, options) { }

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', init);
```

**Total estimated lines: ~600-800** (vs current ~2400)

### New styles-v2.css Structure

```css
/* ============================================
   LAYOUT
   ============================================ */
/* App container, command bar, panels grid */

/* ============================================
   COMMAND BAR
   ============================================ */
/* Input, preview, suggestions, states */

/* ============================================
   PANELS
   ============================================ */
/* Panel grid, individual panels, content */

/* ============================================
   MODAL
   ============================================ */
/* Detail view, edit form */

/* ============================================
   COMPONENTS
   ============================================ */
/* Items, actions, notes, metadata badges */

/* ============================================
   UTILITIES
   ============================================ */
/* Toast, loading, empty states */
```

**Total estimated lines: ~400-600** (vs current ~800+)

## What Gets Removed

From current dashboard (web/app.js):

❌ **Removed (~1600 lines):**
- Three-field note creation form
- Autocomplete keyboard handling (Tab/Enter/Arrow navigation)
- Tags field parsing logic
- Inline editing for actions (click to edit)
- Generic item editing
- Form state management
- Convert item dropdowns
- REPL autocomplete (redundant with command bar)
- Separate create functions (createNewNote, createNewAction, etc.)
- Drag/drop file handling (move to command: "attach file.png to note-123")

✅ **Kept (~800 lines):**
- Panel management basics (add/remove/render)
- WebSocket connection
- API authentication
- Basic rendering functions
- Item display (read-only)
- Toast notifications

✅ **New (~600 lines):**
- Command bar component
- Command parsing integration
- Preview rendering
- Command history
- Keyboard shortcuts

**Net result: ~1800 lines → ~1400 lines (22% reduction)**
**Complexity reduction: ~70% fewer interactions to handle**

## What Gets Added

Backend (src/server/):

✅ **New files:**
- `command-parser.ts` (~400 lines) - Parse all command types
- `command-executor.ts` (~300 lines) - Execute parsed commands
- `command-types.ts` (~100 lines) - TypeScript types for commands
- `command-history.ts` (~200 lines) - Command history storage and retrieval

✅ **Database/Storage:**
- Command history stored in Bartleby's memory system
- Schema:
  ```typescript
  interface CommandRecord {
    id: string;
    user_id: string;
    input: string;           // Raw command text
    parsed: object;          // Parsed intent
    executed: boolean;       // Was it executed or just previewed
    success: boolean;        // Did execution succeed
    source: 'cli' | 'dashboard' | 'api';
    created_at: string;
  }
  ```
- Indexed by user_id and created_at for fast retrieval
- Kept for 90 days (configurable)

✅ **New endpoints:**
- `POST /api/command` - Parse and preview
- `POST /api/command/execute` - Execute command
- `GET /api/command/history` - Get user's command history
- `GET /api/command/suggestions?q=<input>` - Get autocomplete suggestions (debounced)
- `GET /api/command/help` - Get available commands and syntax

## Migration Strategy

### Phase 1: Backend (Week 1)
1. Create command parser
2. Add /api/command endpoints
3. Test with curl/Postman
4. Keep existing endpoints working

### Phase 2: New Dashboard (Week 2)
1. Create web/index-v2.html, app-v2.js, styles-v2.css
2. Build command bar component
3. Build basic panel rendering
4. Test in isolation

### Phase 3: Integration (Week 3)
1. Replace web/index.html with new version
2. Rename old files to web/legacy/ (archive only, not deployed)
3. Point / to new dashboard (hard cutover)
4. Test all command types end-to-end
5. Fix bugs

### Phase 4: Polish (Week 4)
1. Command history integration
2. Keyboard shortcuts refinement
3. Immediate autocomplete suggestions
4. Voice input (mobile microphone button)
5. Command syntax highlighting
6. Error handling with helpful hints

### Phase 5: Cleanup (Week 5)
1. Archive old dashboard files (move to docs/archive/)
2. Remove duplicate/unused API endpoints
3. Update all documentation (README, API docs)
4. Performance testing and optimization

## Success Metrics

**Code metrics:**
- Client code: 2400 lines → 1400 lines (42% reduction)
- Complexity: 70% fewer interaction handlers
- Bundle size: Smaller (less autocomplete logic)

**UX metrics:**
- Time to create note: 3-5 seconds → 1-2 seconds
- Keyboard shortcuts: 10+ key combinations → 3 main shortcuts
- Learning curve: Smoother (one command syntax to learn)

**Developer metrics:**
- New feature cost: 1/3 the effort (one parser to update)
- Bug surface: Smaller (less state management)
- Test coverage: Easier (pure functions for parsing)

## Design Decisions (Resolved)

1. **Command history** - ✅ Server-side, stored in Bartleby's memory system
   - All dashboard commands go into same history as CLI commands
   - Accessible via `GET /api/command/history`
   - Synced across devices

2. **Autocomplete** - ✅ Immediate suggestions while typing (Google-style)
   - Show matching commands as you type
   - Show matching projects/tags/contexts with +/@/#
   - Debounced to avoid excessive API calls (~150ms)

3. **Multiple results** - ✅ Opens appropriate panel
   - `show notes` → opens `notes` panel
   - `show project foo` → opens `project:foo` panel
   - `show inbox` → opens `inbox` panel
   - Query results displayed in the panel view, not in command bar

4. **Mobile** - ✅ Push-to-talk microphone button
   - Tap once to start recording
   - Tap again to stop and process
   - Visual indicator while recording
   - Transcription sent to command parser

5. **Migration** - ✅ Hard cutover, no legacy version
   - Old dashboard files moved to archive
   - Direct replacement of existing dashboard

## Open Questions (Still Deciding)

1. **Offline** - Should command history work offline?
2. **Help system** - In-app tutorial or just good hints?
3. **Undo** - Should there be a global undo command?

## Next Steps

1. Review and approve this spec
2. Create detailed command syntax reference
3. Build command parser with tests
4. Create mockups/wireframes if needed
5. Start Phase 1 implementation

---

**Note:** This is a complete rewrite, not a refactor. We're keeping the concepts (panels, WebSocket, authentication) but rebuilding the interaction model from scratch.

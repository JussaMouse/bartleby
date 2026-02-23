# Bartleby Command Reference

Complete list of all commands. For quick start, see [README.md](README.md).

---

## Actions (GTD)

| Command | Description |
|---------|-------------|
| `new action <text>` | Add a new action |
| `new action <text> @context` | With context (where to do it) |
| `new action <text> +project` | With project association |
| `new action <text> due:<date>` | With due date |
| `show next actions` | List actions grouped by context |
| `show overdue` | Actions past their due date |
| `done <number>` | Complete action by number |
| `done 1 2 3` | Complete multiple items at once |
| `done <name>` | Complete by name (partial match, tab-completable) |
| `edit <number> @context` | Change action's context |
| `edit <number> +project` | Change action's project |
| `edit <number> due:<date>` | Change action's due date |
| `capture <text>` | Quick capture to inbox |
| `waiting for` | Show delegated items |

**Due date formats:** `due:today`, `due:tomorrow`, `due:friday`, `due:1/15`, `(due tomorrow)`, `by friday`

**Due date with time:** `due:5pm`, `due:17:30`, `due:tomorrow 5pm`, `due:friday 3:30pm`

**Context examples:** `@phone`, `@computer`, `@errands`, `@home`, `@office`

---

## Projects

| Command | Description |
|---------|-------------|
| `new project <name>` | Create a new project |
| `show projects` | List projects with action counts |
| `delete project <name>` | Remove project (unlinks associated actions) |

---

## Notes, Entries & Media

| Command | Description |
|---------|-------------|
| `new page <title>` | Create wiki page (prompts for content, +project inline) |
| `new note <title>` | Create note (prompts for content) |
| `import <path> [name]` | Import image/file (+project inline) |
| `show pages` | List all wiki pages |
| `show notes` | List all notes |
| `show events` | List all calendar events |
| `show media` | List all imported media |
| `open <title>` | Display any page inline |
| `edit <title>` | Edit any page's project (tab-completable) |
| `recent` | Last 10 modified pages |
| `delete <title>` | Remove a page |
| `create view "<title>" showing <query>` | Create system view (dynamic query page) |

**Page vs Note:** Pages are permanent wiki pages. Notes are scratch/working text. Both support prompted content after creation.

**Edit any page:** Link to a project:
```
edit vacation photo +thailand
edit nort[TAB]  →  prompts for +project
```

**Import examples:**
```
import ~/photos/beach.jpg vacation photo +thailand
import "/path with spaces/doc.pdf" project specs +work
```

---

## Contacts

| Command | Description |
|---------|-------------|
| `add contact <name>` | Create a contact |
| `add contact <name>, email <email>, phone <phone>` | With details |
| `show contacts` | List all contacts |
| `find <name>` | Search contacts |
| `delete contact <name>` | Remove a contact |

---

## Garden Navigation

| Command | Description |
|---------|-------------|
| `show tagged <tag>` | Filter pages by tag |
| `#urgent` | Shorthand for `show tagged urgent` |
| `open <title>` | Display page content |
| `recent` | Recently modified pages |

---

## Calendar & Events

| Command | Description |
|---------|-------------|
| `today` | Today's unified schedule |
| `calendar` | Upcoming events and deadlines |
| `new event` | Create event (guided wizard) |
| `new event <title> <when> <reminder>` | Create event (inline) |
| `change calendar settings` | Configure calendar preferences |
| `reset calendar` | Clear settings, restart setup |

**Wizard flow:** Type `new event` and answer prompts for title, time, reminder, and extras.

**Inline examples:**
```
new event dentist tomorrow 2pm 15m reminder
new event call mom tomorrow night with mom
new event picnic when sunday noon who nicole leena where lakeside 1h reminder
```

**Keyword style:** Use `when`, `who`, `where` for complex events:
- `when sunday noon` — date and time
- `who nicole leena` — contacts (space-separated)
- `where lakeside` — location

**Time formats:** `2pm`, `2:30pm`, `14:00`, `noon`, `midnight`, `tonight`, `tomorrow night`

**Day formats:** `today`, `tomorrow`, `tomorrow morning/afternoon/evening/night`, `monday`, `wed`, `thurs`, `next friday`

**Date formats:** `1/22` (Jan 22), `1/22/26` (Jan 22, 2026)

---

## Reminders

| Command | Description |
|---------|-------------|
| `remind me <message> at <time>` | One-time reminder |
| `remind me <message> in <duration>` | Relative time |
| `send me a msg in 5 min '<text>'` | Alternative syntax |
| `show reminders` | List all scheduled |
| `cancel reminder <number>` | Cancel by number |
| `daily at <hour> <message>` | Recurring daily reminder |

**Duration formats:** `in 30 minutes`, `in 2 hours`, `in 1 day`

---

## Shed (Document Library)

| Command | Description |
|---------|-------------|
| `ingest <filepath>` | Add document to library |
| `ingest <url>` | Add from URL |
| `list sources` | Show ingested documents |
| `ask shed <question>` | Query your documents |

**Supported formats:** `.md`, `.txt`, `.pdf`

---

## Import System

### File Import

| Command | Description |
|---------|-------------|
| `import files` | Import files from inbox directory |
| `import files --ocr` | Import with OCR enabled |
| `confirm import` | Confirm pending imports |
| `show inbox` | List files in inbox awaiting import |
| `clear inbox` | Remove all files from inbox |

### Batch Import

| Command | Description |
|---------|-------------|
| `import all` | Import all inbox files with rule matching |
| `import all --dry-run` | Preview imports without executing |
| `import only images` | Import only image files |
| `import only documents` | Import only document files |
| `import only <type>` | Import specific file type |

### Import History

| Command | Description |
|---------|-------------|
| `import history` | View recent import history |
| `import history <limit>` | View last N imports |
| `search imports <query>` | Search import history |
| `import stats` | View import statistics by type |

### Import Rules

| Command | Description |
|---------|-------------|
| `show import rules` | List all import rules |
| `create import rule` | Interactive rule creation wizard |
| `edit import rule <name>` | Modify existing rule |
| `delete import rule <name>` | Remove rule |
| `test import rule <name>` | Dry-run test rule against inbox |

**Rule Creation Wizard Flow:**
1. Enter rule name
2. Choose file types to match (document, image, text, etc.)
3. Enter filename pattern (optional, regex supported)
4. Set auto-apply actions (project, context, privacy, tags)
5. Set priority (0-1000, higher = first)
6. Preview and save

**Example Rules:**
```
Rule: Financial Documents
  Match: *.pdf with filename containing "invoice" or "receipt"
  Actions: +finances, @admin, privacy:private, tags:[financial]
  Priority: 100

Rule: Work Photos
  Match: image files in work-photos/
  Actions: +work, privacy:confidential, tags:[work,photo]
  Priority: 50
```

### Import Profiles

| Command | Description |
|---------|-------------|
| `import profiles` | List available import profiles |
| `import with profile <name>` | Import using named profile |
| `create import profile` | Interactive profile creation |
| `edit import profile <name>` | Modify profile settings |
| `delete import profile <name>` | Remove profile |

**Profile Settings:**
- Default project, context, privacy
- OCR enabled/disabled
- Auto-confirm (skip confirmation prompt)
- Duplicate action (skip, prompt, or reimport)
- Rules enabled/disabled

**Example Profiles:**
```
work-documents
  → +work, @admin, privacy:confidential, OCR on, auto-confirm off

personal-photos
  → +memories, privacy:private, OCR off, auto-confirm on, skip duplicates

receipts
  → +finances, @admin, privacy:private, OCR on, tag:[receipt]
```

**Import Examples:**
```
import files                           # Interactive import
import all --dry-run                   # Preview batch import
import with profile work-documents     # Use profile
test import rule "Financial Docs"      # Test rule matching
```

---

## Settings

### View Settings

| Command | Description |
|---------|-------------|
| `settings` | Show all settings grouped by category |
| `settings <category>` | Show specific category settings |
| `settings stats` | View settings statistics |

**Categories:** `llm`, `embeddings`, `calendar`, `presence`, `import`, `defaults`, `content`, `ocr`, `weather`, `signal`, `scheduler`, `dashboard`

### Modify Settings

| Command | Description |
|---------|-------------|
| `set <key> to <value>` | Quick set a setting |
| `edit settings` | Interactive wizard for all categories |
| `edit <category> settings` | Interactive wizard for specific category |
| `reset settings` | Reset all settings to defaults |
| `reset settings <category>` | Reset category to defaults |

**Quick Set Examples:**
```
set calendar.timezone to America/New_York
set import.ocr-enabled to true
set llm.router-model to claude-opus-4-6
set defaults.privacy to private
```

### Setup & Migration

| Command | Description |
|---------|-------------|
| `setup wizard` | Run first-run setup wizard |
| `setup llm` | LLM configuration wizard |
| `setup calendar` | Calendar configuration wizard |
| `setup presence` | Presence configuration wizard |
| `setup import` | Import behavior wizard |
| `migrate settings` | Migrate .env to database (one-time) |

**First-Run Wizard Flow:**
1. Welcome message
2. LLM configuration (auto-detect models, choose tier strategy)
3. Embeddings setup (optional)
4. Calendar basics (timezone, date format)
5. Optional features (OCR, weather, presence)
6. Save all settings to database

**Migration for Existing Users:**

If you're upgrading from a version that used `.env` for all settings:

```bash
> migrate settings
# Reads your current .env
# Categorizes and saves settings to database
# Backs up .env to .env.backup
# Creates minimal bootstrap .env
# Done! Settings now managed via commands
```

**Settings Examples:**
```
settings                               # Show all settings
settings llm                          # Show LLM category
set calendar.timezone to Europe/London
edit calendar settings                 # Interactive wizard
reset settings presence               # Reset presence category
migrate settings                      # One-time migration from .env
```

---

## Context (Memory)

| Command | Description |
|---------|-------------|
| `what do you know about me` | Show stored facts |
| `show profile` | Same as above |
| `what did we talk about <topic>` | Search conversation history |

**Teaching Bartleby:**
- `my name is <name>`
- `I am a <type> person`
- `I prefer <preference>`
- `I like/love/hate <thing>`
- `my <relation> <name>` (wife, friend, boss, etc.)

**Memory Management (CLI only):**
```bash
# Monitor memory system
pnpm monitor                              # Database stats and health
pnpm optimize                             # Clean expired data and optimize
pnpm exec tsx scripts/verify-phase5.ts    # Verify Phase 5 enhancements

# Backup and restore
pnpm profile export                       # Export learning data to JSON
pnpm profile import <file>                # Restore from backup
```

---

## Weather

| Command | Description |
|---------|-------------|
| `weather` | Current weather |
| `what's the weather` | Same |

*Requires `WEATHER_API_KEY` and `WEATHER_CITY` in .env*

---

## System

| Command | Description |
|---------|-------------|
| `help` | Command overview |
| `help <topic>` | Detailed help |
| `status` | System health check |
| `quit` | Exit Bartleby |

**Help topics:** `garden`, `gtd`, `calendar`, `reminders`, `contacts`, `context`, `shed`, `settings`, `presence`, `llm`, `weather`, `time`

---

## Natural Language

Bartleby understands natural language, so these all work:

```
call mom tomorrow
new action buy groceries @errands
remember to stretch in 30 min
what's on my calendar today
add sarah to contacts
my meeting at 3pm got moved to 4
```

When in doubt, just say what you want. Bartleby will figure it out or ask for clarification.

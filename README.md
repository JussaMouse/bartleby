# Bartleby

The personal exocortex, locally.

- [What is Bartleby?](#what-is-bartleby)
- [Quick Start](#quick-start)
- [First 10 Minutes](#first-10-minutes)
- [Your Data](#your-data)
- [GTD Workflow](#gtd-workflow)
- [The Time System](#the-time-system)
- [Dashboard](#dashboard)
- [Running on a Server](#running-on-a-server)
- [Configuration](#configuration)
- [Backups](#backups)
- [Troubleshooting](#troubleshooting)

## What is Bartleby?

A local-first personal assistant. Runs on your machine with local LLMs.

- **The Garden** — Your wiki. Actions, projects, notes, contacts, calendar. Plain markdown files.
- **The Shed** — Your reference library. Ingest PDFs, ask questions.

Type commands in the CLI or speak them in the mobile app. One agent with many ways to interact.

---

## Quick Start

**1. Clone and install**

```bash
git clone https://github.com/JussaMouse/bartleby.git
cd bartleby
pnpm install
pnpm approve-builds
pnpm build
```

**2. Configure**

```bash
cp .env.example .env
```

Edit `.env` with your LLM endpoints. You'll need local models running (e.g., via [MLX](https://github.com/ml-explore/mlx), [Ollama](https://ollama.ai), or [llama.cpp](https://github.com/ggerganov/llama.cpp)).

At minimum:

```env
FAST_MODEL=your-model-name
FAST_URL=http://127.0.0.1:8080/v1

EMBEDDINGS_MODEL=your-embedding-model
EMBEDDINGS_URL=http://127.0.0.1:8081/v1
```

**3. Run**

```bash
pnpm start
```

You'll see:

```
📋 Bartleby is ready. Type "help" for commands, "quit" to exit.
📊 Dashboard: http://localhost:3333
```

**Pro tip:** Hit `TAB` to autocomplete commands, page names, contexts, and projects.

---

## First 10 Minutes

Try these commands.

### 1) Capture anything

```
> capture call insurance about claim
> capture idea for blog post
> capture look into that thing Jake mentioned
```

### 2) Create your first action

```
> new action call mom @phone #family
```

### 3) Make a project and link actions

```
> new project 2025 taxes
> new action gather W2 forms +2025-taxes
> new action call accountant +2025-taxes @phone
```

### 4) Create a wiki page (entry) and a scratch note

```
> new entry house rules #family +home
```

**Notes** support multi-line content. Two ways to create:

```
# With title upfront:
> new note cherry pie
📝 Note: cherry pie
What would you like to add to this note?
> grandma's secret recipe
> - 2 cups flour
> - 1 cup sugar
> done
Any project or tags? (e.g., +project #tag1 #tag2, or ENTER to skip)
> +thanksgiving #recipe
✓ Saved: cherry pie

# Without title (prompts for it):
> new note
What would you like to call this note?
> meeting notes jan 24
📝 Note: meeting notes jan 24
What would you like to add to this note?
> discussed Q1 roadmap
> - prioritize mobile app
> - hire 2 engineers
> done
Any metadata? (e.g., +project @context #tag with person, or ENTER to skip)
> +q1 planning @work #meeting with sarah
✓ Note saved: "meeting notes jan 24"
  +q1 planning @work #meeting with sarah
```

While in note mode, everything you type is appended verbatim — no routing, no AI processing. Type `done` when finished.

**Tagging step supports all operators:**
- `+project name` — link to project (spaces allowed, auto-creates)
- `@context` — set context  
- `#tag` — add tags
- `with person` — link to contact (auto-creates)

### 5) Import media

```
> import ~/photos/beach.jpg vacation photo +thailand #travel
(or drag into the dashboard)
```

### 6) Add an event in one line

```
> new event dentist tomorrow 2pm 15m reminder
```

### 7) Edit anything with tab completion

```
> edit nort[TAB]
> edit northside-hs-attendance-zone
> +home-search #schools
```

---

## Your Data

Everything lives on your machine in three places.

### The Garden

Plain markdown files. One file per page.

Two layers:
- **Files** — Flat directory of `.md` files with YAML backmatter
- **Database** — SQLite index, rebuilt automatically from files

**Page types:**
| Type | What it's for |
|------|---------------|
| `action` | A single next step you can do |
| `project` | An outcome requiring multiple actions |
| `item` | Inbox capture, not yet processed |
| `entry` | Wiki page — permanent structured knowledge |
| `note` | Scratch text, meeting notes, journal entries |
| `contact` | People, with email/phone/birthday |
| `list` | Dynamic smart lists (Next Actions, Projects) |
| `media` | Images and files imported into the garden |

**Entry vs Note:** An *entry* is a permanent wiki page ("house rules", "packing checklist"). A *note* is scratch/working text, often attached to a project.

Pages are dynamic — projects automatically display linked actions, notes, media, and calendar events.

**Commands:**
```
new entry <title>       Create a wiki page
new note <title>        Create a note
import <path> [name]    Import image/file
open <title>            View any page
show notes              List all notes
show projects           List all projects
```

**Files are the source of truth.** Edit them in any text editor — Bartleby watches for changes and syncs automatically.

**When you complete or delete something:** The file is removed and a record is appended to `archive.log`. This keeps your Garden clean while maintaining a permanent log.

Location: `./garden/`

### The Shed

Ingest documents, ask questions.

1. `ingest <file>` — chunks and embeds
2. `ask shed <question>` — searches chunks, synthesizes answer

**Commands:**
```
ingest <file or url>    Add to library (also creates Garden page)
list sources            Show all documents
ask shed <question>     Query your documents
```

**Example:**
```
> ingest ~/Documents/contract.pdf
✓ Ingested: contract.pdf (23 chunks)

> ask shed what are the payment terms
Based on the contract, payment is due within 30 days...
```

Location: `./shed/`

### About You

What Bartleby learns about you over time.

**Automatically collected from conversation:**
- Your name, preferences, habits
- Relationships ("my wife Sarah")
- Goals and interests
- Conversation history

**How Bartleby uses it:**
- Startup message surfaces relevant follow-ups
- Responses adapt to your preferences
- Can recall past conversations

**Teach Bartleby naturally:**
```
> my name is Lon
> I'm a morning person
> my wife Nicole wakes up late
> I prefer short meetings
```

**Commands:**
```
what do you know about me    Show stored facts
show profile                 Same
```

Location: `./database/memory/`

---

## GTD Workflow

Capture everything. Process later. Work from lists.

### Things You'll Work With

| Type | What it is | Example |
|------|------------|---------|
| **Item** | Raw capture, not yet processed | "Call someone about that thing" |
| **Action** | A single, concrete next step | "Call Dr. Smith to schedule checkup @phone" |
| **Project** | An outcome requiring multiple actions | "2025 Taxes" |
| **Event** | Something happening at a specific time | "Team meeting at 2pm" |

The key insight: an **action** is something you can actually *do*. "Do taxes" isn't an action — it's a project. "Find last year's W2" is an action.

### The Lists

GTD organizes your work into lists:

| List | What goes here | Command |
|------|----------------|---------|
| **Inbox** | Everything you capture, before processing | `process inbox` |
| **Next Actions** | Actions you can do now, organized by context | `show next actions` |
| **Projects** | Outcomes you're working toward | `show projects` |
| **Someday/Maybe** | Things you might do later | `show someday` |
| **Waiting For** | Actions blocked on someone else | `show waiting` |

### Items vs Actions

This distinction is key:

| Type | What it is | Has context? | Where it lives |
|------|------------|--------------|----------------|
| **Item** | Raw capture, not yet processed | No | Inbox |
| **Action** | Clarified, doable next step | Yes | Next Actions (by context) |

When you `capture` something, it becomes an **item** in your inbox. When you process the inbox and clarify what the next action is, it becomes an **action** with a context.

### Contexts

Contexts answer: *where or with what can I do this?* Only **actions** have contexts — items are contextless until processed.

| Context | When to use |
|---------|-------------|
| `@phone` | Need to make a call |
| `@computer` | Need your laptop |
| `@errands` | Need to be out |
| `@home` | Need to be home |
| `@office` | Need to be at work |
| `@waiting` | Delegated, waiting for response |
| `@focus` | Need uninterrupted time |

When you have 10 minutes and your phone, filter to `@phone` actions. When you're running errands, check `@errands`. Contexts let you see only what's possible right now.

```
> new action call mom @phone
> new action buy batteries @errands
> new action review proposal @focus
```

**Note:** There is no `@inbox` context. Items live in the inbox by virtue of being `type: item`, not by having a context.

### Tags

Tags categorize across types. Use them for:

- **Priority:** `urgent`, `important`
- **Topics:** `taxes`, `health`, `house`
- **Time horizons:** `thisweek`, `q1`

```
> new action call accountant @phone #taxes #urgent
> show tagged urgent
```

### Contacts

Link actions and events to people using the `with` operator (see [Linking Operators](#linking-operators)):

```
> new contact Sarah Chen, email sarah@example.com, phone 555-1234
> new action lunch meeting with sarah @calendar
> new event coffee with sarah friday 10am
```

Contact names are fuzzy-matched — "sarah" finds "Sarah Chen". Unknown names create contacts automatically.

**Query by contact:**
```
> show all with sarah
> do i have anything with nicole?
> open sarah chen
```

Opening a contact shows all linked actions, events, projects, and notes.

### Projects

A project is any outcome requiring more than one action. The key discipline: every project needs at least one action in your Next Actions list, or it stalls.

```
> new project 2025 taxes

> new action gather W2 forms +2025-taxes
> new action find last year's return +2025-taxes
> new action call accountant +2025-taxes @phone with jamie
```

The `+project` operator links actions to projects (see [Linking Operators](#linking-operators)). View a project to see all associated actions and more:

```
> open 2025 taxes
```

### The Workflow

```
Capture → Clarify → Organize → Review → Do
```

**1. Capture everything** — Get it out of your head immediately.
```
> capture call insurance about claim
> capture idea for blog post
> capture look into that thing Jake mentioned
```

**2. Clarify** — Process your inbox. For each item ask: Is it actionable?
- **Yes:** What's the next action? Create it.
- **No:** Delete it, file it as reference, or put it in Someday/Maybe.

```
> process inbox
> new action call insurance claims dept @phone
> done 2
```

**3. Organize** — Actions get contexts. Multi-step outcomes become projects.
```
> new action write blog outline @computer
> new project home renovation
```

**4. Review** — Weekly, look at all projects and lists. Is everything current? Does every project have a next action?
```
> show projects
> show next actions
> show waiting
```

**5. Do** — When it's time to work, filter by context and pick something.
```
> show next actions @phone
> done 1
```

### Linking Operators

Three operators connect actions and events to context, projects, and people:

| Operator | Meaning | Example |
|----------|---------|---------|
| `@context` | Where/how you'll do it | `@phone`, `@home`, `@computer` |
| `+project` | What it's part of | `+taxes`, `+trip-japan` |
| `with name` | Who's involved | `with sarah`, `with Dr. Lee` |

These can appear anywhere in a command:
```
> new action call accountant @phone +2025-taxes with sarah
> new event lunch with mike friday noon +team-building
```

**Auto-creation:** Using an unknown `@context`, `+project`, or `with name` creates it automatically:
```
> new action research flights +thailand-trip with jamie
✓ Created project: "thailand-trip"
✓ Created contact: "jamie"
✓ Added: "research flights"
```

### Tips

**Tab completion.** Hit `TAB` to autocomplete commands, page names, `@contexts`, `+projects`, and `with` contacts:
```
edit scr[TAB] @ho[TAB] +20[TAB]  →  edit screenshot tax form @home +2025-taxes
new action call with sar[TAB]   →  new action call with sarah chen
```

**Batch completion.** Complete multiple items at once after viewing any list:
```
> show inbox
> done 1 3 5
✓ Completed 3 items
```

---

## The Time System

Everything with a "when" shows up in one place.

### What it tracks

| Symbol | Type | Source |
|--------|------|--------|
| 📅 | Events | Calendar |
| ⚠️ | Deadlines | Actions with due dates |
| 🔔 | Scheduled | Reminders and recurring items |

### Commands

```
today                        Today's unified view
calendar                     Upcoming events and deadlines
new event                    Create event (guided wizard)
new event <details>          Create event (inline)
remind me <msg> in <time>    Set reminder
```

### Timed Actions

If you add a **time** to an action's `due:` it becomes a scheduled event in the Time System (30m default duration). It still behaves like a normal action, but you'll see it on the calendar for that day.

```
> new action submit report due:tomorrow 11am
```

### Creating Events

**Wizard mode** — type `new event` and answer prompts:

```
> new event
📅 **New Event**

What's the event?
> Coffee with Sarah
When? (e.g., tomorrow 3pm, 1/22 7:30am, friday 2pm)
> friday 10am
Reminder?
→ **none** / **15m** / **30m** / **1h**
> 15m
Add anything else? (Enter to skip)
→ **with <person>**, **at <location>**, **#tag**
> with sarah at Blue Bottle #social
✓ Created: Coffee with Sarah
  Friday, January 17 at 10:00 AM
  📍 Blue Bottle
  👤 sarah
  🏷️ #social
  🔔 Reminder: 15m before
```

**Inline mode** — everything in one command:

```
> new event dentist tomorrow at 2pm 15m reminder
> new event call mom tomorrow night with mom
> new event picnic when sunday noon who nicole leena where lakeside 1h reminder
```

The `when`, `who`, `where` keywords let you structure complex events clearly.

### Example

```
> today

📅 Today — Monday, January 13

  09:00  📅 Team standup
  14:00  📅 1:1 with Sarah
  17:00  ⚠️ Submit report (due)
```

### Notifications

When scheduled items come due, Bartleby notifies you:

- **Console** — Always shows in your terminal
- **Signal** — Optionally sends to your phone (see [Configuration](#notifications-signal))

If you weren't running when something was due, Bartleby handles missed items on next startup (configurable).

---

## Dashboard

Web UI at http://localhost:3333. View panels, edit pages, speak commands. Same data as CLI.

### Starting the Dashboard

```bash
# Terminal 1: Bartleby CLI
pnpm start

# Terminal 2: Dashboard server
pnpm dashboard
```

Open http://localhost:3333 in your browser.

### Panels

The dashboard shows live-updating panels:

| Panel | What it shows |
|-------|---------------|
| **Inbox** | Unprocessed items (`type: item`) |
| **Next Actions** | Actions grouped by context |
| **Projects** | Active projects (click to open) |
| **Notes** | All notes (click to open panel) |
| **Calendar** | Upcoming events + deadlines |
| **Today** | Today's events + overdue items |
| **Recent** | Last 10 modified pages |
| **REPL** | Command line in the browser |

Click the `+` buttons in the footer to add panels. Layout persists across reloads.

### Quick Create

Each panel has a **+ New** button for quick creation:

| Panel | Button | Creates |
|-------|--------|---------|
| Inbox | + New Item | Raw capture (no context) |
| Actions | + New Action | Action with `@home` context (inline edit) |
| Projects | + New Project | New project |
| Calendar | + New Event | Event (prompts for date/time) |
| Notes | + New Note | New note |

**Inline creation:** When you click **+ New Action**, an empty action appears and you can immediately start typing. Add `@context`, `+project`, or `#tags` inline, then press Enter to save.

### Editing Actions

Click any action to edit inline:

```
pack bags                    →  pack bags @home +thailand-trip due:friday
       ↑ click                        ↑ full text with context/project/due appears
```

- Line expands showing the full action text with `@context`, `+project`, and `due:date`
- Cursor appears at end — start typing to add/change metadata
- **Tab completion:** Type `@h[TAB]` → `@home`, or `+20[TAB]` → `+2025-taxes`
- **Save:** `Enter` or click Save
- **Cancel:** `Escape` or click Cancel
- **Done:** Mark action complete (disappears instantly)
- **Convert:** (Inbox only) Convert item to action, project, note, or event

**Changing context:** To move an action to a different context, edit it and change `@home` to `@phone` (or any context). New contexts are created automatically.

**New contexts:** Type any `@newcontext` — if it doesn't exist, it will be created. The action will appear under that context after you save.

### Editing Notes

Notes use the same inline editing as actions:

- **Click** any note → edit title inline, add `+project` or `#tags`
- **View** → opens note content in its own panel
- **Save** / **Cancel** / **Remove** buttons

Note panels show:
- Full content with markdown rendering
- Metadata (project, tags, last updated)
- Edit in REPL button for content changes

### Project Pages

Click a project name to open its dedicated panel showing:

- **Actions** — all actions linked to this project
- **Media** — images and files (click for full-size lightbox)
- **Notes** — notes linked to this project

### Importing Media & OCR

**Drag and drop** images or files onto the dashboard:

1. Drag any file onto the dashboard
2. Blue overlay appears: "Drop to import or OCR"
3. For images, a prompt appears:
   - **Type a title** — Extract text and save as note with that title
   - **1** — OCR only (extract text, show in REPL, don't save)
   - **3** — Import image to garden (can add `+project` `#tags`)
4. Non-images go straight to import

Images appear as thumbnails on project pages. Click to view full-size.

**CLI OCR:**
```
> ocr ~/Desktop/screenshot.png
```

### Voice Commands

Voice commands work via iOS Siri Shortcuts (see [Running on a Server](#option-3-siri-shortcuts-recommended-for-voice)). The shortcut handles speech-to-text and text-to-speech on-device for speed.

Works with any command you'd type in the CLI.

---

## Running on a Server

Run headless, access remotely.

### Basic Server Setup

```bash
# On server
git clone https://github.com/JussaMouse/bartleby.git
cd bartleby
pnpm install && pnpm approve-builds && pnpm build
cp .env.example .env
# Edit .env with your config

# Start in tmux or screen
tmux new -s bartleby
pnpm start
# Ctrl+B D to detach
```

### Accessing the Dashboard Remotely

**Option 1: SSH Tunnel (simplest, most secure)**

From your local machine:
```bash
ssh -L 3333:localhost:3333 user@your-server
```

Then open http://localhost:3333 locally.

Add to `~/.ssh/config` for convenience:
```
Host bartleby
    HostName your-server-ip
    User your-user
    LocalForward 3333 localhost:3333
```

Then just `ssh bartleby` — tunnel is created automatically.

**Option 2: Tailscale VPN (recommended for mobile)**

Tailscale creates a secure mesh VPN between your devices. No port forwarding needed.

**Setup on server (headless macOS):**

```bash
# Install
brew install tailscale

# Start daemon
sudo tailscaled &

# Authenticate (opens a URL to sign in)
sudo tailscale up
```

**Make it start on boot:**

```bash
sudo tee /Library/LaunchDaemons/com.tailscale.tailscaled.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.tailscale.tailscaled</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/tailscaled</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

sudo launchctl load /Library/LaunchDaemons/com.tailscale.tailscaled.plist
```

**Setup on iPhone:**
1. Install Tailscale from App Store
2. Sign in with same account
3. Access dashboard via Tailscale IP: `http://<server-tailscale-ip>:3333`

Find your server's Tailscale IP:
```bash
tailscale ip -4
```

**Configure Bartleby for VPN access:**

```env
DASHBOARD_HOST=0.0.0.0
DASHBOARD_PORT=3333
```

**Option 3: Siri Shortcuts (recommended for voice)**

Use iOS Shortcuts for hands-free voice commands. All speech recognition and text-to-speech happens on-device for speed.

**Quick Capture Shortcut** (fastest — dedicated endpoint):

1. Open Shortcuts app → tap **+**
2. Add action: **Dictate Text**
3. Add action: **Get Contents of URL**
   - URL: `http://<tailscale-ip>:3333/api/capture`
   - Method: **POST**
   - Headers: 
     - `Content-Type`: `application/json`
     - `Authorization`: `Bearer YOUR_TOKEN`
   - Request Body: **JSON**
     - Add field `text` with value: select **Dictated Text** variable
4. Add action: **Get Dictionary Value**
   - Key: `reply`
5. Add action: **Speak Text** → select **Dictionary Value**
6. Name shortcut "Bartleby Capture" (or "Capture" for shorter invocation)

Now say "Hey Siri, Bartleby Capture" → speak your thought → hear confirmation.

**Long Note Shortcut** (voice memos — no timeout):

For longer dictation that doesn't cut off after a pause:

1. Open Shortcuts app → tap **+**
2. Add action: **Dictate Text**
   - Stop Listening: **After Pause** (default)
3. Add action: **Set Variable**
   - Name: `Title`
4. Add action: **Dictate Text**
   - Stop Listening: **On Tap** ← key setting for long content
5. Add action: **Set Variable**
   - Name: `Content`
6. Add action: **Get Contents of URL**
   - URL: `http://<tailscale-ip>:3333/api/note`
   - Method: **POST**
   - Headers:
     - `Content-Type`: `application/json`
   - Request Body: **JSON**
     - `title`: select **Title** variable
     - `content`: select **Content** variable
7. Add action: **Speak Text** → "Saved" + **Title** variable
8. Name shortcut "Long Note" or "Voice Memo"

Say "Hey Siri, Long Note" → speak title → pause → speak your full note → tap Done → "Saved [title]"

The "On Tap" setting keeps Siri listening until you tap Done, allowing unlimited dictation length.

**General Command Shortcut** (any command):

Same as above but use URL: `http://<tailscale-ip>:3333/api/chat?voice=true`

The `?voice=true` parameter strips markdown from responses for cleaner TTS.

**OCR to Note Shortcut** (recommended — saves as note):

1. Open Shortcuts app → tap **+**
2. Add action: **Select Photos**
3. Add action: **Get Contents of URL**
   - URL: `http://<tailscale-ip>:3333/api/ocr/note`
   - Method: **POST**
   - Request Body: **Form**
     - Add field `file` with value: select **Photos** variable
4. Add action: **Get Dictionary from Input** (parse JSON response)
5. Add action: **Get Dictionary Value** → Key: `url`
6. Add action: **Open URLs** → Dictionary Value
7. Name shortcut "OCR"

Pick a photo → text is extracted → saved as "OCR Jan 15, 3:45 PM" → opens in browser.

**OCR Only Shortcut** (just extract text, no save):

Same as above but:
- URL: `http://<tailscale-ip>:3333/api/ocr`
- Get Dictionary Value key: `text`
- Use **Copy to Clipboard** instead of Open URLs

**Read Today Shortcut** (hear your schedule):

1. Open Shortcuts app → tap **+**
2. Add action: **Get Contents of URL**
   - URL: `http://<tailscale-ip>:3333/api/today?voice=true`
   - Method: **GET**
   - Headers:
     - `Authorization`: `Bearer YOUR_TOKEN`
3. Add action: **Get Dictionary Value**
   - Key: `summary`
4. Add action: **Speak Text** → select **Dictionary Value**
5. Name shortcut "Bartleby Today"

Say "Hey Siri, Bartleby Today" to hear your schedule and tasks.

**Read Inbox Shortcut** (hear pending items):

Same as above but use URL: `http://<tailscale-ip>:3333/api/inbox?voice=true`

**Tips:**
- Add shortcuts to Home Screen for one-tap access
- Use Shortcuts widget for quick capture
- "Hey Siri, Capture" works if you name the shortcut just "Capture"
- Share Sheet shortcuts let you OCR screenshots from any app

### API Token

For remote access, set an API token:

```env
BARTLEBY_API_TOKEN=your-secret-token
```

Requests must include:
```
Authorization: Bearer your-secret-token
```

**Security notes:**

- **`DASHBOARD_HOST=localhost`** (default) — Only accessible from the server itself
- **`DASHBOARD_HOST=0.0.0.0`** — Accessible from any network interface (use only with VPN/firewall)
- **`DASHBOARD_HOST=<tailscale-ip>`** — Bind only to Tailscale interface (recommended for remote access)

For remote access via Tailscale, you can bind specifically to your Tailscale IP:

```env
DASHBOARD_HOST=100.x.x.x   # Your Tailscale IP (find with: tailscale ip -4)
DASHBOARD_PORT=3333
```

This ensures Bartleby is only accessible via the VPN, not on local networks.

---

## Configuration

All settings live in `.env`.

### LLM Models

Bartleby uses a 4-tier model system:

| Tier | Size | Purpose | Speed |
|------|------|---------|-------|
| Router | 0.5-1B | Classify simple vs complex | ~50ms |
| Fast | 7-30B | Simple queries, single tools | ~500ms |
| Thinking | 30B+ | Multi-step reasoning | 2-10s |
| Embedding | ~1B | Text to vectors | ~100ms |

```env
# Router — Complexity classification
ROUTER_MODEL=mlx-community/Qwen3-0.6B-4bit
ROUTER_URL=http://127.0.0.1:8080/v1

# Fast — Simple queries
FAST_MODEL=mlx-community/Qwen3-8B-4bit
FAST_URL=http://127.0.0.1:8080/v1

# Thinking — Complex reasoning
THINKING_MODEL=mlx-community/Qwen3-30B-A3B-4bit
THINKING_URL=http://127.0.0.1:8080/v1

# Embeddings — Semantic search
EMBEDDINGS_MODEL=nomic-ai/nomic-embed-text-v1.5
EMBEDDINGS_URL=http://127.0.0.1:8081/v1
```

### OCR (Optional)

Extract text from images using a vision-language model like olmOCR:

```env
OCR_URL=http://127.0.0.1:8085/v1
OCR_MODEL=olmocr
OCR_MAX_TOKENS=4096
```

**Recommended model:** `olmOCR-2-7B-1025-MLX-8bit` — optimized for text extraction, runs on Apple Silicon.

**Usage:**

```
> ocr ~/Desktop/receipt.png
**Text from receipt.png:**

COSTCO WHOLESALE
1234 WAREHOUSE BLVD
...
TOTAL: $127.43

> import ~/Desktop/screenshot.png meeting notes
📎 Media imported: meeting notes
  📁 screenshot.png
  🔍 OCR: 847 characters extracted
```

When OCR is enabled, imported images automatically have their text extracted and stored.

### Calendar

```env
CALENDAR_TIMEZONE=America/Los_Angeles
CALENDAR_DEFAULT_DURATION=60
CALENDAR_AMBIGUOUS_TIME=afternoon    # morning|afternoon|ask
CALENDAR_WEEK_START=sunday           # sunday|monday
CALENDAR_DATE_FORMAT=mdy             # mdy (1/15=Jan 15) | dmy (1/15=15 Jan)
CALENDAR_EVENT_REMINDER_MINUTES=15   # 0 to disable
```

Or configure interactively:
```
> change calendar settings
```

### Notifications (Signal)

Get notifications on your phone via Signal:

```env
SIGNAL_ENABLED=true
SIGNAL_CLI_PATH=/usr/local/bin/signal-cli
SIGNAL_NUMBER=+1234567890      # Your Signal number
SIGNAL_RECIPIENT=+0987654321   # Where to send notifications
```

**Signal Setup:**
1. Install [signal-cli](https://github.com/AsamK/signal-cli)
2. Register/link your number
3. Configure the settings above
4. Test: `msg me in 1 min: test`

### Presence

Control when Bartleby speaks unprompted:

```env
PRESENCE_STARTUP=true          # Show opener at startup
PRESENCE_SHUTDOWN=true         # Show tomorrow preview at quit
PRESENCE_SCHEDULED=true        # Morning/evening reviews
PRESENCE_CONTEXTUAL=true       # Surface related info during chat
PRESENCE_IDLE=false            # Nudge after idle period
```

### Paths

Where Bartleby stores data:

```env
GARDEN_PATH=./garden      # Your wiki (markdown files)
SHED_PATH=./shed          # Ingested documents
DATABASE_PATH=./database  # SQLite indexes
LOG_DIR=./logs            # Log files
```

### Logging

```env
LOG_LEVEL=INFO            # DEBUG, INFO, WARN, ERROR
LOG_LLM_VERBOSE=false     # Show model reasoning (debugging)
```

### Scheduler

```env
SCHEDULER_ENABLED=true              # Enable reminders and scheduling
SCHEDULER_CHECK_INTERVAL=60000      # How often to check (ms)
SCHEDULER_MISSED_REMINDERS=         # What to do with missed items:
                                    #   ask  = summarize and prompt
                                    #   fire = execute immediately
                                    #   skip = dismiss silently
                                    #   show = display only
```

### Weather (Optional)

```env
WEATHER_API_KEY=your-key  # OpenWeatherMap API key
WEATHER_CITY=London       # City for weather queries
```

Get a free API key at [openweathermap.org](https://openweathermap.org/api).

### Dashboard

```env
DASHBOARD_PORT=3333       # Default port
DASHBOARD_HOST=localhost  # Options: localhost, 0.0.0.0, or specific IP
BARTLEBY_API_TOKEN=       # Optional: require token for /api/chat and /api/capture
```

**Host binding options:**

| Value | Accessible from | When to use |
|-------|-----------------|-------------|
| `localhost` | Server only | Default, most secure |
| `0.0.0.0` | All interfaces | Behind VPN/firewall only |
| `100.x.x.x` | Tailscale only | Remote access without exposing to LAN |

**Authentication:** The API token is required only for `/api/chat` and `/api/capture`. Dashboard panels and other endpoints work without auth (they're read-only or modify only your own data).

---

## Backups

### What to Back Up

| Path | Contains | Format |
|------|----------|--------|
| `garden/` | All your pages, notes, media | Markdown files |
| `garden/archive.log` | Completed/deleted items | Text log |
| `database/` | SQLite indexes | `.sqlite3` files |
| `shed/` | Ingested documents and embeddings | Mixed |

### Quick Backup

```bash
# Backup everything personal
tar -czvf bartleby-backup-$(date +%Y%m%d).tar.gz \
    garden/ \
    database/*.sqlite3 \
    shed/ \
    .env
```

### Restore

```bash
# Stop Bartleby first
tar -xzvf bartleby-backup-20260115.tar.gz
pnpm start
```

### Sync to Cloud

The `garden/` folder is just markdown — sync it however you like:

```bash
# rsync to another machine
rsync -avz garden/ user@backup-server:~/bartleby-garden/

# Or use any cloud sync (Syncthing, Dropbox, iCloud Drive)
```

**Tip:** The SQLite databases are indexes derived from the markdown files. If you lose them, Bartleby rebuilds them on startup from the files in `garden/`.

---

## Security

Bartleby stores sensitive personal data. Follow these practices to protect it.

### Full-Disk Encryption (Required)

All Bartleby data is stored unencrypted. Enable full-disk encryption:

**macOS (FileVault):**
```bash
# Check status
fdesetup status

# Enable via System Settings → Privacy & Security → FileVault
# Or via terminal:
sudo fdesetup enable
```

**Linux (LUKS):** Enable during OS installation or use `cryptsetup`.

### File Permissions

Restrict access to sensitive files:

```bash
chmod 600 .env                    # Config with API tokens
chmod 700 garden database shed    # Your data
chmod 700 logs                    # May contain titles
```

### Network Exposure

**Critical:** Most dashboard endpoints have NO authentication. If exposed to a network, anyone can read/modify/delete your data.

| `DASHBOARD_HOST` | Who can access |
|------------------|----------------|
| `localhost` | Only the server (default, safest) |
| `100.x.x.x` (Tailscale IP) | Only your VPN devices |
| `0.0.0.0` | **Everyone on all networks** (dangerous) |

```env
# SAFE: Tailscale only
DASHBOARD_HOST=100.x.x.x

# DANGEROUS: Open to local network
DASHBOARD_HOST=0.0.0.0
```

### Logging

Debug logs may contain sensitive content (titles, commands):

```env
# Production setting
LOG_LEVEL=info

# Never in production (logs LLM conversations)
LOG_LLM_VERBOSE=false
```

### Quick Checklist

- [ ] Full-disk encryption enabled (FileVault/LUKS)
- [ ] `.env` permissions are `600`
- [ ] `DASHBOARD_HOST` is `localhost` or Tailscale IP
- [ ] `LOG_LEVEL` is `info` (not `debug`)
- [ ] Backups are encrypted

For detailed security analysis, see [devs-notes/SECURITY.md](devs-notes/SECURITY.md).

---

## Troubleshooting

### "Cannot find module" errors

```bash
pnpm build
```

### Native module errors (hnswlib-node)

```bash
pnpm rebuild hnswlib-node
# or
rm -rf node_modules && pnpm install && pnpm approve-builds && pnpm build
```

### better-sqlite3 version mismatch

If you see `NODE_MODULE_VERSION` errors after updating Node.js:

```bash
pnpm rebuild better-sqlite3
```

### LLM not responding

1. Check model is running: `curl http://127.0.0.1:8080/v1/models`
2. Check `.env` URLs match your setup
3. Run `status` in Bartleby to see which tiers are connected

### Signal notifications not working

1. Verify signal-cli path: `which signal-cli`
2. Check it's registered: `signal-cli -u +YOUR_NUMBER receive`
3. Verify `.env` settings match

### Logs

```bash
tail -f logs/bartleby.log
```

Set `LOG_LEVEL=DEBUG` for verbose output.

---

## More

- [COMMANDS.md](COMMANDS.md) — Full command reference
- [TECH_SPEC.md](TECH_SPEC.md) — Developer documentation, database schemas, architecture

---

## License

MIT — see [LICENSE](LICENSE)

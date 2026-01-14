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

## Notes & Pages

| Command | Description |
|---------|-------------|
| `new note <title>` | Create note (prompts for content) |
| `show notes` | List all notes |
| `open <title>` | Display any page inline |
| `recent` | Last 10 modified pages |
| `delete <title>` | Remove a page |

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
| `calendar` | Upcoming events, deadlines, reminders |
| `new event` | Create event (guided wizard) |
| `add event <title> at <time>` | Create event (inline) |
| `add event 1/22/26 7:30am <title>` | Date-first format |
| `change calendar settings` | Configure calendar preferences |
| `reset calendar` | Clear settings, restart setup |

**Wizard flow:** Type `new event` and answer prompts for title, time, and reminder.

**Time formats:** `2pm`, `2:30pm`, `14:00`, `noon`, `midnight`

**Day formats:** `today`, `tomorrow`, `monday`, `wed`, `next friday`

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

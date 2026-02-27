# Bartleby Command Reference

Complete list of all commands. For quick start, see [README.md](README.md).

---

## Capture & Actions (GTD)

| Command | Description |
|---------|-------------|
| `capture <text>` | Quick capture to inbox |
| `show inbox` | List unprocessed inbox items |
| `process <title>` | Convert inbox item to action/note/project |
| `add action <text>` | Add a new action |
| `add action <text> @context` | With context (where to do it) |
| `add action <text> due:<date>` | With due date |
| `show next actions` | List active actions |
| `complete <title>` | Mark an action done |
| `edit action <title>` | Update action fields |
| `list actions` | List all actions (any status) |

**Context examples:** `@phone`, `@computer`, `@errands`, `@home`, `@office`

**Due date formats:** `due:today`, `due:tomorrow`, `due:friday`, `due:1/15`

---

## Projects

| Command | Description |
|---------|-------------|
| `new project <name>` | Create a new project |
| `show project <name>` | View project with its actions and notes |
| `complete project <name>` | Mark project done |
| `list projects` | List all projects |

---

## Notes

| Command | Description |
|---------|-------------|
| `new note <title>` | Create a note |
| `show note <title>` | Display note content |
| `edit note <title>` | Update note fields |
| `delete note <title>` | Remove a note |
| `list notes` | List all notes |
| `tag note <title> with <tag>` | Add a tag to a note |

---

## Contacts

| Command | Description |
|---------|-------------|
| `add contact <name>` | Create a contact |
| `show contact <name>` | View contact details |
| `edit contact <name>` | Update contact fields |
| `list contacts` | List all contacts |
| `find contact <query>` | Search contacts by name |

---

## Events & Calendar

| Command | Description |
|---------|-------------|
| `new event <title> <when>` | Create an event |
| `show event <title>` | View event details |
| `edit event <title>` | Update event fields |
| `list events` | Show upcoming events |
| `show calendar` | View events this week |

**Time formats:** `2pm`, `2:30pm`, `14:00`, `noon`, `tomorrow`, `monday`, `1/15`

---

## Tags

| Command | Description |
|---------|-------------|
| `new tag <name>` | Create a tag |
| `list tags` | List all tags |
| `show tag <name>` | View notes with this tag |

---

## Media

| Command | Description |
|---------|-------------|
| `import <path>` | Import a file as a media record |
| `show media <title>` | View media record details |

**Supported formats:** images (jpg, png, gif, webp), documents (pdf, txt, md)

---

## Views (Dashboard)

| Command | Description |
|---------|-------------|
| `list views` | Show all available views |
| `open view <name>` | Display a view |
| `create view <name>` | Create a custom view |
| `delete view <name>` | Remove a user-created view |

**Built-in views:** Inbox, Next Actions, Waiting For, Someday Maybe, All Notes, All Projects, All Events, Contacts

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
| `/rules` | View your standing instructions |
| `delete rule <number>` | Remove a standing instruction |
| `delete rule all` | Remove all standing instructions |

**Teaching Bartleby:**
- `my name is <name>`
- `I prefer <preference>`
- `my <relation> <name>` (wife, friend, boss, etc.)

**Standing Instructions (mandatory rules):**

Append `(remember this)` to save a mandatory rule for every response:

```
always use bullet points (remember this)
never use markdown headers (remember this)
keep all responses under 100 words (remember this)
remember this: always greet me by name
rule: respond in plain text only
```

---

## Settings

| Command | Description |
|---------|-------------|
| `settings` | Show all settings grouped by category |
| `settings <category>` | Show specific category |
| `set <key> to <value>` | Quick set a setting |
| `edit settings` | Interactive wizard |
| `reset settings` | Reset to defaults |
| `migrate settings` | Migrate .env to database (one-time) |

**Quick Set Examples:**
```
set llm.router-model to claude-opus-4-6
set weather.city to Portland
```

---

## Weather

| Command | Description |
|---------|-------------|
| `weather` | Current weather |
| `what's the weather` | Same |

*Requires `weather.city` and `weather.api-key` — set via settings.*

---

## History

| Command | Description |
|---------|-------------|
| `show history` | Recent conversation history |
| `search history <query>` | Search past conversations |

---

## System

| Command | Description |
|---------|-------------|
| `help` | Command overview |
| `status` | System health check |
| `quit` | Exit Bartleby |

If Signal inbound is enabled, any command above can be sent via Signal and treated like REPL input.

---

## Settings

| Command | Description |
|---------|-------------|
| `settings` | Show all settings |
| `settings <category>` | Show one category (e.g., `settings signal`) |
| `set <key> to <value>` | Update a setting |
| `edit <category> settings` | Run a category wizard |

---

## Natural Language

Bartleby understands natural language, so these all work:

```
call mom tomorrow
new action buy groceries @errands
what's on my calendar today
add sarah to contacts
```

When in doubt, just say what you want. Bartleby will figure it out or ask for clarification.

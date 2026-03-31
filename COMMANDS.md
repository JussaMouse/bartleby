# Bartleby Commands

This document is the practical command reference for Bartleby.

It is meant to be:
- accurate to the current codebase
- useful for both normal users and power users
- clear about what is stable vs what is still evolving

This is not a complete architecture document. For deeper runtime and system design, see `TECH_SPEC.md`.

---

## How To Read This

- Commands are shown in their **canonical form**.
- Bartleby may accept additional natural-language variants, but this document prefers the clearest syntax.
- Multi-step flows such as inbox processing, setup, note editing, and guided settings are now workflow-driven.
- `<WIP> ... </WIP>` marks features or sections that are real but still evolving.

---

## Core

| Command | What it does |
|---|---|
| `help` | Show a concise command reference in Bartleby |
| `status` | Show overall system and workspace status |
| `quit` | Exit Bartleby |
| `exit` | Exit Bartleby |
| `shutdown` | Exit Bartleby |

---

## Capture / Inbox

| Command | What it does |
|---|---|
| `capture <text>` | Capture an item into the inbox |
| `jot down <text>` | Capture an item into the inbox |
| `show inbox` | Show unprocessed inbox items |
| `process inbox` | Start the guided inbox-processing workflow |
| `process <item>` | Convert a specific inbox item into another record type |
| `convert <item> to action` | Convert an inbox item into an action |
| `convert <item> to project` | Convert an inbox item into a project |
| `convert <item> to note` | Convert an inbox item into a note |

### Notes
- `process inbox` is the preferred workflow for inbox clarification.
- The guided inbox flow can turn captured items into actions, projects, notes, events, note appends, or someday items.

---

## Actions / Projects

| Command | What it does |
|---|---|
| `add action <title>` | Create a next action |
| `create action <title>` | Create a next action |
| `new action <title>` | Create a next action |
| `show next actions` | Show active next actions |
| `list actions` | Show active next actions |
| `complete <action>` | Mark an action complete |
| `done <action>` | Mark an action complete |
| `finish <action>` | Mark an action complete |
| `edit action <...>` | Edit an action |
| `update action <...>` | Edit an action |
| `new project <title>` | Create a project |
| `create project <title>` | Create a project |
| `show project <title>` | Open a project record |
| `list projects` | Show active projects |
| `complete project <title>` | Mark a project complete |

### Notes
- Use an **action** for something concrete you can do now.
- Use a **project** for an outcome that requires more than one action.

---

## Notes / Contacts / Events

### Notes

| Command | What it does |
|---|---|
| `create note <title>` | Start the guided note-creation workflow |
| `new note <title>` | Start the guided note-creation workflow |
| `edit note <title>` | Start the guided note-edit workflow |
| `show note <title>` | Open a note |
| `list notes` | Show notes |
| `delete note <title>` | Delete a note |
| `tag <note> with <tag>` | Tag a note |

### Contacts

| Command | What it does |
|---|---|
| `new contact <name>` | Create a contact |
| `add contact <name>` | Create a contact |
| `show contact <name>` | Open a contact |
| `list contacts` | Show contacts |
| `find contact <query>` | Search contacts |
| `search contacts <query>` | Search contacts |

### Events / Calendar

| Command | What it does |
|---|---|
| `new event <title>` | Create an event |
| `create event <title>` | Create an event |
| `schedule event <title>` | Create an event |
| `show event <title>` | Open an event |
| `list events` | Show events |
| `calendar` | Show calendar / event overview |
| `show calendar` | Show calendar / event overview |

### Notes
- Note creation and note editing are workflow-driven.
- Contacts and events are core user-facing record types, not side features.

---

## Garden / Media / Tags

### Tags

| Command | What it does |
|---|---|
| `create tag <title>` | Create a tag |
| `new tag <title>` | Create a tag |
| `list tags` | Show tags |
| `show tag <title>` | Open a tag |

### Media

| Command | What it does |
|---|---|
| `import <file>` | Import a file into Bartleby |
| `import file <file>` | Import a file into Bartleby |
| `attach image <file>` | Import an image |
| `show media <title>` | Open a media record |

<WIP>
OCR and some media behaviors depend on optional configuration and are still evolving.
</WIP>

---

## Shed

| Command | What it does |
|---|---|
| `ingest <filepath>` | Ingest a document into Shed |
| `list sources` | Show ingested sources |
| `ask shed <question>` | Ask a question against ingested sources |

<WIP>
Shed is real and usable, but should still be treated as evolving. Document ingestion and question-answering are the narrow supported path.
</WIP>

---

## Signal / Weather

### Signal

| Command | What it does |
|---|---|
| `send signal <message>` | Send a Signal message to the configured recipient |
| `signal <message>` | Send a Signal message to the configured recipient |

<WIP>
Signal-based reminders, scheduled review delivery, and fully autonomous Bartleby-driven reminders are still evolving.
</WIP>

### Weather

| Command | What it does |
|---|---|
| `weather` | Get weather information |

---

## Settings / Setup

### Setup

| Command | What it does |
|---|---|
| `setup wizard` | Start the guided setup workflow |
| `first run` | Start the guided setup workflow |
| `initial setup` | Start the guided setup workflow |

### Guided Settings

| Command | What it does |
|---|---|
| `settings wizard` | Start the guided settings workflow |
| `guided settings` | Start the guided settings workflow |
| `configure settings` | Start the guided settings workflow |

### Direct Settings Commands

| Command | What it does |
|---|---|
| `settings` | Show settings overview |
| `settings <category>` | Show a settings category |
| `set <key> to <value>` | Set a setting |
| `set <key> = <value>` | Set a setting |
| `settings stats` | Show settings statistics |
| `settings info` | Show settings statistics |

### Notes
- Setup and guided settings are workflow-driven.
- Direct settings commands remain one-shot and exact.

---

## Advanced / Technical

These commands are directly usable, but they are more technical and may be most useful to power users, operators, or developers.

### Routing Telemetry

| Command | What it does |
|---|---|
| `routing stats` | Show routing telemetry summary |
| `routing recent` | Show recent routing events |
| `routing recommendations` | Show routing recommendations |

### Router Training

| Command | What it does |
|---|---|
| `routing training status` | Show router training status |
| `routing training review` | Show router training review queue |
| `routing training review <n>` | Show a limited review queue |
| `routing training review approve <id>` | Approve a review item |
| `routing training review approve <id> <DIRECT_TOOL|FAST_AGENT|THINKING_AGENT>` | Approve/relabel a review item |
| `routing training review reject <id>` | Reject a review item |
| `routing training run` | Queue or manage a training run |
| `routing training run now --force` | Force a training run now |
| `routing training run next` | Queue the next run |
| `routing training run resume <run-id>` | Resume a run |
| `routing training run inspect <run-id>` | Inspect a run |
| `routing training compare <run-id>` | Compare a candidate run |
| `routing training promote <run-id>` | Promote a run |
| `routing training rollback` | Roll back the active adapter |

### OCR

| Command | What it does |
|---|---|
| `ocr <image>` | Extract text from an image |

### Data / SQL

| Command | What it does |
|---|---|
| `tables` | Show tables in the data database |
| `describe <table>` | Show table schema |
| `sql <query>` | Run a SQL query |
| `ingest csv <file> as <table>` | Import a CSV/TSV file |
| `export "<query>" to <file>` | Export SQL query results |
| `snapshot <table>` | Snapshot a table |
| `restore <snapshot> to <table>` | Restore a snapshot |

### Tax Mode

| Command | What it does |
|---|---|
| `tax mode` | Enter tax preparation mode |
| `tax status` | Show tax session status |
| `preview <UPDATE|DELETE SQL>` | Preview destructive data changes |
| `exit tax mode` | Exit tax mode |

---

## Commands Not Included Here

The following command/surface types are intentionally excluded from this user-facing command reference:
- internal workflow routing commands
- legacy/internal memory tools not intended as a normal product surface
- older user-facing view-management concepts that are no longer part of the intended user model

---

## Planned Cleanup Of Stale Commands And Code

The following surfaces should be removed or further uprooted from the project so implementation and documentation converge cleanly.

### Remove / keep out of user docs
- internal workflow router surface
- legacy/internal memory tool surface:
  - `storeObservation`
  - `retrieveContext`
  - `updateObservation`
  - `forgetObservation`
- any remaining user-facing custom view-management surfaces

### Reframe, not remove
These commands remain valid, but should be understood as workflow-driven behaviors rather than old one-shot mental models:
- `create note ...`
- `edit note ...`
- `setup wizard`
- `settings wizard`
- `process inbox`

### Suggested cleanup plan
1. remove or hard-hide legacy/internal memory tools from the public tool surface
2. remove any remaining stale user-facing view-management surfaces from active docs and code paths
3. keep workflow-driven surfaces documented as workflows, not parser tricks
4. re-run command inventory generation after each cleanup milestone so `COMMANDS.md` stays truthful

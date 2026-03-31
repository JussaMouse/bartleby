# Bartleby

Bartleby is a local-first personal assistant for work, life, and knowledge management.

You can use it to capture ideas, organize actions and projects, track events, manage contacts, build a personal everything-wiki, ingest reference material, and interact through both the CLI and Signal. Over time, Bartleby is designed to learn and adapt to the user.

The current first-class interface is the CLI. Signal is already useful today. `<WIP>` Dashboard and app/mobile interfaces are in progress. `</WIP>`

## What You Can Do With Bartleby

- Capture things quickly before they disappear from your mind
- Process inbox items into actions, projects, notes, events, or someday items
- Manage actions and projects from explicit review lists
- Keep notes, contacts, and events in one connected system
- Use Bartleby as a personal everything-wiki / data vault for knowledge work
- Ingest documents into a reference library and ask questions about them
- Import files and images, with OCR available when configured
- Interact through the CLI and through Signal
- Configure Bartleby through guided setup and settings flows

## Interface Status

### CLI

The CLI / REPL is the primary documented interface today.

It is the best-supported path for:
- setup
- daily use
- inbox processing
- working with actions, projects, notes, contacts, and events
- configuration
- document/reference workflows

### Signal

Signal is already useful as a real second interface.

Today, Signal can be used to:
- send messages to Bartleby and get replies
- ask Bartleby to send useful things to you in Signal
- use message-based interaction when you do not want to be in the CLI

For example, a user can tell Bartleby to send something useful to Signal, and Bartleby can do it.

<WIP>
Signal reminder delivery, scheduled daily/weekly review delivery, and fully autonomous Bartleby-driven reminders are still work in progress.
</WIP>

### Dashboard

<WIP>
A dashboard interface belongs here in the future. It exists in the codebase but is not yet the primary documented workflow.
</WIP>

### App / Mobile

<WIP>
App/mobile surfaces are in progress and will eventually live alongside the CLI and Signal as first-class conduits into the same Bartleby runtime.
</WIP>

## Install

### Requirements

- Node.js `22+`
- `pnpm`
- At least one OpenAI-compatible inference endpoint for LLM calls

Local inference is the preferred setup.

Bartleby is backend-agnostic as long as the endpoint is OpenAI-compatible. You can use local or remote inference, but local-first is the intended default.

### Install Steps

```bash
git clone https://github.com/JussaMouse/bartleby.git
cd bartleby
pnpm install
pnpm approve-builds
pnpm build
```

## First Run

Start Bartleby:

```bash
pnpm start
```

On first launch, Bartleby runs a guided setup flow.

That flow helps you:
- set up basic runtime defaults
- name yourself and the assistant
- choose between recommended or guided settings
- walk through settings categories if you want more control

You can also re-run setup later:

```text
setup wizard
```

Useful first commands after startup:

```text
help
status
settings
show inbox
show next actions
calendar
```

## How To Use Bartleby Well

Bartleby works best when you use a few simple ideas consistently.

### Capture first, decide later

If something should not stay in your head, capture it.

Do not worry about organizing it perfectly at capture time.

### An action is something you can actually do

An action is a concrete next step.

Examples:
- `call insurance`
- `email Sarah`
- `draft outline`

### A project is an outcome that needs multiple steps

If something cannot be done in one step, it is usually a project.

Examples:
- `finish taxes`
- `move apartments`
- `launch website`

Bartleby should help you keep the difference clear while you work:
- **action** = doable now
- **project** = outcome requiring multiple actions

### Notes, contacts, and events are part of the same system

Bartleby is not just tasks.

Your notes, contacts, events, captured items, imported media, and reference material all belong to one connected personal system.

## Capture And Process

### Capture

Use capture for anything that should be remembered, reviewed, or turned into something more structured later.

```text
capture call insurance about claim
capture ask Jake about invoice
capture idea for article
```

Likely result:
- Bartleby stores the item in your inbox for later processing

### Review the inbox

```text
show inbox
```

Likely result:
- Bartleby shows your unprocessed captured items

### Process the inbox

```text
process inbox
```

Likely result:
- Bartleby starts a guided workflow
- each inbox item can become:
  - an action
  - a project
  - a note
  - an event
  - an appended note entry
  - a someday / idea item
  - or be skipped

This is one of the most important Bartleby workflows because it turns raw capture into a trustworthy working system.

### Example

```text
> capture call accountant about tax deadline
Captured: call accountant about tax deadline

> process inbox
Starts guided inbox processing.

> action
Creates an action from that inbox item.
```

## Actions And Projects

### Create actions

Use actions for concrete next steps.

```text
new action call accountant @phone
new action draft proposal @computer
new action buy batteries @errands
```

Likely result:
- Bartleby creates active next actions you can review later

### Review next actions

```text
show next actions
```

Likely result:
- Bartleby shows your current actionable work list

### Complete actions

```text
complete call accountant
```

Likely result:
- Bartleby marks the action complete

### Create projects

Use projects for outcomes that need more than one step.

```text
new project 2026 taxes
new project kitchen repairs
list projects
```

Likely result:
- Bartleby creates project records and lets you review them separately from actions

### Open a project

```text
show project 2026 taxes
```

Likely result:
- Bartleby shows the project and its related work

### A practical rule

- `call accountant` is an action
- `finish taxes` is a project

That distinction matters because Bartleby is more useful when your list of actions contains only things you can really do.

## Notes, Contacts, And Events

### Notes

Use notes for:
- reference material
- working documents
- meeting notes
- personal wiki pages
- long-lived knowledge

```text
create note meeting notes march 31
list notes
show note meeting notes march 31
```

Likely result:
- Bartleby creates and opens notes as part of your knowledge system

Notes are not a side feature. They are part of how Bartleby becomes a personal everything-wiki.

### Contacts

Use contacts to maintain your people directory.

```text
new contact Jane Smith
list contacts
show contact Jane Smith
find contact Jane
```

Likely result:
- Bartleby stores and retrieves contact records you can connect to work and events

### Events and calendar

Events are a core part of Bartleby.

Use them for:
- appointments
- meetings
- deadlines with time
- calendar commitments

```text
new event dentist friday 2pm
new event team meeting next Tuesday 3pm
calendar
list events
```

Likely result:
- Bartleby stores the event and lets you review upcoming commitments

## The Garden

The Garden is Bartleby’s personal everything-wiki / data vault for knowledge work.

This is where Bartleby keeps your durable personal system:
- captured items
- actions
- projects
- notes
- contacts
- events
- tags
- imported media

The Garden is not just a place for notes.

It is the connected personal record space that powers:
- your work lists
- your calendar
- your knowledge base
- your reference material
- your personal operational context

As you use Bartleby, the Garden becomes the place where your life and work information actually lives in usable form.

## Shed: Your Reference Library

Shed is Bartleby’s reference-library capability.

It lets you ingest documents and ask questions about them.

### Ingest a document

```text
ingest ./reference.md
ingest ./notes.txt
ingest ./paper.pdf
```

Likely result:
- Bartleby ingests the source
- stores it in the reference system
- makes it available for retrieval and question-answering

### List sources

```text
list sources
```

Likely result:
- Bartleby shows what has been ingested

### Ask Shed

```text
ask shed what does this document say about refunds
```

Likely result:
- Bartleby answers based on ingested material and cites the source in its response

Shed is important because it extends Bartleby from personal organization into personal reference work.

<WIP>
Shed is usable and worth documenting, but it should still be described conservatively. It is not yet a claim of perfect or universal document intelligence.
</WIP>

## Importing Files, Media, And OCR

Bartleby can import files and media directly.

This is useful for:
- personal archives
- image/document reference
- extracting text from images when OCR is enabled
- building up knowledge material you want Bartleby to work with

Examples:

```text
import ./receipt.png
import ./contract.pdf
show media contract.pdf
```

Likely result:
- Bartleby creates media records
- imported material becomes part of your broader working system

OCR is available when configured.

That means Bartleby can extract text from supported images and similar media where OCR is enabled.

<WIP>
OCR is an optional integration and depends on your local configuration.
</WIP>

## Signal

Signal is already a useful way to interact with Bartleby.

### What works today

You can use Signal to:
- message Bartleby and receive replies
- ask Bartleby to send useful information back to your Signal thread
- use Bartleby when you are away from the CLI

Examples of the kind of use that already works:

- tell Bartleby to send you something in Signal
- message Bartleby directly and get a reply in Signal

### Signal as a practical second interface

CLI remains the primary documented path, but Signal is not just a stub. It is already useful enough to treat as a real second interface.

<WIP>
The following Signal-related behaviors should be documented as still evolving:
- scheduled reminder delivery
- daily/weekly review delivery via Signal
- autonomous Bartleby-driven reminders
</WIP>

## Weather

Weather is directly usable when configured.

That makes Bartleby more useful for daily planning and review.

```text
weather
```

Likely result:
- Bartleby returns weather information using your configured settings

<WIP>
Weather is also a natural fit for future daily review flows and message-based summaries.
</WIP>

## Configuration

Configuration belongs in Bartleby, but the README should stay brief here because the guided flows are already fairly self-explanatory.

Useful commands:

```text
settings
settings <category>
set <key> to <value>
settings wizard
setup wizard
```

Likely result:
- Bartleby shows or updates settings directly
- guided workflows help with category-by-category configuration

For exhaustive command coverage, see `COMMANDS.md`.

## Worked Example Workflows

### Example 1: Personal admin

```text
capture call insurance about claim
capture find tax documents
process inbox
new project 2026 taxes
show next actions
calendar
```

What Bartleby is doing:
- capturing loose obligations
- turning them into structured work
- keeping projects and time commitments visible together

### Example 2: Knowledge work

```text
create note product ideas
ingest ./market-research.md
ask shed what this document says about pricing
show note product ideas
```

What Bartleby is doing:
- combining personal notes with external reference material
- letting your knowledge work live in one system

### Example 3: People, work, and commitments

```text
new contact Jane Smith
new event planning meeting friday 2pm
create note planning notes
show contact Jane Smith
calendar
```

What Bartleby is doing:
- letting people, events, and knowledge live in the same working environment

### Example 4: Signal-assisted use

- message Bartleby through Signal
- ask it to send you something useful
- keep using CLI when you want the full documented interface
- use Signal when you want message-based interaction

## Advanced Notes

Bartleby also has deeper runtime and routing capabilities beyond what this README tries to teach directly.

For:
- exhaustive commands
- advanced runtime behavior
- routing/training internals
- deeper technical details

see:
- `COMMANDS.md`
- `TECH_SPEC.md`

## Current Reality

Bartleby is real and usable now, but some parts of the product are still evolving.

<WIP>
Areas that should be described honestly as still in progress:
- dashboard as a first-class workflow surface
- app/mobile as a first-class workflow surface
- Signal-based scheduled reviews and reminders
- Bartleby-driven autonomous reminder behavior
- some advanced reference/system polish around newer features
</WIP>

The documented core path remains:
- CLI first
- Signal as a useful second interface
- direct, explicit workflows over vague automation claims

## Getting Started

If you are new, start here:

```text
help
settings
capture something small
show inbox
process inbox
show next actions
calendar
create note daily notes
```

That is enough to start feeling how Bartleby works:
- capture first
- structure later
- keep work, commitments, people, and knowledge in one connected system

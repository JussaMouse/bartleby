# Bartleby Technical Specification

Purpose: describe Bartleby’s current technical architecture, subsystem boundaries, and runtime design using the architecture reference as the source of truth while staying aligned with the current codebase.

This document is a replacement for the older `TECH_SPEC.md`. It is meant to be:
- architecture-first
- implementation-aware
- truthful about current convergence state
- useful for feature work, refactors, and future interface expansion

It is not a promise that every subsystem described here is equally polished.

---

## 1. System Overview

Bartleby is a local-first personal assistant runtime centered on durable personal data, guided workflows, retrieval, and multi-interface access over shared core logic.

Bartleby is not just a chat shell. The core product is a runtime plus a durable personal data model.

At a high level, Bartleby combines:
- a canonical personal record system (`Garden`)
- guided multi-step behavior (`Workflows`)
- an external reference corpus (`Shed`)
- learning/context systems (`Learning`, `Context`, `Reflection`)
- multiple conduits over the same runtime (`CLI`, `Signal`, app/mobile, future dashboard)

Current strengths are concentrated in the CLI, but the architecture intentionally avoids making CLI-specific behavior the product’s long-term center of gravity.

---

## 2. Core Principles

### 2.1 Local-first by default
Bartleby should prefer local storage and local inference where possible.

Remote inference may be supported, but it is a tradeoff rather than the defining model.

### 2.2 Garden is canonical
If something matters to the user’s ongoing system, it should ultimately live in the Garden as a record, relationship, or view-derived presentation of records.

### 2.3 Workflows over parser tricks
When a behavior is naturally multi-step, Bartleby should model it as an explicit workflow rather than depending on increasingly clever one-shot parsing or hidden pending state.

### 2.4 Shared runtime across conduits
Core behavior should live in shared runtime logic, not inside one interface implementation.

### 2.5 Thin interface adapters
Conduits should mainly:
- render state in interface-appropriate form
- translate user input
- hand off to shared runtime behavior

### 2.6 Observability and recoverability
Features should be understandable, auditable, and safe to recover from.

### 2.7 Truthfulness over aspiration
User-facing documentation and ordinary product claims should stay aligned with verified behavior.

### 2.8 Intent Resolution and Dispatch matter
Bartleby needs a stronger intent-resolution layer so that specific record-targeting, workflow, and mutation intents beat broader collection or fallback interpretations reliably.

---

## 3. Main Domains

### 3.1 Garden
The canonical durable personal record system.

### 3.2 Workflows
Guided multi-step transformations and management flows over Garden state.

### 3.3 Shed
The external reference corpus, distinct from canonical Garden state.

### 3.4 Learning / Context
Memory-like and profile/context systems, separate from both Garden canonical data and raw Shed content.

### 3.5 Runtime / Conduits
CLI, Signal, app/mobile, and future dashboard/PWA as access surfaces over shared runtime behavior.

---

## 4. Layered Garden Architecture

Bartleby’s Garden is a layered system with explicit responsibilities.

### Layer 1: Records
Records are durable entities stored in the canonical record store.

Current record types:
- `item`
- `action`
- `project`
- `note`
- `tag`
- `contact`
- `event`
- `media`

Shared record fields include:
- `id`
- `type`
- `title`
- `status`
- `content`
- `created_at`
- `updated_at`

Specialized fields exist for actions, events, contacts, media, and items.

Design rules:
- stable queryable semantics should become real columns
- `metadata` is for extensibility, not a dumping ground for core behavior
- records are the base layer; they should not absorb relationship or view responsibilities

### Layer 2: Relationships
Relationships are typed durable edges between records.

Current relationship types:
- `belongs_to`
- `tagged_with`
- `involves`
- `waiting_on`
- `attends`
- `references`
- `related_to`

Relationships should be preferred when meaning is relational rather than intrinsic to a single record.

Examples:
- actions belonging to projects
- notes tagged with tags
- records referencing other records
- provenance from inbox processing

### Layer 3: Views
Views define what records should appear in a given presentation or retrieval context.

Views are reusable abstractions for:
- collection displays
- record displays
- dynamic grouped or filtered outputs
- named perspectives over Garden data

Views are not just UI screens. They sit between data and rendering.

This is why they remain useful for:
- CLI list output
- Signal summaries
- dashboard panels
- mobile collections
- record display surfaces

### Layer 4: Rendering
Rendering transforms a resolved view into interface-specific output.

Examples:
- CLI text rendering
- future Signal-optimized summaries
- mobile cards
- future dashboard panels

Rendering should not decide what belongs in the view; it should only present resolved state.

---

## 5. Record Roles

### 5.1 Item
Raw capture awaiting stronger organization.

Items are transitional records and generally should not be long-term attachable targets.

### 5.2 Action
A concrete next step.

### 5.3 Project
An outcome requiring multiple actions.

### 5.4 Note
A durable user-authored text record.

A generic wiki page in Bartleby is best understood as a note used in a richer relational/view context, not as a separate record type.

### 5.5 Tag
A first-class classification record.

### 5.6 Contact
A person record.

### 5.7 Event
A time-bounded occurrence.

### 5.8 Media
An imported file or attachment record.

---

## 6. Tags

Tags are first-class records rather than note-only inline labels.

Current design decision:
- tags may apply to any record type except tags themselves

Implications:
- tags are not note-only
- tags should be represented through relationships, not inline arrays
- tags should help classify, not replace stronger native organization primitives

---

## 7. Workflow Architecture

### 7.1 One active workflow at a time
Bartleby currently uses a single active workflow model for user-facing guided flows.

This is the simplest robust model for:
- routing
- cleanup
- recoverability
- observability
- future multi-interface reuse

### 7.2 Dedicated workflow service
Workflow state is managed through a dedicated in-memory `WorkflowService` rather than generic memory/fact storage.

### 7.3 In-memory first
The current workflow model is intentionally in-memory first.

Explicit persistence across restarts should be a later design step, not an accidental side effect of unrelated state systems.

### 7.4 Central validation
Active workflow validity should be checked centrally before contextual routing is allowed to claim input.

### 7.5 Central workflow router
There should be one workflow router that dispatches to workflow-type-specific handlers.

### 7.6 Explicit lifecycle
Workflow lifecycle currently supports:
- `start`
- `advance`
- `complete`
- `cancel`
- `fail`
- `clear`
- stale-clear through validation failure handling

### 7.7 Start policy
If a workflow is active, starting another workflow should not happen silently.

Current policy:
- reject competing workflow starts
- instruct the user to finish or cancel the active workflow first

### 7.8 Intent Resolution → Routing → Dispatch enforcement
Bartleby increasingly enforces an explicit Intent Resolution → Routing → Dispatch model rather than relying only on broad command priority ordering.

Important enforcement rules:
- active workflow replies outrank every other command surface
- exact record-open intents outrank broader collection-list interpretations
- explicit workflow starts outrank generic mutations when the input clearly begins a guided flow
- malformed workflow state must be validated and stale-cleared before it can hijack routing

### 7.9 WorkflowService as control authority
The in-memory `WorkflowService` should be treated as the control authority for active workflow state.

It owns:
- workflow registration by type
- central workflow validation
- lifecycle transitions
- stale-clear behavior for broken or outdated workflow state
- lifecycle event recording for audit/debug visibility

### 7.10 Workflow router validation gate
`workflowRouter` is the first dispatch gate for active workflows.

Before an active workflow claims user input, the active workflow is validated centrally. If validation fails, Bartleby clears the stale workflow and returns a truthful message rather than letting invalid state continue intercepting future requests.

### 7.11 Workflow implementation rules
Workflow implementations such as inbox processing, note workflows, setup, and guided settings should:
- register their workflow type and validator
- persist step transitions through shared workflow lifecycle helpers
- use `complete`, `cancel`, and `fail` rather than ad hoc state clearing for meaningful lifecycle transitions
- keep workflow targets aligned with underlying record targets where relevant

### 7.12 Legacy pending-prompt state should be removed
Hidden pending-prompt state outside the workflow substrate should not remain part of Bartleby’s control model.

If a behavior requires follow-up input, it should either:
- remain a truthful one-shot mutation with no hidden continuation, or
- be implemented as an explicit workflow with lifecycle, validation, and cancellation semantics

---

## 8. Current Workflow Types

Current shared workflow-backed behaviors include:
- `inbox_process`
- `note_create`
- `note_edit`
- `setup_wizard`

### 8.1 Inbox processing
`process inbox` is a guided workflow that can transform inbox items into:
- actions
- projects
- notes
- note appends
- events
- someday items

### 8.2 Note workflows
Notes are records, but note creation/editing are implemented as workflows because they are naturally multi-step.

Current note workflow behaviors include:
- content collection
- attachment selection
- typed attachment resolution
- completion/cancellation handling

### 8.3 Setup and guided settings
Setup is now workflow-driven rather than owned by a bespoke CLI-only readline loop.

The same shared runtime workflow can drive:
- first-launch setup
- explicit `setup wizard`
- guided settings review/edit flows

This is a deliberate convergence step so future non-CLI conduits can drive the same logic.

---

## 9. Intent Resolution, Routing, and Dispatch

### 9.1 Overview
The router is responsible for deciding how user input should be handled.

Current routing layers are:
- contextual workflow matching
- pattern matching
- complexity classification
- keyword matching
- semantic matching
- LLM fallback

### 9.2 Intent classes
Current tool routing uses lightweight intent classes:
- `workflow_reply`
- `workflow_start`
- `record_open`
- `collection_list`
- `mutation_create`
- `mutation_update`
- `mutation_delete`
- `system`
- `operator`
- `fallback`

### 9.3 Precedence
Current precedence favors more specific intents over broader ones.

Current precedence order is effectively:
1. workflow reply
2. record open
3. workflow start
4. create mutation
5. update mutation
6. delete mutation
7. collection list
8. system / operator / fallback

### 9.4 Why this matters
This is the main architectural area that prevents recurring bugs such as:
- `show note X` being interpreted like `show notes`
- record-targeting commands losing to broad list commands
- workflow interactions colliding with top-level command interpretation

### 9.5 Typed resolution
Bartleby increasingly prefers typed record resolution instead of:
- broad title-only lookup
- search-first fallback mutation
- ambiguous mixed collection/record resolution

### 9.6 Search should stay separate
Search-style behaviors may remain useful, but they should stay separate from exact-open and exact-mutation flows.

---

## 10. Conduits and Interface Model

Bartleby should support multiple conduits over shared runtime behavior.

Current or intended conduits:
- CLI / REPL
- Signal
- app / mobile
- dashboard / PWA

### 10.1 CLI
The CLI is currently the strongest conduit and the primary documented path.

### 10.2 Signal
Signal is an optional but already useful second conduit.

Current reality:
- useful for message-based interaction
- good for direct messaging and send-message behavior
- reminder/review autonomy remains under active evolution

### 10.3 App / mobile
App/mobile code exists and is evolving toward shared-runtime participation.

### 10.4 Dashboard
The dashboard remains a future-facing conduit target rather than the current first-class documented interface.

---

## 11. Shed

The Shed is Bartleby’s external reference subsystem.

It remains distinct from canonical Garden state.

If Shed-derived information needs to persist operationally, it should eventually be promoted into Garden records rather than treated as automatic personal truth.

### 11.1 Current supported path
The current narrow supported path is:
- ingest local markdown/text/PDF documents
- list ingested sources
- ask questions against ingested sources

### 11.2 Internal flow
Current Shed ingestion flow:
1. load or fetch source content
2. extract or normalize text
3. chunk the document
4. embed chunks
5. store chunk vectors
6. answer queries with retrieved chunk context and source-aware synthesis

### 11.3 Truthfulness rule
Shed should be documented conservatively. It is meaningful and usable, but should not be described as a fully polished universal document intelligence layer.

---

## 12. Learning, Context, and Reflection

Bartleby includes learning/context systems that are distinct from both Garden canonical data and Shed raw source content.

Important boundary:
- Garden = canonical structured personal state
- Shed = external reference corpus
- learning/context = memory-like profile/context systems
- workflow state = active control state, not just another remembered fact

This distinction matters for correctness, provenance, and user trust.

---

## 13. Services

Current service container includes the following major services.

### 13.1 Garden services
- `GardenService` — Layer 1 record CRUD
- `RelationshipService` — Layer 2 typed edge CRUD and backlink sync
- `ViewService` — Layer 3 view resolution / record opening / user views

### 13.2 Workflow and runtime services
- `WorkflowService` — active workflow control state
- `RuntimeActivityService` — runtime activity tracking

### 13.3 Learning and context services
- `ContextService`
- `LearningService`
- `ReflectionService`
- `SettingsService`
- `RouterTrainingService`

### 13.4 Reference / retrieval services
- `ShedService`
- `EmbeddingService`
- `VectorService`

### 13.5 Infrastructure and integrations
- `LLMService`
- `SignalService`
- `WeatherService`
- `OCRService`
- `DataService`
- `AuditService`

---

## 14. Tool Surface

The tool layer is the interface between user intent and services.

Current active surface includes tools for:
- workflow routing
- setup/settings flows
- inbox processing
- actions
- projects
- notes
- contacts
- events
- tags
- media import/display
- weather
- shed ingestion/querying
- system/help/status
- routing stats and training controls
- data tools
- OCR tools

The important architectural principle is that tools should be thin adapters over shared runtime behavior.

---

## 15. Setup and Configuration

### 15.1 First launch
First launch now routes through the shared setup workflow rather than relying on a bespoke CLI-owned control loop for the setup progression itself.

### 15.2 Guided settings
Multi-step settings guidance is now workflow-native.

### 15.3 One-shot settings commands
Direct settings commands remain simple one-shot behaviors:
- show settings
- show a settings category
- set a setting directly

This split is intentional:
- use one-shot commands for direct exact operations
- use workflows for guided multi-step review/edit

---

## 16. Current Strengths and Active Convergence Areas

### 16.1 Stronger today
Bartleby is currently strongest in:
- capture
- explicit create/list/review flows
- Garden-based operations
- guided inbox processing
- note workflows
- first-launch and settings workflow foundations
- narrow Shed retrieval path

### 16.2 Still actively converging
Areas still under active convergence include:
- richer cross-interface parity
- workflow expansion and refinement
- Signal review/reminder behavior
- dashboard/app maturity
- some older/internal memory surfaces
- stricter remaining resolution cleanup

---

## 17. Migration / Cleanup Guidance

When improving Bartleby, prefer the following sequence:

1. remove dead or hidden legacy control state
2. replace broad/ambiguous resolution with typed or explicit resolution
3. move genuine multi-step behavior onto the shared workflow substrate
4. keep interfaces thin and shared-runtime-first
5. only then expand the user-facing promise surface

Use commit-sized milestones for each cleanup pass so changes remain cherry-pick friendly and easy to validate.

---

## 18. Recommendations for Future Work

### 18.1 Do now
- continue replacing remaining ambiguous title-based mutation/linking paths
- keep strengthening workflow-native interactive behavior
- preserve truthfulness in docs as behavior evolves

### 18.2 Next phase
- introduce more structured workflow result payloads so non-CLI interfaces can render workflows more richly
- continue shrinking CLI-specific assumptions in guided flows
- improve explicit ambiguity handling in record resolution helpers
- continue hardening Shed and Signal review/reminder behavior

### 18.3 Later
- explicit workflow persistence/resume semantics if real demand justifies it
- deeper app/dashboard convergence on shared runtime behavior

---

## 19. Summary

Bartleby should be understood technically as:
- a local-first assistant runtime
- centered on the Garden as canonical structured personal state
- powered by workflows for multi-step user behaviors
- exposed through multiple conduits over shared runtime logic
- complemented by the Shed as an external reference corpus
- guided by truthfulness, observability, recoverability, and increasingly explicit intent resolution and dispatch

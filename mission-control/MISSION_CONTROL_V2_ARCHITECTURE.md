# Mission Control v2 Architecture

## Purpose

Mission Control v2 is the next evolution of Gizmo’s Mission Control from a read-on-refresh dashboard into a live, read-only software operations console.

Its purpose is to let Max:
- inspect active software projects,
- understand which pipeline stage each project is in,
- see which explicit tasks are currently being worked on,
- see which Gizmo Team members own those tasks,
- inspect live operational events and logs,
- and access the system remotely through a secure external access path.

Mission Control remains read-only. If Max wants to intervene, pause, redirect, or stop work, that should happen through the designated Discord channel rather than through the dashboard UI.

---

## Key product decisions

### Access model
- Initial audience: Max only
- Future direction: architecture should be compatible with broader multi-user use later if others have a comparable OpenClaw-based stack

### Interaction model
- Mission Control is read/view only
- No direct control actions from the UI in v2
- Human intervention continues through Discord

### Remote access model
- Use Cloudflare Tunnel for external access
- Use Cloudflare Access for authentication and protection
- Do not expose the local laptop directly to the public internet

### Live updates
- Use Socket.IO for real-time updates
- Avoid a pure reload/polling model as the long-term foundation

### Persistence
- Use SQLite as the primary state store
- Preserve operational state across refreshes, app restarts, and laptop reboots

### Source of truth model
- Use a hybrid source of truth
- Explicitly record core workflow state
- Use inferred supporting signals to enrich context, not replace explicit truth

### Project definition
A project is currently defined as:
- one software application,
- one repo / one folder,
- a GitHub repository,
- a `PROJECT_MEMORY.md`,
- a designated Discord channel,
- and usually work involving spawned Gizmo Team subagents.

---

## Product model

### Project
A project is the top-level operational object in Mission Control.

Each project should expose:
- project identity,
- repository information,
- designated Discord channel,
- current pipeline stage,
- current status,
- supporting inferred signals,
- active tasks,
- events,
- logs.

### Pipeline
Each project has an explicit pipeline.

Initial stage model:
1. Product framing
2. Tech planning
3. Design review
4. Implementation
5. QA
6. Security review
7. Release prep
8. Shipped
9. Retro

Pipeline stages should support these statuses:
- pending
- active
- done
- blocked
- skipped

### Tasks inside stages
Mission Control v2 must show the specific tasks being worked on inside a stage.

That means each active stage should expose explicit work items such as:
- task title,
- owner role,
- task status,
- latest update,
- timestamps,
- supporting events/logs.

This is essential so the dashboard makes it obvious what each team member is currently working on.

---

## Source of truth design

### Explicit truth
The following should be explicitly recorded in Mission Control state:
- projects
- pipeline stages
- tasks
- stage transitions
- role assignments
- project status
- event history
- structured operational logs

### Inferred supporting signals
The following should be derived automatically and shown as supporting context:
- recent git commits
- recent project memory activity
- active subagent/session signals
- recent Discord/project activity signals
- runtime output from OpenClaw
- other environment signals useful for operational context

### Rule
Explicit state is the backbone.
Inferred signals support interpretation.
Inferred signals must not silently override explicit workflow state.

---

## Technical architecture

### Application server
Mission Control v2 continues to use:
- Node.js
- Express

The app serves:
- HTML/CSS/JS for the dashboard,
- REST endpoints for initial state loading,
- Socket.IO for live updates.

### Real-time transport
Use Socket.IO for:
- task updates,
- stage transitions,
- project status changes,
- event feed updates,
- log streaming,
- team assignment updates.

Socket.IO is preferred over raw WebSockets for simplicity, reconnect handling, and stable dashboard behaviour.

### State store
Use SQLite for persistent structured state.

Reasons:
- local-first,
- low operational overhead,
- durable across restarts,
- well-suited to structured operational state,
- easy to back up,
- significantly more robust than ad hoc JSON state for this use case.

### External access
Use:
- Cloudflare Tunnel
- Cloudflare Access

The app should continue to run locally on Max’s personal laptop, while Cloudflare provides:
- stable remote access,
- authentication,
- protection from raw public exposure,
- compatibility with remote viewing from other networks.

---

## Recommended data model

### `projects`
Represents tracked projects.

Suggested fields:
- `id`
- `slug`
- `name`
- `repo_path`
- `github_url`
- `discord_channel_id`
- `discord_channel_name`
- `project_memory_path`
- `status`
- `current_stage_id`
- `created_at`
- `updated_at`

### `pipeline_stages`
Represents pipeline stages for a project.

Suggested fields:
- `id`
- `project_id`
- `stage_key`
- `label`
- `order_index`
- `status`
- `started_at`
- `ended_at`
- `updated_at`

### `tasks`
Represents explicit work items inside a project stage.

Suggested fields:
- `id`
- `project_id`
- `stage_id`
- `title`
- `description`
- `status`
- `priority`
- `assigned_role_slug`
- `assigned_formal_name`
- `created_at`
- `updated_at`
- `started_at`
- `ended_at`

### `role_assignments`
Represents task ownership and handoffs.

Suggested fields:
- `id`
- `project_id`
- `task_id`
- `role_slug`
- `formal_name`
- `assignment_status`
- `started_at`
- `ended_at`

### `events`
Represents immutable human-readable operational history.

Suggested fields:
- `id`
- `project_id`
- `task_id` nullable
- `stage_id` nullable
- `event_type`
- `role_slug` nullable
- `message`
- `payload_json`
- `created_at`

Example event types:
- `project.updated`
- `stage.activated`
- `task.created`
- `task.assigned`
- `task.completed`
- `task.blocked`
- `role.handoff`

### `logs`
Represents structured technical logs.

Suggested fields:
- `id`
- `project_id`
- `task_id` nullable
- `role_slug` nullable
- `source`
- `level`
- `message`
- `timestamp`

Examples of sources:
- `mission-control`
- `pipeline`
- `subagent`
- `openclaw-session`

---

## Event model

Mission Control v2 should emit real-time updates only after state is written successfully.

### Rule
Write to SQLite first.
Emit live event second.

This ensures the UI reflects actual state rather than transient in-memory guesses.

### Initial live event types
- `project.updated`
- `stage.updated`
- `task.created`
- `task.updated`
- `task.assigned`
- `task.completed`
- `task.blocked`
- `role.assignment.changed`
- `event.created`
- `log.appended`

---

## UI structure

### Overview page
The overview page should answer:
> What needs attention right now?

It should show:
- active projects
- blocked projects
- active tasks
- active team members
- latest events
- latest logs
- pipeline health summary

### Project detail page
This is the first major v2 page and the highest-priority UI surface.

A project detail page should show:

#### Project header
- project name
- repository
- designated Discord channel
- project status
- current pipeline stage
- last updated timestamp

#### Pipeline view
- visible project stages
- completed stages
- active stage
- blocked stage
- future stages

#### Active tasks within current stage
- task title
- assigned role / formal name
- task status
- latest update
- timestamps

#### Supporting inferred signals
- recent commits
- recent memory updates
- recent Discord/project activity signal
- recent subagent or session activity

#### Event feed
A readable operational feed showing explicit state changes.

#### Logs panel
A live log panel showing structured logs and technical runtime signals.

### Team page
The team page should evolve from a static roster into a live operations view.

For each team member, show:
- formal name
- role
- current status
- current project
- current task
- last event time

### Logs page
The logs page should support:
- event feed view
- raw log view
- filtering by project
- filtering by role
- filtering by stage
- filtering by source/severity later if needed

---

## Deployment architecture

### Runtime model
- Mission Control runs locally on Max’s personal laptop
- the laptop remains the runtime host for now

### External access path
- Cloudflare Tunnel exposes the app remotely
- Cloudflare Access protects the app with authentication
- no direct public exposure of the laptop port

### Read-only remote posture
Since the UI is read-only in v2, remote access is primarily an operational viewing path rather than a control surface.

This reduces risk, but raw logs may still contain sensitive information, so Cloudflare Access remains mandatory.

---

## Phased implementation plan

### Phase 1 — Data backbone
Goal: create a trustworthy internal state model.

Deliverables:
- add SQLite to the app
- create schema for projects, stages, tasks, assignments, events, and logs
- build a basic data access layer
- seed default pipeline stage definitions

Outcome:
- Mission Control gains a real backbone instead of relying primarily on file scans

### Phase 2 — Explicit project/task model
Goal: make project workflow state explicit.

Deliverables:
- explicit project discovery / registration logic
- explicit stage tracking
- explicit task creation and assignment model
- explicit event creation
- inferred supporting signal adapters

Outcome:
- Mission Control can answer who is working on what and in which stage with real state

### Phase 3 — Socket.IO live layer
Goal: remove reload dependence.

Deliverables:
- Socket.IO server integration
- client connection and reconnect handling
- live updates for projects, stages, tasks, events, and logs

Outcome:
- Mission Control becomes a live dashboard

### Phase 4 — Project detail page
Goal: make project operations legible.

Deliverables:
- project detail route/page
- pipeline visualisation
- active task display per stage
- team ownership display
- event stream section
- live log panel

Outcome:
- a single project can be understood in real time from one screen

### Phase 5 — Team page live state
Goal: make the Gizmo Team operationally visible.

Deliverables:
- live team assignments
- current status badges
- current project/task linkage
- role activity display

Outcome:
- the Team page becomes a live roster, not just a cast list

### Phase 6 — Logs and observability polish
Goal: improve debugging and operational confidence.

Deliverables:
- richer logs page
- event/log separation in the UI
- filtering and drill-down
- stale-task or stale-session indicators

Outcome:
- Mission Control becomes more useful during active project work and debugging

### Phase 7 — Cloudflare rollout
Goal: provide secure remote access.

Deliverables:
- Cloudflare Tunnel configuration
- Cloudflare Access protection
- stable hostname
- Socket.IO compatibility validation through the tunnel
- startup / deployment guidance

Outcome:
- Mission Control becomes securely accessible from other networks

---

## Important design recommendations

### Keep tasks lightweight
Mission Control tasks should represent operational work inside a pipeline stage, not become a full backlog-management product.

### Label inferred signals clearly
Anything inferred should be shown as supporting context, not as canonical workflow truth.

### Separate events and logs
From the beginning, preserve the distinction:
- events = human-readable state transitions
- logs = technical operational output

This separation will make the system easier to use and easier to debug.

---

## Recommended next step

The next implementation step should be:

### Build the Mission Control v2 data backbone
Specifically:
- add SQLite,
- define the schema,
- add the first data access layer,
- and begin recording explicit project/stage/task state.

This is the highest-leverage next step because it unlocks:
- reliable live updates,
- project detail views,
- pipeline visualisation,
- team assignment tracking,
- log history,
- and secure remote access that is actually worth using.

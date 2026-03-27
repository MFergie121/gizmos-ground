# Mission Control — Project Memory

## Purpose

Mission Control is the local operator dashboard inside `gizmos-ground`.
Its job is to give Max and Gizmo a single place to inspect the state of ongoing assistant operations, memory, documentation, and scheduled automation.

This project appears to be evolving from a static generated schedule page into a live local web application.

## Current functionality

### Runtime
- Runs locally on `http://127.0.0.1:3187`
- Uses Node + Express
- Entry point: `mission-control/server.js`

### Views
- `/` — overview dashboard
- `/schedule` — live scheduled task view based on `openclaw cron list`
- `/memory` — journal and long-term memory file browser scaffold
- `/docs` — recent docs/artifacts browser across this repo and the OpenClaw workspace
- `/team` — simple team/agent view backed by `openclaw status --all`

### Data sources
- Local filesystem
- OpenClaw CLI output
- OpenClaw workspace memory files under `~/.openclaw/workspace`

## Architecture notes

- `mission-control/server.js` is the main dynamic app server.
- `mission-control/calendar/index.html` is still present, but the repo README says static generated dashboard files are transitional only.
- The project is explicitly framed as the single source of truth for Mission Control.

## Observed direction

The project direction seems to be:
1. move away from static HTML snapshots,
2. create a live local operational dashboard,
3. expose useful internal state for Max + Gizmo,
4. grow into a broader control surface for memory, scheduling, docs, and team/agent visibility.

## Open questions for Max

These need confirmation so this file can become more accurate over time:
- What are the highest-priority user flows for Mission Control?
- Is this intended to stay local-only, or later become remotely accessible?
- Should Mission Control remain read-only, or eventually support actions like triggering jobs, editing memory, or managing agents?
- Which modules matter most next: schedule, memory, docs, team, notifications, logs, or something else?
- Is `gizmos-ground` meant to hold only Mission Control, or a broader family of Gizmo tools?

## Practical summary

Right now, Mission Control is a lightweight local operations dashboard for Gizmo.
It already surfaces useful internal state, and its likely purpose is to become the home base for supervising Max + Gizmo workflows without digging through raw files and CLI output.

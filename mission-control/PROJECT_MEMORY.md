# Mission Control — Project Memory

## Purpose

Mission Control is the local operator dashboard inside `gizmos-ground`.
Its main purpose is to help Max showcase and understand Gizmo: what Gizmo is getting up to, what context Gizmo has, and what Gizmo is helping out with.

It is effectively the home base for staying on top of Gizmo’s activity and visibility, rather than just a generic dashboard.

## Current functionality

### Runtime
- Runs locally on `http://127.0.0.1:3187`
- Uses Node + Express
- Entry point: `mission-control/server.js`

### Views
- `/` — overview dashboard
- `/schedule` — improved live scheduled task view based on `openclaw cron list`
- `/projects` — project discovery view based on folders under `~/gizmos_projects`
- `/skills` — skills discovery view based on the OpenClaw skills directory
- `/activity` — recent activity feed across commits, journals, projects, and jobs
- `/context` — Gizmo context/session visibility page
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

## Confirmed direction

The confirmed project direction is:
1. Mission Control is the repo for Gizmo’s Mission Control specifically,
2. the old static workplace was just v1 and should be ignored going forward,
3. the dashboard should help Max understand Gizmo’s activity, context, and assistance footprint,
4. the next priorities are showcasing skills Max gives Gizmo,
5. add a Projects section that discovers active Gizmo projects from `~/gizmos_projects`,
6. after that, continue brainstorming and layering on new useful features.

## Practical summary

Right now, Mission Control is a lightweight local operations dashboard for Gizmo.
Its real role is to help Max observe, understand, and steer Gizmo more effectively by making Gizmo’s activity and context legible.

Near-term, the most important next step is adding visibility for skills that Max gives Gizmo.
After that, the project should expand through iterative brainstorming and feature development.

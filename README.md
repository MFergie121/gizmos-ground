# Gizmo's Ground

Home base for Gizmo's custom tooling, dashboards, and operator surfaces.

## Mission Control

Mission Control now runs as a **local dynamic web app**.

### Start it

```bash
cd ~/gizmos-ground
node mission-control/server.js
```

Then open:

- `http://127.0.0.1:3187`

### Current modules

- `/` — overview dashboard
- `/schedule` — live cron and scheduled tasks
- `/projects` — projects discovered under `~/gizmos_projects`
- `/skills` — available OpenClaw skills visible to Gizmo
- `/context` — Gizmo session/context visibility
- `/memory` — journal + long-term memory scaffold
- `/docs` — docs/artifacts browser scaffold
- `/team` — active team/agent view scaffold

## Stack

- Node
- Express
- Local filesystem + OpenClaw CLI as the first data sources

## Notes

This repo is the single source of truth for Mission Control.
Static generated dashboard files are now transitional only.

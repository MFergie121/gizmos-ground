# Gizmo's Ground

Home base for Gizmo's custom tooling, dashboards, and operator surfaces.

## Mission Control

Mission Control now runs as a **local dynamic web app**.

## Running locally

### Prerequisites

- Node.js installed
- repo cloned locally at `~/gizmos-ground`
- optional but useful: OpenClaw installed and available in your shell path

### Install dependencies

```bash
cd ~/gizmos-ground
npm install
```

### Start the app

```bash
cd ~/gizmos-ground
npm start
```

or

```bash
cd ~/gizmos-ground
node mission-control/server.js
```

### Open it in your browser

- `http://127.0.0.1:3187`

### What to expect

- The app runs locally only
- Some pages become more useful if OpenClaw is installed and working
- The Projects page reads folders from `~/gizmos_projects`
- If `~/gizmos_projects` is empty, the Projects page will show an empty-state proof of concept

### Quick local test flow

1. Start the server with `npm start`
2. Open `http://127.0.0.1:3187`
3. Click through:
   - `/`
   - `/schedule`
   - `/projects`
   - `/skills`
   - `/activity`
   - `/context`
4. Confirm the app loads without server errors
5. If you want to test Projects properly, create a sample folder inside `~/gizmos_projects`

### Example project test

```bash
mkdir -p ~/gizmos_projects/example-project
cat > ~/gizmos_projects/example-project/README.md <<'EOF'
# Example Project

A tiny test project so Mission Control has something to display.
EOF
```

Then refresh `/projects`.

### Current modules

- `/` — overview dashboard
- `/schedule` — live cron and scheduled tasks
- `/projects` — projects discovered under `~/gizmos_projects`
- `/skills` — available OpenClaw skills visible to Gizmo
- `/activity` — recent commits, journals, projects, and job signals
- `/context` — Gizmo session/context visibility with recent memory snippets
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

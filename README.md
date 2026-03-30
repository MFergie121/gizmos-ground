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

### Access it from another computer on your network

By default the app binds to localhost only. To make it reachable from another computer on the same network, bind it to all interfaces:

```bash
cd ~/gizmos-ground
HOST=0.0.0.0 PORT=3187 npm start
```

Then open it from your other machine using your laptop's local IP address:

- `http://<your-laptop-local-ip>:3187`

Example:

- `http://192.168.1.23:3187`

Notes:
- both devices need to be on the same network
- macOS firewall may prompt you to allow incoming connections for Node
- if you want access outside your local network later, that should be done intentionally and with proper auth/reverse proxying rather than raw exposure

### What to expect

- The app runs locally only unless you explicitly bind it for LAN or tunnel access
- Some pages become more useful if OpenClaw is installed and working
- The Projects page reads folders from `~/gizmos_projects`
- If `~/gizmos_projects` is empty, the Projects page will show an empty-state proof of concept
- On startup, Mission Control now initializes a local SQLite database for the v2 backbone at `mission-control/data/mission-control.sqlite`

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
- SQLite (`better-sqlite3`) for the Mission Control v2 data backbone
- Socket.IO for live runtime updates
- Local filesystem + OpenClaw CLI as the first data sources

## Notes

This repo is the single source of truth for Mission Control.
Static generated dashboard files are now transitional only.

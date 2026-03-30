const express = require('express');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { Server } = require('socket.io');
const { initDatabase, getProjectsWithState, getProjectDetail, getTeamAssignments, appendLog, appendEvent, touchTaskLifecycle } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3187;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || null;
const REPO_ROOT = '/Users/maxfergie/gizmos-ground';
const { db, summary: dbSummary, path: dbPath } = initDatabase({ repoPath: REPO_ROOT });
const OPENCLAW_WORKSPACE = '/Users/maxfergie/.openclaw/workspace';
const PROJECTS_ROOT = '/Users/maxfergie/gizmos_projects';
const OPENCLAW_SKILLS_ROOT = path.join(os.homedir(), '.nvm/versions/node/v22.16.0/lib/node_modules/openclaw/skills');

function run(command) {
  return execSync(command, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function safeRun(command) {
  try {
    return { ok: true, stdout: run(command) };
  } catch (error) {
    return { ok: false, error: error.stderr || error.message || String(error) };
  }
}

function parseCronList(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  const header = lines[0];
  const fields = [
    'ID',
    'Name',
    'Schedule',
    'Next',
    'Last',
    'Status',
    'Target',
    'Agent ID',
    'Model',
  ];

  const positions = fields.map((field) => header.indexOf(field));
  const ranges = fields.map((field, idx) => ({
    field,
    start: positions[idx],
    end: idx < fields.length - 1 ? positions[idx + 1] : header.length,
  }));

  return lines.slice(1).map((line) => {
    const row = {};
    for (const range of ranges) {
      row[range.field] = line.slice(range.start, range.end).trim();
    }
    if (!row['ID']) return null;
    return {
      id: row['ID'],
      name: row['Name'],
      schedule: row['Schedule'],
      next: row['Next'],
      last: row['Last'],
      status: row['Status'],
      target: row['Target'],
      agentId: row['Agent ID'],
      model: row['Model'] || '-',
    };
  }).filter(Boolean);
}

function getScheduleData() {
  const result = safeRun('openclaw cron list');
  if (!result.ok) {
    return { jobs: [], error: result.error, raw: '' };
  }
  const raw = result.stdout;
  return { jobs: parseCronList(raw), error: null, raw };
}

function getMemoryFiles() {
  const memoryDir = path.join(OPENCLAW_WORKSPACE, 'memory');
  let files = [];
  try {
    files = fs.readdirSync(memoryDir)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .reverse()
      .map((name) => {
        const full = path.join(memoryDir, name);
        const stat = fs.statSync(full);
        return {
          name,
          path: full,
          modifiedAt: stat.mtime.toISOString(),
          size: stat.size,
        };
      });
  } catch {}

  const longTermPath = path.join(OPENCLAW_WORKSPACE, 'MEMORY.md');
  const hasLongTerm = fs.existsSync(longTermPath);
  return { files, longTermPath, hasLongTerm };
}

function getDocsData() {
  const roots = [REPO_ROOT, OPENCLAW_WORKSPACE];
  const docs = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    walk(root, docs, root);
  }
  docs.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
  return docs.slice(0, 100);
}

function walk(dir, out, root) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out, root);
    } else {
      const stat = fs.statSync(full);
      out.push({
        name: entry.name,
        relativePath: path.relative(root, full),
        root,
        modifiedAt: stat.mtime.toISOString(),
        size: stat.size,
      });
    }
  }
}

function getTeamData() {
  const result = safeRun('openclaw status --all');
  const liveAssignments = getTeamAssignments(db);
  const liveByRole = new Map(liveAssignments.map((item) => [item.role_slug, item]));

  const baseAgents = [
    {
      slug: 'gizmo-core',
      name: 'Gizmo',
      role: 'Primary agent',
      responsibilities: [
        'Memory and journal upkeep',
        'Daily brief operations',
        'Discord workflows',
        'Research and automation',
      ],
    },
    {
      slug: 'orchestrator',
      name: 'Frodo Orchestrator',
      role: 'Workflow owner',
      responsibilities: [
        'Delegation and sequencing',
        'Role selection and handoffs',
        'Review gate coordination',
      ],
    },
    {
      slug: 'product-lead',
      name: 'Bilbo Product Lead',
      role: 'Product',
      responsibilities: [
        'Problem framing',
        'MVP scoping',
        'Prioritisation',
      ],
    },
    {
      slug: 'tech-lead',
      name: 'Peregrin Tech Lead',
      role: 'Engineering leadership',
      responsibilities: [
        'Architecture',
        'Implementation planning',
        'Technical tradeoffs',
      ],
    },
    {
      slug: 'ui-ux-designer',
      name: 'Rosie UI/UX Designer',
      role: 'Design',
      responsibilities: [
        'Interaction design',
        'Copy and flow review',
        'Anti-slop polish',
      ],
    },
    {
      slug: 'frontend-engineer',
      name: 'Merry Frontend Engineer',
      role: 'Frontend',
      responsibilities: [
        'Component structure',
        'Accessibility',
        'User-facing implementation',
      ],
    },
    {
      slug: 'backend-engineer',
      name: 'Samwise Backend Engineer',
      role: 'Backend',
      responsibilities: [
        'APIs and services',
        'Jobs and integrations',
        'Reliability',
      ],
    },
    {
      slug: 'database-engineer',
      name: 'Hamfast Database Engineer',
      role: 'Data',
      responsibilities: [
        'Schema design',
        'Migrations and indexes',
        'Data model quality',
      ],
    },
    {
      slug: 'qa-lead',
      name: 'Primula QA Lead',
      role: 'Quality assurance',
      responsibilities: [
        'Acceptance criteria',
        'Test planning',
        'Regression confidence',
      ],
    },
    {
      slug: 'security-reviewer',
      name: 'Fredegar Security Reviewer',
      role: 'Security',
      responsibilities: [
        'Threat review',
        'Permissions and secrets',
        'OWASP-style checks',
      ],
    },
    {
      slug: 'release-engineer',
      name: 'Odo Release Engineer',
      role: 'Release',
      responsibilities: [
        'Rollout and rollback planning',
        'Deployment readiness',
        'Release sanity checks',
      ],
    },
    {
      slug: 'investigator-retro-lead',
      name: 'Drogo Investigator / Retro Lead',
      role: 'Investigation',
      responsibilities: [
        'Incident analysis',
        'Debugging weirdness',
        'Retros and process improvement',
      ],
    },
  ];

  return {
    statusOk: result.ok,
    raw: result.ok ? result.stdout : result.error,
    agents: baseAgents.map((agent) => ({
      ...agent,
      liveAssignment: liveByRole.get(agent.slug) || null,
    })),
  };
}

function parseSessionStatus(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const getLine = (prefix) => lines.find((line) => line.startsWith(prefix)) || null;

  return {
    time: getLine('🕒 Time:')?.replace('🕒 Time:', '').trim() || null,
    model: getLine('🧠 Model:')?.replace('🧠 Model:', '').trim() || null,
    usage: getLine('📊 Usage:')?.replace('📊 Usage:', '').trim() || null,
    session: getLine('🧵 Session:')?.replace('🧵 Session:', '').trim() || null,
    runtime: getLine('⚙️ Runtime:')?.replace('⚙️ Runtime:', '').trim() || null,
    activation: getLine('👥 Activation:')?.replace('👥 Activation:', '').trim() || null,
  };
}

function readSnippet(filePath, maxLines = 8) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .slice(0, maxLines)
      .join('\n');
  } catch {
    return null;
  }
}

function getContextData() {
  const status = safeRun('openclaw status');
  const memory = getMemoryFiles();
  const projects = getProjectsData();
  const recentJournal = memory.files[0] || null;
  const activeProject = projects.projects[0] || null;
  const journalSnippet = recentJournal ? readSnippet(recentJournal.path, 10) : null;
  const longTermSnippet = memory.hasLongTerm ? readSnippet(memory.longTermPath, 12) : null;

  return {
    statusOk: status.ok,
    rawStatus: status.ok ? status.stdout : status.error,
    parsedStatus: status.ok ? parseSessionStatus(status.stdout) : null,
    memory,
    activeProject,
    projectsCount: projects.count,
    longTermMemoryPath: memory.longTermPath,
    recentJournal,
    journalSnippet,
    longTermSnippet,
    focusAreas: [
      'Mission Control development',
      'Memory and journal upkeep',
      'Discord workflows',
      'Skills and operator tooling',
    ],
  };
}

function getSkillsData() {
  let skills = [];
  try {
    const entries = fs.readdirSync(OPENCLAW_SKILLS_ROOT, { withFileTypes: true });
    skills = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => {
        const skillDir = path.join(OPENCLAW_SKILLS_ROOT, entry.name);
        const skillMdPath = path.join(skillDir, 'SKILL.md');
        let summary = 'No summary available yet.';
        let hasSkillDoc = false;

        if (fs.existsSync(skillMdPath)) {
          hasSkillDoc = true;
          try {
            const text = fs.readFileSync(skillMdPath, 'utf8');
            const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            const firstRealLine = lines.find((line) => !line.startsWith('#'));
            if (firstRealLine) summary = firstRealLine;
          } catch {}
        }

        const category = entry.name.startsWith('team-member-')
          ? 'team-ops'
          : ['product-lead', 'tech-lead', 'ui-ux-designer', 'frontend-engineer', 'backend-engineer', 'database-engineer', 'qa-lead', 'security-reviewer', 'release-engineer', 'investigator-retro-lead', 'gizmo-orchestrator'].includes(entry.name)
            ? 'gizmo-team'
            : 'general';

        return {
          name: entry.name,
          path: skillDir,
          skillMdPath,
          hasSkillDoc,
          summary,
          category,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    return {
      root: OPENCLAW_SKILLS_ROOT,
      count: 0,
      skills: [],
      error: error.message || String(error),
    };
  }

  return {
    root: OPENCLAW_SKILLS_ROOT,
    count: skills.length,
    skills,
    error: null,
  };
}

function getRecentActivityData() {
  const gitLog = safeRun("git log --date=iso --pretty=format:'%h|%ad|%s' -n 12");
  const memory = getMemoryFiles();
  const projects = getProjectsData();
  const schedule = getScheduleData();

  const commits = gitLog.ok
    ? gitLog.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
        const [hash, date, ...subjectParts] = line.split('|');
        return {
          hash,
          date,
          subject: subjectParts.join('|'),
          type: 'commit',
        };
      })
    : [];

  const journals = memory.files.slice(0, 8).map((file) => ({
    type: 'journal',
    label: file.name,
    date: file.modifiedAt,
    subject: `Journal updated: ${file.name}`,
    path: file.path,
  }));

  const projectItems = projects.projects.slice(0, 8).map((project) => ({
    type: 'project',
    label: project.name,
    date: project.modifiedAt,
    subject: `Project touched: ${project.name}`,
    path: project.path,
  }));

  const scheduleItems = schedule.jobs.slice(0, 8).map((job) => ({
    type: 'job',
    label: job.name || job.id,
    date: job.last || job.next || 'Unknown',
    subject: `Scheduled job: ${job.name || job.id} (${job.status})`,
    status: job.status,
  }));

  const items = [...commits, ...journals, ...projectItems, ...scheduleItems]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) * -1)
    .slice(0, 20);

  return {
    items,
    commitsCount: commits.length,
    journalsCount: memory.files.length,
    projectsCount: projects.count,
    jobsCount: schedule.jobs.length,
    gitOk: gitLog.ok,
    gitError: gitLog.ok ? null : gitLog.error,
  };
}

function summariseProject(dirent) {
  const projectPath = path.join(PROJECTS_ROOT, dirent.name);
  const readmePath = path.join(projectPath, 'README.md');
  const memoryPath = path.join(projectPath, 'PROJECT_MEMORY.md');
  const packageJsonPath = path.join(projectPath, 'package.json');
  const gitPath = path.join(projectPath, '.git');

  let stat;
  try {
    stat = fs.statSync(projectPath);
  } catch {
    return null;
  }

  let description = 'No project summary yet.';
  if (fs.existsSync(memoryPath)) {
    try {
      const text = fs.readFileSync(memoryPath, 'utf8').trim();
      if (text) description = text.split(/\r?\n/).find(Boolean) || description;
    } catch {}
  } else if (fs.existsSync(readmePath)) {
    try {
      const text = fs.readFileSync(readmePath, 'utf8').trim();
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const firstRealLine = lines.find((line) => !line.startsWith('#'));
      if (firstRealLine) description = firstRealLine;
    } catch {}
  }

  let packageName = null;
  try {
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      packageName = pkg.name || null;
      if (pkg.description) description = pkg.description;
    }
  } catch {}

  return {
    name: dirent.name,
    packageName,
    path: projectPath,
    modifiedAt: stat.mtime.toISOString(),
    hasReadme: fs.existsSync(readmePath),
    hasProjectMemory: fs.existsSync(memoryPath),
    isGitRepo: fs.existsSync(gitPath),
    description,
  };
}

function getProjectsData() {
  try {
    fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
  } catch {}

  let projects = [];
  try {
    const entries = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true });
    projects = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(summariseProject)
      .filter(Boolean)
      .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
  } catch (error) {
    return {
      root: PROJECTS_ROOT,
      projects: [],
      count: 0,
      empty: true,
      error: error.message || String(error),
    };
  }

  return {
    root: PROJECTS_ROOT,
    projects,
    count: projects.length,
    empty: projects.length === 0,
    error: null,
  };
}

function getLivePayload() {
  return {
    projects: getProjectsWithState(db),
    team: getTeamData().agents,
    db: dbSummary,
    time: new Date().toISOString(),
  };
}

function emitSnapshot() {
  io.emit('snapshot', getLivePayload());
}

io.on('connection', (socket) => {
  socket.emit('snapshot', getLivePayload());
});

let heartbeatCounter = 0;
const lifecycleSequence = [
  {
    title: 'Improve Mission Control UI polish',
    status: 'active',
    roleSlug: 'ui-ux-designer',
    formalName: 'Rosie UI/UX Designer',
    note: 'Rosie UI/UX Designer is refining hierarchy, hover states, and visual emphasis.',
  },
  {
    title: 'Implement SQL data backbone',
    status: 'done',
    roleSlug: 'database-engineer',
    formalName: 'Hamfast Database Engineer',
    note: 'Hamfast Database Engineer completed the SQLite backbone milestone.',
  },
  {
    title: 'Plan real-time pipeline model',
    status: 'active',
    roleSlug: 'tech-lead',
    formalName: 'Peregrin Tech Lead',
    note: 'Peregrin Tech Lead is tightening the live pipeline and event model.',
  },
];

setInterval(() => {
  heartbeatCounter += 1;
  if (heartbeatCounter % 2 === 0) {
    appendLog(db, {
      projectSlug: 'mission-control',
      source: 'socketio',
      level: 'info',
      message: `Live snapshot heartbeat ${heartbeatCounter / 2}`,
    });
    appendEvent(db, {
      projectSlug: 'mission-control',
      eventType: 'runtime.heartbeat',
      roleSlug: 'orchestrator',
      message: `Frodo Orchestrator heartbeat ${heartbeatCounter / 2}`,
      payload: { heartbeat: heartbeatCounter / 2 },
    });

    const lifecycle = lifecycleSequence[(heartbeatCounter / 2 - 1) % lifecycleSequence.length];
    touchTaskLifecycle(db, 'mission-control', lifecycle);
  }
  emitSnapshot();
}, 5000);

function layout(title, body, active = '/', attrs = {}) {
  const bodyAttrs = Object.entries(attrs).map(([key, value]) => `${key}="${String(value).replace(/"/g, '&quot;')}"`).join(' ');
  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        --bg: #07111f;
        --bg2: #0c1729;
        --panel: rgba(15, 23, 42, 0.88);
        --panel2: #162237;
        --text: #e5eefc;
        --muted: #9fb0c9;
        --line: rgba(148, 163, 184, 0.18);
        --accent: #60a5fa;
        --accent2: #a78bfa;
        --gold: #fbbf24;
        --ok: #10b981;
        --warn: #f59e0b;
        --danger: #f87171;
      }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: radial-gradient(circle at top right, rgba(96,165,250,.14), transparent 28%), radial-gradient(circle at top left, rgba(167,139,250,.12), transparent 24%), linear-gradient(180deg, var(--bg2) 0%, var(--bg) 100%); color: var(--text); }
      .app { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
      .sidebar { border-right: 1px solid var(--line); background: rgba(7,17,31,0.86); backdrop-filter: blur(12px); padding: 24px 18px; }
      .brand { font-size: 22px; font-weight: 900; margin-bottom: 6px; display:flex; align-items:center; gap:10px; }
      .brand-mark { width: 34px; height: 34px; display:inline-grid; place-items:center; border-radius: 12px; background: linear-gradient(135deg, var(--accent), var(--accent2)); color: white; box-shadow: 0 10px 30px rgba(96,165,250,.25); }
      .sub { color: var(--muted); font-size: 14px; margin-bottom: 22px; }
      .nav a { display: block; color: var(--text); text-decoration: none; padding: 11px 12px; border-radius: 12px; margin-bottom: 6px; border:1px solid transparent; transition: all .18s ease; }
      .nav a.active, .nav a:hover { background: linear-gradient(90deg, rgba(96,165,250,0.18), rgba(167,139,250,0.14)); color: #dbeafe; border-color: rgba(96,165,250,.22); transform: translateX(2px); }
      .main { padding: 30px; }
      .top { display:flex; justify-content:space-between; gap: 16px; align-items:end; flex-wrap:wrap; margin-bottom: 22px; }
      .top h1 { margin: 0; font-size: 34px; }
      .muted { color: var(--muted); }
      .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom: 20px; }
      .card, .panel { background: var(--panel); border:1px solid var(--line); border-radius:18px; padding:18px; box-shadow: 0 16px 40px rgba(0,0,0,0.24); transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
      .card:hover, .panel:hover { transform: translateY(-2px); border-color: rgba(96,165,250,.26); box-shadow: 0 18px 44px rgba(0,0,0,0.28); }
      .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }
      .stat { font-size: 30px; font-weight: 800; margin-top: 8px; }
      table { width:100%; border-collapse: collapse; font-size:14px; }
      th, td { padding: 12px 10px; border-bottom: 1px solid var(--line); text-align:left; vertical-align: top; }
      th { color: var(--muted); font-size: 12px; text-transform: uppercase; }
      .pill { display:inline-block; padding:4px 10px; border-radius:999px; border:1px solid var(--line); font-size:12px; font-weight:700; }
      .pill.ok { color:#a7f3d0; background:rgba(16,185,129,.15); border-color:rgba(16,185,129,.35); }
      .pill.idle { color:#e5e7eb; background:rgba(107,114,128,.15); }
      .pill.warn { color:#fde68a; background:rgba(245,158,11,.15); border-color:rgba(245,158,11,.35); }
      .pill.info { color:#bfdbfe; background:rgba(96,165,250,.15); border-color:rgba(96,165,250,.35); }
      .pill.team { color:#f5d0fe; background:rgba(168,85,247,.16); border-color:rgba(168,85,247,.34); }
      .pill.ops { color:#fde68a; background:rgba(251,191,36,.14); border-color:rgba(251,191,36,.34); }
      .stack { display:grid; gap:16px; }
      .kv { display:grid; gap:8px; font-size:14px; }
      .timeline { display:grid; gap:12px; }
      .timeline-item { border:1px solid var(--line); border-radius:14px; padding:14px; background:rgba(31,41,55,.45); }
      .timeline-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; margin-bottom:8px; }
      .stage-strip { display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:14px; }
      .stage-card { position:relative; overflow:hidden; }
      .stage-status { font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.12em; }
      .section-note { color: var(--muted); font-size: 14px; line-height: 1.55; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .live-dot { display:inline-block; width:10px; height:10px; border-radius:999px; background:var(--ok); box-shadow:0 0 0 0 rgba(16,185,129,.6); animation:pulse 1.8s infinite; margin-right:8px; }
      @keyframes pulse { 0% { box-shadow:0 0 0 0 rgba(16,185,129,.6);} 70% { box-shadow:0 0 0 10px rgba(16,185,129,0);} 100% { box-shadow:0 0 0 0 rgba(16,185,129,0);} }
      code, pre { white-space: pre-wrap; word-break: break-word; }
      pre { background:#0a0f1a; border:1px solid var(--line); padding:14px; border-radius:12px; overflow:auto; }
      ul { margin: 8px 0 0 18px; }
      @media (max-width: 900px) { .app { grid-template-columns: 1fr; } .sidebar { border-right:0; border-bottom:1px solid var(--line); } }
    </style>
  </head>
  <body ${bodyAttrs}>
    <script src="/socket.io/socket.io.js"></script>
    <script>
      window.__mcSocket = io();
      window.__mcSocket.on('snapshot', (payload) => {
        window.__mcLivePayload = payload;
        const liveTime = document.querySelector('[data-live-time]');
        if (liveTime && payload.time) liveTime.textContent = payload.time;
        const liveProjects = document.querySelector('[data-live-projects]');
        if (liveProjects && payload.projects) liveProjects.textContent = payload.projects.length;
        const liveTasks = document.querySelector('[data-live-tasks]');
        if (liveTasks && payload.db) liveTasks.textContent = payload.db.tasks;
        const teamCards = document.querySelectorAll('[data-team-role-slug]');
        if (teamCards.length && payload.team) {
          const byRole = new Map(payload.team.map((agent) => [agent.slug, agent]));
          teamCards.forEach((card) => {
            const slug = card.getAttribute('data-team-role-slug');
            const live = byRole.get(slug);
            const statusEl = card.querySelector('[data-team-status]');
            const taskEl = card.querySelector('[data-team-task]');
            const projectEl = card.querySelector('[data-team-project]');
            if (!statusEl || !taskEl || !projectEl) return;
            if (live && live.liveAssignment) {
              statusEl.textContent = live.liveAssignment.assignment_status || 'active';
              taskEl.textContent = live.liveAssignment.task_title || '—';
              projectEl.textContent = live.liveAssignment.project_name || '—';
            } else {
              statusEl.textContent = slug === 'gizmo-core' ? 'active' : 'idle';
              taskEl.textContent = slug === 'gizmo-core' ? 'General operations' : '—';
              projectEl.textContent = '—';
            }
          });
        }

        const pageProjectSlug = document.body.getAttribute('data-project-slug');
        if (pageProjectSlug && payload.projects) {
          const project = payload.projects.find((p) => p.slug === pageProjectSlug);
          if (project) {
            const stageName = document.querySelector('[data-project-current-stage]');
            if (stageName) stageName.textContent = project.current_stage_label || '—';
            const activeTaskCount = document.querySelector('[data-project-active-task-count]');
            if (activeTaskCount) activeTaskCount.textContent = project.activeTasks.length;
          }
        }
      });
    </script>
    <div class="app">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">⚙️</span> Gizmo Mission Control</div>
        <div class="sub">Operator dashboard for Max + Gizmo.</div>
        <nav class="nav">
          <a href="/" class="${active === '/' ? 'active' : ''}">Overview</a>
          <a href="/schedule" class="${active === '/schedule' ? 'active' : ''}">Schedule</a>
          <a href="/projects" class="${active === '/projects' ? 'active' : ''}">Projects</a>
          <a href="/skills" class="${active === '/skills' ? 'active' : ''}">Skills</a>
          <a href="/activity" class="${active === '/activity' ? 'active' : ''}">Activity</a>
          <a href="/context" class="${active === '/context' ? 'active' : ''}">Context</a>
          <a href="/memory" class="${active === '/memory' ? 'active' : ''}">Memory</a>
          <a href="/docs" class="${active === '/docs' ? 'active' : ''}">Docs</a>
          <a href="/team" class="${active === '/team' ? 'active' : ''}">Team</a>
        </nav>
      </aside>
      <main class="main">${body}</main>
    </div>
  </body>
  </html>`;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'mission-control', time: new Date().toISOString(), db: dbSummary, publicBaseUrl: PUBLIC_BASE_URL, host: HOST, port: PORT });
});

app.get('/api/schedule', (req, res) => res.json(getScheduleData()));
app.get('/api/projects', (req, res) => res.json({ filesystem: getProjectsData(), runtime: getProjectsWithState(db) }));
app.get('/api/projects/:slug', (req, res) => {
  const project = getProjectDetail(db, req.params.slug);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});
app.get('/api/skills', (req, res) => res.json(getSkillsData()));
app.get('/api/activity', (req, res) => res.json(getRecentActivityData()));
app.get('/api/context', (req, res) => res.json(getContextData()));
app.get('/api/memory', (req, res) => res.json(getMemoryFiles()));
app.get('/api/docs', (req, res) => res.json(getDocsData()));
app.get('/api/team', (req, res) => res.json(getTeamData()));

app.get('/', (req, res) => {
  const schedule = getScheduleData();
  const projects = getProjectsData();
  const runtimeProjects = getProjectsWithState(db);
  const context = getContextData();
  const memory = getMemoryFiles();
  const docs = getDocsData();
  const team = getTeamData();
  res.send(layout('Mission Control', `
    <div class="top">
      <div>
        <h1>Mission Control</h1>
        <div class="muted">Dynamic local web app for Gizmo’s operator surfaces.</div>
      </div>
      <div class="muted"><span class="live-dot"></span>Live runtime connected · updated <span data-live-time>${new Date().toISOString()}</span></div>
    </div>
    <div class="grid">
      <div class="card"><div class="label">Scheduled jobs</div><div class="stat">${schedule.jobs.length}</div><div class="muted" style="margin-top:8px">Automation across the system.</div></div>
      <div class="card"><div class="label">Projects tracked</div><div class="stat" data-live-projects style="color:var(--accent)">${runtimeProjects.length}</div><div class="muted" style="margin-top:8px">Active work surfaces under observation.</div></div>
      <div class="card"><div class="label">Journal entries</div><div class="stat">${memory.files.length}</div><div class="muted" style="margin-top:8px">Short-term memory checkpoints.</div></div>
      <div class="card"><div class="label">Context signal</div><div class="stat" style="color:${context.recentJournal ? 'var(--ok)' : 'var(--warn)'}">${context.recentJournal ? 'Live' : 'Cold'}</div><div class="muted" style="margin-top:8px">Whether Gizmo has fresh context on hand.</div></div>
      <div class="card"><div class="label">SQLite tasks</div><div class="stat" data-live-tasks style="color:var(--accent2)">${dbSummary.tasks}</div><div class="muted" style="margin-top:8px">Explicit task records in the v2 backbone.</div></div>
      <div class="card"><div class="label">Agents visualised</div><div class="stat" style="color:var(--gold)">${team.agents.length}</div><div class="muted" style="margin-top:8px">Gizmo plus the Hobbit professionals.</div></div>
    </div>
    <div class="grid">
      <div class="card"><div class="label">Next step</div><div style="margin-top:8px">Use the left nav to inspect live schedule, projects, context, memory, docs, and team views.</div></div>
      <div class="card"><div class="label">Runtime projects</div><div style="margin-top:8px"><strong>${runtimeProjects.map((p) => p.name).join(', ') || 'None yet'}</strong></div><div class="muted" style="margin-top:8px">Projects currently registered in the SQLite backbone.</div></div>
      <div class="card"><div class="label">SQLite backbone</div><div style="margin-top:8px"><code>${dbPath}</code></div><div class="muted" style="margin-top:8px">Phase 1 persistence layer is now initialized on startup.</div></div>
    </div>
  `, '/'));
});

app.get('/schedule', (req, res) => {
  const schedule = getScheduleData();
  const okJobs = schedule.jobs.filter((j) => j.status === 'ok');
  const idleJobs = schedule.jobs.filter((j) => j.status === 'idle');
  const otherJobs = schedule.jobs.filter((j) => !['ok', 'idle'].includes(j.status));

  const groupedRows = (jobs, emptyText) => jobs.length
    ? jobs.map((job) => `
      <tr>
        <td><code>${job.id}</code></td>
        <td>${job.name || '—'}</td>
        <td>${job.schedule || '—'}</td>
        <td>${job.next || '—'}</td>
        <td>${job.last || '—'}</td>
        <td><span class="pill ${job.status.toLowerCase()}">${job.status}</span></td>
        <td>${job.target || '—'}</td>
        <td>${job.agentId || '—'}</td>
        <td>${job.model || '—'}</td>
      </tr>`).join('')
    : `<tr><td colspan="9">${emptyText}</td></tr>`;

  res.send(layout('Mission Control — Schedule', `
    <div class="top">
      <div>
        <h1>Schedule</h1>
        <div class="muted">Live cron and scheduled task view from <code>openclaw cron list</code>.</div>
      </div>
      <div class="muted">Jobs loaded: ${schedule.jobs.length}</div>
    </div>
    <div class="grid">
      <div class="card"><div class="label">Total jobs</div><div class="stat">${schedule.jobs.length}</div></div>
      <div class="card"><div class="label">OK</div><div class="stat">${okJobs.length}</div></div>
      <div class="card"><div class="label">Idle</div><div class="stat">${idleJobs.length}</div></div>
      <div class="card"><div class="label">Needs attention</div><div class="stat">${otherJobs.length}</div></div>
    </div>
    <div class="grid">
      <div class="card"><div class="label">What this page tells you</div><div style="margin-top:8px">What jobs exist, what state they’re in, and whether Gizmo’s automation is sleeping peacefully or plotting.</div></div>
      <div class="card"><div class="label">Fast read</div><div style="margin-top:8px">If “Needs attention” is non-zero, inspect the lower tables first. That’s where the gremlins live.</div></div>
    </div>
    <div class="panel">
      <div class="label">Jobs needing attention</div>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Schedule</th><th>Next</th><th>Last</th><th>Status</th><th>Target</th><th>Agent</th><th>Model</th></tr></thead>
        <tbody>${groupedRows(otherJobs, 'No jobs currently need attention. Miraculous.')}</tbody>
      </table>
    </div>
    <div class="panel" style="margin-top:20px">
      <div class="label">Healthy jobs</div>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Schedule</th><th>Next</th><th>Last</th><th>Status</th><th>Target</th><th>Agent</th><th>Model</th></tr></thead>
        <tbody>${groupedRows(okJobs, 'No healthy jobs found yet.')}</tbody>
      </table>
    </div>
    <div class="panel" style="margin-top:20px">
      <div class="label">Idle jobs</div>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Schedule</th><th>Next</th><th>Last</th><th>Status</th><th>Target</th><th>Agent</th><th>Model</th></tr></thead>
        <tbody>${groupedRows(idleJobs, 'No idle jobs right now.')}</tbody>
      </table>
    </div>
    <div class="panel" style="margin-top:20px">
      <div class="label">Raw source</div>
      <pre>${schedule.raw || schedule.error || 'No raw output available.'}</pre>
    </div>
  `, '/schedule'));
});

app.get('/projects', (req, res) => {
  const projects = getProjectsWithState(db);
  const cards = projects.map((project) => `
    <div class="card stack">
      <div class="timeline-head">
        <div>
          <div class="label">Project</div>
          <div class="stat" style="font-size:24px">${project.name}</div>
        </div>
        <span class="pill ${project.status === 'active' ? 'ok' : project.status === 'blocked' ? 'warn' : 'idle'}">${project.status}</span>
      </div>
      <div class="muted">Repo-backed software project with explicit pipeline state.</div>
      <div class="kv">
        <div><strong>Current stage:</strong> ${project.current_stage_label || '—'}</div>
        <div><strong>Repo path:</strong> <code>${project.repo_path}</code></div>
        <div><strong>GitHub:</strong> ${project.github_url ? `<a href="${project.github_url}" style="color:#93c5fd">${project.github_url}</a>` : '—'}</div>
        <div><strong>Discord channel:</strong> ${project.discord_channel_name || '—'}</div>
        <div><strong>Project memory:</strong> <code>${project.project_memory_path || '—'}</code></div>
        <div><strong>Active tasks:</strong> ${project.summary.activeTasks}</div>
        <div><strong>Blocked tasks:</strong> ${project.summary.blockedTasks}</div>
        <div><strong>Completed tasks:</strong> ${project.summary.doneTasks}</div>
      </div>
      <div><a href="/projects/${project.slug}" style="color:#bfdbfe; text-decoration:none; font-weight:700;">Open project detail →</a></div>
    </div>`).join('');

  const emptyState = `
    <div class="panel">
      <div class="label">No registered projects</div>
      <h2 style="margin-top:10px">Nothing in the runtime model yet</h2>
      <div class="muted" style="margin-top:8px">Once projects are registered in the SQLite backbone, they’ll appear here with stages, tasks, and explicit ownership.</div>
    </div>`;

  res.send(layout('Mission Control — Projects', `
    <div class="top"><div><h1>Projects</h1><div class="muted">Projects registered in Mission Control’s runtime backbone.</div></div></div>
    <div class="grid">
      <div class="card"><div class="label">Projects tracked</div><div class="stat">${projects.length}</div></div>
      <div class="card"><div class="label">Active tasks</div><div class="stat">${projects.reduce((sum, project) => sum + project.summary.activeTasks, 0)}</div></div>
      <div class="card"><div class="label">Blocked tasks</div><div class="stat" style="color:var(--warn)">${projects.reduce((sum, project) => sum + project.summary.blockedTasks, 0)}</div></div>
      <div class="card"><div class="label">Data source</div><div class="stat" style="font-size:16px; line-height:1.4">SQLite runtime model</div></div>
    </div>
    ${projects.length === 0 ? emptyState : `<div class="grid">${cards}</div>`}
  `, '/projects'));
});

app.get('/projects/:slug', (req, res) => {
  const project = getProjectDetail(db, req.params.slug);
  if (!project) {
    res.status(404).send(layout('Project not found', `
      <div class="top"><div><h1>Project not found</h1><div class="muted">No runtime project exists for slug <code>${req.params.slug}</code>.</div></div></div>
    `));
    return;
  }

  const stageBar = project.stages.map((stage) => {
    const color = stage.status === 'done'
      ? 'var(--ok)'
      : stage.status === 'active'
        ? 'var(--accent)'
        : stage.status === 'blocked'
          ? 'var(--warn)'
          : 'rgba(148,163,184,.18)';
    const badge = stage.status === 'active'
      ? 'LIVE'
      : stage.status === 'done'
        ? 'DONE'
        : stage.status === 'blocked'
          ? 'BLOCKED'
          : 'PENDING';
    return `
      <div class="card stack stage-card" style="border-top:3px solid ${color}; min-height: 150px;">
        <div class="timeline-head">
          <div>
            <div class="label">${stage.label}</div>
            <div class="stat" style="font-size:18px">${stage.status}</div>
          </div>
          <span class="stage-status" style="color:${color}">${badge}</span>
        </div>
        <div class="muted">${stage.stage_key}</div>
      </div>`;
  }).join('');

  const activeTasks = project.activeTasks.length
    ? project.activeTasks.map((task) => `
      <div class="card stack" style="border-left:4px solid ${task.status === 'active' ? 'var(--accent2)' : task.status === 'blocked' ? 'var(--warn)' : 'var(--line)'};">
        <div class="timeline-head">
          <div>
            <div class="label">Task · ${task.status}</div>
            <div class="stat" style="font-size:22px">${task.title}</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <span class="pill ${task.status === 'active' ? 'team' : task.status === 'blocked' ? 'warn' : 'idle'}">${task.status}</span>
            <span class="pill info">${task.priority}</span>
          </div>
        </div>
        <div class="section-note">${task.description || 'No description yet.'}</div>
        <div class="kv">
          <div><strong>Owner:</strong> ${task.assigned_formal_name || 'Unassigned'}</div>
          <div><strong>Role slug:</strong> <code>${task.assigned_role_slug || '—'}</code></div>
          <div><strong>Started:</strong> ${task.started_at || '—'}</div>
          <div><strong>Updated:</strong> ${task.updated_at}</div>
        </div>
      </div>`).join('')
    : '<div class="panel">No active tasks in the current stage yet.</div>';

  const eventFeed = project.events.length
    ? project.events.map((event) => `
      <div class="timeline-item">
        <div class="timeline-head">
          <div>
            <div class="label">${event.event_type}</div>
            <div style="font-size:17px; font-weight:700; margin-top:4px">${event.message}</div>
          </div>
          <span class="pill info">${event.role_slug || 'system'}</span>
        </div>
        <div class="muted">${event.created_at}</div>
      </div>`).join('')
    : '<div class="timeline-item">No events yet.</div>';

  const logs = project.logs.length
    ? project.logs.map((log) => `
      <div class="timeline-item">
        <div class="timeline-head">
          <div>
            <div class="label">${log.source} · ${log.level}</div>
            <div style="font-size:16px; font-weight:700; margin-top:4px">${log.message}</div>
          </div>
          <span class="pill idle">${log.role_slug || 'system'}</span>
        </div>
        <div class="muted">${log.timestamp}</div>
      </div>`).join('')
    : '<div class="timeline-item">No logs yet.</div>';

  res.send(layout(`Mission Control — ${project.name}`, `
    <div class="top"><div><h1>${project.name}</h1><div class="muted">Project detail view for explicit pipeline state, active tasks, events, and logs.</div></div><div class="muted"><span class="live-dot"></span>Live project view</div></div>
    <div class="grid">
      <div class="card"><div class="label">Status</div><div class="stat">${project.status}</div><div class="section-note">Overall project health.</div></div>
      <div class="card"><div class="label">Current stage</div><div class="stat" data-project-current-stage style="font-size:22px">${project.current_stage_label || '—'}</div><div class="section-note">The active pipeline checkpoint right now.</div></div>
      <div class="card"><div class="label">Discord channel</div><div class="stat" style="font-size:18px">${project.discord_channel_name || '—'}</div><div class="section-note">Where intervention and project discussion should happen.</div></div>
      <div class="card"><div class="label">Active tasks</div><div class="stat" data-project-active-task-count>${project.activeTasks.length}</div><div class="section-note">Explicit tasks in the current active stage.</div></div>
      <div class="card"><div class="label">Blocked tasks</div><div class="stat" style="color:var(--warn)">${project.summary.blockedTasks}</div><div class="section-note">Tasks needing attention or unblock work.</div></div>
      <div class="card"><div class="label">Completed tasks</div><div class="stat" style="color:var(--ok)">${project.summary.doneTasks}</div><div class="section-note">Tasks already finished in the runtime model.</div></div>
    </div>
    <div class="panel stack">
      <div class="timeline-head">
        <div>
          <div class="label">Pipeline</div>
          <div style="font-size:18px; font-weight:700; margin-top:4px">Project stage progression</div>
        </div>
        <span class="pill team">explicit</span>
      </div>
      <div class="section-note">This is the explicit pipeline backbone for the project. The highlighted stage is the current live stage, and the tasks below belong to that operational moment.</div>
      <div class="stage-strip" data-project-stage-grid>${stageBar}</div>
    </div>
    <div class="panel stack" style="margin-top:20px">
      <div class="timeline-head">
        <div>
          <div class="label">Active tasks</div>
          <div style="font-size:18px; font-weight:700; margin-top:4px">What the fellowship is working on right now</div>
        </div>
        <span class="pill ok">current stage</span>
      </div>
      <div class="section-note">These are the explicit work items currently attached to the active pipeline stage. This section should make it obvious what each team member is doing right now.</div>
      <div class="grid" data-project-active-tasks>${activeTasks}</div>
    </div>
    <div class="grid" style="margin-top:20px">
      <div class="panel stack">
        <div class="timeline-head">
          <div>
            <div class="label">Events</div>
            <div style="font-size:18px; font-weight:700; margin-top:4px">Explicit operational history</div>
          </div>
          <span class="pill info">event feed</span>
        </div>
        <div class="section-note">Human-readable state changes. This is the clean operational story.</div>
        <div class="timeline" data-project-events>${eventFeed}</div>
      </div>
      <div class="panel stack">
        <div class="timeline-head">
          <div>
            <div class="label">Logs</div>
            <div style="font-size:18px; font-weight:700; margin-top:4px">Structured technical output</div>
          </div>
          <span class="pill idle">logs</span>
        </div>
        <div class="section-note">Structured technical output and runtime traces. This is the goblin cave underneath the cleaner event story.</div>
        <div class="timeline" data-project-logs>${logs}</div>
      </div>
    </div>
  `, '/projects', { 'data-project-slug': project.slug }));
});

app.get('/skills', (req, res) => {
  const skills = getSkillsData();
  const documentedCount = skills.skills.filter((skill) => skill.hasSkillDoc).length;
  const teamOps = skills.skills.filter((skill) => skill.category === 'team-ops');
  const gizmoTeam = skills.skills.filter((skill) => skill.category === 'gizmo-team');
  const general = skills.skills.filter((skill) => skill.category === 'general');

  const renderCards = (items) => items.map((skill) => `
    <div class="card stack">
      <div class="timeline-head">
        <div>
          <div class="label">${skill.hasSkillDoc ? 'Documented skill' : 'Skill folder'}</div>
          <div class="stat" style="font-size:24px">${skill.name}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <span class="pill ${skill.category === 'team-ops' ? 'ops' : skill.category === 'gizmo-team' ? 'team' : 'info'}">${skill.category}</span>
          <span class="pill ${skill.hasSkillDoc ? 'ok' : 'warn'}">${skill.hasSkillDoc ? 'Ready' : 'Thin docs'}</span>
        </div>
      </div>
      <div class="muted">${skill.summary}</div>
      <div class="kv">
        <div><strong>Path:</strong> <code>${skill.path}</code></div>
        <div><strong>SKILL.md:</strong> ${skill.hasSkillDoc ? 'Yes' : 'No'}</div>
        <div><strong>Doc path:</strong> <code>${skill.skillMdPath}</code></div>
      </div>
    </div>`).join('');

  res.send(layout('Mission Control — Skills', `
    <div class="top"><div><h1>Skills</h1><div class="muted">The capabilities Gizmo can reach for when work gets specific.</div></div></div>
    <div class="grid">
      <div class="card"><div class="label">Skills available</div><div class="stat">${skills.count}</div></div>
      <div class="card"><div class="label">Documented skills</div><div class="stat">${documentedCount}</div></div>
      <div class="card"><div class="label">Gizmo Team skills</div><div class="stat" style="color:var(--accent2)">${gizmoTeam.length}</div></div>
      <div class="card"><div class="label">Team ops skills</div><div class="stat" style="color:var(--gold)">${teamOps.length}</div></div>
      <div class="card"><div class="label">Skills root</div><div class="stat" style="font-size:16px; line-height:1.4">${skills.root}</div></div>
    </div>
    <div class="grid">
      <div class="card"><div class="label">What this page is for</div><div style="margin-top:8px">A quick map of what Gizmo can do without guessing or rummaging through the basement.</div></div>
      <div class="card"><div class="label">Expansion ops</div><div style="margin-top:8px">Team expansion now has dedicated lifecycle skills — including onboarding and offboarding for new specialists.</div></div>
    </div>
    <div class="panel"><div class="label">Team ops</div><div class="grid" style="margin-top:16px">${renderCards(teamOps)}</div></div>
    <div class="panel" style="margin-top:20px"><div class="label">Gizmo Team</div><div class="grid" style="margin-top:16px">${renderCards(gizmoTeam)}</div></div>
    <div class="panel" style="margin-top:20px"><div class="label">General skills</div><div class="grid" style="margin-top:16px">${renderCards(general)}</div></div>
    ${skills.error ? `<div class="panel" style="margin-top:20px"><div class="label">Error</div><pre>${skills.error}</pre></div>` : ''}
  `, '/skills'));
});

app.get('/activity', (req, res) => {
  const activity = getRecentActivityData();
  const runtimeProjects = getProjectsWithState(db);
  const runtimeEvents = runtimeProjects.flatMap((project) => project.events.slice(0, 5).map((event) => ({
    type: 'runtime',
    subject: `${project.name}: ${event.message}`,
    date: event.created_at,
    label: event.role_slug || 'system',
  })));
  const mergedItems = [...runtimeEvents, ...activity.items]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) * -1)
    .slice(0, 24);
  const typeClass = (type) => ({ commit: 'ok', journal: 'info', project: 'warn', job: 'idle', runtime: 'team' }[type] || 'idle');
  const feed = mergedItems.length
    ? mergedItems.map((item) => `
      <div class="timeline-item">
        <div class="timeline-head">
          <div>
            <div class="label">${item.type}</div>
            <div style="font-size:18px; font-weight:700; margin-top:4px">${item.subject}</div>
          </div>
          <span class="pill ${typeClass(item.type)}">${item.type}</span>
        </div>
        <div class="kv">
          <div><strong>When:</strong> ${item.date || '—'}</div>
          <div><strong>Ref:</strong> <span class="mono">${item.hash || item.path || item.label || '—'}</span></div>
        </div>
      </div>`).join('')
    : '<div class="timeline-item">No recent activity found yet.</div>';

  res.send(layout('Mission Control — Activity', `
    <div class="top"><div><h1>Recent Activity</h1><div class="muted">A stitched-together feed of commits, journals, projects, and scheduled work.</div></div></div>
    <div class="grid">
      <div class="card"><div class="label">Recent items</div><div class="stat">${mergedItems.length}</div></div>
      <div class="card"><div class="label">Commits sampled</div><div class="stat">${activity.commitsCount}</div></div>
      <div class="card"><div class="label">Journals known</div><div class="stat">${activity.journalsCount}</div></div>
      <div class="card"><div class="label">Projects known</div><div class="stat">${activity.projectsCount}</div></div>
    </div>
    <div class="grid">
      <div class="card"><div class="label">Why this matters</div><div style="margin-top:8px">This is the quickest answer to “what has Gizmo been doing lately?” without spelunking across five systems.</div></div>
      <div class="card"><div class="label">Feed logic</div><div style="margin-top:8px">It blends git history, memory files, projects, and schedule signals into one timeline. Slightly stitched together, but very useful.</div></div>
    </div>
    <div class="panel">
      <div class="label">Timeline</div>
      <div class="timeline">${feed}</div>
    </div>
    ${activity.gitError ? `<div class="panel" style="margin-top:20px"><div class="label">Git source error</div><pre>${activity.gitError}</pre></div>` : ''}
  `, '/activity'));
});

app.get('/context', (req, res) => {
  const context = getContextData();
  const status = context.parsedStatus || {};

  res.send(layout('Mission Control — Context', `
    <div class="top"><div><h1>Context</h1><div class="muted">What Gizmo likely knows, is focused on, and is currently carrying around in its little metal head.</div></div></div>
    <div class="grid">
      <div class="card"><div class="label">Session state</div><div class="stat" style="font-size:22px">${context.statusOk ? 'Live' : 'Unavailable'}</div></div>
      <div class="card"><div class="label">Recent journal</div><div class="stat" style="font-size:18px">${context.recentJournal ? context.recentJournal.name : 'None'}</div></div>
      <div class="card"><div class="label">Long-term memory</div><div class="stat" style="font-size:18px">${context.memory.hasLongTerm ? 'Loaded' : 'Missing'}</div></div>
      <div class="card"><div class="label">Projects known</div><div class="stat">${context.projectsCount}</div></div>
    </div>
    <div class="grid">
      <div class="card stack">
        <div class="timeline-head">
          <div>
            <div class="label">Current session</div>
            <div style="font-size:18px; font-weight:700; margin-top:4px">Live operating picture</div>
          </div>
          <span class="pill ${context.statusOk ? 'ok' : 'warn'}">${context.statusOk ? 'Connected' : 'Missing'}</span>
        </div>
        <div class="kv">
          <div><strong>Time:</strong> ${status.time || '—'}</div>
          <div><strong>Model:</strong> ${status.model || '—'}</div>
          <div><strong>Session:</strong> ${status.session || '—'}</div>
          <div><strong>Runtime:</strong> ${status.runtime || '—'}</div>
          <div><strong>Activation:</strong> ${status.activation || '—'}</div>
          <div><strong>Usage:</strong> ${status.usage || '—'}</div>
        </div>
      </div>
      <div class="card stack">
        <div class="timeline-head">
          <div>
            <div class="label">Memory map</div>
            <div style="font-size:18px; font-weight:700; margin-top:4px">Where context is coming from</div>
          </div>
          <span class="pill info">Memory</span>
        </div>
        <div class="kv">
          <div><strong>Latest journal:</strong> ${context.recentJournal ? context.recentJournal.name : '—'}</div>
          <div><strong>Journal path:</strong> <code>${context.recentJournal ? context.recentJournal.path : '—'}</code></div>
          <div><strong>Long-term memory:</strong> <code>${context.longTermMemoryPath}</code></div>
          <div><strong>Total journals:</strong> ${context.memory.files.length}</div>
        </div>
      </div>
      <div class="card stack">
        <div class="label">Likely current focus</div>
        <ul>${context.focusAreas.map((item) => `<li>${item}</li>`).join('')}</ul>
      </div>
      <div class="card stack">
        <div class="timeline-head">
          <div>
            <div class="label">Active project signal</div>
            <div style="font-size:18px; font-weight:700; margin-top:4px">Most recently touched project</div>
          </div>
          <span class="pill idle">Project</span>
        </div>
        <div class="kv">
          <div><strong>Most recent project:</strong> ${context.activeProject ? context.activeProject.name : 'None yet'}</div>
          <div><strong>Path:</strong> <code>${context.activeProject ? context.activeProject.path : '—'}</code></div>
          <div><strong>Description:</strong> ${context.activeProject ? context.activeProject.description : 'No project folders have been picked up yet.'}</div>
        </div>
      </div>
    </div>
    <div class="grid">
      <div class="panel stack">
        <div class="timeline-head">
          <div>
            <div class="label">Recent journal snippet</div>
            <div style="font-size:18px; font-weight:700; margin-top:4px">Fresh short-term context</div>
          </div>
          <span class="pill info">Journal</span>
        </div>
        <pre>${context.journalSnippet || 'No recent journal snippet available yet.'}</pre>
      </div>
      <div class="panel stack">
        <div class="timeline-head">
          <div>
            <div class="label">Long-term memory snippet</div>
            <div style="font-size:18px; font-weight:700; margin-top:4px">Stable context and agreements</div>
          </div>
          <span class="pill ok">Memory</span>
        </div>
        <pre>${context.longTermSnippet || 'No long-term memory snippet available yet.'}</pre>
      </div>
    </div>
    <div class="panel stack">
      <div class="timeline-head">
        <div>
          <div class="label">Raw OpenClaw status</div>
          <div style="font-size:18px; font-weight:700; margin-top:4px">Underlying source output</div>
        </div>
        <span class="pill idle">Raw</span>
      </div>
      <pre>${context.rawStatus || 'No status output available.'}</pre>
    </div>
  `, '/context'));
});

app.get('/memory', (req, res) => {
  const memory = getMemoryFiles();
  const rows = memory.files.length
    ? memory.files.map((f) => `<tr><td>${f.name}</td><td>${f.modifiedAt}</td><td>${f.size}</td><td><code>${f.path}</code></td></tr>`).join('')
    : '<tr><td colspan="4">No journal files found yet.</td></tr>';
  res.send(layout('Mission Control — Memory', `
    <div class="top"><div><h1>Memory</h1><div class="muted">Journal and long-term memory browser scaffold.</div></div></div>
    <div class="grid">
      <div class="card"><div class="label">Journal entries</div><div class="stat">${memory.files.length}</div></div>
      <div class="card"><div class="label">Long-term memory</div><div class="stat">${memory.hasLongTerm ? 'Yes' : 'No'}</div></div>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>File</th><th>Modified</th><th>Size</th><th>Path</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `, '/memory'));
});

app.get('/docs', (req, res) => {
  const docs = getDocsData();
  const rows = docs.map((d) => `<tr><td>${d.name}</td><td>${d.relativePath}</td><td>${d.modifiedAt}</td><td>${d.size}</td></tr>`).join('');
  res.send(layout('Mission Control — Docs', `
    <div class="top"><div><h1>Docs & Artifacts</h1><div class="muted">Recently tracked files across Gizmo’s Ground and the OpenClaw workspace.</div></div></div>
    <div class="panel">
      <table>
        <thead><tr><th>Name</th><th>Relative path</th><th>Modified</th><th>Size</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `, '/docs'));
});

app.get('/team', (req, res) => {
  const team = getTeamData();
  const cards = team.agents.map((agent, index) => {
    const live = agent.liveAssignment;
    const status = live ? live.assignment_status : (agent.slug === 'gizmo-core' ? 'active' : 'idle');
    const task = live ? live.task_title : (agent.slug === 'gizmo-core' ? 'General operations' : '—');
    const project = live ? live.project_name : '—';

    return `
      <div class="card stack" data-team-role-slug="${agent.slug}" style="border-top:3px solid ${index === 0 ? 'var(--accent)' : index === 1 ? 'var(--gold)' : 'var(--accent2)'};">
        <div class="timeline-head">
          <div>
            <div class="label">${agent.role}</div>
            <div class="stat" style="font-size:24px">${agent.name}</div>
          </div>
          <span class="pill ${index === 0 ? 'info' : 'team'}">${index === 0 ? 'Core' : 'Team'}</span>
        </div>
        <div class="kv">
          <div><strong>Status:</strong> <span data-team-status>${status}</span></div>
          <div><strong>Current task:</strong> <span data-team-task>${task}</span></div>
          <div><strong>Current project:</strong> <span data-team-project>${project}</span></div>
        </div>
        <ul>${agent.responsibilities.map((r) => `<li>${r}</li>`).join('')}</ul>
      </div>`;
  }).join('');
  res.send(layout('Mission Control — Team', `
    <div class="top"><div><h1>Team</h1><div class="muted">Current active team model. No longer tiny — now a properly staffed little fellowship.</div></div></div>
    <div class="grid">${cards}</div>
    <div class="panel stack">
      <div class="timeline-head">
        <div>
          <div class="label">OpenClaw status source</div>
          <div style="font-size:18px; font-weight:700; margin-top:4px">Runtime status output</div>
        </div>
        <span class="pill idle">Raw</span>
      </div>
      <pre>${team.raw}</pre>
    </div>
  `, '/team'));
});

server.listen(PORT, HOST, () => {
  console.log(`Mission Control listening on http://${HOST}:${PORT}`);
});

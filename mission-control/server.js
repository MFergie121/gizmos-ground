const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3187;
const REPO_ROOT = '/Users/maxfergie/gizmos-ground';
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
  return {
    statusOk: result.ok,
    raw: result.ok ? result.stdout : result.error,
    agents: [
      {
        name: 'Gizmo',
        role: 'Primary agent',
        responsibilities: [
          'Memory and journal upkeep',
          'Daily brief operations',
          'Discord workflows',
          'Research and automation',
        ],
      },
    ],
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

        return {
          name: entry.name,
          path: skillDir,
          skillMdPath,
          hasSkillDoc,
          summary,
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

function layout(title, body, active = '/') {
  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        --bg: #0b1220;
        --panel: #111827;
        --panel2: #1f2937;
        --text: #e5e7eb;
        --muted: #9ca3af;
        --line: #374151;
        --accent: #60a5fa;
        --ok: #10b981;
        --warn: #f59e0b;
      }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: linear-gradient(180deg, #08101d 0%, var(--bg) 100%); color: var(--text); }
      .app { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
      .sidebar { border-right: 1px solid var(--line); background: rgba(17,24,39,0.96); padding: 24px 18px; }
      .brand { font-size: 22px; font-weight: 800; margin-bottom: 6px; }
      .sub { color: var(--muted); font-size: 14px; margin-bottom: 22px; }
      .nav a { display: block; color: var(--text); text-decoration: none; padding: 10px 12px; border-radius: 10px; margin-bottom: 6px; }
      .nav a.active, .nav a:hover { background: rgba(96,165,250,0.14); color: #bfdbfe; }
      .main { padding: 28px; }
      .top { display:flex; justify-content:space-between; gap: 16px; align-items:end; flex-wrap:wrap; margin-bottom: 22px; }
      .top h1 { margin: 0; font-size: 34px; }
      .muted { color: var(--muted); }
      .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom: 20px; }
      .card, .panel { background: rgba(17,24,39,0.92); border:1px solid var(--line); border-radius:16px; padding:16px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
      .label { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: .08em; }
      .stat { font-size: 30px; font-weight: 800; margin-top: 8px; }
      table { width:100%; border-collapse: collapse; font-size:14px; }
      th, td { padding: 12px 10px; border-bottom: 1px solid var(--line); text-align:left; vertical-align: top; }
      th { color: var(--muted); font-size: 12px; text-transform: uppercase; }
      .pill { display:inline-block; padding:4px 10px; border-radius:999px; border:1px solid var(--line); font-size:12px; font-weight:700; }
      .pill.ok { color:#a7f3d0; background:rgba(16,185,129,.15); border-color:rgba(16,185,129,.35); }
      .pill.idle { color:#e5e7eb; background:rgba(107,114,128,.15); }
      .pill.warn { color:#fde68a; background:rgba(245,158,11,.15); border-color:rgba(245,158,11,.35); }
      code, pre { white-space: pre-wrap; word-break: break-word; }
      pre { background:#0a0f1a; border:1px solid var(--line); padding:14px; border-radius:12px; overflow:auto; }
      ul { margin: 8px 0 0 18px; }
      @media (max-width: 900px) { .app { grid-template-columns: 1fr; } .sidebar { border-right:0; border-bottom:1px solid var(--line); } }
    </style>
  </head>
  <body>
    <div class="app">
      <aside class="sidebar">
        <div class="brand">Gizmo Mission Control</div>
        <div class="sub">Local operator dashboard for Max + Gizmo.</div>
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
  res.json({ ok: true, service: 'mission-control', time: new Date().toISOString() });
});

app.get('/api/schedule', (req, res) => res.json(getScheduleData()));
app.get('/api/projects', (req, res) => res.json(getProjectsData()));
app.get('/api/skills', (req, res) => res.json(getSkillsData()));
app.get('/api/activity', (req, res) => res.json(getRecentActivityData()));
app.get('/api/context', (req, res) => res.json(getContextData()));
app.get('/api/memory', (req, res) => res.json(getMemoryFiles()));
app.get('/api/docs', (req, res) => res.json(getDocsData()));
app.get('/api/team', (req, res) => res.json(getTeamData()));

app.get('/', (req, res) => {
  const schedule = getScheduleData();
  const projects = getProjectsData();
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
      <div class="muted">Now very much not a static HTML fossil.</div>
    </div>
    <div class="grid">
      <div class="card"><div class="label">Scheduled jobs</div><div class="stat">${schedule.jobs.length}</div></div>
      <div class="card"><div class="label">Projects tracked</div><div class="stat">${projects.count}</div></div>
      <div class="card"><div class="label">Journal entries</div><div class="stat">${memory.files.length}</div></div>
      <div class="card"><div class="label">Context signal</div><div class="stat">${context.recentJournal ? 'Live' : 'Cold'}</div></div>
      <div class="card"><div class="label">Recent docs/artifacts tracked</div><div class="stat">${docs.length}</div></div>
      <div class="card"><div class="label">Agents visualised</div><div class="stat">${team.agents.length}</div></div>
    </div>
    <div class="grid">
      <div class="card"><div class="label">Next step</div><div style="margin-top:8px">Use the left nav to inspect live schedule, projects, context, memory, docs, and team views.</div></div>
      <div class="card"><div class="label">Projects root</div><div style="margin-top:8px"><code>${projects.root}</code></div></div>
      <div class="card"><div class="label">Backend</div><div style="margin-top:8px">Node + Express, local only, fed by OpenClaw + filesystem state.</div></div>
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
  const projects = getProjectsData();
  const cards = projects.projects.map((project) => `
    <div class="card">
      <div class="label">${project.isGitRepo ? 'Git project' : 'Project folder'}</div>
      <div class="stat" style="font-size:24px">${project.name}</div>
      <div class="muted" style="margin-top:8px">${project.description}</div>
      <div style="margin-top:14px; display:grid; gap:8px; font-size:14px;">
        <div><strong>Path:</strong> <code>${project.path}</code></div>
        <div><strong>Package:</strong> ${project.packageName || '—'}</div>
        <div><strong>README:</strong> ${project.hasReadme ? 'Yes' : 'No'}</div>
        <div><strong>Project memory:</strong> ${project.hasProjectMemory ? 'Yes' : 'No'}</div>
        <div><strong>Last modified:</strong> ${project.modifiedAt}</div>
      </div>
    </div>`).join('');

  const emptyState = `
    <div class="panel">
      <div class="label">Proof of concept</div>
      <h2 style="margin-top:10px">No projects yet</h2>
      <div class="muted" style="margin-top:8px">
        Mission Control is now watching <code>${projects.root}</code> for project folders.
        When Gizmo starts working on projects there, they’ll appear here automatically.
      </div>
      <div style="margin-top:16px">
        <strong>Expected shape:</strong>
        <ul>
          <li>Each project lives in its own folder under <code>${projects.root}</code></li>
          <li>Optional <code>README.md</code> for project summary</li>
          <li>Optional <code>PROJECT_MEMORY.md</code> for Gizmo-specific context</li>
          <li>Optional git repo and <code>package.json</code> metadata</li>
        </ul>
      </div>
    </div>`;

  res.send(layout('Mission Control — Projects', `
    <div class="top"><div><h1>Projects</h1><div class="muted">Projects Gizmo is working on under <code>${projects.root}</code>.</div></div></div>
    <div class="grid">
      <div class="card"><div class="label">Projects tracked</div><div class="stat">${projects.count}</div></div>
      <div class="card"><div class="label">Projects root</div><div class="stat" style="font-size:16px; line-height:1.4">${projects.root}</div></div>
    </div>
    ${projects.empty ? emptyState : `<div class="grid">${cards}</div>`}
    ${projects.error ? `<div class="panel" style="margin-top:20px"><div class="label">Error</div><pre>${projects.error}</pre></div>` : ''}
  `, '/projects'));
});

app.get('/skills', (req, res) => {
  const skills = getSkillsData();
  const cards = skills.skills.map((skill) => `
    <div class="card">
      <div class="label">${skill.hasSkillDoc ? 'Documented skill' : 'Skill folder'}</div>
      <div class="stat" style="font-size:24px">${skill.name}</div>
      <div class="muted" style="margin-top:8px">${skill.summary}</div>
      <div style="margin-top:14px; display:grid; gap:8px; font-size:14px;">
        <div><strong>Path:</strong> <code>${skill.path}</code></div>
        <div><strong>SKILL.md:</strong> ${skill.hasSkillDoc ? 'Yes' : 'No'}</div>
        <div><strong>Doc path:</strong> <code>${skill.skillMdPath}</code></div>
      </div>
    </div>`).join('');

  res.send(layout('Mission Control — Skills', `
    <div class="top"><div><h1>Skills</h1><div class="muted">Skills currently available to Gizmo via the OpenClaw skills directory.</div></div></div>
    <div class="grid">
      <div class="card"><div class="label">Skills available</div><div class="stat">${skills.count}</div></div>
      <div class="card"><div class="label">Skills root</div><div class="stat" style="font-size:16px; line-height:1.4">${skills.root}</div></div>
    </div>
    <div class="grid">${cards}</div>
    ${skills.error ? `<div class="panel" style="margin-top:20px"><div class="label">Error</div><pre>${skills.error}</pre></div>` : ''}
  `, '/skills'));
});

app.get('/activity', (req, res) => {
  const activity = getRecentActivityData();
  const rows = activity.items.length
    ? activity.items.map((item) => `<tr><td>${item.type}</td><td>${item.subject}</td><td>${item.date || '—'}</td><td><code>${item.hash || item.path || item.label || '—'}</code></td></tr>`).join('')
    : '<tr><td colspan="4">No recent activity found yet.</td></tr>';

  res.send(layout('Mission Control — Activity', `
    <div class="top"><div><h1>Recent Activity</h1><div class="muted">A stitched-together feed of recent commits, journals, projects, and scheduled work.</div></div></div>
    <div class="grid">
      <div class="card"><div class="label">Recent items</div><div class="stat">${activity.items.length}</div></div>
      <div class="card"><div class="label">Commits sampled</div><div class="stat">${activity.commitsCount}</div></div>
      <div class="card"><div class="label">Journals known</div><div class="stat">${activity.journalsCount}</div></div>
      <div class="card"><div class="label">Projects known</div><div class="stat">${activity.projectsCount}</div></div>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Type</th><th>Event</th><th>When</th><th>Ref</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
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
      <div class="card">
        <div class="label">Current session</div>
        <div style="margin-top:10px; display:grid; gap:8px; font-size:14px;">
          <div><strong>Time:</strong> ${status.time || '—'}</div>
          <div><strong>Model:</strong> ${status.model || '—'}</div>
          <div><strong>Session:</strong> ${status.session || '—'}</div>
          <div><strong>Runtime:</strong> ${status.runtime || '—'}</div>
          <div><strong>Activation:</strong> ${status.activation || '—'}</div>
          <div><strong>Usage:</strong> ${status.usage || '—'}</div>
        </div>
      </div>
      <div class="card">
        <div class="label">Memory pointers</div>
        <div style="margin-top:10px; display:grid; gap:8px; font-size:14px;">
          <div><strong>Latest journal:</strong> ${context.recentJournal ? context.recentJournal.name : '—'}</div>
          <div><strong>Journal path:</strong> <code>${context.recentJournal ? context.recentJournal.path : '—'}</code></div>
          <div><strong>Long-term memory:</strong> <code>${context.longTermMemoryPath}</code></div>
          <div><strong>Total journals:</strong> ${context.memory.files.length}</div>
        </div>
      </div>
      <div class="card">
        <div class="label">Likely current focus</div>
        <ul>${context.focusAreas.map((item) => `<li>${item}</li>`).join('')}</ul>
      </div>
      <div class="card">
        <div class="label">Active project signal</div>
        <div style="margin-top:10px; display:grid; gap:8px; font-size:14px;">
          <div><strong>Most recent project:</strong> ${context.activeProject ? context.activeProject.name : 'None yet'}</div>
          <div><strong>Path:</strong> <code>${context.activeProject ? context.activeProject.path : '—'}</code></div>
          <div><strong>Description:</strong> ${context.activeProject ? context.activeProject.description : 'No project folders have been picked up yet.'}</div>
        </div>
      </div>
    </div>
    <div class="grid">
      <div class="panel">
        <div class="label">Recent journal snippet</div>
        <pre>${context.journalSnippet || 'No recent journal snippet available yet.'}</pre>
      </div>
      <div class="panel">
        <div class="label">Long-term memory snippet</div>
        <pre>${context.longTermSnippet || 'No long-term memory snippet available yet.'}</pre>
      </div>
    </div>
    <div class="panel">
      <div class="label">Raw OpenClaw status</div>
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
  const cards = team.agents.map((agent) => `
    <div class="card">
      <div class="label">${agent.role}</div>
      <div class="stat" style="font-size:24px">${agent.name}</div>
      <ul>${agent.responsibilities.map((r) => `<li>${r}</li>`).join('')}</ul>
    </div>`).join('');
  res.send(layout('Mission Control — Team', `
    <div class="top"><div><h1>Team</h1><div class="muted">Current active team model. Tiny, but handsome.</div></div></div>
    <div class="grid">${cards}</div>
    <div class="panel">
      <div class="label">OpenClaw status source</div>
      <pre>${team.raw}</pre>
    </div>
  `, '/team'));
});

app.listen(PORT, () => {
  console.log(`Mission Control listening on http://127.0.0.1:${PORT}`);
});

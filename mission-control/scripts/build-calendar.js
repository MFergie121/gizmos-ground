const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = '/Users/maxfergie/gizmos-ground';

function run(cmd) {
  return execSync(cmd, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function esc(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function parseCronList(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const dividerIdx = lines.findIndex((l) => /^-+\s*$/.test(l));
  const headerLine = dividerIdx > 0 ? lines[dividerIdx - 1] : lines[0];
  const dataLines = dividerIdx >= 0 ? lines.slice(dividerIdx + 1) : lines.slice(1);

  const starts = [];
  let inWord = false;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    const isSpace = ch === ' ';
    if (!isSpace && !inWord) {
      starts.push(i);
      inWord = true;
    } else if (isSpace) {
      inWord = false;
    }
  }
  starts.push(headerLine.length);

  const cols = [];
  for (let i = 0; i < starts.length - 1; i++) {
    const start = starts[i];
    const end = starts[i + 1];
    cols.push({ name: headerLine.slice(start, end).trim(), start, end });
  }

  return dataLines.map((line) => {
    const row = {};
    for (const col of cols) row[col.name] = line.slice(col.start, col.end).trim();
    return row;
  }).filter((row) => row['ID']);
}

function build() {
  let cronText = '';
  try {
    cronText = run('openclaw cron list');
  } catch (err) {
    cronText = `ERROR\n${err.stderr || err.message}`;
  }

  const jobs = parseCronList(cronText);
  const generatedAt = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  const rows = jobs.length
    ? jobs.map((job) => `
      <tr>
        <td><code>${esc(job['ID'])}</code></td>
        <td>${esc(job['Name'])}</td>
        <td>${esc(job['Schedule'])}</td>
        <td>${esc(job['Next'])}</td>
        <td>${esc(job['Last'])}</td>
        <td><span class="pill ${esc((job['Status'] || '').toLowerCase())}">${esc(job['Status'])}</span></td>
        <td>${esc(job['Target'])}</td>
        <td>${esc(job['Agent ID'])}</td>
        <td>${esc(job['Model'])}</td>
      </tr>`).join('')
    : '<tr><td colspan="9">No cron jobs found yet. Once jobs exist, they’ll appear here.</td></tr>';

  const upcoming = jobs.map((job) => `
    <div class="card">
      <div class="card-title">${esc(job['Name'])}</div>
      <div class="meta"><strong>Next:</strong> ${esc(job['Next'])}</div>
      <div class="meta"><strong>Schedule:</strong> ${esc(job['Schedule'])}</div>
      <div class="meta"><strong>Status:</strong> ${esc(job['Status'])}</div>
      <div class="meta"><strong>Target:</strong> ${esc(job['Target'])}</div>
    </div>`).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mission Control — Schedule</title>
  <style>
    :root {
      --bg: #0f172a;
      --panel: #111827;
      --panel2: #1f2937;
      --text: #e5e7eb;
      --muted: #9ca3af;
      --line: #374151;
      --ok: #10b981;
      --idle: #6b7280;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
      background: linear-gradient(180deg, #0b1220 0%, var(--bg) 100%);
      color: var(--text);
      padding: 24px;
    }
    .wrap { max-width: 1200px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 34px; }
    .sub { color: var(--muted); margin-bottom: 24px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card, .panel {
      background: rgba(17,24,39,0.9);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.25);
    }
    .stat { font-size: 28px; font-weight: 700; margin-top: 6px; }
    .label { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: .08em; }
    .card-title { font-weight: 700; margin-bottom: 8px; }
    .meta { color: var(--muted); font-size: 14px; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 12px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    .pill {
      display: inline-block;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
      background: var(--panel2);
      border: 1px solid var(--line);
    }
    .pill.ok { color: #a7f3d0; border-color: rgba(16,185,129,0.35); background: rgba(16,185,129,0.15); }
    .pill.idle { color: #d1d5db; }
    .topbar {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .note { color: var(--muted); font-size: 13px; }
    code { color: #bfdbfe; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <div>
        <h1>Mission Control — Schedule</h1>
        <div class="sub">Calendar and scheduled task showcase for Gizmo’s cron-driven work.</div>
      </div>
      <div class="note">Generated: ${esc(generatedAt)}</div>
    </div>

    <div class="grid">
      <div class="card"><div class="label">Total scheduled jobs</div><div class="stat">${jobs.length}</div></div>
      <div class="card"><div class="label">Active / OK</div><div class="stat">${jobs.filter(j => (j['Status'] || '').toLowerCase() === 'ok').length}</div></div>
      <div class="card"><div class="label">Idle</div><div class="stat">${jobs.filter(j => (j['Status'] || '').toLowerCase() === 'idle').length}</div></div>
      <div class="card"><div class="label">Primary timezone</div><div class="stat" style="font-size:20px">Australia/Melbourne</div></div>
    </div>

    <div class="grid">${upcoming || '<div class="card">No upcoming jobs yet.</div>'}</div>

    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>ID</th><th>Name</th><th>Schedule</th><th>Next</th><th>Last</th><th>Status</th><th>Target</th><th>Agent</th><th>Model</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

  const out = path.join(REPO_ROOT, 'mission-control/calendar/index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`Wrote ${out}`);
}

build();

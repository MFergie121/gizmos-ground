const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'mission-control.sqlite');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function connectDb() {
  ensureDataDir();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      repo_path TEXT NOT NULL,
      github_url TEXT,
      discord_channel_id TEXT,
      discord_channel_name TEXT,
      project_memory_path TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      current_stage_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL,
      label TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT,
      ended_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, stage_key)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      stage_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'normal',
      assigned_role_slug TEXT,
      assigned_formal_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT,
      ended_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS role_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      role_slug TEXT NOT NULL,
      formal_name TEXT NOT NULL,
      assignment_status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      task_id INTEGER,
      stage_id INTEGER,
      event_type TEXT NOT NULL,
      role_slug TEXT,
      message TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
      FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      task_id INTEGER,
      role_slug TEXT,
      source TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pipeline_stages_project_id ON pipeline_stages(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_stage_id ON tasks(stage_id);
    CREATE INDEX IF NOT EXISTS idx_role_assignments_task_id ON role_assignments(task_id);
    CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id);
    CREATE INDEX IF NOT EXISTS idx_logs_project_id ON logs(project_id);
  `);
}

const DEFAULT_STAGES = [
  ['product-framing', 'Product framing'],
  ['tech-planning', 'Tech planning'],
  ['design-review', 'Design review'],
  ['implementation', 'Implementation'],
  ['qa', 'QA'],
  ['security-review', 'Security review'],
  ['release-prep', 'Release prep'],
  ['shipped', 'Shipped'],
  ['retro', 'Retro'],
];

function seedProject(db, project) {
  const insertProject = db.prepare(`
    INSERT INTO projects (slug, name, repo_path, github_url, discord_channel_id, discord_channel_name, project_memory_path, status)
    VALUES (@slug, @name, @repo_path, @github_url, @discord_channel_id, @discord_channel_name, @project_memory_path, @status)
    ON CONFLICT(slug) DO UPDATE SET
      name=excluded.name,
      repo_path=excluded.repo_path,
      github_url=excluded.github_url,
      discord_channel_id=excluded.discord_channel_id,
      discord_channel_name=excluded.discord_channel_name,
      project_memory_path=excluded.project_memory_path,
      status=excluded.status,
      updated_at=CURRENT_TIMESTAMP
  `);

  insertProject.run(project);

  const projectRow = db.prepare('SELECT id FROM projects WHERE slug = ?').get(project.slug);
  if (!projectRow) return null;

  const insertStage = db.prepare(`
    INSERT INTO pipeline_stages (project_id, stage_key, label, order_index, status)
    VALUES (?, ?, ?, ?, 'pending')
    ON CONFLICT(project_id, stage_key) DO NOTHING
  `);

  DEFAULT_STAGES.forEach(([stageKey, label], index) => {
    insertStage.run(projectRow.id, stageKey, label, index + 1);
  });

  const currentStage = db.prepare(`
    SELECT id FROM pipeline_stages
    WHERE project_id = ? AND stage_key = 'implementation'
    LIMIT 1
  `).get(projectRow.id);

  if (currentStage) {
    db.prepare(`
      UPDATE projects
      SET current_stage_id = COALESCE(current_stage_id, ?), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(currentStage.id, projectRow.id);

    db.prepare(`
      UPDATE pipeline_stages
      SET status = CASE WHEN stage_key = 'implementation' THEN 'active' ELSE status END,
          started_at = CASE WHEN stage_key = 'implementation' AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE project_id = ?
    `).run(projectRow.id);
  }

  return projectRow.id;
}

function seedInitialData(db, options = {}) {
  const projectId = seedProject(db, {
    slug: 'mission-control',
    name: 'Mission Control',
    repo_path: options.repoPath || '/Users/maxfergie/gizmos-ground',
    github_url: 'https://github.com/MFergie121/gizmos-ground',
    discord_channel_id: '1487087668876808294',
    discord_channel_name: '#mission-control',
    project_memory_path: path.join(options.repoPath || '/Users/maxfergie/gizmos-ground', 'mission-control/PROJECT_MEMORY.md'),
    status: 'active',
  });

  if (!projectId) return;

  const activeStage = db.prepare(`
    SELECT id FROM pipeline_stages
    WHERE project_id = ? AND stage_key = 'implementation'
    LIMIT 1
  `).get(projectId);

  if (!activeStage) return;

  const existingTasks = db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE project_id = ?').get(projectId);
  if (existingTasks.count > 0) return;

  const taskRows = [
    ['Improve Mission Control UI polish', 'Apply interface polish, hover states, stronger hierarchy, and branding.', 'active', 'high', 'ui-ux-designer', 'Rosie UI/UX Designer'],
    ['Implement SQL data backbone', 'Create SQLite schema and persistence layer for projects, stages, tasks, events, and logs.', 'active', 'high', 'database-engineer', 'Hamfast Database Engineer'],
    ['Plan real-time pipeline model', 'Refine the live pipeline/state architecture for Mission Control v2.', 'active', 'normal', 'tech-lead', 'Peregrin Tech Lead'],
  ];

  const insertTask = db.prepare(`
    INSERT INTO tasks (project_id, stage_id, title, description, status, priority, assigned_role_slug, assigned_formal_name, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const insertAssignment = db.prepare(`
    INSERT INTO role_assignments (project_id, task_id, role_slug, formal_name, assignment_status)
    VALUES (?, ?, ?, ?, 'active')
  `);

  const insertEvent = db.prepare(`
    INSERT INTO events (project_id, task_id, stage_id, event_type, role_slug, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertLog = db.prepare(`
    INSERT INTO logs (project_id, task_id, role_slug, source, level, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  taskRows.forEach(([title, description, status, priority, roleSlug, formalName]) => {
    const result = insertTask.run(projectId, activeStage.id, title, description, status, priority, roleSlug, formalName);
    insertAssignment.run(projectId, result.lastInsertRowid, roleSlug, formalName);
    insertEvent.run(projectId, result.lastInsertRowid, activeStage.id, 'task.created', roleSlug, `${formalName} picked up task: ${title}`);
    insertLog.run(projectId, result.lastInsertRowid, roleSlug, 'mission-control', 'info', `Seeded task for ${formalName}: ${title}`);
  });
}

function getDbSummary(db) {
  return {
    projects: db.prepare('SELECT COUNT(*) AS count FROM projects').get().count,
    stages: db.prepare('SELECT COUNT(*) AS count FROM pipeline_stages').get().count,
    tasks: db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count,
    events: db.prepare('SELECT COUNT(*) AS count FROM events').get().count,
    logs: db.prepare('SELECT COUNT(*) AS count FROM logs').get().count,
    path: DB_PATH,
  };
}

function getProjectsWithState(db) {
  const projects = db.prepare(`
    SELECT p.id, p.slug, p.name, p.repo_path, p.github_url, p.discord_channel_id, p.discord_channel_name,
           p.project_memory_path, p.status, p.updated_at,
           ps.stage_key AS current_stage_key, ps.label AS current_stage_label
    FROM projects p
    LEFT JOIN pipeline_stages ps ON ps.id = p.current_stage_id
    ORDER BY p.updated_at DESC
  `).all();

  return projects.map((project) => {
    const stages = db.prepare(`
      SELECT id, stage_key, label, order_index, status, started_at, ended_at, updated_at
      FROM pipeline_stages
      WHERE project_id = ?
      ORDER BY order_index ASC
    `).all(project.id);

    const activeStage = stages.find((stage) => stage.status === 'active') || stages.find((stage) => stage.stage_key === project.current_stage_key) || null;

    const tasks = db.prepare(`
      SELECT id, title, description, status, priority, assigned_role_slug, assigned_formal_name, created_at, updated_at, started_at, ended_at
      FROM tasks
      WHERE project_id = ?
      ORDER BY CASE status
        WHEN 'active' THEN 0
        WHEN 'blocked' THEN 1
        WHEN 'todo' THEN 2
        WHEN 'done' THEN 3
        ELSE 4
      END, updated_at DESC
    `).all(project.id);

    const activeTasks = activeStage
      ? db.prepare(`
          SELECT id, title, description, status, priority, assigned_role_slug, assigned_formal_name, created_at, updated_at, started_at, ended_at
          FROM tasks
          WHERE project_id = ? AND stage_id = ?
          ORDER BY CASE status
            WHEN 'active' THEN 0
            WHEN 'blocked' THEN 1
            WHEN 'todo' THEN 2
            WHEN 'done' THEN 3
            ELSE 4
          END, updated_at DESC
        `).all(project.id, activeStage.id)
      : [];

    const events = db.prepare(`
      SELECT id, event_type, role_slug, message, created_at
      FROM events
      WHERE project_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 12
    `).all(project.id);

    const logs = db.prepare(`
      SELECT id, role_slug, source, level, message, timestamp
      FROM logs
      WHERE project_id = ?
      ORDER BY datetime(timestamp) DESC, id DESC
      LIMIT 20
    `).all(project.id);

    return {
      ...project,
      stages,
      tasks,
      activeStage,
      activeTasks,
      events,
      logs,
    };
  });
}

function getProjectDetail(db, slug) {
  const projects = getProjectsWithState(db);
  return projects.find((project) => project.slug === slug) || null;
}

function getTeamAssignments(db) {
  const assignments = db.prepare(`
    SELECT ra.role_slug, ra.formal_name, ra.assignment_status, ra.started_at,
           t.title AS task_title, t.status AS task_status,
           p.slug AS project_slug, p.name AS project_name,
           ps.label AS stage_label
    FROM role_assignments ra
    JOIN tasks t ON t.id = ra.task_id
    JOIN projects p ON p.id = ra.project_id
    LEFT JOIN pipeline_stages ps ON ps.id = t.stage_id
    WHERE ra.assignment_status = 'active'
    ORDER BY datetime(ra.started_at) DESC, ra.id DESC
  `).all();

  const byRole = new Map();
  assignments.forEach((row) => {
    if (!byRole.has(row.role_slug)) {
      byRole.set(row.role_slug, row);
    }
  });

  return Array.from(byRole.values());
}

function appendLog(db, { projectSlug, roleSlug = null, taskId = null, source = 'mission-control', level = 'info', message }) {
  const project = db.prepare('SELECT id FROM projects WHERE slug = ?').get(projectSlug);
  if (!project) return;

  db.prepare(`
    INSERT INTO logs (project_id, task_id, role_slug, source, level, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(project.id, taskId, roleSlug, source, level, message);
}

function initDatabase(options = {}) {
  const db = connectDb();
  migrate(db);
  seedInitialData(db, options);
  return { db, summary: getDbSummary(db), path: DB_PATH };
}

module.exports = {
  DB_PATH,
  DEFAULT_STAGES,
  appendLog,
  getProjectDetail,
  getProjectsWithState,
  getTeamAssignments,
  initDatabase,
};

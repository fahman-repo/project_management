'use strict';

const { query, queryOne, execute } = require('../config/database');
const { buildOrderBy, paginatedQuery } = require('./base');
const dayjs = require('dayjs');
const { DEFAULT_PROJECT_STATUSES } = require('../config/constants');

const PROJECT_FIELDS = `p.id, p.code, p.name, p.description, p.status, p.priority, p.progress,
       p.color, p.budget, p.start_date, p.end_date, p.manager_id, p.created_by, p.template_id,
       p.created_at, p.updated_at`;

const PROJECT_ENRICHED_FIELDS = `${PROJECT_FIELDS},
       u.name AS manager_name, u.avatar AS manager_avatar,
       (SELECT COUNT(*) FROM project_members pm_c WHERE pm_c.project_id = p.id) AS member_count,
       (SELECT COUNT(*) FROM tasks t_c WHERE t_c.project_id = p.id) AS task_count,
       (SELECT COUNT(*) FROM tasks t_d WHERE t_d.project_id = p.id AND t_d.status = 'done') AS completed_task_count,
       ((SELECT IFNULL(SUM(t_ac.actual_cost), 0) FROM tasks t_ac WHERE t_ac.project_id = p.id) +
        (SELECT IFNULL(SUM(pe_dir.amount), 0) FROM project_expenses pe_dir WHERE pe_dir.project_id = p.id AND pe_dir.task_id IS NULL)) AS actual_cost,
       (SELECT IFNULL(SUM(t_ec.estimated_cost), 0) FROM tasks t_ec WHERE t_ec.project_id = p.id) AS total_estimated_cost`;

/** Whitelist of sortable project columns - never interpolate user input. */
const SORTABLE_COLUMNS = {
  name: 'p.name',
  code: 'p.code',
  status: 'p.status',
  priority: 'p.priority',
  progress: 'p.progress',
  start_date: 'p.start_date',
  end_date: 'p.end_date',
  created_at: 'p.created_at',
};

/** Projects a user may see: the ones they belong to plus the ones they manage. */
const PROJECT_ACCESS_SQL = `(p.id IN (SELECT pm_a.project_id FROM project_members pm_a WHERE pm_a.user_id = ?)
       OR p.manager_id = ?)`;

/** Same restriction expressed on the `tasks` alias. */
const TASK_ACCESS_SQL = `(t.project_id IN (SELECT pm_a.project_id FROM project_members pm_a WHERE pm_a.user_id = ?)
       OR t.project_id IN (SELECT p_a.id FROM projects p_a WHERE p_a.manager_id = ?))`;

/**
 * Build a WHERE clause where a condition may bind several values.
 * `buildWhere` from `./base` only supports one value per condition, so this
 * variant keeps the multi-value conditions used by the access filters.
 *
 * @param {Array<{sql:string, values:any[]}>} conditions
 * @returns {{whereSql:string, params:any[]}}
 */
function buildConditions(conditions = []) {
  const active = conditions.filter((condition) => condition.values && condition.values.length);
  if (!active.length) return { whereSql: '', params: [] };
  return {
    whereSql: `WHERE ${active.map((condition) => condition.sql).join(' AND ')}`,
    params: active.flatMap((condition) => condition.values),
  };
}

/**
 * Build the ORDER BY clause for project listings.
 * @param {string} sort
 * @param {string} direction 'asc' | 'desc'
 * @returns {string}
 */
function projectOrderBy(sort, direction) {
  const field = Object.prototype.hasOwnProperty.call(SORTABLE_COLUMNS, sort) ? sort : 'created_at';
  const dir = String(direction).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const sortMap = { [field]: `${SORTABLE_COLUMNS[field]} ${dir}` };
  return buildOrderBy(sortMap, field, field).sql;
}

/**
 * List projects with the filters used by the project index page.
 *
 * @param {object} options
 * @param {string} [options.search]
 * @param {string} [options.status]
 * @param {string} [options.priority]
 * @param {number} [options.managerId]
 * @param {number} [options.memberId]
 * @param {boolean} [options.mine]
 * @param {number} options.viewerId
 * @param {boolean} options.isAdmin
 * @param {string} [options.sort]
 * @param {string} [options.direction]
 * @param {number} options.limit
 * @param {number} options.offset
 */
async function listProjects(options = {}) {
  const {
    search,
    status,
    priority,
    managerId,
    memberId,
    mine = false,
    viewerId,
    isAdmin = false,
    sort = 'created_at',
    direction = 'desc',
    limit = 10,
    offset = 0,
  } = options;

  const conditions = [
    {
      sql: '(p.name LIKE ? OR p.code LIKE ? OR p.description LIKE ?)',
      values: search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [],
    },
    { sql: 'p.status = ?', values: status ? [status] : [] },
    { sql: 'p.priority = ?', values: priority ? [priority] : [] },
    { sql: 'p.manager_id = ?', values: managerId ? [managerId] : [] },
    {
      sql: 'p.id IN (SELECT pm_f.project_id FROM project_members pm_f WHERE pm_f.user_id = ?)',
      values: memberId ? [memberId] : [],
    },
  ];

  // Admins see everything unless they explicitly ask for "mine".
  if (mine || !isAdmin) {
    conditions.push({ sql: PROJECT_ACCESS_SQL, values: [viewerId, viewerId] });
  }

  const { whereSql, params } = buildConditions(conditions);

  const result = await paginatedQuery(
    `SELECT ${PROJECT_ENRICHED_FIELDS}
       FROM projects p
       LEFT JOIN users u ON u.id = p.manager_id
       ${whereSql}
       ${projectOrderBy(sort, direction)}`,
    `SELECT COUNT(*) AS total FROM projects p ${whereSql}`,
    params,
    { limit, offset }
  );

  return {
    ...result,
    rows: result.rows.map((row) => ({
      ...row,
      budget: row.budget !== null && row.budget !== undefined ? Number(row.budget) : 0,
      actual_cost: Number(row.actual_cost || 0),
      total_estimated_cost: Number(row.total_estimated_cost || 0),
    })),
  };
}

/**
 * @param {number} id
 */
async function findById(id) {
  return queryOne(`SELECT ${PROJECT_FIELDS} FROM projects p WHERE p.id = ? LIMIT 1`, [id]);
}

/**
 * Project row joined with its manager.
 * @param {number} id
 */
async function findByIdWithManager(id) {
  return queryOne(
    `SELECT ${PROJECT_FIELDS},
            u.name AS manager_name, u.email AS manager_email,
            u.avatar AS manager_avatar, u.job_title AS manager_job_title
       FROM projects p
       LEFT JOIN users u ON u.id = p.manager_id
      WHERE p.id = ? LIMIT 1`,
    [id]
  );
}

/**
 * @param {string} code
 */
async function findByCode(code) {
  return queryOne('SELECT id, code, name FROM projects WHERE code = ? LIMIT 1', [code]);
}

/**
 * Build a unique project code of the form `PRJ-<year>-<sequence>`.
 * The sequence starts at the number of existing projects plus one and is
 * incremented until an unused code is found.
 * @returns {Promise<string>}
 */
async function generateProjectCode() {
  const year = dayjs().format('YYYY');
  const row = await queryOne('SELECT COUNT(*) AS total FROM projects');
  let sequence = Number(row && row.total ? row.total : 0) + 1;

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const code = `PRJ-${year}-${String(sequence).padStart(3, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const existing = await queryOne('SELECT id FROM projects WHERE code = ? LIMIT 1', [code]);
    if (!existing) return code;
    sequence += 1;
  }

  throw new Error('Tidak dapat membuat kode proyek yang unik');
}

/**
 * @param {object} data
 * @returns {Promise<{id:number, code:string}>} the new project
 */
async function createProject(data) {
  const {
    code,
    name,
    description = null,
    status = 'planning',
    priority = 'medium',
    color = '#4f46e5',
    budget = null,
    start_date = null,
    end_date = null,
    manager_id = null,
    created_by = null,
    template_id = null,
  } = data;

  const result = await execute(
    `INSERT INTO projects
       (code, name, description, status, priority, color, budget, start_date, end_date, manager_id, created_by, template_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      name,
      description,
      status,
      priority,
      color,
      budget,
      start_date,
      end_date,
      manager_id,
      created_by,
      template_id,
    ]
  );

  return { id: result.insertId, code };
}

const UPDATABLE_FIELDS = [
  'name',
  'description',
  'status',
  'priority',
  'color',
  'budget',
  'start_date',
  'end_date',
  'manager_id',
];

/**
 * @param {number} id
 * @param {object} data only the whitelisted fields are written
 */
async function updateProject(id, data) {
  const fields = [];
  const params = [];

  for (const key of UPDATABLE_FIELDS) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(data[key]);
    }
  }

  if (!fields.length) return 0;

  params.push(id);
  const result = await execute(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, params);
  return result.affectedRows;
}

/**
 * @param {number} id
 */
async function deleteProject(id) {
  const result = await execute('DELETE FROM projects WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

// ---------------------------------------------------------------------------
// project_members
// ---------------------------------------------------------------------------

/**
 * @param {number} projectId
 */
async function listMembers(projectId) {
  return query(
    `SELECT pm.user_id, pm.role, pm.joined_at,
            u.id, u.name, u.email, u.avatar, u.job_title
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
      ORDER BY pm.id ASC`,
    [projectId]
  );
}

/**
 * @param {number} projectId
 * @param {number} userId
 */
async function findMember(projectId, userId) {
  return queryOne(
    'SELECT id, project_id, user_id, role, joined_at FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1',
    [projectId, userId]
  );
}

/**
 * @param {number} projectId
 * @param {number} userId
 * @param {string} role
 */
async function addMember(projectId, userId, role) {
  const result = await execute(
    'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
    [projectId, userId, role]
  );
  return result.insertId;
}

/**
 * @param {number} projectId
 * @param {number} userId
 * @param {string} role
 */
async function updateMemberRole(projectId, userId, role) {
  const result = await execute(
    'UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?',
    [role, projectId, userId]
  );
  return result.affectedRows > 0;
}

/**
 * @param {number} projectId
 * @param {number} userId
 */
async function removeMember(projectId, userId) {
  const result = await execute('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [
    projectId,
    userId,
  ]);
  return result.affectedRows > 0;
}

/**
 * @param {number} projectId
 */
async function countOwners(projectId) {
  const row = await queryOne(
    "SELECT COUNT(*) AS total FROM project_members WHERE project_id = ? AND role = 'owner'",
    [projectId]
  );
  return Number(row && row.total ? row.total : 0);
}

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

/**
 * Task / member counters of a single project.
 * @param {number} projectId
 */
async function getProjectStats(projectId) {
  const row = await queryOne(
    `SELECT
       (SELECT COUNT(*) FROM tasks WHERE project_id = ?) AS task_count,
       (SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status = 'done') AS completed_task_count,
       (SELECT COUNT(*) FROM tasks
         WHERE project_id = ? AND due_date IS NOT NULL AND due_date < CURDATE() AND status <> 'done') AS overdue_count,
       (SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status = 'in_progress') AS in_progress_count,
       (SELECT COUNT(*) FROM project_members WHERE project_id = ?) AS member_count,
       (SELECT COUNT(*) FROM milestones WHERE project_id = ?) AS milestone_count,
       (SELECT IFNULL(SUM(estimated_cost), 0) FROM tasks WHERE project_id = ?) AS total_task_estimated_cost,
       (SELECT IFNULL(SUM(actual_cost), 0) FROM tasks WHERE project_id = ?) AS total_task_actual_cost,
       (SELECT IFNULL(SUM(amount), 0) FROM project_expenses WHERE project_id = ? AND task_id IS NULL) AS total_direct_expenses,
       (SELECT IFNULL(SUM(amount), 0) FROM project_expenses WHERE project_id = ?) AS total_expenses,
       (SELECT budget FROM projects WHERE id = ?) AS budget`,
    [projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId]
  );

  const budget = Number(row.budget || 0);
  const taskEstCost = Number(row.total_task_estimated_cost || 0);
  const taskActCost = Number(row.total_task_actual_cost || 0);
  const directExpenses = Number(row.total_direct_expenses || 0);
  const totalExpenses = Number(row.total_expenses || 0);
  const actualCost = taskActCost + directExpenses;
  const remainingBudget = budget > 0 ? (budget - actualCost) : 0;
  const budgetUsagePercent = budget > 0 ? Math.round((actualCost / budget) * 100 * 10) / 10 : 0;

  return {
    task_count: Number(row.task_count),
    completed_task_count: Number(row.completed_task_count),
    overdue_count: Number(row.overdue_count),
    in_progress_count: Number(row.in_progress_count),
    member_count: Number(row.member_count),
    milestone_count: Number(row.milestone_count),
    budget,
    total_estimated_cost: taskEstCost,
    total_task_actual_cost: taskActCost,
    total_direct_expenses: directExpenses,
    total_expenses: totalExpenses,
    actual_cost: actualCost,
    remaining_budget: remainingBudget,
    budget_usage_percent: budgetUsagePercent,
  };
}

/**
 * Lightweight counters for the topbar.
 * @param {object} options
 * @param {number} options.viewerId
 * @param {boolean} options.isAdmin
 */
async function getSummary(options = {}) {
  const { viewerId, isAdmin = false } = options;

  const projectScope = isAdmin ? { sql: '1 = 1', values: [] } : { sql: PROJECT_ACCESS_SQL, values: [viewerId, viewerId] };
  const taskScope = isAdmin ? { sql: '1 = 1', values: [] } : { sql: TASK_ACCESS_SQL, values: [viewerId, viewerId] };

  const params = [
    ...projectScope.values,
    ...projectScope.values,
    ...taskScope.values,
    ...taskScope.values,
  ];

  const row = await queryOne(
    `SELECT
       (SELECT COUNT(*) FROM projects p WHERE ${projectScope.sql}) AS total_projects,
       (SELECT COUNT(*) FROM projects p WHERE p.status = 'active' AND ${projectScope.sql}) AS active_projects,
       (SELECT COUNT(*) FROM tasks t WHERE ${taskScope.sql}) AS total_tasks,
       (SELECT COUNT(*) FROM tasks t
          WHERE t.due_date IS NOT NULL AND t.due_date < CURDATE() AND t.status <> 'done' AND ${taskScope.sql}) AS overdue_tasks`,
    params
  );

  return {
    total_projects: Number(row.total_projects),
    active_projects: Number(row.active_projects),
    total_tasks: Number(row.total_tasks),
    overdue_tasks: Number(row.overdue_tasks),
  };
}

/**
 * Task status distribution of a project.
 * @param {number} projectId
 */
async function taskStatusDistribution(projectId) {
  const rows = await query(
    'SELECT status, COUNT(*) AS total FROM tasks WHERE project_id = ? GROUP BY status',
    [projectId]
  );
  return rows.map((row) => ({ status: row.status, total: Number(row.total) }));
}

/**
 * Task priority distribution of a project.
 * @param {number} projectId
 */
async function taskPriorityDistribution(projectId) {
  const rows = await query(
    'SELECT priority, COUNT(*) AS total FROM tasks WHERE project_id = ? GROUP BY priority',
    [projectId]
  );
  return rows.map((row) => ({ priority: row.priority, total: Number(row.total) }));
}

/**
 * Start of the ISO week (Monday) that contains the given date.
 * @param {import('dayjs').Dayjs} value
 */
function startOfWeek(value) {
  const date = value.startOf('day');
  const offset = (date.day() + 6) % 7;
  return date.subtract(offset, 'day');
}

/** Indonesian short month names, used for the weekly trend labels. */
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

/**
 * Format a `YYYY-MM-DD` week start as `DD MMM` (Indonesian months).
 * @param {import('dayjs').Dayjs} value
 */
function formatWeekLabel(value) {
  return `${value.date()} ${MONTH_SHORT[value.month()]}`;
}

/**
 * Weekly completion trend of the last N weeks.
 *
 * MariaDB 10.1 has no window functions, so the bucketing is done in Node from
 * the raw `completed_at` values.
 *
 * @param {number} projectId
 * @param {number} [weeks]
 */
async function weeklyCompletionTrend(projectId, weeks = 8) {
  const rows = await query(
    'SELECT completed_at FROM tasks WHERE project_id = ? AND completed_at IS NOT NULL',
    [projectId]
  );

  const currentWeekStart = startOfWeek(dayjs());
  const buckets = new Map();

  for (let index = weeks - 1; index >= 0; index -= 1) {
    const start = currentWeekStart.subtract(index, 'week');
    const key = start.format('YYYY-MM-DD');
    buckets.set(key, {
      week_start: key,
      label: formatWeekLabel(start),
      completed: 0,
    });
  }

  for (const row of rows) {
    const completedAt = dayjs(row.completed_at);
    if (!completedAt.isValid()) continue;
    const key = startOfWeek(completedAt).format('YYYY-MM-DD');
    const bucket = buckets.get(key);
    if (bucket) bucket.completed += 1;
  }

  return [...buckets.values()];
}

/**
 * The assignees carrying the most tasks in a project.
 * @param {number} projectId
 * @param {number} [limit]
 */
async function topAssignees(projectId, limit = 5) {
  const rows = await query(
    `SELECT u.id, u.name, u.avatar,
            COUNT(t.id) AS total_tasks,
            SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS completed_tasks
       FROM tasks t
       JOIN users u ON u.id = t.assignee_id
      WHERE t.project_id = ? AND t.assignee_id IS NOT NULL
      GROUP BY u.id, u.name, u.avatar
      ORDER BY total_tasks DESC, u.name ASC
      LIMIT ?`,
    [projectId, Number(limit)]
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    total_tasks: Number(row.total_tasks),
    completed_tasks: Number(row.completed_tasks),
  }));
}

// ---------------------------------------------------------------------------
// milestones
// ---------------------------------------------------------------------------

const MILESTONE_FIELDS = `m.id, m.project_id, m.name, m.description, m.due_date, m.status,
       m.progress, m.created_by, m.created_at, m.updated_at`;

/**
 * List milestones, optionally filtered by project, status and due-date window.
 *
 * @param {object} options
 * @param {number} [options.projectId]
 * @param {string} [options.status]
 * @param {string} [options.from]
 * @param {string} [options.to]
 * @param {number} [options.limit]
 * @param {number} options.viewerId
 * @param {boolean} options.isAdmin
 */
async function listMilestones(options = {}) {
  const { projectId, status, from, to, limit = 200, viewerId, isAdmin = false } = options;

  const conditions = [
    { sql: 'm.project_id = ?', values: projectId ? [projectId] : [] },
    { sql: 'm.status = ?', values: status ? [status] : [] },
    { sql: 'm.due_date IS NOT NULL AND m.due_date >= ?', values: from ? [from] : [] },
    { sql: 'm.due_date IS NOT NULL AND m.due_date <= ?', values: to ? [to] : [] },
  ];

  if (!isAdmin) {
    conditions.push({
      sql: `(m.project_id IN (SELECT pm_a.project_id FROM project_members pm_a WHERE pm_a.user_id = ?)
             OR m.project_id IN (SELECT p_a.id FROM projects p_a WHERE p_a.manager_id = ?))`,
      values: [viewerId, viewerId],
    });
  }

  const { whereSql, params } = buildConditions(conditions);

  const rows = await query(
    `SELECT ${MILESTONE_FIELDS}
       FROM milestones m
       ${whereSql}
       ORDER BY m.due_date IS NULL ASC, m.due_date ASC, m.id ASC
       LIMIT ?`,
    [...params, Number(limit)]
  );

  return rows;
}

/**
 * @param {number} id
 */
async function findMilestoneById(id) {
  return queryOne(`SELECT ${MILESTONE_FIELDS} FROM milestones m WHERE m.id = ? LIMIT 1`, [id]);
}

/**
 * @param {object} data
 * @returns {Promise<number>} the new milestone id
 */
async function createMilestone(data) {
  const {
    project_id,
    name,
    description = null,
    due_date = null,
    status = 'planned',
    progress = 0,
    created_by = null,
    template_id = null,
  } = data;

  const result = await execute(
    `INSERT INTO milestones (project_id, name, description, due_date, status, progress, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [project_id, name, description, due_date, status, progress, created_by]
  );

  return result.insertId;
}

const MILESTONE_UPDATABLE_FIELDS = ['name', 'description', 'due_date', 'status', 'progress'];

/**
 * @param {number} id
 * @param {object} data
 */
async function updateMilestone(id, data) {
  const fields = [];
  const params = [];

  for (const key of MILESTONE_UPDATABLE_FIELDS) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(data[key]);
    }
  }

  if (!fields.length) return 0;

  params.push(id);
  const result = await execute(`UPDATE milestones SET ${fields.join(', ')} WHERE id = ?`, params);
  return result.affectedRows;
}

/**
 * @param {number} id
 */
async function deleteMilestone(id) {
  const result = await execute('DELETE FROM milestones WHERE id = ?', [id]);
  return result.affectedRows > 0;
}


// ---------------------------------------------------------------------------
// project_statuses
// ---------------------------------------------------------------------------

/**
 * List all kanban/workflow statuses for a project, falling back to defaults.
 * @param {number} projectId
 */
async function listProjectStatuses(projectId) {
  const rows = await query(
    `SELECT id, project_id, key_name, label, color, category, progress, position, created_at, updated_at
       FROM project_statuses
      WHERE project_id = ?
      ORDER BY position ASC, id ASC`,
    [projectId]
  );

  if (rows.length) {
    return rows.map((r) => ({
      ...r,
      key: r.key_name,
      title: r.label,
      progress: Number(r.progress),
      position: Number(r.position),
    }));
  }

  return DEFAULT_PROJECT_STATUSES.map((r) => ({
    id: 0,
    project_id: Number(projectId),
    key: r.key_name,
    key_name: r.key_name,
    title: r.label,
    label: r.label,
    color: r.color,
    category: r.category,
    progress: r.progress,
    position: r.position,
  }));
}

/**
 * Find status by key within a project.
 */
async function findProjectStatusByKey(projectId, keyName) {
  return queryOne(
    `SELECT id, project_id, key_name, label, color, category, progress, position
       FROM project_statuses
      WHERE project_id = ? AND key_name = ? LIMIT 1`,
    [projectId, keyName]
  );
}

/**
 * Find status by its id.
 */
async function findProjectStatusById(statusId) {
  return queryOne(
    `SELECT id, project_id, key_name, label, color, category, progress, position
       FROM project_statuses
      WHERE id = ? LIMIT 1`,
    [statusId]
  );
}

/**
 * Ensure a project has default statuses if none exist.
 */
async function ensureDefaultStatuses(projectId, connection = null) {
  let count = 0;
  if (connection) {
    const [rows] = await connection.query(
      'SELECT COUNT(*) AS total FROM project_statuses WHERE project_id = ?',
      [projectId]
    );
    count = Number(rows[0]?.total || 0);
  } else {
    const row = await queryOne(
      'SELECT COUNT(*) AS total FROM project_statuses WHERE project_id = ?',
      [projectId]
    );
    count = Number(row?.total || 0);
  }

  if (count === 0) {
    for (const s of DEFAULT_PROJECT_STATUSES) {
      if (connection) {
        await connection.execute(
          `INSERT INTO project_statuses (project_id, key_name, label, color, category, progress, position)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [projectId, s.key_name, s.label, s.color, s.category, s.progress, s.position]
        );
      } else {
        await execute(
          `INSERT INTO project_statuses (project_id, key_name, label, color, category, progress, position)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [projectId, s.key_name, s.label, s.color, s.category, s.progress, s.position]
        );
      }
    }
  }
}

/**
 * Create a new custom status for a project.
 */
async function createProjectStatus(projectId, data) {
  const { key_name, label, color = '#64748b', category = 'in_progress', progress = 0 } = data;

  const row = await queryOne(
    'SELECT COALESCE(MAX(position), -1) AS max_pos FROM project_statuses WHERE project_id = ?',
    [projectId]
  );
  const nextPos = Number(row?.max_pos ?? -1) + 1;

  const result = await execute(
    `INSERT INTO project_statuses (project_id, key_name, label, color, category, progress, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [projectId, key_name, label, color, category, progress, nextPos]
  );

  return result.insertId;
}

/**
 * Update an existing status column.
 */
async function updateProjectStatus(projectId, statusId, data) {
  const fields = [];
  const params = [];

  if (data.label !== undefined) {
    fields.push('label = ?');
    params.push(data.label);
  }
  if (data.color !== undefined) {
    fields.push('color = ?');
    params.push(data.color);
  }
  if (data.category !== undefined) {
    fields.push('category = ?');
    params.push(data.category);
  }
  if (data.progress !== undefined) {
    fields.push('progress = ?');
    params.push(Number(data.progress));
  }

  if (!fields.length) return 0;

  params.push(projectId, statusId);
  const result = await execute(
    `UPDATE project_statuses SET ${fields.join(', ')} WHERE project_id = ? AND id = ?`,
    params
  );
  return result.affectedRows;
}

/**
 * Reorder status columns.
 */
async function reorderProjectStatuses(projectId, orderedIds) {
  if (!orderedIds || !orderedIds.length) return 0;

  for (let i = 0; i < orderedIds.length; i += 1) {
    await execute(
      'UPDATE project_statuses SET position = ? WHERE project_id = ? AND id = ?',
      [i, projectId, orderedIds[i]]
    );
  }
  return orderedIds.length;
}

/**
 * Delete a status column, migrating any existing tasks in that column to transferToKey.
 */
async function deleteProjectStatus(projectId, statusId, transferToKey = null) {
  const status = await findProjectStatusById(statusId);
  if (!status || Number(status.project_id) !== Number(projectId)) {
    throw new Error('Status tidak ditemukan di proyek ini');
  }

  if (transferToKey) {
    await execute(
      'UPDATE tasks SET status = ? WHERE project_id = ? AND status = ?',
      [transferToKey, projectId, status.key_name]
    );
  }

  const result = await execute(
    'DELETE FROM project_statuses WHERE project_id = ? AND id = ?',
    [projectId, statusId]
  );
  return result.affectedRows > 0;
}

// ---------------------------------------------------------------------------
// Expenses / Financials
// ---------------------------------------------------------------------------

/**
 * Normalise DECIMAL columns for project expenses.
 */
function normalizeExpense(row) {
  if (!row) return null;
  return {
    ...row,
    amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : 0,
  };
}

/**
 * List expenses for a project with optional filters.
 */
async function listProjectExpenses(projectId, filters = {}) {
  const { category, search, taskId } = filters;
  const conditions = ['pe.project_id = ?'];
  const params = [projectId];

  if (category) {
    conditions.push('pe.category = ?');
    params.push(category);
  }
  if (taskId !== undefined) {
    if (taskId === null || taskId === 'direct') {
      conditions.push('pe.task_id IS NULL');
    } else {
      conditions.push('pe.task_id = ?');
      params.push(taskId);
    }
  }
  if (search) {
    conditions.push('(pe.title LIKE ? OR pe.vendor_name LIKE ? OR pe.receipt_note LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const rows = await query(
    `SELECT pe.id, pe.project_id, pe.task_id, pe.title, pe.category, pe.amount,
            pe.expense_date, pe.vendor_name, pe.receipt_note, pe.created_by,
            pe.created_at, pe.updated_at,
            u.name AS creator_name,
            t.title AS task_title
       FROM project_expenses pe
       LEFT JOIN users u ON u.id = pe.created_by
       LEFT JOIN tasks t ON t.id = pe.task_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY pe.expense_date DESC, pe.id DESC`,
    params
  );
  return rows.map(normalizeExpense);
}

/**
 * Find a single expense by id.
 */
async function findExpenseById(expenseId) {
  const row = await queryOne(
    `SELECT pe.id, pe.project_id, pe.task_id, pe.title, pe.category, pe.amount,
            pe.expense_date, pe.vendor_name, pe.receipt_note, pe.created_by,
            pe.created_at, pe.updated_at,
            u.name AS creator_name,
            t.title AS task_title
       FROM project_expenses pe
       LEFT JOIN users u ON u.id = pe.created_by
       LEFT JOIN tasks t ON t.id = pe.task_id
      WHERE pe.id = ? LIMIT 1`,
    [expenseId]
  );
  return normalizeExpense(row);
}

/**
 * Create a new expense.
 */
async function createProjectExpense(projectId, data, userId) {
  const {
    task_id = null,
    title,
    category = 'other',
    amount = 0,
    expense_date,
    vendor_name = null,
    receipt_note = null,
  } = data;

  const result = await execute(
    `INSERT INTO project_expenses
       (project_id, task_id, title, category, amount, expense_date, vendor_name, receipt_note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      projectId,
      task_id || null,
      title,
      category,
      amount,
      expense_date,
      vendor_name || null,
      receipt_note || null,
      userId,
    ]
  );

  return result.insertId;
}

/**
 * Update an existing expense.
 */
async function updateProjectExpense(projectId, expenseId, data) {
  const fields = [];
  const params = [];

  const ALLOWED = ['task_id', 'title', 'category', 'amount', 'expense_date', 'vendor_name', 'receipt_note'];
  for (const col of ALLOWED) {
    if (data[col] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(data[col] === '' ? null : data[col]);
    }
  }

  if (!fields.length) return 0;

  params.push(projectId, expenseId);
  const result = await execute(
    `UPDATE project_expenses SET ${fields.join(', ')} WHERE project_id = ? AND id = ?`,
    params
  );
  return result.affectedRows;
}

/**
 * Delete an expense.
 */
async function deleteProjectExpense(projectId, expenseId) {
  const result = await execute(
    'DELETE FROM project_expenses WHERE project_id = ? AND id = ?',
    [projectId, expenseId]
  );
  return result.affectedRows > 0;
}

/**
 * Expense summary grouped by category.
 */
async function getExpenseSummaryByCategory(projectId) {
  const rows = await query(
    `SELECT category, COUNT(*) AS count, IFNULL(SUM(amount), 0) AS total_amount
       FROM project_expenses
      WHERE project_id = ?
      GROUP BY category
      ORDER BY total_amount DESC`,
    [projectId]
  );
  return rows.map((r) => ({
    category: r.category,
    count: Number(r.count),
    total_amount: Number(r.total_amount),
  }));
}

module.exports = {
  listProjects,
  findById,
  findByIdWithManager,
  findByCode,
  generateProjectCode,
  createProject,
  updateProject,
  deleteProject,
  listMembers,
  findMember,
  addMember,
  updateMemberRole,
  removeMember,
  countOwners,
  getProjectStats,
  getSummary,
  taskStatusDistribution,
  taskPriorityDistribution,
  weeklyCompletionTrend,
  topAssignees,
  listMilestones,
  findMilestoneById,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  listProjectStatuses,
  findProjectStatusByKey,
  findProjectStatusById,
  ensureDefaultStatuses,
  createProjectStatus,
  updateProjectStatus,
  reorderProjectStatuses,
  deleteProjectStatus,
  listProjectExpenses,
  findExpenseById,
  createProjectExpense,
  updateProjectExpense,
  deleteProjectExpense,
  getExpenseSummaryByCategory,
};

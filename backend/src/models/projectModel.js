'use strict';

const { query, queryOne, execute, transaction } = require('../config/database');
const { buildOrderBy, paginatedQuery } = require('./base');
const dayjs = require('dayjs');
const { DEFAULT_PROJECT_STATUSES, computeRiskSeverity } = require('../config/constants');

const PROJECT_FIELDS = `p.id, p.code, p.name, p.description, p.status, p.priority, p.progress,
       p.color, p.budget, p.start_date, p.end_date, p.manager_id, p.created_by, p.template_id,
       p.created_at, p.updated_at`;

const PROJECT_ENRICHED_FIELDS = `${PROJECT_FIELDS},
       u.name AS manager_name, u.avatar AS manager_avatar,
       (SELECT COUNT(*) FROM project_members pm_c WHERE pm_c.project_id = p.id) AS member_count,
       (SELECT COUNT(*) FROM tasks t_c WHERE t_c.project_id = p.id) AS task_count,
       (SELECT COUNT(*) FROM tasks t_d WHERE t_d.project_id = p.id AND t_d.status = 'done') AS completed_task_count,
       ((SELECT IFNULL(SUM(t_ac.actual_cost), 0) FROM tasks t_ac WHERE t_ac.project_id = p.id) +
        (SELECT IFNULL(SUM(pe_dir.amount), 0) FROM project_expenses pe_dir WHERE pe_dir.project_id = p.id AND pe_dir.task_id IS NULL AND pe_dir.status = 'approved')) AS actual_cost,
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
       (SELECT COUNT(*) FROM project_risks WHERE project_id = ?) AS risk_count,
       (SELECT COUNT(*) FROM project_risks WHERE project_id = ? AND status NOT IN ('resolved', 'closed')) AS open_risk_count,
       (SELECT COUNT(*) FROM project_risks WHERE project_id = ? AND status NOT IN ('resolved', 'closed') AND severity IN ('high', 'critical')) AS critical_risk_count,
       (SELECT COUNT(*) FROM project_documents WHERE project_id = ?) AS document_count,
       (SELECT IFNULL(SUM(estimated_cost), 0) FROM tasks WHERE project_id = ?) AS total_task_estimated_cost,
       (SELECT IFNULL(SUM(actual_cost), 0) FROM tasks WHERE project_id = ?) AS total_task_actual_cost,
       (SELECT IFNULL(SUM(amount), 0) FROM project_expenses WHERE project_id = ? AND task_id IS NULL AND status = 'approved') AS total_direct_expenses,
       (SELECT IFNULL(SUM(amount), 0) FROM project_expenses WHERE project_id = ? AND status = 'approved') AS total_expenses,
       (SELECT IFNULL(SUM(amount), 0) FROM project_expenses WHERE project_id = ? AND status = 'pending') AS total_pending_expenses,
       (SELECT COUNT(*) FROM project_expenses WHERE project_id = ? AND status = 'pending') AS pending_expense_count,
       (SELECT budget FROM projects WHERE id = ?) AS budget`,
    new Array(17).fill(projectId)
  );

  const budget = Number(row.budget || 0);
  const taskEstCost = Number(row.total_task_estimated_cost || 0);
  const taskActCost = Number(row.total_task_actual_cost || 0);
  const directExpenses = Number(row.total_direct_expenses || 0);
  const totalExpenses = Number(row.total_expenses || 0);
  const totalPendingExpenses = Number(row.total_pending_expenses || 0);
  const pendingExpenseCount = Number(row.pending_expense_count || 0);
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
    risk_count: Number(row.risk_count || 0),
    open_risk_count: Number(row.open_risk_count || 0),
    critical_risk_count: Number(row.critical_risk_count || 0),
    document_count: Number(row.document_count || 0),
    budget,
    total_estimated_cost: taskEstCost,
    total_task_actual_cost: taskActCost,
    total_direct_expenses: directExpenses,
    total_expenses: totalExpenses,
    total_pending_expenses: totalPendingExpenses,
    pending_expense_count: pendingExpenseCount,
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
 * Normalise DECIMAL and receipt fields for project expenses.
 */
function normalizeExpense(row) {
  if (!row) return null;
  return {
    ...row,
    amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : 0,
    receipt_size: row.receipt_size !== null && row.receipt_size !== undefined ? Number(row.receipt_size) : null,
    receipt_url: row.receipt_file ? `/uploads/${row.receipt_file}` : null,
  };
}

/**
 * List expenses for a project with optional filters.
 */
async function listProjectExpenses(projectId, filters = {}) {
  const { category, search, taskId, status } = filters;
  const conditions = ['pe.project_id = ?'];
  const params = [projectId];

  if (category) {
    conditions.push('pe.category = ?');
    params.push(category);
  }
  if (status) {
    conditions.push('pe.status = ?');
    params.push(status);
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
            pe.expense_date, pe.status, pe.vendor_name, pe.receipt_note,
            pe.receipt_file, pe.receipt_original_name, pe.receipt_mime_type, pe.receipt_size,
            pe.created_by, pe.approved_by, pe.approved_at, pe.rejection_reason,
            pe.created_at, pe.updated_at,
            u.name AS creator_name,
            app_u.name AS approver_name,
            t.title AS task_title
       FROM project_expenses pe
       LEFT JOIN users u ON u.id = pe.created_by
       LEFT JOIN users app_u ON app_u.id = pe.approved_by
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
            pe.expense_date, pe.status, pe.vendor_name, pe.receipt_note,
            pe.receipt_file, pe.receipt_original_name, pe.receipt_mime_type, pe.receipt_size,
            pe.created_by, pe.approved_by, pe.approved_at, pe.rejection_reason,
            pe.created_at, pe.updated_at,
            u.name AS creator_name,
            app_u.name AS approver_name,
            t.title AS task_title
       FROM project_expenses pe
       LEFT JOIN users u ON u.id = pe.created_by
       LEFT JOIN users app_u ON app_u.id = pe.approved_by
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
    status = 'pending',
    vendor_name = null,
    receipt_note = null,
    receipt_file = null,
    receipt_original_name = null,
    receipt_mime_type = null,
    receipt_size = null,
    approved_by = null,
    approved_at = null,
    rejection_reason = null,
  } = data;

  const result = await execute(
    `INSERT INTO project_expenses
       (project_id, task_id, title, category, amount, expense_date, status,
        vendor_name, receipt_note, receipt_file, receipt_original_name, receipt_mime_type, receipt_size,
        created_by, approved_by, approved_at, rejection_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      projectId,
      task_id || null,
      title,
      category,
      amount,
      expense_date,
      status,
      vendor_name || null,
      receipt_note || null,
      receipt_file || null,
      receipt_original_name || null,
      receipt_mime_type || null,
      receipt_size || null,
      userId,
      approved_by || null,
      approved_at || null,
      rejection_reason || null,
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

  const ALLOWED = [
    'task_id',
    'title',
    'category',
    'amount',
    'expense_date',
    'status',
    'vendor_name',
    'receipt_note',
    'receipt_file',
    'receipt_original_name',
    'receipt_mime_type',
    'receipt_size',
    'approved_by',
    'approved_at',
    'rejection_reason',
  ];
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
 * Concurrency-safe status update for an expense from pending status.
 */
async function updateExpenseStatus(expenseId, { status, approved_by = null, approved_at = null, rejection_reason = null }) {
  const result = await execute(
    `UPDATE project_expenses
        SET status = ?, approved_by = ?, approved_at = ?, rejection_reason = ?
      WHERE id = ? AND status = 'pending'`,
    [status, approved_by, approved_at, rejection_reason, expenseId]
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
 * Expense summary grouped by category (approved only).
 */
async function getExpenseSummaryByCategory(projectId) {
  const rows = await query(
    `SELECT category, COUNT(*) AS count, IFNULL(SUM(amount), 0) AS total_amount
       FROM project_expenses
      WHERE project_id = ? AND status = 'approved'
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

/**
 * Retrieve unique user IDs that can approve project expenses (project manager, owner/manager members, system admins).
 */
async function listProjectApproverIds(projectId) {
  const rows = await query(
    `SELECT DISTINCT user_id FROM (
       SELECT manager_id AS user_id FROM projects WHERE id = ? AND manager_id IS NOT NULL
       UNION
       SELECT user_id FROM project_members WHERE project_id = ? AND role IN ('owner', 'manager')
       UNION
       SELECT id AS user_id FROM users WHERE role = 'admin' AND is_active = 1
     ) approvers`,
    [projectId, projectId]
  );
  return rows.map((r) => r.user_id).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Project Risks & Issues
// ---------------------------------------------------------------------------

/**
 * Generate unique risk code per project e.g. RSK-001 or ISS-001
 */
async function generateRiskCode(projectId, type = 'risk') {
  const prefix = type === 'issue' ? 'ISS' : 'RSK';
  const row = await queryOne(
    'SELECT COUNT(*) AS total FROM project_risks WHERE project_id = ? AND type = ?',
    [projectId, type]
  );
  let seq = Number(row?.total || 0) + 1;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const code = `${prefix}-${String(seq).padStart(3, '0')}`;
    const existing = await queryOne(
      'SELECT id FROM project_risks WHERE project_id = ? AND code = ? LIMIT 1',
      [projectId, code]
    );
    if (!existing) return code;
    seq += 1;
  }
  return `${prefix}-${Date.now().toString().slice(-4)}`;
}

/**
 * Normalise risk row types.
 */
function normalizeRisk(row) {
  if (!row) return null;
  return {
    ...row,
    probability: Number(row.probability),
    impact: Number(row.impact),
    risk_score: Number(row.risk_score),
  };
}

/**
 * List risks for a project with filters.
 */
async function listProjectRisks(projectId, filters = {}) {
  const { type, category, severity, status, ownerId, probability, impact, search } = filters;
  const conditions = ['pr.project_id = ?'];
  const params = [projectId];

  if (type) {
    conditions.push('pr.type = ?');
    params.push(type);
  }
  if (category) {
    conditions.push('pr.category = ?');
    params.push(category);
  }
  if (severity) {
    conditions.push('pr.severity = ?');
    params.push(severity);
  }
  if (status) {
    conditions.push('pr.status = ?');
    params.push(status);
  }
  if (ownerId !== undefined) {
    if (ownerId === null || ownerId === 'unassigned') {
      conditions.push('pr.owner_id IS NULL');
    } else {
      conditions.push('pr.owner_id = ?');
      params.push(ownerId);
    }
  }
  if (probability) {
    conditions.push('pr.probability = ?');
    params.push(Number(probability));
  }
  if (impact) {
    conditions.push('pr.impact = ?');
    params.push(Number(impact));
  }
  if (search) {
    conditions.push('(pr.title LIKE ? OR pr.code LIKE ? OR pr.description LIKE ? OR pr.mitigation_plan LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const rows = await query(
    `SELECT pr.id, pr.project_id, pr.code, pr.type, pr.title, pr.description,
            pr.category, pr.probability, pr.impact, pr.risk_score, pr.severity,
            pr.mitigation_plan, pr.contingency_plan, pr.status,
            pr.owner_id, pr.linked_task_id, pr.target_date, pr.resolved_at,
            pr.created_by, pr.created_at, pr.updated_at,
            u_owner.name AS owner_name, u_owner.avatar AS owner_avatar, u_owner.job_title AS owner_job_title,
            u_creator.name AS creator_name,
            t.title AS linked_task_title
       FROM project_risks pr
       LEFT JOIN users u_owner ON u_owner.id = pr.owner_id
       LEFT JOIN users u_creator ON u_creator.id = pr.created_by
       LEFT JOIN tasks t ON t.id = pr.linked_task_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE WHEN pr.status IN ('resolved', 'closed') THEN 1 ELSE 0 END ASC,
        pr.risk_score DESC,
        pr.id DESC`,
    params
  );
  return rows.map(normalizeRisk);
}

/**
 * Summary KPI and 5x5 Matrix data for project risks.
 */
async function getProjectRiskSummary(projectId) {
  const rows = await query(
    `SELECT id, code, title, type, category, probability, impact, risk_score, severity, status, owner_id
       FROM project_risks
      WHERE project_id = ?`,
    [projectId]
  );

  let totalCount = rows.length;
  let openCount = 0;
  let resolvedCount = 0;
  let criticalHighOpenCount = 0;
  let riskCount = 0;
  let issueCount = 0;

  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  const byStatus = {
    identified: 0,
    analyzing: 0,
    mitigating: 0,
    monitoring: 0,
    resolved: 0,
    closed: 0,
  };
  const categoryCounts = {};

  // 5x5 Matrix (P: 1..5, I: 1..5)
  const matrix = [];
  for (let p = 1; p <= 5; p += 1) {
    for (let i = 1; i <= 5; i += 1) {
      const { score, severity } = computeRiskSeverity(p, i);
      matrix.push({
        probability: p,
        impact: i,
        risk_score: score,
        severity,
        count: 0,
        open_count: 0,
        items: [],
      });
    }
  }

  const matrixMap = new Map();
  matrix.forEach((cell) => {
    matrixMap.set(`${cell.probability}-${cell.impact}`, cell);
  });

  for (const r of rows) {
    const isResolved = r.status === 'resolved' || r.status === 'closed';
    if (isResolved) {
      resolvedCount += 1;
    } else {
      openCount += 1;
      if (r.severity === 'critical' || r.severity === 'high') {
        criticalHighOpenCount += 1;
      }
    }

    if (r.type === 'issue') {
      issueCount += 1;
    } else {
      riskCount += 1;
    }

    if (bySeverity[r.severity] !== undefined) {
      bySeverity[r.severity] += 1;
    }
    if (byStatus[r.status] !== undefined) {
      byStatus[r.status] += 1;
    }

    categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;

    const cell = matrixMap.get(`${r.probability}-${r.impact}`);
    if (cell) {
      cell.count += 1;
      if (!isResolved) {
        cell.open_count += 1;
      }
      cell.items.push({
        id: r.id,
        code: r.code,
        title: r.title,
        type: r.type,
        severity: r.severity,
        status: r.status,
      });
    }
  }

  const byCategory = Object.entries(categoryCounts).map(([category, count]) => ({
    category,
    count,
  }));

  return {
    total_count: totalCount,
    open_count: openCount,
    resolved_count: resolvedCount,
    critical_high_open_count: criticalHighOpenCount,
    risk_count: riskCount,
    issue_count: issueCount,
    by_severity: bySeverity,
    by_status: byStatus,
    by_category: byCategory,
    matrix,
  };
}

/**
 * Find single risk by id.
 */
async function findRiskById(riskId) {
  const row = await queryOne(
    `SELECT pr.id, pr.project_id, pr.code, pr.type, pr.title, pr.description,
            pr.category, pr.probability, pr.impact, pr.risk_score, pr.severity,
            pr.mitigation_plan, pr.contingency_plan, pr.status,
            pr.owner_id, pr.linked_task_id, pr.target_date, pr.resolved_at,
            pr.created_by, pr.created_at, pr.updated_at,
            u_owner.name AS owner_name, u_owner.avatar AS owner_avatar, u_owner.job_title AS owner_job_title,
            u_creator.name AS creator_name,
            t.title AS linked_task_title
       FROM project_risks pr
       LEFT JOIN users u_owner ON u_owner.id = pr.owner_id
       LEFT JOIN users u_creator ON u_creator.id = pr.created_by
       LEFT JOIN tasks t ON t.id = pr.linked_task_id
      WHERE pr.id = ? LIMIT 1`,
    [riskId]
  );
  return normalizeRisk(row);
}

/**
 * Create a new risk or issue.
 */
async function createProjectRisk(projectId, data, userId) {
  const {
    type = 'risk',
    title,
    description = null,
    category = 'technical',
    probability = 3,
    impact = 3,
    mitigation_plan = null,
    contingency_plan = null,
    status = 'identified',
    owner_id = null,
    linked_task_id = null,
    target_date = null,
  } = data;

  const code = await generateRiskCode(projectId, type);
  const { score, severity, probability: p, impact: i } = computeRiskSeverity(probability, impact);
  const isResolved = status === 'resolved' || status === 'closed';
  const resolvedAt = isResolved ? dayjs().format('YYYY-MM-DD HH:mm:ss') : null;

  const result = await execute(
    `INSERT INTO project_risks
       (project_id, code, type, title, description, category, probability, impact,
        risk_score, severity, mitigation_plan, contingency_plan, status, owner_id,
        linked_task_id, target_date, resolved_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      projectId,
      code,
      type,
      title,
      description || null,
      category,
      p,
      i,
      score,
      severity,
      mitigation_plan || null,
      contingency_plan || null,
      status,
      owner_id || null,
      linked_task_id || null,
      target_date || null,
      resolvedAt,
      userId,
    ]
  );

  return result.insertId;
}

/**
 * Update an existing risk or issue.
 */
async function updateProjectRisk(projectId, riskId, data) {
  const existing = await findRiskById(riskId);
  if (!existing) return 0;

  const fields = [];
  const params = [];

  const p = data.probability !== undefined ? Number(data.probability) : existing.probability;
  const i = data.impact !== undefined ? Number(data.impact) : existing.impact;
  const { score, severity } = computeRiskSeverity(p, i);

  if (data.probability !== undefined) {
    fields.push('probability = ?');
    params.push(p);
  }
  if (data.impact !== undefined) {
    fields.push('impact = ?');
    params.push(i);
  }
  if (data.probability !== undefined || data.impact !== undefined) {
    fields.push('risk_score = ?', 'severity = ?');
    params.push(score, severity);
  }

  const simpleFields = [
    'type',
    'title',
    'description',
    'category',
    'mitigation_plan',
    'contingency_plan',
    'owner_id',
    'linked_task_id',
    'target_date',
  ];

  for (const key of simpleFields) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(data[key] === '' ? null : data[key]);
    }
  }

  if (data.status !== undefined) {
    fields.push('status = ?');
    params.push(data.status);

    const wasResolved = existing.status === 'resolved' || existing.status === 'closed';
    const isResolved = data.status === 'resolved' || data.status === 'closed';
    if (isResolved && !wasResolved) {
      fields.push('resolved_at = ?');
      params.push(dayjs().format('YYYY-MM-DD HH:mm:ss'));
    } else if (!isResolved && wasResolved) {
      fields.push('resolved_at = NULL');
    }
  }

  if (!fields.length) return 0;

  params.push(projectId, riskId);
  const result = await execute(
    `UPDATE project_risks SET ${fields.join(', ')} WHERE project_id = ? AND id = ?`,
    params
  );
  return result.affectedRows;
}

/**
 * Delete a risk.
 */
async function deleteProjectRisk(projectId, riskId) {
  const result = await execute(
    'DELETE FROM project_risks WHERE project_id = ? AND id = ?',
    [projectId, riskId]
  );
  return result.affectedRows > 0;
}

// ---------------------------------------------------------------------------
// project_documents & project_document_versions
// ---------------------------------------------------------------------------

/**
 * Generate a unique document code per project (DOC-001, DOC-002, etc.)
 * @param {number} projectId
 */
async function generateDocumentCode(projectId) {
  const row = await queryOne(
    'SELECT COUNT(*) AS total FROM project_documents WHERE project_id = ?',
    [projectId]
  );
  let seq = Number(row?.total || 0) + 1;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const code = `DOC-${String(seq).padStart(3, '0')}`;
    const existing = await queryOne(
      'SELECT id FROM project_documents WHERE project_id = ? AND code = ? LIMIT 1',
      [projectId, code]
    );
    if (!existing) return code;
    seq += 1;
  }
  return `DOC-${Date.now().toString().slice(-4)}`;
}

/**
 * List project documents with optional filters.
 * @param {number} projectId
 * @param {object} filters
 */
async function listProjectDocuments(projectId, filters = {}) {
  const { category, status, search, pinned } = filters;
  const conditions = ['pd.project_id = ?'];
  const params = [projectId];

  if (category) {
    conditions.push('pd.category = ?');
    params.push(category);
  }
  if (status) {
    conditions.push('pd.status = ?');
    params.push(status);
  }
  if (pinned !== undefined && pinned !== '') {
    const isPinned = pinned === true || pinned === 'true' || pinned === '1' || pinned === 1;
    conditions.push('pd.is_pinned = ?');
    params.push(isPinned ? 1 : 0);
  }
  if (search) {
    conditions.push('(pd.title LIKE ? OR pd.code LIKE ? OR pd.summary LIKE ? OR pd.content LIKE ? OR pd.file_original_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const rows = await query(
    `SELECT pd.id, pd.project_id, pd.code, pd.title, pd.category, pd.status,
            pd.summary, pd.file_name, pd.file_original_name, pd.file_mime_type, pd.file_size,
            pd.current_version, pd.is_pinned, pd.is_locked,
            pd.created_by, pd.updated_by, pd.created_at, pd.updated_at,
            u_creator.name AS creator_name, u_creator.avatar AS creator_avatar,
            u_updater.name AS updater_name, u_updater.avatar AS updater_avatar,
            (SELECT COUNT(*) FROM project_document_versions pdv WHERE pdv.document_id = pd.id) AS version_count
       FROM project_documents pd
       LEFT JOIN users u_creator ON u_creator.id = pd.created_by
       LEFT JOIN users u_updater ON u_updater.id = pd.updated_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY pd.is_pinned DESC, pd.updated_at DESC, pd.id DESC`,
    params
  );

  return rows.map((r) => ({
    ...r,
    current_version: Number(r.current_version),
    version_count: Number(r.version_count || 1),
    is_pinned: Boolean(r.is_pinned),
    is_locked: Boolean(r.is_locked),
    file_size: r.file_size ? Number(r.file_size) : null,
  }));
}

/**
 * Summary KPI counts for documents in a project.
 * @param {number} projectId
 */
async function getProjectDocumentSummary(projectId) {
  const rows = await query(
    `SELECT id, category, status, is_pinned, is_locked, file_name, current_version
       FROM project_documents
      WHERE project_id = ?`,
    [projectId]
  );

  const totalCount = rows.length;
  let pinnedCount = 0;
  let lockedCount = 0;
  let withFileCount = 0;
  let totalVersionsCount = 0;

  const byCategory = {
    charter: 0,
    contract: 0,
    mom: 0,
    sop: 0,
    technical: 0,
    wiki: 0,
    other: 0,
  };

  const byStatus = {
    draft: 0,
    review: 0,
    published: 0,
    final: 0,
    archived: 0,
  };

  for (const r of rows) {
    if (r.is_pinned) pinnedCount += 1;
    if (r.is_locked || r.status === 'final') lockedCount += 1;
    if (r.file_name) withFileCount += 1;
    totalVersionsCount += Number(r.current_version || 1);

    if (byCategory[r.category] !== undefined) {
      byCategory[r.category] += 1;
    }
    if (byStatus[r.status] !== undefined) {
      byStatus[r.status] += 1;
    }
  }

  return {
    total_count: totalCount,
    pinned_count: pinnedCount,
    locked_count: lockedCount,
    with_file_count: withFileCount,
    total_versions_count: totalVersionsCount,
    by_category: byCategory,
    by_status: byStatus,
  };
}

/**
 * Get single document by id with full details.
 * @param {number} documentId
 */
async function findDocumentById(documentId) {
  const row = await queryOne(
    `SELECT pd.id, pd.project_id, pd.code, pd.title, pd.category, pd.status,
            pd.summary, pd.content, pd.file_name, pd.file_original_name, pd.file_mime_type, pd.file_size,
            pd.current_version, pd.is_pinned, pd.is_locked,
            pd.created_by, pd.updated_by, pd.created_at, pd.updated_at,
            u_creator.name AS creator_name, u_creator.avatar AS creator_avatar,
            u_updater.name AS updater_name, u_updater.avatar AS updater_avatar,
            (SELECT COUNT(*) FROM project_document_versions pdv WHERE pdv.document_id = pd.id) AS version_count
       FROM project_documents pd
       LEFT JOIN users u_creator ON u_creator.id = pd.created_by
       LEFT JOIN users u_updater ON u_updater.id = pd.updated_by
      WHERE pd.id = ? LIMIT 1`,
    [documentId]
  );

  if (!row) return null;

  return {
    ...row,
    current_version: Number(row.current_version),
    version_count: Number(row.version_count || 1),
    is_pinned: Boolean(row.is_pinned),
    is_locked: Boolean(row.is_locked),
    file_size: row.file_size ? Number(row.file_size) : null,
  };
}

/**
 * List all versions of a document.
 * @param {number} documentId
 */
async function listDocumentVersions(documentId) {
  const rows = await query(
    `SELECT pdv.id, pdv.document_id, pdv.project_id, pdv.version_number,
            pdv.title, pdv.content, pdv.file_name, pdv.file_original_name,
            pdv.file_mime_type, pdv.file_size, pdv.change_note,
            pdv.created_by, pdv.created_at,
            u.name AS created_by_name, u.avatar AS created_by_avatar, u.job_title AS created_by_job_title
       FROM project_document_versions pdv
       LEFT JOIN users u ON u.id = pdv.created_by
      WHERE pdv.document_id = ?
      ORDER BY pdv.version_number DESC, pdv.id DESC`,
    [documentId]
  );

  return rows.map((r) => ({
    ...r,
    version_number: Number(r.version_number),
    file_size: r.file_size ? Number(r.file_size) : null,
  }));
}

/**
 * Find single document version.
 * @param {number} documentId
 * @param {number} versionId
 */
async function findDocumentVersionById(documentId, versionId) {
  const row = await queryOne(
    `SELECT pdv.id, pdv.document_id, pdv.project_id, pdv.version_number,
            pdv.title, pdv.content, pdv.file_name, pdv.file_original_name,
            pdv.file_mime_type, pdv.file_size, pdv.change_note,
            pdv.created_by, pdv.created_at,
            u.name AS created_by_name, u.avatar AS created_by_avatar, u.job_title AS created_by_job_title
       FROM project_document_versions pdv
       LEFT JOIN users u ON u.id = pdv.created_by
      WHERE pdv.document_id = ? AND pdv.id = ? LIMIT 1`,
    [documentId, versionId]
  );

  if (!row) return null;

  return {
    ...row,
    version_number: Number(row.version_number),
    file_size: row.file_size ? Number(row.file_size) : null,
  };
}

/**
 * Create a document and write the initial version snapshot.
 * @param {number} projectId
 * @param {object} data
 * @param {number} userId
 */
async function createProjectDocument(projectId, data, userId) {
  const {
    title,
    category = 'wiki',
    status = 'published',
    summary = null,
    content = null,
    file_name = null,
    file_original_name = null,
    file_mime_type = null,
    file_size = null,
    is_pinned = false,
    is_locked = false,
    change_note = 'Versi awal dokumen',
  } = data;

  const code = await generateDocumentCode(projectId);

  let docId;
  await transaction(async (connection) => {
    const [docResult] = await connection.execute(
      `INSERT INTO project_documents
         (project_id, code, title, category, status, summary, content,
          file_name, file_original_name, file_mime_type, file_size,
          current_version, is_pinned, is_locked, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        projectId,
        code,
        title,
        category,
        status,
        summary || null,
        content || null,
        file_name || null,
        file_original_name || null,
        file_mime_type || null,
        file_size || null,
        is_pinned ? 1 : 0,
        is_locked ? 1 : 0,
        userId,
        userId,
      ]
    );

    docId = docResult.insertId;

    await connection.execute(
      `INSERT INTO project_document_versions
         (document_id, project_id, version_number, title, content,
          file_name, file_original_name, file_mime_type, file_size,
          change_note, created_by)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId,
        projectId,
        title,
        content || null,
        file_name || null,
        file_original_name || null,
        file_mime_type || null,
        file_size || null,
        change_note || 'Versi awal dokumen',
        userId,
      ]
    );
  });

  return docId;
}

/**
 * Update an existing document. If content/file changed, snapshot a new version.
 * @param {number} projectId
 * @param {number} documentId
 * @param {object} data
 * @param {number} userId
 */
async function updateProjectDocument(projectId, documentId, data, userId) {
  const existing = await findDocumentById(documentId);
  if (!existing) return 0;

  const newTitle = data.title !== undefined ? data.title : existing.title;
  const newContent = data.content !== undefined ? data.content : existing.content;
  const hasNewFile = Boolean(data.file_name);
  const removeFile = Boolean(data.remove_file);

  let newFileName = existing.file_name;
  let newFileOriginalName = existing.file_original_name;
  let newFileMimeType = existing.file_mime_type;
  let newFileSize = existing.file_size;

  if (hasNewFile) {
    newFileName = data.file_name;
    newFileOriginalName = data.file_original_name;
    newFileMimeType = data.file_mime_type;
    newFileSize = data.file_size;
  } else if (removeFile) {
    newFileName = null;
    newFileOriginalName = null;
    newFileMimeType = null;
    newFileSize = null;
  }

  // Check if this update warrants a new version snapshot
  const titleChanged = data.title !== undefined && data.title !== existing.title;
  const contentChanged = data.content !== undefined && data.content !== existing.content;
  const fileChanged = hasNewFile || removeFile;
  const forceVersion = Boolean(data.create_new_version);

  const shouldCreateVersion = titleChanged || contentChanged || fileChanged || forceVersion;
  const nextVersion = shouldCreateVersion ? existing.current_version + 1 : existing.current_version;

  await transaction(async (connection) => {
    const fields = [
      'title = ?',
      'content = ?',
      'file_name = ?',
      'file_original_name = ?',
      'file_mime_type = ?',
      'file_size = ?',
      'current_version = ?',
      'updated_by = ?',
    ];
    const params = [
      newTitle,
      newContent,
      newFileName,
      newFileOriginalName,
      newFileMimeType,
      newFileSize,
      nextVersion,
      userId,
    ];

    if (data.category !== undefined) {
      fields.push('category = ?');
      params.push(data.category);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      params.push(data.status);
    }
    if (data.summary !== undefined) {
      fields.push('summary = ?');
      params.push(data.summary || null);
    }
    if (data.is_pinned !== undefined) {
      fields.push('is_pinned = ?');
      params.push(data.is_pinned ? 1 : 0);
    }
    if (data.is_locked !== undefined) {
      fields.push('is_locked = ?');
      params.push(data.is_locked ? 1 : 0);
    }

    params.push(projectId, documentId);

    await connection.execute(
      `UPDATE project_documents SET ${fields.join(', ')} WHERE project_id = ? AND id = ?`,
      params
    );

    if (shouldCreateVersion) {
      await connection.execute(
        `INSERT INTO project_document_versions
           (document_id, project_id, version_number, title, content,
            file_name, file_original_name, file_mime_type, file_size,
            change_note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          documentId,
          projectId,
          nextVersion,
          newTitle,
          newContent,
          newFileName,
          newFileOriginalName,
          newFileMimeType,
          newFileSize,
          data.change_note || `Pembaruan ke versi ${nextVersion}`,
          userId,
        ]
      );
    }
  });

  return nextVersion;
}

/**
 * Restore a document to a previous version snapshot, writing a new version row.
 * @param {number} projectId
 * @param {number} documentId
 * @param {object} targetVersion
 * @param {string} changeNote
 * @param {number} userId
 */
async function restoreDocumentVersion(projectId, documentId, targetVersion, changeNote, userId) {
  const existing = await findDocumentById(documentId);
  if (!existing) return 0;

  const nextVersion = existing.current_version + 1;
  const note = changeNote || `Dipulihkan dari versi v${targetVersion.version_number}`;

  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE project_documents
          SET title = ?, content = ?, file_name = ?, file_original_name = ?,
              file_mime_type = ?, file_size = ?, current_version = ?, updated_by = ?
        WHERE project_id = ? AND id = ?`,
      [
        targetVersion.title,
        targetVersion.content,
        targetVersion.file_name,
        targetVersion.file_original_name,
        targetVersion.file_mime_type,
        targetVersion.file_size,
        nextVersion,
        userId,
        projectId,
        documentId,
      ]
    );

    await connection.execute(
      `INSERT INTO project_document_versions
         (document_id, project_id, version_number, title, content,
          file_name, file_original_name, file_mime_type, file_size,
          change_note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        documentId,
        projectId,
        nextVersion,
        targetVersion.title,
        targetVersion.content,
        targetVersion.file_name,
        targetVersion.file_original_name,
        targetVersion.file_mime_type,
        targetVersion.file_size,
        note,
        userId,
      ]
    );
  });

  return nextVersion;
}

/**
 * Delete a document and return all physical files to clean up from disk.
 * @param {number} projectId
 * @param {number} documentId
 */
async function deleteProjectDocument(projectId, documentId) {
  const rows = await query(
    `SELECT DISTINCT file_name FROM (
       SELECT file_name FROM project_documents WHERE project_id = ? AND id = ? AND file_name IS NOT NULL
       UNION
       SELECT file_name FROM project_document_versions WHERE project_id = ? AND document_id = ? AND file_name IS NOT NULL
     ) AS t`,
    [projectId, documentId, projectId, documentId]
  );
  const fileNames = rows.map((r) => r.file_name).filter(Boolean);

  const result = await execute(
    'DELETE FROM project_documents WHERE project_id = ? AND id = ?',
    [projectId, documentId]
  );

  return { affected: result.affectedRows > 0, fileNames };
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
  updateExpenseStatus,
  listProjectApproverIds,
  deleteProjectExpense,
  getExpenseSummaryByCategory,
  generateRiskCode,
  listProjectRisks,
  getProjectRiskSummary,
  findRiskById,
  createProjectRisk,
  updateProjectRisk,
  deleteProjectRisk,
  generateDocumentCode,
  listProjectDocuments,
  getProjectDocumentSummary,
  findDocumentById,
  listDocumentVersions,
  findDocumentVersionById,
  createProjectDocument,
  updateProjectDocument,
  restoreDocumentVersion,
  deleteProjectDocument,
};

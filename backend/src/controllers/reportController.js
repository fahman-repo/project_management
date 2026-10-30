'use strict';

const dayjs = require('dayjs');
const { query } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const { accessibleProjectIds } = require('../services/accessService');
const { inPlaceholders } = require('../models/base');
const { TASK_STATUS, PROJECT_STATUS } = require('../config/constants');
const { computeTaskProgressMap } = require('../services/progressService');

/**
 * Build a project-access restriction.
 * `null` (admin) means "no restriction"; an empty array matches nothing.
 * @param {number[]|null} projectIds
 * @param {string} column qualified column name
 * @returns {{sql:string, params:any[]}}
 */
function projectScope(projectIds, column) {
  if (projectIds === null) return { sql: '1 = 1', params: [] };
  if (!projectIds.length) return { sql: '1 = 0', params: [] };
  return { sql: `${column} IN (${inPlaceholders(projectIds)})`, params: projectIds };
}

/** Percentage rounded to one decimal, safe for an empty denominator. */
function percentage(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/**
 * GET /api/v1/reports/overview
 * Aggregate summary across every accessible project.
 */
const getOverview = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const { project_id: projectId } = req.query;

  if (projectId && projectIds !== null && !projectIds.includes(Number(projectId))) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke proyek ini');
  }

  const effectiveProjectIds = projectId ? [Number(projectId)] : projectIds;
  const today = dayjs().format('YYYY-MM-DD');
  const projectFilter = projectScope(effectiveProjectIds, 'p.id');
  const taskFilter = projectScope(effectiveProjectIds, 't.project_id');
  const expenseFilter = projectScope(effectiveProjectIds, 'pe.project_id');

  const [projectRow, taskRow, memberRows, labelRows, statusRows, projectRows, financialRow] = await Promise.all([
    query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END), 0) AS active,
              COALESCE(SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
              AVG(p.progress) AS avg_progress
         FROM projects p
        WHERE ${projectFilter.sql}`,
      projectFilter.params
    ),
    query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS done,
              COALESCE(SUM(CASE WHEN t.status <> 'done' THEN 1 ELSE 0 END), 0) AS open_tasks,
              COALESCE(SUM(CASE WHEN t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < ?
                             THEN 1 ELSE 0 END), 0) AS overdue,
              COALESCE(SUM(CASE WHEN t.completed_at IS NOT NULL AND t.completed_at <= t.due_date
                             THEN 1 ELSE 0 END), 0) AS on_time,
              COALESCE(SUM(CASE WHEN t.completed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS completed,
              AVG(CASE WHEN t.completed_at IS NOT NULL
                       THEN GREATEST(0, TIMESTAMPDIFF(DAY, t.created_at, t.completed_at)) END) AS avg_duration
         FROM tasks t
        WHERE ${taskFilter.sql}`,
      [today, ...taskFilter.params]
    ),
    query(
      `SELECT t.assignee_id AS user_id, u.name, u.avatar,
              COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS done
         FROM tasks t
         JOIN users u ON u.id = t.assignee_id
        WHERE ${taskFilter.sql}
        GROUP BY t.assignee_id, u.name, u.avatar
        ORDER BY done DESC, total DESC
        LIMIT 1`,
      taskFilter.params
    ),
    query(
      `SELECT l.id, l.name, l.color, COUNT(tl.task_id) AS count
         FROM task_labels tl
         JOIN labels l ON l.id = tl.label_id
         JOIN tasks t ON t.id = tl.task_id
        WHERE ${taskFilter.sql}
        GROUP BY l.id, l.name, l.color
        ORDER BY count DESC
        LIMIT 10`,
      taskFilter.params
    ),
    query(
      `SELECT t.status, COUNT(*) AS count
         FROM tasks t
        WHERE ${taskFilter.sql}
        GROUP BY t.status`,
      taskFilter.params
    ),
    query(
      `SELECT p.id, p.code, p.name, p.status, p.progress, p.color, p.budget,
              ((SELECT IFNULL(SUM(t_ac.actual_cost), 0) FROM tasks t_ac WHERE t_ac.project_id = p.id) +
               (SELECT IFNULL(SUM(pe_dir.amount), 0) FROM project_expenses pe_dir WHERE pe_dir.project_id = p.id AND pe_dir.task_id IS NULL AND pe_dir.status = 'approved')) AS actual_cost,
              COUNT(t.id) AS task_count,
              COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS completed_count
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
        WHERE ${projectFilter.sql}
        GROUP BY p.id, p.code, p.name, p.status, p.progress, p.color, p.budget
        ORDER BY task_count DESC, p.name ASC`,
      projectFilter.params
    ),
    query(
      `SELECT
         COALESCE(SUM(p.budget), 0) AS total_budget,
         (SELECT COALESCE(SUM(t.estimated_cost), 0) FROM tasks t WHERE ${taskFilter.sql}) AS total_estimated_cost,
         (SELECT COALESCE(SUM(t.actual_cost), 0) FROM tasks t WHERE ${taskFilter.sql}) AS total_task_actual_cost,
         (SELECT COALESCE(SUM(pe.amount), 0) FROM project_expenses pe WHERE ${expenseFilter.sql} AND pe.task_id IS NULL AND pe.status = 'approved') AS total_direct_expenses
       FROM projects p
      WHERE ${projectFilter.sql}`,
      [...taskFilter.params, ...taskFilter.params, ...expenseFilter.params, ...projectFilter.params]
    ),
  ]);

  const projects = projectRow[0] || {};
  const tasks = taskRow[0] || {};
  const busiest = memberRows[0];
  const fin = financialRow[0] || {};

  const totalBudget = Number(fin.total_budget || 0);
  const totalEstimatedCost = Number(fin.total_estimated_cost || 0);
  const totalActualCost = Number(fin.total_task_actual_cost || 0) + Number(fin.total_direct_expenses || 0);
  const budgetUtilizationRate = totalBudget > 0 ? Math.round((totalActualCost / totalBudget) * 1000) / 10 : 0;

  const statusBreakdown = Object.keys(TASK_STATUS).map((status) => {
    const found = statusRows.find((row) => row.status === status);
    return {
      status,
      label: TASK_STATUS[status].label,
      color: TASK_STATUS[status].color,
      count: found ? Number(found.count) : 0,
    };
  });

  const payload = {
    projects: {
      total: Number(projects.total || 0),
      active: Number(projects.active || 0),
      completed: Number(projects.completed || 0),
      avgProgress:
        projects.avg_progress === null ? 0 : Math.round(Number(projects.avg_progress) * 10) / 10,
    },
    tasks: {
      total: Number(tasks.total || 0),
      done: Number(tasks.done || 0),
      open: Number(tasks.open_tasks || 0),
      overdue: Number(tasks.overdue || 0),
    },
    financials: {
      totalBudget,
      totalEstimatedCost,
      totalActualCost,
      budgetUtilizationRate,
    },
    completionRate: percentage(Number(tasks.done || 0), Number(tasks.total || 0)),
    onTimeCompletionRate: percentage(Number(tasks.on_time || 0), Number(tasks.completed || 0)),
    avgTaskDuration:
      tasks.avg_duration === null ? 0 : Math.round(Number(tasks.avg_duration) * 10) / 10,
    busiestMember: busiest
      ? {
          userId: busiest.user_id,
          name: busiest.name,
          avatar: busiest.avatar,
          total: Number(busiest.total || 0),
          completed: Number(busiest.done || 0),
        }
      : null,
    mostUsedLabels: labelRows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      count: Number(row.count || 0),
    })),
    topLabels: labelRows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      count: Number(row.count || 0),
    })),
    statusBreakdown,
    projectBreakdown: projectRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      statusLabel: PROJECT_STATUS[row.status]?.label || row.status,
      progress: Number(row.progress || 0),
      color: row.color,
      budget: Number(row.budget || 0),
      actualCost: Number(row.actual_cost || 0),
      taskCount: Number(row.task_count || 0),
      completedCount: Number(row.completed_count || 0),
      completionRate: percentage(Number(row.completed_count || 0), Number(row.task_count || 0)),
    })),
  };

  return sendSuccess(res, payload, 'Berhasil memuat ringkasan laporan');
});

/**
 * GET /api/v1/reports/status-distribution
 * Task counts per status, optionally scoped to a single project.
 */
const getStatusDistribution = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const { project_id: projectId } = req.query;

  if (projectId && projectIds !== null && !projectIds.includes(Number(projectId))) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke proyek ini');
  }

  let filter = projectScope(projectIds, 't.project_id');
  let params = [...filter.params];

  if (projectId) {
    filter = { sql: 't.project_id = ?', params: [Number(projectId)] };
    params = [Number(projectId)];
  }

  const rows = await query(
    `SELECT t.status, COUNT(*) AS count
       FROM tasks t
      WHERE ${filter.sql}
      GROUP BY t.status`,
    params
  );

  const items = Object.keys(TASK_STATUS).map((status) => {
    const found = rows.find((row) => row.status === status);
    return {
      status,
      label: TASK_STATUS[status].label,
      color: TASK_STATUS[status].color,
      count: found ? Number(found.count) : 0,
    };
  });

  return sendSuccess(res, items, 'Berhasil memuat distribusi status');
});

/**
 * GET /api/v1/reports/productivity
 * Per-member productivity metrics.
 */
const getProductivity = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const { from, to, project_id: projectId } = req.query;
  const today = dayjs().format('YYYY-MM-DD');

  if (projectId && projectIds !== null && !projectIds.includes(Number(projectId))) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke proyek ini');
  }

  const scope = projectScope(projectIds, 't.project_id');
  const conditions = [scope.sql];
  const params = [...scope.params];

  if (projectId) {
    conditions.push('t.project_id = ?');
    params.push(Number(projectId));
  }
  if (from) {
    conditions.push('(t.created_at >= ? OR t.completed_at >= ?)');
    params.push(`${from} 00:00:00`, `${from} 00:00:00`);
  }
  if (to) {
    conditions.push('(t.created_at <= ? OR t.completed_at <= ?)');
    params.push(`${to} 23:59:59`, `${to} 23:59:59`);
  }

  const rows = await query(
    `SELECT t.assignee_id AS user_id, u.name, u.avatar, u.role,
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS completed,
            COALESCE(SUM(CASE WHEN t.status <> 'done' THEN 1 ELSE 0 END), 0) AS open_tasks,
            COALESCE(SUM(CASE WHEN t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < ?
                           THEN 1 ELSE 0 END), 0) AS overdue,
            AVG(CASE WHEN t.completed_at IS NOT NULL
                     THEN GREATEST(0, TIMESTAMPDIFF(DAY, t.created_at, t.completed_at)) END) AS avg_days
       FROM tasks t
       JOIN users u ON u.id = t.assignee_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY t.assignee_id, u.name, u.avatar, u.role
      ORDER BY completed DESC, total DESC`,
    [today, ...params]
  );

  const items = rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    avatar: row.avatar,
    role: row.role,
    total: Number(row.total || 0),
    completed: Number(row.completed || 0),
    open: Number(row.open_tasks || 0),
    overdue: Number(row.overdue || 0),
    avgDaysToComplete: row.avg_days === null ? 0 : Math.round(Number(row.avg_days) * 10) / 10,
    completionRate: percentage(Number(row.completed || 0), Number(row.total || 0)),
  }));

  return sendSuccess(res, items, 'Berhasil memuat laporan produktivitas');
});

/**
 * GET /api/v1/reports/burndown
 * Burndown curve for a single project, computed in JavaScript.
 */
const getBurndown = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const { project_id: projectId, from, to } = req.query;

  if (projectIds !== null && !projectIds.includes(Number(projectId))) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke proyek ini');
  }

  const project = (
    await query('SELECT id, code, name, start_date, end_date FROM projects WHERE id = ? LIMIT 1', [
      Number(projectId),
    ])
  )[0];

  if (!project) throw ApiError.notFound('Proyek tidak ditemukan');

  const startDate = from || project.start_date || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const endDate = to || project.end_date || dayjs().add(30, 'day').format('YYYY-MM-DD');

  if (dayjs(endDate).isBefore(dayjs(startDate))) {
    throw ApiError.badRequest('Rentang tanggal tidak valid: `to` harus setelah `from`');
  }

  const tasks = await query(
    `SELECT id, status, created_at, completed_at, estimated_hours
       FROM tasks
      WHERE project_id = ?`,
    [Number(projectId)]
  );

  // Weight each task by its estimate when available, otherwise count it as 1.
  const weighted = tasks.map((task) => ({
    completedAt: task.completed_at ? dayjs(task.completed_at) : null,
    estimatedHours: Number(task.estimated_hours) || 0,
    weight: Number(task.estimated_hours) > 0 ? Number(task.estimated_hours) : 1,
  }));

  const scope = weighted.reduce((sum, task) => sum + task.weight, 0);
  const hasWeights = weighted.some((task) => task.estimatedHours > 0);
  const unit = hasWeights ? 'hours' : 'tasks';

  const totalDays = Math.max(0, dayjs(endDate).diff(dayjs(startDate), 'day'));
  const series = [];

  for (let index = 0; index <= totalDays; index += 1) {
    const current = dayjs(startDate).add(index, 'day');
    const endOfDay = current.endOf('day');

    // Remaining work = the whole scope minus everything finished by that day.
    let completedWeight = 0;
    for (const task of weighted) {
      if (task.completedAt && !task.completedAt.isAfter(endOfDay)) {
        completedWeight += task.weight;
      }
    }

    const remaining = scope - completedWeight;
    const ideal = scope === 0 ? 0 : Math.round(scope * (1 - index / (totalDays || 1)) * 100) / 100;

    series.push({
      date: current.format('YYYY-MM-DD'),
      remaining: Math.round(remaining * 100) / 100,
      ideal,
      scope: Math.round(scope * 100) / 100,
    });
  }

  return sendSuccess(
    res,
    {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      from: startDate,
      to: endDate,
      unit,
      series,
    },
    'Berhasil memuat burndown proyek'
  );
});

/**
 * GET /api/v1/reports/completion-trend
 * Tasks created/completed per day over the last N days.
 */
const getCompletionTrend = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const { days, project_id: projectId } = req.query;

  if (projectId && projectIds !== null && !projectIds.includes(Number(projectId))) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke proyek ini');
  }

  const scope = projectScope(projectIds, 't.project_id');
  const conditions = [scope.sql];
  const params = [...scope.params];

  if (projectId) {
    conditions.push('t.project_id = ?');
    params.push(Number(projectId));
  }

  const startDate = dayjs()
    .subtract(Number(days) - 1, 'day')
    .startOf('day')
    .format('YYYY-MM-DD');

  // A task counts towards the window when it was created or completed in it,
  // so a long-running task finished today still shows up.
  conditions.push('(t.created_at >= ? OR t.completed_at >= ?)');
  params.push(`${startDate} 00:00:00`, `${startDate} 00:00:00`);

  const rows = await query(
    `SELECT DATE(t.created_at) AS created_day,
            DATE(t.completed_at) AS completed_day
       FROM tasks t
      WHERE ${conditions.join(' AND ')}`,
    params
  );

  const series = [];
  const index = new Map();

  for (let offset = 0; offset < Number(days); offset += 1) {
    const date = dayjs(startDate).add(offset, 'day').format('YYYY-MM-DD');
    const entry = { date, completed: 0, created: 0 };
    series.push(entry);
    index.set(date, entry);
  }

  for (const row of rows) {
    if (row.created_day) {
      const entry = index.get(dayjs(row.created_day).format('YYYY-MM-DD'));
      if (entry) entry.created += 1;
    }
    if (row.completed_day) {
      const entry = index.get(dayjs(row.completed_day).format('YYYY-MM-DD'));
      if (entry) entry.completed += 1;
    }
  }

  return sendSuccess(res, series, 'Berhasil memuat tren penyelesaian');
});

/**
 * Escape a single CSV cell.
 * @param {any} value
 * @returns {string}
 */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * GET /api/v1/reports/export
 * Streams a CSV export of tasks or projects.
 */
const exportReport = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const { type, project_id: projectId } = req.query;

  if (projectId && projectIds !== null && !projectIds.includes(Number(projectId))) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke proyek ini');
  }

  const scope = projectScope(projectIds, type === 'projects' ? 'p.id' : 't.project_id');
  const conditions = [scope.sql];
  const params = [...scope.params];

  if (projectId) {
    conditions.push(type === 'projects' ? 'p.id = ?' : 't.project_id = ?');
    params.push(Number(projectId));
  }

  let header;
  let rows;

  if (type === 'projects') {
    header = [
      'ID',
      'Kode',
      'Nama Proyek',
      'Status',
      'Prioritas',
      'Progres',
      'Anggaran',
      'Mulai',
      'Selesai',
      'Manajer',
    ];
    rows = await query(
      `SELECT p.id, p.code, p.name, p.status, p.priority, p.progress, p.budget,
              p.start_date, p.end_date, u.name AS manager_name
         FROM projects p
         LEFT JOIN users u ON u.id = p.manager_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.name ASC`,
      params
    );
  } else {
    header = [
      'ID',
      'Judul',
      'Kode Proyek',
      'Nama Proyek',
      'Status',
      'Prioritas',
      'Assignee',
      'Reporter',
      'Mulai',
      'Deadline',
      'Selesai',
      'Estimasi (jam)',
      'Aktual (jam)',
      'Progres',
    ];
    rows = await query(
      `SELECT t.id, t.title, p.code AS project_code, p.name AS project_name, t.status, t.priority,
              a.name AS assignee_name, r.name AS reporter_name,
              t.start_date, t.due_date, t.completed_at,
              t.estimated_hours, t.actual_hours, t.progress
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN users a ON a.id = t.assignee_id
         LEFT JOIN users r ON r.id = t.reporter_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY t.id ASC`,
      params
    );
  }

  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    if (type === 'projects') {
      lines.push(
        [
          row.id,
          row.code,
          row.name,
          row.status,
          row.priority,
          row.progress,
          row.budget,
          row.start_date,
          row.end_date,
          row.manager_name,
        ]
          .map(csvCell)
          .join(',')
      );
    } else {
      lines.push(
        [
          row.id,
          row.title,
          row.project_code,
          row.project_name,
          row.status,
          row.priority,
          row.assignee_name,
          row.reporter_name,
          row.start_date,
          row.due_date,
          row.completed_at,
          row.estimated_hours,
          row.actual_hours,
          row.progress,
        ]
          .map(csvCell)
          .join(',')
      );
    }
  }

  const filename = `${type}-${dayjs().format('YYYY-MM-DD')}.csv`;
  const csv = `\uFEFF${lines.join('\r\n')}\r\n`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});

/**
 * Compute S-Curve & EVM time series and summary indices for a single project.
 *
 * @param {number} projectId
 * @param {object} [options]
 * @param {string} [options.from]
 * @param {string} [options.to]
 * @param {'daily'|'weekly'} [options.interval]
 */
async function computeProjectEvmData(projectId, options = {}) {
  const { from, to, interval = 'daily' } = options;

  const projectRows = await query(
    `SELECT id, code, name, status, progress, budget, start_date, end_date
       FROM projects
      WHERE id = ?
      LIMIT 1`,
    [Number(projectId)]
  );
  const project = projectRows[0];
  if (!project) throw ApiError.notFound('Proyek tidak ditemukan');

  const [rawTasks, directExpenses] = await Promise.all([
    query(
      `SELECT t.id, t.parent_id, t.title, t.status, t.priority, t.progress,
              t.start_date, t.due_date, t.created_at, t.completed_at, t.updated_at,
              t.estimated_hours, t.estimated_cost, t.actual_cost,
              COALESCE(ps.progress, 0) AS status_progress,
              COALESCE(ps.category, '') AS status_category
         FROM tasks t
         LEFT JOIN project_statuses ps ON ps.project_id = t.project_id AND ps.key_name = t.status
        WHERE t.project_id = ?
        ORDER BY t.start_date ASC, t.id ASC`,
      [Number(projectId)]
    ),
    query(
      `SELECT id, amount, expense_date
         FROM project_expenses
        WHERE project_id = ? AND task_id IS NULL AND status = 'approved'
        ORDER BY expense_date ASC`,
      [Number(projectId)]
    ),
  ]);

  const progressMap = computeTaskProgressMap(rawTasks);
  const today = dayjs().format('YYYY-MM-DD');

  const totalTaskEstimatedCost = rawTasks.reduce((sum, t) => sum + (Number(t.estimated_cost) || 0), 0);
  const projectBudget = Number(project.budget) || 0;
  const totalHours = rawTasks.reduce((sum, t) => sum + (Number(t.estimated_hours) || 0), 0);
  const hasCostBaseline = totalTaskEstimatedCost > 0;

  // Determine Budget at Completion (BAC) and baseline value per task
  let bac = 0;
  if (hasCostBaseline) {
    bac = totalTaskEstimatedCost;
  } else if (projectBudget > 0) {
    bac = projectBudget;
  } else if (totalHours > 0) {
    bac = totalHours;
  } else {
    bac = rawTasks.length > 0 ? rawTasks.length * 100 : 100;
  }

  // Find min/max dates across tasks and project
  let earliestDate = project.start_date ? dayjs(project.start_date).format('YYYY-MM-DD') : null;
  let latestDate = project.end_date ? dayjs(project.end_date).format('YYYY-MM-DD') : null;

  for (const t of rawTasks) {
    const tStart = t.start_date ? dayjs(t.start_date).format('YYYY-MM-DD') : dayjs(t.created_at).format('YYYY-MM-DD');
    const tDue = t.due_date ? dayjs(t.due_date).format('YYYY-MM-DD') : null;
    if (!earliestDate || dayjs(tStart).isBefore(dayjs(earliestDate))) earliestDate = tStart;
    if (tDue && (!latestDate || dayjs(tDue).isAfter(dayjs(latestDate)))) latestDate = tDue;
  }

  const startDate = from || earliestDate || today;
  let endDate = to || latestDate || dayjs(startDate).add(30, 'day').format('YYYY-MM-DD');
  if (dayjs(endDate).isBefore(dayjs(startDate))) {
    endDate = dayjs(startDate).add(30, 'day').format('YYYY-MM-DD');
  }

  // Prepare normalized task objects
  const tasks = rawTasks.map((t) => {
    let baselineValue = 0;
    if (hasCostBaseline) {
      baselineValue = Number(t.estimated_cost) || 0;
    } else if (projectBudget > 0) {
      if (totalHours > 0) {
        baselineValue = Math.round(((Number(t.estimated_hours) || 0) / totalHours) * projectBudget);
      } else {
        baselineValue = rawTasks.length > 0 ? Math.round(projectBudget / rawTasks.length) : 0;
      }
    } else if (totalHours > 0) {
      baselineValue = Number(t.estimated_hours) || 0;
    } else {
      baselineValue = 100;
    }

    const tStart = t.start_date
      ? dayjs(t.start_date).format('YYYY-MM-DD')
      : dayjs(t.created_at).format('YYYY-MM-DD');
    const tDue = t.due_date
      ? dayjs(t.due_date).format('YYYY-MM-DD')
      : endDate;
    const taskStart = dayjs(tStart).isBefore(dayjs(startDate)) ? startDate : tStart;
    let taskDue = dayjs(tDue).isAfter(dayjs(endDate)) ? endDate : tDue;
    if (dayjs(taskDue).isBefore(dayjs(taskStart))) taskDue = taskStart;

    const durationDays = Math.max(1, dayjs(taskDue).diff(dayjs(taskStart), 'day') + 1);
    const resolvedProgress = Math.min(100, Math.max(0, (progressMap.get(t.id) ?? Number(t.progress)) || 0));
    const completedAt = t.completed_at ? dayjs(t.completed_at).format('YYYY-MM-DD') : null;
    const actualCost = Number(t.actual_cost) || 0;

    return {
      id: t.id,
      title: t.title,
      baselineValue,
      taskStart,
      taskDue,
      durationDays,
      progress: resolvedProgress,
      completedAt,
      actualCost,
      status: t.status,
    };
  });

  const totalDays = Math.max(0, dayjs(endDate).diff(dayjs(startDate), 'day'));
  const dailyPoints = [];

  for (let offset = 0; offset <= totalDays; offset += 1) {
    const current = dayjs(startDate).add(offset, 'day');
    const curDateStr = current.format('YYYY-MM-DD');
    const isPastOrToday = !current.isAfter(dayjs(today), 'day');

    // Planned Value on date current
    let pv = 0;
    for (const t of tasks) {
      if (!current.isBefore(dayjs(t.taskStart), 'day')) {
        if (!current.isBefore(dayjs(t.taskDue), 'day')) {
          pv += t.baselineValue;
        } else {
          const daysPassed = current.diff(dayjs(t.taskStart), 'day') + 1;
          pv += t.baselineValue * Math.min(1, Math.max(0, daysPassed / t.durationDays));
        }
      }
    }

    // Earned Value and Actual Cost only calculated up to today
    let ev = null;
    let ac = null;

    if (isPastOrToday) {
      ev = 0;
      ac = 0;

      // Sum task EV
      for (const t of tasks) {
        if (t.status === 'done' || t.completedAt || t.progress >= 100) {
          const compDate = t.completedAt && !dayjs(t.completedAt).isAfter(dayjs(today))
            ? t.completedAt
            : curDateStr;
          if (!current.isBefore(dayjs(t.taskStart), 'day')) {
            if (!current.isBefore(dayjs(compDate), 'day')) {
              ev += t.baselineValue;
            } else {
              const activeDur = Math.max(1, dayjs(compDate).diff(dayjs(t.taskStart), 'day') + 1);
              const daysPassed = current.diff(dayjs(t.taskStart), 'day') + 1;
              ev += t.baselineValue * Math.min(1, Math.max(0, daysPassed / activeDur));
            }
          }
        } else if (t.progress > 0) {
          const earnedSoFar = t.baselineValue * (t.progress / 100);
          if (!current.isBefore(dayjs(t.taskStart), 'day')) {
            if (!current.isBefore(dayjs(today), 'day')) {
              ev += earnedSoFar;
            } else {
              const activeDur = Math.max(1, dayjs(today).diff(dayjs(t.taskStart), 'day') + 1);
              const daysPassed = current.diff(dayjs(t.taskStart), 'day') + 1;
              ev += earnedSoFar * Math.min(1, Math.max(0, daysPassed / activeDur));
            }
          }
        }

        // Sum task AC
        if (t.actualCost > 0) {
          const activeEnd = t.completedAt && !dayjs(t.completedAt).isAfter(dayjs(today))
            ? t.completedAt
            : today;
          if (!current.isBefore(dayjs(t.taskStart), 'day')) {
            if (!current.isBefore(dayjs(activeEnd), 'day')) {
              ac += t.actualCost;
            } else {
              const activeDur = Math.max(1, dayjs(activeEnd).diff(dayjs(t.taskStart), 'day') + 1);
              const daysPassed = current.diff(dayjs(t.taskStart), 'day') + 1;
              ac += t.actualCost * Math.min(1, Math.max(0, daysPassed / activeDur));
            }
          }
        }
      }

      // Sum direct approved expenses where expense_date <= current
      for (const exp of directExpenses) {
        if (!dayjs(exp.expense_date).isAfter(current, 'day')) {
          ac += Number(exp.amount) || 0;
        }
      }

      ev = Math.round(ev * 100) / 100;
      ac = Math.round(ac * 100) / 100;
    }

    pv = Math.round(pv * 100) / 100;

    dailyPoints.push({
      date: curDateStr,
      pv,
      ev,
      ac,
      pvPercent: bac > 0 ? Math.round((pv / bac) * 1000) / 10 : 0,
      evPercent: ev !== null && bac > 0 ? Math.round((ev / bac) * 1000) / 10 : null,
      acPercent: ac !== null && bac > 0 ? Math.round((ac / bac) * 1000) / 10 : null,
    });
  }

  // Sample or aggregate by weekly interval if requested
  let series = dailyPoints;
  if (interval === 'weekly' && dailyPoints.length > 14) {
    const weeklyPoints = [];
    const dateLookup = new Map();
    dailyPoints.forEach((p) => dateLookup.set(p.date, p));

    weeklyPoints.push(dailyPoints[0]);

    for (let i = 7; i < dailyPoints.length - 1; i += 7) {
      weeklyPoints.push(dailyPoints[i]);
    }

    const todayPoint = dateLookup.get(today);
    if (todayPoint && !weeklyPoints.some((p) => p.date === today)) {
      weeklyPoints.push(todayPoint);
      weeklyPoints.sort((a, b) => a.date.localeCompare(b.date));
    }

    const lastPoint = dailyPoints[dailyPoints.length - 1];
    if (!weeklyPoints.some((p) => p.date === lastPoint.date)) {
      weeklyPoints.push(lastPoint);
    }

    series = weeklyPoints;
  }

  const statusDate = dayjs(today).isAfter(dayjs(endDate))
    ? endDate
    : dayjs(today).isBefore(dayjs(startDate))
      ? startDate
      : today;

  const currentPvPoint = dailyPoints.find((p) => p.date === statusDate) || dailyPoints[dailyPoints.length - 1] || { pv: 0 };
  const currentPv = Number(currentPvPoint?.pv || 0);

  const currentEv = Math.round(
    tasks.reduce((sum, t) => sum + t.baselineValue * (t.progress / 100), 0) * 100
  ) / 100;

  const directApprovedSum = directExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const taskAcSum = tasks.reduce((sum, t) => sum + t.actualCost, 0);
  const currentAc = Math.round((taskAcSum + directApprovedSum) * 100) / 100;

  const cv = Math.round((currentEv - currentAc) * 100) / 100;
  const sv = Math.round((currentEv - currentPv) * 100) / 100;

  const cpi = currentAc > 0 ? Math.round((currentEv / currentAc) * 100) / 100 : (currentEv > 0 ? 1 : null);
  const spi = currentPv > 0 ? Math.round((currentEv / currentPv) * 100) / 100 : (currentEv > 0 ? 1 : null);

  let eac = bac;
  if (cpi && cpi > 0) {
    eac = Math.round(bac / cpi);
  } else {
    eac = Math.round(currentAc + Math.max(0, bac - currentEv));
  }

  const etc = Math.max(0, eac - currentAc);
  const vac = Math.round((bac - eac) * 100) / 100;

  const summary = {
    bac: Math.round(bac),
    pv: currentPv,
    ev: currentEv,
    ac: currentAc,
    cv,
    sv,
    cpi,
    spi,
    eac,
    etc,
    vac,
    plannedProgress: bac > 0 ? Math.round((currentPv / bac) * 1000) / 10 : 0,
    earnedProgress: bac > 0 ? Math.round((currentEv / bac) * 1000) / 10 : 0,
    actualCostRate: bac > 0 ? Math.round((currentAc / bac) * 1000) / 10 : 0,
    statusDate,
    unit: hasCostBaseline || projectBudget > 0 ? 'currency' : 'weight',
  };

  return {
    projectId: project.id,
    projectCode: project.code,
    projectName: project.name,
    projectStatus: project.status,
    startDate,
    endDate,
    interval,
    summary,
    series,
  };
}

/**
 * GET /api/v1/reports/evm
 * S-Curve and EVM metrics for a single project.
 */
const getEvm = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const { project_id: projectId, from, to, interval } = req.query;

  if (projectIds !== null && !projectIds.includes(Number(projectId))) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke proyek ini');
  }

  const data = await computeProjectEvmData(Number(projectId), { from, to, interval });
  return sendSuccess(res, data, 'Berhasil memuat data Kurva-S & EVM proyek');
});

/**
 * GET /api/v1/reports/executive
 * Complete executive status report data (KPI, budget summary, EVM, milestones, overdue tasks).
 */
const getExecutiveReport = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const { project_id: projectId, from, to } = req.query;

  if (projectId && projectIds !== null && !projectIds.includes(Number(projectId))) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke proyek ini');
  }

  const effectiveProjectIds = projectId ? [Number(projectId)] : projectIds;
  const today = dayjs().format('YYYY-MM-DD');

  const projectFilter = projectScope(effectiveProjectIds, 'p.id');
  const taskFilter = projectScope(effectiveProjectIds, 't.project_id');
  const milestoneFilter = projectScope(effectiveProjectIds, 'm.project_id');
  const expenseFilter = projectScope(effectiveProjectIds, 'pe.project_id');

  const [
    projectRow,
    taskRow,
    financialRow,
    milestoneRows,
    overdueRows,
    projectRows,
    statusRows,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END), 0) AS active,
              COALESCE(SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
              COALESCE(SUM(CASE WHEN p.status = 'planning' THEN 1 ELSE 0 END), 0) AS planning,
              COALESCE(SUM(CASE WHEN p.status = 'on_hold' THEN 1 ELSE 0 END), 0) AS on_hold,
              AVG(p.progress) AS avg_progress
         FROM projects p
        WHERE ${projectFilter.sql}`,
      projectFilter.params
    ),
    query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS done,
              COALESCE(SUM(CASE WHEN t.status <> 'done' THEN 1 ELSE 0 END), 0) AS open_tasks,
              COALESCE(SUM(CASE WHEN t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < ?
                             THEN 1 ELSE 0 END), 0) AS overdue,
              COALESCE(SUM(CASE WHEN t.completed_at IS NOT NULL AND t.completed_at <= t.due_date
                             THEN 1 ELSE 0 END), 0) AS on_time,
              COALESCE(SUM(CASE WHEN t.completed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS completed,
              AVG(CASE WHEN t.completed_at IS NOT NULL
                       THEN GREATEST(0, TIMESTAMPDIFF(DAY, t.created_at, t.completed_at)) END) AS avg_duration
         FROM tasks t
        WHERE ${taskFilter.sql}`,
      [today, ...taskFilter.params]
    ),
    query(
      `SELECT
         COALESCE(SUM(p.budget), 0) AS total_budget,
         (SELECT COALESCE(SUM(t.estimated_cost), 0) FROM tasks t WHERE ${taskFilter.sql}) AS total_estimated_cost,
         (SELECT COALESCE(SUM(t.actual_cost), 0) FROM tasks t WHERE ${taskFilter.sql}) AS total_task_actual_cost,
         (SELECT COALESCE(SUM(pe.amount), 0) FROM project_expenses pe WHERE ${expenseFilter.sql} AND pe.task_id IS NULL AND pe.status = 'approved') AS total_direct_expenses,
         (SELECT COALESCE(SUM(pe.amount), 0) FROM project_expenses pe WHERE ${expenseFilter.sql} AND pe.status = 'pending') AS total_pending_expenses,
         (SELECT COUNT(*) FROM project_expenses pe WHERE ${expenseFilter.sql} AND pe.status = 'pending') AS pending_expense_count
       FROM projects p
      WHERE ${projectFilter.sql}`,
      [...taskFilter.params, ...taskFilter.params, ...expenseFilter.params, ...expenseFilter.params, ...expenseFilter.params, ...projectFilter.params]
    ),
    query(
      `SELECT m.id, m.name, m.description, m.due_date, m.status, m.progress,
              p.id AS project_id, p.code AS project_code, p.name AS project_name
         FROM milestones m
         JOIN projects p ON p.id = m.project_id
        WHERE ${milestoneFilter.sql}
        ORDER BY m.due_date IS NULL ASC, m.due_date ASC, m.id ASC
        LIMIT 100`,
      milestoneFilter.params
    ),
    query(
      `SELECT t.id, t.title, t.priority, t.status, t.due_date, t.progress,
              t.estimated_cost, t.actual_cost,
              DATEDIFF(?, t.due_date) AS days_overdue,
              p.id AS project_id, p.code AS project_code, p.name AS project_name,
              u.name AS assignee_name, u.avatar AS assignee_avatar
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN users u ON u.id = t.assignee_id
        WHERE t.status <> 'done'
          AND t.due_date IS NOT NULL
          AND t.due_date < ?
          AND ${taskFilter.sql}
        ORDER BY t.due_date ASC
        LIMIT 100`,
      [today, today, ...taskFilter.params]
    ),
    query(
      `SELECT p.id, p.code, p.name, p.status, p.priority, p.progress, p.color, p.budget,
              p.start_date, p.end_date, u.name AS manager_name,
              ((SELECT IFNULL(SUM(t_ac.actual_cost), 0) FROM tasks t_ac WHERE t_ac.project_id = p.id) +
               (SELECT IFNULL(SUM(pe_dir.amount), 0) FROM project_expenses pe_dir WHERE pe_dir.project_id = p.id AND pe_dir.task_id IS NULL AND pe_dir.status = 'approved')) AS actual_cost,
              (SELECT IFNULL(SUM(t_ec.estimated_cost), 0) FROM tasks t_ec WHERE t_ec.project_id = p.id) AS total_estimated_cost,
              COUNT(t.id) AS task_count,
              COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS completed_count
         FROM projects p
         LEFT JOIN users u ON u.id = p.manager_id
         LEFT JOIN tasks t ON t.project_id = p.id
        WHERE ${projectFilter.sql}
        GROUP BY p.id, p.code, p.name, p.status, p.priority, p.progress, p.color, p.budget, p.start_date, p.end_date, u.name
        ORDER BY task_count DESC, p.name ASC`,
      projectFilter.params
    ),
    query(
      `SELECT t.status, COUNT(*) AS count
         FROM tasks t
        WHERE ${taskFilter.sql}
        GROUP BY t.status`,
      taskFilter.params
    ),
  ]);

  const pStats = projectRow[0] || {};
  const tStats = taskRow[0] || {};
  const fin = financialRow[0] || {};

  const totalBudget = Number(fin.total_budget || 0);
  const totalEstimatedCost = Number(fin.total_estimated_cost || 0);
  const totalDirectExpenses = Number(fin.total_direct_expenses || 0);
  const totalTaskActualCost = Number(fin.total_task_actual_cost || 0);
  const totalActualCost = totalTaskActualCost + totalDirectExpenses;
  const remainingBudget = totalBudget > 0 ? Math.max(0, totalBudget - totalActualCost) : 0;
  const budgetUtilizationRate = totalBudget > 0 ? Math.round((totalActualCost / totalBudget) * 1000) / 10 : 0;

  // If a single project is selected, load its full EVM curve
  let evmData = null;
  if (projectId) {
    try {
      evmData = await computeProjectEvmData(Number(projectId), { from, to });
    } catch {
      evmData = null;
    }
  } else if (projectRows.length > 0) {
    // Or load EVM for the most active project as executive sample
    try {
      evmData = await computeProjectEvmData(Number(projectRows[0].id), { from, to });
    } catch {
      evmData = null;
    }
  }

  const selectedProject = projectId ? projectRows.find((p) => Number(p.id) === Number(projectId)) || null : null;

  const payload = {
    generatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    generatedBy: {
      id: req.user.id,
      name: req.user.name,
      role: req.user.role,
      email: req.user.email,
    },
    scope: {
      isSingleProject: Boolean(projectId),
      project: selectedProject,
      from: from || null,
      to: to || null,
    },
    kpi: {
      totalProjects: Number(pStats.total || 0),
      activeProjects: Number(pStats.active || 0),
      completedProjects: Number(pStats.completed || 0),
      planningProjects: Number(pStats.planning || 0),
      onHoldProjects: Number(pStats.on_hold || 0),
      avgProgress: pStats.avg_progress === null ? 0 : Math.round(Number(pStats.avg_progress) * 10) / 10,
      totalTasks: Number(tStats.total || 0),
      doneTasks: Number(tStats.done || 0),
      openTasks: Number(tStats.open_tasks || 0),
      overdueTasks: Number(tStats.overdue || 0),
      completionRate: percentage(Number(tStats.done || 0), Number(tStats.total || 0)),
      onTimeCompletionRate: percentage(Number(tStats.on_time || 0), Number(tStats.completed || 0)),
      avgTaskDuration: tStats.avg_duration === null ? 0 : Math.round(Number(tStats.avg_duration) * 10) / 10,
    },
    financials: {
      totalBudget,
      totalEstimatedCost,
      totalActualCost,
      remainingBudget,
      budgetUtilizationRate,
      pendingExpensesAmount: Number(fin.total_pending_expenses || 0),
      pendingExpensesCount: Number(fin.pending_expense_count || 0),
    },
    evm: evmData,
    milestones: milestoneRows.map((m) => ({
      id: m.id,
      projectId: m.project_id,
      projectCode: m.project_code,
      projectName: m.project_name,
      name: m.name,
      description: m.description,
      dueDate: m.due_date ? dayjs(m.due_date).format('YYYY-MM-DD') : null,
      status: m.status,
      progress: Number(m.progress || 0),
    })),
    overdueTasks: overdueRows.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      dueDate: t.due_date ? dayjs(t.due_date).format('YYYY-MM-DD') : null,
      daysOverdue: Math.max(0, Number(t.days_overdue || 0)),
      progress: Number(t.progress || 0),
      estimatedCost: Number(t.estimated_cost || 0),
      actualCost: Number(t.actual_cost || 0),
      projectId: t.project_id,
      projectCode: t.project_code,
      projectName: t.project_name,
      assigneeName: t.assignee_name,
      assigneeAvatar: t.assignee_avatar,
    })),
    projectBreakdown: projectRows.map((p) => {
      const pBudget = Number(p.budget || 0);
      const pActual = Number(p.actual_cost || 0);
      const pEstCost = Number(p.total_estimated_cost || 0);
      const taskCount = Number(p.task_count || 0);
      const completedCount = Number(p.completed_count || 0);
      const bacVal = pEstCost > 0 ? pEstCost : pBudget;
      const progressVal = Number(p.progress || 0);
      const evVal = Math.round(bacVal * (progressVal / 100));
      const cpiVal = pActual > 0 ? Math.round((evVal / pActual) * 100) / 100 : (evVal > 0 ? 1 : null);

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        statusLabel: PROJECT_STATUS[p.status]?.label || p.status,
        priority: p.priority,
        progress: progressVal,
        color: p.color,
        budget: pBudget,
        estimatedCost: pEstCost,
        actualCost: pActual,
        taskCount,
        completedCount,
        completionRate: percentage(completedCount, taskCount),
        startDate: p.start_date ? dayjs(p.start_date).format('YYYY-MM-DD') : null,
        endDate: p.end_date ? dayjs(p.end_date).format('YYYY-MM-DD') : null,
        managerName: p.manager_name,
        cpi: cpiVal,
      };
    }),
  };

  return sendSuccess(res, payload, 'Berhasil memuat laporan eksekutif');
});

module.exports = {
  getOverview,
  getStatusDistribution,
  getProductivity,
  getBurndown,
  getEvm,
  getExecutiveReport,
  getCompletionTrend,
  exportReport,
};

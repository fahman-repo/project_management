'use strict';

const dayjs = require('dayjs');
const { query } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const { accessibleProjectIds } = require('../services/accessService');
const { inPlaceholders } = require('../models/base');
const { TASK_STATUS, PROJECT_STATUS } = require('../config/constants');

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
  const today = dayjs().format('YYYY-MM-DD');
  const projectFilter = projectScope(projectIds, 'p.id');
  const taskFilter = projectScope(projectIds, 't.project_id');

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
               (SELECT IFNULL(SUM(pe_dir.amount), 0) FROM project_expenses pe_dir WHERE pe_dir.project_id = p.id AND pe_dir.task_id IS NULL)) AS actual_cost,
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
         (SELECT COALESCE(SUM(pe.amount), 0) FROM project_expenses pe WHERE ${projectScope(projectIds, 'pe.project_id').sql} AND pe.task_id IS NULL) AS total_direct_expenses
       FROM projects p
      WHERE ${projectFilter.sql}`,
      [...taskFilter.params, ...taskFilter.params, ...projectScope(projectIds, 'pe.project_id').params, ...projectFilter.params]
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

module.exports = {
  getOverview,
  getStatusDistribution,
  getProductivity,
  getBurndown,
  getCompletionTrend,
  exportReport,
};

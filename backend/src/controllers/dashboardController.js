'use strict';

const dayjs = require('dayjs');
const { query } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { accessibleProjectIds } = require('../services/accessService');
const { inPlaceholders } = require('../models/base');
const { TASK_STATUS, PRIORITY } = require('../config/constants');

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

/**
 * Join WHERE fragments into a single clause.
 * @param {Array<{sql:string, params:any[]}>} fragments
 * @returns {{sql:string, params:any[]}}
 */
function where(fragments) {
  const active = fragments.filter(Boolean);
  if (!active.length) return { sql: '', params: [] };
  return {
    sql: `WHERE ${active.map((fragment) => fragment.sql).join(' AND ')}`,
    params: active.flatMap((fragment) => fragment.params),
  };
}

/**
 * Scope the activity feed the same way the activities endpoint does:
 * admins see everything, others see their own actions plus their projects.
 * @param {number[]|null} projectIds
 * @param {number} userId
 * @returns {{sql:string, params:any[]}}
 */
function activityScope(projectIds, userId) {
  if (projectIds === null) return { sql: '1 = 1', params: [] };
  if (!projectIds.length) return { sql: 'a.user_id = ?', params: [userId] };
  return {
    sql: `(a.user_id = ? OR a.project_id IN (${inPlaceholders(projectIds)}))`,
    params: [userId, ...projectIds],
  };
}

/** Percentage rounded to one decimal, safe for an empty denominator. */
function percentage(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/**
 * GET /api/v1/dashboard/stats
 * The main KPI payload shown on the dashboard home screen.
 */
const getStats = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);

  const today = dayjs().format('YYYY-MM-DD');
  const weekStart = dayjs()
    .subtract((dayjs().day() + 6) % 7, 'day')
    .startOf('day')
    .format('YYYY-MM-DD 00:00:00');

  const projectWhere = where([projectScope(projectIds, 'p.id')]);
  const taskWhere = where([projectScope(projectIds, 't.project_id')]);
  const memberWhere = where([projectScope(projectIds, 'pm.project_id')]);
  const activityFilter = activityScope(projectIds, req.user.id);
  const deadlineScopeSql = projectScope(projectIds, 't.project_id');

  const [projectRows, taskRows, teamRows, statusRows, priorityRows, projectProgressRows, activityRows, deadlineRows] =
    await Promise.all([
      query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END), 0) AS active,
                COALESCE(SUM(CASE WHEN p.status = 'planning' THEN 1 ELSE 0 END), 0) AS planning,
                COALESCE(SUM(CASE WHEN p.status = 'on_hold' THEN 1 ELSE 0 END), 0) AS on_hold,
                COALESCE(SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
                COALESCE(SUM(CASE WHEN p.end_date IS NOT NULL AND p.end_date < ?
                                   AND p.status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END), 0) AS overdue,
                AVG(p.progress) AS avg_progress
           FROM projects p
           ${projectWhere.sql}`,
        [today, ...projectWhere.params]
      ),
      query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END), 0) AS todo,
                COALESCE(SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END), 0) AS in_progress,
                COALESCE(SUM(CASE WHEN t.status = 'review' THEN 1 ELSE 0 END), 0) AS review,
                COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS done,
                COALESCE(SUM(CASE WHEN t.status = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked,
                COALESCE(SUM(CASE WHEN t.due_date IS NOT NULL AND t.due_date < ?
                                   AND t.status <> 'done' THEN 1 ELSE 0 END), 0) AS overdue,
                COALESCE(SUM(CASE WHEN t.completed_at IS NOT NULL AND t.completed_at >= ?
                                   THEN 1 ELSE 0 END), 0) AS completed_this_week
           FROM tasks t
           ${taskWhere.sql}`,
        [today, weekStart, ...taskWhere.params]
      ),
      query(
        `SELECT COUNT(DISTINCT pm.user_id) AS total_members,
                COUNT(DISTINCT CASE WHEN u.is_active = 1 THEN pm.user_id END) AS active_members
           FROM project_members pm
           JOIN users u ON u.id = pm.user_id
           ${memberWhere.sql}`,
        memberWhere.params
      ),
      query(
        `SELECT t.status, COUNT(*) AS count
           FROM tasks t
           ${taskWhere.sql}
          GROUP BY t.status`,
        taskWhere.params
      ),
      query(
        `SELECT t.priority, COUNT(*) AS count
           FROM tasks t
           ${taskWhere.sql}
          GROUP BY t.priority`,
        taskWhere.params
      ),
      query(
        `SELECT p.id, p.code, p.name, p.status, p.progress, p.color,
                COUNT(t.id) AS task_count,
                COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS completed_count
           FROM projects p
           LEFT JOIN tasks t ON t.project_id = p.id
           ${projectWhere.sql}
          GROUP BY p.id, p.code, p.name, p.status, p.progress, p.color
          ORDER BY p.progress DESC, p.name ASC`,
        projectWhere.params
      ),
      query(
        `SELECT a.id, a.user_id, a.project_id, a.task_id, a.action, a.entity_type, a.entity_id,
                a.description, a.metadata, a.created_at,
                u.name AS user_name, u.avatar AS user_avatar
           FROM activities a
           LEFT JOIN users u ON u.id = a.user_id
          WHERE ${activityFilter.sql}
          ORDER BY a.id DESC
          LIMIT 5`,
        activityFilter.params
      ),
      query(
        `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.start_date, t.project_id,
                p.name AS project_name, p.code AS project_code, p.color AS project_color,
                u.name AS assignee_name
           FROM tasks t
           JOIN projects p ON p.id = t.project_id
           LEFT JOIN users u ON u.id = t.assignee_id
          WHERE t.status <> 'done'
            AND t.due_date IS NOT NULL
            AND ${deadlineScopeSql.sql}
          ORDER BY t.due_date ASC, t.id ASC
          LIMIT 8`,
        deadlineScopeSql.params
      ),
    ]);

  const projects = projectRows[0] || {};
  const tasks = taskRows[0] || {};
  const team = teamRows[0] || {};

  const statusDistribution = Object.keys(TASK_STATUS).map((status) => {
    const found = statusRows.find((row) => row.status === status);
    return {
      status,
      label: TASK_STATUS[status].label,
      count: found ? Number(found.count) : 0,
      color: TASK_STATUS[status].color,
    };
  });

  const priorityDistribution = Object.keys(PRIORITY).map((priority) => {
    const found = priorityRows.find((row) => row.priority === priority);
    return {
      priority,
      label: PRIORITY[priority].label,
      count: found ? Number(found.count) : 0,
      color: PRIORITY[priority].color,
    };
  });

  const payload = {
    projects: {
      total: Number(projects.total || 0),
      active: Number(projects.active || 0),
      planning: Number(projects.planning || 0),
      on_hold: Number(projects.on_hold || 0),
      completed: Number(projects.completed || 0),
      overdue: Number(projects.overdue || 0),
    },
    tasks: {
      total: Number(tasks.total || 0),
      todo: Number(tasks.todo || 0),
      in_progress: Number(tasks.in_progress || 0),
      review: Number(tasks.review || 0),
      done: Number(tasks.done || 0),
      blocked: Number(tasks.blocked || 0),
      overdue: Number(tasks.overdue || 0),
      completedThisWeek: Number(tasks.completed_this_week || 0),
    },
    team: {
      totalMembers: Number(team.total_members || 0),
      activeMembers: Number(team.active_members || 0),
    },
    completionRate: percentage(Number(tasks.done || 0), Number(tasks.total || 0)),
    avgProgress: projects.avg_progress === null ? 0 : Math.round(Number(projects.avg_progress) * 10) / 10,
    statusDistribution,
    priorityDistribution,
    projectProgress: projectProgressRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      progress: Number(row.progress || 0),
      color: row.color,
      taskCount: Number(row.task_count || 0),
      completedCount: Number(row.completed_count || 0),
    })),
    recentActivity: activityRows,
    upcomingDeadlines: deadlineRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      due_date: row.due_date,
      project_id: row.project_id,
      project_name: row.project_name,
      project_code: row.project_code,
      project_color: row.project_color,
      assignee_name: row.assignee_name,
    })),
  };

  return sendSuccess(res, payload, 'Berhasil memuat statistik dashboard');
});

/**
 * GET /api/v1/dashboard/my-tasks
 * The current user's tasks grouped by status.
 */
const getMyTasks = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const today = dayjs().format('YYYY-MM-DD');

  const scope = projectScope(projectIds, 't.project_id');

  const rows = await query(
    `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.start_date, t.progress, t.project_id,
            p.name AS project_name, p.code AS project_code, p.color AS project_color,
            u.name AS assignee_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.assignee_id = ? AND ${scope.sql}
      ORDER BY t.due_date IS NULL ASC, t.due_date ASC, t.id ASC`,
    [req.user.id, ...scope.params]
  );

  const groups = {
    todo: [],
    in_progress: [],
    review: [],
    blocked: [],
    done: [],
    dueToday: [],
    overdue: [],
  };

  for (const row of rows) {
    const task = {
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      due_date: row.due_date,
      start_date: row.start_date,
      progress: Number(row.progress || 0),
      project_id: row.project_id,
      project_name: row.project_name,
      project_code: row.project_code,
      project_color: row.project_color,
      assignee_name: row.assignee_name,
    };

    if (groups[row.status]) groups[row.status].push(task);
    if (row.due_date === today) groups.dueToday.push(task);
    if (row.due_date && row.due_date < today && row.status !== 'done') groups.overdue.push(task);
  }

  return sendSuccess(res, groups, 'Berhasil memuat tugas saya');
});

/**
 * GET /api/v1/dashboard/project-progress
 * Lightweight list used by the live progress chart.
 */
const getProjectProgress = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const scope = projectScope(projectIds, 'p.id');

  const rows = await query(
    `SELECT p.id, p.code, p.name, p.status, p.progress, p.color
       FROM projects p
      WHERE ${scope.sql}
      ORDER BY p.name ASC`,
    scope.params
  );

  const items = rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    progress: Number(row.progress || 0),
    color: row.color,
  }));

  return sendSuccess(res, items, 'Berhasil memuat progres proyek');
});

/**
 * GET /api/v1/dashboard/workload
 * Per-member workload, busiest member first.
 */
const getWorkload = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const today = dayjs().format('YYYY-MM-DD');
  const scope = projectScope(projectIds, 't.project_id');

  const rows = await query(
    `SELECT t.assignee_id AS user_id, u.name, u.avatar, u.role,
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END), 0) AS todo,
            COALESCE(SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END), 0) AS in_progress,
            COALESCE(SUM(CASE WHEN t.status = 'review' THEN 1 ELSE 0 END), 0) AS review,
            COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS done,
            COALESCE(SUM(CASE WHEN t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < ?
                               THEN 1 ELSE 0 END), 0) AS overdue
       FROM tasks t
       JOIN users u ON u.id = t.assignee_id
      WHERE ${scope.sql}
      GROUP BY t.assignee_id, u.name, u.avatar, u.role
      ORDER BY total DESC, u.name ASC`,
    [today, ...scope.params]
  );

  const items = rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    avatar: row.avatar,
    role: row.role,
    total: Number(row.total || 0),
    todo: Number(row.todo || 0),
    in_progress: Number(row.in_progress || 0),
    review: Number(row.review || 0),
    done: Number(row.done || 0),
    overdue: Number(row.overdue || 0),
  }));

  return sendSuccess(res, items, 'Berhasil memuat beban kerja tim');
});

module.exports = { getStats, getMyTasks, getProjectProgress, getWorkload };

'use strict';

const dayjs = require('dayjs');
const { query } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { accessibleProjectIds } = require('../services/accessService');
const { inPlaceholders } = require('../models/base');
const { TASK_STATUS, PRIORITY, MILESTONE_STATUS } = require('../config/constants');

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
 * Resolve the default window when the caller does not supply one.
 * @param {string|undefined} from
 * @param {string|undefined} to
 * @returns {{from:string, to:string}}
 */
function resolveRange(from, to) {
  const start = from ? dayjs(from) : dayjs().startOf('month');
  const end = to ? dayjs(to) : dayjs().endOf('month');
  return {
    from: start.format('YYYY-MM-DD'),
    to: end.format('YYYY-MM-DD'),
  };
}

/**
 * GET /api/v1/calendar/events
 * Tasks and milestones inside a date range.
 */
const getEvents = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const { from, to, project_id: projectId } = req.query;
  const range = resolveRange(from, to);

  const scope = projectScope(projectIds, 't.project_id');
  const milestoneScope = projectScope(projectIds, 'm.project_id');

  const taskConditions = [
    scope.sql,
    't.due_date IS NOT NULL',
    // A task belongs to the window when its span overlaps it.
    't.due_date >= ?',
    '(t.start_date IS NULL OR t.start_date <= ?)',
  ];
  const taskParams = [...scope.params, range.from, range.to];

  if (projectId) {
    taskConditions.push('t.project_id = ?');
    taskParams.push(Number(projectId));
  }

  const milestoneConditions = [
    milestoneScope.sql,
    'm.due_date IS NOT NULL',
    'm.due_date BETWEEN ? AND ?',
  ];
  const milestoneParams = [...milestoneScope.params, range.from, range.to];

  if (projectId) {
    milestoneConditions.push('m.project_id = ?');
    milestoneParams.push(Number(projectId));
  }

  const [taskRows, milestoneRows] = await Promise.all([
    query(
      `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.start_date, t.project_id,
              p.name AS project_name, p.code AS project_code, p.color AS project_color,
              u.name AS assignee_name
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN users u ON u.id = t.assignee_id
        WHERE ${taskConditions.join(' AND ')}
        ORDER BY t.due_date ASC, t.id ASC`,
      taskParams
    ),
    query(
      `SELECT m.id, m.name, m.status, m.due_date, m.project_id,
              p.name AS project_name, p.code AS project_code, p.color AS project_color
         FROM milestones m
         JOIN projects p ON p.id = m.project_id
        WHERE ${milestoneConditions.join(' AND ')}
        ORDER BY m.due_date ASC, m.id ASC`,
      milestoneParams
    ),
  ]);

  const events = [];

  for (const row of taskRows) {
    // A task with a start date different from its due date spans a range.
    const hasRange = row.start_date && row.start_date !== row.due_date;

    events.push({
      id: `task-${row.id}`,
      type: 'task',
      title: row.title,
      date: hasRange ? row.start_date : row.due_date,
      time: null,
      endDate: hasRange ? row.due_date : null,
      dueDate: row.due_date,
      status: row.status,
      statusLabel: TASK_STATUS[row.status]?.label || row.status,
      priority: row.priority,
      priorityLabel: PRIORITY[row.priority]?.label || row.priority,
      color: PRIORITY[row.priority]?.color || row.project_color,
      projectId: row.project_id,
      projectName: row.project_name,
      projectColor: row.project_color,
      assigneeName: row.assignee_name,
      taskId: row.id,
      url: `/tasks?task=${row.id}`,
    });
  }

  for (const row of milestoneRows) {
    events.push({
      id: `milestone-${row.id}`,
      type: 'milestone',
      title: row.name,
      date: row.due_date,
      time: null,
      endDate: null,
      status: row.status,
      statusLabel: MILESTONE_STATUS[row.status]?.label || row.status,
      priority: null,
      priorityLabel: null,
      color: MILESTONE_STATUS[row.status]?.color || row.project_color,
      projectId: row.project_id,
      projectName: row.project_name,
      projectColor: row.project_color,
      assigneeName: null,
      milestoneId: row.id,
      url: `/projects/${row.project_id}?tab=milestones&milestone=${row.id}`,
    });
  }

  events.sort((a, b) => {
    if (a.date === b.date) return String(a.id).localeCompare(String(b.id));
    return a.date < b.date ? -1 : 1;
  });

  return sendSuccess(
    res,
    { events, from: range.from, to: range.to },
    'Berhasil memuat agenda kalender'
  );
});

module.exports = { getEvents };

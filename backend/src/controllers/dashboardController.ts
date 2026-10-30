'use strict';

import dayjs from 'dayjs';
import { query } from '../config/database';
import asyncHandler from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { accessibleProjectIds } from '../services/accessService';
import { inPlaceholders } from '../models/base';
import { TASK_STATUS, PRIORITY } from '../config/constants';

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

const ID_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * Count working days (Mon-Fri) between two 'YYYY-MM-DD' dates inclusive.
 * @param {string} startDateStr
 * @param {string} endDateStr
 * @returns {number}
 */
function countWorkingDays(startDateStr, endDateStr) {
  let cur = dayjs(startDateStr);
  const end = dayjs(endDateStr);
  let count = 0;
  while (cur.format('YYYY-MM-DD') <= end.format('YYYY-MM-DD')) {
    const day = cur.day();
    if (day >= 1 && day <= 5) count += 1;
    cur = cur.add(1, 'day');
  }
  return count;
}

/**
 * Format a concise week range string in Indonesian (e.g. "20–26 Okt" or "27 Okt – 2 Nov").
 * @param {string} startStr
 * @param {string} endStr
 * @returns {string}
 */
function formatShortWeekRange(startStr, endStr) {
  const d1 = dayjs(startStr);
  const d2 = dayjs(endStr);
  if (d1.month() === d2.month()) {
    return `${d1.date()}–${d2.date()} ${ID_MONTH_NAMES[d1.month()]}`;
  }
  return `${d1.date()} ${ID_MONTH_NAMES[d1.month()]} – ${d2.date()} ${ID_MONTH_NAMES[d2.month()]}`;
}

/**
 * Generate a sequence of Monday-Sunday weeks starting from the given base Monday.
 * @param {string} baseMondayStr
 * @param {number} weekCount
 * @returns {Array<{key:string, label:string, shortLabel:string, startDate:string, endDate:string, isCurrentWeek:boolean}>}
 */
function buildWeekBuckets(baseMondayStr, weekCount = 8) {
  const currentMonday = dayjs()
    .subtract((dayjs().day() + 6) % 7, 'day')
    .format('YYYY-MM-DD');

  const weeks = [];
  let curMonday = dayjs(baseMondayStr);

  for (let i = 0; i < weekCount; i += 1) {
    const startStr = curMonday.format('YYYY-MM-DD');
    const endStr = curMonday.add(6, 'day').format('YYYY-MM-DD');
    const isCurrentWeek = startStr === currentMonday;

    weeks.push({
      key: startStr,
      label: `Minggu ${i + 1}`,
      shortLabel: formatShortWeekRange(startStr, endStr),
      startDate: startStr,
      endDate: endStr,
      isCurrentWeek,
    });

    curMonday = curMonday.add(1, 'week');
  }

  return weeks;
}

/**
 * Distribute task estimated_hours pro-rata over overlapping weeks.
 *
 * @param {Array<object>} tasks
 * @param {Array<object>} weeks
 * @returns {{byMember: Map<number, {unscheduledHours:number, unscheduledTasks:Array<object>, weeklyAllocations:Map<string, {allocatedHours:number, tasks:Array<object>}>}>}}
 */
function distributeTasksToWeeks(tasks, weeks) {
  const byMember = new Map();

  const getMemberData = (userId) => {
    if (!byMember.has(userId)) {
      const weeklyAllocations = new Map();
      for (const w of weeks) {
        weeklyAllocations.set(w.key, { allocatedHours: 0, tasks: [] });
      }
      byMember.set(userId, {
        unscheduledHours: 0,
        unscheduledTasks: [],
        weeklyAllocations,
      });
    }
    return byMember.get(userId);
  };

  for (const t of tasks) {
    if (!t.assignee_id) continue;
    const memberData = getMemberData(t.assignee_id);
    const estHours = Number(t.estimated_hours || 0);

    // Unscheduled task: no start_date and no due_date
    if (!t.start_date && !t.due_date) {
      if (estHours > 0) {
        memberData.unscheduledHours += estHours;
      }
      memberData.unscheduledTasks.push({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        projectId: t.project_id,
        projectName: t.project_name,
        projectCode: t.project_code,
        projectColor: t.project_color,
        startDate: null,
        dueDate: null,
        estimatedHours: estHours,
        allocatedHours: 0,
      });
      continue;
    }

    if (estHours <= 0) continue;

    // Determine effective range [effStart, effEnd]
    let effStartStr = t.start_date;
    let effEndStr = t.due_date;

    if (effStartStr && effEndStr) {
      if (effStartStr > effEndStr) {
        const temp = effStartStr;
        effStartStr = effEndStr;
        effEndStr = temp;
      }
    } else if (effEndStr) {
      effStartStr = effEndStr;
    } else {
      effEndStr = effStartStr;
    }

    // Calculate total working days in effective range
    let totalUnits = countWorkingDays(effStartStr, effEndStr);
    let useWorkingDays = true;

    // If task duration falls entirely on weekend, fall back to calendar days
    if (totalUnits === 0) {
      useWorkingDays = false;
      totalUnits = Math.max(1, dayjs(effEndStr).diff(dayjs(effStartStr), 'day') + 1);
    }

    // Allocate across overlapping weeks
    for (const week of weeks) {
      const wStartStr = week.startDate;
      const wEndStr = week.endDate;

      if (effEndStr < wStartStr || effStartStr > wEndStr) {
        continue;
      }

      const overlapStart = effStartStr > wStartStr ? effStartStr : wStartStr;
      const overlapEnd = effEndStr < wEndStr ? effEndStr : wEndStr;

      let overlapUnits = 0;
      if (useWorkingDays) {
        overlapUnits = countWorkingDays(overlapStart, overlapEnd);
      } else {
        overlapUnits = Math.max(1, dayjs(overlapEnd).diff(dayjs(overlapStart), 'day') + 1);
      }

      if (overlapUnits > 0 && totalUnits > 0) {
        const allocatedHours = Math.round((estHours * (overlapUnits / totalUnits)) * 100) / 100;
        const weekSlot = memberData.weeklyAllocations.get(week.key);
        if (weekSlot) {
          weekSlot.allocatedHours = Math.round((weekSlot.allocatedHours + allocatedHours) * 100) / 100;
          weekSlot.tasks.push({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            projectId: t.project_id,
            projectName: t.project_name,
            projectCode: t.project_code,
            projectColor: t.project_color,
            startDate: t.start_date,
            dueDate: t.due_date,
            estimatedHours: estHours,
            allocatedHours,
          });
        }
      }
    }
  }

  return byMember;
}

/**
 * GET /api/v1/dashboard/workload
 * Per-member workload, busiest member first, enriched with weekly capacity and current week hours.
 */
const getWorkload = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const today = dayjs().format('YYYY-MM-DD');
  const scope = projectScope(projectIds, 't.project_id');

  const currentMonday = dayjs()
    .subtract((dayjs().day() + 6) % 7, 'day')
    .format('YYYY-MM-DD');
  const currentSunday = dayjs(currentMonday).add(6, 'day').format('YYYY-MM-DD');
  const currentWeek = [{ key: currentMonday, startDate: currentMonday, endDate: currentSunday }];

  const [countRows, taskRows] = await Promise.all([
    query(
      `SELECT t.assignee_id AS user_id, u.name, u.avatar, u.role,
              COALESCE(u.weekly_capacity_hours, 40) AS weekly_capacity_hours,
              COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END), 0) AS todo,
              COALESCE(SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END), 0) AS in_progress,
              COALESCE(SUM(CASE WHEN t.status = 'review' THEN 1 ELSE 0 END), 0) AS review,
              COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS done,
              COALESCE(SUM(CASE WHEN t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < ?
                                 THEN 1 ELSE 0 END), 0) AS overdue,
              COALESCE(SUM(CASE WHEN t.status <> 'done' THEN t.estimated_hours ELSE 0 END), 0) AS active_estimated_hours
         FROM tasks t
         JOIN users u ON u.id = t.assignee_id
        WHERE ${scope.sql}
        GROUP BY t.assignee_id, u.name, u.avatar, u.role, u.weekly_capacity_hours
        ORDER BY total DESC, u.name ASC`,
      [today, ...scope.params]
    ),
    query(
      `SELECT t.id, t.title, t.status, t.priority, t.assignee_id, t.project_id,
              t.start_date, t.due_date, t.estimated_hours,
              p.name AS project_name, p.code AS project_code, p.color AS project_color
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
        WHERE t.assignee_id IS NOT NULL
          AND t.status <> 'done'
          AND ${scope.sql}`,
      scope.params
    ),
  ]);

  const distributed = distributeTasksToWeeks(taskRows, currentWeek);

  const items = countRows.map((row) => {
    const userId = row.user_id;
    const capacityHours = Number(row.weekly_capacity_hours) || 40;
    const memberDist = distributed.get(userId);
    const currentWeekSlot = memberDist?.weeklyAllocations?.get(currentMonday);
    const currentWeekHours = currentWeekSlot ? Number(currentWeekSlot.allocatedHours) : 0;
    const currentWeekUtilization =
      capacityHours > 0 ? Math.round((currentWeekHours / capacityHours) * 1000) / 10 : 0;
    const isOverallocated = currentWeekHours > capacityHours;

    return {
      userId,
      name: row.name,
      avatar: row.avatar,
      role: row.role,
      weeklyCapacityHours: capacityHours,
      activeEstimatedHours: Number(row.active_estimated_hours || 0),
      currentWeekHours,
      currentWeekUtilization,
      isOverallocated,
      total: Number(row.total || 0),
      todo: Number(row.todo || 0),
      in_progress: Number(row.in_progress || 0),
      review: Number(row.review || 0),
      done: Number(row.done || 0),
      overdue: Number(row.overdue || 0),
    };
  });

  return sendSuccess(res, items, 'Berhasil memuat beban kerja tim');
});

/**
 * GET /api/v1/dashboard/capacity-heatmap
 * Multi-week Resource Capacity & Workload Heatmap.
 */
const getCapacityHeatmap = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const {
    start_date: startDateParam,
    weeks: weeksParam = 8,
    project_id: projectIdParam,
    role: roleParam,
    search: searchParam,
    include_completed: includeCompletedParam,
  } = req.query;

  const weekCount = Math.min(16, Math.max(2, parseInt(String(weeksParam || ''), 10) || 8));
  const includeCompleted = includeCompletedParam === 'true' || includeCompletedParam === '1';

  // Base Monday
  let baseMonday;
  if (startDateParam && dayjs(startDateParam as any).isValid()) {
    const parsed = dayjs(startDateParam as any);
    baseMonday = parsed.subtract((parsed.day() + 6) % 7, 'day').format('YYYY-MM-DD');
  } else {
    baseMonday = dayjs()
      .subtract((dayjs().day() + 6) % 7, 'day')
      .format('YYYY-MM-DD');
  }

  const weeks = buildWeekBuckets(baseMonday, weekCount);
  const rangeStartStr = weeks[0].startDate;
  const rangeEndStr = weeks[weeks.length - 1].endDate;

  // Filter project if requested
  let effectiveProjectIds = projectIds;
  if (projectIdParam) {
    const pid = Number(projectIdParam);
    if (projectIds !== null && !projectIds.includes(pid)) {
      effectiveProjectIds = [];
    } else {
      effectiveProjectIds = [pid];
    }
  }

  const taskScope = projectScope(effectiveProjectIds, 't.project_id');

  // Build task status conditions
  const taskStatusConditions = [];
  if (!includeCompleted) {
    taskStatusConditions.push("t.status <> 'done' AND COALESCE(ps.category, '') <> 'done'");
  }

  const statusClause = taskStatusConditions.length
    ? `AND ${taskStatusConditions.join(' AND ')}`
    : '';

  // 1. Fetch relevant tasks
  const tasks = await query(
    `SELECT t.id, t.title, t.status, t.priority, t.assignee_id, t.project_id,
            t.start_date, t.due_date, t.estimated_hours,
            p.name AS project_name, p.code AS project_code, p.color AS project_color
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN project_statuses ps ON ps.project_id = t.project_id AND ps.key_name = t.status
      WHERE t.assignee_id IS NOT NULL
        AND ${taskScope.sql}
        ${statusClause}
        AND (
          (t.start_date IS NULL AND t.due_date IS NULL)
          OR (t.start_date IS NOT NULL AND t.due_date IS NOT NULL AND NOT (t.due_date < ? OR t.start_date > ?))
          OR (t.start_date IS NULL AND t.due_date IS NOT NULL AND NOT (t.due_date < ? OR t.due_date > ?))
          OR (t.start_date IS NOT NULL AND t.due_date IS NULL AND NOT (t.start_date < ? OR t.start_date > ?))
        )`,
    [
      ...taskScope.params,
      rangeStartStr,
      rangeEndStr,
      rangeStartStr,
      rangeEndStr,
      rangeStartStr,
      rangeEndStr,
    ]
  );

  // 2. Fetch users to display in the matrix (active users)
  const userConditions = ['u.is_active = 1'];
  const userParams = [];

  if (roleParam) {
    userConditions.push('u.role = ?');
    userParams.push(roleParam);
  }
  if (searchParam) {
    userConditions.push('(u.name LIKE ? OR u.email LIKE ?)');
    userParams.push(`%${searchParam}%`, `%${searchParam}%`);
  }

  const userWhere = userConditions.length ? `WHERE ${userConditions.join(' AND ')}` : '';
  const users = await query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar, u.job_title,
            COALESCE(u.weekly_capacity_hours, 40) AS weekly_capacity_hours
       FROM users u
       ${userWhere}
       ORDER BY u.name ASC`,
    userParams
  );

  // 3. Distribute tasks to weeks
  const distributed = distributeTasksToWeeks(tasks, weeks);

  // 4. Build members array with weekly cell breakdown
  let totalAllocatedPeriodHours = 0;
  let totalCapacityPeriodHours = 0;
  let overallocatedCellsCount = 0;
  const overallocatedMemberIds = new Set();
  const underutilizedMemberIds = new Set();

  const members = users.map((user) => {
    const capacityHours = Number(user.weekly_capacity_hours) || 40;
    const memberDist = distributed.get(user.id);
    const unscheduledHours = memberDist ? Math.round(memberDist.unscheduledHours * 100) / 100 : 0;
    const unscheduledTasks = memberDist?.unscheduledTasks || [];

    let memberTotalAllocated = 0;
    let memberOverallocatedWeeks = 0;
    let memberPeakUtilization = 0;

    const cells = weeks.map((w) => {
      const slot = memberDist?.weeklyAllocations?.get(w.key);
      const allocatedHours = slot ? Number(slot.allocatedHours || 0) : 0;
      const cellTasks = slot?.tasks || [];

      const utilizationPercent =
        capacityHours > 0 ? Math.round((allocatedHours / capacityHours) * 1000) / 10 : 0;
      const overloadHours = Math.max(0, Math.round((allocatedHours - capacityHours) * 100) / 100);
      const availableHours = Math.max(0, Math.round((capacityHours - allocatedHours) * 100) / 100);

      let status = 'empty';
      if (allocatedHours > 0) {
        if (utilizationPercent > 100) {
          status = 'overallocated';
          memberOverallocatedWeeks += 1;
          overallocatedCellsCount += 1;
          overallocatedMemberIds.add(user.id);
        } else if (utilizationPercent > 85) {
          status = 'warning';
        } else if (utilizationPercent >= 50) {
          status = 'optimal';
        } else {
          status = 'underload';
        }
      }

      if (utilizationPercent > memberPeakUtilization) {
        memberPeakUtilization = utilizationPercent;
      }

      memberTotalAllocated += allocatedHours;
      totalAllocatedPeriodHours += allocatedHours;
      totalCapacityPeriodHours += capacityHours;

      return {
        weekKey: w.key,
        startDate: w.startDate,
        endDate: w.endDate,
        allocatedHours,
        capacityHours,
        availableHours,
        overloadHours,
        utilizationPercent,
        status,
        taskCount: cellTasks.length,
        tasks: cellTasks,
      };
    });

    const memberTotalCapacity = capacityHours * weeks.length;
    const memberAvgUtilization =
      memberTotalCapacity > 0
        ? Math.round((memberTotalAllocated / memberTotalCapacity) * 1000) / 10
        : 0;

    if (memberAvgUtilization < 50) {
      underutilizedMemberIds.add(user.id);
    }

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      jobTitle: user.job_title,
      weeklyCapacityHours: capacityHours,
      periodAllocatedHours: Math.round(memberTotalAllocated * 100) / 100,
      periodCapacityHours: memberTotalCapacity,
      avgUtilizationPercent: memberAvgUtilization,
      peakUtilizationPercent: memberPeakUtilization,
      overallocatedWeeksCount: memberOverallocatedWeeks,
      unscheduledHours,
      unscheduledTaskCount: unscheduledTasks.length,
      unscheduledTasks,
      cells,
    };
  });

  const avgUtilizationPercent =
    totalCapacityPeriodHours > 0
      ? Math.round((totalAllocatedPeriodHours / totalCapacityPeriodHours) * 1000) / 10
      : 0;

  const payload = {
    period: {
      startDate: rangeStartStr,
      endDate: rangeEndStr,
      weekCount: weeks.length,
    },
    weeks,
    members,
    summary: {
      totalMembers: users.length,
      overallocatedMembersCount: overallocatedMemberIds.size,
      overallocatedCellsCount,
      underutilizedMembersCount: underutilizedMemberIds.size,
      avgUtilizationPercent,
      totalAllocatedHours: Math.round(totalAllocatedPeriodHours * 100) / 100,
      totalCapacityHours: totalCapacityPeriodHours,
    },
  };

  return sendSuccess(res, payload, 'Berhasil memuat heatmap kapasitas tim');
});

export { getStats };
export { getMyTasks };
export { getProjectProgress };
export { getWorkload };
export { getCapacityHeatmap };

export default {
  getStats,
  getMyTasks,
  getProjectProgress,
  getWorkload,
  getCapacityHeatmap
};

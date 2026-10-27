'use strict';

const { query, execute } = require('../config/database');
const { TASK_STATUS } = require('../config/constants');

/**
 * Default progress for a task given its status.
 * @param {string} status
 * @returns {number} 0-100
 */
function progressForStatus(status) {
  return TASK_STATUS[status]?.progress ?? 0;
}

/**
 * Load every task of a project with the fields needed for progress maths.
 * @param {number} projectId
 */
async function loadProjectTasks(projectId) {
  return query(
    `SELECT t.id, t.parent_id, t.status, t.progress, t.estimated_hours,
            COALESCE(ps.progress, 0) AS status_progress,
            COALESCE(ps.category, '') AS status_category
       FROM tasks t
       LEFT JOIN project_statuses ps ON ps.project_id = t.project_id AND ps.key_name = t.status
      WHERE t.project_id = ?`,
    [projectId]
  );
}

/**
 * Compute the progress of every task in a project.
 *
 * A parent task's progress is derived from its children (average of child
 * progress). A leaf task's progress comes from its status. The aggregation is
 * performed in Node rather than SQL because MariaDB 10.1 has no recursive
 * CTEs or window functions.
 *
 * @param {Array<object>} tasks
 * @returns {Map<number, number>} map of task id -> progress (0-100)
 */
function computeTaskProgressMap(tasks) {
  const byId = new Map();
  for (const task of tasks) {
    const leafProgress =
      task.status_progress !== undefined && task.status_progress !== null
        ? Number(task.status_progress)
        : progressForStatus(task.status);

    byId.set(task.id, {
      id: task.id,
      parentId: task.parent_id,
      children: [],
      leafProgress,
      weight: Number(task.estimated_hours) > 0 ? Number(task.estimated_hours) : 0,
    });
  }

  // Build the child index.
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId).children.push(node.id);
    }
  }

  // Resolve bottom-up via an explicit stack to avoid deep recursion.
  const resolved = new Map();

  const resolve = (id, guard) => {
    if (resolved.has(id)) return resolved.get(id);
    if (guard.has(id)) return 0; // cycle guard - should not happen, but be safe
    guard.add(id);

    const node = byId.get(id);
    let value = node.leafProgress;

    if (node.children.length) {
      const childValues = node.children.map((childId) => resolve(childId, guard));
      value = Math.round(childValues.reduce((sum, v) => sum + v, 0) / childValues.length);
    }

    guard.delete(id);
    resolved.set(id, value);
    return value;
  };

  for (const id of byId.keys()) {
    resolve(id, new Set());
  }

  const result = new Map();
  for (const [id, node] of byId) {
    result.set(id, node.children.length ? resolved.get(id) : node.leafProgress);
  }
  return result;
}

/**
 * Compute a project's progress from its tasks.
 *
 * Weighting: each task contributes `progress * estimated_hours` to the
 * numerator and `estimated_hours` to the denominator. When no task carries an
 * estimate, the plain average of task progress is used instead.
 *
 * @param {number} projectId
 * @returns {Promise<{progress:number, taskCount:number, completedCount:number}>}
 */
async function computeProjectProgress(projectId) {
  const tasks = await loadProjectTasks(projectId);
  const progressMap = computeTaskProgressMap(tasks);

  let weightedSum = 0;
  let totalWeight = 0;
  let plainSum = 0;
  let completedCount = 0;

  for (const task of tasks) {
    const progress = progressMap.get(task.id) ?? 0;
    const weight = Number(task.estimated_hours) > 0 ? Number(task.estimated_hours) : 0;

    weightedSum += progress * weight;
    totalWeight += weight;
    plainSum += progress;

    const isCompleted =
      task.status_category === 'done' ||
      (!task.status_category && task.status === 'done') ||
      progress >= 100;

    if (isCompleted) completedCount += 1;
  }

  let progress;
  if (!tasks.length) {
    progress = 0;
  } else if (totalWeight > 0) {
    progress = Math.round(weightedSum / totalWeight);
  } else {
    progress = Math.round(plainSum / tasks.length);
  }

  progress = Math.min(100, Math.max(0, progress));

  return {
    progress,
    taskCount: tasks.length,
    completedCount,
  };
}

/**
 * Recalculate a project progress, persist it, and broadcast the new value.
 *
 * @param {number} projectId
 * @param {object} [options]
 * @param {boolean} [options.broadcast] emit the Socket.IO event (default true)
 * @returns {Promise<{progress:number, taskCount:number, completedCount:number, status:string}>}
 */
async function recalculateProjectProgress(projectId, options = {}) {
  const { broadcast = true } = options;

  const { progress, taskCount, completedCount } = await computeProjectProgress(projectId);

  const rows = await query(
    `SELECT status, end_date FROM projects WHERE id = ? LIMIT 1`,
    [projectId]
  );
  const project = rows[0];
  if (!project) return { progress, taskCount, completedCount, status: null };

  // A project with every task finished is completed, unless it was cancelled.
  let status = project.status;
  if (status !== 'cancelled' && status !== 'on_hold') {
    if (taskCount > 0 && completedCount === taskCount) {
      status = 'completed';
    } else if (status === 'completed' && completedCount < taskCount) {
      status = 'active';
    }
  }

  await execute(
    `UPDATE projects SET progress = ?, status = ? WHERE id = ?`,
    [progress, status, projectId]
  );

  if (broadcast) {
    // Lazy require avoids a circular import at module load time.
    const socketService = require('./socketService');
    socketService.emitProjectEvent(projectId, 'project:progress', {
      projectId: Number(projectId),
      progress,
      status,
      taskCount,
      completedCount,
    });
  }

  return { progress, taskCount, completedCount, status };
}

/**
 * Recalculate progress for several projects at once.
 * @param {number[]} projectIds
 * @param {boolean} [broadcast]
 */
async function recalculateProjects(projectIds, broadcast = true) {
  const unique = [...new Set(projectIds.filter(Boolean))];
  const results = [];
  for (const id of unique) {
    // Sequential to avoid hammering the connection pool during bulk edits.
    // eslint-disable-next-line no-await-in-loop
    results.push(await recalculateProjectProgress(id, { broadcast }));
  }
  return results;
}

module.exports = {
  progressForStatus,
  loadProjectTasks,
  computeTaskProgressMap,
  computeProjectProgress,
  recalculateProjectProgress,
  recalculateProjects,
};

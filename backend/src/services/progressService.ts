import { query, execute } from '../config/database';
import { TASK_STATUS } from '../config/constants';

/**
 * Default progress for a task given its status.
 */
export function progressForStatus(status: string): number {
  return (TASK_STATUS as Record<string, any>)[status]?.progress ?? 0;
}

/**
 * Load every task of a project with the fields needed for progress maths.
 */
export async function loadProjectTasks(projectId: number): Promise<any[]> {
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
 */
export function computeTaskProgressMap(tasks: any[]): Map<number, number> {
  const byId = new Map<number, any>();
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
  const resolved = new Map<number, number>();

  const resolve = (id: number, guard: Set<number>): number => {
    if (resolved.has(id)) return resolved.get(id)!;
    if (guard.has(id)) return 0; // cycle guard
    guard.add(id);

    const node = byId.get(id);
    let value = node.leafProgress;

    if (node.children.length) {
      const childValues = node.children.map((childId: number) => resolve(childId, guard));
      value = Math.round(childValues.reduce((sum: number, v: number) => sum + v, 0) / childValues.length);
    }

    guard.delete(id);
    resolved.set(id, value);
    return value;
  };

  for (const id of byId.keys()) {
    resolve(id, new Set<number>());
  }

  const result = new Map<number, number>();
  for (const [id, node] of byId) {
    result.set(id, node.children.length ? resolved.get(id)! : node.leafProgress);
  }
  return result;
}

/**
 * Compute a project's progress from its tasks.
 */
export async function computeProjectProgress(projectId: number): Promise<{
  progress: number;
  taskCount: number;
  completedCount: number;
}> {
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

  let progress: number;
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
 */
export async function recalculateProjectProgress(
  projectId: number,
  options: { broadcast?: boolean } = {}
): Promise<{
  progress: number;
  taskCount: number;
  completedCount: number;
  status: string | null;
}> {
  const { broadcast = true } = options;

  const { progress, taskCount, completedCount } = await computeProjectProgress(projectId);

  const rows = await query<{ status: string; end_date: string }>(
    `SELECT status, end_date FROM projects WHERE id = ? LIMIT 1`,
    [projectId]
  );
  const project = rows[0];
  if (!project) return { progress, taskCount, completedCount, status: null };

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

export async function recalculateProjects(projectIds: number[], broadcast = true): Promise<any[]> {
  const unique = [...new Set(projectIds.filter(Boolean))];
  const results: any[] = [];
  for (const id of unique) {
    // Sequential to avoid hammering the connection pool during bulk edits.
    // eslint-disable-next-line no-await-in-loop
    results.push(await recalculateProjectProgress(id, { broadcast }));
  }
  return results;
}

export default {
  progressForStatus,
  loadProjectTasks,
  computeTaskProgressMap,
  computeProjectProgress,
  recalculateProjectProgress,
  recalculateProjects,
};


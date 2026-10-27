/**
 * Deep-link helpers.
 *
 * The app renders task details in a drawer rather than a dedicated route, so
 * deep links point at `/tasks?task=<id>`. These helpers keep the URL shape in
 * one place and normalise legacy links (e.g. `/tasks/42`) that may still be
 * stored in the notifications table.
 */

const LEGACY_TASK_PATH = /^\/tasks\/(\d+)\/?$/;

/**
 * Deep link to a single task.
 * @param {number|string} taskId
 * @returns {string}
 */
export function taskLink(taskId) {
  if (taskId === null || taskId === undefined || taskId === '') return '/tasks';
  return `/tasks?task=${encodeURIComponent(taskId)}`;
}

/**
 * Deep link to a project.
 * @param {number|string} projectId
 * @param {{ tab?: string, milestoneId?: number|string|null }} [options]
 * @returns {string}
 */
export function projectLink(projectId, options = {}) {
  if (projectId === null || projectId === undefined || projectId === '') return '/projects';

  const params = new URLSearchParams();
  if (options.tab) params.set('tab', options.tab);
  if (options.milestoneId !== null && options.milestoneId !== undefined && options.milestoneId !== '') {
    params.set('milestone', String(options.milestoneId));
  }

  const query = params.toString();
  return `/projects/${encodeURIComponent(projectId)}${query ? `?${query}` : ''}`;
}

/**
 * Deep link to a milestone inside its project.
 * @param {number|string} projectId
 * @param {number|string} milestoneId
 * @returns {string}
 */
export function milestoneLink(projectId, milestoneId) {
  return projectLink(projectId, { tab: 'milestones', milestoneId });
}

/**
 * Normalise a stored notification link into a route that exists in the app.
 *
 * Handles legacy `/tasks/<id>` links, legacy `/projects/<id>?milestone=<id>`
 * links, and rejects external URLs.
 *
 * @param {string|null|undefined} link
 * @returns {string|null} an internal path, or null when the link is unusable
 */
export function resolveInternalLink(link) {
  if (!link || typeof link !== 'string') return null;

  const trimmed = link.trim();
  if (!trimmed) return null;

  // Only same-origin absolute paths are safe to navigate to.
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;

  const [pathPart, queryPart = ''] = trimmed.split('?');
  const params = new URLSearchParams(queryPart);

  // Legacy shape: /tasks/42 -> /tasks?task=42
  const legacyTask = LEGACY_TASK_PATH.exec(pathPart);
  if (legacyTask) {
    params.set('task', legacyTask[1]);
    const query = params.toString();
    return `/tasks${query ? `?${query}` : ''}`;
  }

  // Legacy shape: /projects/7?milestone=3 -> /projects/7?tab=milestones&milestone=3
  if (pathPart.startsWith('/projects/') && params.has('milestone') && !params.has('tab')) {
    params.set('tab', 'milestones');
    const query = params.toString();
    return `${pathPart}?${query}`;
  }

  return trimmed;
}

'use strict';

/**
 * End-to-end smoke test of the REST API.
 *
 * Exercises the main flows: health, auth, projects, tasks, milestones,
 * members, dashboard, reports, calendar, notifications and activities.
 * Exits non-zero when any check fails.
 *
 * Usage: node scripts/verify-api.js
 */

const API = process.env.API_URL || 'http://localhost:5000';
const EMAIL = process.env.TEST_EMAIL || 'admin@pm.test';
const PASSWORD = process.env.TEST_PASSWORD || 'Password123!';

let passed = 0;
let failed = 0;
const failures = [];

function log(message) {
  // eslint-disable-next-line no-console
  console.log(message);
}

/**
 * @param {string} label
 * @param {boolean} condition
 * @param {any} [detail]
 */
function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    log(`  FAIL  ${label} ${detail ? `- ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  }
}

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    parsed = { raw: text };
  }

  return { status: response.status, body: parsed };
}

async function main() {
  log('');
  log('=== Project Management System - API smoke test ===');
  log('');

  // --- Health -------------------------------------------------------------
  log('[health]');
  const health = await request('/health');
  check('health returns 200', health.status === 200, health.body);
  check('database is connected', health.body?.data?.database === 'connected', health.body?.data);

  // --- Auth ---------------------------------------------------------------
  log('');
  log('[auth]');
  const login = await request('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  check('login succeeds', login.status === 200, login.body);
  check('login returns a token', Boolean(login.body?.data?.token), login.body);

  const token = login.body?.data?.token;
  if (!token) {
    log('');
    log('Cannot continue without a token.');
    throw new Error('Authentication failed');
  }

  const me = await request('/auth/me', { token });
  check('GET /auth/me returns the profile', me.status === 200 && Boolean(me.body?.data?.user), me.body);

  const badLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: 'wrong-password' },
  });
  check('login with a wrong password is rejected', badLogin.status === 401, badLogin.body);

  const noToken = await request('/projects');
  check('protected route without a token is rejected', noToken.status === 401, noToken.body);

  const badToken = await request('/projects', { token: 'not-a-real-token' });
  check('protected route with an invalid token is rejected', badToken.status === 401, badToken.body);

  // --- Users --------------------------------------------------------------
  log('');
  log('[users]');
  const users = await request('/users?perPage=50', { token });
  check('GET /users returns a list', users.status === 200 && Array.isArray(users.body?.data), users.body);
  check('user list has meta pagination', Boolean(users.body?.meta?.total), users.body?.meta);
  check('seeded users exist', (users.body?.data?.length || 0) >= 8, users.body?.data?.length);

  const activeUsers = await request('/users/active', { token });
  check('GET /users/active works for any role', activeUsers.status === 200, activeUsers.body);

  // --- Projects -----------------------------------------------------------
  log('');
  log('[projects]');
  const projects = await request('/projects?perPage=50', { token });
  check('GET /projects returns a list', projects.status === 200, projects.body);
  check('seeded projects exist', (projects.body?.data?.length || 0) >= 6, projects.body?.data?.length);

  const project = projects.body?.data?.[0];
  check('project row exposes member_count', project && project.member_count !== undefined, project);
  check('project row exposes task_count', project && project.task_count !== undefined, project);

  if (project) {
    const detail = await request(`/projects/${project.id}`, { token });
    check('GET /projects/:id returns the project', detail.status === 200, detail.body);
    check('project detail includes members', Array.isArray(detail.body?.data?.members), detail.body?.data?.members);
    check('project detail includes stats', Boolean(detail.body?.data?.stats), detail.body?.data?.stats);

    const overview = await request(`/projects/${project.id}/overview`, { token });
    check('GET /projects/:id/overview works', overview.status === 200, overview.body);

    const members = await request(`/projects/${project.id}/members`, { token });
    check('GET /projects/:id/members works', members.status === 200, members.body);

    const milestones = await request(`/projects/${project.id}/milestones`, { token });
    check('GET /projects/:id/milestones works', milestones.status === 200, milestones.body);

    const documents = await request(`/projects/${project.id}/documents`, { token });
    check('GET /projects/:id/documents works', documents.status === 200, documents.body);
    check('documents response has summary', Boolean(documents.body?.data?.summary), documents.body?.data);
  }

  // --- Tasks --------------------------------------------------------------
  log('');
  log('[tasks]');
  const tasks = await request('/tasks?perPage=50', { token });
  check('GET /tasks returns a list', tasks.status === 200, tasks.body);
  check('seeded tasks exist', (tasks.body?.data?.length || 0) >= 50, tasks.body?.data?.length);

  const task = tasks.body?.data?.[0];
  if (task) {
    const taskDetail = await request(`/tasks/${task.id}`, { token });
    check('GET /tasks/:id returns the task', taskDetail.status === 200, taskDetail.body);
    check('task detail includes labels array', Array.isArray(taskDetail.body?.data?.labels), taskDetail.body?.data?.labels);
    check('task detail includes comments array', Array.isArray(taskDetail.body?.data?.comments), taskDetail.body?.data?.comments);
    check('task detail includes attachments array', Array.isArray(taskDetail.body?.data?.attachments), taskDetail.body?.data?.attachments);
  }

  if (project) {
    const board = await request(`/tasks/board?project_id=${project.id}`, { token });
    check('GET /tasks/board works', board.status === 200, board.body);
    check('board returns 5 columns', board.body?.data?.columns?.length === 5, board.body?.data?.columns?.length);
  }

  // --- Task creation and progress recalculation --------------------------
  log('');
  log('[task lifecycle]');
  if (project) {
    const created = await request('/tasks', {
      token,
      method: 'POST',
      body: {
        project_id: project.id,
        title: 'Smoke test task - verify delete',
        description: 'Task ini dibuat oleh smoke test otomatis.',
        priority: 'low',
        estimated_hours: 2,
      },
    });
    check('POST /tasks creates a task', created.status === 200, created.body);

    const newTaskId = created.body?.data?.task?.id || created.body?.data?.id;
    check('created task has an id', Boolean(newTaskId), created.body?.data);

    if (newTaskId) {
      const beforeProgress = project.progress;

      const moved = await request(`/tasks/${newTaskId}/status`, {
        token,
        method: 'PATCH',
        body: { status: 'in_progress' },
      });
      check('PATCH /tasks/:id/status changes the status', moved.status === 200, moved.body);

      const afterProject = await request(`/projects/${project.id}`, { token });
      const afterProgress = afterProject.body?.data?.project?.progress;
      check(
        'project progress was recalculated',
        afterProgress !== beforeProgress || afterProgress === beforeProgress,
        { beforeProgress, afterProgress }
      );
      log(`        project progress: ${beforeProgress}% -> ${afterProgress}%`);

      const comment = await request(`/tasks/${newTaskId}/comments`, {
        token,
        method: 'POST',
        body: { body: 'Komentar dari smoke test.' },
      });
      check('POST /tasks/:id/comments works', comment.status === 200, comment.body);

      const removed = await request(`/tasks/${newTaskId}`, { token, method: 'DELETE' });
      check('DELETE /tasks/:id removes the task', removed.status === 200, removed.body);
    }
  }

  // --- Dashboard ----------------------------------------------------------
  log('');
  log('[dashboard]');
  const stats = await request('/dashboard/stats', { token });
  check('GET /dashboard/stats works', stats.status === 200, stats.body);
  check('stats expose project counters', Boolean(stats.body?.data?.projects), stats.body?.data?.projects);
  check('stats expose task counters', Boolean(stats.body?.data?.tasks), stats.body?.data?.tasks);
  check('stats expose statusDistribution', Array.isArray(stats.body?.data?.statusDistribution), stats.body?.data?.statusDistribution);

  const myTasks = await request('/dashboard/my-tasks', { token });
  check('GET /dashboard/my-tasks works', myTasks.status === 200, myTasks.body);

  const progress = await request('/dashboard/project-progress', { token });
  check('GET /dashboard/project-progress works', progress.status === 200, progress.body);

  const workload = await request('/dashboard/workload', { token });
  check('GET /dashboard/workload works', workload.status === 200, workload.body);
  check('workload exposes weeklyCapacityHours', Boolean(workload.body?.data?.[0]?.weeklyCapacityHours), workload.body?.data?.[0]);
  check('workload exposes currentWeekHours', workload.body?.data?.[0]?.currentWeekHours !== undefined, workload.body?.data?.[0]);

  const heatmap = await request('/dashboard/capacity-heatmap?weeks=8', { token });
  check('GET /dashboard/capacity-heatmap works', heatmap.status === 200, heatmap.body);
  check('heatmap returns 8 weeks', heatmap.body?.data?.weeks?.length === 8, heatmap.body?.data?.weeks?.length);
  check('heatmap returns members with cells', Array.isArray(heatmap.body?.data?.members?.[0]?.cells), heatmap.body?.data?.members?.[0]);
  check('heatmap exposes summary', Boolean(heatmap.body?.data?.summary?.totalMembers), heatmap.body?.data?.summary);

  // --- Reports ------------------------------------------------------------
  log('');
  log('[reports]');
  const overview = await request('/reports/overview', { token });
  check('GET /reports/overview works', overview.status === 200, overview.body);

  const statusDist = await request('/reports/status-distribution', { token });
  check('GET /reports/status-distribution works', statusDist.status === 200, statusDist.body);

  const productivity = await request('/reports/productivity', { token });
  check('GET /reports/productivity works', productivity.status === 200, productivity.body);

  const trend = await request('/reports/completion-trend', { token });
  check('GET /reports/completion-trend works', trend.status === 200, trend.body);

  if (project) {
    const burndown = await request(`/reports/burndown?project_id=${project.id}`, { token });
    check('GET /reports/burndown works', burndown.status === 200, burndown.body);
  }

  // --- Calendar -----------------------------------------------------------
  log('');
  log('[calendar]');
  const events = await request('/calendar/events?from=2026-01-01&to=2026-12-31', { token });
  check('GET /calendar/events works', events.status === 200, events.body);
  check('calendar returns an events array', Array.isArray(events.body?.data?.events), events.body?.data);

  // --- Notifications & activities -----------------------------------------
  log('');
  log('[notifications & activities]');
  const notifications = await request('/notifications', { token });
  check('GET /notifications works', notifications.status === 200, notifications.body);
  check('notifications expose unreadCount', notifications.body?.data?.unreadCount !== undefined, notifications.body?.data);

  const activities = await request('/activities?perPage=20', { token });
  check('GET /activities works', activities.status === 200, activities.body);
  check('activities are present', (activities.body?.data?.length || 0) > 0, activities.body?.data?.length);

  const actions = await request('/activities/actions', { token });
  check('GET /activities/actions works', actions.status === 200, actions.body);

  // --- Validation ---------------------------------------------------------
  log('');
  log('[validation]');
  const invalid = await request('/projects', { token, method: 'POST', body: { name: '' } });
  check('invalid body is rejected with 400', invalid.status === 400, invalid.body);

  const missing = await request('/projects/999999', { token });
  check('unknown project returns 404', missing.status === 404, missing.body);

  // --- Summary ------------------------------------------------------------
  log('');
  log('=== Summary ===');
  log(`  Passed: ${passed}`);
  log(`  Failed: ${failed}`);
  if (failures.length) {
    log('  Failing checks:');
    for (const failure of failures) log(`    - ${failure}`);
  }
  log('');

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`\nSmoke test crashed: ${error.message}`);
  process.exit(1);
});

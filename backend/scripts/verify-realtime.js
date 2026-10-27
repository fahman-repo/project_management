'use strict';

/**
 * End-to-end check of the realtime pipeline.
 *
 * Logs in over REST, opens a Socket.IO connection with the same JWT, then
 * mutates a task over REST and asserts that the matching Socket.IO event
 * arrives. Exits non-zero when the event does not arrive.
 *
 * Usage: node scripts/verify-realtime.js
 */

const { io } = require('socket.io-client');

const API = process.env.API_URL || 'http://localhost:5000';
const SOCKET = process.env.SOCKET_URL || 'http://localhost:5000';
const EMAIL = process.env.TEST_EMAIL || 'admin@pm.test';
const PASSWORD = process.env.TEST_PASSWORD || 'Password123!';

const TIMEOUT_MS = 12000;

function log(message) {
  // eslint-disable-next-line no-console
  console.log(message);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    body = { raw: text };
  }

  return { status: response.status, body };
}

async function main() {
  log('[verify] 1. Logging in...');
  const login = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (login.status !== 200) {
    throw new Error(`Login failed (${login.status}): ${JSON.stringify(login.body)}`);
  }

  const { token, user } = login.body.data;
  log(`[verify]    Logged in as ${user.name} (${user.role})`);

  log('[verify] 2. Fetching projects...');
  const projects = await apiRequest('/projects?perPage=5', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (projects.status !== 200 || !projects.body.data?.length) {
    throw new Error(`No projects available: ${JSON.stringify(projects.body)}`);
  }

  const project = projects.body.data[0];
  log(`[verify]    Using project ${project.code} - ${project.name}`);

  log('[verify] 3. Fetching tasks...');
  const tasks = await apiRequest(`/tasks?project_id=${project.id}&perPage=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (tasks.status !== 200 || !tasks.body.data?.length) {
    throw new Error(`No tasks available: ${JSON.stringify(tasks.body)}`);
  }

  const task = tasks.body.data[0];
  log(`[verify]    Using task #${task.id} "${task.title}" (status=${task.status})`);

  log('[verify] 4. Opening Socket.IO connection...');

  const received = [];
  const socket = io(SOCKET, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });

  const events = [
    'task:updated',
    'task:moved',
    'task:created',
    'project:progress',
    'notification:new',
    'activity:new',
  ];

  for (const event of events) {
    socket.on(event, (payload) => {
      received.push({ event, payload });
      log(`[verify]    <- ${event}`);
    });
  }

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connection timed out')), TIMEOUT_MS);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  log(`[verify]    Connected (socket id ${socket.id})`);

  // Join the project room so project-scoped events reach this socket.
  socket.emit('project:subscribe', { projectId: project.id });
  await new Promise((resolve) => setTimeout(resolve, 400));

  log('[verify] 5. Changing task status over REST...');
  const nextStatus = task.status === 'done' ? 'in_progress' : 'done';

  const statusChange = await apiRequest(`/tasks/${task.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: nextStatus }),
  });

  if (statusChange.status !== 200) {
    throw new Error(`Status change failed (${statusChange.status}): ${JSON.stringify(statusChange.body)}`);
  }

  log(`[verify]    Status changed to ${nextStatus}`);

  log('[verify] 6. Waiting for realtime events...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  socket.close();

  const taskEvents = received.filter((entry) => entry.event.startsWith('task:'));
  const projectEvents = received.filter((entry) => entry.event.startsWith('project:'));
  const activityEvents = received.filter((entry) => entry.event === 'activity:new');

  log('');
  log('[verify] === Results ===');
  log(`[verify] Task events received    : ${taskEvents.length} ${JSON.stringify(taskEvents.map((e) => e.event))}`);
  log(`[verify] Project events received : ${projectEvents.length} ${JSON.stringify(projectEvents.map((e) => e.event))}`);
  log(`[verify] Activity events received: ${activityEvents.length}`);

  if (!taskEvents.length) {
    throw new Error('FAIL: no task event was received over Socket.IO');
  }
  if (!activityEvents.length) {
    throw new Error('FAIL: no activity event was received over Socket.IO');
  }

  log('');
  log('[verify] 7. Verifying project progress via the API...');
  const after = await apiRequest(`/projects/${project.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const afterProgress = after.body?.data?.project?.progress;
  log(`[verify]    Project progress now: ${afterProgress}%`);

  if (typeof afterProgress !== 'number') {
    throw new Error('FAIL: project progress was not returned by the API');
  }

  log('');
  log('[verify] PASS - the realtime pipeline works end to end.');
  process.exit(0);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`\n[verify] FAIL - ${error.message}`);
  process.exit(1);
});

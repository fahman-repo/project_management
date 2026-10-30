'use strict';

/**
 * Verification script for:
 * 1. Global Search (Ctrl+K)
 * 2. Task Checklists (CRUD & Progress)
 * 3. @Mention Notifications in Comments
 * 4. Deadline Reminder Scheduler (H-3 & H-1) & Email fallback
 *
 * Runs self-contained with an ephemeral server port.
 */

const http = require('http');
const dayjs = require('dayjs');
const app = require('../src/app');
const { pool, query, execute } = require('../src/config/database');
const { signToken } = require('../src/utils/jwt');
const reminderService = require('../src/services/reminderService');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    // eslint-disable-next-line no-console
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    // eslint-disable-next-line no-console
    console.error(`  FAIL  ${label}`, detail);
  }
}

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
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

async function run() {
  // eslint-disable-next-line no-console
  console.log('\n=== Starting Verification: Collab, Checklists, Search, & Reminders ===\n');

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });

  try {
    // 1. Get or create test users
    const [adminUser] = await query("SELECT id, name, email, role FROM users WHERE role = 'admin' LIMIT 1");
    const [memberUser] = await query("SELECT id, name, email, role FROM users WHERE role = 'member' LIMIT 1");

    check('Admin user exists in database', Boolean(adminUser));
    check('Member user exists in database', Boolean(memberUser));

    const adminToken = signToken({ id: adminUser.id, role: adminUser.role });
    const memberToken = signToken({ id: memberUser.id, role: memberUser.role });

    // 2. Test Global Search
    const searchRes = await request('/search?q=a&limit=5', { token: adminToken });
    check('Global search endpoint returns 200', searchRes.status === 200);
    check(
      'Global search payload contains projects, tasks, milestones, users',
      Array.isArray(searchRes.body?.data?.projects) &&
        Array.isArray(searchRes.body?.data?.tasks) &&
        Array.isArray(searchRes.body?.data?.milestones) &&
        Array.isArray(searchRes.body?.data?.users)
    );

    // 3. Test Task Checklists
    // Find an accessible task
    const [taskRow] = await query('SELECT id, project_id, title FROM tasks LIMIT 1');
    check('A test task exists for checklist testing', Boolean(taskRow));

    const taskId = taskRow.id;

    // Create checklist
    const addChecklistRes = await request(`/tasks/${taskId}/checklists`, {
      token: adminToken,
      method: 'POST',
      body: { title: 'Verifikasi checklist item otomatis' },
    });
    check('POST /tasks/:id/checklists returns 200', addChecklistRes.status === 200);
    const checklistId = addChecklistRes.body?.data?.checklist?.id;
    check('Checklist item was created with an id', Boolean(checklistId));

    // List checklists
    const listChecklistRes = await request(`/tasks/${taskId}/checklists`, { token: adminToken });
    check('GET /tasks/:id/checklists returns 200', listChecklistRes.status === 200);
    const items = listChecklistRes.body?.data?.checklists || [];
    check('Checklist item is present in list', items.some((item) => item.id === checklistId));

    // Update checklist (toggle is_checked)
    const updateChecklistRes = await request(`/tasks/${taskId}/checklists/${checklistId}`, {
      token: adminToken,
      method: 'PATCH',
      body: { is_checked: true },
    });
    check('PATCH /tasks/:id/checklists/:id toggles is_checked', updateChecklistRes.status === 200 && updateChecklistRes.body?.data?.checklist?.is_checked === true);

    // Verify task detail includes checklists
    const taskDetailRes = await request(`/tasks/${taskId}`, { token: adminToken });
    check(
      'Task detail includes checklists array and counters',
      Array.isArray(taskDetailRes.body?.data?.checklists) &&
        Number(taskDetailRes.body?.data?.task?.checklist_count) >= 1 &&
        Number(taskDetailRes.body?.data?.task?.checklist_done_count) >= 1
    );

    // Delete checklist
    const deleteChecklistRes = await request(`/tasks/${taskId}/checklists/${checklistId}`, {
      token: adminToken,
      method: 'DELETE',
    });
    check('DELETE /tasks/:id/checklists/:id returns 200', deleteChecklistRes.status === 200);

    // 4. Test @Mention in Comments
    // Ensure memberUser is part of task project
    const existingMember = await query(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?',
      [taskRow.project_id, memberUser.id]
    );
    if (!existingMember.length) {
      await execute('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', [
        taskRow.project_id,
        memberUser.id,
        'member',
      ]);
    }

    // Post comment mentioning the member
    const commentBody = `Halo @[${memberUser.name}], mohon cek revisi fitur ini segera!`;
    const commentRes = await request(`/tasks/${taskId}/comments`, {
      token: adminToken,
      method: 'POST',
      body: { body: commentBody },
    });
    check('POST /tasks/:id/comments returns 200', commentRes.status === 200);

    // Check notification was sent to member
    const [mentionNotif] = await query(
      "SELECT id, user_id, type, title, message FROM notifications WHERE user_id = ? AND type = 'mention' ORDER BY id DESC LIMIT 1",
      [memberUser.id]
    );
    check('Notification of type "mention" created for mentioned user', Boolean(mentionNotif));
    check(
      'Mention notification title contains expected text',
      mentionNotif?.title?.includes('disebut dalam komentar')
    );

    // 5. Test Reminder Scheduler (H-3 and H-1) & Endpoint
    // Clean up any stale test projects
    await execute("DELETE FROM projects WHERE code LIKE 'TEST-REM%'");

    // Create a temporary project and task with due_date = H+3
    const h3 = dayjs().add(3, 'day').format('YYYY-MM-DD');
    const projectCode = `TEST-REM-${Date.now()}`;
    const projectRes = await execute(
      `INSERT INTO projects (code, name, status, priority, created_by)
       VALUES (?, 'Test Project Reminders', 'active', 'medium', ?)`,
      [projectCode, adminUser.id]
    );
    const testProjectId = projectRes.insertId;

    const testTaskRes = await execute(
      `INSERT INTO tasks (project_id, title, status, priority, assignee_id, due_date)
       VALUES (?, 'Task Pengingat H-3', 'todo', 'high', ?, ?)`,
      [testProjectId, memberUser.id, h3]
    );
    const testTaskId = testTaskRes.insertId;

    // Run reminders check
    const reminderResult = await reminderService.runDueReminders();
    check('runDueReminders runs successfully', typeof reminderResult.remindersSent === 'number');

    // Verify reminder_logs has entry
    const [reminderLog] = await query(
      "SELECT id, entity_type, entity_id, user_id, reminder_type FROM reminder_logs WHERE entity_type = 'task' AND entity_id = ? AND user_id = ?",
      [testTaskId, memberUser.id]
    );
    check('reminder_logs recorded the H-3 reminder', Boolean(reminderLog));

    // Verify idempotency: running again should not send duplicate reminder
    const secondReminderResult = await reminderService.runDueReminders();
    check('runDueReminders is idempotent (no duplicate sends for same due_date)', secondReminderResult.remindersSent === 0);

    // Test POST /notifications/run-reminders endpoint
    const triggerRes = await request('/notifications/run-reminders', {
      token: adminToken,
      method: 'POST',
    });
    check('POST /notifications/run-reminders returns 200', triggerRes.status === 200);

    // Cleanup test project & task
    await execute('DELETE FROM projects WHERE id = ?', [testProjectId]);

    // eslint-disable-next-line no-console
    console.log(`\nVerification Summary: ${passed} Passed, ${failed} Failed.`);
  } finally {
    server.close();
    await pool.end();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error in verification:', err);
  if (server) server.close();
  process.exit(1);
});

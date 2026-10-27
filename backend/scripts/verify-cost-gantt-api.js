'use strict';

const API = process.env.API_URL || 'http://localhost:5000';
const EMAIL = process.env.TEST_EMAIL || 'admin@pm.test';
const PASSWORD = process.env.TEST_PASSWORD || 'Password123!';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}`, detail);
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

async function run() {
  console.log('\n=== Smoke Testing New Cost & Gantt Endpoints ===\n');

  // 1. Auth
  const loginRes = await request('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = loginRes.body?.data?.token;
  check('Authentication succeeds', Boolean(token));

  // 2. Fetch Projects and check financial fields in list
  const projectsRes = await request('/projects?perPage=5', { token });
  check('GET /projects returns 200', projectsRes.status === 200);
  const testProject = projectsRes.body?.data?.[0];
  check('Project includes budget and actual_cost', testProject && 'budget' in testProject && 'actual_cost' in testProject);

  const projectId = testProject.id;
  console.log(`\nTesting with Project ID ${projectId} (${testProject.name}):`);

  // 3. Gantt endpoint
  const ganttRes = await request(`/tasks/gantt?project_id=${projectId}`, { token });
  check('GET /tasks/gantt returns 200', ganttRes.status === 200);
  check('Gantt payload contains tasks array', Array.isArray(ganttRes.body?.data?.tasks));
  check('Gantt payload contains milestones array', Array.isArray(ganttRes.body?.data?.milestones));
  check('Gantt payload contains dependencies array', Array.isArray(ganttRes.body?.data?.dependencies));

  // 4. Create Task with estimated_cost and actual_cost
  const createTaskRes = await request('/tasks', {
    token,
    method: 'POST',
    body: {
      project_id: projectId,
      title: 'Task Pengujian Biaya dan Gantt',
      status: 'todo',
      priority: 'high',
      start_date: '2026-11-01',
      due_date: '2026-11-10',
      estimated_hours: 16,
      estimated_cost: 2500000,
      actual_cost: 0,
    },
  });
  check('POST /tasks with estimated_cost returns 200', createTaskRes.status === 200);
  const createdTaskId = createTaskRes.body?.data?.task?.id;
  check('Created task has ID and estimated_cost', createdTaskId && Number(createTaskRes.body?.data?.task?.estimated_cost) === 2500000);

  // 5. Update Task Schedule
  const updateScheduleRes = await request(`/tasks/${createdTaskId}/schedule`, {
    token,
    method: 'PATCH',
    body: {
      start_date: '2026-11-02',
      due_date: '2026-11-12',
    },
  });
  check('PATCH /tasks/:id/schedule updates dates', updateScheduleRes.status === 200 && updateScheduleRes.body?.data?.task?.start_date === '2026-11-02');

  // 6. Update Task Actual Cost
  const updateTaskRes = await request(`/tasks/${createdTaskId}`, {
    token,
    method: 'PATCH',
    body: {
      actual_cost: 1800000,
    },
  });
  check('PATCH /tasks/:id updates actual_cost', updateTaskRes.status === 200 && Number(updateTaskRes.body?.data?.task?.actual_cost) === 1800000);

  // 7. Add Dependency with lag_days
  const firstTaskId = ganttRes.body?.data?.tasks?.[0]?.id;
  if (firstTaskId && firstTaskId !== createdTaskId) {
    const depRes = await request(`/tasks/${createdTaskId}/dependencies`, {
      token,
      method: 'POST',
      body: {
        depends_on_id: firstTaskId,
        type: 'blocked_by',
        lag_days: 2,
      },
    });
    check('POST /tasks/:id/dependencies with lag_days succeeds', depRes.status === 200);
    const depId = depRes.body?.data?.dependency?.id;
    if (depId) {
      const deleteDepRes = await request(`/tasks/${createdTaskId}/dependencies/${depId}`, {
        token,
        method: 'DELETE',
      });
      check('DELETE /tasks/:id/dependencies/:depId succeeds', deleteDepRes.status === 200);
    }
  }

  // 8. Project Expenses CRUD
  const listExpensesRes = await request(`/projects/${projectId}/expenses`, { token });
  check('GET /projects/:id/expenses returns 200 and financials', listExpensesRes.status === 200 && Boolean(listExpensesRes.body?.data?.financials));

  const createExpenseRes = await request(`/projects/${projectId}/expenses`, {
    token,
    method: 'POST',
    body: {
      title: 'Pembelian Lisensi IDE & Tooling',
      category: 'operational',
      amount: 3200000,
      expense_date: '2026-11-05',
      vendor_name: 'JetBrains',
      receipt_note: 'Invoice #JB-88219',
    },
  });
  check('POST /projects/:id/expenses returns 201', createExpenseRes.status === 201);
  const expenseId = createExpenseRes.body?.data?.id;

  const updateExpenseRes = await request(`/projects/${projectId}/expenses/${expenseId}`, {
    token,
    method: 'PATCH',
    body: {
      amount: 3500000,
      receipt_note: 'Invoice #JB-88219 (Pajak ditambahkan)',
    },
  });
  check('PATCH /projects/:id/expenses/:expenseId updates expense', updateExpenseRes.status === 200 && Number(updateExpenseRes.body?.data?.amount) === 3500000);

  const deleteExpenseRes = await request(`/projects/${projectId}/expenses/${expenseId}`, {
    token,
    method: 'DELETE',
  });
  check('DELETE /projects/:id/expenses/:expenseId returns 200', deleteExpenseRes.status === 200);

  // 9. Clean up created task
  await request(`/tasks/${createdTaskId}`, { token, method: 'DELETE' });
  console.log(`Cleaned up temporary task ${createdTaskId}.`);

  console.log(`\n=== Verification Result: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});


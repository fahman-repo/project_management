'use strict';

const http = require('http');
const app = require('../src/app');
const env = require('../src/config/env');
const { pool } = require('../src/config/database');
const { initSocket } = require('../src/sockets');

const EMAIL = process.env.TEST_EMAIL || 'admin@pm.test';
const PASSWORD = process.env.TEST_PASSWORD || 'Password123!';

let server;
let baseUrl = `http://localhost:${env.PORT}`;
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
  console.log('\n=== Smoke Testing Risk & Issue Register Endpoints ===\n');

  // 1. Ensure server is up
  let serverStartedLocally = false;
  try {
    const res = await fetch(`http://localhost:${env.PORT}/api/v1/health`);
    if (res.ok) {
      baseUrl = `http://localhost:${env.PORT}`;
    }
  } catch (e) {
    // Start locally
    server = http.createServer(app);
    initSocket(server);
    await new Promise((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        serverStartedLocally = true;
        resolve();
      });
    });
  }

  try {
    // 2. Auth login
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
    });
    const token = loginRes.body?.data?.token;
    check('Admin login succeeds', Boolean(token));

    // 3. Get Project
    const projRes = await request('/projects?perPage=1', { token });
    check('GET /projects returns 200', projRes.status === 200);
    const projectId = projRes.body?.data?.[0]?.id;
    check('Valid project found', Boolean(projectId));

    console.log(`\nTesting with Project ID: ${projectId}`);

    // 4. List risks
    const listRes = await request(`/projects/${projectId}/risks`, { token });
    check('GET /projects/:id/risks returns 200', listRes.status === 200);
    check('Response has risks array', Array.isArray(listRes.body?.data?.risks));
    check('Response has summary with matrix', Array.isArray(listRes.body?.data?.summary?.matrix));
    check('Response matrix has 25 cells (5x5)', listRes.body?.data?.summary?.matrix?.length === 25);
    check('Project stats includes risk_count', typeof listRes.body?.data?.stats?.risk_count === 'number');

    // 5. Create new Risk (P=4, I=4 -> Score=16, Severity=critical)
    const createRes = await request(`/projects/${projectId}/risks`, {
      token,
      method: 'POST',
      body: {
        type: 'risk',
        title: 'Risiko Bottleneck Database IOPS',
        description: 'Trafik concurrent transaksi diproyeksikan melebihi throughput IOPS disk.',
        category: 'technical',
        probability: 4,
        impact: 4,
        mitigation_plan: 'Upgrade ke SSD NVMe dan tambahkan Redis read cache.',
        contingency_plan: 'Throttle non-essential background jobs saat peak hours.',
        status: 'mitigating',
        target_date: '2026-11-20',
      },
    });
    check('POST /projects/:id/risks creates risk (status 201)', createRes.status === 201);
    const newRisk = createRes.body?.data;
    check('Risk code auto-generated (RSK-xxx)', Boolean(newRisk?.code?.startsWith('RSK-')));
    check('Risk score calculated as 16 (4x4)', Number(newRisk?.risk_score) === 16);
    check('Severity auto-assigned as critical', newRisk?.severity === 'critical');
    check('Mitigation plan saved', newRisk?.mitigation_plan === 'Upgrade ke SSD NVMe dan tambahkan Redis read cache.');

    const riskId = newRisk?.id;

    // 6. Update Risk (decrease probability to 2, impact 3 -> score 6, severity medium)
    const updateRes = await request(`/projects/${projectId}/risks/${riskId}`, {
      token,
      method: 'PATCH',
      body: {
        probability: 2,
        impact: 3,
        status: 'resolved',
      },
    });
    check('PATCH /projects/:id/risks/:riskId returns 200', updateRes.status === 200);
    const updatedRisk = updateRes.body?.data;
    check('Updated risk score recalculated to 6 (2x3)', Number(updatedRisk?.risk_score) === 6);
    check('Updated severity recalculated to medium', updatedRisk?.severity === 'medium');
    check('Status updated to resolved', updatedRisk?.status === 'resolved');
    check('resolved_at timestamp is set on resolved status', Boolean(updatedRisk?.resolved_at));

    // 7. Verify filtered list by severity
    const filterRes = await request(`/projects/${projectId}/risks?status=resolved`, { token });
    check('Filter by status=resolved returns 200', filterRes.status === 200);
    const hasResolved = filterRes.body?.data?.risks?.some((r) => r.id === riskId);
    check('Resolved risk present in filtered list', hasResolved);

    // 8. Delete Risk
    const deleteRes = await request(`/projects/${projectId}/risks/${riskId}`, {
      token,
      method: 'DELETE',
    });
    check('DELETE /projects/:id/risks/:riskId returns 200', deleteRes.status === 200);

    // 9. Verify deleted risk no longer in list
    const finalListRes = await request(`/projects/${projectId}/risks`, { token });
    const stillExists = finalListRes.body?.data?.risks?.some((r) => r.id === riskId);
    check('Deleted risk no longer present in list', !stillExists);

    console.log(`\n=== Verification Result: ${passed} passed, ${failed} failed ===\n`);
  } finally {
    if (serverStartedLocally && server) {
      server.close();
    }
    await pool.end().catch(() => {});
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});


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
  console.log('\n=== Testing Kurva-S, EVM & Executive Report Endpoints ===\n');

  // 1. Auth
  const loginRes = await request('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = loginRes.body?.data?.token;
  check('Authentication succeeds', Boolean(token), loginRes.body);

  if (!token) {
    console.error('Cannot proceed without token. Exiting.');
    process.exit(1);
  }

  // 2. Fetch Projects to get a project ID
  const projectsRes = await request('/projects?perPage=5', { token });
  check('GET /projects returns 200', projectsRes.status === 200);
  const testProject = projectsRes.body?.data?.[0];
  check('At least one project exists', Boolean(testProject?.id));

  const projectId = testProject?.id;
  console.log(`\nTesting with Project: [${testProject?.code}] ${testProject?.name} (ID: ${projectId})`);

  // 3. GET /reports/evm (daily)
  const evmRes = await request(`/reports/evm?project_id=${projectId}`, { token });
  check('GET /reports/evm returns 200', evmRes.status === 200, evmRes.body);
  const evmData = evmRes.body?.data;
  check('EVM payload contains project metadata', evmData?.projectId === projectId && Boolean(evmData?.projectName));
  check('EVM payload contains summary object', typeof evmData?.summary === 'object');
  check('EVM summary has BAC, PV, EV, AC', 'bac' in evmData?.summary && 'pv' in evmData?.summary && 'ev' in evmData?.summary && 'ac' in evmData?.summary);
  check('EVM summary has CPI and SPI', 'cpi' in evmData?.summary && 'spi' in evmData?.summary);
  check('EVM summary has EAC, CV, SV, VAC', 'eac' in evmData?.summary && 'cv' in evmData?.summary && 'sv' in evmData?.summary && 'vac' in evmData?.summary);
  check('EVM payload contains time-series array', Array.isArray(evmData?.series) && evmData?.series.length > 0);
  const firstPoint = evmData?.series?.[0];
  check('Time-series point has date, pv, pvPercent', Boolean(firstPoint?.date) && 'pv' in firstPoint && 'pvPercent' in firstPoint);

  // 4. GET /reports/evm with interval=weekly
  const evmWeeklyRes = await request(`/reports/evm?project_id=${projectId}&interval=weekly`, { token });
  check('GET /reports/evm?interval=weekly returns 200', evmWeeklyRes.status === 200);
  check('Weekly EVM returns series array', Array.isArray(evmWeeklyRes.body?.data?.series));

  // 5. GET /reports/executive (multi-project / portfolio scope)
  const execAllRes = await request('/reports/executive', { token });
  check('GET /reports/executive returns 200', execAllRes.status === 200, execAllRes.body);
  const execAllData = execAllRes.body?.data;
  check('Executive report has generatedBy and generatedAt', Boolean(execAllData?.generatedAt) && Boolean(execAllData?.generatedBy?.name));
  check('Executive report has KPI block', typeof execAllData?.kpi === 'object');
  check('Executive report KPI has completionRate and overdueTasks', 'completionRate' in execAllData?.kpi && 'overdueTasks' in execAllData?.kpi);
  check('Executive report has financials block', typeof execAllData?.financials === 'object');
  check('Executive report financials has totalBudget and totalActualCost', 'totalBudget' in execAllData?.financials && 'totalActualCost' in execAllData?.financials);
  check('Executive report has milestones array', Array.isArray(execAllData?.milestones));
  check('Executive report has overdueTasks array', Array.isArray(execAllData?.overdueTasks));
  check('Executive report has projectBreakdown array', Array.isArray(execAllData?.projectBreakdown));

  // 6. GET /reports/executive?project_id=<id> (single project scope)
  const execSingleRes = await request(`/reports/executive?project_id=${projectId}`, { token });
  check('GET /reports/executive?project_id returns 200', execSingleRes.status === 200);
  const execSingleData = execSingleRes.body?.data;
  check('Single project executive report scope.isSingleProject is true', execSingleData?.scope?.isSingleProject === true);
  check('Single project executive report includes project EVM', typeof execSingleData?.evm?.summary === 'object');

  // 7. GET /reports/overview?project_id=<id> (filtered overview test)
  const overviewRes = await request(`/reports/overview?project_id=${projectId}`, { token });
  check('GET /reports/overview?project_id returns 200', overviewRes.status === 200);
  check('Overview payload contains financials and projectBreakdown', Boolean(overviewRes.body?.data?.financials) && Array.isArray(overviewRes.body?.data?.projectBreakdown));

  console.log(`\nTest Summary: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unhandled error during test run:', err);
  process.exit(1);
});


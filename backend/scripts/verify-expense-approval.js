'use strict';

const fs = require('fs');
const path = require('path');

const API = process.env.API_URL || 'http://localhost:5000';
const ADMIN_EMAIL = 'admin@pm.test';
const MANAGER_EMAIL = 'budi@pm.test';
const MEMBER_EMAIL = 'andi@pm.test';
const NON_MEMBER_EMAIL = 'maya@pm.test'; // We'll verify or adjust member assignment
const PASSWORD = 'Password123!';

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

async function request(path, { token, method = 'GET', body, headers = {} } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const reqHeaders = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };
  if (!isFormData && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: reqHeaders,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
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

async function login(email, password = PASSWORD) {
  const res = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  return res.body?.data?.token;
}

async function run() {
  console.log('\n=== Verification: Expense Receipt Upload & Approval Workflow ===\n');

  // 1. Authenticate users
  const adminToken = await login(ADMIN_EMAIL);
  const managerToken = await login(MANAGER_EMAIL);
  const memberToken = await login(MEMBER_EMAIL);
  check('Admin authenticates', Boolean(adminToken));
  check('Manager authenticates', Boolean(managerToken));
  check('Member authenticates', Boolean(memberToken));

  // Find a project where andi is a member and budi is manager (or admin can manage)
  const projRes = await request('/projects?perPage=10', { token: adminToken });
  const projects = projRes.body?.data || [];
  check('Fetched project list', projects.length > 0);

  // Pick project 3 (or first project)
  const testProject = projects.find((p) => p.id === 3) || projects[0];
  const projectId = testProject.id;
  console.log(`Using Project ID ${projectId} ("${testProject.name}")`);

  // Ensure member is added to project
  const memberUserRes = await request('/users', { token: adminToken });
  const allUsers = memberUserRes.body?.data || [];
  const memberUser = allUsers.find((u) => u.email === MEMBER_EMAIL);
  const nonMemberUser = allUsers.find((u) => u.email === NON_MEMBER_EMAIL);

  // Ensure andi is a member
  await request(`/projects/${projectId}/members`, {
    token: adminToken,
    method: 'POST',
    body: { user_id: memberUser.id, role: 'member' },
  });

  // Ensure nonMember is NOT a member
  await request(`/projects/${projectId}/members/${nonMemberUser.id}`, {
    token: adminToken,
    method: 'DELETE',
  });
  const nonMemberToken = await login(NON_MEMBER_EMAIL);

  // Initial financials check
  const initExpRes = await request(`/projects/${projectId}/expenses`, { token: adminToken });
  const initialActualCost = initExpRes.body?.data?.financials?.actual_cost || 0;
  console.log(`Initial project actual_cost: Rp ${initialActualCost.toLocaleString('id-ID')}`);

  // Test 1: Member submit expense WITHOUT file -> should fail 400
  const noFileForm = new FormData();
  noFileForm.append('title', 'Klaim Tanpa Nota');
  noFileForm.append('category', 'operational');
  noFileForm.append('amount', '250000');
  noFileForm.append('expense_date', '2026-10-28');
  const failSubmitRes = await request(`/projects/${projectId}/expenses`, {
    token: memberToken,
    method: 'POST',
    body: noFileForm,
  });
  check(
    'Member submit without file returns 400 (receipt required)',
    failSubmitRes.status === 400 && failSubmitRes.body?.message?.includes('Bukti pengeluaran wajib diunggah')
  );

  // Test 2: Member submit expense WITH valid image file -> 201, status='pending'
  const validFileForm = new FormData();
  validFileForm.append('title', 'Klaim Snack & Kopi Meeting Tim');
  validFileForm.append('category', 'operational');
  validFileForm.append('amount', '175000');
  validFileForm.append('expense_date', '2026-10-28');
  validFileForm.append('vendor_name', 'Kedai Kopi Staging');
  validFileForm.append('receipt_note', 'Invoice #KOP-9912');
  const dummyImageBytes = Buffer.from('FakeImageDataForTestingOnlyPNGHeader');
  const imageBlob = new Blob([dummyImageBytes], { type: 'image/png' });
  validFileForm.append('receipt', imageBlob, 'nota-kopi.png');

  const memberSubmitRes = await request(`/projects/${projectId}/expenses`, {
    token: memberToken,
    method: 'POST',
    body: validFileForm,
  });

  check('Member submit with file returns 201', memberSubmitRes.status === 201);
  const createdExpense = memberSubmitRes.body?.data;
  check('Expense has status "pending"', createdExpense?.status === 'pending');
  check('Expense has receipt_url', Boolean(createdExpense?.receipt_url));
  check('Expense original name preserved', createdExpense?.receipt_original_name === 'nota-kopi.png');

  const afterSubmitExpRes = await request(`/projects/${projectId}/expenses`, { token: adminToken });
  check(
    'Pending expense does NOT increase actual_cost',
    afterSubmitExpRes.body?.data?.financials?.actual_cost === initialActualCost
  );
  check(
    'Pending expense appears in total_pending_expenses',
    afterSubmitExpRes.body?.data?.financials?.total_pending_expenses >= 175000
  );

  // Test 3: Member attempts to approve -> 403 Forbidden
  const memberApproveRes = await request(`/projects/${projectId}/expenses/${createdExpense.id}/status`, {
    token: memberToken,
    method: 'PATCH',
    body: { status: 'approved' },
  });
  check('Member attempting to approve gets 403 Forbidden', memberApproveRes.status === 403);

  // Test 4: Manager approves expense -> 200, status='approved', actual_cost increases
  const managerApproveRes = await request(`/projects/${projectId}/expenses/${createdExpense.id}/status`, {
    token: adminToken, // admin can manage
    method: 'PATCH',
    body: { status: 'approved' },
  });
  check('Manager approves pending expense returns 200', managerApproveRes.status === 200);
  check('Expense status is now "approved"', managerApproveRes.body?.data?.status === 'approved');
  check('Expense approved_by is set', Boolean(managerApproveRes.body?.data?.approved_by));

  const afterApproveExpRes = await request(`/projects/${projectId}/expenses`, { token: adminToken });
  check(
    'Approved expense increases project actual_cost by amount',
    afterApproveExpRes.body?.data?.financials?.actual_cost === initialActualCost + 175000
  );

  // Test 5: Double approval on already approved expense -> 409 Conflict
  const doubleApproveRes = await request(`/projects/${projectId}/expenses/${createdExpense.id}/status`, {
    token: adminToken,
    method: 'PATCH',
    body: { status: 'approved' },
  });
  check('Approving already processed expense returns 409 Conflict', doubleApproveRes.status === 409);

  // Test 6: Rejection workflow with rejection_reason
  const rejectForm = new FormData();
  rejectForm.append('title', 'Klaim Tiket Pesawat VIP');
  rejectForm.append('category', 'operational');
  rejectForm.append('amount', '3500000');
  rejectForm.append('expense_date', '2026-10-27');
  const pdfBlob = new Blob([Buffer.from('%PDF-1.4 Fake PDF Content')], { type: 'application/pdf' });
  rejectForm.append('receipt', pdfBlob, 'tiket-pesawat.pdf');

  const memberSubmitRes2 = await request(`/projects/${projectId}/expenses`, {
    token: memberToken,
    method: 'POST',
    body: rejectForm,
  });
  const expToReject = memberSubmitRes2.body?.data;
  check('Submitted second expense for rejection test', Boolean(expToReject?.id));

  // Reject without reason -> 400
  const rejectNoReasonRes = await request(`/projects/${projectId}/expenses/${expToReject.id}/status`, {
    token: adminToken,
    method: 'PATCH',
    body: { status: 'rejected', rejection_reason: '' },
  });
  check('Rejecting without reason returns 400', rejectNoReasonRes.status === 400);

  // Reject with reason -> 200
  const rejectWithReasonRes = await request(`/projects/${projectId}/expenses/${expToReject.id}/status`, {
    token: adminToken,
    method: 'PATCH',
    body: { status: 'rejected', rejection_reason: 'Tiket VIP di luar plafon anggaran operasional' },
  });
  check('Rejecting with reason returns 200', rejectWithReasonRes.status === 200);
  check('Status is "rejected"', rejectWithReasonRes.body?.data?.status === 'rejected');
  check(
    'Rejection reason is stored',
    rejectWithReasonRes.body?.data?.rejection_reason === 'Tiket VIP di luar plafon anggaran operasional'
  );

  // Test 7: Member edits rejected expense -> automatically transitions back to pending
  const editRejectedForm = new FormData();
  editRejectedForm.append('title', 'Klaim Tiket Pesawat Ekonomi (Direvisi)');
  editRejectedForm.append('amount', '1200000');
  const resubmitRes = await request(`/projects/${projectId}/expenses/${expToReject.id}`, {
    token: memberToken,
    method: 'PATCH',
    body: editRejectedForm,
  });
  check('Member edits rejected expense returns 200', resubmitRes.status === 200);
  check('Status transitions back to "pending"', resubmitRes.body?.data?.status === 'pending');
  check('Rejection reason cleared on resubmit', resubmitRes.body?.data?.rejection_reason === null);

  // Test 8: Non-member access denied -> 403 Forbidden
  const nonMemberViewRes = await request(`/projects/${projectId}/expenses`, { token: nonMemberToken });
  check('Non-member GET expenses returns 403 Forbidden', nonMemberViewRes.status === 403);

  const nonMemberSubmitRes = await request(`/projects/${projectId}/expenses`, {
    token: nonMemberToken,
    method: 'POST',
    body: validFileForm,
  });
  check('Non-member POST expenses returns 403 Forbidden', nonMemberSubmitRes.status === 403);

  // Test 9: Invalid MIME upload rejected -> 400 Bad Request
  const badMimeForm = new FormData();
  badMimeForm.append('title', 'File Berbahaya');
  badMimeForm.append('category', 'other');
  badMimeForm.append('amount', '100000');
  badMimeForm.append('expense_date', '2026-10-28');
  const exeBlob = new Blob([Buffer.from('Fake EXE')], { type: 'application/x-msdownload' });
  badMimeForm.append('receipt', exeBlob, 'virus.exe');

  const badMimeRes = await request(`/projects/${projectId}/expenses`, {
    token: memberToken,
    method: 'POST',
    body: badMimeForm,
  });
  check('Invalid MIME upload returns 400', badMimeRes.status === 400);

  // Test 10: Delete expense cleans up file from disk
  const receiptFilename = createdExpense.receipt_file;
  const envUploadPath = require('../src/config/env').UPLOAD_PATH;
  const filePath = path.join(envUploadPath, path.basename(receiptFilename));
  check('Uploaded file exists on disk before delete', fs.existsSync(filePath));

  const deleteRes = await request(`/projects/${projectId}/expenses/${createdExpense.id}`, {
    token: adminToken,
    method: 'DELETE',
  });
  check('DELETE expense returns 200', deleteRes.status === 200);
  check('Uploaded file removed from disk after delete', !fs.existsSync(filePath));

  // Clean up the rejected/resubmitted test expense
  await request(`/projects/${projectId}/expenses/${expToReject.id}`, {
    token: adminToken,
    method: 'DELETE',
  });

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

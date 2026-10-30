'use strict';

/**
 * Smoke test for project documents & versioning endpoints.
 */
const mysql = require('mysql2/promise');
const env = require('../src/config/env');
const jwt = require('jsonwebtoken');

const API = process.env.API_URL || 'http://localhost:5000';

async function main() {
  console.log('[test-documents] Starting verification...');

  // Generate test JWT for admin (id: 1)
  const token = jwt.sign(
    { id: 1, email: 'admin@pm.test', role: 'admin' },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // We need an existing project id
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  const [projects] = await connection.query('SELECT id, name FROM projects LIMIT 1');
  if (!projects.length) {
    console.log('[test-documents] No projects found, skipping API test');
    await connection.end();
    return;
  }
  const projectId = projects[0].id;
  console.log(`[test-documents] Testing on project id ${projectId} (${projects[0].name})`);

  // Start Express server in-process if not running
  const app = require('../src/app');
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // 1. Create a Wiki Document
    const createRes = await fetch(`${baseUrl}/projects/${projectId}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Project Charter V1 Test',
        category: 'charter',
        status: 'published',
        summary: 'Dokumen piagam proyek pengujian',
        content: '# Project Charter\n\n## 1. Tujuan\nPengujian sistem dokumen.\n\n- Poin A\n- Poin B',
        change_note: 'Inisialisasi Project Charter',
        is_pinned: true,
      }),
    });
    const createData = await createRes.json();
    console.log('[test-documents] Create doc status:', createRes.status, createData.success);
    if (!createData.success) throw new Error(createData.message);

    const docId = createData.data.id;
    console.log(`[test-documents] Created document id ${docId}, code: ${createData.data.code}, version: ${createData.data.current_version}`);

    // 2. Fetch Document with versions
    const getRes = await fetch(`${baseUrl}/projects/${projectId}/documents/${docId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getData = await getRes.json();
    console.log('[test-documents] Get doc versions count:', getData.data.versions.length);
    if (getData.data.versions.length !== 1) throw new Error('Expected 1 initial version');

    // 3. Update Document (creates v2)
    const updateRes = await fetch(`${baseUrl}/projects/${projectId}/documents/${docId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Project Charter V2 Test',
        content: '# Project Charter Revisi\n\n## 1. Tujuan\nRevisi penambahan klausul keamanan.',
        change_note: 'Penambahan klausul keamanan sistem',
      }),
    });
    const updateData = await updateRes.json();
    console.log('[test-documents] Update doc current_version:', updateData.data.current_version);
    if (updateData.data.current_version !== 2) throw new Error('Expected current_version to be 2');

    // 4. Check versions list
    const getV2Res = await fetch(`${baseUrl}/projects/${projectId}/documents/${docId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getV2Data = await getV2Res.json();
    console.log('[test-documents] Versions after update:', getV2Data.data.versions.map(v => `v${v.version_number}: ${v.change_note}`));
    if (getV2Data.data.versions.length !== 2) throw new Error('Expected 2 versions');

    const v1 = getV2Data.data.versions.find(v => v.version_number === 1);

    // 5. Restore to v1 (creates v3)
    const restoreRes = await fetch(`${baseUrl}/projects/${projectId}/documents/${docId}/versions/${v1.id}/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        change_note: 'Rollback ke versi awal v1',
      }),
    });
    const restoreData = await restoreRes.json();
    console.log('[test-documents] Restore doc current_version:', restoreData.data.current_version);
    if (restoreData.data.current_version !== 3) throw new Error('Expected current_version to be 3');

    // 6. List documents with summary
    const listRes = await fetch(`${baseUrl}/projects/${projectId}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listRes.json();
    console.log('[test-documents] List summary:', listData.data.summary);
    if (listData.data.summary.total_count < 1) throw new Error('Expected at least 1 document in summary');

    // 7. Delete Document
    const delRes = await fetch(`${baseUrl}/projects/${projectId}/documents/${docId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const delData = await delRes.json();
    console.log('[test-documents] Delete status:', delRes.status, delData.success);

    console.log('[test-documents] ALL BACKEND DOCUMENT TESTS PASSED SUCCESSFULLY! 🎉');
  } finally {
    server.close();
    await connection.end();
  }
}

main().catch(err => {
  console.error('[test-documents] TEST FAILED:', err);
  process.exit(1);
});


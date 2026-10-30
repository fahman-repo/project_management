'use strict';

/**
 * Idempotent migration runner.
 *
 * Reads `schema.sql` and applies it statement by statement. Every statement in
 * the schema uses `CREATE TABLE IF NOT EXISTS`, so re-running is safe.
 *
 * Usage:
 *   node src/database/migrate.js          -> create missing tables
 *   node src/database/migrate.js --fresh  -> drop all tables first, then create
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

const FRESH = process.argv.includes('--fresh');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const TABLES = [
  'project_document_versions',
  'project_documents',
  'reminder_logs',
  'task_checklists',
  'project_risks',
  'task_attachments',
  'project_expenses',
  'task_comments',
  'task_labels',
  'task_dependencies',
  'tasks',
  'milestones',
  'project_members',
  'project_statuses',
  'labels',
  'activities',
  'notifications',
  'projects',
  'project_template_tasks',
  'project_template_milestones',
  'project_template_statuses',
  'project_templates',
  'users',
];

const DEFAULT_STATUSES = [
  { key_name: 'todo', label: 'Akan Dikerjakan', color: '#64748b', category: 'todo', progress: 0, position: 0 },
  { key_name: 'in_progress', label: 'Sedang Dikerjakan', color: '#3b82f6', category: 'in_progress', progress: 50, position: 1 },
  { key_name: 'review', label: 'Dalam Review', color: '#a855f7', category: 'review', progress: 75, position: 2 },
  { key_name: 'blocked', label: 'Tertunda', color: '#ef4444', category: 'blocked', progress: 0, position: 3 },
  { key_name: 'done', label: 'Selesai', color: '#10b981', category: 'done', progress: 100, position: 4 },
];

/**
 * Split a SQL file into individual statements, ignoring comments.
 * @param {string} sql
 * @returns {string[]}
 */
function splitStatements(sql) {
  return sql
    .split(';')
    .map((statement) =>
      statement
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter((statement) => statement.length > 0);
}

async function dropAllTables(connection) {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TABLES) {
    await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  // eslint-disable-next-line no-console
  console.log('[migrate] Dropped existing tables (--fresh).');
}

/**
 * Apply column alterations or data backfills if tables already existed.
 */
async function applyPatchMigrations(connection) {
  try {
    const [columnRows] = await connection.query(
      `SELECT DATA_TYPE, COLUMN_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'status'`,
      [env.DB_NAME]
    );
    if (columnRows.length && columnRows[0].DATA_TYPE === 'enum') {
      await connection.query(`ALTER TABLE tasks MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'todo'`);
      // eslint-disable-next-line no-console
      console.log('[migrate] Modified tasks.status to VARCHAR(50).');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[migrate] Note on tasks.status modification:', err.message);
  }

  try {
    const [tplCol] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'template_id'`,
      [env.DB_NAME]
    );
    if (!tplCol.length) {
      await connection.query(`ALTER TABLE projects ADD COLUMN template_id INT UNSIGNED NULL AFTER created_by`);
      // eslint-disable-next-line no-console
      console.log('[migrate] Added projects.template_id column.');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[migrate] Note on projects.template_id check:', err.message);
  }

try {
    const [taskCols] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks' AND COLUMN_NAME IN ('estimated_cost', 'actual_cost')`,
      [env.DB_NAME]
    );
    const names = taskCols.map((c) => c.COLUMN_NAME);
    if (!names.includes('estimated_cost')) {
      await connection.query(`ALTER TABLE tasks ADD COLUMN estimated_cost DECIMAL(15,2) NULL DEFAULT 0.00 AFTER actual_hours`);
      console.log('[migrate] Added tasks.estimated_cost column.');
    }
    if (!names.includes('actual_cost')) {
      await connection.query(`ALTER TABLE tasks ADD COLUMN actual_cost DECIMAL(15,2) NULL DEFAULT 0.00 AFTER estimated_cost`);
      console.log('[migrate] Added tasks.actual_cost column.');
    }
  } catch (err) {
    console.warn('[migrate] Note on tasks cost columns:', err.message);
  }

  try {
    const [depCols] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'task_dependencies' AND COLUMN_NAME = 'lag_days'`,
      [env.DB_NAME]
    );
    if (!depCols.length) {
      await connection.query(`ALTER TABLE task_dependencies ADD COLUMN lag_days INT NOT NULL DEFAULT 0 AFTER type`);
      console.log('[migrate] Added task_dependencies.lag_days column.');
    }
  } catch (err) {
    console.warn('[migrate] Note on task_dependencies.lag_days:', err.message);
  }

  try {
    const [pttCols] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'project_template_tasks' AND COLUMN_NAME = 'estimated_cost'`,
      [env.DB_NAME]
    );
    if (!pttCols.length) {
      await connection.query(`ALTER TABLE project_template_tasks ADD COLUMN estimated_cost DECIMAL(15,2) NULL DEFAULT 0.00 AFTER estimated_hours`);
      console.log('[migrate] Added project_template_tasks.estimated_cost column.');
    }
  } catch (err) {
    console.warn('[migrate] Note on project_template_tasks.estimated_cost:', err.message);
  }

  // project_expenses: receipt upload + approval workflow columns.
  // The status backfill runs only on the first application (when the column is
  // missing) so legacy totals are preserved and re-runs stay idempotent.
  try {
    const [expenseCols] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'project_expenses'`,
      [env.DB_NAME]
    );
    const expenseColumnNames = expenseCols.map((c) => c.COLUMN_NAME);

    if (!expenseColumnNames.includes('status')) {
      await connection.query(
        `ALTER TABLE project_expenses ADD COLUMN status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' AFTER expense_date`
      );
      await connection.query(`UPDATE project_expenses SET status = 'approved'`);
      console.log('[migrate] Added project_expenses.status and backfilled legacy rows to approved.');
    }
    if (!expenseColumnNames.includes('receipt_file')) {
      await connection.query(`ALTER TABLE project_expenses ADD COLUMN receipt_file VARCHAR(255) NULL AFTER receipt_note`);
      console.log('[migrate] Added project_expenses.receipt_file column.');
    }
    if (!expenseColumnNames.includes('receipt_original_name')) {
      await connection.query(`ALTER TABLE project_expenses ADD COLUMN receipt_original_name VARCHAR(255) NULL AFTER receipt_file`);
      console.log('[migrate] Added project_expenses.receipt_original_name column.');
    }
    if (!expenseColumnNames.includes('receipt_mime_type')) {
      await connection.query(`ALTER TABLE project_expenses ADD COLUMN receipt_mime_type VARCHAR(120) NULL AFTER receipt_original_name`);
      console.log('[migrate] Added project_expenses.receipt_mime_type column.');
    }
    if (!expenseColumnNames.includes('receipt_size')) {
      await connection.query(`ALTER TABLE project_expenses ADD COLUMN receipt_size INT UNSIGNED NULL AFTER receipt_mime_type`);
      console.log('[migrate] Added project_expenses.receipt_size column.');
    }
    if (!expenseColumnNames.includes('approved_by')) {
      await connection.query(`ALTER TABLE project_expenses ADD COLUMN approved_by INT UNSIGNED NULL AFTER created_by`);
      console.log('[migrate] Added project_expenses.approved_by column.');
    }
    if (!expenseColumnNames.includes('approved_at')) {
      await connection.query(`ALTER TABLE project_expenses ADD COLUMN approved_at DATETIME NULL AFTER approved_by`);
      console.log('[migrate] Added project_expenses.approved_at column.');
    }
    if (!expenseColumnNames.includes('rejection_reason')) {
      await connection.query(`ALTER TABLE project_expenses ADD COLUMN rejection_reason VARCHAR(500) NULL AFTER approved_at`);
      console.log('[migrate] Added project_expenses.rejection_reason column.');
    }

    const [statusIndexRows] = await connection.query(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'project_expenses' AND INDEX_NAME = 'idx_pe_project_status'`,
      [env.DB_NAME]
    );
    if (!statusIndexRows.length) {
      await connection.query(`ALTER TABLE project_expenses ADD INDEX idx_pe_project_status (project_id, status)`);
      console.log('[migrate] Added idx_pe_project_status index.');
    }

    const [approverFkRows] = await connection.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'project_expenses' AND CONSTRAINT_NAME = 'fk_pe_approver'`,
      [env.DB_NAME]
    );
    if (!approverFkRows.length) {
      await connection.query(
        `ALTER TABLE project_expenses ADD CONSTRAINT fk_pe_approver FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL`
      );
      console.log('[migrate] Added fk_pe_approver foreign key.');
    }
  } catch (err) {
    console.warn('[migrate] Note on project_expenses approval columns:', err.message);
  }

  // users.weekly_capacity_hours for Resource Capacity & Workload Heatmap
  try {
    const [userCapCol] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'weekly_capacity_hours'`,
      [env.DB_NAME]
    );
    if (!userCapCol.length) {
      await connection.query(
        `ALTER TABLE users ADD COLUMN weekly_capacity_hours DECIMAL(5,2) NOT NULL DEFAULT 40.00 AFTER bio`
      );
      console.log('[migrate] Added users.weekly_capacity_hours column.');
    }
  } catch (err) {
    console.warn('[migrate] Note on users.weekly_capacity_hours check:', err.message);
  }

  // Ensure every project has project_statuses rows
  try {
    const [projects] = await connection.query(`SELECT id FROM projects`);
    for (const proj of projects) {
      const [existing] = await connection.query(
        `SELECT COUNT(*) AS total FROM project_statuses WHERE project_id = ?`,
        [proj.id]
      );
      if (Number(existing[0]?.total || 0) === 0) {
        for (const st of DEFAULT_STATUSES) {
          await connection.query(
            `INSERT INTO project_statuses (project_id, key_name, label, color, category, progress, position)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [proj.id, st.key_name, st.label, st.color, st.category, st.progress, st.position]
          );
        }
      }
    }
  } catch (err) {
    // table might not be created yet during first statement run
  }
}

async function run() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const statements = splitStatements(sql);

  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: false,
    charset: 'utf8mb4_unicode_ci',
  });

  try {
    // eslint-disable-next-line no-console
    console.log(`[migrate] Connected to ${env.DB_NAME} @ ${env.DB_HOST}:${env.DB_PORT}`);

    if (FRESH) {
      await dropAllTables(connection);
    }

    for (const statement of statements) {
      await connection.query(statement);
    }

    await applyPatchMigrations(connection);

    const [tableRows] = await connection.query(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [env.DB_NAME]
    );

    // eslint-disable-next-line no-console
    console.log(`[migrate] Applied ${statements.length} statements.`);
    // eslint-disable-next-line no-console
    console.log(`[migrate] Tables present: ${tableRows.map((t) => t.name).join(', ')}`);
    // eslint-disable-next-line no-console
    console.log('[migrate] Done.');
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] Failed:', error.message);
  process.exit(1);
});

'use strict';

const { query } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/response');
const { getPagination, buildMeta } = require('../utils/pagination');
const { accessibleProjectIds } = require('../services/accessService');
const { inPlaceholders } = require('../models/base');

/**
 * Restrict the audit trail to what the user is allowed to see.
 *
 * Admins see everything. Other users see the activities of the projects they
 * belong to plus the activities they performed themselves.
 *
 * @param {number[]|null} projectIds
 * @param {number} userId
 * @returns {{sql:string, params:any[]}}
 */
function activityScope(projectIds, userId) {
  if (projectIds === null) return { sql: '1 = 1', params: [] };

  const clauses = ['a.user_id = ?'];
  const params = [userId];

  if (projectIds.length) {
    clauses.push(`a.project_id IN (${inPlaceholders(projectIds)})`);
    params.push(...projectIds);
  }

  return { sql: `(${clauses.join(' OR ')})`, params };
}

/**
 * Build the shared WHERE clause for the activity list and count queries.
 * @param {object} options
 * @param {number[]|null} options.projectIds
 * @param {number} options.userId
 * @param {object} options.filters {user_id, project_id, task_id, action, from, to}
 * @returns {{sql:string, params:any[]}}
 */
function buildActivityWhere({ projectIds, userId, filters }) {
  const scope = activityScope(projectIds, userId);
  const clauses = [scope.sql];
  const params = [...scope.params];

  if (filters.user_id) {
    clauses.push('a.user_id = ?');
    params.push(Number(filters.user_id));
  }
  if (filters.project_id) {
    clauses.push('a.project_id = ?');
    params.push(Number(filters.project_id));
  }
  if (filters.task_id) {
    clauses.push('a.task_id = ?');
    params.push(Number(filters.task_id));
  }
  if (filters.action) {
    clauses.push('a.action = ?');
    params.push(filters.action);
  }
  if (filters.from) {
    clauses.push('a.created_at >= ?');
    params.push(`${filters.from} 00:00:00`);
  }
  if (filters.to) {
    clauses.push('a.created_at <= ?');
    params.push(`${filters.to} 23:59:59`);
  }

  return { sql: `WHERE ${clauses.join(' AND ')}`, params };
}

/**
 * GET /api/v1/activities
 * Paginated audit trail.
 */
const listActivities = asyncHandler(async (req, res) => {
  const { page, perPage, offset } = getPagination(req.query);
  const projectIds = await accessibleProjectIds(req.user);

  const filters = {
    user_id: req.query.user_id,
    project_id: req.query.project_id,
    task_id: req.query.task_id,
    action: req.query.action,
    from: req.query.from,
    to: req.query.to,
  };

  const where = buildActivityWhere({ projectIds, userId: req.user.id, filters });

  const rows = await query(
    `SELECT a.id, a.user_id, a.project_id, a.task_id, a.action, a.entity_type, a.entity_id,
            a.description, a.metadata, a.created_at,
            u.name AS user_name, u.avatar AS user_avatar, u.role AS user_role,
            p.name AS project_name, p.code AS project_code,
            t.title AS task_title
       FROM activities a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN tasks t ON t.id = a.task_id
       ${where.sql}
       ORDER BY a.id DESC
       LIMIT ? OFFSET ?`,
    [...where.params, Number(perPage), Number(offset)]
  );

  const countRows = await query(
    `SELECT COUNT(*) AS total FROM activities a ${where.sql}`,
    where.params
  );

  const total = countRows[0]?.total || 0;

  return sendPaginated(
    res,
    rows,
    buildMeta(total, page, perPage),
    'Berhasil memuat riwayat aktivitas'
  );
});

/**
 * GET /api/v1/activities/actions
 * Distinct action names available as a filter.
 */
const listActions = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const scope = activityScope(projectIds, req.user.id);

  const rows = await query(
    `SELECT DISTINCT a.action
       FROM activities a
      WHERE ${scope.sql}
      ORDER BY a.action ASC`,
    scope.params
  );

  return sendSuccess(
    res,
    rows.map((row) => row.action),
    'Berhasil memuat daftar aksi'
  );
});

module.exports = { listActivities, listActions };

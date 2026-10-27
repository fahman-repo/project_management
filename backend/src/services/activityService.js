'use strict';

const { execute, query } = require('../config/database');
const socketService = require('./socketService');

/**
 * Record an audit-trail entry and push it to connected clients.
 *
 * @param {object} entry
 * @param {number|null} entry.userId     actor
 * @param {number|null} entry.projectId
 * @param {number|null} entry.taskId
 * @param {string} entry.action          e.g. 'task.created', 'task.status_changed'
 * @param {string|null} entry.entityType
 * @param {number|null} entry.entityId
 * @param {string} entry.description
 * @param {object} [entry.metadata]
 * @returns {Promise<object|null>} the created activity row
 */
async function record(entry) {
  const {
    userId = null,
    projectId = null,
    taskId = null,
    action,
    entityType = null,
    entityId = null,
    description,
    metadata = null,
  } = entry;

  const result = await execute(
    `INSERT INTO activities (user_id, project_id, task_id, action, entity_type, entity_id, description, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      projectId,
      taskId,
      action,
      entityType,
      entityId,
      description,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );

  const activity = {
    id: result.insertId,
    user_id: userId,
    project_id: projectId,
    task_id: taskId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    description,
    metadata,
    created_at: new Date().toISOString(),
  };

  socketService.emitGlobal('activity:new', activity);
  if (projectId) socketService.emitToProject(projectId, 'activity:new', activity);

  return activity;
}

/**
 * List activities with optional filters.
 * @param {object} options
 * @param {number} [options.userId]
 * @param {number} [options.projectId]
 * @param {number} [options.taskId]
 * @param {string} [options.action]
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 */
async function list(options = {}) {
  const { userId, projectId, taskId, action, limit = 20, offset = 0 } = options;

  const where = [];
  const params = [];

  if (userId) {
    where.push('a.user_id = ?');
    params.push(userId);
  }
  if (projectId) {
    where.push('a.project_id = ?');
    params.push(projectId);
  }
  if (taskId) {
    where.push('a.task_id = ?');
    params.push(taskId);
  }
  if (action) {
    where.push('a.action = ?');
    params.push(action);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await query(
    `SELECT a.*, u.name AS user_name, u.avatar AS user_avatar, u.role AS user_role,
            p.name AS project_name, t.title AS task_title
       FROM activities a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN tasks t ON t.id = a.task_id
       ${whereSql}
       ORDER BY a.id DESC
       LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );

  return rows;
}

/**
 * Count activities matching the same filters (without limit/offset).
 * @param {object} options same as `list`
 */
async function count(options = {}) {
  const { userId, projectId, taskId, action } = options;

  const where = [];
  const params = [];

  if (userId) {
    where.push('a.user_id = ?');
    params.push(userId);
  }
  if (projectId) {
    where.push('a.project_id = ?');
    params.push(projectId);
  }
  if (taskId) {
    where.push('a.task_id = ?');
    params.push(taskId);
  }
  if (action) {
    where.push('a.action = ?');
    params.push(action);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await query(
    `SELECT COUNT(*) AS total FROM activities a ${whereSql}`,
    params
  );

  return rows[0]?.total || 0;
}

module.exports = { record, list, count };

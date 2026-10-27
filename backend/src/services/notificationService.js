'use strict';

const { execute, query } = require('../config/database');
const socketService = require('./socketService');

/**
 * Create a notification for one or more users and push it in real time.
 *
 * @param {object} entry
 * @param {number|number[]} entry.userId  recipient(s)
 * @param {'info'|'success'|'warning'|'danger'|'task'|'mention'} [entry.type]
 * @param {string} entry.title
 * @param {string} [entry.message]
 * @param {string} [entry.link]
 * @returns {Promise<object|null>}
 */
async function notify(entry) {
  const { userId, type = 'info', title, message = null, link = null } = entry;

  const userIds = (Array.isArray(userId) ? userId : [userId]).filter(Boolean);
  if (!userIds.length) return null;

  const placeholders = userIds.map(() => '(?, ?, ?, ?, ?)').join(', ');
  const params = userIds.flatMap((id) => [id, type, title, message, link]);

  const result = await execute(
    `INSERT INTO notifications (user_id, type, title, message, link)
     VALUES ${placeholders}`,
    params
  );

  const notification = {
    id: result.insertId,
    type,
    title,
    message,
    link,
    is_read: 0,
    created_at: new Date().toISOString(),
  };

  for (const id of userIds) {
    socketService.emitToUser(id, 'notification:new', { ...notification, user_id: id });
  }

  return notification;
}

/**
 * Notify every member of a project, optionally excluding the actor.
 * @param {number} projectId
 * @param {object} entry - same shape as `notify`, plus `excludeUserId`
 * @returns {Promise<void>}
 */
async function notifyProjectMembers(projectId, entry) {
  const { excludeUserId = null, ...rest } = entry;

  const rows = await query(
    `SELECT user_id FROM project_members WHERE project_id = ?`,
    [projectId]
  );

  const recipients = rows
    .map((row) => row.user_id)
    .filter((id) => id !== excludeUserId);

  if (!recipients.length) return;
  await notify({ ...rest, userId: recipients });
}

/**
 * @param {number} userId
 * @param {object} options
 */
async function list(userId, options = {}) {
  const { limit = 15, offset = 0, unreadOnly = false } = options;

  const where = ['user_id = ?'];
  const params = [userId];

  if (unreadOnly) where.push('is_read = 0');

  const rows = await query(
    `SELECT id, user_id, type, title, message, link, is_read, read_at, created_at
       FROM notifications
       WHERE ${where.join(' AND ')}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );

  return rows;
}

/**
 * @param {number} userId
 * @param {object} [options]
 */
async function count(userId, options = {}) {
  const { unreadOnly = false } = options;

  const where = ['user_id = ?'];
  const params = [userId];

  if (unreadOnly) where.push('is_read = 0');

  const rows = await query(
    `SELECT COUNT(*) AS total FROM notifications WHERE ${where.join(' AND ')}`,
    params
  );

  return rows[0]?.total || 0;
}

/**
 * @param {number} userId
 * @param {number} notificationId
 */
async function markRead(userId, notificationId) {
  await execute(
    `UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?`,
    [notificationId, userId]
  );
  return true;
}

/**
 * @param {number} userId
 */
async function markAllRead(userId) {
  const result = await execute(
    `UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0`,
    [userId]
  );
  return result.affectedRows;
}

/**
 * @param {number} userId
 * @param {number} notificationId
 */
async function remove(userId, notificationId) {
  const result = await execute(
    `DELETE FROM notifications WHERE id = ? AND user_id = ?`,
    [notificationId, userId]
  );
  return result.affectedRows > 0;
}

module.exports = { notify, notifyProjectMembers, list, count, markRead, markAllRead, remove };

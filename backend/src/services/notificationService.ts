import { execute, query } from '../config/database';
import socketService from './socketService';

export interface NotificationEntry {
  userId: number | number[];
  type?: 'info' | 'success' | 'warning' | 'danger' | 'task' | 'mention';
  title: string;
  message?: string | null;
  link?: string | null;
}

/**
 * Create a notification for one or more users and push it in real time.
 */
export async function notify(entry: NotificationEntry): Promise<any> {
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
 */
export async function notifyProjectMembers(projectId: number, entry: Omit<NotificationEntry, 'userId'> & { excludeUserId?: number | null }): Promise<void> {
  const { excludeUserId = null, ...rest } = entry;

  const rows = await query<{ user_id: number }>(
    `SELECT user_id FROM project_members WHERE project_id = ?`,
    [projectId]
  );

  const recipients = rows
    .map((row) => row.user_id)
    .filter((id) => id !== excludeUserId);

  if (!recipients.length) return;
  await notify({ ...rest, userId: recipients });
}

export async function list(userId: number, options: { limit?: number; offset?: number; unreadOnly?: boolean } = {}): Promise<any[]> {
  const { limit = 15, offset = 0, unreadOnly = false } = options;

  const where = ['user_id = ?'];
  const params: any[] = [userId];

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

export async function count(userId: number, options: { unreadOnly?: boolean } = {}): Promise<number> {
  const { unreadOnly = false } = options;

  const where = ['user_id = ?'];
  const params: any[] = [userId];

  if (unreadOnly) where.push('is_read = 0');

  const rows = await query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM notifications WHERE ${where.join(' AND ')}`,
    params
  );

  return rows[0]?.total || 0;
}

export async function markRead(userId: number, notificationId: number): Promise<boolean> {
  await execute(
    `UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?`,
    [notificationId, userId]
  );
  return true;
}

export async function markAllRead(userId: number): Promise<number> {
  const result = await execute(
    `UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0`,
    [userId]
  );
  return result.affectedRows;
}

export async function remove(userId: number, notificationId: number): Promise<boolean> {
  const result = await execute(
    `DELETE FROM notifications WHERE id = ? AND user_id = ?`,
    [notificationId, userId]
  );
  return result.affectedRows > 0;
}

export default { notify, notifyProjectMembers, list, count, markRead, markAllRead, remove };

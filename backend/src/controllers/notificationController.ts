'use strict';

import asyncHandler from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import ApiError from '../utils/ApiError';
import { getPagination } from '../utils/pagination';
import { execute, query } from '../config/database';
import notificationService from '../services/notificationService';
import reminderService from '../services/reminderService';

/**
 * GET /api/v1/notifications
 * The current user's notifications plus the unread counter.
 */
const listNotifications = asyncHandler(async (req, res) => {
  const { page, perPage, offset } = getPagination(req.query);
  const unreadOnly = (req.query.unread as any) === true || req.query.unread === 'true';

  const [items, unreadCount] = await Promise.all([
    notificationService.list(req.user.id, { limit: perPage, offset, unreadOnly }),
    notificationService.count(req.user.id, { unreadOnly: true }),
  ]);

  return sendSuccess(res, { items, unreadCount }, 'Berhasil memuat notifikasi');
});

/**
 * PATCH /api/v1/notifications/:id/read
 */
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await query('SELECT id FROM notifications WHERE id = ? AND user_id = ? LIMIT 1', [
    Number(id),
    req.user.id,
  ]);

  if (!existing.length) throw ApiError.notFound('Notifikasi tidak ditemukan');

  await notificationService.markRead(req.user.id, Number(id));

  const unreadCount = await notificationService.count(req.user.id, { unreadOnly: true });

  return sendSuccess(res, { id: Number(id), unreadCount }, 'Notifikasi ditandai telah dibaca');
});

/**
 * PATCH /api/v1/notifications/read-all
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  const affected = await notificationService.markAllRead(req.user.id);

  return sendSuccess(res, { marked: affected, unreadCount: 0 }, 'Semua notifikasi ditandai telah dibaca');
});

/**
 * DELETE /api/v1/notifications/:id
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const removed = await notificationService.remove(req.user.id, Number(id));
  if (!removed) throw ApiError.notFound('Notifikasi tidak ditemukan');

  const unreadCount = await notificationService.count(req.user.id, { unreadOnly: true });

  return sendSuccess(res, { id: Number(id), unreadCount }, 'Notifikasi berhasil dihapus');
});

/**
 * DELETE /api/v1/notifications
 * Removes every notification that has already been read.
 */
const deleteReadNotifications = asyncHandler(async (req, res) => {
  const result = await execute('DELETE FROM notifications WHERE user_id = ? AND is_read = 1', [
    req.user.id,
  ]);

  const unreadCount = await notificationService.count(req.user.id, { unreadOnly: true });

  return sendSuccess(
    res,
    { deleted: result.affectedRows, unreadCount },
    'Notifikasi yang telah dibaca berhasil dihapus'
  );
});

/**
 * POST /api/v1/notifications/run-reminders
 * Admin / Manager trigger for deadline reminders
 */
const triggerReminders = asyncHandler(async (req, res) => {
  const result = await reminderService.runDueReminders();
  return sendSuccess(res, result, 'Pengecekan pengingat tenggat berhasil dijalankan');
});

export { listNotifications };
export { markAsRead };
export { markAllAsRead };
export { deleteNotification };
export { deleteReadNotifications };
export { triggerReminders };

export default {
  listNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteReadNotifications,
  triggerReminders
};

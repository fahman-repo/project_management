'use strict';

import express from 'express';
import asyncHandler from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import controller from '../controllers/notificationController';
import { idParams, notificationListQuery } from '../validators/analytics.validator';

const router = express.Router();

router.use(requireAuth);

router.get('/', validate({ query: notificationListQuery }), asyncHandler(controller.listNotifications));
router.post('/run-reminders', requireRole('admin', 'manager'), asyncHandler(controller.triggerReminders));

// `read-all` must be registered before `/:id` so the id param does not swallow it.
router.patch('/read-all', asyncHandler(controller.markAllAsRead));
router.patch('/:id/read', validate({ params: idParams }), asyncHandler(controller.markAsRead));

router.delete('/', asyncHandler(controller.deleteReadNotifications));
router.delete('/:id', validate({ params: idParams }), asyncHandler(controller.deleteNotification));

export default router;

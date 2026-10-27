'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/notificationController');
const { idParams, notificationListQuery } = require('../validators/analytics.validator');

const router = express.Router();

router.use(requireAuth);

router.get('/', validate({ query: notificationListQuery }), asyncHandler(controller.listNotifications));

// `read-all` must be registered before `/:id` so the id param does not swallow it.
router.patch('/read-all', asyncHandler(controller.markAllAsRead));
router.patch('/:id/read', validate({ params: idParams }), asyncHandler(controller.markAsRead));

router.delete('/', asyncHandler(controller.deleteReadNotifications));
router.delete('/:id', validate({ params: idParams }), asyncHandler(controller.deleteNotification));

module.exports = router;

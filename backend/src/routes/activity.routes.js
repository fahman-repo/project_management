'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/activityController');
const { activityListQuery } = require('../validators/analytics.validator');

const router = express.Router();

router.use(requireAuth);

// `actions` must be registered before any `/:id` style route.
router.get('/actions', asyncHandler(controller.listActions));
router.get('/', validate({ query: activityListQuery }), asyncHandler(controller.listActivities));

module.exports = router;

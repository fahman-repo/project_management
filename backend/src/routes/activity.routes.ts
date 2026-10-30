'use strict';

import express from 'express';
import asyncHandler from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import controller from '../controllers/activityController';
import { activityListQuery } from '../validators/analytics.validator';

const router = express.Router();

router.use(requireAuth);

// `actions` must be registered before any `/:id` style route.
router.get('/actions', asyncHandler(controller.listActions));
router.get('/', validate({ query: activityListQuery }), asyncHandler(controller.listActivities));

export default router;

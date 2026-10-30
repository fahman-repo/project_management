'use strict';

import express from 'express';
import asyncHandler from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import controller from '../controllers/calendarController';
import { calendarEventsQuery } from '../validators/analytics.validator';

const router = express.Router();

router.use(requireAuth);

router.get('/events', validate({ query: calendarEventsQuery }), asyncHandler(controller.getEvents));

export default router;

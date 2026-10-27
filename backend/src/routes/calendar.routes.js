'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/calendarController');
const { calendarEventsQuery } = require('../validators/analytics.validator');

const router = express.Router();

router.use(requireAuth);

router.get('/events', validate({ query: calendarEventsQuery }), asyncHandler(controller.getEvents));

module.exports = router;

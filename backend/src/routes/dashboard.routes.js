'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/dashboardController');

const router = express.Router();

router.use(requireAuth);

router.get('/stats', asyncHandler(controller.getStats));
router.get('/my-tasks', asyncHandler(controller.getMyTasks));
router.get('/project-progress', asyncHandler(controller.getProjectProgress));
router.get('/workload', asyncHandler(controller.getWorkload));
router.get('/capacity-heatmap', asyncHandler(controller.getCapacityHeatmap));

module.exports = router;

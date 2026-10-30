'use strict';

import express from 'express';
import asyncHandler from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import controller from '../controllers/dashboardController';

const router = express.Router();

router.use(requireAuth);

router.get('/stats', asyncHandler(controller.getStats));
router.get('/my-tasks', asyncHandler(controller.getMyTasks));
router.get('/project-progress', asyncHandler(controller.getProjectProgress));
router.get('/workload', asyncHandler(controller.getWorkload));
router.get('/capacity-heatmap', asyncHandler(controller.getCapacityHeatmap));

export default router;

'use strict';

import express from 'express';
import asyncHandler from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import controller from '../controllers/reportController';
import { overviewQuery,
  statusDistributionQuery,
  productivityQuery,
  burndownQuery,
  evmQuery,
  executiveReportQuery,
  completionTrendQuery,
  exportQuery, } from '../validators/analytics.validator';

const router = express.Router();

router.use(requireAuth);

router.get('/overview', validate({ query: overviewQuery }), asyncHandler(controller.getOverview));
router.get('/status-distribution', validate({ query: statusDistributionQuery }), asyncHandler(controller.getStatusDistribution));
router.get('/productivity', validate({ query: productivityQuery }), asyncHandler(controller.getProductivity));
router.get('/burndown', validate({ query: burndownQuery }), asyncHandler(controller.getBurndown));
router.get('/evm', validate({ query: evmQuery }), asyncHandler(controller.getEvm));
router.get('/executive', validate({ query: executiveReportQuery }), asyncHandler(controller.getExecutiveReport));
router.get('/completion-trend', validate({ query: completionTrendQuery }), asyncHandler(controller.getCompletionTrend));
router.get('/export', validate({ query: exportQuery }), asyncHandler(controller.exportReport));

export default router;

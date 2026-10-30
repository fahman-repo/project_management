'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/reportController');
const {
  overviewQuery,
  statusDistributionQuery,
  productivityQuery,
  burndownQuery,
  evmQuery,
  executiveReportQuery,
  completionTrendQuery,
  exportQuery,
} = require('../validators/analytics.validator');

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

module.exports = router;

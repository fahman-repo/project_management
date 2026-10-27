'use strict';

const express = require('express');
const { query } = require('../config/database');
const { testConnection } = require('../config/database');

const router = express.Router();

/**
 * GET /api/v1/health
 * Basic liveness probe including a database round-trip.
 */
router.get('/health', async (req, res) => {
  const dbConnected = await testConnection();
  return res.status(dbConnected ? 200 : 503).json({
    success: dbConnected,
    message: dbConnected ? 'Service berjalan normal' : 'Database tidak dapat dihubungi',
    data: {
      status: dbConnected ? 'ok' : 'degraded',
      database: dbConnected ? 'connected' : 'disconnected',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/projects', require('./project.routes'));
router.use('/templates', require('./template.routes'));
router.use('/tasks', require('./task.routes'));
router.use('/milestones', require('./milestone.routes'));
router.use('/labels', require('./label.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/reports', require('./report.routes'));
router.use('/calendar', require('./calendar.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/activities', require('./activity.routes'));

module.exports = router;

import express from 'express';
import { testConnection } from '../config/database';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import projectRoutes from './project.routes';
import templateRoutes from './template.routes';
import taskRoutes from './task.routes';
import milestoneRoutes from './milestone.routes';
import labelRoutes from './label.routes';
import dashboardRoutes from './dashboard.routes';
import reportRoutes from './report.routes';
import calendarRoutes from './calendar.routes';
import notificationRoutes from './notification.routes';
import activityRoutes from './activity.routes';
import searchRoutes from './search.routes';

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

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/projects', projectRoutes);
router.use('/templates', templateRoutes);
router.use('/tasks', taskRoutes);
router.use('/milestones', milestoneRoutes);
router.use('/labels', labelRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/calendar', calendarRoutes);
router.use('/notifications', notificationRoutes);
router.use('/activities', activityRoutes);
router.use('/search', searchRoutes);

export default router;

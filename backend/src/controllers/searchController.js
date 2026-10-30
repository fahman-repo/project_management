'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { query } = require('../config/database');
const accessService = require('../services/accessService');
const { inPlaceholders } = require('../models/base');

/**
 * Global Search endpoint across Projects, Tasks, Milestones, and Users.
 * GET /api/v1/search?q=keyword&limit=5
 */
const searchGlobal = asyncHandler(async (req, res) => {
  const rawQ = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 5), 10);

  if (!rawQ) {
    return sendSuccess(
      res,
      { projects: [], tasks: [], milestones: [], users: [] },
      'Pencarian berhasil'
    );
  }

  const keyword = `%${rawQ}%`;
  const isAdmin = req.user.role === 'admin';
  const accessibleProjectIds = await accessService.accessibleProjectIds(req.user);

  // 1. Projects Query
  const projectWhere = ['(p.name LIKE ? OR p.code LIKE ? OR p.description LIKE ?)'];
  const projectParams = [keyword, keyword, keyword];

  if (!isAdmin) {
    const pids = accessibleProjectIds && accessibleProjectIds.length ? accessibleProjectIds : [0];
    projectWhere.push(`(p.id IN (${inPlaceholders(pids)}) OR p.manager_id = ?)`);
    projectParams.push(...pids, req.user.id);
  }

  const projectsPromise = query(
    `SELECT p.id, p.code, p.name, p.description, p.status, p.priority, p.color, p.progress
       FROM projects p
      WHERE ${projectWhere.join(' AND ')}
      ORDER BY p.name ASC
      LIMIT ?`,
    [...projectParams, limit]
  );

  // 2. Tasks Query
  const taskWhere = ['(t.title LIKE ? OR t.description LIKE ?)'];
  const taskParams = [keyword, keyword];

  if (!isAdmin) {
    const pids = accessibleProjectIds && accessibleProjectIds.length ? accessibleProjectIds : [0];
    taskWhere.push(`(t.project_id IN (${inPlaceholders(pids)}) OR t.assignee_id = ? OR t.reporter_id = ?)`);
    taskParams.push(...pids, req.user.id, req.user.id);
  }

  const tasksPromise = query(
    `SELECT t.id, t.project_id, t.title, t.status, t.priority, t.due_date,
            p.name AS project_name, p.code AS project_code, p.color AS project_color
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
      WHERE ${taskWhere.join(' AND ')}
      ORDER BY t.title ASC
      LIMIT ?`,
    [...taskParams, limit]
  );

  // 3. Milestones Query
  const milestoneWhere = ['(m.name LIKE ? OR m.description LIKE ?)'];
  const milestoneParams = [keyword, keyword];

  if (!isAdmin) {
    const pids = accessibleProjectIds && accessibleProjectIds.length ? accessibleProjectIds : [0];
    milestoneWhere.push(`(m.project_id IN (${inPlaceholders(pids)}) OR m.project_id IN (SELECT p_a.id FROM projects p_a WHERE p_a.manager_id = ?))`);
    milestoneParams.push(...pids, req.user.id);
  }

  const milestonesPromise = query(
    `SELECT m.id, m.project_id, m.name, m.due_date, m.status, m.progress,
            p.name AS project_name, p.code AS project_code
       FROM milestones m
       LEFT JOIN projects p ON p.id = m.project_id
      WHERE ${milestoneWhere.join(' AND ')}
      ORDER BY m.name ASC
      LIMIT ?`,
    [...milestoneParams, limit]
  );

  // 4. Users Query (Active members)
  const usersPromise = query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar, u.job_title
       FROM users u
      WHERE u.is_active = 1 AND (u.name LIKE ? OR u.email LIKE ? OR u.job_title LIKE ?)
      ORDER BY u.name ASC
      LIMIT ?`,
    [keyword, keyword, keyword, limit]
  );

  const [projects, tasks, milestones, users] = await Promise.all([
    projectsPromise,
    tasksPromise,
    milestonesPromise,
    usersPromise,
  ]);

  return sendSuccess(
    res,
    {
      projects,
      tasks,
      milestones,
      users,
    },
    'Pencarian berhasil'
  );
});

module.exports = {
  searchGlobal,
};


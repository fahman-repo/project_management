'use strict';

const express = require('express');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const controller = require('../controllers/projectController');
const {
  projectIdParams,
  memberParams,
  statusParams,
  listProjectsQuery,
  createProjectSchema,
  updateProjectSchema,
  addMemberSchema,
  updateMemberSchema,
  createProjectStatusSchema,
  updateProjectStatusSchema,
  reorderProjectStatusesSchema,
  deleteProjectStatusQuery,
  saveAsTemplateSchema,
  listExpensesQuery,
  createExpenseSchema,
  updateExpenseSchema,
  expenseParams,
} = require('../validators/project.validator');

const router = express.Router();

router.use(requireAuth);

// `/stats/summary` must be declared before `/:id` so the id param does not swallow it.
router.get('/stats/summary', controller.getSummary);

router.get('/', validate({ query: listProjectsQuery }), controller.listProjects);
router.post(
  '/',
  requireRole('admin', 'manager'),
  validate({ body: createProjectSchema }),
  controller.createProject
);

router.get('/:id', validate({ params: projectIdParams }), controller.getProject);
router.patch('/:id', validate({ params: projectIdParams, body: updateProjectSchema }), controller.updateProject);
router.delete('/:id', validate({ params: projectIdParams }), controller.deleteProject);

router.get('/:id/overview', validate({ params: projectIdParams }), controller.getProjectOverview);

router.get('/:id/members', validate({ params: projectIdParams }), controller.listMembers);
router.post(
  '/:id/members',
  validate({ params: projectIdParams, body: addMemberSchema }),
  controller.addMember
);
router.patch(
  '/:id/members/:userId',
  validate({ params: memberParams, body: updateMemberSchema }),
  controller.updateMember
);
router.delete('/:id/members/:userId', validate({ params: memberParams }), controller.removeMember);

router.get('/:id/milestones', validate({ params: projectIdParams }), controller.listProjectMilestones);

// Statuses / workflow columns
router.get('/:id/statuses', validate({ params: projectIdParams }), controller.listProjectStatuses);
router.post(
  '/:id/statuses',
  requireRole('admin', 'manager'),
  validate({ params: projectIdParams, body: createProjectStatusSchema }),
  controller.createProjectStatus
);
router.patch(
  '/:id/statuses/reorder',
  requireRole('admin', 'manager'),
  validate({ params: projectIdParams, body: reorderProjectStatusesSchema }),
  controller.reorderProjectStatuses
);
router.patch(
  '/:id/statuses/:statusId',
  requireRole('admin', 'manager'),
  validate({ params: statusParams, body: updateProjectStatusSchema }),
  controller.updateProjectStatus
);
router.delete(
  '/:id/statuses/:statusId',
  requireRole('admin', 'manager'),
  validate({ params: statusParams, query: deleteProjectStatusQuery }),
  controller.deleteProjectStatus
);

// Expenses / Budget ledger
router.get(
  '/:id/expenses',
  validate({ params: projectIdParams, query: listExpensesQuery }),
  controller.listExpenses
);
router.post(
  '/:id/expenses',
  requireRole('admin', 'manager'),
  validate({ params: projectIdParams, body: createExpenseSchema }),
  controller.createExpense
);
router.patch(
  '/:id/expenses/:expenseId',
  requireRole('admin', 'manager'),
  validate({ params: expenseParams, body: updateExpenseSchema }),
  controller.updateExpense
);
router.delete(
  '/:id/expenses/:expenseId',
  requireRole('admin', 'manager'),
  validate({ params: expenseParams }),
  controller.deleteExpense
);

// Save project as template
router.post(
  '/:id/save-template',
  requireRole('admin', 'manager'),
  validate({ params: projectIdParams, body: saveAsTemplateSchema }),
  controller.saveAsTemplate
);

module.exports = router;

'use strict';

import express from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import { uploadSingle } from '../middleware/upload';
import controller from '../controllers/projectController';
import { projectIdParams,
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
  expenseStatusSchema,
  expenseParams,
  listRisksQuery,
  createRiskSchema,
  updateRiskSchema,
  riskParams,
  documentParams,
  documentVersionParams,
  listDocumentsQuery,
  createDocumentSchema,
  updateDocumentSchema,
  restoreDocumentVersionSchema, } from '../validators/project.validator';

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
  validate({ params: projectIdParams }),
  uploadSingle('receipt'),
  validate({ body: createExpenseSchema }),
  controller.createExpense
);
router.patch(
  '/:id/expenses/:expenseId',
  validate({ params: expenseParams }),
  uploadSingle('receipt'),
  validate({ body: updateExpenseSchema }),
  controller.updateExpense
);
router.patch(
  '/:id/expenses/:expenseId/status',
  validate({ params: expenseParams, body: expenseStatusSchema }),
  controller.updateExpenseStatus
);
router.delete(
  '/:id/expenses/:expenseId',
  validate({ params: expenseParams }),
  controller.deleteExpense
);

// Risks & Issues Register
router.get(
  '/:id/risks',
  validate({ params: projectIdParams, query: listRisksQuery }),
  controller.listRisks
);
router.post(
  '/:id/risks',
  validate({ params: projectIdParams, body: createRiskSchema }),
  controller.createRisk
);
router.patch(
  '/:id/risks/:riskId',
  validate({ params: riskParams, body: updateRiskSchema }),
  controller.updateRisk
);
router.delete(
  '/:id/risks/:riskId',
  validate({ params: riskParams }),
  controller.deleteRisk
);

// Documents, Wiki & Versioning
router.get(
  '/:id/documents',
  validate({ params: projectIdParams, query: listDocumentsQuery }),
  controller.listDocuments
);
router.get(
  '/:id/documents/:docId',
  validate({ params: documentParams }),
  controller.getDocument
);
router.post(
  '/:id/documents',
  validate({ params: projectIdParams }),
  uploadSingle('file'),
  validate({ body: createDocumentSchema }),
  controller.createDocument
);
router.patch(
  '/:id/documents/:docId',
  validate({ params: documentParams }),
  uploadSingle('file'),
  validate({ body: updateDocumentSchema }),
  controller.updateDocument
);
router.post(
  '/:id/documents/:docId/versions/:versionId/restore',
  validate({ params: documentVersionParams, body: restoreDocumentVersionSchema }),
  controller.restoreDocumentVersion
);
router.delete(
  '/:id/documents/:docId',
  validate({ params: documentParams }),
  controller.deleteDocument
);

// Save project as template
router.post(
  '/:id/save-template',
  requireRole('admin', 'manager'),
  validate({ params: projectIdParams, body: saveAsTemplateSchema }),
  controller.saveAsTemplate
);

export default router;

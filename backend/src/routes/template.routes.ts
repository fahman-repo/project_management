'use strict';

import express from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import controller from '../controllers/templateController';
import { templateIdParams,
  createTemplateSchema, } from '../validators/template.validator';

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.listTemplates);
router.get('/:id', validate({ params: templateIdParams }), controller.getTemplate);
router.post(
  '/',
  requireRole('admin', 'manager'),
  validate({ body: createTemplateSchema }),
  controller.createTemplate
);
router.delete(
  '/:id',
  requireRole('admin', 'manager'),
  validate({ params: templateIdParams }),
  controller.deleteTemplate
);

export default router;


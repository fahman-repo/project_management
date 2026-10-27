'use strict';

const express = require('express');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const controller = require('../controllers/templateController');
const {
  templateIdParams,
  createTemplateSchema,
} = require('../validators/template.validator');

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

module.exports = router;


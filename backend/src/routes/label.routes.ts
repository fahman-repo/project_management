'use strict';

import express from 'express';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import controller from '../controllers/labelController';
import { createLabelSchema,
  updateLabelSchema,
  idParams, } from '../validators/task.validator';

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.listLabels);
router.post('/', validate({ body: createLabelSchema }), controller.createLabel);
router.patch('/:id', validate({ params: idParams, body: updateLabelSchema }), controller.updateLabel);
router.delete('/:id', validate({ params: idParams }), controller.deleteLabel);

export default router;

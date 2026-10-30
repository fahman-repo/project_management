'use strict';

import express from 'express';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import controller from '../controllers/milestoneController';
import { milestoneIdParams,
  listMilestonesQuery,
  createMilestoneSchema,
  updateMilestoneSchema, } from '../validators/project.validator';

const router = express.Router();

router.use(requireAuth);

router.get('/', validate({ query: listMilestonesQuery }), controller.listMilestones);
router.post('/', validate({ body: createMilestoneSchema }), controller.createMilestone);
router.get('/:id', validate({ params: milestoneIdParams }), controller.getMilestone);
router.patch(
  '/:id',
  validate({ params: milestoneIdParams, body: updateMilestoneSchema }),
  controller.updateMilestone
);
router.delete('/:id', validate({ params: milestoneIdParams }), controller.deleteMilestone);

export default router;

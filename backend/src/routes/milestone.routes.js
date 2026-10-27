'use strict';

const express = require('express');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/milestoneController');
const {
  milestoneIdParams,
  listMilestonesQuery,
  createMilestoneSchema,
  updateMilestoneSchema,
} = require('../validators/project.validator');

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

module.exports = router;

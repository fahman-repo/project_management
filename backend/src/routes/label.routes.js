'use strict';

const express = require('express');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/labelController');
const {
  createLabelSchema,
  updateLabelSchema,
  idParams,
} = require('../validators/task.validator');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.listLabels);
router.post('/', validate({ body: createLabelSchema }), controller.createLabel);
router.patch('/:id', validate({ params: idParams, body: updateLabelSchema }), controller.updateLabel);
router.delete('/:id', validate({ params: idParams }), controller.deleteLabel);

module.exports = router;

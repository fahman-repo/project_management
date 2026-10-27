'use strict';

const express = require('express');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const controller = require('../controllers/userController');
const {
  listUsersQuery,
  createUserSchema,
  updateUserSchema,
  idParams,
} = require('../validators/auth.validator');

const router = express.Router();

router.use(requireAuth);

router.get('/active', controller.listActiveUsers);
router.get('/', requireRole('admin', 'manager'), validate({ query: listUsersQuery }), controller.listUsers);
router.post('/', requireRole('admin'), validate({ body: createUserSchema }), controller.createUser);
router.get('/:id', requireRole('admin', 'manager'), validate({ params: idParams }), controller.getUser);
router.patch('/:id', requireRole('admin'), validate({ params: idParams, body: updateUserSchema }), controller.updateUser);
router.delete('/:id', requireRole('admin'), validate({ params: idParams }), controller.deleteUser);

module.exports = router;

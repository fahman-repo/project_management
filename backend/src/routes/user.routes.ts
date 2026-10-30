'use strict';

import express from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import controller from '../controllers/userController';
import { listUsersQuery,
  createUserSchema,
  updateUserSchema,
  idParams, } from '../validators/auth.validator';

const router = express.Router();

router.use(requireAuth);

router.get('/active', controller.listActiveUsers);
router.get('/', requireRole('admin', 'manager'), validate({ query: listUsersQuery }), controller.listUsers);
router.post('/', requireRole('admin'), validate({ body: createUserSchema }), controller.createUser);
router.get('/:id', requireRole('admin', 'manager'), validate({ params: idParams }), controller.getUser);
router.patch('/:id', requireRole('admin'), validate({ params: idParams, body: updateUserSchema }), controller.updateUser);
router.delete('/:id', requireRole('admin'), validate({ params: idParams }), controller.deleteUser);

export default router;

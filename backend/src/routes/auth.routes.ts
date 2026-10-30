'use strict';

import express from 'express';
import asyncHandler from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { uploadSingle } from '../middleware/upload';
import controller from '../controllers/authController';
import { registerSchema,
  loginSchema,
  changePasswordSchema,
  updateProfileSchema, } from '../validators/auth.validator';

const router = express.Router();

router.post('/register', validate({ body: registerSchema }), controller.register);
router.post('/login', validate({ body: loginSchema }), controller.login);
router.get('/email-check', asyncHandler(controller.checkEmail));

router.use(requireAuth);

router.post('/logout', controller.logout);
router.get('/me', controller.me);
router.patch('/password', validate({ body: changePasswordSchema }), controller.changePassword);
router.patch('/profile', validate({ body: updateProfileSchema }), controller.updateProfile);
router.patch('/avatar', uploadSingle('avatar'), controller.uploadAvatar);

export default router;

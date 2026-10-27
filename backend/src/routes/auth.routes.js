'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const controller = require('../controllers/authController');
const {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  updateProfileSchema,
} = require('../validators/auth.validator');

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

module.exports = router;

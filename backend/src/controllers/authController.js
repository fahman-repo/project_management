'use strict';

const { queryOne } = require('../config/database');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { signToken } = require('../utils/jwt');
const { hashPassword, comparePassword } = require('../utils/password');
const userModel = require('../models/userModel');
const activityService = require('../services/activityService');

/**
 * POST /api/v1/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, job_title } = req.body;

  const existing = await userModel.findByEmail(email);
  if (existing) {
    throw ApiError.conflict('Email tersebut sudah terdaftar');
  }

  const hashed = await hashPassword(password);
  const userId = await userModel.createUser({
    name,
    email,
    password: hashed,
    role: 'member',
    job_title: job_title || null,
  });

  const user = await userModel.findById(userId);
  const token = signToken(user);

  await activityService.record({
    userId,
    action: 'user.registered',
    entityType: 'user',
    entityId: userId,
    description: `${name} mendaftar akun baru`,
  });

  return sendSuccess(res, { token, user }, 'Registrasi berhasil');
});

/**
 * POST /api/v1/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await userModel.findByEmail(email);
  if (!user) throw ApiError.unauthorized('Email atau password salah');

  if (!user.is_active) throw ApiError.forbidden('Akun Anda dinonaktifkan. Hubungi administrator.');

  const valid = await comparePassword(password, user.password);
  if (!valid) throw ApiError.unauthorized('Email atau password salah');

  await userModel.touchLastLogin(user.id);
  const token = signToken(user);

  await activityService.record({
    userId: user.id,
    action: 'user.login',
    entityType: 'user',
    entityId: user.id,
    description: `${user.name} login ke sistem`,
  });

  const safeUser = await userModel.findById(user.id);
  return sendSuccess(res, { token, user: safeUser }, 'Login berhasil');
});

/**
 * POST /api/v1/auth/logout
 * Stateless JWT - the client discards the token. The call is recorded for audit.
 */
const logout = asyncHandler(async (req, res) => {
  await activityService.record({
    userId: req.user.id,
    action: 'user.logout',
    entityType: 'user',
    entityId: req.user.id,
    description: `${req.user.name} logout dari sistem`,
  });

  return sendSuccess(res, null, 'Logout berhasil');
});

/**
 * GET /api/v1/auth/me
 */
const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, { user: req.user });
});

/**
 * PATCH /api/v1/auth/password
 */
const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  const user = await userModel.findByIdWithPassword(req.user.id);
  const valid = await comparePassword(current_password, user.password);
  if (!valid) throw ApiError.badRequest('Password saat ini salah');

  const hashed = await hashPassword(new_password);
  await userModel.updateUser(req.user.id, { password: hashed });

  await activityService.record({
    userId: req.user.id,
    action: 'user.password_changed',
    entityType: 'user',
    entityId: req.user.id,
    description: `${req.user.name} mengganti password`,
  });

  return sendSuccess(res, null, 'Password berhasil diubah');
});

/**
 * PATCH /api/v1/auth/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, job_title, bio } = req.body;

  await userModel.updateUser(req.user.id, { name, phone, job_title, bio });

  const updated = await userModel.findById(req.user.id);

  await activityService.record({
    userId: req.user.id,
    action: 'user.profile_updated',
    entityType: 'user',
    entityId: req.user.id,
    description: `${updated.name} memperbarui profil`,
  });

  return sendSuccess(res, { user: updated }, 'Profil berhasil diperbarui');
});

/**
 * PATCH /api/v1/auth/avatar  (multipart)
 */
const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('File avatar tidak ditemukan');

  await userModel.updateUser(req.user.id, { avatar: `/uploads/${req.file.filename}` });
  const updated = await userModel.findById(req.user.id);

  return sendSuccess(res, { user: updated }, 'Avatar berhasil diperbarui');
});

/**
 * GET /api/v1/auth/email-check?email=...
 * Used by the register form to surface conflicts early.
 */
const checkEmail = asyncHandler(async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) throw ApiError.badRequest('Email wajib diisi');

  const user = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  return sendSuccess(res, { available: !user }, 'Pemeriksaan selesai');
});

module.exports = { register, login, logout, me, changePassword, updateProfile, uploadAvatar, checkEmail };

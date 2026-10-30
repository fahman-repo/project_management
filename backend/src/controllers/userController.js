'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const { getPagination, buildMeta } = require('../utils/pagination');
const { hashPassword } = require('../utils/password');
const userModel = require('../models/userModel');
const activityService = require('../services/activityService');

/**
 * GET /api/v1/users
 */
const listUsers = asyncHandler(async (req, res) => {
  const { page, perPage, offset } = getPagination(req.query);
  const { search, role, isActive } = req.query;

  const { rows, total } = await userModel.listUsers({
    search,
    role,
    isActive,
    limit: perPage,
    offset,
  });

  return sendPaginated(res, rows, buildMeta(total, page, perPage), 'Berhasil memuat daftar pengguna');
});

/**
 * GET /api/v1/users/active  (lightweight list for pickers)
 */
const listActiveUsers = asyncHandler(async (req, res) => {
  const rows = await userModel.listActive({ search: req.query.search });
  return sendSuccess(res, rows, 'Berhasil memuat pengguna');
});

/**
 * GET /api/v1/users/:id
 */
const getUser = asyncHandler(async (req, res) => {
  const user = await userModel.findById(req.params.id);
  if (!user) throw ApiError.notFound('Pengguna tidak ditemukan');

  return sendSuccess(res, { user }, 'Berhasil memuat pengguna');
});

/**
 * POST /api/v1/users
 */
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone, job_title, bio, weekly_capacity_hours } = req.body;

  const existing = await userModel.findByEmail(email);
  if (existing) throw ApiError.conflict('Email tersebut sudah terdaftar');

  const hashed = await hashPassword(password);
  const userId = await userModel.createUser({
    name,
    email,
    password: hashed,
    role: role || 'member',
    phone: phone || null,
    job_title: job_title || null,
    bio: bio || null,
    weekly_capacity_hours: weekly_capacity_hours ? Number(weekly_capacity_hours) : 40,
  });

  const user = await userModel.findById(userId);

  await activityService.record({
    userId: req.user.id,
    action: 'user.created',
    entityType: 'user',
    entityId: userId,
    description: `${req.user.name} membuat pengguna ${name}`,
  });

  return sendSuccess(res, { user }, 'Pengguna berhasil dibuat');
});

/**
 * PATCH /api/v1/users/:id
 */
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };

  const target = await userModel.findById(id);
  if (!target) throw ApiError.notFound('Pengguna tidak ditemukan');

  if (payload.email && payload.email !== target.email) {
    const existing = await userModel.findByEmail(payload.email);
    if (existing) throw ApiError.conflict('Email tersebut sudah digunakan');
  }

  // An admin must not be able to lock themselves out.
  if (Number(id) === req.user.id) {
    if (payload.role && payload.role !== 'admin') {
      throw ApiError.badRequest('Anda tidak dapat mengubah peran akun Anda sendiri');
    }
    if (payload.is_active === false) {
      throw ApiError.badRequest('Anda tidak dapat menonaktifkan akun Anda sendiri');
    }
  }

  // Never let the last remaining admin be demoted or deactivated.
  if ((payload.role && payload.role !== 'admin') || payload.is_active === false) {
    if (target.role === 'admin') {
      const { rows } = await userModel.listUsers({ isActive: true, limit: 1000, offset: 0 });
      const activeAdmins = rows.filter((user) => user.role === 'admin');
      if (activeAdmins.length <= 1) {
        throw ApiError.badRequest('Minimal harus ada satu administrator yang aktif');
      }
    }
  }

  if (payload.password) {
    payload.password = await hashPassword(payload.password);
  }
  if (payload.is_active !== undefined) {
    payload.is_active = payload.is_active ? 1 : 0;
  }

  await userModel.updateUser(id, payload);
  const updated = await userModel.findById(id);

  await activityService.record({
    userId: req.user.id,
    action: 'user.updated',
    entityType: 'user',
    entityId: Number(id),
    description: `${req.user.name} memperbarui pengguna ${updated.name}`,
    metadata: { fields: Object.keys(payload) },
  });

  return sendSuccess(res, { user: updated }, 'Pengguna berhasil diperbarui');
});

/**
 * DELETE /api/v1/users/:id  (soft delete)
 */
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (Number(id) === req.user.id) {
    throw ApiError.badRequest('Anda tidak dapat menghapus akun Anda sendiri');
  }

  const target = await userModel.findById(id);
  if (!target) throw ApiError.notFound('Pengguna tidak ditemukan');

  if (target.role === 'admin') {
    const { rows } = await userModel.listUsers({ isActive: true, limit: 1000, offset: 0 });
    const activeAdmins = rows.filter((user) => user.role === 'admin');
    if (activeAdmins.length <= 1) {
      throw ApiError.badRequest('Minimal harus ada satu administrator yang aktif');
    }
  }

  await userModel.softDelete(id);

  await activityService.record({
    userId: req.user.id,
    action: 'user.deleted',
    entityType: 'user',
    entityId: Number(id),
    description: `${req.user.name} menonaktifkan pengguna ${target.name}`,
  });

  return sendSuccess(res, null, 'Pengguna berhasil dinonaktifkan');
});

module.exports = { listUsers, listActiveUsers, getUser, createUser, updateUser, deleteUser };

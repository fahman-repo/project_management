'use strict';

const { verifyToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const { queryOne } = require('../config/database');

/**
 * Resolve the bearer token from the request.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.query && typeof req.query.token === 'string') return req.query.token;
  return null;
}

/**
 * Require a valid JWT and load the user into `req.user`.
 */
async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized('Token tidak ditemukan');

    let payload;
    try {
      payload = verifyToken(token);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw ApiError.unauthorized('Sesi Anda telah berakhir, silakan login kembali');
      }
      throw ApiError.unauthorized('Token tidak valid');
    }

    const user = await queryOne(
      `SELECT id, name, email, role, phone, avatar, job_title, bio, weekly_capacity_hours, is_active, last_login_at, created_at, updated_at
         FROM users WHERE id = ? LIMIT 1`,
      [payload.id]
    );

    if (!user) throw ApiError.unauthorized('Pengguna tidak ditemukan');
    if (!user.is_active) throw ApiError.forbidden('Akun Anda dinonaktifkan');

    req.user = {
      ...user,
      weekly_capacity_hours:
        user.weekly_capacity_hours !== null && user.weekly_capacity_hours !== undefined
          ? Number(user.weekly_capacity_hours)
          : 40,
    };
    req.token = token;
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Attach `req.user` when a valid token is present, but never block the request.
 */
async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    const user = await queryOne(
      `SELECT id, name, email, role, phone, avatar, job_title, bio, weekly_capacity_hours, is_active, last_login_at, created_at, updated_at
         FROM users WHERE id = ? LIMIT 1`,
      [payload.id]
    );
    if (user && user.is_active) {
      req.user = {
        ...user,
        weekly_capacity_hours:
          user.weekly_capacity_hours !== null && user.weekly_capacity_hours !== undefined
            ? Number(user.weekly_capacity_hours)
            : 40,
      };
    }
  } catch (error) {
    // ignore - request proceeds anonymously
  }
  return next();
}

/**
 * Restrict a route to the given roles.
 * @param {...('admin'|'manager'|'member')} roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Akses ini hanya untuk: ${roles.join(', ')}`));
    }
    return next();
  };
}

module.exports = { requireAuth, optionalAuth, requireRole, extractToken };

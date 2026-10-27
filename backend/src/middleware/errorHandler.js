'use strict';

const ApiError = require('../utils/ApiError');
const env = require('../config/env');

/** 404 handler for unmatched routes. */
function notFound(req, res, next) {
  next(ApiError.notFound(`Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`));
}

/**
 * Central error handler. Converts known error types into the standard envelope.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Terjadi kesalahan pada server';
  let details = err.details || null;

  // MySQL duplicate key
  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    message = 'Data dengan nilai unik tersebut sudah ada';
  }

  // MySQL foreign key constraint
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    statusCode = 422;
    message = 'Relasi data tidak valid atau data masih digunakan';
  }

  // MySQL data truncation / invalid value
  if (err.code === 'ER_TRUNCATED_WRONG_VALUE' || err.code === 'WARN_DATA_TRUNCATED') {
    statusCode = 400;
    message = 'Nilai data tidak valid';
  }

  // Invalid JSON body
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Body JSON tidak valid';
  }

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
    if (env.NODE_ENV === 'production') {
      message = 'Terjadi kesalahan pada server';
      details = null;
    }
  }

  const body = { success: false, message };
  if (details) body.errors = details;
  if (env.NODE_ENV === 'development' && statusCode >= 500) body.stack = err.stack;

  return res.status(statusCode).json(body);
}

module.exports = { notFound, errorHandler };

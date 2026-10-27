'use strict';

/**
 * Standard success envelope.
 * @param {import('express').Response} res
 * @param {any} data
 * @param {string} [message]
 * @param {object} [meta]
 */
function sendSuccess(res, data = null, message = 'Berhasil', meta = undefined) {
  const body = { success: true, message, data };
  if (meta !== undefined) body.meta = meta;
  return res.json(body);
}

/**
 * @param {import('express').Response} res
 * @param {object} [meta] {page, perPage, total, totalPages}
 */
function sendPaginated(res, rows, meta, message = 'Berhasil') {
  return res.json({ success: true, message, data: rows, meta });
}

/**
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {string} message
 * @param {object} [errors]
 */
function sendError(res, statusCode, message, errors = undefined) {
  const body = { success: false, message };
  if (errors !== undefined) body.errors = errors;
  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess, sendPaginated, sendError };

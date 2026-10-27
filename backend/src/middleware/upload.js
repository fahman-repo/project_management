'use strict';

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, env.UPLOAD_PATH),
  filename: (req, file, cb) => {
    // Randomised name prevents path traversal and filename collisions.
    const ext = path.extname(file.originalname).slice(0, 12).replace(/[^.a-zA-Z0-9]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_SIZE, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(ApiError.badRequest(`Tipe file tidak didukung: ${file.mimetype}`));
    }
    return cb(null, true);
  },
});

/** Multer middleware that surfaces clean errors instead of generic ones. */
const uploadSingle = (field = 'file') => (req, res, next) => {
  upload.single(field)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest(`Ukuran file melebihi batas ${Math.round(env.MAX_UPLOAD_SIZE / 1024 / 1024)}MB`));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(ApiError.badRequest(`Field file tidak sesuai, gunakan "${field}"`));
      }
      return next(ApiError.badRequest(err.message));
    }
    return next(err);
  });
};

module.exports = { uploadSingle, ALLOWED_MIME };

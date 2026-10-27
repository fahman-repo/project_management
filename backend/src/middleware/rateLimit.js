'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Credential endpoints are exempt from throttling. Without this exemption a
 * shared client IP (proxy, NAT, or a burst of failed attempts) exhausts the
 * global bucket and locks legitimate users out of the login page.
 */
const EXEMPT_PATHS = ['/auth/login', '/auth/register', '/auth/email-check'];

function isExemptPath(req) {
  const path = String(req.originalUrl || req.path || '').split('?')[0];
  return EXEMPT_PATHS.some((exempt) => path === exempt || path.endsWith(exempt));
}

/** Broad limiter applied to the whole API. */
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isExemptPath,
  message: {
    success: false,
    message: 'Terlalu banyak permintaan. Silakan coba lagi beberapa saat lagi.',
  },
});

module.exports = { apiLimiter };

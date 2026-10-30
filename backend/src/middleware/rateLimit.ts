import { Request } from 'express';
import rateLimit from 'express-rate-limit';

const EXEMPT_PATHS = ['/auth/login', '/auth/register', '/auth/email-check'];

export function isExemptPath(req: Request): boolean {
  const path = String(req.originalUrl || req.path || '').split('?')[0];
  return EXEMPT_PATHS.some((exempt) => path === exempt || path.endsWith(exempt));
}

/** Broad limiter applied to the whole API. */
export const apiLimiter = rateLimit({
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

export default { apiLimiter, isExemptPath };


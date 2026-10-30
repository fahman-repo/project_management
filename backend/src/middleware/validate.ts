import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny, ZodError } from 'zod';
import ApiError from '../utils/ApiError';

/**
 * Validate request data against a zod schema.
 * Keys not present in the schema are stripped, which blocks mass assignment.
 */
export function validate(schemas: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) throw ApiError.badRequest('Validasi gagal', formatZodError(result.error));
        req.body = result.data;
      }
      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) throw ApiError.badRequest('Parameter tidak valid', formatZodError(result.error));
        // Express 5 makes req.query a getter-only property; assign to a side channel.
        req.validatedQuery = result.data;
        Object.defineProperty(req, 'query', {
          value: { ...req.query, ...result.data },
          writable: true,
          configurable: true,
        });
      }
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) throw ApiError.badRequest('Parameter tidak valid', formatZodError(result.error));
        req.params = result.data;
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * Convert a zod error into a `{ field: [messages] }` map.
 */
export function formatZodError(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!details[key]) details[key] = [];
    details[key].push(issue.message);
  }
  return details;
}

export default { validate, formatZodError };


import { z } from 'zod';

/** Shared primitive schemas. */

/** A positive integer id. */
export const idParam = z.coerce.number().int().positive();

/** Route params containing only an id. */
export const idParams = z.object({ id: idParam });

/** Standard pagination query. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional().default(10),
});

/** `YYYY-MM-DD` date string. */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD');

/** Optional date string (empty string treated as null). */
export const optionalDateString = z
  .union([dateString, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === '' || value === null ? undefined : value));

/** Hex colour string. */
export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Format warna harus hex, contoh #4f46e5');

/** Trimmed, non-empty string. */
export const requiredString = (max = 255) => z.string().trim().min(1, 'Wajib diisi').max(max);

/** Optional trimmed string. */
export const optionalString = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

/** Project status enum. */
export const projectStatus = z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']);

/** Task status schema (dynamic slug compatible with project_statuses). */
export const taskStatus = z
  .string()
  .trim()
  .min(1, 'Status wajib diisi')
  .max(50, 'Maksimal 50 karakter')
  .regex(/^[a-z0-9_]+$/, 'Status hanya boleh huruf kecil, angka, dan underscore');

/** Priority enum. */
export const priority = z.enum(['low', 'medium', 'high', 'urgent']);

/** Role enum. */
export const role = z.enum(['admin', 'manager', 'member']);

/** Convert zod issues into a `{ field: [message] }` map. */
export function formatIssues(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!details[key]) details[key] = [];
    details[key].push(issue.message);
  }
  return details;
}

export default {
  idParam,
  idParams,
  paginationQuery,
  dateString,
  optionalDateString,
  hexColor,
  requiredString,
  optionalString,
  projectStatus,
  taskStatus,
  priority,
  role,
  formatIssues,
};


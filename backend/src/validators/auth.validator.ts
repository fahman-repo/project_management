import { z } from 'zod';
import { requiredString, optionalString, role, idParams, paginationQuery } from './common';

export const email = z
  .string()
  .trim()
  .min(1, 'Email wajib diisi')
  .email('Format email tidak valid')
  .max(191)
  .transform((value) => value.toLowerCase());

export const password = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .max(100, 'Password maksimal 100 karakter')
  .refine((value) => /[A-Za-z]/.test(value), 'Password harus mengandung huruf')
  .refine((value) => /\d/.test(value), 'Password harus mengandung angka');

/** POST /auth/register */
export const registerSchema = z.object({
  name: requiredString(120),
  email,
  password,
  job_title: optionalString(120),
});

/** POST /auth/login */
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password wajib diisi'),
});

/** PATCH /auth/password */
export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Password saat ini wajib diisi'),
  new_password: password,
});

/** PATCH /auth/profile */
export const updateProfileSchema = z.object({
  name: requiredString(120),
  phone: optionalString(30),
  job_title: optionalString(120),
  bio: optionalString(2000),
});

/** GET /users */
export const listUsersQuery = paginationQuery.extend({
  search: z.string().trim().optional(),
  role: role.optional(),
  isActive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (typeof value === 'boolean') return value;
      return value === 'true' || value === '1';
    }),
  sort: z.enum(['name', 'email', 'role', 'created_at']).optional().default('name'),
  direction: z.enum(['asc', 'desc']).optional().default('asc'),
});

/** POST /users */
export const createUserSchema = z.object({
  name: requiredString(120),
  email,
  password,
  role: role.optional().default('member'),
  phone: optionalString(30),
  job_title: optionalString(120),
  bio: optionalString(2000),
  weekly_capacity_hours: z.coerce
    .number()
    .min(1, 'Kapasitas minimal 1 jam per minggu')
    .max(168, 'Kapasitas maksimal 168 jam per minggu')
    .optional(),
});

/** PATCH /users/:id */
export const updateUserSchema = z.object({
  name: requiredString(120).optional(),
  email: email.optional(),
  password: password.optional(),
  role: role.optional(),
  phone: optionalString(30),
  job_title: optionalString(120),
  bio: optionalString(2000),
  weekly_capacity_hours: z.coerce
    .number()
    .min(1, 'Kapasitas minimal 1 jam per minggu')
    .max(168, 'Kapasitas maksimal 168 jam per minggu')
    .optional(),
  is_active: z.boolean().optional(),
});

export { idParams };

export default {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  updateProfileSchema,
  listUsersQuery,
  createUserSchema,
  updateUserSchema,
  idParams,
};

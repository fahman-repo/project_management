'use strict';

const { z } = require('zod');
const {
  idParam,
  paginationQuery,
  dateString,
  optionalDateString,
  hexColor,
  requiredString,
  optionalString,
  projectStatus,
  priority,
} = require('./common');

/** Project member roles inside a project. */
const memberRole = z.enum(['owner', 'manager', 'member', 'reviewer']);

/** Milestone status enum. */
const milestoneStatus = z.enum(['planned', 'in_progress', 'achieved', 'missed']);

/** Status category enum. */
const statusCategory = z.enum(['todo', 'in_progress', 'review', 'done', 'blocked']);

/** Coerce a query-string boolean (`true`, `1`, `yes`) into a real boolean. */
const booleanish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1' || value === 'yes';
  });

/** A percentage between 0 and 100. */
const percent = z.coerce.number().int().min(0).max(100);

/**
 * Optional number that treats an explicit `null` as "not provided".
 * Without this, `z.coerce.number()` would turn `null` into `0`.
 * @param {import('zod').ZodTypeAny} schema
 */
const optionalNumber = (schema) =>
  z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === null || value === '') return undefined;
      const parsed = Number(value);
      const result = schema.safeParse(parsed);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: issue.path });
        }
        return z.NEVER;
      }
      return result.data;
    });

/** Route params for `/projects/:id`. */
const projectIdParams = z.object({ id: idParam });

/** Route params for `/projects/:id/members/:userId`. */
const memberParams = z.object({ id: idParam, userId: idParam });

/** Route params for `/projects/:id/statuses/:statusId`. */
const statusParams = z.object({ id: idParam, statusId: idParam });

/** GET /projects */
const listProjectsQuery = paginationQuery.extend({
  search: z.string().trim().max(180).optional(),
  status: projectStatus.optional(),
  priority: priority.optional(),
  manager_id: optionalNumber(z.number().int().positive()),
  member_id: optionalNumber(z.number().int().positive()),
  mine: booleanish,
  sort: z
    .enum(['name', 'code', 'status', 'priority', 'progress', 'start_date', 'end_date', 'created_at'])
    .optional()
    .default('created_at'),
  direction: z.enum(['asc', 'desc']).optional().default('desc'),
});

/** POST /projects */
const createProjectSchema = z
  .object({
    name: requiredString(180),
    code: optionalString(50),
    description: optionalString(5000),
    status: projectStatus.optional().default('planning'),
    priority: priority.optional().default('medium'),
    color: hexColor.optional(),
    budget: optionalNumber(z.number().min(0).max(9999999999999)),
    start_date: optionalDateString,
    end_date: optionalDateString,
    manager_id: optionalNumber(z.number().int().positive()),
    template_id: optionalNumber(z.number().int().positive()),
    include_template_tasks: booleanish.default(true),
    include_template_milestones: booleanish.default(true),
  })
  .refine(
    (value) => !(value.start_date && value.end_date) || value.start_date <= value.end_date,
    { message: 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai', path: ['end_date'] }
  );

/** PATCH /projects/:id */
const updateProjectSchema = z
  .object({
    name: requiredString(180).optional(),
    description: optionalString(5000),
    status: projectStatus.optional(),
    priority: priority.optional(),
    color: hexColor.optional(),
    budget: optionalNumber(z.number().min(0).max(9999999999999)),
    start_date: optionalDateString,
    end_date: optionalDateString,
    manager_id: optionalNumber(z.number().int().positive()),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Minimal satu field harus diisi',
  });

/** POST /projects/:id/members */
const addMemberSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  role: memberRole.optional().default('member'),
});

/** PATCH /projects/:id/members/:userId */
const updateMemberSchema = z.object({
  role: memberRole,
});

/** GET /milestones */
const listMilestonesQuery = z.object({
  project_id: optionalNumber(z.number().int().positive()),
  status: milestoneStatus.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});

/** POST /milestones */
const createMilestoneSchema = z.object({
  project_id: z.coerce.number().int().positive(),
  name: requiredString(180),
  description: optionalString(5000),
  due_date: optionalDateString,
  status: milestoneStatus.optional().default('planned'),
  progress: percent.optional().default(0),
});

/** PATCH /milestones/:id */
const updateMilestoneSchema = z
  .object({
    name: requiredString(180).optional(),
    description: optionalString(5000),
    due_date: optionalDateString,
    status: milestoneStatus.optional(),
    progress: percent.optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Minimal satu field harus diisi',
  });

/** Route params for `/milestones/:id`. */
const milestoneIdParams = z.object({ id: idParam });

/** POST /projects/:id/statuses */
const createProjectStatusSchema = z.object({
  key_name: z
    .string()
    .trim()
    .min(1, 'Key status wajib diisi')
    .max(50, 'Maksimal 50 karakter')
    .regex(/^[a-z0-9_]+$/, 'Key hanya boleh huruf kecil, angka, dan underscore'),
  label: requiredString(80),
  color: hexColor.optional().default('#64748b'),
  category: statusCategory.optional().default('in_progress'),
  progress: percent.optional().default(0),
});

/** PATCH /projects/:id/statuses/:statusId */
const updateProjectStatusSchema = z
  .object({
    label: requiredString(80).optional(),
    color: hexColor.optional(),
    category: statusCategory.optional(),
    progress: percent.optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Minimal satu field harus diisi',
  });

/** PATCH /projects/:id/statuses/reorder */
const reorderProjectStatusesSchema = z.object({
  ordered_ids: z.array(z.coerce.number().int().positive()).min(1, 'Daftar ID status wajib diisi'),
});

/** DELETE /projects/:id/statuses/:statusId query */
const deleteProjectStatusQuery = z.object({
  transfer_to: z.string().trim().min(1).max(50).optional(),
  transfer_to_key: z.string().trim().min(1).max(50).optional(),
});

/** POST /projects/:id/save-template */
const saveAsTemplateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Kode template wajib diisi')
    .max(50, 'Maksimal 50 karakter')
    .regex(/^[a-z0-9-]+$/, 'Kode hanya boleh huruf kecil, angka, dan tanda hubung'),
  name: requiredString(180),
  category: optionalString(80).default('Custom'),
  description: optionalString(5000),
  color: hexColor.optional(),
});

/** Project expense category enum. */
const expenseCategory = z.enum(['material', 'vendor', 'equipment', 'operational', 'labor', 'other']);

/** GET /projects/:id/expenses */
const listExpensesQuery = z.object({
  category: expenseCategory.optional(),
  task_id: z.union([idParam, z.literal('direct')]).optional(),
  search: z.string().trim().max(180).optional(),
});

/** POST /projects/:id/expenses */
const createExpenseSchema = z.object({
  task_id: idParam.nullable().optional(),
  title: requiredString(180),
  category: expenseCategory.optional().default('other'),
  amount: z.coerce.number().min(0).max(9999999999999),
  expense_date: dateString,
  vendor_name: optionalString(150),
  receipt_note: optionalString(500),
});

/** PATCH /projects/:id/expenses/:expenseId */
const updateExpenseSchema = z
  .object({
    task_id: idParam.nullable().optional(),
    title: requiredString(180).optional(),
    category: expenseCategory.optional(),
    amount: z.coerce.number().min(0).max(9999999999999).optional(),
    expense_date: dateString.optional(),
    vendor_name: optionalString(150),
    receipt_note: optionalString(500),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Minimal satu field harus diisi',
  });

/** Route params for `/projects/:id/expenses/:expenseId`. */
const expenseParams = z.object({ id: idParam, expenseId: idParam });

module.exports = {
  memberRole,
  milestoneStatus,
  statusCategory,
  projectIdParams,
  memberParams,
  statusParams,
  listProjectsQuery,
  createProjectSchema,
  updateProjectSchema,
  addMemberSchema,
  updateMemberSchema,
  listMilestonesQuery,
  createMilestoneSchema,
  updateMilestoneSchema,
  milestoneIdParams,
  createProjectStatusSchema,
  updateProjectStatusSchema,
  reorderProjectStatusesSchema,
  deleteProjectStatusQuery,
  saveAsTemplateSchema,
  expenseCategory,
  listExpensesQuery,
  createExpenseSchema,
  updateExpenseSchema,
  expenseParams,
};

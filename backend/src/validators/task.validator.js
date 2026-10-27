'use strict';

const { z } = require('zod');
const {
  idParam,
  idParams,
  paginationQuery,
  dateString,
  optionalDateString,
  requiredString,
  optionalString,
  taskStatus,
  priority,
  hexColor,
} = require('./common');

const TASK_STATUS_VALUES = ['todo', 'in_progress', 'review', 'done', 'blocked'];
const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'];
const DEPENDENCY_TYPE_VALUES = ['blocked_by', 'blocks', 'relates_to', 'duplicate_of'];

/** Split a comma separated query value into a trimmed list. */
function csvList(value) {
  if (value === undefined || value === null) return undefined;
  const raw = Array.isArray(value) ? value.join(',') : String(value);
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

const csvStatuses = z
  .string()
  .optional()
  .transform(csvList)
  .refine(
    (value) => !value || value.every((item) => /^[a-z0-9_]+$/.test(item)),
    'Status tidak valid'
  )
  .transform((value) => value || undefined);

const csvPriorities = z
  .string()
  .optional()
  .transform(csvList)
  .refine(
    (value) => !value || value.every((item) => PRIORITY_VALUES.includes(item)),
    'Prioritas tidak valid'
  )
  .transform((value) => value || undefined);

const booleanFlag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  });

/**
 * Date field that keeps an explicit `null` (clearing a date) distinguishable
 * from "field not provided".
 */
const nullableDateString = z
  .union([dateString, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === '' ? null : value));

/** Boolean flag that understands the string `"false"`. */
const looseBoolean = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  });

/** GET /api/v1/tasks */
const listTasksQuery = paginationQuery.extend({
  project_id: idParam.optional(),
  assignee_id: idParam.optional(),
  status: csvStatuses,
  priority: csvPriorities,
  label_id: idParam.optional(),
  parent_id: idParam.optional(),
  search: z.string().trim().max(200).optional(),
  overdue: booleanFlag,
  due_from: dateString.optional(),
  due_to: dateString.optional(),
  sort: z
    .enum(['title', 'status', 'priority', 'due_date', 'created_at', 'progress', 'updated_at'])
    .optional()
    .default('created_at'),
  direction: z.enum(['asc', 'desc']).optional().default('desc'),
});

/** GET /api/v1/tasks/board */
const boardQuery = z.object({
  project_id: idParam,
});

/** POST /api/v1/tasks */
const createTaskSchema = z.object({
  project_id: idParam,
  title: requiredString(220),
  description: z.string().max(5000).nullable().optional(),
  status: taskStatus.optional().default('todo'),
  priority: priority.optional().default('medium'),
  assignee_id: idParam.nullable().optional(),
  start_date: nullableDateString,
  due_date: nullableDateString,
  estimated_hours: z.coerce.number().min(0).max(100000).nullable().optional(),
  actual_hours: z.coerce.number().min(0).max(100000).nullable().optional(),
  estimated_cost: z.coerce.number().min(0).nullable().optional(),
  actual_cost: z.coerce.number().min(0).nullable().optional(),
  parent_id: idParam.nullable().optional(),
  label_ids: z.array(idParam).max(50).optional(),
  is_milestone: looseBoolean.optional().default(false),
});

/** PATCH /api/v1/tasks/:id */
const updateTaskSchema = z
  .object({
    title: requiredString(220).optional(),
    description: z.string().max(5000).nullable().optional(),
    status: taskStatus.optional(),
    priority: priority.optional(),
    assignee_id: idParam.nullable().optional(),
    start_date: nullableDateString,
    due_date: nullableDateString,
    estimated_hours: z.coerce.number().min(0).max(100000).nullable().optional(),
    actual_hours: z.coerce.number().min(0).max(100000).nullable().optional(),
    estimated_cost: z.coerce.number().min(0).nullable().optional(),
    actual_cost: z.coerce.number().min(0).nullable().optional(),
    label_ids: z.array(idParam).max(50).optional(),
    parent_id: idParam.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Tidak ada perubahan yang dikirim');

/** PATCH /api/v1/tasks/:id/status */
const updateStatusSchema = z.object({
  status: taskStatus,
  position: z.coerce.number().int().min(0).optional(),
});

/** PATCH /api/v1/tasks/:id/position */
const updatePositionSchema = z.object({
  status: taskStatus,
  position: z.coerce.number().int().min(0),
});

/** PATCH /api/v1/tasks/:id/assign */
const assignSchema = z.object({
  assignee_id: idParam.nullable(),
});

/** POST /api/v1/tasks/:id/comments */
const createCommentSchema = z.object({
  body: requiredString(5000),
});

/** POST /api/v1/tasks/:id/dependencies */
const createDependencySchema = z.object({
  depends_on_id: idParam,
  type: z.enum(DEPENDENCY_TYPE_VALUES).optional().default('blocked_by'),
  lag_days: z.coerce.number().int().min(-365).max(365).optional().default(0),
});

/** PATCH /api/v1/tasks/:id/schedule */
const updateTaskScheduleSchema = z.object({
  start_date: nullableDateString,
  due_date: nullableDateString,
});

/** GET /api/v1/tasks/gantt */
const ganttQuery = z.object({
  project_id: idParam,
});

/** Route params for a task plus a nested resource id. */
const taskIdParams = z.object({ id: idParam });
const taskCommentParams = z.object({ id: idParam, commentId: idParam });
const taskAttachmentParams = z.object({ id: idParam, attachmentId: idParam });
const taskDependencyParams = z.object({ id: idParam, dependencyId: idParam });

/** POST /api/v1/labels */
const createLabelSchema = z.object({
  name: requiredString(60),
  color: hexColor.optional().default('#64748b'),
});

/** PATCH /api/v1/labels/:id */
const updateLabelSchema = z
  .object({
    name: requiredString(60).optional(),
    color: hexColor.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Tidak ada perubahan yang dikirim');

module.exports = {
  listTasksQuery,
  boardQuery,
  ganttQuery,
  createTaskSchema,
  updateTaskSchema,
  updateTaskScheduleSchema,
  updateStatusSchema,
  updatePositionSchema,
  assignSchema,
  createCommentSchema,
  createDependencySchema,
  taskIdParams,
  taskCommentParams,
  taskAttachmentParams,
  taskDependencyParams,
  createLabelSchema,
  updateLabelSchema,
  idParams,
};

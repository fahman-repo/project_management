'use strict';

const { z } = require('zod');
const { idParam, requiredString, optionalString, hexColor, priority } = require('./common');
const { statusCategory } = require('./project.validator');

const templateIdParams = z.object({ id: idParam });

const createTemplateStatusItem = z.object({
  key_name: z.string().trim().min(1).max(50).regex(/^[a-z0-9_]+$/),
  label: requiredString(80),
  color: hexColor.optional().default('#64748b'),
  category: statusCategory.optional().default('in_progress'),
  progress: z.coerce.number().int().min(0).max(100).optional().default(0),
  position: z.coerce.number().int().min(0).optional(),
});

const createTemplateMilestoneItem = z.object({
  name: requiredString(180),
  description: optionalString(5000),
  due_offset_days: z.coerce.number().int().min(0).optional().default(0),
  position: z.coerce.number().int().min(0).optional(),
});

const createTemplateTaskItem = z.object({
  title: requiredString(220),
  description: optionalString(5000),
  status_key: z.string().trim().min(1).max(50).optional().default('todo'),
  priority: priority.optional().default('medium'),
  estimated_hours: z.coerce.number().min(0).max(100000).nullable().optional(),
  start_offset_days: z.coerce.number().int().min(0).nullable().optional(),
  due_offset_days: z.coerce.number().int().min(0).nullable().optional(),
  position: z.coerce.number().int().min(0).optional(),
  is_milestone: z.boolean().optional().default(false),
});

const createTemplateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Kode template wajib diisi')
    .max(50, 'Maksimal 50 karakter')
    .regex(/^[a-z0-9-]+$/, 'Kode hanya boleh huruf kecil, angka, dan tanda hubung'),
  name: requiredString(180),
  category: optionalString(80).default('General'),
  description: optionalString(5000),
  color: hexColor.optional().default('#4f46e5'),
  statuses: z.array(createTemplateStatusItem).optional().default([]),
  milestones: z.array(createTemplateMilestoneItem).optional().default([]),
  tasks: z.array(createTemplateTaskItem).optional().default([]),
});

const createFromProjectSchema = z.object({
  project_id: idParam,
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

module.exports = {
  templateIdParams,
  createTemplateSchema,
  createFromProjectSchema,
};


import { z } from 'zod';
import { idParam, requiredString, optionalString, hexColor, priority } from './common';
import { statusCategory } from './project.validator';

export const templateIdParams = z.object({ id: idParam });

export const createTemplateStatusItem = z.object({
  key_name: z.string().trim().min(1).max(50).regex(/^[a-z0-9_]+$/),
  label: requiredString(80),
  color: hexColor.optional().default('#64748b'),
  category: statusCategory.optional().default('in_progress'),
  progress: z.coerce.number().int().min(0).max(100).optional().default(0),
  position: z.coerce.number().int().min(0).optional(),
});

export const createTemplateMilestoneItem = z.object({
  name: requiredString(180),
  description: optionalString(5000),
  due_offset_days: z.coerce.number().int().min(0).optional().default(0),
  position: z.coerce.number().int().min(0).optional(),
});

export const createTemplateTaskItem = z.object({
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

export const createTemplateSchema = z.object({
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

export const createFromProjectSchema = z.object({
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

export default {
  templateIdParams,
  createTemplateSchema,
  createFromProjectSchema,
};


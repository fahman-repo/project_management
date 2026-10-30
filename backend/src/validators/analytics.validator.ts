import { z } from 'zod';
import { idParams, paginationQuery, optionalDateString } from './common';

/**
 * Query schemas for the analytics module
 * (dashboard, reports, calendar, notifications, activities).
 */

/** An optional positive integer id that tolerates an empty query value. */
export const optionalId = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.coerce.number().int().positive().optional()
);

/** A required positive integer id. */
export const requiredId = z.coerce.number().int().positive();

/** An optional free-text filter that treats an empty string as "not set". */
export const optionalText = (max = 120) =>
  z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().trim().max(max).optional()
  );

/** A boolean query flag accepting `true`/`false`/`1`/`0`. */
export const booleanFlag = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  },
  z.boolean().optional()
);

/** GET /reports/overview */
export const overviewQuery = z.object({
  from: optionalDateString,
  to: optionalDateString,
  project_id: optionalId,
});

/** GET /reports/status-distribution */
export const statusDistributionQuery = z.object({
  project_id: optionalId,
});

/** GET /reports/productivity */
export const productivityQuery = z.object({
  from: optionalDateString,
  to: optionalDateString,
  project_id: optionalId,
});

/** GET /reports/burndown */
export const burndownQuery = z.object({
  project_id: requiredId,
  from: optionalDateString,
  to: optionalDateString,
});

/** GET /reports/evm */
export const evmQuery = z.object({
  project_id: requiredId,
  from: optionalDateString,
  to: optionalDateString,
  interval: z.enum(['daily', 'weekly']).optional().default('daily'),
});

/** GET /reports/executive */
export const executiveReportQuery = z.object({
  project_id: optionalId,
  from: optionalDateString,
  to: optionalDateString,
});

/** GET /reports/completion-trend */
export const completionTrendQuery = z.object({
  days: z.coerce.number().int().min(1).max(180).optional().default(30),
  project_id: optionalId,
});

/** GET /reports/export */
export const exportQuery = z.object({
  type: z.enum(['tasks', 'projects'], {
    errorMap: () => ({ message: 'Tipe export harus tasks atau projects' }),
  }),
  project_id: optionalId,
});

/** GET /calendar/events */
export const calendarEventsQuery = z.object({
  from: optionalDateString,
  to: optionalDateString,
  project_id: optionalId,
});

/** GET /notifications */
export const notificationListQuery = paginationQuery.extend({
  unread: booleanFlag,
});

/** GET /activities */
export const activityListQuery = paginationQuery.extend({
  user_id: optionalId,
  project_id: optionalId,
  task_id: optionalId,
  action: optionalText(50),
  from: optionalDateString,
  to: optionalDateString,
});

export { idParams };

export default {
  optionalId,
  requiredId,
  optionalText,
  booleanFlag,
  overviewQuery,
  statusDistributionQuery,
  productivityQuery,
  burndownQuery,
  evmQuery,
  executiveReportQuery,
  completionTrendQuery,
  exportQuery,
  calendarEventsQuery,
  notificationListQuery,
  activityListQuery,
  idParams,
};

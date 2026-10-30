'use strict';

const { z } = require('zod');
const { idParams, paginationQuery, optionalDateString } = require('./common');

/**
 * Query schemas for the analytics module
 * (dashboard, reports, calendar, notifications, activities).
 */

/** An optional positive integer id that tolerates an empty query value. */
const optionalId = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.coerce.number().int().positive().optional()
);

/** A required positive integer id. */
const requiredId = z.coerce.number().int().positive();

/** An optional free-text filter that treats an empty string as "not set". */
const optionalText = (max = 120) =>
  z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().trim().max(max).optional()
  );

/** A boolean query flag accepting `true`/`false`/`1`/`0`. */
const booleanFlag = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  },
  z.boolean().optional()
);

/** GET /reports/overview */
const overviewQuery = z.object({
  from: optionalDateString,
  to: optionalDateString,
  project_id: optionalId,
});

/** GET /reports/status-distribution */
const statusDistributionQuery = z.object({
  project_id: optionalId,
});

/** GET /reports/productivity */
const productivityQuery = z.object({
  from: optionalDateString,
  to: optionalDateString,
  project_id: optionalId,
});

/** GET /reports/burndown */
const burndownQuery = z.object({
  project_id: requiredId,
  from: optionalDateString,
  to: optionalDateString,
});

/** GET /reports/evm */
const evmQuery = z.object({
  project_id: requiredId,
  from: optionalDateString,
  to: optionalDateString,
  interval: z.enum(['daily', 'weekly']).optional().default('daily'),
});

/** GET /reports/executive */
const executiveReportQuery = z.object({
  project_id: optionalId,
  from: optionalDateString,
  to: optionalDateString,
});

/** GET /reports/completion-trend */
const completionTrendQuery = z.object({
  days: z.coerce.number().int().min(1).max(180).optional().default(30),
  project_id: optionalId,
});

/** GET /reports/export */
const exportQuery = z.object({
  type: z.enum(['tasks', 'projects'], {
    errorMap: () => ({ message: 'Tipe export harus tasks atau projects' }),
  }),
  project_id: optionalId,
});

/** GET /calendar/events */
const calendarEventsQuery = z.object({
  from: optionalDateString,
  to: optionalDateString,
  project_id: optionalId,
});

/** GET /notifications */
const notificationListQuery = paginationQuery.extend({
  unread: booleanFlag,
});

/** GET /activities */
const activityListQuery = paginationQuery.extend({
  user_id: optionalId,
  project_id: optionalId,
  task_id: optionalId,
  action: optionalText(50),
  from: optionalDateString,
  to: optionalDateString,
});

module.exports = {
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

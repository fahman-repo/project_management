'use strict';

const dayjs = require('dayjs');
const { query, execute } = require('../config/database');
const env = require('../config/env');
const notificationService = require('./notificationService');
const emailService = require('./emailService');

let schedulerTimer = null;

/**
 * Format date as YYYY-MM-DD
 */
function toDateString(val) {
  return dayjs(val).format('YYYY-MM-DD');
}

/**
 * Run reminder checks for H-3 and H-1 due dates across Tasks and Milestones.
 * Idempotent: uses `reminder_logs` with UNIQUE constraint to ensure each user
 * receives only 1 notification/email per reminder type for a given due date.
 *
 * @returns {Promise<{tasksChecked:number, milestonesChecked:number, remindersSent:number}>}
 */
async function runDueReminders() {
  const h3Date = dayjs().add(3, 'day').format('YYYY-MM-DD');
  const h1Date = dayjs().add(1, 'day').format('YYYY-MM-DD');

  let remindersSent = 0;

  // -------------------------------------------------------------------------
  // 1. Tasks Reminders (H-3 and H-1)
  // -------------------------------------------------------------------------
  const taskRows = await query(
    `SELECT t.id, t.title, t.due_date, t.status, t.project_id, t.assignee_id, t.reporter_id,
            p.name AS project_name, p.code AS project_code, p.manager_id,
            u.name AS user_name, u.email AS user_email
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = COALESCE(t.assignee_id, t.reporter_id, p.manager_id)
      WHERE t.due_date IN (?, ?)
        AND t.status <> 'done'
        AND t.completed_at IS NULL
        AND p.status NOT IN ('completed', 'cancelled')
        AND u.is_active = 1`,
    [h3Date, h1Date]
  );

  for (const row of taskRows) {
    const dueDateStr = toDateString(row.due_date);
    const isH1 = dueDateStr === h1Date;
    const daysLeft = isH1 ? 1 : 3;
    const reminderType = isH1 ? 'h_minus_1' : 'h_minus_3';
    const recipientId = Number(row.assignee_id || row.reporter_id || row.manager_id);

    if (!recipientId) continue;

    // Check if already sent
    const alreadySent = await query(
      `SELECT id FROM reminder_logs
        WHERE entity_type = 'task' AND entity_id = ? AND user_id = ? AND reminder_type = ? AND due_date = ?
        LIMIT 1`,
      [row.id, recipientId, reminderType, dueDateStr]
    );

    if (alreadySent.length > 0) continue;

    // Send in-app notification
    const urgency = isH1 ? 'danger' : 'warning';
    await notificationService.notify({
      userId: recipientId,
      type: urgency,
      title: `Pengingat Tenggat: ${row.title}`,
      message: `Task "${row.title}" pada proyek ${row.project_name} akan jatuh tempo dalam ${daysLeft} hari (${dueDateStr}).`,
      link: `/tasks?task=${row.id}`,
    });

    // Send email reminder
    let emailSent = 0;
    if (row.user_email) {
      const emailRes = await emailService.sendDeadlineReminder({
        user: { name: row.user_name, email: row.user_email },
        entityType: 'task',
        title: row.title,
        projectName: row.project_name,
        dueDate: dueDateStr,
        daysLeft,
        link: `/tasks?task=${row.id}`,
      });
      if (emailRes.sent || emailRes.simulated) {
        emailSent = 1;
      }
    }

    // Record in reminder_logs
    await execute(
      `INSERT IGNORE INTO reminder_logs (entity_type, entity_id, user_id, reminder_type, due_date, email_sent)
       VALUES ('task', ?, ?, ?, ?, ?)`,
      [row.id, recipientId, reminderType, dueDateStr, emailSent]
    );

    remindersSent += 1;
  }

  // -------------------------------------------------------------------------
  // 2. Milestones Reminders (H-3 and H-1)
  // -------------------------------------------------------------------------
  const milestoneRows = await query(
    `SELECT m.id, m.name, m.due_date, m.status, m.project_id,
            p.name AS project_name, p.code AS project_code, p.manager_id
       FROM milestones m
       JOIN projects p ON p.id = m.project_id
      WHERE m.due_date IN (?, ?)
        AND m.status NOT IN ('achieved', 'missed')
        AND p.status NOT IN ('completed', 'cancelled')`,
    [h3Date, h1Date]
  );

  for (const mRow of milestoneRows) {
    const dueDateStr = toDateString(mRow.due_date);
    const isH1 = dueDateStr === h1Date;
    const daysLeft = isH1 ? 1 : 3;
    const reminderType = isH1 ? 'h_minus_1' : 'h_minus_3';

    // Get all project members and manager
    const recipients = await query(
      `SELECT u.id, u.name, u.email
         FROM users u
        WHERE u.is_active = 1
          AND (
            u.id IN (SELECT user_id FROM project_members WHERE project_id = ?)
            OR u.id = ?
          )`,
      [mRow.project_id, mRow.manager_id]
    );

    for (const user of recipients) {
      const alreadySent = await query(
        `SELECT id FROM reminder_logs
          WHERE entity_type = 'milestone' AND entity_id = ? AND user_id = ? AND reminder_type = ? AND due_date = ?
          LIMIT 1`,
        [mRow.id, user.id, reminderType, dueDateStr]
      );

      if (alreadySent.length > 0) continue;

      const urgency = isH1 ? 'danger' : 'warning';
      await notificationService.notify({
        userId: user.id,
        type: urgency,
        title: `Pengingat Milestone: ${mRow.name}`,
        message: `Milestone "${mRow.name}" pada proyek ${mRow.project_name} akan jatuh tempo dalam ${daysLeft} hari (${dueDateStr}).`,
        link: `/projects/${mRow.project_id}?tab=milestones&milestone=${mRow.id}`,
      });

      let emailSent = 0;
      if (user.email) {
        const emailRes = await emailService.sendDeadlineReminder({
          user: { name: user.name, email: user.email },
          entityType: 'milestone',
          title: mRow.name,
          projectName: mRow.project_name,
          dueDate: dueDateStr,
          daysLeft,
          link: `/projects/${mRow.project_id}?tab=milestones&milestone=${mRow.id}`,
        });
        if (emailRes.sent || emailRes.simulated) {
          emailSent = 1;
        }
      }

      await execute(
        `INSERT IGNORE INTO reminder_logs (entity_type, entity_id, user_id, reminder_type, due_date, email_sent)
         VALUES ('milestone', ?, ?, ?, ?, ?)`,
        [mRow.id, user.id, reminderType, dueDateStr, emailSent]
      );

      remindersSent += 1;
    }
  }

  return {
    tasksChecked: taskRows.length,
    milestonesChecked: milestoneRows.length,
    remindersSent,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Start background reminder scheduler.
 */
function startReminderScheduler() {
  if (!env.REMINDER_ENABLED) {
    // eslint-disable-next-line no-console
    console.log('[reminderScheduler] Disabled by configuration.');
    return;
  }

  // Initial check after server start
  setTimeout(async () => {
    try {
      const result = await runDueReminders();
      // eslint-disable-next-line no-console
      console.log(`[reminderScheduler] Initial run completed. Sent: ${result.remindersSent} reminders.`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[reminderScheduler] Error during initial run:', err.message);
    }
  }, 5000).unref();

  const intervalMs = Math.max(5, env.REMINDER_INTERVAL_MINUTES) * 60 * 1000;
  schedulerTimer = setInterval(async () => {
    try {
      const result = await runDueReminders();
      if (result.remindersSent > 0) {
        // eslint-disable-next-line no-console
        console.log(`[reminderScheduler] Periodic run: sent ${result.remindersSent} reminders.`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[reminderScheduler] Periodic run failed:', err.message);
    }
  }, intervalMs);

  schedulerTimer.unref();

  // eslint-disable-next-line no-console
  console.log(`[reminderScheduler] Started (interval: ${env.REMINDER_INTERVAL_MINUTES} min).`);
}

/**
 * Stop background reminder scheduler.
 */
function stopReminderScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    // eslint-disable-next-line no-console
    console.log('[reminderScheduler] Stopped.');
  }
}

module.exports = {
  runDueReminders,
  startReminderScheduler,
  stopReminderScheduler,
};


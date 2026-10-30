'use strict';

import { query, queryOne, execute, transaction } from '../config/database';
import dayjs from 'dayjs';

/**
 * List all project templates, including status count, milestone count, and task count.
 */
async function listTemplates() {
  const rows = await query(
    `SELECT t.id, t.code, t.name, t.category, t.description, t.color, t.is_system,
            t.created_by, t.created_at, t.updated_at,
            u.name AS creator_name,
            (SELECT COUNT(*) FROM project_template_statuses s WHERE s.template_id = t.id) AS status_count,
            (SELECT COUNT(*) FROM project_template_milestones m WHERE m.template_id = t.id) AS milestone_count,
            (SELECT COUNT(*) FROM project_template_tasks k WHERE k.template_id = t.id) AS task_count
       FROM project_templates t
       LEFT JOIN users u ON u.id = t.created_by
      ORDER BY t.is_system DESC, t.category ASC, t.name ASC`
  );

  // Also fetch statuses for each template so frontend can show previews
  const templateIds = rows.map((r) => r.id);
  let statusesByTemplate = {};
  if (templateIds.length) {
    const statusRows = await query(
      `SELECT template_id, key_name, label, color, category, progress, position
         FROM project_template_statuses
        WHERE template_id IN (${templateIds.map(() => '?').join(', ')})
        ORDER BY position ASC, id ASC`,
      templateIds
    );
    for (const s of statusRows) {
      if (!statusesByTemplate[s.template_id]) {
        statusesByTemplate[s.template_id] = [];
      }
      statusesByTemplate[s.template_id].push({
        key: s.key_name,
        key_name: s.key_name,
        title: s.label,
        label: s.label,
        color: s.color,
        category: s.category,
        progress: Number(s.progress),
        position: Number(s.position),
      });
    }
  }

  return rows.map((row) => ({
    ...row,
    is_system: Boolean(row.is_system),
    status_count: Number(row.status_count || 0),
    milestone_count: Number(row.milestone_count || 0),
    task_count: Number(row.task_count || 0),
    statuses: statusesByTemplate[row.id] || [],
  }));
}

/**
 * Find a template by its ID, with its statuses, milestones, and tasks.
 * @param {number} id
 */
async function findTemplateById(id) {
  const template = await queryOne(
    `SELECT t.id, t.code, t.name, t.category, t.description, t.color, t.is_system,
            t.created_by, t.created_at, t.updated_at,
            u.name AS creator_name
       FROM project_templates t
       LEFT JOIN users u ON u.id = t.created_by
      WHERE t.id = ? LIMIT 1`,
    [id]
  );

  if (!template) return null;

  const [statuses, milestones, tasks] = await Promise.all([
    query(
      `SELECT id, key_name, label, color, category, progress, position
         FROM project_template_statuses
        WHERE template_id = ?
        ORDER BY position ASC, id ASC`,
      [id]
    ),
    query(
      `SELECT id, name, description, due_offset_days, position
         FROM project_template_milestones
        WHERE template_id = ?
        ORDER BY position ASC, id ASC`,
      [id]
    ),
    query(
      `SELECT id, parent_temp_id, title, description, status_key, priority,
              estimated_hours, estimated_cost, start_offset_days, due_offset_days, position, is_milestone
         FROM project_template_tasks
        WHERE template_id = ?
        ORDER BY position ASC, id ASC`,
      [id]
    ),
  ]);

  return {
    ...template,
    is_system: Boolean(template.is_system),
    statuses: statuses.map((s) => ({
      ...s,
      key: s.key_name,
      title: s.label,
      progress: Number(s.progress),
      position: Number(s.position),
    })),
    milestones: milestones.map((m) => ({
      ...m,
      due_offset_days: Number(m.due_offset_days),
      position: Number(m.position),
    })),
    tasks: tasks.map((k) => ({
      ...k,
      estimated_hours: k.estimated_hours !== null ? Number(k.estimated_hours) : null,
      estimated_cost: k.estimated_cost !== null ? Number(k.estimated_cost) : 0,
      start_offset_days: k.start_offset_days !== null ? Number(k.start_offset_days) : null,
      due_offset_days: k.due_offset_days !== null ? Number(k.due_offset_days) : null,
      is_milestone: Boolean(k.is_milestone),
      position: Number(k.position),
    })),
  };
}

/**
 * Find a template by its unique code slug.
 * @param {string} code
 */
async function findTemplateByCode(code) {
  return queryOne('SELECT id, code, name FROM project_templates WHERE code = ? LIMIT 1', [code]);
}

/**
 * Create a new template and its child items.
 * @param {object} data
 * @param {number} userId
 */
async function createTemplate(data, userId) {
  const {
    code,
    name,
    category = 'General',
    description = null,
    color = '#4f46e5',
    statuses = [],
    milestones = [],
    tasks = [],
  } = data;

  return transaction(async (connection) => {
    const [res]: any = await connection.execute(
      `INSERT INTO project_templates (code, name, category, description, color, is_system, created_by)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [code, name, category, description, color, userId]
    );
    const templateId = res.insertId;

    if (statuses.length) {
      for (let i = 0; i < statuses.length; i += 1) {
        const s = statuses[i];
        await connection.execute(
          `INSERT INTO project_template_statuses (template_id, key_name, label, color, category, progress, position)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            templateId,
            s.key_name || s.key,
            s.label || s.title,
            s.color || '#64748b',
            s.category || 'in_progress',
            s.progress ?? 0,
            s.position !== undefined ? s.position : i,
          ]
        );
      }
    }

    if (milestones.length) {
      for (let i = 0; i < milestones.length; i += 1) {
        const m = milestones[i];
        await connection.execute(
          `INSERT INTO project_template_milestones (template_id, name, description, due_offset_days, position)
           VALUES (?, ?, ?, ?, ?)`,
          [templateId, m.name, m.description || null, m.due_offset_days || 0, m.position !== undefined ? m.position : i]
        );
      }
    }

    if (tasks.length) {
      for (let i = 0; i < tasks.length; i += 1) {
        const t = tasks[i];
        await connection.execute(
          `INSERT INTO project_template_tasks
             (template_id, parent_temp_id, title, description, status_key, priority, estimated_hours, estimated_cost,
              start_offset_days, due_offset_days, position, is_milestone)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            templateId,
            t.parent_temp_id || null,
            t.title,
            t.description || null,
            t.status_key || 'todo',
            t.priority || 'medium',
            t.estimated_hours || null,
            t.estimated_cost || 0,
            t.start_offset_days ?? null,
            t.due_offset_days ?? null,
            t.position !== undefined ? t.position : i,
            t.is_milestone ? 1 : 0,
          ]
        );
      }
    }

    return templateId;
  });
}

/**
 * Create a template cloned from an existing project.
 * @param {number} projectId
 * @param {object} payload
 * @param {number} userId
 */
async function createTemplateFromProject(projectId, payload, userId) {
  const { code, name, category = 'Custom', description = null, color } = payload;

  const project = await queryOne('SELECT * FROM projects WHERE id = ? LIMIT 1', [projectId]);
  if (!project) throw new Error('Proyek tidak ditemukan');

  const finalColor = color || project.color || '#4f46e5';

  const [statuses, milestones, tasks] = await Promise.all([
    query(
      `SELECT key_name, label, color, category, progress, position
         FROM project_statuses
        WHERE project_id = ?
        ORDER BY position ASC, id ASC`,
      [projectId]
    ),
    query(
      `SELECT name, description, due_date
         FROM milestones
        WHERE project_id = ?
        ORDER BY id ASC`,
      [projectId]
    ),
    query(
      `SELECT id, parent_id, title, description, status, priority, estimated_hours, estimated_cost,
              start_date, due_date, position, is_milestone
         FROM tasks
        WHERE project_id = ?
        ORDER BY position ASC, id ASC`,
      [projectId]
    ),
  ]);

  const projectStart = project.start_date ? dayjs(project.start_date) : dayjs();

  // Convert milestones to offsets
  const templateMilestones = milestones.map((m, index) => {
    let dueOffset = 0;
    if (m.due_date) {
      dueOffset = Math.max(0, dayjs(m.due_date).diff(projectStart, 'day'));
    }
    return {
      name: m.name,
      description: m.description,
      due_offset_days: dueOffset,
      position: index,
    };
  });

  // Convert tasks to offsets
  const taskIdToTempIndex = new Map();
  tasks.forEach((t, idx) => {
    taskIdToTempIndex.set(t.id, idx);
  });

  return transaction(async (connection) => {
    const [res]: any = await connection.execute(
      `INSERT INTO project_templates (code, name, category, description, color, is_system, created_by)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [code, name, category, description, finalColor, userId]
    );
    const templateId = res.insertId;

    // Insert statuses
    for (const s of statuses) {
      await connection.execute(
        `INSERT INTO project_template_statuses (template_id, key_name, label, color, category, progress, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [templateId, s.key_name, s.label, s.color, s.category, s.progress, s.position]
      );
    }

    // Insert milestones
    for (const m of templateMilestones) {
      await connection.execute(
        `INSERT INTO project_template_milestones (template_id, name, description, due_offset_days, position)
         VALUES (?, ?, ?, ?, ?)`,
        [templateId, m.name, m.description, m.due_offset_days, m.position]
      );
    }

    // Insert tasks (parents first, then subtasks)
    const insertedTaskIds = new Map();
    for (let i = 0; i < tasks.length; i += 1) {
      const t = tasks[i];
      let startOffset = null;
      let dueOffset = null;
      if (t.start_date) {
        startOffset = Math.max(0, dayjs(t.start_date).diff(projectStart, 'day'));
      }
      if (t.due_date) {
        dueOffset = Math.max(0, dayjs(t.due_date).diff(projectStart, 'day'));
      }

      const parentTempId = t.parent_id && insertedTaskIds.has(t.parent_id)
        ? insertedTaskIds.get(t.parent_id)
        : null;

      const [taskRes]: any = await connection.execute(
        `INSERT INTO project_template_tasks
           (template_id, parent_temp_id, title, description, status_key, priority, estimated_hours, estimated_cost,
            start_offset_days, due_offset_days, position, is_milestone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          templateId,
          parentTempId,
          t.title,
          t.description,
          t.status,
          t.priority,
          t.estimated_hours,
          t.estimated_cost || 0,
          startOffset,
          dueOffset,
          t.position,
          t.is_milestone,
        ]
      );
      insertedTaskIds.set(t.id, taskRes.insertId);
    }

    return templateId;
  });
}

/**
 * Delete a custom template. System templates cannot be deleted.
 * @param {number} id
 */
async function deleteTemplate(id) {
  const template = await queryOne('SELECT id, is_system FROM project_templates WHERE id = ? LIMIT 1', [id]);
  if (!template) return false;
  if (template.is_system) {
    throw new Error('Template bawaan sistem tidak dapat dihapus');
  }

  const result = await execute('DELETE FROM project_templates WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

/**
 * Instantiate a template into a newly created project.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {object} params
 * @param {number} params.projectId
 * @param {number} params.templateId
 * @param {string|null} params.startDate
 * @param {number} params.creatorId
 * @param {boolean} [params.includeMilestones]
 * @param {boolean} [params.includeTasks]
 */
async function instantiateTemplateIntoProject(connection, params) {
  const {
    projectId,
    templateId,
    startDate,
    creatorId,
    includeMilestones = true,
    includeTasks = true,
  } = params;

  const baseDate = startDate ? dayjs(startDate) : dayjs();

  // 1. Copy statuses
  const [templateStatuses] = await connection.query(
    `SELECT key_name, label, color, category, progress, position
       FROM project_template_statuses
      WHERE template_id = ?
      ORDER BY position ASC, id ASC`,
    [templateId]
  );

  for (const s of templateStatuses) {
    await connection.execute(
      `INSERT INTO project_statuses (project_id, key_name, label, color, category, progress, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [projectId, s.key_name, s.label, s.color, s.category, s.progress, s.position]
    );
  }

  // 2. Copy milestones
  if (includeMilestones) {
    const [templateMilestones] = await connection.query(
      `SELECT name, description, due_offset_days, position
         FROM project_template_milestones
        WHERE template_id = ?
        ORDER BY position ASC, id ASC`,
      [templateId]
    );

    for (const m of templateMilestones) {
      const dueDate = baseDate.add(m.due_offset_days || 0, 'day').format('YYYY-MM-DD');
      await connection.execute(
        `INSERT INTO milestones (project_id, name, description, due_date, status, progress, created_by)
         VALUES (?, ?, ?, ?, 'planned', 0, ?)`,
        [projectId, m.name, m.description || null, dueDate, creatorId]
      );
    }
  }

  // 3. Copy tasks (parents first, then subtasks)
  if (includeTasks) {
    const [templateTasks] = await connection.query(
      `SELECT id, parent_temp_id, title, description, status_key, priority, estimated_hours, estimated_cost,
              start_offset_days, due_offset_days, position, is_milestone
         FROM project_template_tasks
        WHERE template_id = ?
        ORDER BY parent_temp_id IS NOT NULL ASC, position ASC, id ASC`,
      [templateId]
    );

    const tempIdToTaskId = new Map();

    for (const t of templateTasks) {
      const taskStart = t.start_offset_days !== null && t.start_offset_days !== undefined
        ? baseDate.add(t.start_offset_days, 'day').format('YYYY-MM-DD')
        : null;
      const taskDue = t.due_offset_days !== null && t.due_offset_days !== undefined
        ? baseDate.add(t.due_offset_days, 'day').format('YYYY-MM-DD')
        : null;

      const parentId = t.parent_temp_id && tempIdToTaskId.has(t.parent_temp_id)
        ? tempIdToTaskId.get(t.parent_temp_id)
        : null;

      const [res]: any = await connection.execute(
        `INSERT INTO tasks (project_id, parent_id, title, description, status, priority,
                            reporter_id, start_date, due_date, estimated_hours, estimated_cost, actual_cost, progress, position, is_milestone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        [
          projectId,
          parentId,
          t.title,
          t.description || null,
          t.status_key || 'todo',
          t.priority || 'medium',
          creatorId,
          taskStart,
          taskDue,
          t.estimated_hours || null,
          t.estimated_cost ? Number(t.estimated_cost) : 0,
          t.position || 0,
          t.is_milestone ? 1 : 0,
        ]
      );

      tempIdToTaskId.set(t.id, res.insertId);
    }
  }
}

export { listTemplates };
export { findTemplateById };
export { findTemplateByCode };
export { createTemplate };
export { createTemplateFromProject };
export { deleteTemplate };
export { instantiateTemplateIntoProject };

export default {
  listTemplates,
  findTemplateById,
  findTemplateByCode,
  createTemplate,
  createTemplateFromProject,
  deleteTemplate,
  instantiateTemplateIntoProject
};


'use strict';

const { query, queryOne, execute } = require('../config/database');
const { buildWhere, buildOrderBy, paginatedQuery, inPlaceholders } = require('./base');
const { computeTaskProgressMap } = require('../services/progressService');

/**
 * Data access for tasks and everything hanging off them: labels, comments,
 * attachments and dependencies.
 *
 * MariaDB 10.1 has no window functions and no CTEs, so enrichment is done
 * with correlated sub-queries and GROUP BY over a derived table.
 */

/** Whitelist of sortable columns - `buildOrderBy` never interpolates user input. */
const SORTABLE = {
  'title asc': 't.title ASC',
  'title desc': 't.title DESC',
  'status asc': 't.status ASC',
  'status desc': 't.status DESC',
  'priority asc': "FIELD(t.priority,'low','medium','high','urgent') ASC",
  'priority desc': "FIELD(t.priority,'low','medium','high','urgent') DESC",
  'due_date asc': 't.due_date ASC',
  'due_date desc': 't.due_date DESC',
  'created_at asc': 't.created_at ASC',
  'created_at desc': 't.created_at DESC',
  'progress asc': 't.progress ASC',
  'progress desc': 't.progress DESC',
  'updated_at asc': 't.updated_at ASC',
  'updated_at desc': 't.updated_at DESC',
};

const DEFAULT_SORT = 'created_at desc';

const TASK_FIELDS = `t.id, t.project_id, t.parent_id, t.title, t.description, t.status, t.priority,
       t.assignee_id, t.reporter_id, t.start_date, t.due_date, t.completed_at,
       t.estimated_hours, t.actual_hours, t.estimated_cost, t.actual_cost, t.progress, t.position, t.is_milestone,
       t.created_at, t.updated_at`;

/** Label ids of a task as a comma separated string. */
const LABEL_AGG = `IFNULL((SELECT GROUP_CONCAT(tl.label_id ORDER BY tl.label_id)
            FROM task_labels tl
           WHERE tl.task_id = t.id
           GROUP BY tl.task_id), '') AS label_ids`;

const ENRICHED_FROM = `FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN users a ON a.id = t.assignee_id
       LEFT JOIN users r ON r.id = t.reporter_id
       LEFT JOIN project_statuses ps ON ps.project_id = t.project_id AND ps.key_name = t.status`;

const ENRICHED_SELECT = `SELECT ${TASK_FIELDS},
       p.name AS project_name, p.code AS project_code, p.color AS project_color,
       a.name AS assignee_name, a.avatar AS assignee_avatar, a.email AS assignee_email,
       r.name AS reporter_name,
       ${LABEL_AGG},
       (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) AS comment_count,
       (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id) AS attachment_count,
       (SELECT COUNT(*) FROM tasks st WHERE st.parent_id = t.id) AS subtask_count,
       (SELECT COUNT(*) FROM tasks st WHERE st.parent_id = t.id AND st.status = 'done') AS subtask_done_count,
       (SELECT COUNT(*) FROM task_checklists tck WHERE tck.task_id = t.id) AS checklist_count,
       (SELECT COUNT(*) FROM task_checklists tck WHERE tck.task_id = t.id AND tck.is_checked = 1) AS checklist_done_count,
       (SELECT COUNT(*) FROM task_dependencies td WHERE td.task_id = t.id) AS dependency_count
       ${ENRICHED_FROM}`;

// ---------------------------------------------------------------------------
// Low level helpers
// ---------------------------------------------------------------------------

/**
 * Run a SELECT either inside a transaction or on the shared pool.
 * @param {import('mysql2/promise').PoolConnection|null} connection
 */
async function runQuery(connection, sql, params) {
  if (connection) {
    const [rows] = await connection.execute(sql, params);
    return rows;
  }
  return query(sql, params);
}

/**
 * Run a write statement either inside a transaction or on the shared pool.
 * @param {import('mysql2/promise').PoolConnection|null} connection
 */
async function runExecute(connection, sql, params) {
  if (connection) {
    const [result] = await connection.execute(sql, params);
    return result;
  }
  return execute(sql, params);
}

/**
 * Normalise DECIMAL columns (returned as strings by mysql2) into numbers.
 * @param {object|null} row
 */
function normalizeTask(row) {
  if (!row) return null;
  return {
    ...row,
    estimated_hours:
      row.estimated_hours === null || row.estimated_hours === undefined
        ? null
        : Number(row.estimated_hours),
    actual_hours:
      row.actual_hours === null || row.actual_hours === undefined
        ? null
        : Number(row.actual_hours),
    estimated_cost:
      row.estimated_cost === null || row.estimated_cost === undefined
        ? 0
        : Number(row.estimated_cost),
    actual_cost:
      row.actual_cost === null || row.actual_cost === undefined
        ? 0
        : Number(row.actual_cost),
  };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * List tasks with all filters of the list endpoint.
 *
 * @param {object} options
 * @param {number} [options.projectId]
 * @param {number} [options.assigneeId]
 * @param {string[]} [options.statuses]
 * @param {string[]} [options.priorities]
 * @param {number} [options.labelId]
 * @param {number} [options.parentId]
 * @param {string} [options.search]
 * @param {boolean} [options.overdue]
 * @param {string} [options.dueFrom]
 * @param {string} [options.dueTo]
 * @param {string} [options.sort]
 * @param {string} [options.direction]
 * @param {number} options.limit
 * @param {number} options.offset
 * @param {number} options.userId
 * @param {boolean} options.isAdmin
 * @param {number[]|null} options.accessibleProjectIds
 */
async function listTasks(options = {}) {
  const {
    projectId,
    assigneeId,
    statuses,
    priorities,
    labelId,
    parentId,
    search,
    overdue,
    dueFrom,
    dueTo,
    sort,
    direction,
    limit,
    offset,
    userId,
    isAdmin,
    accessibleProjectIds,
  } = options;

  const { whereSql: baseWhere, params: baseParams } = buildWhere([
    { sql: 't.project_id = ?', value: projectId },
    { sql: 't.assignee_id = ?', value: assigneeId },
    { sql: 't.parent_id = ?', value: parentId },
    { sql: 't.due_date >= ?', value: dueFrom },
    { sql: 't.due_date <= ?', value: dueTo },
  ]);

  const extra = [];
  const extraParams = [];

  const pushExtra = (sql, params = []) => {
    extra.push(sql);
    extraParams.push(...params);
  };

  if (search) {
    pushExtra('(t.title LIKE ? OR t.description LIKE ?)', [`%${search}%`, `%${search}%`]);
  }
  if (statuses && statuses.length) {
    pushExtra(`t.status IN (${inPlaceholders(statuses)})`, statuses);
  }
  if (priorities && priorities.length) {
    pushExtra(`t.priority IN (${inPlaceholders(priorities)})`, priorities);
  }
  if (labelId) {
    pushExtra('EXISTS (SELECT 1 FROM task_labels tl WHERE tl.task_id = t.id AND tl.label_id = ?)', [
      labelId,
    ]);
  }
  if (overdue) {
    pushExtra("t.due_date IS NOT NULL AND t.due_date < CURDATE() AND t.status <> 'done'");
  }

  // Members only see tasks of their own projects plus tasks assigned to them.
  if (!isAdmin) {
    const ids = accessibleProjectIds && accessibleProjectIds.length ? accessibleProjectIds : [0];
    pushExtra(
      `(t.project_id IN (${inPlaceholders(ids)}) OR t.assignee_id = ? OR t.reporter_id = ?)`,
      [...ids, userId, userId]
    );
  }

  const whereParts = [];
  if (baseWhere) whereParts.push(baseWhere.replace(/^WHERE\s+/i, ''));
  whereParts.push(...extra);

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  const params = [...baseParams, ...extraParams];

  const order = buildOrderBy(SORTABLE, `${sort} ${direction}`, DEFAULT_SORT);
  const selectSql = `${ENRICHED_SELECT} ${whereSql} ${order.sql}`;
  const countSql = `SELECT COUNT(*) AS total ${ENRICHED_FROM} ${whereSql}`;

  const { rows, total } = await paginatedQuery(selectSql, countSql, params, { limit, offset });
  return { rows: rows.map(normalizeTask), total };
}

/**
 * A single task with the same enrichment as the list endpoint.
 * @param {number} id
 */
async function findTaskById(id) {
  const row = await queryOne(`${ENRICHED_SELECT} WHERE t.id = ? LIMIT 1`, [id]);
  return normalizeTask(row);
}

/**
 * The raw task row - used for permission checks.
 * @param {number} id
 */
async function findTaskRaw(id) {
  return queryOne('SELECT * FROM tasks WHERE id = ? LIMIT 1', [id]);
}

/**
 * Every task of a project with the list enrichment (used by the kanban board).
 * @param {number} projectId
 */
async function listProjectTasks(projectId) {
  const rows = await query(
    `${ENRICHED_SELECT} WHERE t.project_id = ? ORDER BY t.position ASC, t.id ASC`,
    [projectId]
  );
  return rows.map(normalizeTask);
}

/**
 * Lightweight project summary used by the board endpoint.
 * @param {number} projectId
 */
async function findProjectSummary(projectId) {
  return queryOne(
    `SELECT id, code, name, description, status, priority, progress, color, start_date, end_date, manager_id
       FROM projects WHERE id = ? LIMIT 1`,
    [projectId]
  );
}

/**
 * @param {object} data
 * @param {import('mysql2/promise').PoolConnection|null} [connection]
 * @returns {Promise<number>} the new task id
 */
async function createTask(data, connection = null) {
  const {
    project_id,
    parent_id = null,
    title,
    description = null,
    status = 'todo',
    priority = 'medium',
    assignee_id = null,
    reporter_id = null,
    start_date = null,
    due_date = null,
    completed_at = null,
    estimated_hours = null,
    actual_hours = null,
    estimated_cost = 0,
    actual_cost = 0,
    progress = 0,
    position = 0,
    is_milestone = 0,
  } = data;

  const result = await runExecute(
    connection,
    `INSERT INTO tasks (project_id, parent_id, title, description, status, priority,
                        assignee_id, reporter_id, start_date, due_date, completed_at,
                        estimated_hours, actual_hours, estimated_cost, actual_cost, progress, position, is_milestone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project_id,
      parent_id,
      title,
      description,
      status,
      priority,
      assignee_id,
      reporter_id,
      start_date,
      due_date,
      completed_at,
      estimated_hours,
      actual_hours,
      estimated_cost,
      actual_cost,
      progress,
      position,
      is_milestone,
    ]
  );

  return result.insertId;
}

const UPDATABLE_COLUMNS = [
  'title',
  'description',
  'status',
  'priority',
  'assignee_id',
  'reporter_id',
  'start_date',
  'due_date',
  'completed_at',
  'estimated_hours',
  'actual_hours',
  'estimated_cost',
  'actual_cost',
  'progress',
  'position',
  'parent_id',
  'is_milestone',
];

/**
 * Update the given columns of a task.
 * @param {number} id
 * @param {object} data
 * @param {import('mysql2/promise').PoolConnection|null} [connection]
 */
async function updateTask(id, data, connection = null) {
  const fields = [];
  const params = [];

  for (const column of UPDATABLE_COLUMNS) {
    if (data[column] !== undefined) {
      fields.push(`${column} = ?`);
      params.push(data[column]);
    }
  }

  if (!fields.length) return 0;

  params.push(id);
  const result = await runExecute(
    connection,
    `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`,
    params
  );
  return result.affectedRows;
}

/**
 * @param {number} id
 * @param {import('mysql2/promise').PoolConnection|null} [connection]
 */
async function deleteTask(id, connection = null) {
  const result = await runExecute(connection, 'DELETE FROM tasks WHERE id = ?', [id]);
  return result.affectedRows;
}

/**
 * The position a new task takes at the end of a kanban column.
 * @param {number} projectId
 * @param {string} status
 */
async function getMaxPosition(projectId, status) {
  const row = await queryOne(
    'SELECT COALESCE(MAX(position), -1) AS max_position FROM tasks WHERE project_id = ? AND status = ?',
    [projectId, status]
  );
  return Number(row?.max_position ?? -1);
}

/**
 * Ids of a kanban column, ordered by their current position.
 * @param {number} projectId
 * @param {string} status
 * @param {number} [excludeTaskId]
 */
async function listColumnTaskIds(projectId, status, excludeTaskId = null) {
  const rows = await query(
    'SELECT id FROM tasks WHERE project_id = ? AND status = ? ORDER BY position ASC, id ASC',
    [projectId, status]
  );
  return rows.map((row) => row.id).filter((id) => id !== excludeTaskId);
}

/**
 * Renumber a whole column to 0, 1, 2 ... in the given order.
 * @param {number} projectId
 * @param {string} status
 * @param {number[]} orderedIds
 * @param {import('mysql2/promise').PoolConnection|null} [connection]
 */
async function reindexColumn(projectId, status, orderedIds, connection = null) {
  if (!orderedIds.length) return 0;

  const cases = orderedIds.map(() => 'WHEN ? THEN ?').join(' ');
  const caseParams = [];
  orderedIds.forEach((id, index) => {
    caseParams.push(id, index);
  });

  const sql = `UPDATE tasks SET position = CASE id ${cases} ELSE position END
               WHERE project_id = ? AND status = ? AND id IN (${inPlaceholders(orderedIds)})`;

  const result = await runExecute(connection, sql, [
    ...caseParams,
    projectId,
    status,
    ...orderedIds,
  ]);
  return result.affectedRows;
}

/**
 * Keep the stored `progress` column in sync with the derivation rules:
 * leaf tasks follow their status, parent tasks follow their children.
 * @param {number} projectId
 * @param {import('mysql2/promise').PoolConnection|null} [connection]
 */
async function syncTaskProgress(projectId, connection = null) {
  const rows = await runQuery(
    connection,
    `SELECT t.id, t.parent_id, t.status, t.progress, t.estimated_hours,
            COALESCE(ps.progress, 0) AS status_progress,
            COALESCE(ps.category, '') AS status_category
       FROM tasks t
       LEFT JOIN project_statuses ps ON ps.project_id = t.project_id AND ps.key_name = t.status
      WHERE t.project_id = ?`,
    [projectId]
  );
  if (!rows.length) return 0;

  const progressMap = computeTaskProgressMap(rows);
  const updates = [];
  for (const row of rows) {
    const computed = progressMap.get(row.id);
    if (computed !== undefined && Number(computed) !== Number(row.progress)) {
      updates.push([row.id, computed]);
    }
  }
  if (!updates.length) return 0;

  const cases = updates.map(() => 'WHEN ? THEN ?').join(' ');
  const params = [];
  for (const [id, value] of updates) params.push(id, value);

  await runExecute(
    connection,
    `UPDATE tasks SET progress = CASE id ${cases} ELSE progress END
      WHERE id IN (${inPlaceholders(updates.map(([id]) => id))})`,
    [...params, ...updates.map(([id]) => id)]
  );

  return updates.length;
}

/**
 * Sub-tasks of a task.
 * @param {number} taskId
 */
async function listSubtasks(taskId) {
  const rows = await query(
    `SELECT ${TASK_FIELDS},
            a.name AS assignee_name, a.avatar AS assignee_avatar,
            r.name AS reporter_name
       FROM tasks t
       LEFT JOIN users a ON a.id = t.assignee_id
       LEFT JOIN users r ON r.id = t.reporter_id
      WHERE t.parent_id = ?
      ORDER BY t.position ASC, t.id ASC`,
    [taskId]
  );
  return rows.map(normalizeTask);
}

/**
 * @param {number} taskId
 */
async function findParent(taskId) {
  const row = await queryOne(
    'SELECT id, title, status, project_id FROM tasks WHERE id = ? LIMIT 1',
    [taskId]
  );
  return row;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/**
 * @param {number} taskId
 */
async function listTaskLabels(taskId) {
  return query(
    `SELECT l.id, l.name, l.color, l.created_at
       FROM labels l
       JOIN task_labels tl ON tl.label_id = l.id
      WHERE tl.task_id = ?
      ORDER BY l.name ASC`,
    [taskId]
  );
}

/**
 * @param {number} taskId
 * @param {number[]} labelIds
 * @param {import('mysql2/promise').PoolConnection|null} [connection]
 */
async function attachLabels(taskId, labelIds, connection = null) {
  if (!labelIds || !labelIds.length) return 0;

  const unique = [...new Set(labelIds)];
  const placeholders = unique.map(() => '(?, ?)').join(', ');
  const params = unique.flatMap((labelId) => [taskId, labelId]);

  const result = await runExecute(
    connection,
    `INSERT INTO task_labels (task_id, label_id) VALUES ${placeholders}`,
    params
  );
  return result.affectedRows;
}

/**
 * Replace the labels of a task with the given set.
 * @param {number} taskId
 * @param {number[]} labelIds
 * @param {import('mysql2/promise').PoolConnection|null} [connection]
 */
async function syncTaskLabels(taskId, labelIds, connection = null) {
  await runExecute(connection, 'DELETE FROM task_labels WHERE task_id = ?', [taskId]);
  return attachLabels(taskId, labelIds, connection);
}

/**
 * All labels with the number of tasks using them.
 */
async function listLabels() {
  return query(
    `SELECT l.id, l.name, l.color, l.created_at,
            (SELECT COUNT(*) FROM task_labels tl WHERE tl.label_id = l.id) AS task_count
       FROM labels l
      ORDER BY l.name ASC`
  );
}

/**
 * @param {number} id
 */
async function findLabelById(id) {
  return queryOne('SELECT * FROM labels WHERE id = ? LIMIT 1', [id]);
}

/**
 * @param {string} name
 */
async function findLabelByName(name) {
  return queryOne('SELECT * FROM labels WHERE name = ? LIMIT 1', [name]);
}

/**
 * @param {{name:string, color:string}} data
 */
async function createLabel(data) {
  const result = await execute(
    'INSERT INTO labels (name, color) VALUES (?, ?)',
    [data.name, data.color]
  );
  return result.insertId;
}

/**
 * @param {number} id
 * @param {{name?:string, color?:string}} data
 */
async function updateLabel(id, data) {
  const fields = [];
  const params = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    params.push(data.name);
  }
  if (data.color !== undefined) {
    fields.push('color = ?');
    params.push(data.color);
  }
  if (!fields.length) return 0;

  params.push(id);
  const result = await execute(`UPDATE labels SET ${fields.join(', ')} WHERE id = ?`, params);
  return result.affectedRows;
}

/**
 * @param {number} id
 */
async function deleteLabel(id) {
  const result = await execute('DELETE FROM labels WHERE id = ?', [id]);
  return result.affectedRows;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/**
 * Comments of a task, oldest first.
 * @param {number} taskId
 */
async function listComments(taskId) {
  return query(
    `SELECT c.id, c.task_id, c.user_id, c.body, c.created_at, c.updated_at,
            u.name AS user_name, u.avatar AS user_avatar, u.email AS user_email
       FROM task_comments c
       JOIN users u ON u.id = c.user_id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC, c.id ASC`,
    [taskId]
  );
}

/**
 * @param {number} taskId
 * @param {number} userId
 * @param {string} body
 */
async function createComment(taskId, userId, body) {
  const result = await execute(
    'INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, ?)',
    [taskId, userId, body]
  );
  return result.insertId;
}

/**
 * @param {number} id
 */
async function findCommentById(id) {
  return queryOne('SELECT * FROM task_comments WHERE id = ? LIMIT 1', [id]);
}

/**
 * @param {number} id
 */
async function deleteComment(id) {
  const result = await execute('DELETE FROM task_comments WHERE id = ?', [id]);
  return result.affectedRows;
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

/**
 * @param {number} taskId
 */
async function listAttachments(taskId) {
  return query(
    `SELECT a.id, a.task_id, a.uploader_id, a.original_name, a.stored_name,
            a.mime_type, a.size, a.created_at,
            u.name AS uploader_name, u.avatar AS uploader_avatar
       FROM task_attachments a
       LEFT JOIN users u ON u.id = a.uploader_id
      WHERE a.task_id = ?
      ORDER BY a.id ASC`,
    [taskId]
  );
}

/**
 * @param {{task_id:number, uploader_id:number|null, original_name:string, stored_name:string, mime_type:string, size:number}} data
 */
async function createAttachment(data) {
  const result = await execute(
    `INSERT INTO task_attachments (task_id, uploader_id, original_name, stored_name, mime_type, size)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.task_id,
      data.uploader_id,
      data.original_name,
      data.stored_name,
      data.mime_type,
      data.size,
    ]
  );
  return result.insertId;
}

/**
 * @param {number} id
 */
async function findAttachmentById(id) {
  return queryOne('SELECT * FROM task_attachments WHERE id = ? LIMIT 1', [id]);
}

/**
 * @param {number} id
 */
async function deleteAttachment(id) {
  const result = await execute('DELETE FROM task_attachments WHERE id = ?', [id]);
  return result.affectedRows;
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies of a task, including the referenced task.
 * @param {number} taskId
 */
async function listDependencies(taskId) {
  return query(
    `SELECT d.id, d.task_id, d.depends_on_id, d.type, d.lag_days, d.created_at,
            t.id AS depends_task_id, t.title AS depends_title, t.status AS depends_status,
            t.project_id AS depends_project_id
       FROM task_dependencies d
       JOIN tasks t ON t.id = d.depends_on_id
      WHERE d.task_id = ?
      ORDER BY d.id ASC`,
    [taskId]
  );
}

/**
 * @param {number} id
 */
async function findDependencyById(id) {
  return queryOne('SELECT * FROM task_dependencies WHERE id = ? LIMIT 1', [id]);
}

/**
 * @param {number} taskId
 * @param {number} dependsOnId
 */
async function findDependency(taskId, dependsOnId) {
  return queryOne(
    'SELECT * FROM task_dependencies WHERE task_id = ? AND depends_on_id = ? LIMIT 1',
    [taskId, dependsOnId]
  );
}

/**
 * @param {number} taskId
 * @param {number} dependsOnId
 * @param {string} type
 * @param {number} [lagDays=0]
 */
async function createDependency(taskId, dependsOnId, type, lagDays = 0) {
  const result = await execute(
    'INSERT INTO task_dependencies (task_id, depends_on_id, type, lag_days) VALUES (?, ?, ?, ?)',
    [taskId, dependsOnId, type, lagDays]
  );
  return result.insertId;
}

/**
 * @param {number} id
 */
async function deleteDependency(id) {
  const result = await execute('DELETE FROM task_dependencies WHERE id = ?', [id]);
  return result.affectedRows;
}

/**
 * Every blocking edge of the whole database, normalised to "A depends on B".
 *
 * `blocked_by` is already in that direction, `blocks` is the same relation
 * written the other way round and is therefore flipped.
 *
 * @returns {Promise<Array<{task_id:number, depends_on_id:number}>>}
 */
async function listBlockedByEdges() {
  return query(
    `SELECT task_id, depends_on_id FROM task_dependencies WHERE type = 'blocked_by'
     UNION ALL
     SELECT depends_on_id AS task_id, task_id AS depends_on_id
       FROM task_dependencies WHERE type = 'blocks'`
  );
}

/**
 * Walk the `blocked_by` graph upwards from `fromTaskId`.
 *
 * @param {number} fromTaskId
 * @param {number} targetTaskId
 * @param {Array<{task_id:number, depends_on_id:number}>} [edges]
 * @returns {Promise<boolean>} true when targetTaskId is reachable
 */
async function isReachable(fromTaskId, targetTaskId, edges = null) {
  const list = edges || (await listBlockedByEdges());

  const graph = new Map();
  for (const edge of list) {
    if (!graph.has(edge.task_id)) graph.set(edge.task_id, []);
    graph.get(edge.task_id).push(edge.depends_on_id);
  }

  const seen = new Set();
  const stack = [fromTaskId];

  while (stack.length) {
    const current = stack.pop();
    if (current === targetTaskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of graph.get(current) || []) stack.push(next);
  }

  return false;
}

/**
 * Retrieve tasks, milestones, and dependencies formatted for Gantt chart view.
 * @param {number} projectId
 */
async function getGanttData(projectId) {
  const [tasks, milestones, dependencies] = await Promise.all([
    query(
      `${ENRICHED_SELECT} WHERE t.project_id = ? ORDER BY COALESCE(t.start_date, t.created_at) ASC, t.position ASC, t.id ASC`,
      [projectId]
    ),
    query(
      `SELECT m.id, m.project_id, m.name, m.description, m.due_date, m.status, m.progress, m.created_at
         FROM milestones m
        WHERE m.project_id = ?
        ORDER BY m.due_date ASC, m.id ASC`,
      [projectId]
    ),
    query(
      `SELECT d.id, d.task_id, d.depends_on_id, d.type, d.lag_days,
              t1.title AS task_title, t2.title AS depends_on_title
         FROM task_dependencies d
         JOIN tasks t1 ON t1.id = d.task_id
         JOIN tasks t2 ON t2.id = d.depends_on_id
        WHERE t1.project_id = ? AND t2.project_id = ?`,
      [projectId, projectId]
    ),
  ]);

  return {
    tasks: tasks.map(normalizeTask),
    milestones: milestones.map((m) => ({
      ...m,
      progress: Number(m.progress || 0),
    })),
    dependencies: dependencies.map((d) => ({
      ...d,
      lag_days: Number(d.lag_days || 0),
    })),
  };
}

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

/**
 * Checklists belonging to a task, ordered by position.
 * @param {number} taskId
 */
async function listChecklists(taskId) {
  const rows = await query(
    `SELECT c.id, c.task_id, c.title, c.is_checked, c.position, c.created_by, c.created_at, c.updated_at,
            u.name AS creator_name
       FROM task_checklists c
       LEFT JOIN users u ON u.id = c.created_by
      WHERE c.task_id = ?
      ORDER BY c.position ASC, c.id ASC`,
    [taskId]
  );
  return rows.map((r) => ({
    ...r,
    is_checked: Boolean(r.is_checked),
    position: Number(r.position),
  }));
}

/**
 * @param {number} id
 */
async function findChecklistById(id) {
  const row = await queryOne(
    `SELECT id, task_id, title, is_checked, position, created_by, created_at, updated_at
       FROM task_checklists WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!row) return null;
  return {
    ...row,
    is_checked: Boolean(row.is_checked),
    position: Number(row.position),
  };
}

/**
 * @param {number} taskId
 */
async function getMaxChecklistPosition(taskId) {
  const row = await queryOne(
    'SELECT COALESCE(MAX(position), -1) AS max_pos FROM task_checklists WHERE task_id = ?',
    [taskId]
  );
  return Number(row?.max_pos ?? -1);
}

/**
 * @param {{task_id:number, title:string, position?:number, created_by?:number|null}} data
 */
async function createChecklist(data) {
  const { task_id, title, position = 0, created_by = null } = data;
  const result = await execute(
    `INSERT INTO task_checklists (task_id, title, position, created_by)
     VALUES (?, ?, ?, ?)`,
    [task_id, title, position, created_by]
  );
  return result.insertId;
}

/**
 * @param {number} id
 * @param {{title?:string, is_checked?:boolean, position?:number}} data
 */
async function updateChecklist(id, data) {
  const fields = [];
  const params = [];

  if (data.title !== undefined) {
    fields.push('title = ?');
    params.push(data.title);
  }
  if (data.is_checked !== undefined) {
    fields.push('is_checked = ?');
    params.push(data.is_checked ? 1 : 0);
  }
  if (data.position !== undefined) {
    fields.push('position = ?');
    params.push(data.position);
  }

  if (!fields.length) return 0;
  params.push(id);

  const result = await execute(
    `UPDATE task_checklists SET ${fields.join(', ')} WHERE id = ?`,
    params
  );
  return result.affectedRows;
}

/**
 * @param {number} id
 */
async function deleteChecklist(id) {
  const result = await execute('DELETE FROM task_checklists WHERE id = ?', [id]);
  return result.affectedRows;
}

module.exports = {
  // tasks
  listTasks,
  findTaskById,
  findTaskRaw,
  listProjectTasks,
  findProjectSummary,
  createTask,
  updateTask,
  deleteTask,
  getMaxPosition,
  listColumnTaskIds,
  reindexColumn,
  syncTaskProgress,
  listSubtasks,
  findParent,
  getGanttData,
  // labels
  listTaskLabels,
  attachLabels,
  syncTaskLabels,
  listLabels,
  findLabelById,
  findLabelByName,
  createLabel,
  updateLabel,
  deleteLabel,
  // comments
  listComments,
  createComment,
  findCommentById,
  deleteComment,
  // attachments
  listAttachments,
  createAttachment,
  findAttachmentById,
  deleteAttachment,
  // dependencies
  listDependencies,
  findDependencyById,
  findDependency,
  createDependency,
  deleteDependency,
  isReachable,
  listBlockedByEdges,
  // checklists
  listChecklists,
  findChecklistById,
  getMaxChecklistPosition,
  createChecklist,
  updateChecklist,
  deleteChecklist,
};

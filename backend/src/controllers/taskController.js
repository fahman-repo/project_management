'use strict';

const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/response');
const { getPagination, buildMeta } = require('../utils/pagination');
const { transaction } = require('../config/database');
const { KANBAN_COLUMNS, TASK_STATUS, DEPENDENCY_TYPES } = require('../config/constants');
const taskModel = require('../models/taskModel');
const projectModel = require('../models/projectModel');
const accessService = require('../services/accessService');
const progressService = require('../services/progressService');
const activityService = require('../services/activityService');
const notificationService = require('../services/notificationService');
const socketService = require('../services/socketService');

const { progressForStatus } = progressService;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Load a task or fail with 404.
 * @param {number} id
 */
async function loadTask(id) {
  const task = await taskModel.findTaskRaw(id);
  if (!task) throw ApiError.notFound('Task tidak ditemukan');
  return task;
}

/**
 * Load a task and assert the user may read it.
 * @param {{id:number, role:string}} user
 * @param {number} id
 */
async function loadViewableTask(user, id) {
  const task = await loadTask(id);
  const allowed = await accessService.canViewTask(user, task);
  if (!allowed) throw ApiError.forbidden('Anda tidak memiliki akses ke task ini');
  return task;
}

/**
 * Load a task and assert the user may modify it.
 * @param {{id:number, role:string}} user
 * @param {number} id
 */
async function loadEditableTask(user, id) {
  const task = await loadTask(id);
  const allowed = await accessService.canEditTask(user, task);
  if (!allowed) throw ApiError.forbidden('Anda tidak memiliki izin untuk mengubah task ini');
  return task;
}

/**
 * Validate a parent task: same project, not a sub-task itself, not the task itself.
 * @param {number} projectId
 * @param {number} parentId
 * @param {number} [selfId]
 */
async function assertValidParent(projectId, parentId, selfId = null) {
  if (parentId === null || parentId === undefined) return null;
  if (selfId !== null && Number(parentId) === Number(selfId)) {
    throw ApiError.badRequest('Task tidak dapat menjadi sub-task dari dirinya sendiri');
  }

  const parent = await taskModel.findTaskRaw(parentId);
  if (!parent) throw ApiError.badRequest('Parent task tidak ditemukan');
  if (Number(parent.project_id) !== Number(projectId)) {
    throw ApiError.badRequest('Parent task harus berada di proyek yang sama');
  }
  if (parent.parent_id) {
    throw ApiError.badRequest('Sub-task hanya boleh memiliki maksimal 2 level');
  }

  if (selfId !== null) {
    const children = await taskModel.listSubtasks(selfId);
    if (children.length) {
      throw ApiError.badRequest('Task yang memiliki sub-task tidak dapat dijadikan sub-task');
    }
  }

  return parent;
}

/**
 * Validate that the assignee is a member of the project.
 * @param {number} projectId
 * @param {number|null} assigneeId
 */
async function assertValidAssignee(projectId, assigneeId) {
  if (assigneeId === null || assigneeId === undefined) return;

  const isMember = await accessService.isProjectMember(projectId, assigneeId);
  if (!isMember) {
    throw ApiError.badRequest('Assignee harus menjadi anggota proyek terlebih dahulu');
  }
}

/**
 * Validate that all requested labels exist.
 * @param {number[]} labelIds
 */
async function assertValidLabels(labelIds) {
  if (!labelIds || !labelIds.length) return;

  const unique = [...new Set(labelIds)];
  const rows = await taskModel.listLabels();
  const existing = new Set(rows.map((label) => label.id));
  const missing = unique.filter((id) => !existing.has(id));
  if (missing.length) {
    throw ApiError.badRequest(`Label tidak ditemukan: ${missing.join(', ')}`);
  }
}

/**
 * Keep the derived `progress` of the task tree in sync and refresh the
 * project progress. Called after every task mutation.
 *
 * Leaf tasks take their progress from their status, parent tasks take the
 * average of their children - so a single UPDATE refreshes the whole tree.
 *
 * @param {number} projectId
 */
async function syncProgress(projectId) {
  await taskModel.syncTaskProgress(projectId);
  return progressService.recalculateProjectProgress(projectId);
}

/**
 * The position a task takes at the end of a column.
 * @param {number} projectId
 * @param {string} status
 */
async function nextPosition(projectId, status) {
  const max = await taskModel.getMaxPosition(projectId, status);
  return max + 1;
}

/**
 * Move a task inside a kanban column and renumber that column to 0, 1, 2 ...
 *
 * @param {object} task
 * @param {string} targetStatus
 * @param {number|null} targetPosition  null appends at the end of the column
 * @returns {Promise<number>} the resulting position of the task
 */
async function placeTaskInColumn(task, targetStatus, targetPosition) {
  const columnIds = await taskModel.listColumnTaskIds(task.project_id, targetStatus, task.id);
  const index =
    targetPosition === null || targetPosition === undefined
      ? columnIds.length
      : Math.max(0, Math.min(Number(targetPosition) || 0, columnIds.length));

  columnIds.splice(index, 0, task.id);
  await taskModel.reindexColumn(task.project_id, targetStatus, columnIds);
  return index;
}

/**
 * Build the socket payload of a task.
 * @param {number} taskId
 */
async function taskPayload(taskId) {
  return taskModel.findTaskById(taskId);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/tasks
 */
const listTasks = asyncHandler(async (req, res) => {
  const { page, perPage, offset } = getPagination(req.query);
  const {
    project_id: projectId,
    assignee_id: assigneeId,
    status,
    priority: priorities,
    label_id: labelId,
    parent_id: parentId,
    search,
    overdue,
    due_from: dueFrom,
    due_to: dueTo,
    sort,
    direction,
  } = req.query;

  const accessibleProjectIds = await accessService.accessibleProjectIds(req.user);

  const { rows, total } = await taskModel.listTasks({
    projectId,
    assigneeId,
    statuses: status,
    priorities,
    labelId,
    parentId,
    search,
    overdue,
    dueFrom,
    dueTo,
    sort,
    direction,
    limit: perPage,
    offset,
    userId: req.user.id,
    isAdmin: req.user.role === 'admin',
    accessibleProjectIds,
  });

  return sendPaginated(res, rows, buildMeta(total, page, perPage), 'Berhasil memuat daftar task');
});

/**
 * GET /api/v1/tasks/board
 */
const getBoard = asyncHandler(async (req, res) => {
  const { project_id: projectId } = req.query;

  const canView = await accessService.canViewProject(req.user, projectId);
  if (!canView) throw ApiError.forbidden('Anda tidak memiliki akses ke proyek ini');

  const project = await taskModel.findProjectSummary(projectId);
  if (!project) throw ApiError.notFound('Proyek tidak ditemukan');

  const [projectStatuses, tasks] = await Promise.all([
    projectModel.listProjectStatuses(projectId),
    taskModel.listProjectTasks(projectId),
  ]);

  const statusKeys = new Set(projectStatuses.map((s) => s.key_name));
  const columns = projectStatuses.map((column) => ({
    id: column.id,
    key: column.key_name,
    title: column.label,
    color: column.color,
    category: column.category,
    progress: column.progress,
    position: column.position,
    tasks: tasks.filter((task) => task.status === column.key_name),
  }));

  const orphanedTasks = tasks.filter((task) => !statusKeys.has(task.status));
  if (orphanedTasks.length > 0) {
    columns.push({
      id: 0,
      key: 'other',
      title: 'Lainnya',
      color: '#94a3b8',
      category: 'in_progress',
      progress: 0,
      position: 999,
      tasks: orphanedTasks,
    });
  }

  return sendSuccess(res, { project, columns }, 'Berhasil memuat papan kanban');
});

/**
 * POST /api/v1/tasks
 */
const createTask = asyncHandler(async (req, res) => {
  const {
    project_id: projectId,
    title,
    description,
    status = 'todo',
    priority = 'medium',
    assignee_id: assigneeId = null,
    start_date: startDate,
    due_date: dueDate,
    estimated_hours: estimatedHours,
    actual_hours: actualHours,
    estimated_cost: estimatedCost,
    actual_cost: actualCost,
    parent_id: parentId = null,
    label_ids: labelIds,
    is_milestone: isMilestone,
  } = req.body;

  const canView = await accessService.canViewProject(req.user, projectId);
  if (!canView) throw ApiError.forbidden('Anda tidak memiliki akses ke proyek ini');

  await assertValidParent(projectId, parentId);
  await assertValidAssignee(projectId, assigneeId);
  await assertValidLabels(labelIds);

  const position = await nextPosition(projectId, status);
  const statusRecord = await projectModel.findProjectStatusByKey(projectId, status);
  const progress = statusRecord ? Number(statusRecord.progress) : progressForStatus(status);
  const completedAt = (statusRecord ? statusRecord.category === 'done' : status === 'done') ? new Date() : null;

  const taskId = await transaction(async (connection) => {
    const newId = await taskModel.createTask(
      {
        project_id: projectId,
        parent_id: parentId,
        title,
        description: description || null,
        status,
        priority,
        assignee_id: assigneeId,
        reporter_id: req.user.id,
        start_date: startDate || null,
        due_date: dueDate || null,
        completed_at: completedAt,
        estimated_hours: estimatedHours ?? null,
        actual_hours: actualHours ?? null,
        estimated_cost: estimatedCost ?? 0,
        actual_cost: actualCost ?? 0,
        progress,
        position,
        is_milestone: isMilestone ? 1 : 0,
      },
      connection
    );
    if (labelIds && labelIds.length) {
      await taskModel.attachLabels(newId, labelIds, connection);
    }

    return newId;
  });

  await syncProgress(projectId);

  const task = await taskPayload(taskId);

  await activityService.record({
    userId: req.user.id,
    projectId,
    taskId,
    action: 'task.created',
    entityType: 'task',
    entityId: taskId,
    description: `${req.user.name} membuat task "${title}"`,
    metadata: { status, priority, assignee_id: assigneeId },
  });

  if (assigneeId) {
    await notificationService.notify({
      userId: assigneeId,
      type: 'task',
      title: 'Task baru ditugaskan',
      message: `${req.user.name} menugaskan Anda ke task "${title}"`,
      link: `/tasks?task=${taskId}`,
    });
  }

  socketService.emitTaskEvent(projectId, 'task:created', { task, projectId: Number(projectId) });

  return sendSuccess(res, { task }, 'Task berhasil dibuat');
});

/**
 * GET /api/v1/tasks/:id
 */
const getTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await loadViewableTask(req.user, id);

  const task = await taskModel.findTaskById(id);
  const [labels, subtasks, dependencies, comments, attachments] = await Promise.all([
    taskModel.listTaskLabels(id),
    taskModel.listSubtasks(id),
    taskModel.listDependencies(id),
    taskModel.listComments(id),
    taskModel.listAttachments(id),
  ]);

  const project = await taskModel.findProjectSummary(task.project_id);
  const parent = task.parent_id ? await taskModel.findParent(task.parent_id) : null;

  const assignee = task.assignee_id
    ? {
        id: task.assignee_id,
        name: task.assignee_name,
        avatar: task.assignee_avatar,
        email: task.assignee_email,
      }
    : null;

  const reporter = task.reporter_id
    ? { id: task.reporter_id, name: task.reporter_name }
    : null;

  const dependencyPayload = dependencies.map((dependency) => ({
    id: dependency.id,
    type: dependency.type,
    type_label: DEPENDENCY_TYPES[dependency.type] || dependency.type,
    depends_on: {
      id: dependency.depends_task_id,
      title: dependency.depends_title,
      status: dependency.depends_status,
    },
  }));

  return sendSuccess(
    res,
    {
      task,
      project,
      assignee,
      reporter,
      labels,
      subtasks,
      parent: parent ? { id: parent.id, title: parent.title, status: parent.status } : null,
      dependencies: dependencyPayload,
      comments,
      attachments,
    },
    'Berhasil memuat detail task'
  );
});

/**
 * PATCH /api/v1/tasks/:id
 */
const updateTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const task = await loadEditableTask(req.user, id);

  const payload = { ...req.body };
  const data = {};

  if (payload.title !== undefined) data.title = payload.title;
  if (payload.description !== undefined) data.description = payload.description;
  if (payload.priority !== undefined) data.priority = payload.priority;
  if (payload.start_date !== undefined) data.start_date = payload.start_date;
  if (payload.due_date !== undefined) data.due_date = payload.due_date;
  if (payload.estimated_hours !== undefined) data.estimated_hours = payload.estimated_hours;
  if (payload.actual_hours !== undefined) data.actual_hours = payload.actual_hours;
  if (payload.estimated_cost !== undefined) data.estimated_cost = payload.estimated_cost;
  if (payload.actual_cost !== undefined) data.actual_cost = payload.actual_cost;

  const statusChanged = payload.status !== undefined && payload.status !== task.status;
  const assigneeChanged =
    payload.assignee_id !== undefined && Number(payload.assignee_id) !== Number(task.assignee_id);

  if (payload.status !== undefined) {
    const statusRecord = await projectModel.findProjectStatusByKey(task.project_id, payload.status);
    data.status = payload.status;
    data.progress = statusRecord ? Number(statusRecord.progress) : progressForStatus(payload.status);
    data.completed_at = (statusRecord ? statusRecord.category === 'done' : payload.status === 'done')
      ? task.completed_at || new Date()
      : null;
  }

  if (payload.assignee_id !== undefined) {
    await assertValidAssignee(task.project_id, payload.assignee_id);
    data.assignee_id = payload.assignee_id;
  }

  if (payload.parent_id !== undefined) {
    await assertValidParent(task.project_id, payload.parent_id, task.id);
    data.parent_id = payload.parent_id;
  }

  if (payload.label_ids !== undefined) {
    await assertValidLabels(payload.label_ids);
  }

  await transaction(async (connection) => {
    await taskModel.updateTask(task.id, data, connection);
    if (payload.label_ids !== undefined) {
      await taskModel.syncTaskLabels(task.id, payload.label_ids, connection);
    }
  });

  if (statusChanged) {
    // The task left its old column - close the gap and append it to the new one.
    const oldColumn = await taskModel.listColumnTaskIds(task.project_id, task.status, task.id);
    await taskModel.reindexColumn(task.project_id, task.status, oldColumn);
    await placeTaskInColumn(task, payload.status, null);
  }

  await syncProgress(task.project_id);

  const updated = await taskPayload(task.id);

  if (statusChanged) {
    await activityService.record({
      userId: req.user.id,
      projectId: task.project_id,
      taskId: task.id,
      action: 'task.status_changed',
      entityType: 'task',
      entityId: task.id,
      description: `${req.user.name} mengubah status task "${task.title}" menjadi ${TASK_STATUS[payload.status]?.label || payload.status}`,
      metadata: { from: task.status, to: payload.status },
    });
  }

  if (assigneeChanged) {
    await activityService.record({
      userId: req.user.id,
      projectId: task.project_id,
      taskId: task.id,
      action: 'task.assigned',
      entityType: 'task',
      entityId: task.id,
      description: payload.assignee_id
        ? `${req.user.name} menugaskan task "${task.title}"`
        : `${req.user.name} menghapus assignee task "${task.title}"`,
      metadata: { from: task.assignee_id, to: payload.assignee_id },
    });

    if (payload.assignee_id) {
      await notificationService.notify({
        userId: payload.assignee_id,
        type: 'task',
        title: 'Task ditugaskan',
        message: `${req.user.name} menugaskan Anda ke task "${task.title}"`,
        link: `/tasks?task=${task.id}`,
      });
    }
  }

  await activityService.record({
    userId: req.user.id,
    projectId: task.project_id,
    taskId: task.id,
    action: 'task.updated',
    entityType: 'task',
    entityId: task.id,
    description: `${req.user.name} memperbarui task "${updated.title}"`,
    metadata: { fields: Object.keys(data) },
  });

  socketService.emitTaskEvent(task.project_id, 'task:updated', {
    task: updated,
    projectId: Number(task.project_id),
  });

  return sendSuccess(res, { task: updated }, 'Task berhasil diperbarui');
});

/**
 * DELETE /api/v1/tasks/:id
 */
const deleteTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const task = await loadEditableTask(req.user, id);

  await taskModel.deleteTask(task.id);

  await syncProgress(task.project_id);

  // `activities.task_id` cascades on task delete, so the audit trail is stored
  // without the task reference to survive the deletion.
  await activityService.record({
    userId: req.user.id,
    projectId: task.project_id,
    taskId: null,
    action: 'task.deleted',
    entityType: 'task',
    entityId: task.id,
    description: `${req.user.name} menghapus task "${task.title}"`,
    metadata: { title: task.title, status: task.status },
  });

  socketService.emitTaskEvent(task.project_id, 'task:deleted', {
    id: Number(task.id),
    projectId: Number(task.project_id),
  });

  return sendSuccess(res, null, 'Task berhasil dihapus');
});

/**
 * PATCH /api/v1/tasks/:id/status  (kanban drag & drop)
 */
const updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, position } = req.body;

  const task = await loadEditableTask(req.user, id);
  const from = task.status;

  const statusRecord = await projectModel.findProjectStatusByKey(task.project_id, status);
  const data = {
    status,
    progress: statusRecord ? Number(statusRecord.progress) : progressForStatus(status),
    completed_at: (statusRecord ? statusRecord.category === 'done' : status === 'done')
      ? task.completed_at || new Date()
      : null,
  };

  await taskModel.updateTask(task.id, data);

  if (from !== status) {
    // The task left its old column - close the gap there first.
    const oldColumn = await taskModel.listColumnTaskIds(task.project_id, from, task.id);
    await taskModel.reindexColumn(task.project_id, from, oldColumn);
  }

  if (position !== undefined && position !== null) {
    await placeTaskInColumn(task, status, position);
  } else if (from !== status) {
    // Moved to another column: append at the end of the target column.
    await placeTaskInColumn(task, status, null);
  }

  await syncProgress(task.project_id);

  const updated = await taskPayload(task.id);

  await activityService.record({
    userId: req.user.id,
    projectId: task.project_id,
    taskId: task.id,
    action: 'task.status_changed',
    entityType: 'task',
    entityId: task.id,
    description: `${req.user.name} memindahkan task "${task.title}" dari ${TASK_STATUS[from]?.label || from} ke ${TASK_STATUS[status]?.label || status}`,
    metadata: { from, to: status },
  });

  if (task.assignee_id) {
    await notificationService.notify({
      userId: task.assignee_id,
      type: 'task',
      title: 'Status task diperbarui',
      message: `Task "${task.title}" kini berstatus ${TASK_STATUS[status]?.label || status}`,
      link: `/tasks?task=${task.id}`,
    });
  }

  socketService.emitTaskEvent(task.project_id, 'task:moved', {
    task: updated,
    projectId: Number(task.project_id),
    from,
    to: status,
    position: updated.position,
  });

  return sendSuccess(res, { task: updated }, 'Status task berhasil diperbarui');
});

/**
 * PATCH /api/v1/tasks/:id/position
 */
const updatePosition = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, position } = req.body;

  const task = await loadEditableTask(req.user, id);
  const from = task.status;

  if (from !== status) {
    await taskModel.updateTask(task.id, {
      status,
      progress: progressForStatus(status),
      completed_at: status === 'done' ? task.completed_at || new Date() : null,
    });
    // The old column has a hole now - renumber it.
    const oldColumn = await taskModel.listColumnTaskIds(task.project_id, from, task.id);
    await taskModel.reindexColumn(task.project_id, from, oldColumn);
  }

  const index = await placeTaskInColumn(task, status, position);

  await syncProgress(task.project_id);

  const updated = await taskPayload(task.id);

  await activityService.record({
    userId: req.user.id,
    projectId: task.project_id,
    taskId: task.id,
    action: 'task.reordered',
    entityType: 'task',
    entityId: task.id,
    description: `${req.user.name} mengubah urutan task "${task.title}"`,
    metadata: { from, to: status, position: index },
  });

  socketService.emitTaskEvent(task.project_id, 'task:moved', {
    task: updated,
    projectId: Number(task.project_id),
    from,
    to: status,
    position: updated.position,
  });

  return sendSuccess(res, { task: updated }, 'Urutan task berhasil diperbarui');
});

/**
 * PATCH /api/v1/tasks/:id/assign
 */
const assignTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { assignee_id: assigneeId } = req.body;

  const task = await loadEditableTask(req.user, id);

  await assertValidAssignee(task.project_id, assigneeId);

  await taskModel.updateTask(task.id, { assignee_id: assigneeId });

  const updated = await taskPayload(task.id);

  await activityService.record({
    userId: req.user.id,
    projectId: task.project_id,
    taskId: task.id,
    action: 'task.assigned',
    entityType: 'task',
    entityId: task.id,
    description: assigneeId
      ? `${req.user.name} menugaskan task "${task.title}"`
      : `${req.user.name} menghapus assignee task "${task.title}"`,
    metadata: { from: task.assignee_id, to: assigneeId },
  });

  if (assigneeId) {
    await notificationService.notify({
      userId: assigneeId,
      type: 'task',
      title: 'Task ditugaskan',
      message: `${req.user.name} menugaskan Anda ke task "${task.title}"`,
        link: `/tasks?task=${task.id}`,
    });
  }

  socketService.emitTaskEvent(task.project_id, 'task:assigned', {
    task: updated,
    projectId: Number(task.project_id),
    assigneeId: assigneeId ? Number(assigneeId) : null,
  });

  return sendSuccess(res, { task: updated }, 'Assignee task berhasil diperbarui');
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/tasks/:id/comments
 */
const listComments = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await loadViewableTask(req.user, id);

  const comments = await taskModel.listComments(id);
  return sendSuccess(res, { comments }, 'Berhasil memuat komentar');
});

/**
 * POST /api/v1/tasks/:id/comments
 */
const createComment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { body } = req.body;

  const task = await loadViewableTask(req.user, id);

  const commentId = await taskModel.createComment(task.id, req.user.id, body);

  const comments = await taskModel.listComments(task.id);
  const comment = comments.find((item) => Number(item.id) === Number(commentId)) || null;

  await activityService.record({
    userId: req.user.id,
    projectId: task.project_id,
    taskId: task.id,
    action: 'task.commented',
    entityType: 'task',
    entityId: task.id,
    description: `${req.user.name} berkomentar pada task "${task.title}"`,
    metadata: { comment_id: commentId },
  });

  if (task.assignee_id && task.assignee_id !== req.user.id) {
    await notificationService.notify({
      userId: task.assignee_id,
      type: 'mention',
      title: 'Komentar baru',
      message: `${req.user.name} berkomentar pada task "${task.title}"`,
      link: `/tasks?task=${task.id}`,
    });
  }

  socketService.emitTaskEvent(task.project_id, 'task:commented', {
    taskId: Number(task.id),
    projectId: Number(task.project_id),
    comment,
  });

  return sendSuccess(res, { comment }, 'Komentar berhasil ditambahkan');
});

/**
 * DELETE /api/v1/tasks/:id/comments/:commentId
 */
const deleteComment = asyncHandler(async (req, res) => {
  const { id, commentId } = req.params;
  const task = await loadViewableTask(req.user, id);

  const comment = await taskModel.findCommentById(commentId);
  if (!comment || Number(comment.task_id) !== Number(task.id)) {
    throw ApiError.notFound('Komentar tidak ditemukan');
  }

  const isOwner = Number(comment.user_id) === Number(req.user.id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden('Anda hanya dapat menghapus komentar Anda sendiri');
  }

  await taskModel.deleteComment(comment.id);

  socketService.emitTaskEvent(task.project_id, 'task:comment_deleted', {
    taskId: Number(task.id),
    projectId: Number(task.project_id),
    commentId: Number(comment.id),
  });

  return sendSuccess(res, null, 'Komentar berhasil dihapus');
});

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/tasks/:id/attachments
 */
const listAttachments = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await loadViewableTask(req.user, id);

  const attachments = await taskModel.listAttachments(id);
  return sendSuccess(res, { attachments }, 'Berhasil memuat lampiran');
});

/**
 * POST /api/v1/tasks/:id/attachments  (multipart)
 */
const uploadAttachment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const task = await loadEditableTask(req.user, id);

  if (!req.file) throw ApiError.badRequest('File tidak ditemukan');

  const attachmentId = await taskModel.createAttachment({
    task_id: task.id,
    uploader_id: req.user.id,
    original_name: req.file.originalname,
    stored_name: req.file.filename,
    mime_type: req.file.mimetype,
    size: req.file.size,
  });

  const attachments = await taskModel.listAttachments(task.id);
  const attachment = attachments.find((item) => Number(item.id) === Number(attachmentId)) || null;

  await activityService.record({
    userId: req.user.id,
    projectId: task.project_id,
    taskId: task.id,
    action: 'task.attachment_added',
    entityType: 'task',
    entityId: task.id,
    description: `${req.user.name} mengunggah lampiran "${req.file.originalname}"`,
    metadata: { attachment_id: attachmentId, size: req.file.size },
  });

  if (task.assignee_id && task.assignee_id !== req.user.id) {
    await notificationService.notify({
      userId: task.assignee_id,
      type: 'task',
      title: 'Lampiran baru',
      message: `${req.user.name} mengunggah "${req.file.originalname}" pada task "${task.title}"`,
      link: `/tasks?task=${task.id}`,
    });
  }

  socketService.emitTaskEvent(task.project_id, 'task:attachment_added', {
    taskId: Number(task.id),
    projectId: Number(task.project_id),
    attachment,
  });

  return sendSuccess(res, { attachment }, 'Lampiran berhasil diunggah');
});

/**
 * DELETE /api/v1/tasks/:id/attachments/:attachmentId
 */
const deleteAttachment = asyncHandler(async (req, res) => {
  const { id, attachmentId } = req.params;
  const task = await loadEditableTask(req.user, id);

  const attachment = await taskModel.findAttachmentById(attachmentId);
  if (!attachment || Number(attachment.task_id) !== Number(task.id)) {
    throw ApiError.notFound('Lampiran tidak ditemukan');
  }

  await taskModel.deleteAttachment(attachment.id);

  try {
    await fs.promises.unlink(path.join(env.UPLOAD_PATH, attachment.stored_name));
  } catch (error) {
    // A missing file on disk must not fail the request.
  }

  await activityService.record({
    userId: req.user.id,
    projectId: task.project_id,
    taskId: task.id,
    action: 'task.attachment_removed',
    entityType: 'task',
    entityId: task.id,
    description: `${req.user.name} menghapus lampiran "${attachment.original_name}"`,
    metadata: { attachment_id: attachment.id },
  });

  socketService.emitTaskEvent(task.project_id, 'task:attachment_removed', {
    taskId: Number(task.id),
    projectId: Number(task.project_id),
    attachmentId: Number(attachment.id),
  });

  return sendSuccess(res, null, 'Lampiran berhasil dihapus');
});

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/tasks/:id/dependencies
 */
const listDependencies = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await loadViewableTask(req.user, id);

  const dependencies = await taskModel.listDependencies(id);
  const payload = dependencies.map((dependency) => ({
    id: dependency.id,
    type: dependency.type,
    type_label: DEPENDENCY_TYPES[dependency.type] || dependency.type,
    depends_on: {
      id: dependency.depends_task_id,
      title: dependency.depends_title,
      status: dependency.depends_status,
    },
  }));

  return sendSuccess(res, { dependencies: payload }, 'Berhasil memuat dependensi');
});

/**
 * POST /api/v1/tasks/:id/dependencies
 */
const createDependency = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { depends_on_id: dependsOnId, type, lag_days: lagDays = 0 } = req.body;

  const task = await loadEditableTask(req.user, id);

  if (Number(dependsOnId) === Number(task.id)) {
    throw ApiError.badRequest('Task tidak dapat bergantung pada dirinya sendiri');
  }

  const target = await taskModel.findTaskRaw(dependsOnId);
  if (!target) throw ApiError.badRequest('Task yang dirujuk tidak ditemukan');

  const existing = await taskModel.findDependency(task.id, dependsOnId);
  if (existing) throw ApiError.conflict('Dependensi sudah ada');

  // Cycle detection over the `blocked_by` graph.
  // A `blocked_by` edge means "task depends on depends_on"; a `blocks` edge is
  // the same relation written the other way round.
  const edges = await taskModel.listBlockedByEdges();
  const createsCycle =
    type === 'blocks'
      ? await taskModel.isReachable(task.id, dependsOnId, edges)
      : await taskModel.isReachable(dependsOnId, task.id, edges);

  if (createsCycle) {
    throw ApiError.badRequest('Circular dependency detected');
  }

  const dependencyId = await taskModel.createDependency(task.id, dependsOnId, type, lagDays);

  const dependencies = await taskModel.listDependencies(task.id);
  const dependency = dependencies.find((item) => Number(item.id) === Number(dependencyId)) || null;

  await activityService.record({
    userId: req.user.id,
    projectId: task.project_id,
    taskId: task.id,
    action: 'task.dependency_added',
    entityType: 'task',
    entityId: task.id,
    description: `${req.user.name} menambahkan dependensi pada task "${task.title}"`,
    metadata: { dependency_id: dependencyId, depends_on_id: dependsOnId, type, lag_days: lagDays },
  });

  socketService.emitTaskEvent(task.project_id, 'task:dependency_added', {
    taskId: Number(task.id),
    projectId: Number(task.project_id),
    dependency: dependency
      ? {
          id: dependency.id,
          type: dependency.type,
          lag_days: Number(dependency.lag_days || 0),
          depends_on: {
            id: dependency.depends_task_id,
            title: dependency.depends_title,
            status: dependency.depends_status,
          },
        }
      : null,
  });

  return sendSuccess(res, { dependency }, 'Dependensi berhasil ditambahkan');
});

/**
 * DELETE /api/v1/tasks/:id/dependencies/:dependencyId
 */
const deleteDependency = asyncHandler(async (req, res) => {
  const { id, dependencyId } = req.params;
  const task = await loadEditableTask(req.user, id);

  const dependency = await taskModel.findDependencyById(dependencyId);
  if (!dependency || Number(dependency.task_id) !== Number(task.id)) {
    throw ApiError.notFound('Dependensi tidak ditemukan');
  }

  await taskModel.deleteDependency(dependency.id);

  await activityService.record({
    userId: req.user.id,
    projectId: task.project_id,
    taskId: task.id,
    action: 'task.dependency_removed',
    entityType: 'task',
    entityId: task.id,
    description: `${req.user.name} menghapus dependensi pada task "${task.title}"`,
    metadata: { dependency_id: dependency.id, depends_on_id: dependency.depends_on_id },
  });

  socketService.emitTaskEvent(task.project_id, 'task:dependency_removed', {
    taskId: Number(task.id),
    projectId: Number(task.project_id),
    dependencyId: Number(dependency.id),
  });

  return sendSuccess(res, null, 'Dependensi berhasil dihapus');
});

/**
 * GET /api/v1/tasks/gantt
 */
const getGantt = asyncHandler(async (req, res) => {
  const { project_id: projectId } = req.query;

  const canView = await accessService.canViewProject(req.user, projectId);
  if (!canView) throw ApiError.forbidden('Anda tidak memiliki akses ke proyek ini');

  const project = await taskModel.findProjectSummary(projectId);
  if (!project) throw ApiError.notFound('Proyek tidak ditemukan');

  const ganttData = await taskModel.getGanttData(projectId);

  return sendSuccess(res, { project, ...ganttData }, 'Berhasil memuat data Gantt chart');
});

/**
 * PATCH /api/v1/tasks/:id/schedule
 */
const updateSchedule = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const task = await loadEditableTask(req.user, id);
  const { start_date: startDate, due_date: dueDate } = req.body;

  if (startDate && dueDate && startDate > dueDate) {
    throw ApiError.badRequest('Tanggal mulai tidak boleh lebih lambat dari batas waktu');
  }

  await taskModel.updateTask(task.id, {
    start_date: startDate ?? task.start_date,
    due_date: dueDate ?? task.due_date,
  });

  const updatedTask = await taskModel.findTaskById(task.id);

  await activityService.record({
    userId: req.user.id,
    projectId: task.project_id,
    taskId: task.id,
    action: 'task.schedule_updated',
    entityType: 'task',
    entityId: task.id,
    description: `${req.user.name} memperbarui jadwal task "${task.title}"`,
    metadata: { start_date: startDate, due_date: dueDate },
  });

  socketService.emitTaskEvent(task.project_id, 'task:updated', {
    task: updatedTask,
    projectId: Number(task.project_id),
  });

  return sendSuccess(res, { task: updatedTask }, 'Jadwal task berhasil diperbarui');
});

module.exports = {
  listTasks,
  getBoard,
  getGantt,
  createTask,
  getTask,
  updateTask,
  updateSchedule,
  deleteTask,
  updateStatus,
  updatePosition,
  assignTask,
  listComments,
  createComment,
  deleteComment,
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  listDependencies,
  createDependency,
  deleteDependency,
};

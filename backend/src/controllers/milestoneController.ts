'use strict';

import asyncHandler from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import ApiError from '../utils/ApiError';
import projectModel from '../models/projectModel';
import accessService from '../services/accessService';
import activityService from '../services/activityService';
import socketService from '../services/socketService';

/**
 * Load a milestone or throw a 404.
 * @param {any} id
 */
async function loadMilestone(id) {
  const milestone = await projectModel.findMilestoneById(id);
  if (!milestone) throw ApiError.notFound('Milestone tidak ditemukan');
  return milestone;
}

/**
 * Make sure the current user may read the milestone's project.
 * @param {{id:number, role:string}} user
 * @param {number} projectId
 */
async function assertCanView(user, projectId) {
  const allowed = await accessService.canViewProject(user, projectId);
  if (!allowed) throw ApiError.forbidden('Anda tidak memiliki akses ke proyek ini');
}

/**
 * Make sure the current user may administer the milestone's project.
 * @param {{id:number, role:string}} user
 * @param {number} projectId
 */
async function assertCanManage(user, projectId) {
  const allowed = await accessService.canManageProject(user, projectId);
  if (!allowed) throw ApiError.forbidden('Anda tidak memiliki izin untuk mengelola proyek ini');
}

/**
 * GET /api/v1/milestones
 */
const listMilestones = asyncHandler(async (req, res) => {
  const { project_id, status, from, to } = req.query;

  const milestones = await projectModel.listMilestones({
    projectId: project_id,
    status,
    from,
    to,
    viewerId: req.user.id,
    isAdmin: req.user.role === 'admin',
  });

  return sendSuccess(res, milestones, 'Berhasil memuat daftar milestone');
});

/**
 * POST /api/v1/milestones
 */
const createMilestone = asyncHandler(async (req, res) => {
  const { project_id, name, description, due_date, status, progress } = req.body;

  const project = await projectModel.findById(project_id);
  if (!project) throw ApiError.notFound('Proyek tidak ditemukan');

  await assertCanManage(req.user, project.id);

  const milestoneId = await projectModel.createMilestone({
    project_id: project.id,
    name,
    description: description || null,
    due_date: due_date || null,
    status,
    progress,
    created_by: req.user.id,
  });

  const milestone = await projectModel.findMilestoneById(milestoneId);

  await activityService.record({
    userId: req.user.id,
    projectId: project.id,
    action: 'milestone.created',
    entityType: 'milestone',
    entityId: milestoneId,
    description: `${req.user.name} membuat milestone ${name}`,
  });

  socketService.emitProjectEvent(project.id, 'milestone:created', { milestone });

  res.status(201);
  return sendSuccess(res, { milestone }, 'Milestone berhasil dibuat');
});

/**
 * GET /api/v1/milestones/:id
 */
const getMilestone = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const milestone = await loadMilestone(id);
  await assertCanView(req.user, milestone.project_id);

  return sendSuccess(res, { milestone }, 'Berhasil memuat milestone');
});

/**
 * PATCH /api/v1/milestones/:id
 */
const updateMilestone = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };

  const milestone = await loadMilestone(id);
  await assertCanManage(req.user, milestone.project_id);

  await projectModel.updateMilestone(milestone.id, payload);

  const updated = await projectModel.findMilestoneById(milestone.id);

  await activityService.record({
    userId: req.user.id,
    projectId: milestone.project_id,
    action: 'milestone.updated',
    entityType: 'milestone',
    entityId: milestone.id,
    description: `${req.user.name} memperbarui milestone ${updated.name}`,
    metadata: { fields: Object.keys(payload) },
  });

  socketService.emitProjectEvent(milestone.project_id, 'milestone:updated', { milestone: updated });

  return sendSuccess(res, { milestone: updated }, 'Milestone berhasil diperbarui');
});

/**
 * DELETE /api/v1/milestones/:id
 */
const deleteMilestone = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const milestone = await loadMilestone(id);
  await assertCanManage(req.user, milestone.project_id);

  await projectModel.deleteMilestone(milestone.id);

  await activityService.record({
    userId: req.user.id,
    projectId: milestone.project_id,
    action: 'milestone.deleted',
    entityType: 'milestone',
    entityId: milestone.id,
    description: `${req.user.name} menghapus milestone ${milestone.name}`,
  });

  socketService.emitProjectEvent(milestone.project_id, 'milestone:deleted', {
    milestoneId: milestone.id,
    projectId: milestone.project_id,
  });

  return sendSuccess(res, null, 'Milestone berhasil dihapus');
});

export { listMilestones };
export { createMilestone };
export { getMilestone };
export { updateMilestone };
export { deleteMilestone };

export default {
  listMilestones,
  createMilestone,
  getMilestone,
  updateMilestone,
  deleteMilestone
};

'use strict';

import asyncHandler from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import ApiError from '../utils/ApiError';
import templateModel from '../models/templateModel';

/**
 * GET /api/v1/templates
 */
const listTemplates = asyncHandler(async (req, res) => {
  const templates = await templateModel.listTemplates();
  return sendSuccess(res, templates, 'Berhasil memuat daftar template proyek');
});

/**
 * GET /api/v1/templates/:id
 */
const getTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const template = await templateModel.findTemplateById(id);
  if (!template) {
    throw ApiError.notFound('Template proyek tidak ditemukan');
  }
  return sendSuccess(res, template, 'Berhasil memuat detail template proyek');
});

/**
 * POST /api/v1/templates
 */
const createTemplate = asyncHandler(async (req, res) => {
  const { code, name, category, description, color, statuses, milestones, tasks, project_id } = req.body;

  const existing = await templateModel.findTemplateByCode(code);
  if (existing) {
    throw ApiError.conflict('Kode template tersebut sudah digunakan');
  }

  let templateId;
  if (project_id) {
    templateId = await templateModel.createTemplateFromProject(
      Number(project_id),
      { code, name, category, description, color },
      req.user.id
    );
  } else {
    templateId = await templateModel.createTemplate(
      { code, name, category, description, color, statuses, milestones, tasks },
      req.user.id
    );
  }

  const template = await templateModel.findTemplateById(templateId);
  res.status(201);
  return sendSuccess(res, template, 'Template proyek berhasil dibuat');
});

/**
 * DELETE /api/v1/templates/:id
 */
const deleteTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const template = await templateModel.findTemplateById(id);
  if (!template) {
    throw ApiError.notFound('Template proyek tidak ditemukan');
  }

  if (template.is_system) {
    throw ApiError.forbidden('Template bawaan sistem tidak dapat dihapus');
  }

  await templateModel.deleteTemplate(id);
  return sendSuccess(res, null, 'Template proyek berhasil dihapus');
});

export { listTemplates };
export { getTemplate };
export { createTemplate };
export { deleteTemplate };

export default {
  listTemplates,
  getTemplate,
  createTemplate,
  deleteTemplate
};


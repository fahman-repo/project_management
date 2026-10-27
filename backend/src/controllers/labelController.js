'use strict';

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const taskModel = require('../models/taskModel');

/**
 * GET /api/v1/labels
 */
const listLabels = asyncHandler(async (req, res) => {
  const labels = await taskModel.listLabels();
  return sendSuccess(res, { labels }, 'Berhasil memuat daftar label');
});

/**
 * POST /api/v1/labels
 */
const createLabel = asyncHandler(async (req, res) => {
  const { name, color } = req.body;

  const existing = await taskModel.findLabelByName(name);
  if (existing) throw ApiError.conflict('Label dengan nama tersebut sudah ada');

  const labelId = await taskModel.createLabel({ name, color });
  const label = await taskModel.findLabelById(labelId);

  return sendSuccess(res, { label }, 'Label berhasil dibuat');
});

/**
 * PATCH /api/v1/labels/:id
 */
const updateLabel = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };

  const label = await taskModel.findLabelById(id);
  if (!label) throw ApiError.notFound('Label tidak ditemukan');

  if (payload.name !== undefined && payload.name !== label.name) {
    const existing = await taskModel.findLabelByName(payload.name);
    if (existing) throw ApiError.conflict('Label dengan nama tersebut sudah ada');
  }

  await taskModel.updateLabel(label.id, payload);
  const updated = await taskModel.findLabelById(label.id);

  return sendSuccess(res, { label: updated }, 'Label berhasil diperbarui');
});

/**
 * DELETE /api/v1/labels/:id
 */
const deleteLabel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const label = await taskModel.findLabelById(id);
  if (!label) throw ApiError.notFound('Label tidak ditemukan');

  await taskModel.deleteLabel(label.id);

  return sendSuccess(res, null, 'Label berhasil dihapus');
});

module.exports = { listLabels, createLabel, updateLabel, deleteLabel };

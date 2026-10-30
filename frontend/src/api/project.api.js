import api from './client';

/**
 * Project endpoints.
 */
export const projectApi = {
  /**
   * @param {object} params
   */
  list: (params) => api.get('/projects', { params }).then((res) => res.data),

  /**
   * @param {number} id
   */
  get: (id) => api.get(`/projects/${id}`).then((res) => res.data.data),

  /**
   * @param {object} payload
   */
  create: (payload) => api.post('/projects', payload).then((res) => res.data.data),

  /**
   * @param {number} id
   * @param {object} payload
   */
  update: (id, payload) => api.patch(`/projects/${id}`, payload).then((res) => res.data.data),

  /**
   * @param {number} id
   */
  remove: (id) => api.delete(`/projects/${id}`).then((res) => res.data.data),

  /**
   * @param {number} id
   */
  overview: (id) => api.get(`/projects/${id}/overview`).then((res) => res.data.data),

  /**
   * @param {number} id
   */
  members: (id) => api.get(`/projects/${id}/members`).then((res) => res.data.data),

  /**
   * @param {number} id
   * @param {object} payload
   */
  addMember: (id, payload) =>
    api.post(`/projects/${id}/members`, payload).then((res) => res.data.data),

  /**
   * @param {number} id
   * @param {number} userId
   * @param {object} payload
   */
  updateMember: (id, userId, payload) =>
    api.patch(`/projects/${id}/members/${userId}`, payload).then((res) => res.data.data),

  /**
   * @param {number} id
   * @param {number} userId
   */
  removeMember: (id, userId) =>
    api.delete(`/projects/${id}/members/${userId}`).then((res) => res.data.data),

  /**
   * @param {number} id
   */
  milestones: (id) => api.get(`/projects/${id}/milestones`).then((res) => res.data.data),

  /**
   * Custom workflow statuses of a project.
   * @param {number} id
   */
  statuses: (id) => api.get(`/projects/${id}/statuses`).then((res) => res.data.data),

  /**
   * Create a custom workflow status for a project.
   * @param {number} id
   * @param {object} payload
   */
  createStatus: (id, payload) =>
    api.post(`/projects/${id}/statuses`, payload).then((res) => res.data.data),

  /**
   * Update a custom workflow status.
   * @param {number} id
   * @param {number} statusId
   * @param {object} payload
   */
  updateStatus: (id, statusId, payload) =>
    api.patch(`/projects/${id}/statuses/${statusId}`, payload).then((res) => res.data.data),

  /**
   * Reorder workflow statuses.
   * @param {number} id
   * @param {number[]} orderedIds
   */
  reorderStatuses: (id, orderedIds) =>
    api.put(`/projects/${id}/statuses/reorder`, { ordered_ids: orderedIds }).then((res) => res.data.data),

  /**
   * Remove a workflow status.
   * @param {number} id
   * @param {number} statusId
   * @param {{transfer_to_key?: string}} [params]
   */
  removeStatus: (id, statusId, params) =>
    api.delete(`/projects/${id}/statuses/${statusId}`, { params }).then((res) => res.data.data),

  /**
   * Save an existing project structure as a reusable template.
   * @param {number} id
   * @param {object} payload
   */
  saveAsTemplate: (id, payload) =>
    api.post(`/projects/${id}/save-template`, payload).then((res) => res.data.data),

  /**
   * List expenses and budget financials for a project.
   * @param {number} id
   * @param {object} [params]
   */
  expenses: (id, params) =>
    api.get(`/projects/${id}/expenses`, { params }).then((res) => res.data.data),

  /**
   * Create an expense entry for a project.
   * @param {number} id
   * @param {object|FormData} payload
   */
  createExpense: (id, payload) => {
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    return api
      .post(`/projects/${id}/expenses`, payload, {
        headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
      })
      .then((res) => res.data.data);
  },

  /**
   * Update an expense entry.
   * @param {number} id
   * @param {number} expenseId
   * @param {object|FormData} payload
   */
  updateExpense: (id, expenseId, payload) => {
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    return api
      .patch(`/projects/${id}/expenses/${expenseId}`, payload, {
        headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
      })
      .then((res) => res.data.data);
  },

  /**
   * Update expense approval status.
   * @param {number} id
   * @param {number} expenseId
   * @param {{status: 'approved'|'rejected', rejection_reason?: string}} payload
   */
  updateExpenseStatus: (id, expenseId, payload) =>
    api
      .patch(`/projects/${id}/expenses/${expenseId}/status`, payload)
      .then((res) => res.data.data),

  /**
   * Delete an expense entry.
   * @param {number} id
   * @param {number} expenseId
   */
  removeExpense: (id, expenseId) =>
    api.delete(`/projects/${id}/expenses/${expenseId}`).then((res) => res.data.data),

  /**
   * List risks and issues for a project.
   * @param {number} id
   * @param {object} [params]
   */
  risks: (id, params) =>
    api.get(`/projects/${id}/risks`, { params }).then((res) => res.data.data),

  /**
   * Create a risk or issue for a project.
   * @param {number} id
   * @param {object} payload
   */
  createRisk: (id, payload) =>
    api.post(`/projects/${id}/risks`, payload).then((res) => res.data.data),

  /**
   * Update a risk or issue.
   * @param {number} id
   * @param {number} riskId
   * @param {object} payload
   */
  updateRisk: (id, riskId, payload) =>
    api.patch(`/projects/${id}/risks/${riskId}`, payload).then((res) => res.data.data),

  /**
   * Delete a risk or issue.
   * @param {number} id
   * @param {number} riskId
   */
  removeRisk: (id, riskId) =>
    api.delete(`/projects/${id}/risks/${riskId}`).then((res) => res.data.data),

  /**
   * List documents & wiki items for a project.
   * @param {number} id
   * @param {object} [params]
   */
  documents: (id, params) =>
    api.get(`/projects/${id}/documents`, { params }).then((res) => res.data.data),

  /**
   * Get single document detail with version history.
   * @param {number} id
   * @param {number} docId
   */
  getDocument: (id, docId) =>
    api.get(`/projects/${id}/documents/${docId}`).then((res) => res.data.data),

  /**
   * Create a document or wiki item for a project.
   * @param {number} id
   * @param {object|FormData} payload
   */
  createDocument: (id, payload) => {
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    return api
      .post(`/projects/${id}/documents`, payload, {
        headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
      })
      .then((res) => res.data.data);
  },

  /**
   * Update a document (creates a new version if content/file changed).
   * @param {number} id
   * @param {number} docId
   * @param {object|FormData} payload
   */
  updateDocument: (id, docId, payload) => {
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    return api
      .patch(`/projects/${id}/documents/${docId}`, payload, {
        headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
      })
      .then((res) => res.data.data);
  },

  /**
   * Restore a document to a previous version snapshot.
   * @param {number} id
   * @param {number} docId
   * @param {number} versionId
   * @param {{change_note?: string}} [payload]
   */
  restoreDocumentVersion: (id, docId, versionId, payload = {}) =>
    api
      .post(`/projects/${id}/documents/${docId}/versions/${versionId}/restore`, payload)
      .then((res) => res.data.data),

  /**
   * Delete a document and its version history.
   * @param {number} id
   * @param {number} docId
   */
  removeDocument: (id, docId) =>
    api.delete(`/projects/${id}/documents/${docId}`).then((res) => res.data.data),

  /**
   * Lightweight counters for the topbar.
   */
  summary: () => api.get('/projects/stats/summary').then((res) => res.data.data),
};

export default projectApi;

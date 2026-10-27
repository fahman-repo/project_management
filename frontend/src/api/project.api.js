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
   * @param {object} payload
   */
  createExpense: (id, payload) =>
    api.post(`/projects/${id}/expenses`, payload).then((res) => res.data.data),

  /**
   * Update an expense entry.
   * @param {number} id
   * @param {number} expenseId
   * @param {object} payload
   */
  updateExpense: (id, expenseId, payload) =>
    api.patch(`/projects/${id}/expenses/${expenseId}`, payload).then((res) => res.data.data),

  /**
   * Delete an expense entry.
   * @param {number} id
   * @param {number} expenseId
   */
  removeExpense: (id, expenseId) =>
    api.delete(`/projects/${id}/expenses/${expenseId}`).then((res) => res.data.data),

  /**
   * Lightweight counters for the topbar.
   */
  summary: () => api.get('/projects/stats/summary').then((res) => res.data.data),
};

export default projectApi;

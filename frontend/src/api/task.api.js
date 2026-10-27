import api from './client';

/**
 * Task endpoints.
 */
export const taskApi = {
  /**
   * @param {object} params
   */
  list: (params) => api.get('/tasks', { params }).then((res) => res.data),

  /**
   * @param {number} id
   */
  get: (id) => api.get(`/tasks/${id}`).then((res) => res.data.data),

  /**
   * @param {object} payload
   */
  create: (payload) => api.post('/tasks', payload).then((res) => res.data.data),

  /**
   * @param {number} id
   * @param {object} payload
   */
  update: (id, payload) => api.patch(`/tasks/${id}`, payload).then((res) => res.data.data),

  /**
   * @param {number} id
   */
  remove: (id) => api.delete(`/tasks/${id}`).then((res) => res.data.data),

  /**
   * @param {number} id
   * @param {string} status
   */
  updateStatus: (id, status) =>
    api.patch(`/tasks/${id}/status`, { status }).then((res) => res.data.data),

  /**
   * @param {number} id
   * @param {string} status
   * @param {number} position
   */
  updatePosition: (id, status, position) =>
    api.patch(`/tasks/${id}/position`, { status, position }).then((res) => res.data.data),

  /**
   * @param {number} id
   * @param {number|null} assigneeId
   */
  assign: (id, assigneeId) =>
    api.patch(`/tasks/${id}/assign`, { assignee_id: assigneeId }).then((res) => res.data.data),

  /**
   * @param {number} projectId
   */
  board: (projectId) =>
    api.get('/tasks/board', { params: { project_id: projectId } }).then((res) => res.data.data),

  /**
   * Gantt chart data (tasks, milestones, dependencies).
   * @param {number} projectId
   */
  gantt: (projectId) =>
    api.get('/tasks/gantt', { params: { project_id: projectId } }).then((res) => res.data.data),

  /**
   * Update start and due dates of a task.
   * @param {number} id
   * @param {object} payload
   */
  updateSchedule: (id, payload) =>
    api.patch(`/tasks/${id}/schedule`, payload).then((res) => res.data.data),

  /**
   * @param {number} id
   */
  comments: (id) => api.get(`/tasks/${id}/comments`).then((res) => res.data.data),

  /**
   * @param {number} id
   * @param {string} body
   */
  addComment: (id, body) =>
    api.post(`/tasks/${id}/comments`, { body }).then((res) => res.data.data),

  /**
   * @param {number} id
   * @param {number} commentId
   */
  removeComment: (id, commentId) =>
    api.delete(`/tasks/${id}/comments/${commentId}`).then((res) => res.data.data),

  /**
   * @param {number} id
   */
  attachments: (id) => api.get(`/tasks/${id}/attachments`).then((res) => res.data.data),

  /**
   * @param {number} id
   * @param {File} file
   */
  uploadAttachment: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post(`/tasks/${id}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((res) => res.data.data);
  },

  /**
   * @param {number} id
   * @param {number} attachmentId
   */
  removeAttachment: (id, attachmentId) =>
    api.delete(`/tasks/${id}/attachments/${attachmentId}`).then((res) => res.data.data),

  /**
   * @param {number} id
   */
  dependencies: (id) => api.get(`/tasks/${id}/dependencies`).then((res) => res.data.data),

  /**
   * @param {number} id
   * @param {object} payload
   */
  addDependency: (id, payload) =>
    api.post(`/tasks/${id}/dependencies`, payload).then((res) => res.data.data),

  /**
   * @param {number} id
   * @param {number} dependencyId
   */
  removeDependency: (id, dependencyId) =>
    api.delete(`/tasks/${id}/dependencies/${dependencyId}`).then((res) => res.data.data),
};

export default taskApi;

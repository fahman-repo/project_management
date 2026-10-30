import api from './client';

/**
 * Dashboard endpoints.
 */
export const dashboardApi = {
  stats: () => api.get('/dashboard/stats').then((res) => res.data.data),
  myTasks: () => api.get('/dashboard/my-tasks').then((res) => res.data.data),
  projectProgress: () => api.get('/dashboard/project-progress').then((res) => res.data.data),
  workload: () => api.get('/dashboard/workload').then((res) => res.data.data),
  capacityHeatmap: (params) =>
    api.get('/dashboard/capacity-heatmap', { params }).then((res) => res.data.data),
};

/**
 * Report endpoints.
 */
export const reportApi = {
  overview: (params) => api.get('/reports/overview', { params }).then((res) => res.data.data),
  statusDistribution: (params) =>
    api.get('/reports/status-distribution', { params }).then((res) => res.data.data),
  productivity: (params) => api.get('/reports/productivity', { params }).then((res) => res.data.data),
  burndown: (params) => api.get('/reports/burndown', { params }).then((res) => res.data.data),
  evm: (params) => api.get('/reports/evm', { params }).then((res) => res.data.data),
  executive: (params) => api.get('/reports/executive', { params }).then((res) => res.data.data),
  completionTrend: (params) =>
    api.get('/reports/completion-trend', { params }).then((res) => res.data.data),

  /**
   * Download a CSV report. Returns a Blob so the browser can save it.
   * @param {'tasks'|'projects'} type
   * @param {object} [params]
   */
  exportCsv: async (type, params = {}) => {
    const response = await api.get('/reports/export', {
      params: { type, ...params },
      responseType: 'blob',
    });
    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  },
};

/**
 * Calendar endpoints.
 */
export const calendarApi = {
  /**
   * @param {{from:string, to:string, project_id?:number}} params
   */
  events: (params) => api.get('/calendar/events', { params }).then((res) => res.data.data),
};

/**
 * Notification endpoints.
 */
export const notificationApi = {
  /**
   * @param {object} params
   */
  list: (params) => api.get('/notifications', { params }).then((res) => res.data.data),
  markRead: (id) => api.patch(`/notifications/${id}/read`).then((res) => res.data.data),
  markAllRead: () => api.patch('/notifications/read-all').then((res) => res.data.data),
  remove: (id) => api.delete(`/notifications/${id}`).then((res) => res.data.data),
  clearRead: () => api.delete('/notifications').then((res) => res.data.data),
};

/**
 * Activity log endpoints.
 */
export const activityApi = {
  /**
   * @param {object} params
   */
  list: (params) => api.get('/activities', { params }).then((res) => res.data),
  actions: () => api.get('/activities/actions').then((res) => res.data.data),
};

/**
 * User management endpoints.
 */
export const userApi = {
  /**
   * @param {object} params
   */
  list: (params) => api.get('/users', { params }).then((res) => res.data),
  active: (params) => api.get('/users/active', { params }).then((res) => res.data.data),
  get: (id) => api.get(`/users/${id}`).then((res) => res.data.data),
  create: (payload) => api.post('/users', payload).then((res) => res.data.data),
  update: (id, payload) => api.patch(`/users/${id}`, payload).then((res) => res.data.data),
  remove: (id) => api.delete(`/users/${id}`).then((res) => res.data.data),
};

/**
 * Milestone endpoints.
 */
export const milestoneApi = {
  /**
   * @param {object} params
   */
  list: (params) => api.get('/milestones', { params }).then((res) => res.data.data),
  create: (payload) => api.post('/milestones', payload).then((res) => res.data.data),
  update: (id, payload) => api.patch(`/milestones/${id}`, payload).then((res) => res.data.data),
  remove: (id) => api.delete(`/milestones/${id}`).then((res) => res.data.data),
};

/**
 * Label endpoints.
 */
export { templateApi } from './template.api';
export { projectApi } from './project.api';
export { taskApi } from './task.api';
export { authApi } from './auth.api';

export const labelApi = {
  list: () => api.get('/labels').then((res) => res.data.data),
  create: (payload) => api.post('/labels', payload).then((res) => res.data.data),
  update: (id, payload) => api.patch(`/labels/${id}`, payload).then((res) => res.data.data),
  remove: (id) => api.delete(`/labels/${id}`).then((res) => res.data.data),
};

/**
 * Global Search endpoint (Ctrl+K).
 */
export const searchApi = {
  /**
   * @param {{q:string, limit?:number}} params
   */
  global: (params) => api.get('/search', { params }).then((res) => res.data.data),
};

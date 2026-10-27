import api from './client';

/**
 * Template endpoints.
 */
export const templateApi = {
  /**
   * @param {object} [params]
   */
  list: (params) => api.get('/templates', { params }).then((res) => res.data.data),

  /**
   * @param {number|string} id
   */
  get: (id) => api.get(`/templates/${id}`).then((res) => res.data.data),

  /**
   * @param {object} payload
   */
  create: (payload) => api.post('/templates', payload).then((res) => res.data.data),

  /**
   * @param {number|string} id
   */
  remove: (id) => api.delete(`/templates/${id}`).then((res) => res.data.data),
};

export default templateApi;


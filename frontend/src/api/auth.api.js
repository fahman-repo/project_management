import api from './client';

/**
 * Authentication endpoints.
 */
export const authApi = {
  /**
   * @param {{email:string, password:string}} credentials
   */
  login: (credentials) => api.post('/auth/login', credentials).then((res) => res.data.data),

  /**
   * @param {{name:string, email:string, password:string, job_title?:string}} payload
   */
  register: (payload) => api.post('/auth/register', payload).then((res) => res.data.data),

  logout: () => api.post('/auth/logout').then((res) => res.data.data),

  me: () => api.get('/auth/me').then((res) => res.data.data),

  changePassword: (payload) =>
    api.patch('/auth/password', payload).then((res) => res.data.data),

  updateProfile: (payload) => api.patch('/auth/profile', payload).then((res) => res.data.data),

  /**
   * @param {File} file
   */
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('avatar', file);
    return api
      .patch('/auth/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((res) => res.data.data);
  },

  /**
   * @param {string} email
   */
  checkEmail: (email) =>
    api.get('/auth/email-check', { params: { email } }).then((res) => res.data.data),

  /**
   * Fetch demo accounts and default password from the database.
   */
  getDemoAccounts: () => api.get('/auth/demo-accounts').then((res) => res.data.data),
};

export default authApi;

/**
 * API Client — Axios instance with JWT auth
 */

import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('kuralai_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('kuralai_token');
      localStorage.removeItem('kuralai_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (email, password) => api.post('/api/auth/login', { email, password }),
};

export const callsApi = {
  list: (params) => api.get('/api/calls', { params }),
  getStatus: (callId) => api.get(`/api/calls/${callId}/status`),
  initiate: (toPhone, metadata, maxRetries) =>
    api.post('/api/calls/initiate', { toPhone, metadata, maxRetries }),
  bulk: (phones, metadata, delayMs = 2500) =>
    api.post('/api/calls/bulk', { phones, metadata, delayMs }),
  retry: (callId) => api.post(`/api/calls/${callId}/retry`),
  recentCalls: (limit) => api.get('/api/dashboard/recent-calls', { params: { limit } }),
};

export const callsListApi = {
  list: (params) => api.get('/api/calls', { params }),
  exportCsv: (params) => api.get('/api/calls/export', { params, responseType: 'blob' }),
};

export const transcriptsApi = {
  get: (callId) => api.get(`/api/transcripts/${callId}`),
};

export const logsApi = {
  get: (callId) => api.get(`/api/logs/${callId}`),
};

export const dashboardApi = {
  stats: (days = 7) => api.get('/api/dashboard/stats', { params: { days } }),
  intents: (days = 7) => api.get('/api/dashboard/intents', { params: { days } }),
  timeline: (days = 14) => api.get('/api/dashboard/calls/timeline', { params: { days } }),
  recentCalls: (limit = 10) => api.get('/api/dashboard/recent-calls', { params: { limit } }),
};

export const usersApi = {
  list: () => api.get('/api/users'),
  create: (data) => api.post('/api/users', data),
  update: (id, data) => api.put(`/api/users/${id}`, data),
  remove: (id) => api.delete(`/api/users/${id}`),
};

export const settingsApi = {
  get: () => api.get('/api/settings'),
  update: (data) => api.put('/api/settings', data),
};

export const workflowsApi = {
  list: () => api.get('/api/workflows'),
  create: (data) => api.post('/api/workflows', data),
  update: (id, data) => api.put(`/api/workflows/${id}`, data),
  remove: (id) => api.delete(`/api/workflows/${id}`),
};

export const ttsApi = {
  preview: (text, voice) =>
    api.post('/api/tts/preview', { text, voice }, { responseType: 'arraybuffer', timeout: 25000 }),
};

export const customersApi = {
  list:   ()         => api.get('/api/customers'),
  get:    (id)       => api.get(`/api/customers/${id}`),
  create: (data)     => api.post('/api/customers', data),
  update: (id, data) => api.put(`/api/customers/${id}`, data),
  remove: (id)       => api.delete(`/api/customers/${id}`),
  setPreference:   (id, key, value) => api.patch(`/api/customers/${id}/preferences`, { key, value }),
  clearPreference: (id, key)        => api.delete(`/api/customers/${id}/preferences/${key}`),
};

export const simulateApi = {
  start: (workflowId, customerId) =>
    api.post('/api/simulate/start', { workflowId, customerId }, { timeout: 30000 }),
  turn: (callId, turn, userText) =>
    api.post('/api/simulate/turn', { callId, turn, userText }, { timeout: 30000 }),
  end: (callId) => api.post('/api/simulate/end', { callId }),
  transcribe: (audioBlob) => {
    const form = new FormData();
    const ext = audioBlob.type.includes('mp4') ? 'mp4'
              : audioBlob.type.includes('ogg') ? 'ogg'
              : audioBlob.type.includes('wav') ? 'wav' : 'webm';
    form.append('audio', audioBlob, `recording.${ext}`);
    return api.post('/api/simulate/transcribe', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
  },
};

export const campaignsApi = {
  list: (params) => api.get('/api/campaigns', { params }),
  get: (id) => api.get(`/api/campaigns/${id}`),
  create: (data) => api.post('/api/campaigns', data),
  update: (id, data) => api.put(`/api/campaigns/${id}`, data),
  remove: (id) => api.delete(`/api/campaigns/${id}`),
  start: (id) => api.post(`/api/campaigns/${id}/start`),
  pause: (id) => api.post(`/api/campaigns/${id}/pause`),
  resume: (id) => api.post(`/api/campaigns/${id}/resume`),
  reportSummary: (days) => api.get('/api/campaigns/reports/summary', { params: { days } }),
};

export const crmApi = {
  getConfig: () => api.get('/api/crm/config'),
  saveConfig: (data) => api.put('/api/crm/config', data),
  fetchCustomers: (opts) => api.post('/api/crm/fetch-customers', opts || {}, { timeout: 45000 }),
  getCalls: (params) => api.get('/api/crm/calls', { params }),
  pushRecording: (callId, opts) => api.post(`/api/crm/push-recording/${callId}`, opts || {}, { timeout: 20000 }),
  pushAll: (opts) => api.post('/api/crm/push-all', opts || {}, { timeout: 120000 }),
};

export const apiConfigApi = {
  status: () => api.get('/api/api-config/status'),
  test: (serviceId) => api.post(`/api/api-config/test/${serviceId}`, {}, { timeout: 30000 }),
};

export const templatesApi = {
  listQa:          ()        => api.get('/api/templates/qa'),
  createQa:        (data)    => api.post('/api/templates/qa', data),
  updateQa:        (id, data) => api.put(`/api/templates/qa/${id}`, data),
  deleteQa:        (id)      => api.delete(`/api/templates/qa/${id}`),

  listPrompts:     ()        => api.get('/api/templates/prompts'),
  createPrompt:    (data)    => api.post('/api/templates/prompts', data),
  updatePrompt:    (id, data) => api.put(`/api/templates/prompts/${id}`, data),
  deletePrompt:    (id)      => api.delete(`/api/templates/prompts/${id}`),
};

export const superadminApi = {
  dashboard: () => api.get('/api/superadmin/dashboard'),
  organizations: () => api.get('/api/superadmin/organizations'),
  getOrg: (id) => api.get(`/api/superadmin/organizations/${id}`),
  createOrg: (data) => api.post('/api/superadmin/organizations', data),
  updateOrg: (id, data) => api.put(`/api/superadmin/organizations/${id}`, data),
  assignPlan: (orgId, planId) => api.post(`/api/superadmin/organizations/${orgId}/assign-plan`, { planId }),
  addCredits: (orgId, minutes, description) => api.post(`/api/superadmin/organizations/${orgId}/add-credits`, { minutes, description }),
  createOrgUser: (orgId, data) => api.post(`/api/superadmin/organizations/${orgId}/create-user`, data),
  updateModules: (orgId, modules) => api.put(`/api/superadmin/organizations/${orgId}/modules`, { modules }),
  plans: () => api.get('/api/superadmin/plans'),
  createPlan: (data) => api.post('/api/superadmin/plans', data),
  updatePlan: (id, data) => api.put(`/api/superadmin/plans/${id}`, data),
  usage: (params) => api.get('/api/superadmin/usage', { params }),
  usageExport: (params) => api.get('/api/superadmin/usage/export', { params, responseType: 'blob' }),
};

export const paymentsApi = {
  plans: () => api.get('/api/payments/plans'),
  createOrder: (data) => api.post('/api/payments/create-order', data),
  verify: (data) => api.post('/api/payments/verify', data),
  balance: () => api.get('/api/payments/balance'),
  transactions: (params) => api.get('/api/payments/transactions', { params }),
  subscription: () => api.get('/api/payments/subscription'),
};

export default api;

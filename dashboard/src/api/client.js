/**
 * API Client
 * Axios instance with JWT auth, base URL, and error handling.
 */

import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('kuralai_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('kuralai_token');
      localStorage.removeItem('kuralai_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Auth ───────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email, password) => api.post('/api/auth/login', { email, password }),
};

// ── Calls ──────────────────────────────────────────────────────────────────────
export const callsApi = {
  list: (params) => api.get('/api/calls', { params }),
  getStatus: (callId) => api.get(`/api/calls/${callId}/status`),
  initiate: (toPhone, metadata, maxRetries) =>
    api.post('/api/calls/initiate', { toPhone, metadata, maxRetries }),
  retry: (callId) => api.post(`/api/calls/${callId}/retry`),
};

// ── Transcripts ────────────────────────────────────────────────────────────────
export const transcriptsApi = {
  get: (callId) => api.get(`/api/transcripts/${callId}`),
};

// ── Logs ───────────────────────────────────────────────────────────────────────
export const logsApi = {
  get: (callId) => api.get(`/api/logs/${callId}`),
};

// ── Dashboard ──────────────────────────────────────────────────────────────────
export const dashboardApi = {
  stats: (days = 7) => api.get('/api/dashboard/stats', { params: { days } }),
  intents: (days = 7) => api.get('/api/dashboard/intents', { params: { days } }),
  timeline: (days = 14) => api.get('/api/dashboard/calls/timeline', { params: { days } }),
  recentCalls: (limit = 10) => api.get('/api/dashboard/recent-calls', { params: { limit } }),
};

// ── Users ───────────────────────────────────────────────────────────────────────
export const usersApi = {
  list: () => api.get('/api/users'),
  create: (data) => api.post('/api/users', data),
  update: (id, data) => api.put(`/api/users/${id}`, data),
  remove: (id) => api.delete(`/api/users/${id}`),
};

// ── Settings ────────────────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => api.get('/api/settings'),
  update: (data) => api.put('/api/settings', data),
};

// ── Calls (extended) ────────────────────────────────────────────────────────────
export const callsListApi = {
  list: (params) => api.get('/api/calls', { params }),
  exportCsv: (params) => api.get('/api/calls/export', { params, responseType: 'blob' }),
};

export default api;

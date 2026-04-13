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
    if (error.response?.status === 401) {
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

export const simulateApi = {
  start: (workflowId) => api.post('/api/simulate/start', { workflowId }, { timeout: 30000 }),
  turn: (callId, turn, userText) =>
    api.post('/api/simulate/turn', { callId, turn, userText }, { timeout: 30000 }),
  end: (callId) => api.post('/api/simulate/end', { callId }),
};

export default api;

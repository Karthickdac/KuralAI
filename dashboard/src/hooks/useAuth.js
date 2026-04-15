/**
 * useAuth - Authentication state hook
 */

import { useState, useCallback } from 'react';
import { authApi } from '../api/client';

export function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('kuralai_user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await authApi.login(email, password);
      localStorage.setItem('kuralai_token', data.token);
      localStorage.setItem('kuralai_user', JSON.stringify(data.user));
      setUser(data.user);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('kuralai_token');
    localStorage.removeItem('kuralai_user');
    setUser(null);
    window.location.href = '/login';
  }, []);

  return { user, login, logout, loading, error, isAuthenticated: !!user };
}

import { apiFetch } from './http.js';

export const register = (details) => apiFetch('/auth/register', { method: 'POST', body: details });
export const login = (credentials) => apiFetch('/auth/login', { method: 'POST', body: credentials });
export const logout = () => apiFetch('/auth/logout', { method: 'POST' });
export const getCurrentUser = () => apiFetch('/auth/me');

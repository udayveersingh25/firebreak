import { apiFetch } from './http.js';

export const listProjects = (signal) => apiFetch('/projects', { signal });
export const getProject = (id, signal) => apiFetch(`/projects/${id}`, { signal });
export const createProject = (details) => apiFetch('/projects', { method: 'POST', body: details });
export const deleteProject = (id) => apiFetch(`/projects/${id}`, { method: 'DELETE' });

/** Sends the lockfile's raw text; the server parses it. */
export const uploadLockfile = (id, lockfile) =>
  apiFetch(`/projects/${id}/lockfile`, { method: 'PUT', body: { lockfile } });

/** Sends variable names only. Values never reach this function. */
export const replaceSecretNames = (id, names) =>
  apiFetch(`/projects/${id}/secrets`, { method: 'PUT', body: { names } });

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

/** Re-runs the vulnerability check (429 if it ran in the last 30 seconds). */
export const scanProject = (id) => apiFetch(`/projects/${id}/scan`, { method: 'POST' });

/** Corrects a secret's service and/or impact level. */
export const overrideSecret = (id, name, changes) =>
  apiFetch(`/projects/${id}/secrets/${encodeURIComponent(name)}`, { method: 'PATCH', body: changes });

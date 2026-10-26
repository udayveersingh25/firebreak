import { apiFetch } from './http.js';

export const listIncidents = (signal) => apiFetch('/admin/incidents', { signal });
export const getIncident = (id, signal) => apiFetch(`/admin/incidents/${id}`, { signal });
export const createIncident = (incident) => apiFetch('/admin/incidents', { method: 'POST', body: incident });
export const updateIncident = (id, incident) => apiFetch(`/admin/incidents/${id}`, { method: 'PATCH', body: incident });
export const previewIncident = (id) => apiFetch(`/admin/incidents/${id}/preview`, { method: 'POST' });
export const publishIncident = (id) => apiFetch(`/admin/incidents/${id}/publish`, { method: 'POST' });
export const archiveIncident = (id) => apiFetch(`/admin/incidents/${id}/archive`, { method: 'POST' });

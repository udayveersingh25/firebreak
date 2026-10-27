import { apiFetch } from './http.js';

export const listResponses = (projectId, signal) =>
  apiFetch(projectId ? `/responses?project=${projectId}` : '/responses', { signal });
export const getResponse = (id, signal) => apiFetch(`/responses/${id}`, { signal });
export const setStepDone = (id, stepKey, done) =>
  apiFetch(`/responses/${id}/steps/${encodeURIComponent(stepKey)}`, { method: 'PATCH', body: { done } });
export const declareNotAffected = (id, reason) =>
  apiFetch(`/responses/${id}/not-affected`, { method: 'POST', body: { reason } });
export const reopenResponse = (id) => apiFetch(`/responses/${id}/reopen`, { method: 'POST' });
export const resolveResponse = (id) => apiFetch(`/responses/${id}/resolve`, { method: 'POST' });

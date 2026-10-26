import { apiFetch } from './http.js';

export const listNotifications = (signal) => apiFetch('/notifications', { signal });
export const markNotificationRead = (id) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
export const markAllNotificationsRead = () => apiFetch('/notifications/read-all', { method: 'PATCH' });

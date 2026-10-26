import { useState } from 'react';
import { useNavigate } from 'react-router';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../api/notifications.js';
import { Button } from '../components/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/PageState.jsx';
import { useApiData } from '../hooks/useApiData.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useToast } from '../hooks/useToast.js';
import { useUnreadCount } from '../hooks/useUnreadCount.js';

function timeAgo(value) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function NotificationsPage() {
  usePageTitle('Notifications');
  const navigate = useNavigate();
  const toast = useToast();
  const { refresh: refreshBell } = useUnreadCount();
  const { status, data, error, reload, setData } = useApiData((signal) => listNotifications(signal), []);
  const [markingAll, setMarkingAll] = useState(false);

  async function open(notification) {
    if (!notification.readAt) {
      try {
        await markNotificationRead(notification.id);
        refreshBell();
      } catch {
        // Opening the link matters more than the read mark; it can be retried.
      }
    }
    if (notification.link) navigate(notification.link);
  }

  async function handleMarkAll() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setData((current) => ({
        unreadCount: 0,
        notifications: current.notifications.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
      }));
      refreshBell();
      toast.success('All notifications marked as read.');
    } catch (markError) {
      toast.error(`Could not mark them as read. ${markError.message}`);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {data?.unreadCount > 0 && (
          <Button variant="secondary" onClick={handleMarkAll} loading={markingAll}>
            Mark all as read
          </Button>
        )}
      </div>

      <div className="mt-8">
        {status === 'loading' && !data && <LoadingState label="Loading notifications…" />}
        {status === 'error' && (
          <ErrorState title="We could not load your notifications" message={error.message} onRetry={reload} />
        )}
        {data && data.notifications.length === 0 && (
          <EmptyState title="No notifications yet">
            When a published incident affects one of your projects, you will hear about it here.
          </EmptyState>
        )}
        {data && data.notifications.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {data.notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => open(notification)}
                  className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-slate-900"
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.readAt ? 'bg-transparent' : 'bg-blue-600'}`}
                    aria-hidden="true"
                  />
                  <span className="flex-1">
                    <span className={`block text-sm ${notification.readAt ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>
                      {notification.title}
                      {!notification.readAt && <span className="sr-only"> (unread)</span>}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">{notification.body}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{timeAgo(notification.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

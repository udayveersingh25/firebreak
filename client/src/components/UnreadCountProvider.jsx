import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { listNotifications } from '../api/notifications.js';
import { useAuth } from '../hooks/useAuth.js';
import { UnreadCountContext } from '../hooks/useUnreadCount.js';

const REFRESH_MS = 60_000;

/** Keeps the unread count fresh: on every page change and once a minute. */
export default function UnreadCountProvider({ children }) {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);
  const signedIn = status === 'authenticated';

  const refresh = useCallback(() => {
    if (!signedIn) return;
    listNotifications().then(
      (data) => setCount(data.unreadCount),
      () => {}, // the bell is a hint; a failed refresh keeps the last count
    );
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setCount(0);
      return undefined;
    }
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [signedIn, pathname, refresh]);

  const value = useMemo(() => ({ count, refresh }), [count, refresh]);
  return <UnreadCountContext value={value}>{children}</UnreadCountContext>;
}

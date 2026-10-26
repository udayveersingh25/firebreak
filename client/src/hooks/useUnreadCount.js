import { createContext, useContext } from 'react';

export const UnreadCountContext = createContext({ count: 0, refresh: () => {} });

/** { count, refresh } for the notification bell. */
export function useUnreadCount() {
  return useContext(UnreadCountContext);
}

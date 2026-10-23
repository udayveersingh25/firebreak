import { useEffect } from 'react';

/** Sets the browser tab title, e.g. "Projects · Firebreak". */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Firebreak` : 'Firebreak';
  }, [title]);
}

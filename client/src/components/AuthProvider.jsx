import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentUser } from '../api/auth.js';
import { setUnauthorizedHandler } from '../api/http.js';
import { AuthContext } from '../hooks/useAuth.js';

const ANONYMOUS = { status: 'anonymous', user: null, error: null };

export default function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, error: null });

  const load = useCallback(async () => {
    setState({ status: 'loading', user: null, error: null });
    try {
      const { user } = await getCurrentUser();
      setState({ status: 'authenticated', user, error: null });
    } catch (error) {
      // 401 means "not logged in". Anything else means we could not find out,
      // which is not the same thing, so it gets its own state and a retry.
      setState(error.status === 401 ? ANONYMOUS : { status: 'error', user: null, error });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Any 401 from the API (e.g. the session expired) logs the browser out too.
  useEffect(() => {
    setUnauthorizedHandler(() => setState((current) => (current.status === 'authenticated' ? ANONYMOUS : current)));
    return () => setUnauthorizedHandler(() => {});
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      retry: load,
      signIn: (user) => setState({ status: 'authenticated', user, error: null }),
      signOut: () => setState(ANONYMOUS),
    }),
    [state, load],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

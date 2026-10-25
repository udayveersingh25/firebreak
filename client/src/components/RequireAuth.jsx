import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../hooks/useAuth.js';
import { ErrorState, LoadingState } from './PageState.jsx';

/** Wraps pages that need a logged-in user. */
export default function RequireAuth() {
  const { status, error, retry } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <LoadingState label="Checking your session…" />;
  if (status === 'error') {
    return <ErrorState title="We could not check your session" message={error.message} onRetry={retry} />;
  }
  if (status === 'anonymous') {
    // Remember where they were going, so logging in takes them straight back.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

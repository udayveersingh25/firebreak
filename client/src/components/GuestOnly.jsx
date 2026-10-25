import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../hooks/useAuth.js';
import { LoadingState } from './PageState.jsx';

/** Login and sign-up pages: once you are logged in, go where you were heading. */
export default function GuestOnly() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <LoadingState />;
  if (status === 'authenticated') return <Navigate to={safeReturnPath(location.state?.from)} replace />;
  return <Outlet />;
}

// Only paths inside this site: "//evil.example" would leave it.
function safeReturnPath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/dashboard';
}

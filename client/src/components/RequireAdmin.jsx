import { Outlet } from 'react-router';
import { useAuth } from '../hooks/useAuth.js';
import { ErrorState } from './PageState.jsx';

/** Use inside RequireAuth. The server enforces this too; this only avoids a dead-end page. */
export default function RequireAdmin() {
  const { user } = useAuth();
  if (user.role !== 'admin') {
    return (
      <ErrorState
        title="This page is for admins"
        message="Admins publish incidents. Your projects and their status are on your dashboard."
      />
    );
  }
  return <Outlet />;
}

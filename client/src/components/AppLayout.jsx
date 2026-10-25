import { useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useNavigate } from 'react-router';
import { logout } from '../api/auth.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import { Button, ButtonLink } from './Button.jsx';
import Logo from './Logo.jsx';

export default function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            to="/"
            className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900"
          >
            <Logo />
          </Link>
          <AccountNav />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-slate-500 sm:px-6">
          Vulnerability data from{' '}
          <a
            href="https://osv.dev"
            className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900"
          >
            OSV.dev
          </a>
          . Secret values never leave your browser.
        </div>
      </footer>

      <ScrollRestoration />
    </div>
  );
}

function AccountNav() {
  const { status, user, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      // Leave the protected page first, synchronously: React Router normally
      // applies navigations as low-priority updates, so signing out would win
      // and redirect you to the login page instead of home.
      navigate('/', { replace: true, flushSync: true });
      signOut();
      toast.success('You are logged out.');
    } catch (error) {
      toast.error(`Could not log out. ${error.message}`);
    } finally {
      setLoggingOut(false);
    }
  }

  if (status === 'authenticated') {
    return (
      <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 ${isActive ? 'text-slate-900' : 'text-slate-600'}`
          }
        >
          Dashboard
        </NavLink>
        <span className="hidden max-w-40 truncate px-2 text-sm text-slate-500 sm:inline">{user.name}</span>
        <Button variant="ghost" loading={loggingOut} onClick={handleLogout}>
          Log out
        </Button>
      </nav>
    );
  }

  // Still checking, or the server is unreachable: we do not know yet whether
  // you are logged in, so offer neither "Log in" nor "Log out".
  if (status === 'loading' || status === 'error') return null;

  return (
    <nav aria-label="Account" className="flex items-center gap-2">
      <ButtonLink to="/login" variant="ghost">
        Log in
      </ButtonLink>
      <ButtonLink to="/register">Get started</ButtonLink>
    </nav>
  );
}

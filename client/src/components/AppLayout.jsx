import { Link, Outlet, ScrollRestoration } from 'react-router';
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
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900"
          >
            <Logo />
          </Link>
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

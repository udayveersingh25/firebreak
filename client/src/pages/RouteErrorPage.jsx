import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button, ButtonLink } from '../components/Button.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import NotFoundPage from './NotFoundPage.jsx';

/** Shown when a page crashes while rendering. Calm, and always offers a way forward. */
export default function RouteErrorPage() {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;
  usePageTitle(isNotFound ? 'Page not found' : 'Something went wrong');

  if (isNotFound) {
    return <NotFoundPage />;
  }

  return (
    <section className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">This page ran into a problem</h1>
      <p className="mt-3 text-slate-600">
        Reloading usually fixes this. If it keeps happening, go back to the home page and try again.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={() => window.location.reload()}>Reload the page</Button>
        <ButtonLink to="/" variant="secondary">
          Back to home
        </ButtonLink>
      </div>
    </section>
  );
}

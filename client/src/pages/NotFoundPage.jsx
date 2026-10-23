import { ButtonLink } from '../components/Button.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

export default function NotFoundPage() {
  usePageTitle('Page not found');

  return (
    <section className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p className="text-sm font-semibold text-slate-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">We could not find that page</h1>
      <p className="mt-3 text-slate-600">The link may be out of date, or the page may have moved.</p>
      <ButtonLink to="/" className="mt-8">
        Back to home
      </ButtonLink>
    </section>
  );
}

import { EmptyState } from '../components/PageState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { usePageTitle } from '../hooks/usePageTitle.js';

export default function DashboardPage() {
  usePageTitle('Dashboard');
  const { user } = useAuth();

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-sm text-slate-500">Hello, {user.name}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your projects</h1>
      <div className="mt-8">
        <EmptyState title="No projects yet">
          Each app you track will appear here with its current status, so you can see at a glance
          whether anything needs your attention.
        </EmptyState>
      </div>
    </section>
  );
}

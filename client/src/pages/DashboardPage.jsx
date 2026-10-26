import { Link } from 'react-router';
import { listProjects } from '../api/projects.js';
import { ButtonLink } from '../components/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/PageState.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useApiData } from '../hooks/useApiData.js';
import { useAuth } from '../hooks/useAuth.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { hostingLabel } from '../lib/labels.js';

export default function DashboardPage() {
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const { status, data, error, reload } = useApiData((signal) => listProjects(signal), []);

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Hello, {user.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your projects</h1>
        </div>
        {data?.projects.length > 0 && <ButtonLink to="/projects/new">Add a project</ButtonLink>}
      </div>

      <div className="mt-8">
        {status === 'loading' && <LoadingState label="Loading your projects…" />}
        {status === 'error' && (
          <ErrorState title="We could not load your projects" message={error.message} onRetry={reload} />
        )}
        {status === 'success' && data.projects.length === 0 && (
          <EmptyState
            title="No projects yet"
            action={<ButtonLink to="/projects/new">Add your first project</ButtonLink>}
          >
            Add an app with its lockfile and secret names. When an incident is published, you will see here
            whether it affects you.
          </EmptyState>
        )}
        {status === 'success' && data.projects.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2">
            {data.projects.map((project) => (
              <li key={project.id}>
                <ProjectCard project={project} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ProjectCard({ project }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="block h-full rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-slate-900"
    >
      <p className="font-semibold break-all">{project.name}</p>
      <p className="mt-1 text-sm text-slate-500">Hosted on {hostingLabel(project.hostingProvider)}</p>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex flex-wrap items-center gap-2">
          {project.secretCount === null ? (
            <>
              <StatusBadge status="unknown" /> Secret names not added
            </>
          ) : project.exposedCount > 0 ? (
            <>
              <StatusBadge status="open" />
              {project.exposedCount === 1 ? '1 secret' : `${project.exposedCount} secrets`} visible in your website
            </>
          ) : (
            <>
              <StatusBadge status="not_affected" /> No secrets in your website
            </>
          )}
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <DependencySummary project={project} />
        </li>
      </ul>
    </Link>
  );
}

function DependencySummary({ project }) {
  if (project.packageCount === null) {
    return (
      <>
        <StatusBadge status="unknown" /> No lockfile yet
      </>
    );
  }
  if (project.scanStatus === 'running') return <span className="text-slate-600">Checking packages…</span>;
  if (project.scanStatus !== 'succeeded') {
    return (
      <>
        <StatusBadge status="unknown" />
        {project.scanStatus === 'failed' ? 'Last check failed, retry on the project page' : 'Packages not checked yet'}
      </>
    );
  }

  const { fix_now: now, fix_soon: soon, plan_fix: plan, low_risk: low } = project.findingCounts;
  if (now + soon > 0) {
    return (
      <>
        <StatusBadge status="open" />
        {now + soon} {now + soon === 1 ? 'vulnerability' : 'vulnerabilities'} to fix now or soon
      </>
    );
  }
  if (plan + low > 0) {
    return <span className="text-slate-600">{plan + low} known issues, none urgent</span>;
  }
  return (
    <>
      <StatusBadge status="not_affected" /> No known vulnerabilities
    </>
  );
}

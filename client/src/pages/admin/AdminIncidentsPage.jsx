import { Link } from 'react-router';
import { listIncidents } from '../../api/admin.js';
import { ButtonLink } from '../../components/Button.jsx';
import {
  describeTarget,
  IncidentStatusLabel,
  KIND_LABELS,
  SeverityLabel,
  SimulatedLabel,
} from '../../components/IncidentLabels.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/PageState.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { formatDate } from '../../lib/labels.js';

export default function AdminIncidentsPage() {
  usePageTitle('Incidents');
  const { status, data, error, reload } = useApiData((signal) => listIncidents(signal), []);

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Admin</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Incidents</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            You see totals for each incident, never which projects or people are behind them.
          </p>
        </div>
        <ButtonLink to="/admin/incidents/new">New incident</ButtonLink>
      </div>

      <div className="mt-8">
        {status === 'loading' && <LoadingState label="Loading incidents…" />}
        {status === 'error' && <ErrorState title="We could not load incidents" message={error.message} onRetry={reload} />}
        {status === 'success' && data.incidents.length === 0 && (
          <EmptyState title="No incidents yet" action={<ButtonLink to="/admin/incidents/new">Write the first one</ButtonLink>}>
            Draft an incident, preview how many projects it affects, then publish it to notify their owners.
          </EmptyState>
        )}
        {status === 'success' && data.incidents.length > 0 && (
          <ul className="space-y-4">
            {data.incidents.map((incident) => (
              <li key={incident.id}>
                <IncidentCard incident={incident} services={data.targetOptions.services} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function IncidentCard({ incident, services }) {
  const counts = incident.responseCounts;
  return (
    <Link
      to={`/admin/incidents/${incident.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-slate-900"
    >
      <div className="flex flex-wrap items-center gap-2">
        <IncidentStatusLabel status={incident.status} />
        <SeverityLabel severity={incident.severity} />
        <span className="text-xs text-slate-500">{KIND_LABELS[incident.kind]}</span>
        {incident.isSimulated && <SimulatedLabel />}
      </div>
      <p className="mt-2 font-semibold">{incident.title}</p>
      <p className="mt-1 text-sm text-slate-600">{describeTarget(incident.target, services)}</p>
      {incident.status === 'draft' ? (
        <p className="mt-3 text-sm text-slate-500">Draft, created {formatDate(incident.createdAt)}. Not visible to users.</p>
      ) : (
        <p className="mt-3 text-sm text-slate-700">
          Published {formatDate(incident.publishedAt)} · {incident.matchedCounts.affected} affected ·{' '}
          {incident.matchedCounts.unknown} needed more information · {counts.resolved} resolved ·{' '}
          {counts.in_progress} in progress
        </p>
      )}
    </Link>
  );
}

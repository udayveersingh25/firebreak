import { Link } from 'react-router';
import { listResponses } from '../api/responses.js';
import { useApiData } from '../hooks/useApiData.js';
import { SimulatedLabel } from './IncidentLabels.jsx';
import StatusBadge from './StatusBadge.jsx';

/**
 * Incidents that touch this project. Refetches whenever the project changes,
 * because a new lockfile or secret list can change their status.
 */
export default function ProjectIncidents({ project }) {
  const { status, data, error, reload } = useApiData(
    (signal) => listResponses(project.id, signal),
    [project.id, project.updatedAt],
  );

  if (status === 'error') {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Incidents</h2>
        <p className="mt-2 text-sm text-slate-600">
          We could not load the incidents for this project. {error.message}{' '}
          <button type="button" onClick={reload} className="font-medium underline underline-offset-2">
            Try again
          </button>
        </p>
      </section>
    );
  }
  // Nothing published affects this project: no section, no noise.
  if (!data || data.responses.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6" aria-labelledby="incidents-heading">
      <h2 id="incidents-heading" className="text-lg font-semibold">
        Incidents
      </h2>
      <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
        {data.responses.map((response) => (
          <li key={response.id}>
            <Link
              to={`/responses/${response.id}`}
              className="flex flex-col gap-2 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>
                <span className="block font-medium">{response.incident?.title ?? 'Incident'}</span>
                {response.incident?.isSimulated && (
                  <span className="mt-1 inline-block">
                    <SimulatedLabel />
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3 text-sm text-slate-600">
                {response.stepsTotal > 0 && `${response.stepsDone} of ${response.stepsTotal} steps`}
                <StatusBadge status={response.status} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { useEffect, useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { deleteProject, getProject, overrideSecret } from '../api/projects.js';
import { Button, ButtonLink } from '../components/Button.jsx';
import DependencySection from '../components/DependencySection.jsx';
import EnvNamesInput from '../components/EnvNamesInput.jsx';
import ProjectIncidents from '../components/ProjectIncidents.jsx';
import { ErrorState, LoadingState } from '../components/PageState.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useApiData } from '../hooks/useApiData.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useToast } from '../hooks/useToast.js';
import { formatDate, hostingLabel, leakSentence, lowerFirst } from '../lib/labels.js';

const CRITICALITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, public: 4 };
const POLL_MS = 2000;

export default function ProjectPage() {
  const { id } = useParams();
  const { status, data, error, reload, setData } = useApiData((signal) => getProject(id, signal), [id]);
  const project = data?.project;
  usePageTitle(project?.name ?? 'Project');

  const update = (updated) => setData((current) => ({ ...current, project: updated }));

  // While a scan runs, quietly check again every 2 seconds until it finishes.
  const scanning = project?.scan.status === 'running';
  useEffect(() => {
    if (!scanning) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      getProject(id, controller.signal).then(
        ({ project: latest }) => setData((current) => ({ ...current, project: latest })),
        () => {}, // a missed poll is retried on the next tick
      );
    }, POLL_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, scanning, project, setData]);

  if (status === 'loading' && !project) return <LoadingState label="Loading project…" />;
  if (status === 'error') {
    return error.status === 404 ? (
      <ErrorState title="We could not find that project" message="It may have been deleted, or the link may be wrong." />
    ) : (
      <ErrorState title="We could not load this project" message={error.message} onRetry={reload} />
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <ProjectHeader project={project} />
      <div className="mt-8 space-y-8">
        <ProjectIncidents project={project} />
        <ExposureSection project={project} onUpdated={update} />
        <DependencySection project={project} onUpdated={update} />
        <InventorySection project={project} services={data.overrideOptions.services} onUpdated={update} />
      </div>
    </div>
  );
}

function ProjectHeader({ project }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Delete ${project.name}? Its inventory and incident history will be removed.`)) return;
    setDeleting(true);
    try {
      await deleteProject(project.id);
      toast.success(`Deleted ${project.name}.`);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(`Could not delete the project. ${error.message}`);
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <ButtonLink to="/dashboard" variant="ghost" className="-ml-4 mb-2">
          ← All projects
        </ButtonLink>
        <h1 className="text-2xl font-semibold tracking-tight break-all">{project.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Hosted on {hostingLabel(project.hostingProvider)} · added {formatDate(project.createdAt)}
        </p>
      </div>
      <Button variant="secondary" onClick={handleDelete} loading={deleting}>
        Delete project
      </Button>
    </div>
  );
}

function Section({ title, badge, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {badge}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** First and most prominent: keys that anyone can copy from your website today. */
function ExposureSection({ project, onUpdated }) {
  const exposed = project.secrets.filter((secret) => secret.exposedInFrontend);

  if (!project.secretsUpdatedAt) {
    return (
      <Section title="Secrets visible in your website" badge={<StatusBadge status="unknown" />}>
        <p className="text-sm text-slate-600">
          Add your environment variable names so we can check whether any secret is bundled into your website.
        </p>
        <div className="mt-4">
          <EnvNamesInput projectId={project.id} onSaved={onUpdated} />
        </div>
      </Section>
    );
  }

  if (exposed.length === 0) {
    return (
      <Section title="Secrets visible in your website" badge={<StatusBadge status="not_affected" />}>
        <p className="text-sm text-slate-600">
          None of your {project.secrets.length} variables look like a secret that is bundled into your website.
        </p>
      </Section>
    );
  }

  return (
    <section className="rounded-2xl border-2 border-red-200 bg-white p-6" aria-labelledby="exposed-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="exposed-heading" className="text-lg font-semibold">
          {exposed.length === 1 ? '1 secret is' : `${exposed.length} secrets are`} visible in your website
        </h2>
        <StatusBadge status="open" />
      </div>
      <p className="mt-2 text-sm text-slate-600">
        What to do: move each call that uses this key to your server, rename the variable without the prefix,
        then create a new key and revoke the old one. The old key has already been public, so hiding it is not
        enough.
      </p>
      <ul className="mt-4 space-y-3">
        {exposed.map((secret) => (
          <li key={secret.name} className="rounded-lg bg-red-50 px-4 py-3">
            <p className="font-mono text-sm font-semibold break-all text-red-900">{secret.name}</p>
            <p className="mt-1 text-sm text-red-900">{secret.exposureReason}</p>
            <p className="mt-1 text-sm text-red-900">
              {secret.serviceKey === 'unknown'
                ? 'We cannot tell exactly what it unlocks, but its name says it is a secret.'
                : `With it, someone could ${lowerFirst(secret.capability)}.`}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        If one of these really is meant to be public, mark it as "Public by design" in the inventory below.
      </p>
    </section>
  );
}

function InventorySection({ project, services, onUpdated }) {
  const [editingNames, setEditingNames] = useState(false);
  if (!project.secretsUpdatedAt) return null;

  const secrets = [...project.secrets].sort(
    (a, b) => CRITICALITY_ORDER[a.criticality] - CRITICALITY_ORDER[b.criticality] || a.name.localeCompare(b.name),
  );

  return (
    <Section title="Secret inventory">
      <p className="text-sm text-slate-600">What someone could do with each secret if it leaked. Most important first.</p>
      {secrets.length > 0 ? (
        <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
          {secrets.map((secret) => (
            <SecretRow key={secret.name} project={project} secret={secret} services={services} onUpdated={onUpdated} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-600">You sent an empty list, so there is nothing to check.</p>
      )}
      <div className="mt-4">
        {editingNames ? (
          <EnvNamesInput
            projectId={project.id}
            submitLabel="Replace secret names"
            onSaved={(updated) => {
              setEditingNames(false);
              onUpdated(updated);
            }}
            secondaryAction={
              <Button variant="ghost" onClick={() => setEditingNames(false)}>
                Cancel
              </Button>
            }
          />
        ) : (
          <Button variant="secondary" onClick={() => setEditingNames(true)}>
            Update secret names
          </Button>
        )}
      </div>
    </Section>
  );
}

// Neutral on purpose: an inventory is not an alarm. Only real exposure is red.
const CRITICALITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  public: 'Public by design',
};

function SecretRow({ project, secret, services, onUpdated }) {
  const toast = useToast();
  const formId = useId();
  const [editing, setEditing] = useState(false);
  const [serviceKey, setServiceKey] = useState(secret.serviceKey);
  const [criticality, setCriticality] = useState(secret.criticality);
  const [saving, setSaving] = useState(false);

  async function handleSave(event) {
    event.preventDefault();
    // Send only what changed.
    const changes = {
      ...(serviceKey !== secret.serviceKey && { serviceKey }),
      ...(criticality !== secret.criticality && { criticality }),
    };
    if (Object.keys(changes).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const { project: updated } = await overrideSecret(project.id, secret.name, changes);
      toast.success(`Updated ${secret.name}.`);
      setEditing(false);
      onUpdated(updated);
    } catch (error) {
      toast.error(`Could not update ${secret.name}. ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-4">
        <div className="sm:w-64 sm:shrink-0">
          <p className="font-mono text-sm font-semibold break-all">{secret.name}</p>
          <p className="text-xs text-slate-500">
            {secret.serviceLabel}
            {secret.userOverride && ' · set by you'}
          </p>
        </div>
        <div className={`flex-1 text-sm ${secret.publicByDesign ? 'text-slate-500' : 'text-slate-700'}`}>
          {leakSentence(secret)}
        </div>
        <div className="flex items-center gap-2 self-start">
          <span
            className={`rounded-md px-2 py-0.5 text-xs whitespace-nowrap ring-1 ring-inset ${
              secret.criticality === 'critical' ? 'font-semibold text-slate-900 ring-slate-400' : 'text-slate-600 ring-slate-200'
            }`}
          >
            {CRITICALITY_LABELS[secret.criticality]}
          </span>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
            >
              Correct<span className="sr-only"> {secret.name}</span>
            </button>
          )}
        </div>
      </div>
      {editing && (
        <form onSubmit={handleSave} className="mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3">
          <div>
            <label htmlFor={`${formId}-service`} className="block text-xs font-medium text-slate-700">
              Service
            </label>
            <select
              id={`${formId}-service`}
              value={serviceKey}
              onChange={(event) => setServiceKey(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              {services.map((service) => (
                <option key={service.serviceKey} value={service.serviceKey}>
                  {service.serviceLabel}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-impact`} className="block text-xs font-medium text-slate-700">
              Impact if leaked
            </label>
            <select
              id={`${formId}-impact`}
              value={criticality}
              onChange={(event) => setCriticality(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              {Object.entries(CRITICALITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" loading={saving}>
            Save
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        </form>
      )}
    </li>
  );
}

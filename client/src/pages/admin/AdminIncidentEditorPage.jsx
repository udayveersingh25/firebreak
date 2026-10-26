import { useEffect, useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  archiveIncident,
  createIncident,
  getIncident,
  listIncidents,
  previewIncident,
  publishIncident,
  updateIncident,
} from '../../api/admin.js';
import { Button, ButtonLink } from '../../components/Button.jsx';
import FormAlert from '../../components/FormAlert.jsx';
import {
  describeTarget,
  IncidentStatusLabel,
  KIND_LABELS,
  SeverityLabel,
  SimulatedLabel,
} from '../../components/IncidentLabels.jsx';
import { ErrorState, LoadingState } from '../../components/PageState.jsx';
import TextField from '../../components/TextField.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useToast } from '../../hooks/useToast.js';
import { formatDate, HOSTING_PROVIDERS } from '../../lib/labels.js';

const EMPTY_FORM = {
  title: '',
  description: '',
  kind: 'compromise',
  severity: 'high',
  sourceUrl: '',
  isSimulated: true,
  targetType: 'service',
  packageName: '',
  affectedRange: '',
  fixedVersion: '',
  serviceKey: '',
  hostingProvider: '',
};

function formFromIncident(incident) {
  const { target } = incident;
  return {
    ...EMPTY_FORM,
    title: incident.title,
    description: incident.description,
    kind: incident.kind,
    severity: incident.severity,
    sourceUrl: incident.sourceUrl ?? '',
    isSimulated: incident.isSimulated,
    targetType: target.type,
    packageName: target.packageName ?? '',
    affectedRange: target.affectedRange ?? '',
    fixedVersion: target.fixedVersion ?? '',
    serviceKey: target.serviceKey ?? '',
    hostingProvider: target.hostingProvider ?? '',
  };
}

function payloadFromForm(form) {
  const targets = {
    package: { type: 'package', packageName: form.packageName, affectedRange: form.affectedRange, fixedVersion: form.fixedVersion },
    service: { type: 'service', serviceKey: form.serviceKey },
    hosting: { type: 'hosting', hostingProvider: form.hostingProvider },
  };
  const { title, description, kind, severity, sourceUrl, isSimulated } = form;
  return { title, description, kind, severity, sourceUrl, isSimulated, target: targets[form.targetType] };
}

export default function AdminIncidentEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  usePageTitle(isNew ? 'New incident' : 'Incident');
  // A new incident still needs the list of services for "service" targets.
  const { status, data, error, reload, setData } = useApiData(
    (signal) => (isNew ? listIncidents(signal) : getIncident(id, signal)),
    [id],
  );

  if (status === 'loading' && !data) return <LoadingState label="Loading incident…" />;
  if (status === 'error') {
    return error.status === 404 ? (
      <ErrorState title="We could not find that incident" />
    ) : (
      <ErrorState title="We could not load this incident" message={error.message} onRetry={reload} />
    );
  }

  const services = data.targetOptions.services;
  const incident = isNew ? null : data.incident;
  const replaceIncident = (updated) => setData((current) => ({ ...current, incident: { ...current.incident, ...updated } }));

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <ButtonLink to="/admin/incidents" variant="ghost" className="-ml-4 mb-2">
        ← All incidents
      </ButtonLink>
      {incident && incident.status !== 'draft' ? (
        <PublishedIncident incident={incident} services={services} onUpdated={replaceIncident} />
      ) : (
        <DraftEditor
          key={incident?.id ?? 'new'}
          incident={incident}
          services={services}
          onUpdated={replaceIncident}
          onPublished={reload}
        />
      )}
    </section>
  );
}

function DraftEditor({ incident, services, onUpdated, onPublished }) {
  const navigate = useNavigate();
  const toast = useToast();
  const savedForm = incident ? formFromIncident(incident) : EMPTY_FORM;
  const [form, setForm] = useState(savedForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(null); // 'save' | 'preview' | 'publish'
  const [preview, setPreview] = useState(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  // Counts describe the saved draft; any edit makes them out of date.
  useEffect(() => setPreview(null), [form]);

  const field = (name) => ({
    value: form[name],
    error: fieldErrors[name],
    onChange: (event) => {
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      setForm((current) => ({ ...current, [name]: value }));
    },
  });

  async function run(action, work) {
    setBusy(action);
    setFormError(null);
    try {
      await work();
    } catch (error) {
      // Server field names look like "target.affectedRange"; the form uses "affectedRange".
      const fields = Object.fromEntries(
        Object.entries(error.fields ?? {}).map(([key, message]) => [key.replace(/^target\.?/, '') || 'targetType', message]),
      );
      setFieldErrors(fields);
      setFormError(error.code === 'VALIDATION_ERROR' ? 'Please check the highlighted fields.' : error.message);
    } finally {
      setBusy(null);
    }
  }

  const handleSave = (event) => {
    event.preventDefault();
    run('save', async () => {
      setFieldErrors({});
      if (incident) {
        const { incident: updated } = await updateIncident(incident.id, payloadFromForm(form));
        onUpdated(updated);
        toast.success('Draft saved.');
      } else {
        const { incident: created } = await createIncident(payloadFromForm(form));
        toast.success('Draft saved. Preview who it affects before publishing.');
        navigate(`/admin/incidents/${created.id}`, { replace: true });
      }
    });
  };

  const handlePreview = () =>
    run('preview', async () => {
      const { counts } = await previewIncident(incident.id);
      setPreview(counts);
    });

  const handlePublish = () =>
    run('publish', async () => {
      const { counts } = await previewIncident(incident.id);
      setPreview(counts);
      const confirmed = window.confirm(
        `Publish "${incident.title}"?\n\n${counts.affected} affected and ${counts.unknown} needing more information. ` +
          'Their owners will be notified. A published incident cannot be edited.',
      );
      if (!confirmed) return;
      const { incident: published } = await publishIncident(incident.id);
      toast.success(`Published. ${published.matchedCounts.affected + published.matchedCounts.unknown} project owners notified.`);
      onPublished(); // reload, so the totals include the responses just created
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{incident ? 'Edit draft' : 'New incident'}</h1>
        {incident && <IncidentStatusLabel status="draft" />}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Write for someone who is not a security expert: what happened, who it affects, and what it means.
      </p>

      <form onSubmit={handleSave} noValidate className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        {formError && <FormAlert>{formError}</FormAlert>}
        <TextField label="Title" {...field('title')} />
        <TextArea label="What happened, in plain language" hint="At least a sentence or two." {...field('description')} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Select label="Kind" {...field('kind')}>
            <option value="compromise">Compromise (keys may be stolen)</option>
            <option value="vulnerability">Vulnerability (fix by upgrading)</option>
          </Select>
          <Select label="Severity" {...field('severity')}>
            {['critical', 'high', 'moderate', 'low'].map((value) => (
              <option key={value} value={value}>
                {value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </Select>
        </div>

        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-800">What does it affect?</legend>
          <Select label="Target" {...field('targetType')}>
            <option value="service">A third-party service</option>
            <option value="package">An npm package</option>
            <option value="hosting">A hosting provider</option>
          </Select>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {form.targetType === 'package' && (
              <>
                <TextField label="Package name" placeholder="lodash" {...field('packageName')} />
                <TextField label="Affected versions" placeholder=">=3.7.0 <4.17.19" hint="An npm version range." {...field('affectedRange')} />
                <TextField label="Fixed in version (optional)" placeholder="4.17.19" {...field('fixedVersion')} />
              </>
            )}
            {form.targetType === 'service' && (
              <Select label="Service" {...field('serviceKey')}>
                <option value="">Choose a service</option>
                {services.map((service) => (
                  <option key={service.serviceKey} value={service.serviceKey}>
                    {service.serviceLabel}
                  </option>
                ))}
              </Select>
            )}
            {form.targetType === 'hosting' && (
              <Select label="Hosting provider" {...field('hostingProvider')}>
                <option value="">Choose a provider</option>
                {HOSTING_PROVIDERS.filter((provider) => provider.value !== 'other').map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </fieldset>

        <TextField label="Source link (optional)" type="url" placeholder="https://" {...field('sourceUrl')} />
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.isSimulated}
            onChange={field('isSimulated').onChange}
            className="mt-0.5 size-4 rounded border-slate-300"
          />
          <span>
            <span className="font-medium">Simulated, inspired by real events</span>
            <span className="block text-slate-500">
              Keep this on unless every detail is verified against a real advisory. Users will see the label.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-5">
          <Button type="submit" loading={busy === 'save'} disabled={Boolean(busy) || (incident && !dirty)}>
            {incident ? 'Save changes' : 'Save draft'}
          </Button>
        </div>
      </form>

      {incident && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Preview and publish</h2>
          <p className="mt-1 text-sm text-slate-600">
            The preview runs the same matching as publishing, without changing anything.
          </p>
          {dirty && <p className="mt-3 text-sm text-amber-800">Save your changes first, so the preview matches what you publish.</p>}
          {preview && (
            <p role="status" className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <strong>{preview.affected}</strong> {preview.affected === 1 ? 'project is' : 'projects are'} affected and{' '}
              <strong>{preview.unknown}</strong> need more information before we can tell.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={handlePreview} loading={busy === 'preview'} disabled={Boolean(busy) || dirty}>
              Preview who is affected
            </Button>
            <Button onClick={handlePublish} loading={busy === 'publish'} disabled={Boolean(busy) || dirty}>
              Publish and notify
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function PublishedIncident({ incident, services, onUpdated }) {
  const toast = useToast();
  const [archiving, setArchiving] = useState(false);
  const counts = incident.responseCounts;

  async function handleArchive() {
    if (!window.confirm('Archive this incident? New projects will no longer be matched against it.')) return;
    setArchiving(true);
    try {
      const { incident: archived } = await archiveIncident(incident.id);
      toast.success('Incident archived.');
      onUpdated(archived);
    } catch (error) {
      toast.error(`Could not archive. ${error.message}`);
    } finally {
      setArchiving(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <IncidentStatusLabel status={incident.status} />
        <SeverityLabel severity={incident.severity} />
        <span className="text-xs text-slate-500">{KIND_LABELS[incident.kind]}</span>
        {incident.isSimulated && <SimulatedLabel />}
      </div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{incident.title}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {describeTarget(incident.target, services)} · published {formatDate(incident.publishedAt)}
      </p>
      <p className="mt-4 whitespace-pre-line text-slate-700">{incident.description}</p>
      {incident.sourceUrl && (
        <a href={incident.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline underline-offset-2">
          Source
        </a>
      )}

      <h2 className="mt-8 text-lg font-semibold">Totals</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ['Matched as affected', incident.matchedCounts.affected],
          ['Needed more information', incident.matchedCounts.unknown],
          ['Not started', counts.open],
          ['In progress', counts.in_progress],
          ['Resolved', counts.resolved],
          ['Not affected', counts.not_affected],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <dt className="text-xs text-slate-600">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {incident.status === 'published' && (
        <div className="mt-8">
          <Button variant="secondary" onClick={handleArchive} loading={archiving}>
            Archive incident
          </Button>
        </div>
      )}
    </>
  );
}

function Select({ label, error, children, ...props }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-xs ${error ? 'border-red-400' : 'border-slate-300'}`}
        {...props}
      >
        {children}
      </select>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function TextArea({ label, error, hint, ...props }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <textarea
        id={id}
        rows={5}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-xs ${error ? 'border-red-400' : 'border-slate-300'}`}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 text-sm text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

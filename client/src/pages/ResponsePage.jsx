import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { declareNotAffected, getResponse, reopenResponse, resolveResponse, setStepDone } from '../api/responses.js';
import { Button, ButtonLink } from '../components/Button.jsx';
import { KIND_LABELS, SeverityLabel, SimulatedLabel } from '../components/IncidentLabels.jsx';
import { ErrorState, LoadingState } from '../components/PageState.jsx';
import Spinner from '../components/Spinner.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useApiData } from '../hooks/useApiData.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useToast } from '../hooks/useToast.js';
import { formatDate, lowerFirst } from '../lib/labels.js';

const ACTIVE = ['open', 'in_progress'];

export default function ResponsePage() {
  const { id } = useParams();
  const { status, data, error, reload, setData } = useApiData((signal) => getResponse(id, signal), [id]);
  usePageTitle(data?.incident?.title ?? 'Incident response');

  if (status === 'loading' && !data) return <LoadingState label="Loading the response…" />;
  if (status === 'error') {
    return error.status === 404 ? (
      <ErrorState title="We could not find that incident response" message="It may belong to a project that was deleted." />
    ) : (
      <ErrorState title="We could not load this response" message={error.message} onRetry={reload} />
    );
  }

  const { response, incident, project, affectedSecrets } = data;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {project && (
        <ButtonLink to={`/projects/${project.id}`} variant="ghost" className="-ml-4 mb-2">
          ← {project.name}
        </ButtonLink>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={response.status} />
        <SeverityLabel severity={incident.severity} />
        <span className="text-xs text-slate-500">{KIND_LABELS[incident.kind]}</span>
        {incident.isSimulated && <SimulatedLabel />}
      </div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{incident.title}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {project?.name} · published {formatDate(incident.publishedAt)}
      </p>

      <div className="mt-8 space-y-6">
        <Situation data={data} onChange={setData} />
        {affectedSecrets.length > 0 && <ExposedSecrets secrets={affectedSecrets} />}
        {response.steps.length > 0 && <Checklist data={data} onChange={setData} />}
        <Timeline entries={response.timeline} />
      </div>
    </div>
  );
}

function Card({ title, children, tone = 'plain' }) {
  const tones = {
    plain: 'border-slate-200 bg-white',
    calm: 'border-green-200 bg-green-50',
    info: 'border-blue-200 bg-blue-50',
  };
  return (
    <section className={`rounded-2xl border p-6 ${tones[tone]}`}>
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      <div className={title ? 'mt-3' : ''}>{children}</div>
    </section>
  );
}

/** What we know and what it means, worded for each state. */
function Situation({ data, onChange }) {
  const { response, incident } = data;
  const description = <p className="mt-3 text-sm whitespace-pre-line text-slate-600">{incident.description}</p>;

  if (response.status === 'resolved') {
    return (
      <Card tone="calm" title="Resolved">
        <p className="text-sm">
          Every step was completed and verified on {formatDate(response.resolvedAt)}. Nothing else to do.
        </p>
      </Card>
    );
  }
  if (response.status === 'not_affected') {
    return (
      <Card title="Marked as not affected">
        <p className="text-sm text-slate-700">“{response.notAffectedReason}”</p>
        <ReopenButton responseId={response.id} onChange={onChange} />
      </Card>
    );
  }
  if (response.status === 'unknown') {
    return (
      <Card tone="info" title="We need more information to tell">
        <p className="text-sm text-slate-800">{response.affectedReason}</p>
        <p className="mt-2 text-sm text-slate-600">
          Once you add it on the project page, we check again automatically and update this page.
        </p>
        {description}
        <NotAffectedForm responseId={response.id} onChange={onChange} />
      </Card>
    );
  }
  return (
    <Card title="Why this project is affected">
      <p className="text-sm text-slate-800">{response.affectedReason}</p>
      {description}
      {incident.sourceUrl && (
        <a href={incident.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline underline-offset-2">
          Read the original advisory
        </a>
      )}
      <NotAffectedForm responseId={response.id} onChange={onChange} />
    </Card>
  );
}

function ExposedSecrets({ secrets }) {
  return (
    <Card title="Secrets to treat as exposed">
      <ul className="space-y-3">
        {secrets.map((secret) => (
          <li key={secret.name} className="rounded-lg bg-slate-50 px-4 py-3">
            <p className="font-mono text-sm font-semibold break-all">{secret.name}</p>
            <p className="text-xs text-slate-500">{secret.serviceLabel ?? 'No longer in your secret list'}</p>
            {secret.capability && secret.serviceLabel !== 'Unrecognised' && (
              <p className="mt-1 text-sm text-slate-700">Someone with it could {lowerFirst(secret.capability)}.</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Checklist({ data, onChange }) {
  const toast = useToast();
  const { response, incident, project } = data;
  const [pending, setPending] = useState(null); // step key, or 'resolve'
  const active = ACTIVE.includes(response.status);
  const done = response.steps.filter((step) => step.done).length;
  const left = response.steps.length - done;
  const hasRotation = response.steps.some((step) => step.key.startsWith('revoke:'));

  async function toggle(step) {
    setPending(step.key);
    try {
      onChange(await setStepDone(response.id, step.key, !step.done));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setPending(null);
    }
  }

  async function handleResolve() {
    setPending('resolve');
    try {
      onChange(await resolveResponse(response.id));
      toast.success('Resolved. Nice work.');
    } catch (error) {
      // The server refuses to resolve while steps remain; say why.
      toast.error(error.message);
    } finally {
      setPending(null);
    }
  }

  return (
    <Card title="What to do, in order">
      <p className="text-sm text-slate-600">
        {done} of {response.steps.length} done.
      </p>
      {hasRotation && (
        <p className="mt-2 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Why this order: you create the new keys and deploy them before revoking the old ones, so your app keeps
          working the whole time. Revoking first would take it down until the new keys are live.
        </p>
      )}
      <ol className="mt-4 space-y-2">
        {response.steps.map((step) => (
          <StepItem
            key={step.key}
            step={step}
            disabled={!active || Boolean(pending)}
            busy={pending === step.key}
            onToggle={() => toggle(step)}
            projectId={project?.id}
            packageName={incident.target.packageName}
          />
        ))}
      </ol>
      {active && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
          <Button onClick={handleResolve} loading={pending === 'resolve'} disabled={Boolean(pending)}>
            Resolve incident
          </Button>
          <span className="text-sm text-slate-600">
            {left === 0 ? 'Every step is done.' : `${left} ${left === 1 ? 'step' : 'steps'} left before you can resolve.`}
          </span>
        </div>
      )}
    </Card>
  );
}

function StepItem({ step, disabled, busy, onToggle, projectId, packageName }) {
  const checkboxId = useId();
  const automatic = step.type === 'auto_verify';

  return (
    <li className={`flex gap-3 rounded-lg border px-4 py-3 ${step.done ? 'border-green-200 bg-green-50/50' : 'border-slate-200'}`}>
      <div className="pt-0.5">
        {automatic ? (
          <span
            className={`flex size-5 items-center justify-center rounded-full text-xs ${step.done ? 'bg-green-600 text-white' : 'bg-blue-100 text-blue-700'}`}
            aria-hidden="true"
          >
            {step.done ? '✓' : 'A'}
          </span>
        ) : busy ? (
          <Spinner className="size-5 text-slate-500" />
        ) : (
          <input
            id={checkboxId}
            type="checkbox"
            checked={step.done}
            disabled={disabled}
            onChange={onToggle}
            className="size-5 rounded border-slate-300 accent-slate-900"
          />
        )}
      </div>
      <div className="flex-1">
        <label htmlFor={automatic ? undefined : checkboxId} className={`text-sm font-medium ${step.done ? 'text-slate-600' : ''}`}>
          {step.order}. {step.title}
        </label>
        {step.detail && <p className="mt-1 text-sm break-words text-slate-600">{step.detail}</p>}
        {step.link && (
          <a href={step.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-medium underline underline-offset-2">
            Open the page to do this
          </a>
        )}
        {automatic && (
          <p className="mt-1 text-xs text-blue-800">
            {step.done
              ? `Checked automatically: no affected version of ${packageName} is installed.`
              : 'Checked automatically. You cannot tick this yourself.'}{' '}
            {!step.done && projectId && (
              <Link to={`/projects/${projectId}`} className="font-medium underline underline-offset-2">
                Upload your lockfile on the project page
              </Link>
            )}
          </p>
        )}
      </div>
    </li>
  );
}

function NotAffectedForm({ responseId, onChange }) {
  const toast = useToast();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (reason.trim().length < 10) {
      setError('Explain why in at least 10 characters, for example "We removed LiteLLM last week."');
      return;
    }
    setSaving(true);
    try {
      onChange(await declareNotAffected(responseId, reason));
      toast.success('Marked as not affected. You can reopen it any time.');
    } catch (saveError) {
      setError(saveError.fields?.reason ?? saveError.message);
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-4 block text-sm font-medium text-slate-700 underline underline-offset-2">
        This does not apply to us
      </button>
    );
  }
  return (
    <form onSubmit={handleSubmit} noValidate className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <label htmlFor={fieldId} className="block text-sm font-medium">
        Why does this not apply?
      </label>
      <textarea
        id={fieldId}
        rows={3}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          setError(null);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        placeholder="We removed LiteLLM last week."
        className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm ${error ? 'border-red-400' : 'border-slate-300'}`}
      />
      {error && (
        <p id={`${fieldId}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-3">
        <Button type="submit" loading={saving}>
          Mark as not affected
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ReopenButton({ responseId, onChange }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function handleReopen() {
    setSaving(true);
    try {
      onChange(await reopenResponse(responseId));
      toast.success('Reopened.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button variant="secondary" className="mt-4" onClick={handleReopen} loading={saving}>
      Reopen
    </Button>
  );
}

function Timeline({ entries }) {
  return (
    <Card title="Timeline">
      <ol className="space-y-3">
        {[...entries].reverse().map((entry, index) => (
          <li key={`${entry.at}-${index}`} className="flex gap-3 text-sm">
            <span className="w-32 shrink-0 text-xs text-slate-500">
              {new Date(entry.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="flex-1">
              <span className="font-medium">{entry.actor === 'user' ? 'You' : 'Firebreak'}</span>: {entry.action}
              {entry.detail && <span className="block text-slate-600">{entry.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

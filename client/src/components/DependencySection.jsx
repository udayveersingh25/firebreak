import { useState } from 'react';
import { scanProject } from '../api/projects.js';
import { useToast } from '../hooks/useToast.js';
import { formatDate } from '../lib/labels.js';
import { Button } from './Button.jsx';
import LockfileUpload from './LockfileUpload.jsx';
import Spinner from './Spinner.jsx';
import StatusBadge from './StatusBadge.jsx';

const PRIORITIES = [
  { key: 'fix_now', label: 'Fix now', meaning: 'Serious issues in packages you installed yourself, running in your live app.' },
  { key: 'fix_soon', label: 'Fix soon', meaning: 'Serious issues in packages that came with ones you installed.' },
  { key: 'plan_fix', label: 'Plan a fix', meaning: 'Less serious issues in your live app. Include them in your next update.' },
  { key: 'low_risk', label: 'Low real-world risk', meaning: 'Development-only tools that your users never touch.' },
];

const SEVERITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  unknown: 'Not rated',
};

/**
 * Every state says what we know: not uploaded, checking, failed (with retry),
 * clean (with what was checked and when), or findings grouped by priority.
 * "No known vulnerabilities" appears only after a scan that succeeded.
 */
export default function DependencySection({ project, onUpdated }) {
  const toast = useToast();
  const [replacing, setReplacing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const { lockfile, scan, findings } = project;

  async function handleScan() {
    setRetrying(true);
    try {
      const { project: updated } = await scanProject(project.id);
      onUpdated(updated);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRetrying(false);
    }
  }

  const uploadForm = (label) => (
    <LockfileUpload
      projectId={project.id}
      submitLabel={label}
      onUploaded={(updated) => {
        setReplacing(false);
        onUpdated(updated);
      }}
      secondaryAction={
        lockfile && (
          <Button variant="ghost" onClick={() => setReplacing(false)}>
            Cancel
          </Button>
        )
      }
    />
  );

  const replaceAction = replacing ? (
    uploadForm('Upload new lockfile')
  ) : (
    <Button variant="secondary" onClick={() => setReplacing(true)} disabled={scan.status === 'running'}>
      Upload a newer lockfile
    </Button>
  );

  if (!lockfile) {
    return (
      <Shell badge={<StatusBadge status="unknown" />}>
        <p className="text-sm text-slate-600">
          We do not know which packages your app installs yet. Upload your package-lock.json so we can check.
        </p>
        <div className="mt-4">{uploadForm('Upload lockfile')}</div>
      </Shell>
    );
  }

  if (scan.status === 'running') {
    return (
      <Shell>
        <p role="status" className="flex items-center gap-3 text-sm text-slate-700">
          <Spinner />
          Checking {lockfile.packageCount} packages against OSV.dev. This usually takes a few seconds.
        </p>
      </Shell>
    );
  }

  if (scan.status === 'failed' || scan.status === 'never') {
    const failed = scan.status === 'failed';
    return (
      <Shell badge={<StatusBadge status="unknown" />}>
        <h3 className="font-semibold">{failed ? 'Scan failed' : 'Not checked yet'}</h3>
        <p className="mt-1 text-sm text-slate-600">
          {failed
            ? scan.error
            : `${lockfile.packageCount} packages are recorded but have not been checked for known vulnerabilities.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={handleScan} loading={retrying}>
            {failed ? 'Retry the check' : 'Check now'}
          </Button>
          {!replacing && replaceAction}
        </div>
        {replacing && <div className="mt-4">{replaceAction}</div>}
      </Shell>
    );
  }

  const urgent = findings.filter((finding) => finding.priority === 'fix_now' || finding.priority === 'fix_soon').length;
  const scannedLine = `Scanned ${scan.packagesScanned} packages on ${formatDate(scan.lastRunAt)}.`;

  return (
    <Shell badge={findings.length === 0 ? <StatusBadge status="not_affected" /> : urgent > 0 ? <StatusBadge status="open" /> : null}>
      {findings.length === 0 ? (
        <p className="text-sm text-slate-700">{scannedLine} No known vulnerabilities.</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {scannedLine} {findings.length === 1 ? '1 known issue' : `${findings.length} known issues`}, ranked by
            real-world risk rather than by how scary they sound.
          </p>
          <PriorityCounts findings={findings} />
          <div className="mt-6 space-y-6">
            {PRIORITIES.map((priority) => (
              <PriorityGroup
                key={priority.key}
                priority={priority}
                findings={findings.filter((finding) => finding.priority === priority.key)}
              />
            ))}
          </div>
        </>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        {!replacing && (
          <Button variant="ghost" onClick={handleScan} loading={retrying}>
            Check again
          </Button>
        )}
        {replaceAction}
      </div>
    </Shell>
  );
}

function Shell({ badge, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6" aria-labelledby="dependencies-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="dependencies-heading" className="text-lg font-semibold">
          Dependencies
        </h2>
        {badge}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PriorityCounts({ findings }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {PRIORITIES.map(({ key, label }) => (
        <div key={key} className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-600">{label}</dt>
          <dd className="text-xl font-semibold">{findings.filter((finding) => finding.priority === key).length}</dd>
        </div>
      ))}
    </dl>
  );
}

function PriorityGroup({ priority, findings }) {
  if (findings.length === 0) return null;
  return (
    <div>
      <h3 className="font-semibold">
        {priority.label} <span className="font-normal text-slate-500">({findings.length})</span>
      </h3>
      <p className="text-sm text-slate-600">{priority.meaning}</p>
      <ul className="mt-3 space-y-3">
        {findings.map((finding) => (
          <FindingCard key={`${finding.vulnId}-${finding.packageName}-${finding.installedVersion}`} finding={finding} />
        ))}
      </ul>
    </div>
  );
}

function FindingCard({ finding }) {
  const ids = [finding.vulnId, ...finding.aliases];
  return (
    <li className="rounded-lg border border-slate-200 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          <span className="font-mono">{finding.packageName}</span>{' '}
          <span className="text-sm text-slate-500">{finding.installedVersion}</span>
        </p>
        <span className="text-xs text-slate-600">Severity: {SEVERITY_LABELS[finding.severity] ?? 'Not rated'}</span>
      </div>
      <p className="mt-1 text-sm">{finding.summary}</p>
      <p className="mt-1 text-sm text-slate-600">{finding.explanation}</p>
      <p className="mt-2 text-sm font-medium">
        {finding.fixedVersion ? `Upgrade to ${finding.fixedVersion} or later.` : 'No fixed version yet.'}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        {ids.map((id, index) => (
          <span key={id}>
            {index > 0 && ' · '}
            <a
              href={`https://osv.dev/vulnerability/${id}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-slate-800"
            >
              {id}
            </a>
          </span>
        ))}
      </p>
    </li>
  );
}

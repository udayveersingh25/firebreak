// Small labels shared by every place an incident appears.

const SEVERITY_STYLES = {
  critical: 'text-slate-900 ring-slate-400 font-semibold',
  high: 'text-slate-800 ring-slate-300',
  moderate: 'text-slate-700 ring-slate-200',
  low: 'text-slate-600 ring-slate-200',
};

export const KIND_LABELS = { vulnerability: 'Vulnerability', compromise: 'Compromise' };

export function SeverityLabel({ severity }) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs whitespace-nowrap capitalize ring-1 ring-inset ${SEVERITY_STYLES[severity]}`}>
      {severity}
    </span>
  );
}

/** Required wherever a simulated incident is shown, so nobody mistakes it for real news. */
export function SimulatedLabel() {
  return (
    <span className="inline-flex items-center rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-violet-800 ring-1 ring-violet-200 ring-inset">
      Simulated, inspired by real events
    </span>
  );
}

const INCIDENT_STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-700',
  published: 'bg-slate-900 text-white',
  archived: 'bg-white text-slate-500 ring-1 ring-slate-200 ring-inset',
};

export function IncidentStatusLabel({ status }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${INCIDENT_STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

/** "Package lodash, versions >=3.7.0 <4.17.19" and so on. */
export function describeTarget(target, services = []) {
  if (target.type === 'package') return `Package ${target.packageName}, versions ${target.affectedRange}`;
  if (target.type === 'service') {
    const label = services.find((service) => service.serviceKey === target.serviceKey)?.serviceLabel ?? target.serviceKey;
    return `Anyone using ${label}`;
  }
  return `Apps hosted on ${target.hostingProvider}`;
}

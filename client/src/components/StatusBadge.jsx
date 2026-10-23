// One look per status, used everywhere a project or incident response shows
// its state. `open` means affected with no work started yet.
const STATUSES = {
  open: { label: 'Affected', className: 'bg-red-50 text-red-700 ring-red-600/20' },
  in_progress: { label: 'In progress', className: 'bg-amber-50 text-amber-800 ring-amber-600/25' },
  resolved: { label: 'Resolved', className: 'bg-green-50 text-green-700 ring-green-600/20' },
  not_affected: { label: 'Not affected', className: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  unknown: { label: 'Needs info', className: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
};

export default function StatusBadge({ status }) {
  const { label, className } = STATUSES[status] ?? STATUSES.unknown;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}

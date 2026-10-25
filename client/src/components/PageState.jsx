import { Button } from './Button.jsx';
import Spinner from './Spinner.jsx';

// The three non-happy states every data view needs: loading, error (with a
// retry) and empty (with the next action).

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 px-4 py-16 text-sm text-slate-600">
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div role="alert" className="mx-auto max-w-md px-4 py-16 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
      {onRetry && (
        <Button className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <h2 className="font-semibold">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-slate-600">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

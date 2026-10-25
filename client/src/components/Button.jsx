import { Link } from 'react-router';
import Spinner from './Spinner.jsx';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60';

const VARIANTS = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700',
  secondary: 'bg-white text-slate-900 ring-1 ring-slate-300 ring-inset hover:bg-slate-50',
  ghost: 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
};

function buttonClasses(variant, className) {
  return [BASE, VARIANTS[variant], className].filter(Boolean).join(' ');
}

/** While `loading` the button is disabled, so a request can never be sent twice. */
export function Button({ variant = 'primary', className, type = 'button', loading = false, disabled, children, ...props }) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'primary', className, ...props }) {
  return <Link className={buttonClasses(variant, className)} {...props} />;
}

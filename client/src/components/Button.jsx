import { Link } from 'react-router';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60';

const VARIANTS = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700',
  secondary: 'bg-white text-slate-900 ring-1 ring-slate-300 ring-inset hover:bg-slate-50',
};

function buttonClasses(variant, className) {
  return [BASE, VARIANTS[variant], className].filter(Boolean).join(' ');
}

export function Button({ variant = 'primary', className, type = 'button', ...props }) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}

export function ButtonLink({ variant = 'primary', className, ...props }) {
  return <Link className={buttonClasses(variant, className)} {...props} />;
}

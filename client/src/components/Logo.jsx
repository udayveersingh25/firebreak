/** The mark shows fire on one side, safe ground on the other, and the gap between them. */
export default function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#0f172a" />
        <path d="M9 9h11L9 20z" fill="#f97316" />
        <path d="M23 12v11H12z" fill="#e2e8f0" />
      </svg>
      {/* On very narrow phones the header needs the room; screen readers still hear the name. */}
      <span className="max-[400px]:sr-only">Firebreak</span>
    </span>
  );
}

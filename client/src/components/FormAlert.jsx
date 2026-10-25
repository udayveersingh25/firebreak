/** A form-level error: what went wrong and, when there is one, what to do instead. */
export default function FormAlert({ children }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {children}
    </div>
  );
}

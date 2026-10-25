import { useCallback, useMemo, useRef, useState } from 'react';
import { ToastContext } from '../hooks/useToast.js';

const DISMISS_AFTER_MS = { success: 4000, error: 8000 };

const STYLES = {
  success: { box: 'border-green-200', dot: 'bg-green-600' },
  error: { box: 'border-red-200', dot: 'bg-red-600' },
};

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (type, message) => {
      const id = (nextId.current += 1);
      setToasts((current) => [...current.slice(-2), { id, type, message }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS[type]);
    },
    [dismiss],
  );

  const toast = useMemo(
    () => ({
      success: (message) => show('success', message),
      error: (message) => show('error', message),
    }),
    [show],
  );

  return (
    <ToastContext value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96"
      >
        {toasts.map(({ id, type, message }) => (
          <div
            key={id}
            role={type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border bg-white px-4 py-3 text-sm text-slate-900 shadow-lg ${STYLES[type].box}`}
          >
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${STYLES[type].dot}`} aria-hidden="true" />
            <p className="flex-1">{message}</p>
            <button
              type="button"
              onClick={() => dismiss(id)}
              className="-m-1 rounded p-1 text-slate-500 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-slate-900"
            >
              <span className="sr-only">Dismiss</span>
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

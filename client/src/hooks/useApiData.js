import { useCallback, useEffect, useState } from 'react';

/**
 * Loads data for a page. `status` is 'loading', 'success' or 'error'.
 * `reload()` retries; `setData()` applies the result of a mutation without
 * refetching. A request still in flight when the page changes is cancelled.
 */
export function useApiData(load, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, status: 'loading', error: null }));
    load(controller.signal).then(
      (data) => setState({ status: 'success', data, error: null }),
      (error) => {
        if (error.name !== 'AbortError') setState({ status: 'error', data: null, error });
      },
    );
    return () => controller.abort();
  }, [...deps, attempt]); // callers list what `load` depends on, like useEffect

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  const setData = useCallback(
    (update) =>
      setState((current) => ({ ...current, data: typeof update === 'function' ? update(current.data) : update })),
    [],
  );

  return { ...state, reload, setData };
}

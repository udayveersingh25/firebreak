/** An API failure with a plain-language message that is safe to show. */
export class ApiError extends Error {
  constructor(status, code, message, fields = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

let handleUnauthorized = () => {};

/** Called whenever the API answers 401, e.g. because the session expired. */
export function setUnauthorizedHandler(handler) {
  handleUnauthorized = handler;
}

/**
 * fetch for our JSON API. Same origin, so the browser sends the session cookie
 * automatically. Resolves with the parsed body (null for 204) or throws ApiError.
 */
export async function apiFetch(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach Firebreak. Check your connection and try again.');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (res.ok) return data;

  if (res.status === 401) handleUnauthorized();
  const error = data?.error;
  if (!error) {
    // Not our JSON, e.g. the host's own error page while the server wakes up.
    throw new ApiError(res.status, 'SERVER_UNAVAILABLE', 'Firebreak is not responding right now. Please try again in a minute.');
  }
  throw new ApiError(res.status, error.code, error.message, error.fields);
}

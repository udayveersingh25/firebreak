import { once } from 'node:events';
import { createApp } from '../../src/app.js';

/** Starts the app on a random port. Returns { baseUrl, request, stop }. */
export async function startTestServer() {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(method, path, { body, cookie, rawBody } = {}) {
    const res = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined || rawBody !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  }

  return {
    baseUrl,
    request,
    stop() {
      server.closeAllConnections();
      server.close();
    },
  };
}

/** Registers a user and returns the session cookie ("name=value"). */
export async function registerUser(request, { name, email, password = 'test-password-1' }) {
  const res = await request('POST', '/auth/register', { body: { name, email, password } });
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  return res.headers.getSetCookie().find((c) => c.startsWith('firebreak_session=')).split(';')[0];
}

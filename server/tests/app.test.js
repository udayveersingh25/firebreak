import './helpers/testEnv.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

// These tests run without a database, which is exactly the case the health
// check must report honestly.

async function startServer(options) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function stopServer(server) {
  server.closeAllConnections();
  server.close();
}

describe('API', () => {
  let server;
  let baseUrl;

  before(async () => {
    ({ server, baseUrl } = await startServer());
  });
  after(() => stopServer(server));

  test('health check reports unavailable while the database is disconnected', async () => {
    const res = await fetch(`${baseUrl}/api/health`);

    assert.equal(res.status, 503);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { status: 'unavailable', database: 'disconnected' });
  });

  test('health check is not rate limited, other API routes are', async () => {
    const health = await fetch(`${baseUrl}/api/health`);
    const other = await fetch(`${baseUrl}/api/anything`);

    assert.equal(health.headers.get('ratelimit-policy'), null);
    assert.match(other.headers.get('ratelimit-policy'), /q=300/);
  });

  test('unknown API routes return the standard JSON error shape', async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);

    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await res.json(), {
      error: { code: 'NOT_FOUND', message: 'That API route does not exist.' },
    });
  });

  test('malformed JSON is a 400 that does not echo the body', async () => {
    const res = await fetch(`${baseUrl}/api/anything`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"secret": "sk_live_should_not_echo",',
    });

    assert.equal(res.status, 400);
    const text = await res.text();
    assert.doesNotMatch(text, /sk_live_should_not_echo/);
    assert.equal(JSON.parse(text).error.code, 'INVALID_JSON');
  });

  test('JSON bodies over 100kb are rejected with 413', async () => {
    const res = await fetch(`${baseUrl}/api/anything`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: 'x'.repeat(110_000) }),
    });

    assert.equal(res.status, 413);
    assert.equal((await res.json()).error.code, 'PAYLOAD_TOO_LARGE');
  });

  test('responses carry security headers and hide the framework', async () => {
    const res = await fetch(`${baseUrl}/api/health`);

    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  test('without a built client, page requests are a JSON 404', async () => {
    const res = await fetch(`${baseUrl}/projects/123`, { headers: { accept: 'text/html' } });

    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, 'NOT_FOUND');
  });
});

describe('built client', () => {
  let server;
  let baseUrl;
  let distPath;

  before(async () => {
    distPath = await fs.mkdtemp(path.join(os.tmpdir(), 'firebreak-dist-'));
    await fs.mkdir(path.join(distPath, 'assets'));
    await fs.writeFile(path.join(distPath, 'index.html'), '<!doctype html><title>Firebreak</title>');
    await fs.writeFile(path.join(distPath, 'assets', 'index-abc123.js'), 'export {};');
    ({ server, baseUrl } = await startServer({ clientDistPath: distPath }));
  });
  after(async () => {
    stopServer(server);
    await fs.rm(distPath, { recursive: true, force: true });
  });

  test('deep links get the app shell so React Router can render them', async () => {
    const res = await fetch(`${baseUrl}/projects/123`, { headers: { accept: 'text/html' } });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    assert.match(await res.text(), /<title>Firebreak<\/title>/);
  });

  test('fingerprinted assets are cached for a year', async () => {
    const res = await fetch(`${baseUrl}/assets/index-abc123.js`);

    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /max-age=31536000.*immutable/);
  });

  test('a missing asset is a 404, never the HTML shell', async () => {
    const res = await fetch(`${baseUrl}/assets/index-old999.js`);

    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type'), /application\/json/);
  });

  test('API routes still win over the client fallback', async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`, { headers: { accept: 'text/html' } });

    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, 'NOT_FOUND');
  });
});

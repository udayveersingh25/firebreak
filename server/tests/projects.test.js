import './helpers/testEnv.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { Project } from '../src/models/Project.js';
import { secretsBody } from '../src/validators/project.validators.js';
import { registerUser, startTestServer } from './helpers/http.js';

const demoLockfile = (name) =>
  fs.readFileSync(path.join(import.meta.dirname, '../../demo', name, 'package-lock.json'), 'utf8');
const vibeStoreLockfile = demoLockfile('vibe-store');

// A stand-in for api.osv.dev on the port testEnv.js points OSV_BASE_URL at.
// It knows two real advisories (saved fixtures) and can be switched off.
function startFakeOsv() {
  const vulnsByPackage = { lodash: ['GHSA-p6mc-m468-83gw'], minimist: ['GHSA-xvch-5gv4-984h'] };
  const state = { down: false };
  const server = http.createServer(async (req, res) => {
    if (state.down) {
      res.writeHead(503).end();
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/querybatch') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const results = JSON.parse(body).queries.map(({ package: pkg }) => ({
        vulns: (vulnsByPackage[pkg.name] ?? []).map((id) => ({ id, modified: '2026-01-01T00:00:00Z' })),
      }));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ results }));
      return;
    }
    const id = req.url.replace('/v1/vulns/', '');
    const file = path.join(import.meta.dirname, 'fixtures/osv', `${id}.json`);
    if (req.method === 'GET' && fs.existsSync(file)) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(fs.readFileSync(file));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(4599, '127.0.0.1');
  return { server, state };
}

describe('secret names payload', () => {
  test('accepts a list of names', () => {
    assert.equal(secretsBody.safeParse({ names: ['STRIPE_SECRET_KEY', 'VITE_OPENAI_API_KEY'] }).success, true);
  });

  test('rejects KEY=value strings without repeating them', () => {
    const result = secretsBody.safeParse({ names: ['STRIPE_SECRET_KEY=sk_live_abc123'] });

    assert.equal(result.success, false);
    assert.doesNotMatch(JSON.stringify(result.error.issues), /sk_live_abc123/);
  });

  test('rejects any extra field, such as values', () => {
    assert.equal(secretsBody.safeParse({ names: ['A'], values: ['secret'] }).success, false);
  });

  test('rejects more than 200 names and names over 100 characters', () => {
    assert.equal(secretsBody.safeParse({ names: Array.from({ length: 201 }, (_, i) => `N${i}`) }).success, false);
    assert.equal(secretsBody.safeParse({ names: ['A'.repeat(101)] }).success, false);
  });
});

describe('projects API', { skip: !process.env.TEST_MONGODB_URI && 'set TEST_MONGODB_URI to run' }, () => {
  let api;
  let maya;
  let ravi;
  let projectId;
  let osv;

  async function waitForScan(id) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const { body } = await api.request('GET', `/projects/${id}`, { cookie: maya });
      if (body.project.scan.status !== 'running') return body.project;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('scan did not finish');
  }

  before(async () => {
    osv = startFakeOsv();
    await once(osv.server, 'listening');
    await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: 'firebreak_test_projects' });
    await mongoose.connection.dropDatabase();
    await mongoose.model('User').init();
    api = await startTestServer();
    maya = await registerUser(api.request, { name: 'Maya', email: 'maya@firebreak.test' });
    ravi = await registerUser(api.request, { name: 'Ravi', email: 'ravi@firebreak.test' });
  });

  after(async () => {
    api.stop();
    osv.server.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('projects require a login', async () => {
    assert.equal((await api.request('GET', '/projects')).status, 401);
  });

  test('creating a project validates name and hosting provider', async () => {
    const bad = await api.request('POST', '/projects', { cookie: maya, body: { name: '', hostingProvider: 'heroku' } });

    assert.equal(bad.status, 400);
    assert.deepEqual(Object.keys(bad.body.error.fields).sort(), ['hostingProvider', 'name']);

    const created = await api.request('POST', '/projects', {
      cookie: maya,
      body: { name: 'vibe-store', hostingProvider: 'zeabur', owner: 'someone-else' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.project.lockfile, null);
    assert.equal(created.body.project.owner, undefined);
    projectId = created.body.project.id;
  });

  test('uploading a lockfile records every installed package', async () => {
    const res = await api.request('PUT', `/projects/${projectId}/lockfile`, {
      cookie: maya,
      body: { lockfile: vibeStoreLockfile },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.project.lockfile.lockfileVersion, 3);
    assert.ok(res.body.project.dependencies.some((dep) => dep.name === 'lodash' && dep.version === '4.17.15'));
  });

  test('lockfiles larger than 100 kb are accepted on the lockfile route only', async () => {
    const big = JSON.parse(vibeStoreLockfile);
    big.padding = 'x'.repeat(300_000);
    const lockfileRes = await api.request('PUT', `/projects/${projectId}/lockfile`, {
      cookie: maya,
      body: { lockfile: JSON.stringify(big) },
    });
    const otherRes = await api.request('POST', '/projects', {
      cookie: maya,
      body: { name: 'x'.repeat(300_000), hostingProvider: 'vercel' },
    });

    assert.equal(lockfileRes.status, 200);
    assert.equal(otherRes.status, 413);
  });

  test('bad lockfiles get specific messages', async () => {
    const v1 = await api.request('PUT', `/projects/${projectId}/lockfile`, {
      cookie: maya,
      body: { lockfile: JSON.stringify({ lockfileVersion: 1, dependencies: {} }) },
    });
    const notJson = await api.request('PUT', `/projects/${projectId}/lockfile`, {
      cookie: maya,
      body: { lockfile: 'lodash@^4:\n  version "4.17.21"' },
    });

    assert.equal(v1.status, 400);
    assert.equal(v1.body.error.code, 'LOCKFILE_V1');
    assert.equal(notJson.body.error.code, 'LOCKFILE_INVALID_JSON');
  });

  test('saving secret names classifies them and flags browser exposure', async () => {
    const res = await api.request('PUT', `/projects/${projectId}/secrets`, {
      cookie: maya,
      body: { names: ['VITE_OPENAI_API_KEY', 'VITE_STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY'] },
    });
    const byName = Object.fromEntries(res.body.project.secrets.map((secret) => [secret.name, secret]));

    assert.equal(res.status, 200);
    assert.equal(byName.VITE_OPENAI_API_KEY.exposedInFrontend, true);
    assert.equal(byName.VITE_STRIPE_PUBLISHABLE_KEY.exposedInFrontend, false);
    assert.equal(byName.STRIPE_SECRET_KEY.criticality, 'critical');
  });

  test('a payload containing values is rejected', async () => {
    const res = await api.request('PUT', `/projects/${projectId}/secrets`, {
      cookie: maya,
      body: { names: ['STRIPE_SECRET_KEY=sk_test_123'] },
    });

    assert.equal(res.status, 400);
    assert.doesNotMatch(JSON.stringify(res.body), /sk_test_123/);
  });

  test('uploading a lockfile starts a scan; real risks rank above dev-only noise', async () => {
    const upload = await api.request('PUT', `/projects/${projectId}/lockfile`, {
      cookie: maya,
      body: { lockfile: vibeStoreLockfile },
    });
    assert.equal(upload.body.project.scan.status, 'running');

    const project = await waitForScan(projectId);
    assert.equal(project.scan.status, 'succeeded');
    assert.equal(project.scan.packagesScanned, project.lockfile.packageCount);
    assert.deepEqual(
      project.findings.map((f) => [f.packageName, f.priority, f.fixedVersion]),
      [
        ['lodash', 'fix_now', '4.17.19'],
        ['minimist', 'low_risk', '1.2.6'],
      ],
    );
    assert.equal(project.scan.runId, undefined, 'internal run ID is not sent');
  });

  test('scanning again within 30 seconds is a friendly 429', async () => {
    const res = await api.request('POST', `/projects/${projectId}/scan`, { cookie: maya });

    assert.equal(res.status, 429);
    assert.equal(res.body.error.code, 'SCAN_TOO_SOON');
    assert.match(res.body.error.message, /Please wait \d+ seconds/);
  });

  test('when OSV is down the scan fails visibly and shows no findings', async () => {
    await Project.updateOne({ _id: projectId }, { 'scan.lastRunAt': new Date(Date.now() - 60_000) });
    osv.state.down = true;

    const res = await api.request('POST', `/projects/${projectId}/scan`, { cookie: maya });
    const project = await waitForScan(projectId);
    osv.state.down = false;

    assert.equal(res.status, 202);
    assert.equal(project.scan.status, 'failed');
    assert.match(project.scan.error, /could not reach the vulnerability database/);
    assert.deepEqual(project.findings, []);
  });

  test('a scan stuck in "running" is reported as interrupted, never left spinning', async () => {
    await Project.updateOne(
      { _id: projectId },
      { 'scan.status': 'running', 'scan.lastRunAt': new Date(Date.now() - 10 * 60_000) },
    );

    const { body } = await api.request('GET', `/projects/${projectId}`, { cookie: maya });

    assert.equal(body.project.scan.status, 'failed');
    assert.match(body.project.scan.error, /interrupted/);
  });

  test('a project with no known vulnerabilities says so only after a successful scan', async () => {
    const created = await api.request('POST', '/projects', {
      cookie: maya,
      body: { name: 'calm-notes', hostingProvider: 'vercel' },
    });
    const id = created.body.project.id;
    assert.equal((await api.request('POST', `/projects/${id}/scan`, { cookie: maya })).status, 409);

    await api.request('PUT', `/projects/${id}/lockfile`, { cookie: maya, body: { lockfile: demoLockfile('calm-notes') } });
    const project = await waitForScan(id);

    assert.equal(project.scan.status, 'succeeded');
    assert.deepEqual(project.findings, []);
    assert.ok(project.scan.packagesScanned > 0);
    await api.request('DELETE', `/projects/${id}`, { cookie: maya });
  });

  test('the dashboard list summarises only my projects', async () => {
    const mine = await api.request('GET', '/projects', { cookie: maya });
    const theirs = await api.request('GET', '/projects', { cookie: ravi });

    assert.equal(mine.body.projects.length, 1);
    assert.equal(mine.body.projects[0].exposedCount, 1);
    assert.equal(mine.body.projects[0].secretCount, 3);
    assert.deepEqual(theirs.body.projects, []);
  });

  test('a user can mark a flagged variable as public by design, clearing the flag', async () => {
    const res = await api.request('PATCH', `/projects/${projectId}/secrets/VITE_OPENAI_API_KEY`, {
      cookie: maya,
      body: { criticality: 'public' },
    });
    const secret = res.body.project.secrets.find((s) => s.name === 'VITE_OPENAI_API_KEY');

    assert.equal(res.status, 200);
    assert.equal(secret.userOverride, true);
    assert.equal(secret.exposedInFrontend, false);
  });

  test('the correction survives replacing the names list', async () => {
    const res = await api.request('PUT', `/projects/${projectId}/secrets`, {
      cookie: maya,
      body: { names: ['VITE_OPENAI_API_KEY', 'STRIPE_SECRET_KEY'] },
    });

    assert.equal(res.body.project.secrets.find((s) => s.name === 'VITE_OPENAI_API_KEY').exposedInFrontend, false);
  });

  test('overrides are validated', async () => {
    const unknownName = await api.request('PATCH', `/projects/${projectId}/secrets/NOT_THERE`, {
      cookie: maya,
      body: { criticality: 'high' },
    });
    const badService = await api.request('PATCH', `/projects/${projectId}/secrets/STRIPE_SECRET_KEY`, {
      cookie: maya,
      body: { serviceKey: 'made-up' },
    });
    const empty = await api.request('PATCH', `/projects/${projectId}/secrets/STRIPE_SECRET_KEY`, { cookie: maya, body: {} });

    assert.equal(unknownName.status, 404);
    assert.equal(badService.status, 400);
    assert.equal(empty.status, 400);
  });

  test("another user's project is a 404 for every route, never a 403", async () => {
    const attempts = [
      api.request('GET', `/projects/${projectId}`, { cookie: ravi }),
      api.request('DELETE', `/projects/${projectId}`, { cookie: ravi }),
      api.request('PUT', `/projects/${projectId}/lockfile`, { cookie: ravi, body: { lockfile: vibeStoreLockfile } }),
      api.request('PUT', `/projects/${projectId}/secrets`, { cookie: ravi, body: { names: ['X'] } }),
      api.request('POST', `/projects/${projectId}/scan`, { cookie: ravi }),
      api.request('PATCH', `/projects/${projectId}/secrets/STRIPE_SECRET_KEY`, { cookie: ravi, body: { criticality: 'low' } }),
    ];

    for (const res of await Promise.all(attempts)) {
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    }
    assert.equal((await api.request('GET', `/projects/${projectId}`, { cookie: maya })).status, 200);
  });

  test('malformed and unknown IDs are 404 too', async () => {
    assert.equal((await api.request('GET', '/projects/not-an-id', { cookie: maya })).status, 404);
    assert.equal((await api.request('GET', `/projects/${new mongoose.Types.ObjectId()}`, { cookie: maya })).status, 404);
  });

  test('deleting a project removes it', async () => {
    assert.equal((await api.request('DELETE', `/projects/${projectId}`, { cookie: maya })).status, 204);
    assert.equal((await api.request('GET', `/projects/${projectId}`, { cookie: maya })).status, 404);
  });
});

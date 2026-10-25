import './helpers/testEnv.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { secretsBody } from '../src/validators/project.validators.js';
import { registerUser, startTestServer } from './helpers/http.js';

const vibeStoreLockfile = fs.readFileSync(
  path.join(import.meta.dirname, '../../demo/vibe-store/package-lock.json'),
  'utf8',
);

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

  before(async () => {
    await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: 'firebreak_test_projects' });
    await mongoose.connection.dropDatabase();
    await mongoose.model('User').init();
    api = await startTestServer();
    maya = await registerUser(api.request, { name: 'Maya', email: 'maya@firebreak.test' });
    ravi = await registerUser(api.request, { name: 'Ravi', email: 'ravi@firebreak.test' });
  });

  after(async () => {
    api.stop();
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

  test('the dashboard list summarises only my projects', async () => {
    const mine = await api.request('GET', '/projects', { cookie: maya });
    const theirs = await api.request('GET', '/projects', { cookie: ravi });

    assert.equal(mine.body.projects.length, 1);
    assert.equal(mine.body.projects[0].exposedCount, 1);
    assert.equal(mine.body.projects[0].secretCount, 3);
    assert.deepEqual(theirs.body.projects, []);
  });

  test("another user's project is a 404 for every route, never a 403", async () => {
    const attempts = [
      api.request('GET', `/projects/${projectId}`, { cookie: ravi }),
      api.request('DELETE', `/projects/${projectId}`, { cookie: ravi }),
      api.request('PUT', `/projects/${projectId}/lockfile`, { cookie: ravi, body: { lockfile: vibeStoreLockfile } }),
      api.request('PUT', `/projects/${projectId}/secrets`, { cookie: ravi, body: { names: ['X'] } }),
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

import './helpers/testEnv.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { registerUser, startTestServer } from './helpers/http.js';

const vibeStoreText = fs.readFileSync(path.join(import.meta.dirname, '../../demo/vibe-store/package-lock.json'), 'utf8');

/** vibe-store's lockfile after upgrading lodash. */
function patchedLockfile() {
  const lockfile = JSON.parse(vibeStoreText);
  lockfile.packages['node_modules/lodash'].version = '4.17.21';
  return JSON.stringify(lockfile);
}

const base = {
  description: 'A simulated incident for testing guided responses end to end.',
  severity: 'high',
  sourceUrl: '',
  isSimulated: true,
};

describe('guided response', { skip: !process.env.TEST_MONGODB_URI && 'set TEST_MONGODB_URI to run' }, () => {
  let api;
  let admin;
  let maya;
  let ravi;
  let projectId;
  let lodashResponseId;
  let litellmResponseId;

  async function publish(incident) {
    const { body } = await api.request('POST', '/admin/incidents', { cookie: admin, body: { ...base, ...incident } });
    await api.request('POST', `/admin/incidents/${body.incident.id}/publish`, { cookie: admin });
    return body.incident.id;
  }

  async function responseFor(title) {
    const { body } = await api.request('GET', '/responses', { cookie: maya });
    return body.responses.find((r) => r.incident.title === title);
  }

  const step = (key, done, cookie = maya, id = lodashResponseId) =>
    api.request('PATCH', `/responses/${id}/steps/${encodeURIComponent(key)}`, { cookie, body: { done } });

  before(async () => {
    await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: 'firebreak_test_responses' });
    await mongoose.connection.dropDatabase();
    await Promise.all(['User', 'IncidentResponse', 'Notification'].map((name) => mongoose.model(name).init()));
    api = await startTestServer();
    admin = await registerUser(api.request, { name: 'Admin', email: 'admin@firebreak.test' });
    maya = await registerUser(api.request, { name: 'Maya', email: 'maya@firebreak.test' });
    ravi = await registerUser(api.request, { name: 'Ravi', email: 'ravi@firebreak.test' });

    const { body } = await api.request('POST', '/projects', { cookie: maya, body: { name: 'vibe-store', hostingProvider: 'zeabur' } });
    projectId = body.project.id;
    await api.request('PUT', `/projects/${projectId}/lockfile`, { cookie: maya, body: { lockfile: vibeStoreText } });
    await api.request('PUT', `/projects/${projectId}/secrets`, {
      cookie: maya,
      body: { names: ['VITE_STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'LITELLM_MASTER_KEY', 'JWT_SECRET'] },
    });

    await publish({
      title: 'lodash prototype pollution',
      kind: 'vulnerability',
      target: { type: 'package', packageName: 'lodash', affectedRange: '>=3.7.0 <4.17.19', fixedVersion: '4.17.19' },
    });
    await publish({ title: 'LiteLLM proxy compromise', kind: 'compromise', target: { type: 'service', serviceKey: 'litellm' } });
    lodashResponseId = (await responseFor('lodash prototype pollution')).id;
    litellmResponseId = (await responseFor('LiteLLM proxy compromise')).id;
  });

  after(async () => {
    api.stop();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('the response page has the reason, the playbook and the incident', async () => {
    const { status, body } = await api.request('GET', `/responses/${lodashResponseId}`, { cookie: maya });

    assert.equal(status, 200);
    assert.equal(body.response.status, 'open');
    assert.equal(body.response.affectedReason, 'You have lodash 4.17.15 installed. Versions below 4.17.19 are affected.');
    assert.deepEqual(body.response.steps.map((s) => [s.key, s.type]), [
      ['upgrade', 'manual'],
      ['redeploy', 'manual'],
      ['verify_lockfile', 'auto_verify'],
    ]);
    assert.equal(body.incident.isSimulated, true);
    assert.equal(body.project.name, 'vibe-store');
  });

  test('a compromise lists each exposed secret with what it unlocks', async () => {
    const { body } = await api.request('GET', `/responses/${litellmResponseId}`, { cookie: maya });

    assert.deepEqual(body.affectedSecrets, [
      {
        name: 'LITELLM_MASTER_KEY',
        serviceLabel: 'LiteLLM proxy',
        capability: 'Use every AI provider key configured in your proxy',
        criticality: 'critical',
      },
    ]);
  });

  test("another user's response is a 404 for every route", async () => {
    const attempts = await Promise.all([
      api.request('GET', `/responses/${lodashResponseId}`, { cookie: ravi }),
      step('upgrade', true, ravi),
      api.request('POST', `/responses/${lodashResponseId}/resolve`, { cookie: ravi }),
      api.request('POST', `/responses/${lodashResponseId}/not-affected`, { cookie: ravi, body: { reason: 'Not mine at all, really.' } }),
      api.request('POST', `/responses/${lodashResponseId}/reopen`, { cookie: ravi }),
    ]);

    for (const res of attempts) assert.equal(res.status, 404);
    assert.deepEqual((await api.request('GET', '/responses', { cookie: ravi })).body.responses, []);
  });

  test('the automatic lockfile step cannot be ticked by hand', async () => {
    const res = await step('verify_lockfile', true);

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'AUTO_VERIFY_STEP');
  });

  test('resolving early is refused by the server', async () => {
    const res = await api.request('POST', `/responses/${lodashResponseId}/resolve`, { cookie: maya });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'STEPS_REMAINING');
  });

  test('ticking the first step moves the response to in progress', async () => {
    const res = await step('upgrade', true);

    assert.equal(res.body.response.status, 'in_progress');
  });

  test('with every manual step done it still waits for the lockfile check', async () => {
    await step('redeploy', true);
    const res = await api.request('POST', `/responses/${lodashResponseId}/resolve`, { cookie: maya });

    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /including the lockfile check/);
  });

  test('a lockfile that still has the affected version does not pass the check', async () => {
    await api.request('PUT', `/projects/${projectId}/lockfile`, { cookie: maya, body: { lockfile: vibeStoreText } });
    const { body } = await api.request('GET', `/responses/${lodashResponseId}`, { cookie: maya });

    assert.equal(body.response.steps.find((s) => s.key === 'verify_lockfile').done, false);
  });

  test('a lockfile without the affected version completes the check, then resolve works', async () => {
    await api.request('PUT', `/projects/${projectId}/lockfile`, { cookie: maya, body: { lockfile: patchedLockfile() } });

    const before = await api.request('GET', `/responses/${lodashResponseId}`, { cookie: maya });
    const check = before.body.response.steps.find((s) => s.key === 'verify_lockfile');
    assert.equal(check.done, true);

    const res = await api.request('POST', `/responses/${lodashResponseId}/resolve`, { cookie: maya });
    assert.equal(res.status, 200);
    assert.equal(res.body.response.status, 'resolved');
  });

  test('the timeline records every action with time and actor', async () => {
    const { body } = await api.request('GET', `/responses/${lodashResponseId}`, { cookie: maya });

    assert.deepEqual(
      body.response.timeline.map((e) => [e.actor, e.action]),
      [
        ['system', 'Matched to this incident'],
        ['user', 'Step completed'],
        ['user', 'Status: in progress'],
        ['user', 'Step completed'],
        ['system', 'Verified from your lockfile'],
        ['user', 'Resolved'],
      ],
    );
    assert.ok(body.response.timeline.every((e) => !Number.isNaN(Date.parse(e.at))));
  });

  test('a resolved response is read-only', async () => {
    const res = await step('upgrade', false);

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'RESOLVED');
  });

  test('"not affected" needs a reason of at least 10 characters, and can be reopened', async () => {
    const short = await api.request('POST', `/responses/${litellmResponseId}/not-affected`, { cookie: maya, body: { reason: 'nope' } });
    assert.equal(short.status, 400);

    const declared = await api.request('POST', `/responses/${litellmResponseId}/not-affected`, {
      cookie: maya,
      body: { reason: 'We removed LiteLLM last week.' },
    });
    assert.equal(declared.body.response.status, 'not_affected');
    assert.equal(declared.body.response.notAffectedReason, 'We removed LiteLLM last week.');

    const reopened = await api.request('POST', `/responses/${litellmResponseId}/reopen`, { cookie: maya });
    assert.equal(reopened.body.response.status, 'open');
  });

  test('an unknown response gets its playbook when the missing data arrives', async () => {
    const { body } = await api.request('POST', '/projects', { cookie: maya, body: { name: 'later', hostingProvider: 'render' } });
    const before = (await api.request('GET', `/responses?project=${body.project.id}`, { cookie: maya })).body.responses;
    assert.deepEqual(before.map((r) => [r.incident.title, r.status, r.stepsTotal]).sort(), [
      ['LiteLLM proxy compromise', 'unknown', 0],
      ['lodash prototype pollution', 'unknown', 0],
    ]);

    await api.request('PUT', `/projects/${body.project.id}/secrets`, { cookie: maya, body: { names: ['LITELLM_MASTER_KEY'] } });

    const litellm = (await api.request('GET', `/responses?project=${body.project.id}`, { cookie: maya })).body.responses.find(
      (r) => r.incident.title === 'LiteLLM proxy compromise',
    );
    assert.equal(litellm.status, 'open');
    assert.ok(litellm.stepsTotal >= 4);
  });

  test('the list filter is validated', async () => {
    assert.equal((await api.request('GET', '/responses?project=not-an-id', { cookie: maya })).status, 400);
  });

  test('the dashboard counts responses per project', async () => {
    const { body } = await api.request('GET', '/projects', { cookie: maya });
    const vibe = body.projects.find((p) => p.id === projectId);

    assert.deepEqual(vibe.incidentCounts, { open: 1, in_progress: 0, unknown: 0, resolved: 1, not_affected: 0 });
  });
});

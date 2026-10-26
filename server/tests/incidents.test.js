import './helpers/testEnv.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { IncidentResponse } from '../src/models/IncidentResponse.js';
import { Notification } from '../src/models/Notification.js';
import { registerUser, startTestServer } from './helpers/http.js';

const demoLockfile = (name) =>
  fs.readFileSync(path.join(import.meta.dirname, '../../demo', name, 'package-lock.json'), 'utf8');

const litellmIncident = {
  title: 'LiteLLM proxy compromise',
  description: 'A simulated compromise of LiteLLM proxy deployments, inspired by real supply-chain incidents.',
  kind: 'compromise',
  severity: 'critical',
  sourceUrl: '',
  isSimulated: true,
  target: { type: 'service', serviceKey: 'litellm' },
};

describe('incidents, fan-out and notifications', { skip: !process.env.TEST_MONGODB_URI && 'set TEST_MONGODB_URI to run' }, () => {
  let api;
  let admin;
  let maya;
  let ravi;
  let incidentId;
  let mayaProjectId;

  const responsesFor = (filter = {}) => IncidentResponse.countDocuments({ incident: incidentId, ...filter });
  const notificationCount = () => Notification.countDocuments();

  async function createProject(cookie, name, hostingProvider, { lockfile, names } = {}) {
    const { body } = await api.request('POST', '/projects', { cookie, body: { name, hostingProvider } });
    const id = body.project.id;
    if (lockfile) await api.request('PUT', `/projects/${id}/lockfile`, { cookie, body: { lockfile } });
    if (names) await api.request('PUT', `/projects/${id}/secrets`, { cookie, body: { names } });
    return id;
  }

  before(async () => {
    await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: 'firebreak_test_incidents' });
    await mongoose.connection.dropDatabase();
    await Promise.all(['User', 'IncidentResponse', 'Notification'].map((name) => mongoose.model(name).init()));
    api = await startTestServer();
    admin = await registerUser(api.request, { name: 'Admin', email: 'admin@firebreak.test' });
    maya = await registerUser(api.request, { name: 'Maya', email: 'maya@firebreak.test' });
    ravi = await registerUser(api.request, { name: 'Ravi', email: 'ravi@firebreak.test' });

    // affected: uses LiteLLM
    mayaProjectId = await createProject(maya, 'vibe-store', 'zeabur', {
      lockfile: demoLockfile('vibe-store'),
      names: ['VITE_OPENAI_API_KEY', 'STRIPE_SECRET_KEY', 'LITELLM_MASTER_KEY', 'JWT_SECRET'],
    });
    // not affected: secrets known, no LiteLLM
    await createProject(ravi, 'calm-notes', 'vercel', {
      lockfile: demoLockfile('calm-notes'),
      names: ['MONGODB_URI', 'JWT_SECRET', 'ANTHROPIC_API_KEY'],
    });
    // unknown: no secret names yet
    await createProject(ravi, 'side-project', 'render');
  });

  after(async () => {
    api.stop();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('every admin route is 403 for a normal user and 401 when logged out', async () => {
    const routes = [
      ['GET', '/admin/incidents'],
      ['POST', '/admin/incidents'],
      ['GET', '/admin/incidents/000000000000000000000000'],
      ['PATCH', '/admin/incidents/000000000000000000000000'],
      ['POST', '/admin/incidents/000000000000000000000000/preview'],
      ['POST', '/admin/incidents/000000000000000000000000/publish'],
      ['POST', '/admin/incidents/000000000000000000000000/archive'],
    ];
    for (const [method, route] of routes) {
      const body = method === 'GET' ? undefined : litellmIncident;
      assert.equal((await api.request(method, route, { cookie: maya, body })).status, 403, route);
      assert.equal((await api.request(method, route, { body })).status, 401, route);
    }
  });

  test('drafts are validated, including the version range', async () => {
    const res = await api.request('POST', '/admin/incidents', {
      cookie: admin,
      body: {
        ...litellmIncident,
        title: 'x',
        target: { type: 'package', packageName: 'Not A Package!', affectedRange: 'not-a-range' },
      },
    });

    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.body.error.fields).sort(), [
      'target.affectedRange',
      'target.packageName',
      'title',
    ]);
  });

  test('an admin creates a draft', async () => {
    const res = await api.request('POST', '/admin/incidents', { cookie: admin, body: litellmIncident });

    assert.equal(res.status, 201);
    assert.equal(res.body.incident.status, 'draft');
    assert.equal(res.body.incident.sourceUrl, null);
    incidentId = res.body.incident.id;
  });

  test('preview counts matches and writes nothing', async () => {
    const res = await api.request('POST', `/admin/incidents/${incidentId}/preview`, { cookie: admin });

    assert.deepEqual(res.body.counts, { affected: 1, unknown: 1 });
    assert.equal(await responsesFor(), 0);
    assert.equal(await notificationCount(), 0);
  });

  test('publishing creates exactly the previewed responses, one notification each', async () => {
    const res = await api.request('POST', `/admin/incidents/${incidentId}/publish`, { cookie: admin });

    assert.equal(res.body.incident.status, 'published');
    assert.deepEqual(res.body.incident.matchedCounts, { affected: 1, unknown: 1 });
    assert.equal(await responsesFor({ status: 'open' }), 1);
    assert.equal(await responsesFor({ status: 'unknown' }), 1);
    assert.equal(await notificationCount(), 2);
  });

  test('the response explains why, and lists only the LiteLLM secret', async () => {
    const response = await IncidentResponse.findOne({ incident: incidentId, project: mayaProjectId });

    assert.equal(response.affectedReason, 'This project uses LITELLM_MASTER_KEY (LiteLLM proxy).');
    assert.deepEqual(response.affectedSecrets, ['LITELLM_MASTER_KEY']);
    assert.equal(response.timeline[0].actor, 'system');
  });

  test('publishing again never duplicates responses or notifications', async () => {
    const res = await api.request('POST', `/admin/incidents/${incidentId}/publish`, { cookie: admin });

    assert.deepEqual(res.body.incident.matchedCounts, { affected: 1, unknown: 1 });
    assert.equal(await responsesFor(), 2);
    assert.equal(await notificationCount(), 2);
  });

  test('a retry fills a notification lost to a crash, still exactly one each', async () => {
    await Notification.deleteOne({ title: /LiteLLM/ });

    await api.request('POST', `/admin/incidents/${incidentId}/publish`, { cookie: admin });

    assert.equal(await notificationCount(), 2);
  });

  test('a published incident cannot be edited', async () => {
    const res = await api.request('PATCH', `/admin/incidents/${incidentId}`, { cookie: admin, body: litellmIncident });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'NOT_A_DRAFT');
  });

  test('a project created after publishing is matched immediately', async () => {
    const lateId = await createProject(maya, 'late-joiner', 'railway', { names: ['LITELLM_MASTER_KEY'] });

    const response = await IncidentResponse.findOne({ incident: incidentId, project: lateId });
    assert.equal(response.status, 'open');
  });

  test('an unknown response becomes open when the missing names arrive, with a notification', async () => {
    const id = await createProject(maya, 'unknown-first', 'render');
    assert.equal((await IncidentResponse.findOne({ incident: incidentId, project: id })).status, 'unknown');
    const before = await Notification.countDocuments({ link: /responses/ });

    await api.request('PUT', `/projects/${id}/secrets`, { cookie: maya, body: { names: ['LITELLM_MASTER_KEY'] } });

    const response = await IncidentResponse.findOne({ incident: incidentId, project: id });
    assert.equal(response.status, 'open');
    assert.equal(response.timeline.at(-1).action, 'Checked again: affected');
    assert.equal(await Notification.countDocuments({ link: /responses/ }), before + 1);
  });

  test('an unknown response clears itself when the names show it does not apply', async () => {
    const id = await createProject(ravi, 'cleared-later', 'render');

    await api.request('PUT', `/projects/${id}/secrets`, { cookie: ravi, body: { names: ['JWT_SECRET'] } });

    const response = await IncidentResponse.findOne({ incident: incidentId, project: id });
    assert.equal(response.status, 'not_affected');
    assert.equal(response.notAffectedReason, 'Checked after your upload: not affected.');
  });

  test('admins see totals per status, never projects or people', async () => {
    const res = await api.request('GET', '/admin/incidents', { cookie: admin });
    const [incident] = res.body.incidents;

    assert.equal(incident.responseCounts.open, 3);
    assert.doesNotMatch(JSON.stringify(res.body), /vibe-store|maya|ravi|LITELLM_MASTER_KEY/i);
  });

  test("admins cannot open a user's project", async () => {
    assert.equal((await api.request('GET', `/projects/${mayaProjectId}`, { cookie: admin })).status, 404);
  });

  test('users see their own notifications, newest first, and can mark them read', async () => {
    const list = await api.request('GET', '/notifications', { cookie: maya });
    assert.ok(list.body.unreadCount >= 3);
    assert.ok(list.body.notifications.every((n) => n.link.startsWith('/responses/')));
    const [first] = list.body.notifications;

    const theirs = await api.request('PATCH', `/notifications/${first.id}/read`, { cookie: ravi });
    const mine = await api.request('PATCH', `/notifications/${first.id}/read`, { cookie: maya });
    assert.equal(theirs.status, 404);
    assert.ok(mine.body.notification.readAt);

    await api.request('PATCH', '/notifications/read-all', { cookie: maya });
    assert.equal((await api.request('GET', '/notifications', { cookie: maya })).body.unreadCount, 0);
  });

  test('an archived incident no longer matches new projects', async () => {
    await api.request('POST', `/admin/incidents/${incidentId}/archive`, { cookie: admin });
    const id = await createProject(maya, 'after-archive', 'render', { names: ['LITELLM_MASTER_KEY'] });

    assert.equal(await IncidentResponse.countDocuments({ incident: incidentId, project: id }), 0);
    assert.equal((await api.request('POST', `/admin/incidents/${incidentId}/publish`, { cookie: admin })).status, 409);
  });

  test('a package incident uses the lockfile: affected, not affected, or unknown without one', async () => {
    const created = await api.request('POST', '/admin/incidents', {
      cookie: admin,
      body: {
        ...litellmIncident,
        title: 'lodash prototype pollution',
        kind: 'vulnerability',
        severity: 'high',
        sourceUrl: 'https://osv.dev/vulnerability/GHSA-p6mc-m468-83gw',
        target: { type: 'package', packageName: 'lodash', affectedRange: '>=3.7.0 <4.17.19', fixedVersion: '4.17.19' },
      },
    });
    const preview = await api.request('POST', `/admin/incidents/${created.body.incident.id}/preview`, { cookie: admin });

    // vibe-store has lodash 4.17.15; calm-notes has no lodash; projects without a lockfile are unknown.
    assert.equal(preview.body.counts.affected, 1);
    assert.equal(preview.body.counts.unknown, 5);
  });

  test('deleting a project removes its responses and their notifications', async () => {
    const response = await IncidentResponse.findOne({ project: mayaProjectId });

    await api.request('DELETE', `/projects/${mayaProjectId}`, { cookie: maya });

    assert.equal(await IncidentResponse.countDocuments({ project: mayaProjectId }), 0);
    assert.equal(await Notification.countDocuments({ link: `/responses/${response._id}` }), 0);
  });
});

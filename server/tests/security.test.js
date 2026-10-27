import './helpers/testEnv.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { registerUser, startTestServer } from './helpers/http.js';
import { TEST_JWT_SECRET } from './helpers/testEnv.js';

// The security review as tests: each one is an attack an evaluator might try.

const litellmIncident = {
  title: 'LiteLLM proxy compromise',
  description: 'A simulated compromise used to check who can see which response.',
  kind: 'compromise',
  severity: 'critical',
  sourceUrl: '',
  isSimulated: true,
  target: { type: 'service', serviceKey: 'litellm' },
};

const sessionCookie = (token) => `firebreak_session=${token}`;
const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('security review', { skip: !process.env.TEST_MONGODB_URI && 'set TEST_MONGODB_URI to run' }, () => {
  let api;
  let admin;
  let maya;
  let ravi;
  let mayaId;
  let raviId;
  let projectId;
  let responseId;
  let notificationId;

  before(async () => {
    await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: 'firebreak_test_security' });
    await mongoose.connection.dropDatabase();
    await Promise.all(['User', 'IncidentResponse', 'Notification'].map((name) => mongoose.model(name).init()));
    api = await startTestServer();

    admin = await registerUser(api.request, { name: 'Admin', email: 'admin@firebreak.test' });
    maya = await registerUser(api.request, { name: 'Maya', email: 'maya@firebreak.test' });
    ravi = await registerUser(api.request, { name: 'Ravi', email: 'ravi@firebreak.test' });
    mayaId = (await api.request('GET', '/auth/me', { cookie: maya })).body.user.id;
    raviId = (await api.request('GET', '/auth/me', { cookie: ravi })).body.user.id;

    const { body } = await api.request('POST', '/projects', { cookie: maya, body: { name: 'vibe-store', hostingProvider: 'zeabur' } });
    projectId = body.project.id;
    await api.request('PUT', `/projects/${projectId}/secrets`, { cookie: maya, body: { names: ['LITELLM_MASTER_KEY'] } });

    const draft = await api.request('POST', '/admin/incidents', { cookie: admin, body: litellmIncident });
    await api.request('POST', `/admin/incidents/${draft.body.incident.id}/publish`, { cookie: admin });
    responseId = (await api.request('GET', '/responses', { cookie: maya })).body.responses[0].id;
    notificationId = (await api.request('GET', '/notifications', { cookie: maya })).body.notifications[0].id;
  });

  after(async () => {
    api.stop();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('every user route is 401 when logged out', async () => {
    const routes = [
      ['GET', '/auth/me'],
      ['GET', '/projects'],
      ['POST', '/projects'],
      ['GET', `/projects/${projectId}`],
      ['DELETE', `/projects/${projectId}`],
      ['PUT', `/projects/${projectId}/lockfile`],
      ['POST', `/projects/${projectId}/scan`],
      ['PUT', `/projects/${projectId}/secrets`],
      ['PATCH', `/projects/${projectId}/secrets/LITELLM_MASTER_KEY`],
      ['GET', '/responses'],
      ['GET', `/responses/${responseId}`],
      ['PATCH', `/responses/${responseId}/steps/redeploy`],
      ['POST', `/responses/${responseId}/not-affected`],
      ['POST', `/responses/${responseId}/reopen`],
      ['POST', `/responses/${responseId}/resolve`],
      ['GET', '/notifications'],
      ['PATCH', '/notifications/read-all'],
      ['PATCH', `/notifications/${notificationId}/read`],
    ];
    for (const [method, route] of routes) {
      const res = await api.request(method, route, { body: method === 'GET' ? undefined : {} });
      assert.equal(res.status, 401, `${method} ${route}`);
      assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    }
  });

  test('forged, tampered and expired session tokens are rejected', async () => {
    const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: mayaId })}.`;
    const wrongSecret = jwt.sign({}, 'not-the-server-secret-but-long-enough-000', { subject: mayaId, expiresIn: 3600 });
    const expired = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 60 }, TEST_JWT_SECRET, { subject: mayaId });
    const [header, , signature] = maya.split('=')[1].split('.');
    const swappedUser = `${header}.${base64url({ sub: raviId })}.${signature}`;

    for (const token of [unsigned, wrongSecret, expired, swappedUser, 'garbage']) {
      const res = await api.request('GET', '/auth/me', { cookie: sessionCookie(token) });
      assert.equal(res.status, 401, token);
    }
  });

  test("nobody but the owner can reach a response or notification, admins included", async () => {
    for (const cookie of [ravi, admin]) {
      assert.equal((await api.request('GET', `/responses/${responseId}`, { cookie })).status, 404);
      assert.equal((await api.request('POST', `/responses/${responseId}/resolve`, { cookie })).status, 404);
      assert.equal((await api.request('PATCH', `/notifications/${notificationId}/read`, { cookie })).status, 404);
      assert.equal((await api.request('GET', `/projects/${projectId}`, { cookie })).status, 404);
      // Filtering by someone else's project never widens the list beyond your own.
      const list = await api.request('GET', `/responses?project=${projectId}`, { cookie });
      assert.deepEqual(list.body.responses, []);
    }
  });

  test('NoSQL operator payloads are validation errors, never queries', async () => {
    const login = await api.request('POST', '/auth/login', { body: { email: { $gt: '' }, password: { $gt: '' } } });
    const register = await api.request('POST', '/auth/register', {
      body: { name: 'X', email: { $ne: null }, password: 'long-enough-password' },
    });
    const secrets = await api.request('PUT', `/projects/${projectId}/secrets`, { cookie: maya, body: { names: [{ $gt: '' }] } });
    const step = await api.request('PATCH', `/responses/${responseId}/steps/redeploy`, { cookie: maya, body: { done: { $ne: false } } });

    for (const res of [login, register, secrets, step]) assert.equal(res.status, 400);
    // Bracket syntax in the query string is not turned into an operator object.
    const query = await api.request('GET', '/responses?project[$ne]=000000000000000000000000', { cookie: ravi });
    assert.equal(query.status, 200);
    assert.deepEqual(query.body.responses, []);
  });

  test('request bodies cannot set fields the server owns', async () => {
    const register = await api.request('POST', '/auth/register', {
      body: { name: 'Eve', email: 'eve@firebreak.test', password: 'long-enough-password', role: 'admin' },
    });
    assert.equal(register.body.user.role, 'user');

    const created = await api.request('POST', '/projects', {
      cookie: ravi,
      body: {
        name: 'sneaky',
        hostingProvider: 'render',
        owner: mayaId,
        scan: { status: 'succeeded' },
        findings: [{ vulnId: 'FAKE' }],
      },
    });
    assert.equal(created.status, 201);
    const stored = await mongoose.model('Project').findById(created.body.project.id).lean();
    assert.equal(String(stored.owner), raviId);
    assert.equal(created.body.project.scan.status, 'never');
    assert.deepEqual(created.body.project.findings, []);

    const draft = await api.request('POST', '/admin/incidents', { cookie: admin, body: { ...litellmIncident, status: 'published' } });
    assert.equal(draft.body.incident.status, 'draft');
    const edited = await api.request('PATCH', `/admin/incidents/${draft.body.incident.id}`, {
      cookie: admin,
      body: { ...litellmIncident, status: 'published', matchedCounts: { affected: 999 } },
    });
    assert.equal(edited.body.incident.status, 'draft');
    assert.equal(edited.body.incident.matchedCounts.affected, 0);
  });

  test('secret values are rejected and never repeated back', async () => {
    const attempts = [
      { names: ['STRIPE_SECRET_KEY=sk_live_abc123secret'] },
      { names: ['STRIPE_SECRET_KEY'], values: ['sk_live_abc123secret'] },
      { names: 'STRIPE_SECRET_KEY=sk_live_abc123secret' },
    ];
    for (const body of attempts) {
      const res = await api.request('PUT', `/projects/${projectId}/secrets`, { cookie: maya, body });
      assert.equal(res.status, 400);
      assert.doesNotMatch(JSON.stringify(res.body), /sk_live_abc123secret/);
    }
  });

  test('oversized bodies are refused, and a lockfile is only read for its owner', async () => {
    const big = { name: 'x'.repeat(200 * 1024), hostingProvider: 'render' };
    assert.equal((await api.request('POST', '/projects', { cookie: maya, body: big })).status, 413);

    const huge = { lockfile: 'x'.repeat(7 * 1024 * 1024) };
    const path = `/projects/${projectId}/lockfile`;
    // Before the login and ownership checks pass, the body is not even parsed.
    assert.equal((await api.request('PUT', path, { body: huge })).status, 401);
    assert.equal((await api.request('PUT', path, { cookie: ravi, body: huge })).status, 404);
    assert.equal((await api.request('PUT', path, { cookie: maya, body: huge })).status, 413);
  });

  test('malformed JSON gets a plain 400 with no internals', async () => {
    const res = await api.request('POST', '/projects', { cookie: maya, rawBody: '{"name": ' });

    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.body.error).sort(), ['code', 'message']);
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });

  test('a role change or a deleted account applies on the next request', async () => {
    const User = mongoose.model('User');
    await User.updateOne({ email: 'admin@firebreak.test' }, { role: 'user' });
    assert.equal((await api.request('GET', '/admin/incidents', { cookie: admin })).status, 403);
    await User.updateOne({ email: 'admin@firebreak.test' }, { role: 'admin' });
    assert.equal((await api.request('GET', '/admin/incidents', { cookie: admin })).status, 200);

    const eve = await registerUser(api.request, { name: 'Eve', email: 'eve2@firebreak.test' });
    await User.deleteOne({ email: 'eve2@firebreak.test' });
    const res = await api.request('GET', '/auth/me', { cookie: eve });
    assert.equal(res.status, 401);
    // The dead cookie is cleared, not left in the browser.
    assert.match(res.headers.get('set-cookie'), /firebreak_session=;/);
  });

  test('the session cookie is httpOnly, SameSite=Lax and site-wide', async () => {
    const res = await api.request('POST', '/auth/login', { body: { email: 'maya@firebreak.test', password: 'test-password-1' } });
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('firebreak_session='));

    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    assert.doesNotMatch(JSON.stringify(res.body), /eyJ/); // the token is never in the response body
  });
});

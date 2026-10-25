import './helpers/testEnv.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';

let server;
let baseUrl;

before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  server.close();
  await mongoose.disconnect();
});

function post(path, body, cookie) {
  return fetch(`${baseUrl}/api/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
    body: JSON.stringify(body ?? {}),
  });
}

function getMe(cookie) {
  return fetch(`${baseUrl}/api/auth/me`, { headers: cookie ? { cookie } : {} });
}

/** The session cookie from a response, ready to send back ("name=value"). */
function sessionCookie(res) {
  const header = res.headers.getSetCookie().find((c) => c.startsWith('firebreak_session='));
  return header?.split(';')[0];
}

describe('auth without a database', () => {
  test('/me without a session is 401', async () => {
    const res = await getMe();

    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), {
      error: { code: 'UNAUTHENTICATED', message: 'Please log in to continue.' },
    });
  });

  test('/me with a garbage session is 401 and clears the cookie', async () => {
    const res = await getMe('firebreak_session=not-a-real-token');

    assert.equal(res.status, 401);
    assert.match(res.headers.getSetCookie().join(), /firebreak_session=;.*Expires=Thu, 01 Jan 1970/);
  });

  test('invalid sign-up details come back as field messages', async () => {
    const res = await post('/register', { name: '', email: 'nope', password: 'short' });
    const { error } = await res.json();

    assert.equal(res.status, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.deepEqual(error.fields, {
      name: 'Enter your name',
      email: 'Enter a valid email address',
      password: 'Use at least 8 characters',
    });
  });

  test('NoSQL operators in a login are rejected before any query runs', async () => {
    const res = await post('/login', { email: { $gt: '' }, password: { $ne: null } });

    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'VALIDATION_ERROR');
  });

  test('logout always succeeds and clears the cookie', async () => {
    const res = await post('/logout');

    assert.equal(res.status, 204);
    const cleared = res.headers.getSetCookie().join();
    assert.match(cleared, /firebreak_session=;/);
    assert.match(cleared, /HttpOnly/);
    assert.match(cleared, /SameSite=Lax/);
  });
});

// Runs only when TEST_MONGODB_URI is set. It always uses a separate database
// named firebreak_test_auth, which is wiped before and after (each test file gets its own,
// because files run in parallel).
describe('auth with a database', { skip: !process.env.TEST_MONGODB_URI && 'set TEST_MONGODB_URI to run' }, () => {
  const maya = { name: 'Maya', email: 'maya@firebreak.test', password: 'maya-password-1' };

  before(async () => {
    await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: 'firebreak_test_auth' });
    await mongoose.connection.dropDatabase();
    await User.init(); // build the unique email index before the duplicate tests
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
  });

  test('register creates a user, starts a session and never returns the hash', async () => {
    const res = await post('/register', { ...maya, role: 'admin' });
    const body = await res.json();

    assert.equal(res.status, 201);
    assert.deepEqual(Object.keys(body.user).sort(), ['email', 'id', 'name', 'role']);
    assert.equal(body.user.role, 'user', 'role in the request body is ignored');

    const setCookie = res.headers.getSetCookie().join();
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /Path=\//);

    const me = await getMe(sessionCookie(res));
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.email, maya.email);
  });

  test('stores a bcrypt hash, not the password', async () => {
    const user = await User.findOne({ email: maya.email }).select('+passwordHash');

    assert.match(user.passwordHash, /^\$2b\$12\$/);
  });

  test('the same email cannot register twice, whatever its capitalisation', async () => {
    const res = await post('/register', { ...maya, email: 'MAYA@firebreak.test' });

    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.code, 'EMAIL_TAKEN');
  });

  test('emails listed in ADMIN_EMAILS become admins', async () => {
    const res = await post('/register', { name: 'Admin', email: 'admin@firebreak.test', password: 'admin-password-1' });

    assert.equal((await res.json()).user.role, 'admin');
  });

  test('wrong password and unknown email get the same answer', async () => {
    const wrongPassword = await post('/login', { email: maya.email, password: 'not-her-password' });
    const unknownEmail = await post('/login', { email: 'nobody@firebreak.test', password: 'whatever-123' });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.deepEqual(await wrongPassword.json(), await unknownEmail.json());
    assert.equal(sessionCookie(wrongPassword), undefined);
  });

  test('login with the right password starts a session', async () => {
    const res = await post('/login', { email: 'Maya@Firebreak.test', password: maya.password });

    assert.equal(res.status, 200);
    assert.equal((await getMe(sessionCookie(res))).status, 200);
  });

  test('role changes apply on the next request, without logging in again', async () => {
    const cookie = sessionCookie(await post('/login', { email: maya.email, password: maya.password }));
    await User.updateOne({ email: maya.email }, { role: 'admin' });

    assert.equal((await (await getMe(cookie)).json()).user.role, 'admin');
    await User.updateOne({ email: maya.email }, { role: 'user' });
  });

  test("a deleted account's session stops working immediately", async () => {
    const res = await post('/register', { name: 'Temp', email: 'temp@firebreak.test', password: 'temp-password-1' });
    const cookie = sessionCookie(res);
    await User.deleteOne({ email: 'temp@firebreak.test' });

    assert.equal((await getMe(cookie)).status, 401);
  });

  // Keep last: it uses up this IP's failed-login allowance.
  test('failed logins are limited to 10 per 15 minutes', async () => {
    let res;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      res = await post('/login', { email: maya.email, password: 'guessing-123' });
    }

    assert.equal(res.status, 429);
    assert.equal((await res.json()).error.code, 'RATE_LIMITED');
  });
});

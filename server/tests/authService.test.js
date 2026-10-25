import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  hashPassword,
  isAdminEmail,
  readSessionToken,
  signSessionToken,
  verifyPassword,
} from '../src/services/authService.js';

const SECRET = 'unit-test-secret-that-is-long-enough-0001';
const USER_ID = '64b7f0c2a1b2c3d4e5f60718';

test('hashes passwords with bcrypt cost 12 and verifies them', async () => {
  const hash = await hashPassword('correct horse battery');

  assert.match(hash, /^\$2b\$12\$/);
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
});

test('an unknown account never verifies', async () => {
  assert.equal(await verifyPassword('anything', null), false);
});

test('session tokens carry only the user ID and expire after 7 days', () => {
  const token = signSessionToken(USER_ID, SECRET);
  const payload = jwt.decode(token);

  assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'sub']);
  assert.equal(payload.sub, USER_ID);
  assert.equal(payload.exp - payload.iat, 7 * 24 * 60 * 60);
  assert.equal(readSessionToken(token, SECRET), USER_ID);
});

test('rejects tampered, foreign, expired, unsigned and missing tokens', () => {
  const token = signSessionToken(USER_ID, SECRET);
  const [header, , signature] = token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ sub: 'someone-else' })).toString('base64url');
  const expired = jwt.sign({ sub: USER_ID, exp: Math.floor(Date.now() / 1000) - 10 }, SECRET);
  const unsigned = jwt.sign({ sub: USER_ID }, null, { algorithm: 'none' });

  assert.equal(readSessionToken(`${header}.${forgedPayload}.${signature}`, SECRET), null);
  assert.equal(readSessionToken(signSessionToken(USER_ID, 'a-different-secret-entirely-000000'), SECRET), null);
  assert.equal(readSessionToken(expired, SECRET), null);
  assert.equal(readSessionToken(unsigned, SECRET), null);
  assert.equal(readSessionToken(undefined, SECRET), null);
  assert.equal(readSessionToken('', SECRET), null);
});

test('admin emails match case-insensitively', () => {
  assert.equal(isAdminEmail('Admin@Firebreak.test', ['admin@firebreak.test']), true);
  assert.equal(isAdminEmail('user@firebreak.test', ['admin@firebreak.test']), false);
});

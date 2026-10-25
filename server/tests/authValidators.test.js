import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginBody, registerBody } from '../src/validators/auth.validators.js';

const valid = { name: '  Maya  ', email: ' Maya@Example.COM ', password: 'long enough' };

test('register cleans up name and email', () => {
  assert.deepEqual(registerBody.parse(valid), {
    name: 'Maya',
    email: 'maya@example.com',
    password: 'long enough',
  });
});

test('register drops fields the client must not control, such as role', () => {
  const parsed = registerBody.parse({ ...valid, role: 'admin', _id: 'x' });

  assert.equal('role' in parsed, false);
  assert.equal('_id' in parsed, false);
});

test('register enforces password length in bytes, as bcrypt does', () => {
  assert.equal(registerBody.safeParse({ ...valid, password: 'short' }).success, false);
  assert.equal(registerBody.safeParse({ ...valid, password: 'a'.repeat(72) }).success, true);
  assert.equal(registerBody.safeParse({ ...valid, password: 'a'.repeat(73) }).success, false);
  // 'é' is two bytes in UTF-8, so 37 of them exceed bcrypt's 72-byte limit.
  assert.equal(registerBody.safeParse({ ...valid, password: 'é'.repeat(37) }).success, false);
});

test('rejects NoSQL operator objects instead of strings', () => {
  const result = loginBody.safeParse({ email: { $gt: '' }, password: { $ne: null } });

  assert.equal(result.success, false);
  assert.deepEqual(
    result.error.issues.map((issue) => issue.message),
    ['Enter your email address', 'Enter your password'],
  );
});

test('gives plain-language messages for missing and malformed fields', () => {
  const result = registerBody.safeParse({ name: ' ', email: 'not-an-email' });
  const messages = Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));

  assert.deepEqual(messages, {
    name: 'Enter your name',
    email: 'Enter a valid email address',
    password: 'Enter a password',
  });
});

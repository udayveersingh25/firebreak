import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from '../src/config/envSchema.js';

const valid = {
  MONGODB_URI: 'mongodb+srv://user:pass@cluster0.example.mongodb.net/firebreak',
  JWT_SECRET: 'a'.repeat(32),
  ADMIN_EMAILS: 'admin@firebreak.test',
};

test('accepts a complete config and fills in defaults', () => {
  const result = parseEnv(valid);

  assert.equal(result.ok, true);
  assert.equal(result.env.NODE_ENV, 'development');
  assert.equal(result.env.PORT, 4000);
  assert.equal(result.env.OSV_BASE_URL, 'https://api.osv.dev');
  assert.ok(Object.isFrozen(result.env));
});

test('treats empty values as missing, so optional ones fall back to defaults', () => {
  const result = parseEnv({ ...valid, PORT: '', OSV_BASE_URL: '' });

  assert.equal(result.env.PORT, 4000);
  assert.equal(result.env.OSV_BASE_URL, 'https://api.osv.dev');
});

test('names every missing required variable', () => {
  const result = parseEnv({ JWT_SECRET: '' });

  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, [
    'MONGODB_URI: is missing',
    'JWT_SECRET: is missing',
    'ADMIN_EMAILS: is missing',
  ]);
});

test('never echoes a rejected value', () => {
  const result = parseEnv({
    ...valid,
    JWT_SECRET: 'short-but-secret',
    MONGODB_URI: 'postgres://user:hunter2@db.example.com/app',
  });

  assert.equal(result.ok, false);
  const report = result.problems.join('\n');
  assert.match(report, /JWT_SECRET: must be at least 32 characters/);
  assert.match(report, /MONGODB_URI: must start with mongodb/);
  assert.doesNotMatch(report, /short-but-secret|hunter2/);
});

test('normalizes the admin email list', () => {
  const result = parseEnv({ ...valid, ADMIN_EMAILS: ' Owner@Example.com , ,second@firebreak.test ' });

  assert.deepEqual(result.env.ADMIN_EMAILS, ['owner@example.com', 'second@firebreak.test']);
});

test('rejects an admin list with an invalid email or no emails', () => {
  assert.deepEqual(parseEnv({ ...valid, ADMIN_EMAILS: 'admin@firebreak.test, not-an-email' }).problems, [
    'ADMIN_EMAILS: contains an invalid email address',
  ]);
  assert.deepEqual(parseEnv({ ...valid, ADMIN_EMAILS: ' , ' }).problems, [
    'ADMIN_EMAILS: needs at least one email address',
  ]);
});

test('coerces PORT to a number and rejects anything else', () => {
  assert.equal(parseEnv({ ...valid, PORT: '10000' }).env.PORT, 10000);
  assert.equal(parseEnv({ ...valid, PORT: 'eighty' }).ok, false);
});

test('only allows known NODE_ENV values', () => {
  assert.equal(parseEnv({ ...valid, NODE_ENV: 'production' }).env.NODE_ENV, 'production');
  assert.equal(parseEnv({ ...valid, NODE_ENV: 'staging' }).ok, false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractEnvNames } from '../src/lib/envNameExtractor.js';

test('keeps names and drops every value', () => {
  const text = [
    'STRIPE_SECRET_KEY=sk_live_51abcSECRET',
    'MONGODB_URI=mongodb+srv://user:hunter2@cluster0.mongodb.net/app',
    'JWT_SECRET="quoted value with = signs"',
  ].join('\n');

  const names = extractEnvNames(text);

  assert.deepEqual(names, ['STRIPE_SECRET_KEY', 'MONGODB_URI', 'JWT_SECRET']);
  assert.doesNotMatch(JSON.stringify(names), /sk_live|hunter2|quoted/);
});

test('ignores blank lines and comments, strips "export", trims spaces', () => {
  const text = '\n# Payments\n  export OPENAI_API_KEY = sk-abc\n\n   # VITE_COMMENTED=1\nVITE_APP_NAME=Shop\n';

  assert.deepEqual(extractEnvNames(text), ['OPENAI_API_KEY', 'VITE_APP_NAME']);
});

test('skips lines that are not NAME=value', () => {
  const text = [
    'NO_EQUALS_SIGN',
    '1STARTS_WITH_DIGIT=x',
    'HAS-DASH=x',
    'has space=x',
    '=value-only',
    'VALID_NAME=',
  ].join('\n');

  assert.deepEqual(extractEnvNames(text), ['VALID_NAME']);
});

test('handles Windows line endings and duplicate names', () => {
  assert.deepEqual(extractEnvNames('A=1\r\nB=2\r\nA=3\r\n'), ['A', 'B']);
});

test('empty input gives no names', () => {
  assert.deepEqual(extractEnvNames(''), []);
});

// Import this first in any test that loads the app: config/env.js validates
// process.env as soon as it is imported. Values here are for tests only.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/firebreak_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough-123456';
process.env.ADMIN_EMAILS = 'admin@firebreak.test';
// Tests that scan run a fake OSV server on this port; nothing reaches the real API.
process.env.OSV_BASE_URL = 'http://127.0.0.1:4599';

export const TEST_JWT_SECRET = process.env.JWT_SECRET;

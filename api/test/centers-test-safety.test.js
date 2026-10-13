import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testUrls } from './centers-integration/helpers.mjs';

const env = {
  CENTERS_TEST_DATABASE_URL: 'postgresql://centers_app:fictional@localhost/ft_gym_centers_test',
  CENTERS_TEST_MIGRATION_DATABASE_URL: 'postgresql://centers_migrator:fictional@localhost/ft_gym_centers_test',
};

test('integration tests never fall back to runtime DSNs', () => {
  assert.throws(() => testUrls({ CENTERS_DATABASE_URL: env.CENTERS_TEST_DATABASE_URL }), /PostgreSQL URL/);
  assert.equal(testUrls(env).app, env.CENTERS_TEST_DATABASE_URL);
});

test('integration tests refuse non-test databases, mixed hosts, elevated roles and runtime targets', () => {
  for (const patch of [
    { CENTERS_TEST_DATABASE_URL: env.CENTERS_TEST_DATABASE_URL.replace('ft_gym_centers_test', 'ft_gym_centers') },
    { CENTERS_TEST_MIGRATION_DATABASE_URL: env.CENTERS_TEST_MIGRATION_DATABASE_URL.replace('localhost', 'otherhost') },
    { CENTERS_TEST_DATABASE_URL: env.CENTERS_TEST_DATABASE_URL.replace('centers_app:', 'postgres:') },
    { CENTERS_DATABASE_URL: env.CENTERS_TEST_DATABASE_URL },
    { CENTERS_TEST_DATABASE_URL: env.CENTERS_TEST_DATABASE_URL + '?options=unsafe' },
  ]) assert.throws(() => testUrls({ ...env, ...patch }));
});

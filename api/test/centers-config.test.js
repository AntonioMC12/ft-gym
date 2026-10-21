import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centersConfig, publicCentersConfig, postgresUrl, databaseUrlFrom } from '../centers/config.js';
import { DEVELOPMENT_POLICY, ROLE_CAPABILITIES } from '../centers/domain/policies.js';

test('centers is opt-in and advertises no credentials or invented business capabilities', () => {
  assert.equal(centersConfig({}).enabled, false);
  assert.equal(centersConfig({}).maintenanceEnabled, false);
  assert.equal(centersConfig({CENTERS_MAINTENANCE_ENABLED:'1'}).maintenanceEnabled, true);
  assert.equal(publicCentersConfig(centersConfig({})), null);
  const cfg = centersConfig({ CENTERS_ENABLED: '1', CENTERS_DATABASE_URL: 'postgresql://app:secret@localhost/centers' });
  assert.deepEqual(publicCentersConfig(cfg), { enabled: true, stage: 'centers' });
  assert.ok(!JSON.stringify(publicCentersConfig(cfg)).includes('secret'));
  assert.equal(centersConfig({ CENTERS_ENABLED: 'false' }).enabled, false);
});

test('Compose credentials support URL-reserved characters without changing the password', () => {
  const env = { CENTERS_DATABASE_HOST: 'centers-db', CENTERS_DATABASE_USER: 'centers_app',
    CENTERS_DATABASE_PASSWORD: 'p%@:?#/word', CENTERS_DATABASE_NAME: 'ft_gym_centers' };
  const parsed = postgresUrl(databaseUrlFrom(env));
  assert.equal(decodeURIComponent(parsed.password), env.CENTERS_DATABASE_PASSWORD);
  assert.equal(databaseUrlFrom({ ...env, CENTERS_DATABASE_HOST: 'host/path' }), '');
  assert.equal(databaseUrlFrom({ ...env, CENTERS_DATABASE_PORT: '70000' }), '');
});

test('invalid connection configuration errors never echo its input', () => {
  for (const input of ['secret', 'https://app:secret@localhost/centers', 'postgres://app:secret@localhost/']) {
    assert.throws(() => postgresUrl(input), error => !error.message.includes('secret'));
  }
});

test('provisional policies cannot issue money before tax semantics are defined', () => {
  assert.equal(DEVELOPMENT_POLICY.priceIncludesTax, null);
  assert.equal(DEVELOPMENT_POLICY.automaticSuspension, false);
  assert.ok(!ROLE_CAPABILITIES.trainer.some(cap => /billing|payments/.test(cap)));
  assert.ok(!ROLE_CAPABILITIES.manager.includes('centers.manage'));
});

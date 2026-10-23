import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertSandboxEnvironment, fictionalTraining, seedTrainingFiles, trainingAccounts } from './centers-integration/exercise-fixtures.mjs';
import { validNationalDocument } from '../centers/domain/national-document.js';
const env = () => ({ EXERCISE_SANDBOX: 'fictional-local-only', CENTERS_PREVIEW_ORIGIN: 'http://localhost:5180', CENTERS_PREVIEW_DATA_DIR: '/tmp/ft-gym-centers-preview-data',
  CENTERS_TEST_DATABASE_URL: 'postgresql://centers_app:fictional@centers-test-db/ft_gym_exercises_centers_test',
  CENTERS_TEST_MIGRATION_DATABASE_URL: 'postgresql://centers_migrator:fictional@centers-test-db/ft_gym_exercises_centers_test' });
test('sandbox bootstrap rejects external, production, wrong role and inherited application destinations', () => {
  assert.doesNotThrow(() => assertSandboxEnvironment(env()));
  for (const change of [{ EXERCISE_SANDBOX: '' }, { CENTERS_PREVIEW_ORIGIN: 'https://example.com' }, { CENTERS_PREVIEW_DATA_DIR: '/data' },
    { CENTERS_TEST_DATABASE_URL: 'postgresql://centers_app:fictional@vps.example/ft_gym_exercises_centers_test' },
    { CENTERS_TEST_DATABASE_URL: 'postgresql://centers_app:fictional@centers-test-db/ft_gym_centers' },
    { CENTERS_TEST_MIGRATION_DATABASE_URL: 'postgresql://centers_app:fictional@centers-test-db/ft_gym_exercises_centers_test' },
    { DATA_DIR: '/data' }, { CENTERS_DATABASE_URL: 'postgresql://elsewhere' }]) assert.throws(() => assertSandboxEnvironment({ ...env(), ...change }));
});
test('three fictional accounts have valid distinct login documents and self-contained histories', () => {
  assert.equal(new Set(trainingAccounts.map(a => a.document)).size, 3);
  for (const account of trainingAccounts) {
    assert.ok(validNationalDocument(account.document));
    const state = fictionalTraining(account.id, '2026-10-23');
    const known = new Set(['0025', '0861', ...state.customEx.map(e => e.id)]);
    assert.equal(state.workouts.length, 12);
    for (const workout of state.workouts) {
      assert.ok(workout.d < '2026-10-23');
      assert.equal(workout.entries.every(e => known.has(e.id) && e.sets.length === 3 && e.sets.every(s => s.done)), true);
      assert.equal(workout.vol, workout.entries.flatMap(e => e.sets).reduce((sum, s) => sum + s.w * s.r, 0));
    }
    assert.ok(state.routines[0].ex.every(e => known.has(e.id)));
  }
});
test('restarting fixture seed preserves manual training and does not rewrite files', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-exercises-fixture-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(seedTrainingFiles(dir, '2026-10-23'), 3);
  const file = path.join(dir, 'state-preview_exercise_alba.json');
  const custom = JSON.stringify({ workouts: [{ id: 'manual-test' }], routines: [] });
  fs.writeFileSync(file, custom);
  assert.equal(seedTrainingFiles(dir, '2026-11-01'), 0);
  assert.equal(fs.readFileSync(file, 'utf8'), custom);
});
test('unreadable existing fixture training fails without overwriting it', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-exercises-fixture-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state-preview_platform.json'); fs.writeFileSync(file, '{bad');
  assert.throws(() => seedTrainingFiles(dir, '2026-10-23'));
  assert.equal(fs.readFileSync(file, 'utf8'), '{bad');
});

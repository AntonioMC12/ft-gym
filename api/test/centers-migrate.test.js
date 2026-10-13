import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMigrations, migrationFiles } from '../centers/migrate.js';

function fakeClient({ applied = [], kind = null, role = 'centers_migrator', failSql = '' } = {}) {
  const calls = []; const versions = [...applied]; let snapshot;
  return { calls, versions,
    async query(sql, values) {
      calls.push(sql);
      if (sql.includes('FROM pg_roles')) return { rows: [{ name: role, rolsuper: false, rolbypassrls: false }] };
      if (sql.includes('to_regclass')) return { rows: [{ environment: kind ? 'centers.environment' : null }] };
      if (sql.includes('SELECT kind FROM')) return { rows: kind ? [{ kind }] : [] };
      if (sql === 'BEGIN') snapshot = [...versions];
      if (sql === 'ROLLBACK') versions.splice(0, versions.length, ...snapshot);
      if (sql.includes('SELECT version, name, checksum')) return { rows: [...versions] };
      if (sql.includes('INSERT INTO centers.schema_migrations')) versions.push({ version: values[0], name: values[1], checksum: values[2] });
      if (sql.includes('INSERT INTO centers.environment')) kind ||= values[0];
      if (sql === failSql) throw new Error('SQL failure');
      return { rows: [] };
    },
  };
}
const files = [{ version: '001', name: '001_test.sql', checksum: 'checksum', sql: 'TEST_MIGRATION' }];

test('migration checksums are stable and real files have distinct ordered versions', async () => {
  const migrations = await migrationFiles();
  assert.equal(migrations.length, 2);
  assert.equal(migrations[0].version, '001');
  assert.equal(migrations[0].checksum.length, 64);
});

test('migrations are committed once, and reapplying them is a no-op', async () => {
  const client = fakeClient();
  assert.deepEqual(await applyMigrations(client, { files, kind: 'test' }), ['001']);
  assert.deepEqual(await applyMigrations(client, { files, kind: 'test' }), []);
  assert.equal(client.calls.filter(c => c === 'TEST_MIGRATION').length, 1);
  assert.equal(client.calls.filter(c => c.includes('pg_advisory_unlock')).length, 2);
});

test('an applied file cannot be changed, removed or renamed', async () => {
  for (const patch of [{ checksum: 'changed' }, { name: '001_other.sql' }]) {
    const client = fakeClient({ applied: [{ ...files[0], ...patch }], kind: 'test' });
    await assert.rejects(applyMigrations(client, { files, kind: 'test' }), /applied migrations differ/);
    assert.ok(!client.calls.includes('TEST_MIGRATION'));
  }
});

test('runtime credentials and changing a production environment are rejected before DDL', async () => {
  const runtime = fakeClient({ role: 'centers_app' });
  await assert.rejects(applyMigrations(runtime, { files }), /migrator role/);
  assert.ok(!runtime.calls.some(c => c.startsWith('CREATE')));
  const production = fakeClient({ kind: 'production' });
  await assert.rejects(applyMigrations(production, { files, kind: 'test' }), /environment does not match/);
  assert.ok(!production.calls.some(c => c.startsWith('CREATE')));
});

test('failed migration rolls back its version and unlocks; a retry can apply it', async () => {
  const client = fakeClient({ failSql: 'TEST_MIGRATION' });
  await assert.rejects(applyMigrations(client, { files }), /SQL failure/);
  assert.deepEqual(client.versions, []);
  assert.ok(client.calls.includes('ROLLBACK'));
  assert.ok(client.calls.at(-1).includes('pg_advisory_unlock'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isolatedDatabase } from './helpers.mjs';
import { createCentersDatabase, SCHEMA_VERSION } from '../../centers/db.js';
import { applyMigrations, migrationFiles } from '../../centers/migrate.js';

test('real PostgreSQL: migrations, limited application role, rollback and transaction context isolation', async t => {
  const { app, migration, migrator } = await isolatedDatabase();
  let probe = null;
  const db = createCentersDatabase({ enabled: true, databaseUrl: app });
  const privilegedDb = createCentersDatabase({ enabled: true, databaseUrl: migration });
  t.after(async () => {
    await db.close(); await privilegedDb.close();
    try { if (probe) await migrator.query(`DROP TABLE IF EXISTS centers.${probe}`); }
    finally { await migrator.end(); }
  });
  assert.deepEqual(await applyMigrations(migrator, { kind: 'test' }), [], 'repeat migration is a no-op');
  const files = await migrationFiles();
  await assert.rejects(applyMigrations(migrator, { kind: 'test', files: files.map(f => ({ ...f, checksum: 'changed' })) }),
    /applied migrations differ/);
  await assert.rejects(applyMigrations(migrator, { kind: 'production' }), /environment does not match/);
  assert.deepEqual(await db.status(), { available: true, schemaVersion: SCHEMA_VERSION });
  await assert.rejects(privilegedDb.status(), { code: 'centers-unavailable' });

  // A unique probe table belongs only to this test; never delete or truncate actual business tables.
  const table = `probe_${randomBytes(8).toString('hex')}`;
  await migrator.query(`CREATE TABLE centers.${table} (id text PRIMARY KEY, center_id text NOT NULL)`);
  probe = table;
  await migrator.query(`GRANT SELECT, INSERT ON centers.${table} TO centers_app`);
  await migrator.query(`ALTER TABLE centers.${table} ENABLE ROW LEVEL SECURITY`);
  await migrator.query(`ALTER TABLE centers.${table} FORCE ROW LEVEL SECURITY`);
  await migrator.query(`CREATE POLICY isolated ON centers.${table}
    USING (center_id = nullif(current_setting('centers.center_id', true), ''))
    WITH CHECK (center_id = nullif(current_setting('centers.center_id', true), ''))`);
  await db.transaction({ uid: 'manager_a', centerId: 'a' }, client => client.query(`INSERT INTO centers.${table} VALUES ($1, $2)`, ['row_a', 'a']));
  await db.transaction({ uid: 'manager_b', centerId: 'b' }, async client => {
    const { rows } = await client.query(`SELECT * FROM centers.${table}`);
    assert.deepEqual(rows, []);
    const { rows: context } = await client.query("SELECT current_setting('centers.uid') AS uid, current_setting('centers.center_id') AS center");
    assert.deepEqual(context, [{ uid: 'manager_b', center: 'b' }]);
  });
  await assert.rejects(db.transaction({ uid: 'manager_a', centerId: 'a' }, client =>
    client.query(`INSERT INTO centers.${table} VALUES ($1, $2)`, ['wrong_center', 'b'])));
  await assert.rejects(db.transaction({ uid: 'manager_a', centerId: 'a' }, async client => {
    await client.query(`INSERT INTO centers.${table} VALUES ($1, $2)`, ['rolled_back', 'a']);
    throw new Error('deliberate business failure');
  }), /deliberate business failure/);
  await db.transaction({ uid: 'manager_a', centerId: 'a' }, async client => {
    assert.deepEqual((await client.query(`SELECT id FROM centers.${table}`)).rows, [{ id: 'row_a' }]);
  });
  await assert.rejects(db.transaction({ uid: 'manager_a', centerId: 'a' }, client =>
    client.query('UPDATE centers.environment SET kind = $1', ['production'])), { code: '42501' });
  assert.deepEqual(await db.status(), { available: true, schemaVersion: SCHEMA_VERSION }, 'connection remains usable after failed transaction');
});

test('real PostgreSQL + HTTP: availability recovers without rebooting or breaking personal sync', async t => {
  const { app, migrator } = await isolatedDatabase();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-centers-http-'));
  const secret = randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(dir, 'secret'), secret);
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: [{ id: 'fixture_personal', name: 'Fictitious', admin: true }], creds: [], subs: [], invites: [] }));
  const apiDir = fileURLToPath(new URL('../../', import.meta.url));
  const child = spawn(process.execPath, ['server.js'], { cwd: apiDir, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, PORT: '0', DATA_DIR: dir, CENTERS_ENABLED: '1', CENTERS_DATABASE_URL: app,
    COACH_DISABLED: '1', MEDIA_UPLOADS: '0',
  } });
  t.after(async () => {
    try { await migrator.query('GRANT SELECT ON centers.schema_migrations TO centers_app'); }
    finally {
      if (child.exitCode == null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
      await migrator.end();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('centers HTTP test server did not start')), 15000);
    child.stdout.on('data', data => {
      output += data;
      const match = /gym-api on :(\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(+match[1]); }
    });
    child.stderr.on('data', () => {});
    child.once('exit', () => { clearTimeout(timer); reject(new Error('centers HTTP test server exited')); });
  });
  const base = `http://127.0.0.1:${port}`;
  const payload = `fixture_personal:${Date.now() + 60000}:0`;
  const token = payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
  const headers = { Authorization: `Bearer ${token}` };
  const status = () => fetch(base + '/api/centers/status', { headers });
  assert.equal((await status()).status, 200);
  await migrator.query('REVOKE SELECT ON centers.schema_migrations FROM centers_app');
  assert.equal((await status()).status, 503);
  assert.equal((await fetch(base + '/api/data', { headers })).status, 200);
  const write = await fetch(base + '/api/data', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: { routines: [], workouts: [], unit: 'kg' }, baseRev: 0 }) });
  assert.equal(write.status, 200);
  await migrator.query('GRANT SELECT ON centers.schema_migrations TO centers_app');
  assert.equal((await status()).status, 200);
});

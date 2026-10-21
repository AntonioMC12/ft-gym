import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCentersDatabase, SCHEMA_VERSION } from '../centers/db.js';

function fakeDatabase({ privileged = false, canCreate = false, schemaVersion = SCHEMA_VERSION, rollbackFails = false } = {}) {
  const calls = []; let released; let loads = 0; let ended = false;
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM pg_roles')) return { rows: [{ privileged, can_create: canCreate }] };
      if (sql.includes('FROM centers.schema_migrations')) return { rows: [{ version: schemaVersion }] };
      if (sql === 'ROLLBACK' && rollbackFails) throw new Error('disconnected');
      return { rows: [] };
    },
    release(destroy = false) { released = destroy; },
  };
  class Pool {
    on() {}
    async connect() { return client; }
    async end() { ended = true; }
  }
  const config = { enabled: true, databaseUrl: 'postgresql://centers_app:synthetic@localhost/centers_test' };
  const database = createCentersDatabase(config, { loadPool: async () => { loads++; return Pool; } });
  return { database, calls, config, loadPool: async () => { loads++; return Pool; },
    get loads() { return loads; }, get released() { return released; }, get ended() { return ended; } };
}

test('disabled module never loads pg or opens a pool, even with an invalid DSN', async () => {
  let loads = 0;
  const db = createCentersDatabase({ enabled: false, databaseUrl: 'invalid' }, { loadPool: async () => { loads++; throw new Error(); } });
  await assert.rejects(db.status(), { code: 'centers-unavailable' });
  await db.close();
  assert.equal(loads, 0);
});

test('runtime refuses privileged/schema-owner connections and destroys them', async () => {
  for (const opts of [{ privileged: true }, { canCreate: true }]) {
    const f = fakeDatabase(opts);
    await assert.rejects(f.database.status(), { code: 'centers-unavailable' });
    assert.equal(f.released, true);
    await f.database.close();
  }
});

test('status requires exactly the schema version supported by this build', async () => {
  const f = fakeDatabase({ schemaVersion: '999' });
  await assert.rejects(f.database.status(), { code: 'centers-unavailable' });
  await f.database.close();
});

test('transactions use one checked-out client and transaction-local context, then release it', async () => {
  const f = fakeDatabase();
  const result = await f.database.transaction({ uid: 'u1', centerId: 'c1' }, async client => {
    await client.query('SELECT $1', ['business']); return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(f.calls.filter(c => !c.sql.includes('FROM pg_roles')).map(c => c.sql), [
    'BEGIN', "SELECT set_config('centers.uid', $1, true), set_config('centers.center_id', $2, true), set_config('centers.platform', $3, true)", 'SELECT $1', 'COMMIT',
  ]);
  assert.deepEqual(f.calls.find(c => c.sql.includes('set_config')).values, ['u1', 'c1', '0']);
  assert.equal(f.released, false);
  await f.database.close(); assert.equal(f.ended, true);
});

test('callback failures rollback; a failed rollback destroys the connection', async () => {
  for (const rollbackFails of [false, true]) {
    const f = fakeDatabase({ rollbackFails }); const error = new Error('business failure');
    await assert.rejects(f.database.transaction({ uid: 'u1', centerId: 'c1' }, () => { throw error; }), e => e === error);
    assert.ok(f.calls.some(c => c.sql === 'ROLLBACK'));
    assert.equal(f.released, rollbackFails);
    await f.database.close();
  }
});

test('missing server-authorized context is rejected before any connection is opened', async () => {
  const f = fakeDatabase();
  await assert.rejects(f.database.transaction({}, () => {}), TypeError);
  assert.equal(f.loads, 0);
});

test('status and close release all connections; closed databases do not reopen', async () => {
  const f = fakeDatabase();
  assert.deepEqual(await f.database.status(), { available: true, schemaVersion: SCHEMA_VERSION });
  await f.database.close();
  await assert.rejects(f.database.status(), { code: 'centers-unavailable' });
  assert.equal(f.loads, 1); assert.equal(f.ended, true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centersRoutes } from '../centers/routes.js';

async function call({ enabled = true, user = { id: 'u' }, status = async () => ({ available: true, schemaVersion: '001' }), session } = {}) {
  let result;
  const handler = centersRoutes({ config: { enabled }, database: { status },
    readSession: session || (() => user), json: (_req, code, body) => { result = { code, body }; } })['GET /api/centers/status'];
  await handler({}, {});
  return result;
}

test('disabled and unauthenticated routes never acquire SQL', async () => {
  const status = () => { throw new Error('must not call'); };
  assert.equal((await call({ enabled: false, status })).code, 404);
  assert.equal((await call({ user: null, status })).code, 401);
});

test('database details are never exposed by the unavailable response', async () => {
  const result = await call({ status: () => { throw new Error('postgres://secret@host/database'); } });
  assert.deepEqual(result, { code: 503, body: { error: 'centers are temporarily unavailable', code: 'centers-unavailable' } });
});

test('a healthy foundation does not claim implemented affiliations or payment features', async () => {
  assert.deepEqual(await call(), { code: 200, body: { enabled: true, stage: 'centers', available: true, schemaVersion: '001' } });
});

test('revocation during an awaited SQL check invalidates the response', async () => {
  const user = { id: 'u', sv: 0 };
  assert.equal((await call({ user, status: async () => { user.sv++; return { available: true }; } })).code, 401);
  let present = true;
  assert.equal((await call({ session: () => present ? user : null, status: async () => { present = false; return { available: true }; } })).code, 401);
});

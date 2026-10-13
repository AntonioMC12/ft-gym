import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function server(t, enabled, databaseUrl = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-centers-server-'));
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(dir, 'secret'), secret);
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: [{ id: 'personal', name: 'Personal' }], creds: [], invites: [], subs: [] }));
  let log = '';
  const child = spawn(process.execPath, ['server.js'], { cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dir, CENTERS_ENABLED: enabled ? '1' : '0',
      CENTERS_DATABASE_URL: databaseUrl, CENTERS_DATABASE_HOST: '', MEDIA_UPLOADS: '0', COACH_DISABLED: '1' } });
  child.stdout.on('data', data => { log += data; });
  child.stderr.on('data', data => { log += data; });
  t.after(async () => {
    if (child.exitCode == null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const port = await boundPort(child, () => log);
  const payload = `personal:${Date.now() + 60000}:0`;
  const token = payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return { base: `http://127.0.0.1:${port}`, headers: { Authorization: `Bearer ${token}` }, log: () => log };
}

test('centers off preserves the configuration contract and personal sync, without resolving SQL', async t => {
  const s = await server(t, false, 'postgresql://centers_app:secret@unresolvable.invalid/db');
  const config = await fetch(s.base + '/api/config').then(r => r.json());
  assert.ok(!('centers' in config));
  assert.equal((await fetch(s.base + '/api/centers/status', { headers: s.headers })).status, 404);
  assert.equal((await fetch(s.base + '/api/data', { headers: s.headers })).status, 200);
  assert.ok(!s.log().includes('secret'));
});

test('centers on with SQL down returns a bounded, private 503 but training can still read and write', async t => {
  const s = await server(t, true, 'postgresql://centers_app:secret@127.0.0.1:1/ft_gym_centers');
  const config = await fetch(s.base + '/api/config').then(r => r.json());
  assert.deepEqual(config.centers, { enabled: true, stage: 'centers' });
  assert.equal((await fetch(s.base + '/api/centers/status')).status, 401);
  const answer = await fetch(s.base + '/api/centers/status', { headers: s.headers });
  assert.equal(answer.status, 503);
  assert.deepEqual(await answer.json(), { error: 'centers are temporarily unavailable', code: 'centers-unavailable' });
  const write = await fetch(s.base + '/api/data', { method: 'PUT', headers: { ...s.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: { routines: [], workouts: [], unit: 'kg' }, baseRev: 0 }) });
  assert.equal(write.status, 200);
  assert.equal((await fetch(s.base + '/api/data', { headers: s.headers })).status, 200);
  assert.ok(!s.log().includes('secret'));
});

test('missing SQL configuration never prevents API startup', async t => {
  const s = await server(t, true);
  assert.equal((await fetch(s.base + '/api/health')).status, 200);
  assert.equal((await fetch(s.base + '/api/centers/status', { headers: s.headers })).status, 503);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createSharedExercises } from '../shared-exercises.js';
import { mediaLimits } from '../media.js';
import { boundPort } from './helpers.mjs';
import { png, sha, mp4 } from './media-samples.mjs';
const definition = { n: 'Remo FT ficticio', bp: 'back', tg: 'lats', eq: 'cable', primaries: ['lats'] };
const limits = mediaLimits({ MEDIA_MIN_FREE_MB: '1' });
function temporary(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-shared-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
test('durable catalogue: stable IDs, replay, conflict, archive and immutable load semantics', t => {
  const dir = temporary(t), store = createSharedExercises({ dir, limits });
  const original = store.mutate('root', { exercise: definition, requestId: 'create_001' });
  assert.equal(store.mutate('root', { exercise: definition, requestId: 'create_001' }).exercise.id, original.exercise.id);
  assert.throws(() => store.mutate('root', { exercise: { ...definition, n: 'Different' }, requestId: 'create_001' }), /idempotency-conflict/);
  const id = original.exercise.id;
  const edited = store.mutate('other-root', { exercise: { ...definition, n: 'Otro nombre', primaries: ['biceps'] }, revision: 1, requestId: 'edit_0001' }, { id });
  assert.equal(edited.exercise.id, id); assert.equal(edited.exercise.revision, 2);
  assert.throws(() => store.mutate('root', { exercise: definition, revision: 1, requestId: 'edit_0002' }, { id }), /version-conflict/);
  assert.throws(() => store.mutate('root', { exercise: { ...definition, eq: 'barbell' }, revision: 2, requestId: 'edit_0003' }, { id }), /semantics-immutable/);
  store.mutate('root', { revision: 2, requestId: 'archive_1' }, { id, archive: true });
  const restored = createSharedExercises({ dir, limits });
  assert.equal(restored.snapshot().entries[0].id, id); assert.equal(restored.snapshot().entries[0].archived, true);
  assert.equal(restored.allDefinitions().length, 3);
  assert.ok(!JSON.stringify(restored.snapshot()).includes('authorUid'));
});
test('corrupt primary recovers read-only from backup, never overwrites either file', t => {
  const dir = temporary(t), store = createSharedExercises({ dir, limits });
  store.mutate('root', { exercise: definition, requestId: 'create_001' });
  fs.writeFileSync(path.join(dir, 'shared-exercises.json'), '{bad');
  const recovered = createSharedExercises({ dir, limits });
  assert.equal(recovered.snapshot().degraded, true);
  assert.throws(() => recovered.mutate('root', { exercise: definition, requestId: 'create_002' }), /recovery-required/);
  assert.equal(fs.readFileSync(path.join(dir, 'shared-exercises.json'), 'utf8'), '{bad');
});
test('selective simulation detects missing/invalid/duplicate IDs and performs no writes', t => {
  const dir = temporary(t), store = createSharedExercises({ dir, limits, builtinHas: id => id === '0025' });
  const before = fs.readFileSync(path.join(dir, 'shared-exercises.json'), 'utf8');
  assert.equal(store.preview('root', ['own'], { customEx: [{ ...definition, id: 'own', custom: true }] })[0].issue, null);
  assert.equal(store.preview('root', ['unknown'], { customEx: [] })[0].issue, 'not-owned');
  assert.equal(store.preview('root', ['0025'], { customEx: [{ ...definition, id: '0025' }] })[0].issue, 'id-conflict');
  assert.throws(() => store.preview('root', ['own','own'], {}), /invalid-selection/);
  assert.equal(fs.readFileSync(path.join(dir, 'shared-exercises.json'), 'utf8'), before);
});
test('HTTP: roles, video/media, publication, ETag, archive, creator reset and restart', async t => {
  const dir = temporary(t), secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(dir, 'secret'), secret);
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: [{ id: 'root', name: 'Root' }, { id: 'other', name: 'Other' }, { id: 'technical', name: 'Technical', admin: true }], creds: [], subs: [], invites: [] }));
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  let child, proxy, network;
  const docker = async (...args) => (await promisify(execFile)('docker', args)).stdout.trim();
  const stop = async () => {
    if (proxy) { await docker('rm', '-f', proxy); proxy = null; }
    if (network) { await docker('network', 'rm', network); network = null; }
    if (child && child.exitCode == null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  };
  t.after(stop);
  async function start() {
    child = spawn(process.execPath, ['server.js'], { cwd, stdio: ['ignore','pipe','pipe'], env: { ...process.env, PORT: '0', DATA_DIR: dir,
      CENTERS_ENABLED: '0', CENTERS_SUPERADMIN_UIDS: 'root', CENTERS_JOBS_ENABLED: '0', COACH_DISABLED: '1', MEDIA_MIN_FREE_MB: '1', ORIGIN: 'http://localhost:8080' } });
    let log = ''; child.stdout.on('data', c => log += c); child.stderr.on('data', c => log += c);
    const port = await boundPort(child, () => log);
    // Opt-in real web-image regression (Docker): exercise nginx's prefix selection and body
    // limits, including subpath deployments. The API and all uploaded data remain fictional.
    if (process.env.SHARED_EXERCISES_PROXY_IMAGE) {
      const prefix = process.env.SHARED_EXERCISES_PROXY_BASE_PATH || '';
      network = await docker('network', 'create', 'gym-media-test-' + crypto.randomUUID());
      proxy = await docker('run', '--rm', '-d', '--network', network, '-p', '127.0.0.1::80',
        '-e', 'BACKEND=host.docker.internal', '-e', `PORT=${port}`, '-e', `BASE_PATH=${prefix}`,
        process.env.SHARED_EXERCISES_PROXY_IMAGE);
      const address = await docker('port', proxy, '80/tcp');
      const base = `http://${address}${prefix}`;
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) })).ok) return base; } catch { /* starting */ }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('nginx test proxy did not start');
    }
    return `http://127.0.0.1:${port}`;
  }
  let base = await start();
  const headers = uid => {
    const token = `${uid}:${Date.now() + 3600000}:0`;
    return { Origin: 'http://localhost:8080', 'Accept-Encoding': 'identity', Cookie: `gymsid=${token}.${crypto.createHmac('sha256', secret).update(token).digest('base64url')}` };
  };
  const req = (route, uid, method = 'GET', body) => fetch(base + '/api/exercises/shared' + route, { method, headers: { ...headers(uid), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await fetch(base + '/api/exercises/shared')).status, 401);
  for (const uid of ['other','technical']) assert.equal((await req('', uid, 'POST', { exercise: definition, requestId: 'refused_001' })).status, 403);
  const bytes = png(), hash = sha(bytes), ref = { hash, mime: 'image/png', kind: 'image', width: 1, height: 1, size: bytes.length };
  assert.equal((await fetch(base + '/api/exercises/shared/media/' + hash, { method: 'PUT', headers: { ...headers('root'), 'Content-Type': ref.mime }, body: bytes })).status, 201);
  assert.equal((await req('/media/' + hash, 'other')).status, 404); // draft not published
  const made = await req('', 'root', 'POST', { exercise: { ...definition, media: ref }, requestId: 'published_1' });
  assert.equal(made.status, 200); const { exercise } = await made.json();
  assert.equal((await req('/media/' + hash, 'other')).status, 200);
  assert.equal((await fetch(base + '/api/media/' + hash, { headers: headers('other') })).status, 404);
  const data = await req('', 'other'), etag = data.headers.get('etag'), catalogue = await data.json();
  assert.equal(catalogue.canManage, false); assert.equal(catalogue.entries[0].id, exercise.id);
  assert.equal((await fetch(base + '/api/exercises/shared', { headers: { ...headers('other'), 'If-None-Match': etag } })).status, 304);
  assert.equal((await req('/' + exercise.id, 'other', 'PATCH', { exercise: definition, revision: 1, requestId: 'refused_002' })).status, 403);
  assert.equal((await req('/' + exercise.id + '/archive', 'root', 'POST', { revision: 1, requestId: 'archive_001' })).status, 200);
  // Personal cleanup does not remove installation-owned content.
  await fetch(base + '/api/media/sweep', { method: 'POST', headers: headers('root'), body: '{}' });
  assert.equal((await req('/media/' + hash, 'other')).status, 200);
  await stop(); base = await start();
  assert.equal((await req('', 'other')).status, 200);
  assert.equal((await (await req('', 'other')).json()).entries[0].archived, true);
  assert.equal((await req('/media/' + hash, 'other')).status, 200);

  // Camera clip from the reported failure, then the inclusive default boundary. These go
  // through the real HTTP route, hashing, disk storage, catalogue save and authenticated GET.
  assert.equal((await (await fetch(base + '/api/config')).json()).media.videoMB, 50);
  const overhead = mp4({ mdatBytes: 0 }).length;
  for (const size of [Math.round(26.8 * 1048576), 50 * 1048576]) {
    const clip = mp4({ seconds: 11, mdatBytes: size - overhead }), videoHash = sha(clip);
    const upload = await fetch(base + '/api/exercises/shared/media/' + videoHash, {
      method: 'PUT', headers: { ...headers('root'), 'Content-Type': 'video/mp4' }, body: clip
    });
    assert.equal(upload.status, 201, await upload.text());
    const saved = await req('', 'root', 'POST', { exercise: { ...definition, n: 'Video ' + size,
      media: { hash: videoHash, mime: 'video/mp4', kind: 'video', size, dur: 11, width: 640, height: 360 }
    }, requestId: 'video_' + size });
    assert.equal(saved.status, 200, await saved.text());
    const downloaded = await req('/media/' + videoHash, 'other');
    assert.equal(downloaded.status, 200);
    assert.equal(sha(Buffer.from(await downloaded.arrayBuffer())), videoHash);
  }
  const oversized = await fetch(base + '/api/exercises/shared/media/' + 'f'.repeat(64), {
    method: 'PUT', headers: { ...headers('root'), 'Content-Type': 'video/mp4' }, body: Buffer.alloc(50 * 1048576 + 1)
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: 'that file is too large', code: 'media-too-large', maxMB: 50 });
});

import pg from 'pg';
import { postgresUrl } from '../../centers/config.js';
import { applyMigrations } from '../../centers/migrate.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// No fallback to application credentials. A test suffix alone is insufficient: the SQL marker
// and the separate app/migrator identities are also checked before test writes.
export function testUrls(env = process.env) {
  const app = env.CENTERS_TEST_DATABASE_URL || '';
  const migration = env.CENTERS_TEST_MIGRATION_DATABASE_URL || '';
  const a = postgresUrl(app, 'CENTERS_TEST_DATABASE_URL');
  const m = postgresUrl(migration, 'CENTERS_TEST_MIGRATION_DATABASE_URL');
  const name = decodeURIComponent(a.pathname.slice(1));
  if (!/^[a-z0-9_]+_centers_test(?:_[a-z0-9_]+)?$/.test(name) || a.search || m.search ||
      a.hostname !== m.hostname || (a.port || '5432') !== (m.port || '5432') || a.pathname !== m.pathname ||
      decodeURIComponent(a.username) !== 'centers_app' || decodeURIComponent(m.username) !== 'centers_migrator') {
    throw new Error('centers tests require matching isolated *_centers_test URLs and separate runtime/migrator roles');
  }
  if ([env.CENTERS_DATABASE_URL, env.CENTERS_MIGRATION_DATABASE_URL].filter(Boolean).some(value => {
    const real = postgresUrl(value);
    return real.hostname === a.hostname && (real.port || '5432') === (a.port || '5432') && real.pathname === a.pathname;
  })) throw new Error('centers tests must not target the application database');
  return { app, migration };
}

export async function startHttp(t, { app, users, enabled = true, attached = false, superadminUids = [], savedData = null }) {
  if(savedData&&(!fs.realpathSync(savedData).startsWith(path.join(fs.realpathSync(os.tmpdir()),'gym-centers-recovery-'))||fs.readFileSync(path.join(savedData,'recovery-fixture'),'utf8')!=='fictional-disposable-only'))throw new Error('only recovery fixture data may be reused');
  const dir = savedData || fs.mkdtempSync(path.join(os.tmpdir(), 'gym-centers-business-'));
  const secret = savedData?fs.readFileSync(path.join(dir,'secret'),'utf8'):randomBytes(32).toString('hex');
  if(!savedData){fs.writeFileSync(path.join(dir, 'secret'), secret);fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users, creds: [], subs: [], invites: [] }));}
  if (attached) fs.writeFileSync(path.join(dir, 'centers-attached'), '1\n');
  const child = spawn(process.execPath, ['server.js'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), stdio: ['ignore','pipe','pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dir, CENTERS_ENABLED: enabled ? '1' : '0', CENTERS_DATABASE_URL: app,
      CENTERS_SUPERADMIN_UIDS: superadminUids.join(','), COACH_DISABLED: '1', MEDIA_UPLOADS: '0' } });
  const stop=async()=>{
    if (child.exitCode == null && child.signalCode == null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  };
  t.after(async () => {
    await stop();
    if(savedData)return;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const port = await new Promise((resolve,reject) => {
    let log = ''; const timer = setTimeout(() => reject(new Error('test server did not start')), 15000);
    child.stdout.on('data', chunk => { log += chunk; const m = /gym-api on :(\d+)/.exec(log); if (m) { clearTimeout(timer); resolve(+m[1]); } });
    child.stderr.on('data', () => {});
    child.once('exit', () => { clearTimeout(timer); reject(new Error('test server exited')); });
  });
  return {
    base: `http://127.0.0.1:${port}`, dir,
    stop,
    headers(uid) {
      const payload = `${uid}:${Date.now() + 60000}:0`;
      return { Authorization: `Bearer ${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`, 'Content-Type': 'application/json' };
    },
  };
}

export async function isolatedDatabase() {
  const urls = testUrls();
  const migrator = new pg.Client({ connectionString: urls.migration, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  try {
    await migrator.connect();
    await applyMigrations(migrator, { kind: 'test' });
    const { rows } = await migrator.query('SELECT kind FROM centers.environment WHERE singleton');
    if (rows[0]?.kind !== 'test') throw new Error('refusing test writes in a non-test database');
    return { ...urls, migrator };
  } catch (error) { await migrator.end(); throw error; }
}

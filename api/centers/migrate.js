import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { postgresUrl, databaseUrlFrom } from './config.js';

const DIRECTORY = fileURLToPath(new URL('./migrations/', import.meta.url));
const ROLES = ['centers_migrator', 'centers_app'];

export async function migrationFiles(dir = DIRECTORY) {
  const files = (await readdir(dir)).filter(f => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const versions = new Set();
  return Promise.all(files.map(async name => {
    const version = name.slice(0, 3);
    if (versions.has(version)) throw new Error('duplicate migration version');
    versions.add(version);
    const sql = await readFile(path.join(dir, name), 'utf8');
    return { version, name, sql, checksum: createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex') };
  }));
}

export async function applyMigrations(client, { files = null, kind = 'development' } = {}) {
  if (!['development', 'test', 'production'].includes(kind)) throw new Error('invalid centers environment');
  const migrations = files || await migrationFiles();
  let locked = false;
  try {
    const { rows } = await client.query('SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
    if (rows[0]?.name !== ROLES[0] || rows[0]?.rolsuper || rows[0]?.rolbypassrls) throw new Error('migrations require the centers_migrator role');
    await client.query("SELECT pg_advisory_lock(hashtext('ft-gym-centers-migrations'))");
    locked = true;
    const { rows: existing } = await client.query("SELECT to_regclass('centers.environment') AS environment");
    if (existing[0]?.environment) {
      const { rows } = await client.query('SELECT kind FROM centers.environment WHERE singleton');
      if (rows[0]?.kind !== kind) throw new Error('centers environment does not match the existing database');
    }
    await client.query('BEGIN');
    try {
      await client.query('CREATE SCHEMA IF NOT EXISTS centers AUTHORIZATION centers_migrator');
      await client.query('REVOKE ALL ON SCHEMA centers FROM PUBLIC');
      await client.query(`CREATE TABLE IF NOT EXISTS centers.schema_migrations (
        version text PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    const { rows: applied } = await client.query('SELECT version, name, checksum FROM centers.schema_migrations ORDER BY version');
    for (const row of applied) {
      const file = migrations.find(m => m.version === row.version);
      if (!file || row.checksum !== file.checksum || row.name !== file.name) throw new Error('applied migrations differ from this build');
    }
    const completed = [];
    for (const file of migrations) {
      if (applied.some(row => row.version === file.version)) continue;
      if (applied.some(row => row.version > file.version)) throw new Error('cannot insert a migration before an applied version');
      await client.query('BEGIN');
      try {
        await client.query(file.sql);
        await client.query('INSERT INTO centers.schema_migrations(version, name, checksum) VALUES ($1, $2, $3)', [file.version, file.name, file.checksum]);
        await client.query('COMMIT');
        completed.push(file.version);
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
    // A database's environment is set once; migration retries cannot relabel production as test.
    await client.query('INSERT INTO centers.environment(singleton, kind) VALUES (true, $1) ON CONFLICT DO NOTHING', [kind]);
    const { rows: environments } = await client.query('SELECT kind FROM centers.environment WHERE singleton');
    if (environments[0]?.kind !== kind) throw new Error('centers environment does not match the existing database');
    return completed;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext('ft-gym-centers-migrations'))");
  }
}

async function main() {
  const url = databaseUrlFrom(process.env, 'CENTERS_MIGRATION_DATABASE_URL');
  const parsed = postgresUrl(url, 'CENTERS_MIGRATION_DATABASE_URL');
  if (decodeURIComponent(parsed.username) !== 'centers_migrator') throw new Error('migrations require a separate centers_migrator URL');
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000, statement_timeout: 30000 });
  try {
    await client.connect();
    const completed = await applyMigrations(client, { kind: process.env.CENTERS_ENVIRONMENT || 'development' });
    console.log(`centers migrations: ${completed.length ? completed.join(', ') : 'up to date'}`);
  } finally { await client.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Centers migration failed. Check the separate migrator credentials, database environment and immutable migration files.'); process.exitCode = 1; });
}

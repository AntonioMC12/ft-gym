import pg from 'pg';
import { postgresUrl } from '../../centers/config.js';
import { applyMigrations } from '../../centers/migrate.js';

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

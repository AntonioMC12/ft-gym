import { postgresUrl } from './config.js';
import { CentersUnavailable } from './errors.js';

export const SCHEMA_VERSION = '001';

// An application connection must never inherit the bootstrap/migrator's DDL or RLS bypass.
async function requireApplicationRole(client) {
  const { rows } = await client.query(`
    SELECT r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole AS privileged,
           has_schema_privilege(current_user, 'centers', 'CREATE') AS can_create
    FROM pg_roles r WHERE r.rolname = current_user`);
  if (rows.length !== 1 || rows[0].privileged || rows[0].can_create) throw new CentersUnavailable();
}

export function createCentersDatabase(config, { loadPool = async () => (await import('pg')).Pool } = {}) {
  let opening = null;
  let closed = false;
  const pool = async () => {
    if (!config.enabled || closed || !config.databaseUrl) throw new CentersUnavailable();
    if (!opening) {
      opening = (async () => {
        postgresUrl(config.databaseUrl);
        const Pool = await loadPool();
        const instance = new Pool({
          connectionString: config.databaseUrl, max: 5, connectionTimeoutMillis: 3000,
          idleTimeoutMillis: 10000, statement_timeout: 5000, query_timeout: 7000,
          application_name: 'ft-gym-centers',
        });
        // An idle socket failure is handled; never log an error containing a DSN or a query.
        instance.on('error', () => {});
        return instance;
      })().catch(() => { opening = null; throw new CentersUnavailable(); });
    }
    return opening;
  };

  const acquire = async () => {
    let client;
    try {
      client = await (await pool()).connect();
      await requireApplicationRole(client);
      return client;
    } catch {
      if (client) client.release(true);
      throw new CentersUnavailable();
    }
  };

  return {
    async status() {
      const client = await acquire();
      try {
        const { rows } = await client.query('SELECT version FROM centers.schema_migrations ORDER BY version DESC LIMIT 1');
        if (rows[0]?.version !== SCHEMA_VERSION) throw new CentersUnavailable();
        return { available: true, schemaVersion: SCHEMA_VERSION };
      } catch { throw new CentersUnavailable(); }
      finally { client.release(); }
    },

    // Callers pass a server-authorized context, never a body supplied by a browser.
    async transaction(context, work) {
      if (!context || typeof context.uid !== 'string' || !context.uid ||
          typeof context.centerId !== 'string' || !context.centerId) throw new TypeError('authorized center context required');
      const client = await acquire();
      let broken = false;
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('centers.uid', $1, true), set_config('centers.center_id', $2, true)`, [context.uid, context.centerId]);
        const value = await work(client);
        await client.query('COMMIT');
        return value;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { broken = true; }
        throw error;
      } finally { client.release(broken); }
    },

    async close() {
      closed = true;
      const current = opening;
      opening = null;
      if (current) { const instance = await current.catch(() => null); if (instance) await instance.end(); }
    },
  };
}

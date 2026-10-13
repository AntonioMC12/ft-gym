import { CentersError } from './errors.js';
import { requireCenter, memberDto, recordId, isPlatformUser } from './authz.js';
import { affiliations } from './services/identity.js';

// Inject the same session and response helpers used by the rest of node:http.
export function centersRoutes({ config, database, json, readSession, accountIds = () => [] }) {
  const guard = (req, res) => {
    if (!config.enabled) { json(res, 404, { error: 'not found' }); return null; }
    const user = readSession(req);
    if (!user) { json(res, 401, { error: 'not signed in' }); return null; }
    return user;
  };
  const failure = (res, error) => error instanceof CentersError
    ? json(res, error.status, { error: error.message, code: error.code })
    : json(res, 503, { error: 'centers are temporarily unavailable', code: 'centers-unavailable' });
  const current = (req, user, sv) => readSession(req) === user && (user.sv || 0) === sv;
  return {
    'GET /api/centers/me': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const sv = user.sv || 0;
      try {
        const result = await affiliations(database, config, user);
        if (!current(req, user, sv)) return json(res, 401, { error: 'not signed in' });
        return json(res, 200, result);
      } catch (error) { return failure(res, error); }
    },
    'GET /api/centers/member': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const sv = user.sv || 0;
      const params = new URL(req.url, 'http://x').searchParams;
      const centerId = params.get('centerId'), id = params.get('id');
      if (!recordId(centerId) || !recordId(id)) return json(res, 404, { error: 'not found', code: 'not-found' });
      try {
        const result = await database.transaction({ uid: user.id, centerId }, async client => {
          const context = await requireCenter(client, user.id, centerId, 'members.operational.read').catch(async error => {
            if (error.status !== 403) throw error;
            return requireCenter(client, user.id, centerId, 'members.read');
          });
          const { rows } = await client.query(`SELECT id, center_id, member_number, name, state, version,
            email, phone, national_document, joined_on, ends_on FROM centers.members WHERE center_id = $1 AND id = $2`, [centerId, id]);
          if (!rows.length) throw new CentersError(404, 'not-found', 'not found');
          return { member: memberDto(rows[0], context.capabilities) };
        });
        if (!current(req, user, sv)) return json(res, 401, { error: 'not signed in' });
        return json(res, 200, result);
      } catch (error) { return failure(res, error); }
    },
    'GET /api/platform/centers/reconciliation': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const sv = user.sv || 0;
      if (!isPlatformUser(config, user)) return json(res, 403, { error: 'forbidden', code: 'forbidden' });
      try {
        const result = await database.platformTransaction(user.id, async client => {
          const { rows } = await client.query('SELECT DISTINCT account_uid FROM centers.account_references ORDER BY account_uid');
          const known = new Set(accountIds());
          return { referencedAccounts: rows.length, orphanedAccounts: rows.filter(r => !known.has(r.account_uid)).map(r => r.account_uid) };
        });
        if (!current(req, user, sv)) return json(res, 401, { error: 'not signed in' });
        return json(res, 200, result);
      } catch (error) { return failure(res, error); }
    },
    'GET /api/centers/status': async (req, res) => {
      if (!config.enabled) return json(res, 404, { error: 'not found' });
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const sv = user.sv || 0;
      let status;
      try { status = await database.status(); }
      catch {
        return json(res, 503, { error: 'centers are temporarily unavailable', code: 'centers-unavailable' });
      }
      // The SQL check awaited: logout-all or disabling may have revoked this identity meanwhile.
      if (readSession(req) !== user || (user.sv || 0) !== sv) return json(res, 401, { error: 'not signed in' });
      return json(res, 200, { enabled: true, stage: 'foundation', ...status });
    },
  };
}

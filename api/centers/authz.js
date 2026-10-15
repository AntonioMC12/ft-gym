import { ROLE_CAPABILITIES, PLATFORM_CAPABILITIES } from './domain/policies.js';
import { CentersError } from './errors.js';

export const recordId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
export const isPlatformUser = (config, user) => !!user && (config.superadminUids || []).includes(user.id);
export const platformCapabilities = (config, user) => isPlatformUser(config, user) ? [...PLATFORM_CAPABILITIES] : [];

export function roleCapabilities(assignments, member = false) {
  const caps = new Set(member ? ROLE_CAPABILITIES.member : []);
  for (const role of assignments) {
    for (const cap of ROLE_CAPABILITIES[role.role] || []) caps.add(cap);
    // Extra grants are restricted by the schema as well as this allowlist.
    for (const cap of role.extra_capabilities || []) if (['data.export', 'payments.refund'].includes(cap)) caps.add(cap);
  }
  return [...caps].sort();
}

export async function requireCenter(client, uid, centerId, capability, { lock = false, allowInactive = false } = {}) {
  if (!recordId(centerId)) throw new CentersError(404, 'not-found', 'not found');
  if (lock) {
    // All sensitive center services take this lock first, before rows/roles, avoiding mixed-order deadlocks.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:' || $1))", [centerId]);
    await client.query('SELECT centers.lock_my_roles($1)', [centerId]);
  }
  const { rows: centers } = await client.query('SELECT id, name, state, version FROM centers.centers WHERE id = $1', [centerId]);
  if (!centers.length) throw new CentersError(404, 'not-found', 'not found');
  const { rows: assignments } = await client.query(`SELECT id, role, extra_capabilities FROM centers.role_assignments
    WHERE account_uid = $1 AND center_id = $2 AND revoked_at IS NULL AND valid_from <= statement_timestamp()
    AND (valid_until IS NULL OR valid_until > statement_timestamp())`, [uid, centerId]);
  const { rows: members } = await client.query('SELECT id FROM centers.members WHERE account_uid = $1 AND center_id = $2', [uid, centerId]);
  if (!assignments.length && !members.length) throw new CentersError(404, 'not-found', 'not found');
  const capabilities = roleCapabilities(assignments, members.length > 0);
  if (!capabilities.includes(capability)) throw new CentersError(403, 'forbidden', 'forbidden');
  if (!allowInactive && centers[0].state !== 'active') throw new CentersError(409, 'center-inactive', 'center is not active');
  return Object.freeze({ uid, centerId, capabilities, center: centers[0] });
}

export function memberDto(member, capabilities) {
  const operational = { id: member.id, centerId: member.center_id, number: member.member_number,
    name: member.name, state: member.state, version: member.version };
  if (!capabilities.includes('members.read')) return operational;
  return { ...operational, accountLinked:!!member.account_uid, email: member.email, phone: member.phone, nationalDocument: member.national_document,
    joinedOn: member.joined_on, endsOn: member.ends_on };
}

import { platformCapabilities, roleCapabilities } from '../authz.js';

export async function affiliations(database, config, user) {
  return database.accountTransaction(user.id, async client => {
    const { rows: roles } = await client.query(`SELECT r.center_id, r.role, r.extra_capabilities, c.name, c.state
      FROM centers.role_assignments r JOIN centers.centers c ON c.id = r.center_id
      WHERE r.account_uid = $1 AND r.revoked_at IS NULL AND r.valid_from <= CURRENT_TIMESTAMP
      AND (r.valid_until IS NULL OR r.valid_until > CURRENT_TIMESTAMP)`, [user.id]);
    const { rows: members } = await client.query(`SELECT m.center_id, c.name, c.state
      FROM centers.members m JOIN centers.centers c ON c.id = m.center_id WHERE m.account_uid = $1`, [user.id]);
    const grouped = new Map();
    for (const row of [...roles, ...members]) {
      if (!grouped.has(row.center_id)) grouped.set(row.center_id, { id: row.center_id, name: row.name, state: row.state, roles: [], member: false });
    }
    for (const role of roles) grouped.get(role.center_id).roles.push(role);
    for (const member of members) grouped.get(member.center_id).member = true;
    return { platformCapabilities: platformCapabilities(config, user), centers: [...grouped.values()].map(center => ({
      id: center.id, name: center.name, state: center.state, capabilities: roleCapabilities(center.roles, center.member),
    })).sort((a, b) => a.id.localeCompare(b.id)) };
  });
}

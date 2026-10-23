// Dedicated opt-in local fixture entrypoint, copied ONLY into the preview Docker target.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { documentKey } from '../../account-identity.js';
import { assertSandboxEnvironment, sandboxAccounts, trainingAccounts, seedTrainingFiles } from './exercise-fixtures.mjs';
import { createCentersDatabase } from '../../centers/db.js';
import { createAccountLocks } from '../../centers/account-links.js';
import { createMember } from '../../centers/services/members.js';
import { createMembershipPlan } from '../../centers/services/membership-plans.js';
import { createSubscription } from '../../centers/services/subscriptions.js';

assertSandboxEnvironment(process.env);
// This bootstrap validates isolated URLs and the SQL test marker before creating anything.
await import('./preview-init.mjs');
const dir = process.env.CENTERS_PREVIEW_DATA_DIR, file = path.join(dir, 'db.json');
const accounts = JSON.parse(fs.readFileSync(file, 'utf8'));
const markerFile = path.join(dir, 'exercise-sandbox-marker');
if (fs.existsSync(markerFile)) {
  if (fs.readFileSync(markerFile, 'utf8') !== 'fictional-local-only-v1') throw new Error('invalid exercise sandbox marker');
} else {
  if (accounts.users.some(user => !['preview_platform', 'preview_manager', 'preview_trainer'].includes(user.id))) throw new Error('unmarked data is not a fresh preview; refusing fixture writes');
  fs.writeFileSync(markerFile, 'fictional-local-only-v1', { flag: 'wx', mode: 0o600 });
}
const root = accounts.users.find(user => user.id === 'preview_platform');
let added = false;
for (const user of sandboxAccounts) if (!accounts.users.some(existing => existing.id === user.id)) {
  accounts.users.push({ id: user.id, name: user.name, created: new Date().toISOString(), pw: structuredClone(root.pw) }); added = true;
}
const secretFile = path.join(dir, 'document-secret');
if (!fs.existsSync(secretFile)) {
  if (accounts.users.some(user => user.documentKey)) throw new Error('restore document-secret with the sandbox accounts');
  fs.writeFileSync(secretFile, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
}
const secret = fs.readFileSync(secretFile, 'utf8').trim();
for (const fixture of trainingAccounts) {
  const user = accounts.users.find(user => user.id === fixture.id);
  if (!user.documentKey) { user.documentKey = documentKey(fixture.document, secret); added = true; }
}
if (added) { fs.writeFileSync(file + '.tmp', JSON.stringify(accounts), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); }
const lookupAccount = uid => accounts.users.find(user => user.id === uid);
const database = createCentersDatabase({ enabled: true, databaseUrl: process.env.CENTERS_DATABASE_URL });
const ctx = { database, user: root, checkSession: () => {}, lookupAccount, accountLocks: createAccountLocks(lookupAccount) };
try {
  const { rows: centers } = await database.platformTransaction(root.id, c => c.query("SELECT c.id,(clock_timestamp() AT TIME ZONE c.timezone)::date::text AS today FROM centers.centers c WHERE EXISTS(SELECT 1 FROM centers.role_assignments r WHERE r.center_id=c.id AND r.account_uid='preview_manager' AND r.role='manager') ORDER BY c.created_at LIMIT 1"));
  if (centers.length !== 1) throw new Error('fictional center missing');
  const { id: centerId, today } = centers[0];
  const plan = (await createMembershipPlan(ctx, { centerId, name: 'Pruebas locales · Sin cobro', priceMinor: '0', currency: 'EUR', intervalMonths: 12,
    priceIncludesTax: true, taxBasisPoints: 0, proration: 'none', requestId: 'exercise_sandbox_plan_v1' }, { platform: true })).plan;
  for (const user of sandboxAccounts) {
    let { rows } = await database.platformTransaction(root.id, c => c.query('SELECT id,version FROM centers.members WHERE center_id=$1 AND account_uid=$2', [centerId, user.id]), centerId);
    if (!rows.length) {
      const member = (await createMember(ctx, { centerId, name: user.name, nationalDocument: user.document, requestId: `exercise_sandbox_${user.id}` }, { platform: true })).member;
      // Local fixture link, guarded by exact database URL AND SQL environment=test above.
      await database.platformTransaction(root.id, c => c.query('UPDATE centers.members SET account_uid=$2 WHERE center_id=$1 AND id=$3 AND account_uid IS NULL', [centerId, user.id, member.id]), centerId);
      rows = [member];
    }
    const { rows: subscriptions } = await database.platformTransaction(root.id, c => c.query('SELECT id FROM centers.subscriptions WHERE center_id=$1 AND member_id=$2', [centerId, rows[0].id]), centerId);
    if (!subscriptions.length) await createSubscription(ctx, { centerId, memberId: rows[0].id, memberVersion: rows[0].version,
      priceVersionId: plan.priceVersionId, effectiveOn: today, requestId: `exercise_sandbox_subscription_${user.id}` }, { platform: true });
  }
  const created = seedTrainingFiles(dir, today);
  console.log(`Exercise sandbox ready: ${sandboxAccounts.length} ordinary accounts; ${created} new training files. Existing work retained.`);
} finally { await database.close(); }
// No external jobs/providers or inherited production delivery configuration.
Object.assign(process.env, { MEDIA_UPLOADS: '1', CENTERS_JOBS_ENABLED: '0', CENTERS_MAINTENANCE_ENABLED: '0',
  CENTERS_MAIL_PROFILES_JSON: '', CENTERS_STRIPE_PROFILES_JSON: '', CENTERS_NOTIFICATIONS_TEST_CAPTURE: '1', COACH_DISABLED: '1' });
await import('../../server.js');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleCapabilities, platformCapabilities, memberDto, recordId } from '../centers/authz.js';
import { createAccountLocks } from '../centers/account-links.js';

test('platform access is an explicit uid allowlist, not user.admin or a local manager role', () => {
  const config = { superadminUids: ['platform'] };
  assert.deepEqual(platformCapabilities(config, { id: 'technical', admin: true }), []);
  assert.ok(platformCapabilities(config, { id: 'platform', admin: false }).includes('centers.manage'));
  assert.ok(!roleCapabilities([{ role: 'manager', extra_capabilities: ['data.export', 'centers.manage'] }]).includes('centers.manage'));
});

test('trainer DTO is an allowlist even when source contains private or economic fields', () => {
  const source = { id: 'm', center_id: 'a', member_number: '1', name: 'Fictitious', state: 'active', version: 1,
    national_document: 'sensitive', iban: 'sensitive', total_debt: 90, payments: [], email: 'private@test.invalid' };
  assert.deepEqual(memberDto(source, roleCapabilities([{ role: 'trainer' }])),
    { id: 'm', centerId: 'a', number: '1', name: 'Fictitious', state: 'active', version: 1 });
  assert.ok(!('iban' in memberDto(source, ['members.read'])));
});

test('invalid scoped identifiers never become SQL fragments', () => {
  assert.equal(recordId("a' OR 1=1"), false);
  assert.equal(recordId('a/b'), false);
  assert.equal(recordId('center_a'), true);
});

test('linking and deleting one account are mutually exclusive; failures release the lock', async () => {
  const locks = createAccountLocks(uid => uid === 'u' ? { id: uid } : null);
  let unlock;
  const pending = locks.withAccounts(['u'], () => new Promise(resolve => { unlock = resolve; }));
  await assert.rejects(locks.withAccounts(['u'], () => {}), { code: 'account-busy' });
  unlock(); await pending;
  await assert.rejects(locks.withAccounts(['u'], () => { throw new Error('SQL failed'); }), /SQL failed/);
  assert.equal(await locks.withAccounts(['u'], () => 42), 42);
  await assert.rejects(locks.withAccounts(['missing'], () => {}), { status: 404 });
});

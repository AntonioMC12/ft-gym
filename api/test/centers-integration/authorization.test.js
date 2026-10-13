import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { isolatedDatabase, startHttp } from './helpers.mjs';
import { createCentersDatabase } from '../../centers/db.js';
import { requireCenter } from '../../centers/authz.js';

test('business SQL and HTTP enforce center isolation, role projections, revocation and identity references', async t => {
  const { app, migrator } = await isolatedDatabase();
  const db = createCentersDatabase({ enabled: true, databaseUrl: app });
  t.after(async () => { await db.close(); await migrator.end(); });
  const prefix = 't_' + randomBytes(6).toString('hex');
  const id = key => `${prefix}_${key}`;
  const centerA = id('a'), centerB = id('b');
  const managerA = id('manager_a'), managerB = id('manager_b'), trainer = id('trainer'), multi = id('multi');
  const platform = id('platform'), technical = id('technical'), personal = id('personal'), orphan = id('orphan');
  await db.platformTransaction(platform, async client => {
    for (const center of [centerA, centerB]) await client.query('INSERT INTO centers.centers(id,name,state) VALUES($1,$2,$3)', [center, center, 'active']);
    for (const [key, center, uid, role] of [['ra',centerA,managerA,'manager'], ['rb',centerB,managerB,'manager'], ['rt',centerA,trainer,'trainer'], ['orphan',centerA,orphan,'trainer']]) {
      await client.query('INSERT INTO centers.role_assignments(id,center_id,account_uid,role) VALUES($1,$2,$3,$4)', [id(key), center, uid, role]);
    }
    for (const [key, center] of [['ma',centerA], ['mb',centerB]]) await client.query(`INSERT INTO centers.members
      (id,center_id,account_uid,member_number,name,email,national_document,state) VALUES($1,$2,$3,$4,$5,$6,$7,'active')`,
      [id(key), center, multi, '1', key, 'same@test.invalid', '12345678Z']);
  });
  const h = await startHttp(t, { app, users: [managerA,managerB,trainer,multi,platform,personal].map(uid => ({ id:uid,name:uid })).concat([{ id:technical,name:technical,admin:true }]), superadminUids:[platform] });
  const request = async (path, uid, body) => {
    const r = await fetch(h.base+path, { headers:h.headers(uid), ...(body ? { method:'POST',body:JSON.stringify(body) } : {}) });
    return { status:r.status,body:await r.json() };
  };
  const own = await request('/api/centers/me', managerA);
  assert.deepEqual(own.body.centers.map(c=>c.id), [centerA]);
  assert.deepEqual((await request('/api/centers/me', multi)).body.centers.map(c=>c.id), [centerA,centerB]);
  assert.deepEqual((await request('/api/centers/me', personal)).body.centers, []);
  assert.equal((await request(`/api/centers/member?centerId=${centerB}&id=${id('mb')}`, managerA)).status,404);
  const training = await request(`/api/centers/member?centerId=${centerA}&id=${id('ma')}`,trainer);
  assert.equal(training.status,200);
  assert.deepEqual(Object.keys(training.body.member).sort(), ['centerId','id','name','number','state','version']);
  assert.equal((await request(`/api/centers/member?centerId=${centerA}&id=${id('ma')}`,managerA)).body.member.nationalDocument, '12345678Z');
  assert.equal((await request('/api/admin/users',managerA)).status,403);
  assert.equal((await request('/api/admin/users',platform)).status,403);
  assert.equal((await request('/api/platform/centers/reconciliation',technical)).status,403);
  assert.ok((await request('/api/platform/centers/reconciliation',platform)).body.orphanedAccounts.includes(orphan));

  await db.transaction({uid:managerA,centerId:centerB},async client => {
    assert.deepEqual((await client.query('SELECT id FROM centers.members WHERE center_id=$1',[centerB])).rows,[]);
  });
  await assert.rejects(db.transaction({uid:managerA,centerId:centerA},client => client.query(
    'INSERT INTO centers.consents(id,center_id,member_id,purpose,text_version,granted_at,source) VALUES($1,$2,$3,$4,$5,NOW(),$6)',
    [id('wrong_fk'),centerA,id('mb'),'terms','v1','reception'])),{code:'23503'});
  await assert.rejects(db.transaction({uid:managerA,centerId:centerA},client => client.query(`INSERT INTO centers.members
    (id,center_id,member_number,name,email) VALUES($1,$2,$3,$4,$5)`,[id('dupe'),centerA,'2','dupe','SAME@test.invalid'])),{code:'23505'});
  await assert.rejects(db.transaction({uid:managerA,centerId:centerA},client=>client.query('DELETE FROM centers.business_audit')),{code:'42501'});
  await db.transaction({uid:managerA,centerId:centerA},client=>requireCenter(client,managerA,centerA,'members.manage',{lock:true}));
  assert.equal(await db.hasAccountReferences(technical,multi),true);
  assert.equal(await db.hasAccountReferences(technical,personal),false);
  assert.equal((await request('/api/admin/user/delete',technical,{id:multi})).status,409);
  assert.equal((await request('/api/admin/user/delete',technical,{id:personal})).status,200);

  await db.platformTransaction(platform,client => client.query('UPDATE centers.role_assignments SET revoked_at=NOW() WHERE id=$1',[id('ra')]));
  assert.deepEqual((await request('/api/centers/me',managerA)).body.centers,[]);
  assert.equal((await request(`/api/centers/member?centerId=${centerA}&id=${id('ma')}`,managerA)).status,404);
  const disabled = await startHttp(t,{app,enabled:false,attached:true,users:[{id:technical,name:technical,admin:true},{id:multi,name:multi}]});
  assert.equal((await fetch(disabled.base+'/api/centers/me',{headers:disabled.headers(multi)})).status,404);
  assert.equal((await fetch(disabled.base+'/api/admin/user/delete',{method:'POST',headers:disabled.headers(technical),body:JSON.stringify({id:multi})})).status,409);
  const offline = await startHttp(t,{app:'postgresql://centers_app:fictional@127.0.0.1:1/unavailable',enabled:false,attached:true,users:[{id:technical,name:technical,admin:true},{id:multi,name:multi}]});
  assert.equal((await fetch(offline.base+'/api/admin/user/delete',{method:'POST',headers:offline.headers(technical),body:JSON.stringify({id:multi})})).status,503);
  assert.equal((await fetch(offline.base+'/api/data',{headers:offline.headers(multi)})).status,200);
});

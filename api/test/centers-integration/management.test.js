import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { isolatedDatabase,startHttp } from './helpers.mjs';
import { createCentersDatabase } from '../../centers/db.js';

test('center management is idempotent, scoped, versioned and preserves an enabled manager under concurrency',async t=>{
  const {app,migrator}=await isolatedDatabase();
  const db=createCentersDatabase({enabled:true,databaseUrl:app});
  t.after(async()=>{await db.close();await migrator.end();});
  const p='m_'+randomBytes(6).toString('hex'),uid=name=>`${p}_${name}`;
  const platform=uid('platform'),technical=uid('technical'),a=uid('a'),b=uid('b'),trainer=uid('trainer');
  const h=await startHttp(t,{app,superadminUids:[platform],users:[platform,a,b,trainer].map(id=>({id,name:id})).concat([{id:technical,name:technical,admin:true}])});
  const request=async(route,actor,body)=>{
    const r=await fetch(h.base+route,{headers:h.headers(actor),...(body?{method:'POST',body:JSON.stringify(body)}:{})});
    return {status:r.status,body:await r.json()};
  };
  const original={name:'Fictitious center',managerUid:a,requestId:uid('create'),capacity:120,billingDay:31,openingHours:{'1':[['07:00','22:00']]}};
  assert.equal((await request('/api/platform/centers/create',technical,original)).status,403);
  assert.equal((await request('/api/platform/centers/create',a,original)).status,403);
  const first=await request('/api/platform/centers/create',platform,original);
  assert.equal(first.status,200);assert.equal(first.body.center.state,'active');
  assert.equal(first.body.center.capacity,120);assert.equal(first.body.center.billingDay,31);
  const center=first.body.center,id=center.id;
  assert.deepEqual((await request('/api/platform/centers/create',platform,original)).body,first.body);
  assert.equal((await request('/api/platform/centers/create',platform,{...original,name:'different'})).status,409);
  assert.equal((await request('/api/platform/centers/create',platform,{...original,requestId:uid('invalid'),openingHours:{1:[['22:00','07:00']]}})).status,400);
  assert.equal((await request('/api/admin/user/disable',technical,{id:a,disabled:true})).body.code,'last-manager');
  assert.equal((await request('/api/admin/user/delete',technical,{id:platform})).body.code,'last-platform-admin');
  const staff=await request(`/api/centers/staff?centerId=${id}`,platform);
  const roleA=staff.body.staff.find(r=>r.accountUid===a);
  assert.equal((await request('/api/platform/centers/revoke-role',platform,{centerId:id,version:1,assignmentId:roleA.id})).body.code,'last-manager');
  const added=await request('/api/platform/centers/assign-manager',platform,{centerId:id,version:1,accountUid:b});
  assert.equal(added.status,200);assert.equal(added.body.centerVersion,2);
  const responses=await Promise.all([
    request('/api/platform/centers/revoke-role',platform,{centerId:id,version:2,assignmentId:roleA.id}),
    request('/api/platform/centers/revoke-role',platform,{centerId:id,version:2,assignmentId:added.body.assignment.id}),
  ]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const live=(await request(`/api/centers/staff?centerId=${id}`,platform)).body.staff.filter(r=>r.role==='manager'&&!r.revoked);
  assert.equal(live.length,1);
  const manager=live[0].accountUid;
  assert.equal((await request('/api/admin/user/disable',technical,{id:manager,disabled:true})).status,409);
  assert.equal((await request('/api/platform/centers/assign-manager',manager,{centerId:id,version:3,accountUid:trainer})).status,403);
  assert.equal((await request('/api/centers/staff/assign',manager,{centerId:id,version:3,accountUid:trainer,role:'manager'})).status,403);
  const trainerRole=await request('/api/centers/staff/assign',manager,{centerId:id,version:3,accountUid:trainer});
  assert.equal(trainerRole.status,200);
  const managerDetail=await request(`/api/centers/detail?centerId=${id}`,manager);
  assert.equal(managerDetail.body.center.billingDay,31);
  const trainerDetail=await request(`/api/centers/detail?centerId=${id}`,trainer);
  assert.equal(trainerDetail.status,200);
  assert.equal(trainerDetail.body.center.capacity,120);
  assert.equal('taxId' in trainerDetail.body.center,false);
  assert.equal('billingDay' in trainerDetail.body.center,false);
  assert.equal((await request(`/api/centers/detail?centerId=${id}`,technical)).status,404);
  assert.equal((await request('/api/centers/staff/assign',trainer,{centerId:id,version:4,accountUid:a})).status,403);
  const draft=await request('/api/platform/centers/create',platform,{name:'Pending manager',requestId:uid('draft')});
  assert.equal(draft.body.center.state,'draft');
  assert.equal((await request('/api/platform/centers/update',platform,{centerId:draft.body.center.id,version:1,name:'Pending manager',state:'active'})).body.code,'last-manager');
  assert.equal((await request('/api/centers/update',manager,{centerId:draft.body.center.id,version:1,name:'cross center'})).status,404);
  const assigned=await request('/api/platform/centers/assign-manager',platform,{centerId:draft.body.center.id,version:1,accountUid:a});
  assert.equal(assigned.body.state,'active');
  const replaced=await request('/api/platform/centers/assign-manager',platform,{centerId:draft.body.center.id,version:2,accountUid:b,replaceAssignmentId:assigned.body.assignment.id});
  assert.equal(replaced.status,200);
  const inactive=await request('/api/platform/centers/update',platform,{centerId:draft.body.center.id,version:3,name:'Pending manager',state:'inactive'});
  assert.equal(inactive.status,200);
  const reactivated=await request('/api/platform/centers/update',platform,{centerId:draft.body.center.id,version:4,name:'Pending manager',state:'active'});
  assert.equal(reactivated.status,200);assert.equal(reactivated.body.center.state,'active');
  assert.deepEqual((await request(`/api/centers/staff?centerId=${draft.body.center.id}`,platform)).body.staff.filter(r=>!r.revoked).map(r=>r.accountUid),[b]);

  await assert.rejects(db.platformTransaction(platform,client=>client.query("UPDATE centers.role_assignments SET revoked_at=NOW() WHERE center_id=$1 AND role='manager'",[id])),{code:'23514'});
  const audit=await db.platformTransaction(platform,client=>client.query('SELECT action FROM centers.business_audit WHERE center_id=$1',[id]));
  assert.ok(audit.rows.some(r=>r.action==='center.created'));
  assert.ok(audit.rows.some(r=>r.action==='role.revoked'));
});

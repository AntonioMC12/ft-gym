import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';

test('membership dates, cancellation recovery and role projections remain coherent without jobs',async t=>{
  const {app,migrator}=await isolatedDatabase();const db=createCentersDatabase({enabled:true,databaseUrl:app});
  t.after(async()=>{await db.close();await migrator.end()});
  const p='lc_'+randomBytes(5).toString('hex'),platform=p+'_platform',manager=p+'_manager',trainer=p+'_trainer';
  const h=await startHttp(t,{app,superadminUids:[platform],users:[platform,manager,trainer].map(id=>({id,name:id}))});
  const req=async(path,uid,body)=>{const r=await fetch(h.base+path,{headers:h.headers(uid),...(body?{method:'POST',body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()}};
  const center=(await req('/api/platform/centers/create',platform,{name:p,managerUid:manager,requestId:p+'_center'})).body.center.id;
  await req('/api/centers/staff/assign',manager,{centerId:center,version:1,accountUid:trainer});
  const created=await req('/api/centers/members/create',manager,{centerId:center,name:'Synthetic lifecycle',requestId:p+'_member'});
  const id=created.body.member.id,today=created.body.member.joinedOn;
  const offset=n=>{const day=new Date(today+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+n);return day.toISOString().slice(0,10)};
  const transition='/api/centers/members/transition',cancel='/api/centers/members/transition/cancel';
  const input={centerId:center,id,version:1,action:'end',effectiveOn:offset(5),reason:'Synthetic termination',requestId:p+'_end_future'};
  const planned=await req(transition,manager,input);assert.equal(planned.status,200);
  assert.equal(planned.body.member.state,'preactive');assert.equal(planned.body.member.endsOn,offset(5));
  const end=planned.body.changes.find(c=>c.action==='end');assert.equal(end.canCancel,true);
  assert.deepEqual((await req(transition,manager,input)).body,planned.body);
  assert.equal((await req(transition,manager,{...input,effectiveOn:offset(6)})).body.code,'idempotency-conflict');
  assert.equal((await req(transition,manager,{...input,version:2,requestId:p+'_conflict'})).body.code,'pending-transition');
  const canceled=await req(cancel,platform,{centerId:center,id,version:2,changeId:end.id,requestId:p+'_cancel'});
  assert.equal(canceled.status,200);assert.equal(canceled.body.member.state,'preactive');assert.equal(canceled.body.member.endsOn,null);
  assert.equal((await req(transition,trainer,{...input,version:3,requestId:p+'_trainer'})).status,403);
  // Synthetic activation stands in for the future C17 contract workflow, never an HTTP shortcut.
  await db.platformTransaction(platform,client=>client.query("UPDATE centers.members SET state='active' WHERE center_id=$1 AND id=$2",[center,id]),center);
  const freeze=await req(transition,manager,{centerId:center,id,version:3,action:'freeze',effectiveOn:today,resumeOn:offset(10),reason:'Synthetic pause',requestId:p+'_freeze'});
  assert.equal(freeze.status,200);assert.equal(freeze.body.member.state,'frozen');
  const freezeRoot=freeze.body.changes.find(c=>c.action==='freeze');assert.equal(freezeRoot.canCancel,false);
  const auto=freeze.body.changes.find(c=>c.automatic&&!c.canceled);assert.ok(auto);
  assert.equal((await req(cancel,manager,{centerId:center,id,version:4,changeId:freezeRoot.id,requestId:p+'_badcancel'})).status,409);
  const op=await req(`/api/centers/member?centerId=${center}&id=${id}`,trainer);assert.equal(op.body.member.state,'frozen');assert.equal('changes'in op.body,false);
  const ended=await req(transition,platform,{centerId:center,id,version:4,action:'end',effectiveOn:offset(5),reason:'Synthetic early end',requestId:p+'_earlyend'});
  assert.equal(ended.status,200);assert.equal(ended.body.member.state,'frozen');
  assert.equal(ended.body.changes.find(c=>c.id===auto.id).canceled,true);
  const newEnd=ended.body.changes.find(c=>c.action==='end'&&!c.canceled);
  const restored=await req(cancel,manager,{centerId:center,id,version:5,changeId:newEnd.id,requestId:p+'_restore'});
  assert.equal(restored.status,200);assert.equal(restored.body.member.state,'frozen');
  assert.equal(restored.body.changes.filter(c=>c.automatic&&!c.canceled).length,1);
  const resumed=await req(transition,manager,{centerId:center,id,version:6,action:'resume',effectiveOn:today,requestId:p+'_resume'});
  assert.equal(resumed.status,200);assert.equal(resumed.body.member.state,'active');
  assert.equal(resumed.body.changes.filter(c=>c.automatic&&!c.canceled).length,0);
  const last=await req(transition,manager,{centerId:center,id,version:7,action:'end',effectiveOn:today,reason:'Synthetic final end',requestId:p+'_final'});
  assert.equal(last.status,200);assert.equal(last.body.member.state,'ended');
  assert.equal((await req(`/api/centers/members?centerId=${center}&state=ended`,manager)).body.members[0].id,id);
  assert.equal((await req(`/api/centers/members?centerId=${center}&state=active`,manager)).body.members.length,0);
  const historical=(await req('/api/centers/members/create',manager,{centerId:center,name:'Synthetic automatic resume',requestId:p+'_historical'})).body.member;
  await db.platformTransaction(platform,async client=>{
    await client.query("UPDATE centers.members SET state='active',joined_on=$3 WHERE center_id=$1 AND id=$2",[center,historical.id,offset(-5)]);
    await client.query(`INSERT INTO centers.membership_changes(id,center_id,member_id,sequence,action,from_state,to_state,effective_on,resume_on,reason,actor_uid)
      VALUES($1,$2,$3,1,'freeze','active','frozen',$4,$5,'Synthetic historical pause',$6)`,[p+'_pastroot',center,historical.id,offset(-1),today,platform]);
    await client.query(`INSERT INTO centers.membership_changes(id,center_id,member_id,sequence,action,from_state,to_state,effective_on,parent_id,actor_uid)
      VALUES($1,$2,$3,2,'resume','frozen','active',$4,$5,$6)`,[p+'_pastresume',center,historical.id,today,p+'_pastroot',platform]);
  },center);
  assert.equal((await req(`/api/centers/member?centerId=${center}&id=${historical.id}`,manager)).body.member.state,'active');
  const concurrent=(await req('/api/centers/members/create',manager,{centerId:center,name:'Synthetic concurrent transition',requestId:p+'_concurrent'})).body.member;
  await db.platformTransaction(platform,client=>client.query("UPDATE centers.members SET state='active',account_uid=$3 WHERE center_id=$1 AND id=$2",[center,concurrent.id,trainer]),center);
  const race=await Promise.all(['end','freeze'].map(action=>req(transition,manager,{centerId:center,id:concurrent.id,version:1,action,effectiveOn:today,reason:'Synthetic race',requestId:p+'_race_'+action})));
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  assert.equal((await req('/api/me',trainer)).status,200);
  const east=(await req('/api/platform/centers/create',platform,{name:p+'_east',managerUid:manager,timezone:'Pacific/Kiritimati',requestId:p+'_east'})).body.center.id;
  const west=(await req('/api/platform/centers/create',platform,{name:p+'_west',managerUid:manager,timezone:'Pacific/Pago_Pago',requestId:p+'_west'})).body.center.id;
  const em=(await req('/api/centers/members/create',manager,{centerId:east,name:'Synthetic eastern zone',requestId:p+'_em'})).body.member;
  const wm=(await req('/api/centers/members/create',manager,{centerId:west,name:'Synthetic western zone',requestId:p+'_wm'})).body.member;
  assert.ok(em.joinedOn>wm.joinedOn);
  for(const [cid,m,expected]of [[east,em,'ended'],[west,wm,'preactive']]){
    const answer=await req(transition,manager,{centerId:cid,id:m.id,version:1,action:'end',effectiveOn:em.joinedOn,reason:'Synthetic zone comparison',requestId:p+'_zone_'+cid});
    assert.equal(answer.status,200);assert.equal(answer.body.member.state,expected);
  }
  assert.equal((await db.transaction({uid:trainer,centerId:center},client=>client.query('SELECT id FROM centers.member_profiles WHERE center_id=$1',[east]))).rows.length,0);
  await assert.rejects(db.platformTransaction(platform,client=>client.query('DELETE FROM centers.membership_changes WHERE center_id=$1',[center]),center),{code:'42501'});
  await assert.rejects(db.platformTransaction(platform,client=>client.query("UPDATE centers.membership_changes SET reason='rewrite' WHERE center_id=$1",[center]),center),{code:'42501'});
  assert.equal((await req('/api/me',manager)).status,200);
});

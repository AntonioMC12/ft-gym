import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';

const bundle=()=>({opengym_plan:1,name:'Fictional strength',unit:'kg',routines:[{id:'r1',name:'Push',prog:'double',ex:[{id:'0025',sets:3,reps:8,weight:60,restSec:90}]}],week:{1:['r1']},customEx:[]});
async function fixture(t){
  const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await db.close();await migrator.end()});
  const p='tr_'+randomBytes(5).toString('hex'),ids=Object.fromEntries(['root','manager','trainer','alice','bob','other','technical'].map(role=>[role,p+'_'+role]));
  const h=await startHttp(t,{app,superadminUids:[ids.root],users:Object.entries(ids).map(([role,id])=>({id,name:id,...(role==='technical'?{admin:true}:{})}))});
  const req=async(route,uid,body,method=body?'POST':'GET')=>{const r=await fetch(h.base+route,{headers:h.headers(uid),method,...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
  const center=(await req('/api/platform/centers/create',ids.root,{name:p,managerUid:ids.manager,requestId:p+'_center'})).body.center.id;
  const other=(await req('/api/platform/centers/create',ids.root,{name:p+'_other',managerUid:ids.other,requestId:p+'_other_center'})).body.center.id;
  await req('/api/centers/staff/assign',ids.manager,{centerId:center,version:1,accountUid:ids.trainer});
  const linked=async(uid,label)=>{
    const member=(await req('/api/centers/members/create',ids.manager,{centerId:center,name:'Fictional '+label,requestId:p+'_'+label})).body.member;
    const invite=await req('/api/centers/invitations/create',ids.manager,{centerId:center,kind:'member',memberId:member.id,accountUid:uid,requestId:p+'_'+label+'_invite'});
    assert.equal((await req('/api/centers/invitations/accept',uid,{token:invite.body.token})).status,200);
    // Explicit fixture state; financial subscriptions are independently covered.
    await db.platformTransaction(ids.root,client=>client.query("UPDATE centers.members SET state='active',version=version+1 WHERE center_id=$1 AND id=$2",[center,member.id]),center);
    return (await req(`/api/centers/member?centerId=${center}&id=${member.id}`,ids.manager)).body.member;
  };
  const alice=await linked(ids.alice,'alice'),bob=await linked(ids.bob,'bob'),dual=await linked(ids.manager,'dual');
  const propose=async(member=alice,uid=ids.trainer,suffix='new')=>req('/api/centers/training/propose',uid,{centerId:center,memberId:member.id,memberVersion:member.version,bundle:bundle(),requestId:p+'_'+suffix});
  const own=proposal=>({centerId:center,id:proposal.id,versionId:proposal.versionId,requestId:p+'_accept_'+proposal.versionId});
  return {db,migrator,p,ids,h,req,center,other,alice,bob,dual,propose,own};
}

test('training delivery uses stable accepted IDs, strict own scope and a durable JSON ack without staff writes',async t=>{
  const f=await fixture(t),{ids,center,alice,bob,req,propose,own,db,h,p}=f;
  const original={_ts:100,unit:'kg',routines:[{id:'personal',name:'Personal',ex:[]}],workouts:[],week:{2:['personal']},dayPlan:{'2026-10-16':['personal']}};
  fs.writeFileSync(path.join(h.dir,`state-${ids.alice}.json`),JSON.stringify(original));
  const first=await propose();assert.equal(first.status,200,JSON.stringify(first));const proposal=first.body.proposal;
  assert.deepEqual((await propose()).body,first.body);
  assert.equal(fs.readFileSync(path.join(h.dir,`state-${ids.alice}.json`),'utf8'),JSON.stringify(original));
  assert.match(proposal.deliveryKey,/^td_[a-f0-9]{32}$/);assert.match(proposal.routineIds.r1,/^cr_[a-f0-9]{32}$/);
  assert.equal((await req(`/api/centers/own/training?centerId=${center}`,ids.alice)).body.proposals.length,1);
  assert.equal((await req(`/api/centers/own/training?centerId=${center}`,ids.bob)).body.proposals.length,0);
  assert.equal((await req(`/api/centers/own/training?centerId=${center}&memberId=${alice.id}`,ids.alice)).status,400);
  for(const uid of [ids.bob,ids.manager,ids.root])assert.equal((await req(`/api/centers/own/training/proposal?centerId=${center}&id=${proposal.id}`,uid)).status,404);
  const accepted=await Promise.all([req('/api/centers/own/training/accept',ids.alice,own(proposal)),req('/api/centers/own/training/accept',ids.alice,{...own(proposal),requestId:p+'_second_device'})]);
  assert.ok(accepted.every(row=>row.status===200),JSON.stringify(accepted));assert.equal(accepted[0].body.proposal.acceptedAt,accepted[1].body.proposal.acceptedAt);
  assert.deepEqual(accepted[0].body.proposal.routineIds,accepted[1].body.proposal.routineIds);
  assert.ok(!JSON.stringify(accepted[0].body).includes(alice.id));
  const ack={...own(proposal),requestId:p+'_ack'};
  assert.equal((await req('/api/centers/own/training/ack',ids.alice,ack)).body.code,'training-not-synced');
  const a=accepted[0].body.proposal,rid=a.routineIds.r1,personal={...original,_ts:200,routines:[...original.routines,{...a.bundle.routines[0],id:rid}],planDeliveries:[{id:a.deliveryKey,acceptedAt:Date.parse(a.acceptedAt),routineIds:[rid]}]};
  assert.equal((await req('/api/data',ids.alice,{state:personal,stamped:true},'PUT')).status,200);
  const receipt=await req('/api/centers/own/training/ack',ids.alice,ack);assert.equal(receipt.status,200,JSON.stringify(receipt));assert.equal(receipt.body.proposal.deliveryResult,'applied');
  assert.deepEqual((await req('/api/centers/own/training/ack',ids.alice,ack)).body,receipt.body);
  const stored=JSON.parse(fs.readFileSync(path.join(h.dir,`state-${ids.alice}.json`),'utf8'));assert.deepEqual(stored.week,original.week);assert.deepEqual(stored.dayPlan,original.dayPlan);
  const counts=await db.platformTransaction(ids.root,async client=>({a:(await client.query('SELECT count(*)::int AS n FROM centers.training_acceptances WHERE center_id=$1',[center])).rows[0].n,k:(await client.query('SELECT count(*)::int AS n FROM centers.training_delivery_acks WHERE center_id=$1',[center])).rows[0].n}),center);
  assert.deepEqual(counts,{a:1,k:1});
  assert.equal((await req('/api/centers/training/withdraw',ids.trainer,{centerId:center,id:proposal.id,version:proposal.version,requestId:p+'_withdraw_accepted'})).body.code,'training-proposal-unavailable');
  assert.equal((await req('/api/centers/own/training/accept',ids.alice,{...own(proposal),memberId:bob.id})).status,400);
});

test('training RLS isolates centers and recipients, immutable payloads, role revocation and technical admin',async t=>{
  const {db,ids,center,other,req,propose,own,alice}=await fixture(t),proposal=(await propose()).body.proposal;
  for(const uid of [ids.other,ids.alice,ids.technical])assert.ok([403,404].includes((await req(`/api/centers/training?centerId=${center}`,uid)).status));
  assert.equal((await req(`/api/centers/training?centerId=${center}`,ids.root)).body.proposals.length,1);
  assert.equal((await db.transaction({uid:ids.other,centerId:other},client=>client.query('SELECT id FROM centers.training_versions WHERE center_id=$1',[center]))).rows.length,0);
  assert.equal((await db.transaction({uid:ids.bob,centerId:center},client=>client.query('SELECT id FROM centers.training_versions WHERE center_id=$1',[center]))).rows.length,0);
  await assert.rejects(db.transaction({uid:ids.trainer,centerId:center},client=>client.query("UPDATE centers.training_versions SET bundle='{}' WHERE id=$1",[proposal.versionId])),{code:'42501'});
  await assert.rejects(db.platformTransaction(ids.root,client=>client.query('DELETE FROM centers.training_versions WHERE id=$1',[proposal.versionId]),center),{code:'42501'});
  await assert.rejects(db.transaction({uid:ids.bob,centerId:center},client=>client.query('INSERT INTO centers.training_acceptances(center_id,version_id,member_id,recipient_uid) VALUES($1,$2,$3,$4)',[center,proposal.versionId,alice.id,ids.alice])),error=>['42501','23514'].includes(error.code));
  const staff=(await req(`/api/centers/staff?centerId=${center}`,ids.manager)).body.staff,trainer=staff.find(row=>row.accountUid===ids.trainer);
  assert.ok(trainer,JSON.stringify(staff));
  // Explicit SQL fixture revocation; the following HTTP request must reauthorize.
  await db.platformTransaction(ids.root,client=>client.query('UPDATE centers.role_assignments SET revoked_at=now() WHERE center_id=$1 AND account_uid=$2 AND revoked_at IS NULL',[center,ids.trainer]),center);
  assert.ok([403,404].includes((await propose(alice,ids.trainer,'revoked')).status));
  assert.equal((await req('/api/centers/own/training/accept',ids.bob,own(proposal))).status,404);
  await db.platformTransaction(ids.root,client=>client.query('UPDATE centers.members SET account_uid=NULL,version=version+1 WHERE center_id=$1 AND id=$2',[center,alice.id]),center);
  assert.equal((await req('/api/centers/own/training/accept',ids.alice,own(proposal))).body.code,'account-activation-required');
  await db.platformTransaction(ids.root,client=>client.query('UPDATE centers.members SET account_uid=$3,version=version+1 WHERE center_id=$1 AND id=$2',[center,alice.id,ids.technical]),center);
  assert.equal((await req(`/api/centers/own/training?centerId=${center}`,ids.technical)).body.proposals.length,0,'a replacement account does not inherit the previous recipient proposal');
  assert.equal((await req('/api/centers/own/training/accept',ids.technical,own(proposal))).status,404);
  assert.equal((await req(`/api/centers/own/training?centerId=${center}`,ids.manager)).body.proposals.length,0,'own reads do not inherit staff visibility');
});

test('training versions serialize concurrent revisions, retain accepted recovery and prevent new stale acceptance',async t=>{
  const {ids,center,req,propose,own,p,db,alice}=await fixture(t),proposal=(await propose()).body.proposal;
  const accepted=await req('/api/centers/own/training/accept',ids.alice,own(proposal));assert.equal(accepted.status,200);
  const revise={centerId:center,id:proposal.id,version:1,bundle:bundle(),requestId:p+'_revise'};
  const race=await Promise.all([req('/api/centers/training/revise',ids.trainer,revise),req('/api/centers/training/revise',ids.trainer,{...revise,requestId:p+'_race'})]);assert.deepEqual(race.map(row=>row.status).sort(),[200,409]);
  const next=race.find(row=>row.status===200).body.proposal;
  assert.notEqual(next.deliveryKey,proposal.deliveryKey);assert.notEqual(next.routineIds.r1,proposal.routineIds.r1);
  const recoverable=(await req(`/api/centers/own/training?centerId=${center}`,ids.alice)).body.proposals;assert.equal(recoverable.length,2);assert.ok(recoverable.some(row=>row.versionId===proposal.versionId&&row.acceptedAt),'pending accepted old version remains discoverable after a new offer');
  assert.equal((await req('/api/centers/own/training/accept',ids.alice,own(proposal))).body.proposal.acceptedAt,accepted.body.proposal.acceptedAt,'accepted version can recover after replacement');
  assert.equal((await req('/api/centers/own/training/accept',ids.alice,{...own(next),requestId:own(proposal).requestId})).body.code,'idempotency-conflict');
  const third=await req('/api/centers/training/revise',ids.manager,{...revise,version:next.version,requestId:p+'_third'});assert.equal(third.status,200);
  assert.equal((await req('/api/centers/own/training/accept',ids.alice,own(next))).body.code,'training-proposal-unavailable');
  const withdrawn=await req('/api/centers/training/withdraw',ids.manager,{centerId:center,id:proposal.id,version:third.body.proposal.version,requestId:p+'_withdraw'});assert.equal(withdrawn.status,200);
  assert.equal((await req('/api/centers/own/training/accept',ids.alice,own(third.body.proposal))).body.code,'training-proposal-unavailable');
  const another=(await propose(alice,ids.root,'another')).body.proposal;
  await db.platformTransaction(ids.root,client=>client.query("UPDATE centers.centers SET state='inactive',version=version+1 WHERE id=$1",[center]),center);
  assert.equal((await req('/api/centers/own/training/accept',ids.alice,own(another))).body.code,'center-inactive');
  assert.equal((await req('/api/centers/own/training/accept',ids.alice,own(proposal))).status,200,'existing personal acceptance is recoverable while center is inactive');
});

test('training acceptance requires active affiliation and ack requires exact persisted evidence, including deletion recovery',async t=>{
  const {ids,center,req,propose,own,p,db,h,alice}=await fixture(t),proposal=(await propose()).body.proposal,input=own(proposal),file=path.join(h.dir,`state-${ids.alice}.json`);
  assert.equal((await req('/api/centers/own/training/ack',ids.alice,{...input,requestId:p+'_early_ack'})).body.code,'training-not-accepted');
  const ownList=await req(`/api/centers/own/training?centerId=${center}`,ids.alice);assert.ok(!JSON.stringify(ownList.body).includes(alice.id));
  await db.platformTransaction(ids.root,client=>client.query("UPDATE centers.members SET state='frozen',version=version+1 WHERE center_id=$1 AND id=$2",[center,alice.id]),center);
  assert.equal((await req('/api/centers/own/training/accept',ids.alice,input)).body.code,'training-member-inactive');
  await db.platformTransaction(ids.root,client=>client.query("UPDATE centers.members SET state='active',version=version+1 WHERE center_id=$1 AND id=$2",[center,alice.id]),center);
  const a=(await req('/api/centers/own/training/accept',ids.alice,input)).body.proposal,rid=a.routineIds.r1,ack={...input,requestId:p+'_ack'};
  fs.writeFileSync(file,'{unreadable');assert.equal((await req('/api/centers/own/training/ack',ids.alice,ack)).body.code,'training-state-unavailable');
  const proof={id:a.deliveryKey,acceptedAt:Date.parse(a.acceptedAt),routineIds:[rid]};
  fs.writeFileSync(file,JSON.stringify({_ts:100,routines:[],planDeliveries:[{...proof,acceptedAt:proof.acceptedAt+1}],deleted:{routines:{[rid]:100}}}));
  assert.equal((await req('/api/centers/own/training/ack',ids.alice,ack)).body.code,'training-not-synced');
  fs.writeFileSync(file,JSON.stringify({_ts:100,routines:[],planDeliveries:[proof],deleted:{routines:{[rid]:100}}}));
  const removed=await req('/api/centers/own/training/ack',ids.alice,ack);assert.equal(removed.status,200);assert.equal(removed.body.proposal.deliveryResult,'removed');
  const other=(await propose({...alice,version:alice.version+2},ids.manager,'second')).body.proposal;
  assert.ok(other);
  assert.equal((await req('/api/centers/own/training/ack',ids.alice,{...own(other),requestId:ack.requestId})).body.code,'training-not-accepted');
  for(const field of ['memberId','accountUid','result','acceptedAt'])assert.equal((await req('/api/centers/own/training/accept',ids.alice,{...input,[field]:'forbidden'})).status,400);
});

test('training pages bind cursors to actor/member/center and retain normal CSRF defenses',async t=>{
  const {ids,center,other,req,propose,alice,bob,h,p}=await fixture(t);
  const a=await propose(),b=await propose(alice,ids.manager,'second'),c=await propose(bob,ids.trainer,'bob');for(const row of [a,b,c])assert.equal(row.status,200);
  const page=await req(`/api/centers/training?centerId=${center}&memberId=${alice.id}&limit=1`,ids.trainer);assert.equal(page.body.proposals.length,1);assert.ok(page.body.nextCursor);
  const cursor=encodeURIComponent(page.body.nextCursor),next=await req(`/api/centers/training?centerId=${center}&memberId=${alice.id}&limit=1&cursor=${cursor}`,ids.trainer);
  assert.equal(next.body.proposals.length,1);assert.notEqual(page.body.proposals[0].id,next.body.proposals[0].id);assert.equal(next.body.nextCursor,null);
  for(const [uid,cid,member] of [[ids.manager,center,alice.id],[ids.trainer,center,bob.id],[ids.other,other,alice.id]])assert.equal((await req(`/api/centers/training?centerId=${cid}&memberId=${member}&cursor=${cursor}`,uid)).status,400);
  const cookie=h.headers(ids.alice).Authorization.slice(7),r=await fetch(h.base+'/api/centers/own/training/accept',{method:'POST',headers:{Cookie:'gymsid='+cookie,Origin:'https://foreign.invalid','Content-Type':'application/json'},body:JSON.stringify({centerId:center,id:a.body.proposal.id,versionId:a.body.proposal.versionId,requestId:p+'_csrf'})});assert.equal(r.status,403);
});


test('identical offers by the same authorized author are idempotent across different request ids',async t=>{
 const f=await fixture(t);
 const target=(await f.req('/api/centers/member?'+new URLSearchParams({centerId:f.center,id:f.alice.id}),f.ids.manager)).body.member;
 const raw={centerId:f.center,memberId:target.id,memberVersion:target.version,bundle:bundle()};
 const [a,b]=await Promise.all(['a','b'].map(key=>f.req('/api/centers/training/propose',f.ids.manager,{...raw,requestId:f.p+'_dedup_'+key})));
 assert.equal(a.status,200,JSON.stringify(a));assert.equal(b.status,200,JSON.stringify(b));assert.equal(a.body.proposal.id,b.body.proposal.id);
 const accepted=await f.req('/api/centers/own/training/accept',f.ids.alice,f.own(a.body.proposal));assert.equal(accepted.status,200);
 const again=await f.req('/api/centers/training/propose',f.ids.manager,{...raw,requestId:f.p+'_dedup_after_accept'});assert.equal(again.status,200);assert.equal(again.body.proposal.id,a.body.proposal.id);
});

test('assigned-training roster is paginated, scoped to current links and excludes unaccepted offers',async t=>{
  const f=await fixture(t),url='/api/centers/training/members?centerId='+f.center;
  assert.equal((await f.req(url,f.ids.root)).body.members.length,0);
  const a=(await f.propose()).body.proposal;
  assert.equal((await f.req(url,f.ids.root)).body.members.length,0);
  assert.equal((await f.req('/api/centers/own/training/accept',f.ids.alice,f.own(a))).status,200);
  const b=(await f.propose(f.bob,f.ids.trainer,'bob_roster')).body.proposal;
  assert.equal((await f.req('/api/centers/own/training/accept',f.ids.bob,f.own(b))).status,200);
  const all=await f.req(url,f.ids.root);assert.equal(all.status,200,JSON.stringify(all));assert.equal(all.body.members.length,2);
  assert.deepEqual(Object.keys(all.body.members[0]).sort(),['assignedAt','id','name','number','plans'].sort());
  const page=await f.req(url+'&limit=1',f.ids.root);assert.equal(page.body.members.length,1);assert.ok(page.body.nextCursor);
  const next=await f.req(url+'&limit=1&cursor='+page.body.nextCursor,f.ids.root);assert.equal(next.body.members.length,1);assert.notEqual(next.body.members[0].id,page.body.members[0].id);
  assert.equal((await f.req(url+'&query=alice',f.ids.root)).body.members[0].id,f.alice.id);
  assert.equal((await f.req(url+'&query=%25',f.ids.root)).body.members.length,0);
  assert.equal((await f.req(url+'&query=alice&cursor='+page.body.nextCursor,f.ids.root)).status,400);
  assert.equal((await f.req(url+'&accountUid='+f.ids.alice,f.ids.root)).status,400);
  for(const uid of [f.ids.alice,f.ids.technical,f.ids.other])assert.ok([403,404].includes((await f.req(url,uid)).status));
  assert.equal((await f.req(url,f.ids.trainer)).body.members.length,2);
  assert.equal((await f.req('/api/centers/training/members?centerId='+f.other,f.ids.root)).body.members.length,0);
  await f.db.platformTransaction(f.ids.root,client=>client.query('UPDATE centers.members SET account_uid=$2,version=version+1 WHERE id=$1',[f.alice.id,f.ids.technical]),f.center);
  assert.equal((await f.req(url,f.ids.root)).body.members.length,1);
});

test('only platform oversight bypasses consent for assigned routines, never for private routines or ordinary reports',async t=>{
  const f=await fixture(t),a=(await f.propose()).body.proposal;
  const accepted=(await f.req('/api/centers/own/training/accept',f.ids.alice,f.own(a))).body.proposal,rid=accepted.routineIds.r1;
  const ownShare='/api/centers/own/training/progress/share?centerId='+f.center,today=(await f.req(ownShare,f.ids.alice)).body.today;
  const personal={_ts:Date.now(),routines:[{id:rid,name:'Assigned Push',ex:[]},{id:'private_routine',name:'PRIVATE_ROUTINE',ex:[]}],workouts:[{id:'assigned_session',d:today,routineIds:[rid],entries:[{id:'0025',rid,sets:[{w:999,r:99,done:true}],note:'PRIVATE_NOTE'},{id:'0043',rid,sets:[{w:777,r:88,done:true}]},{id:'0025',rid:'private_routine',sets:[{w:888,r:88,done:true}]}]},{id:'private_session',d:today,routineIds:['private_routine'],entries:[]}],bodyweight:[{v:88}]};
  fs.writeFileSync(path.join(f.h.dir,'state-'+f.ids.alice+'.json'),JSON.stringify(personal));
  const route='/api/centers/training/assigned-progress?'+new URLSearchParams({centerId:f.center,memberId:f.alice.id});
  // No assignment: do not read an unrelated personal JSON file, even if it is corrupt.
  fs.writeFileSync(path.join(f.h.dir,'state-'+f.ids.bob+'.json'),'corrupt private training');
  const unassigned=await f.req('/api/centers/training/assigned-progress?'+new URLSearchParams({centerId:f.center,memberId:f.bob.id}),f.ids.root);
  assert.equal(unassigned.status,200);assert.deepEqual(unassigned.body.report.routines,[]);
  const oversight=await f.req(route,f.ids.root);assert.equal(oversight.status,200,JSON.stringify(oversight));assert.equal(oversight.body.shared,true);assert.equal(oversight.body.report.routines.length,1);assert.equal(oversight.body.report.routines[0].sessions,1);
  for(const word of ['PRIVATE','777','888','bodyweight',rid,f.ids.alice])assert.ok(!JSON.stringify(oversight.body).includes(word),word);
  assert.equal(oversight.body.report.routines[0].exercises[0].weeks[0].load,999);assert.equal(oversight.body.report.routines[0].exercises[0].weeks[0].reps,99);
  for(const uid of [f.ids.trainer,f.ids.manager])assert.deepEqual((await f.req(route,uid)).body,{shared:false});
  assert.deepEqual((await f.req('/api/centers/training/progress?'+new URLSearchParams({centerId:f.center,memberId:f.alice.id}),f.ids.root)).body,{shared:false});
  for(const uid of [f.ids.technical,f.ids.alice,f.ids.other])assert.ok([403,404].includes((await f.req(route,uid)).status));
  const grant={centerId:f.center,version:0,fields:{enabled:true,routineIds:[rid,'private_routine'],from:today,to:today},requestId:f.p+'_roster_share'};
  assert.equal((await f.req('/api/centers/own/training/progress/share',f.ids.alice,grant)).status,200);
  const shared=await f.req(route,f.ids.trainer);assert.equal(shared.body.report.routines.length,1);assert.equal(shared.body.report.routines[0].name,'Assigned Push');assert.equal(shared.body.report.routines[0].exercises,undefined);assert.ok(!JSON.stringify(shared.body).includes('999'));
  assert.equal((await f.req('/api/centers/own/training/progress/share',f.ids.alice,{centerId:f.center,version:1,fields:{enabled:false},requestId:f.p+'_roster_revoke'})).status,200);
  assert.deepEqual((await f.req(route,f.ids.trainer)).body,{shared:false});assert.equal((await f.req(route,f.ids.root)).body.report.routines[0].sessions,1);
});

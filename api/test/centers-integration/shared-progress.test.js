import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixture,shift} from './class-fixture.mjs';
import {changeProgressShare} from '../../centers/services/shared-progress.js';
const profile=f=>({_ts:Date.now(),unit:'kg',routines:[{id:'shared_a',name:'Selected routine',ex:[]},{id:'private_routine',name:'PRIVATE_ROUTINE',ex:[]}],workouts:[{id:'saved_1',d:f.today,routineIds:['shared_a'],entries:[{id:'0025',sets:[{w:999,r:88,done:true}],note:'PRIVATE_ENTRY'}],note:'PRIVATE_SESSION'},{id:'saved_2',d:f.today,routineIds:['private_routine'],entries:[]}],bodyweight:[{d:f.today,v:88}],photos:['PRIVATE_PHOTO'],active:{routineIds:['shared_a']}});
const own=f=>'/api/centers/own/training/progress/share?centerId='+f.center;
const report=(f,uid=f.ids.trainer,memberId=f.members.alice,centerId=f.center)=>f.req('/api/centers/training/progress?'+new URLSearchParams({centerId,memberId}),uid);
const grant=(f,version=0,fields={enabled:true,routineIds:['shared_a'],from:shift(f.today,-10),to:f.today},suffix='grant')=>({centerId:f.center,version,fields,requestId:f.p+'_'+suffix});
const save=(f,state)=>fs.writeFileSync(path.join(f.h.dir,'state-'+f.ids.alice+'.json'),JSON.stringify(state));
test('only linked owners can share an explicit subset; trainer/manager/platform see no private profile and revocation cannot be undone by replay',async t=>{
  const f=await fixture(t);save(f,profile(f));assert.equal((await f.req(own(f),f.ids.alice)).body.share.enabled,false);assert.deepEqual((await report(f)).body,{shared:false});
  const command=grant(f);for(const uid of [f.ids.trainer,f.ids.technical,f.ids.root])assert.ok([403,404].includes((await f.req('/api/centers/own/training/progress/share',uid,command)).status));
  assert.equal((await f.req(own(f)+'&memberId='+f.members.bob,f.ids.alice)).status,400);
  const shared=await f.req('/api/centers/own/training/progress/share',f.ids.alice,command);assert.equal(shared.status,200,JSON.stringify(shared));assert.equal(shared.body.share.version,1);
  for(const uid of [f.ids.trainer,f.ids.manager,f.ids.root]){const result=await report(f,uid);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.body.shared,true);assert.equal(result.body.report.routines[0].sessions,1);const json=JSON.stringify(result.body);for(const word of ['PRIVATE','999','photos','entries','bodyweight',f.ids.alice,f.members.alice,'shared_a'])assert.ok(!json.includes(word),word)}
  assert.ok([403,404].includes((await report(f,f.ids.technical)).status));assert.equal((await report(f,f.ids.charlie)).status,403);
  assert.deepEqual((await report(f,f.ids.trainer,f.members.bob)).body,{shared:false});
  assert.equal((await f.db.transaction({uid:f.ids.trainer,centerId:f.center},client=>client.query("UPDATE centers.progress_shares SET enabled=false WHERE center_id=$1",[f.center]))).rowCount,0);
  await assert.rejects(f.db.transaction({uid:f.ids.alice,centerId:f.center},client=>client.query('INSERT INTO centers.progress_shares(center_id,member_id,recipient_uid,enabled) VALUES($1,$2,$3,false)',[f.center,f.members.bob,f.ids.alice])),{code:'42501'});
  const revoke=grant(f,1,{enabled:false},'revoke'),responses=await Promise.all([f.req('/api/centers/own/training/progress/share',f.ids.alice,revoke),f.req('/api/centers/own/training/progress/share',f.ids.alice,revoke)]);assert.ok(responses.some(r=>r.status===200)&&responses.every(r=>r.status===200||r.status===409&&r.body.code==='account-busy'),JSON.stringify(responses));assert.equal((await f.req('/api/centers/own/training/progress/share',f.ids.alice,revoke)).body.share.version,2);assert.equal(responses[0].body.share.version,2);assert.deepEqual((await report(f)).body,{shared:false});
  assert.equal((await f.req('/api/centers/own/training/progress/share',f.ids.alice,command)).body.share.enabled,false,'replaying a completed grant does not restore consent after revocation');
  assert.equal((await f.req('/api/centers/own/training/progress/share',f.ids.alice,grant(f,1,{enabled:false},'stale'))).body.code,'version-conflict');
});
test('sharing does not cross centers or transfer to a relinked account, and current membership/role are rechecked',async t=>{
  const f=await fixture(t);save(f,profile(f));assert.equal((await f.req('/api/centers/own/training/progress/share',f.ids.alice,grant(f))).status,200);
  const member=(await f.req('/api/centers/members/create',f.ids.root,{centerId:f.other,name:'Other affiliation',requestId:f.p+'_other_member'})).body.member;
  const invitation=(await f.req('/api/centers/invitations/create',f.ids.root,{centerId:f.other,kind:'member',memberId:member.id,accountUid:f.ids.alice,requestId:f.p+'_other_invite'})).body;
  assert.equal((await f.req('/api/centers/invitations/accept',f.ids.alice,{token:invitation.token})).status,200);
  assert.deepEqual((await report(f,f.ids.root,member.id,f.other)).body,{shared:false});
  let current=(await f.detail('alice')).body.member;assert.equal((await f.req('/api/centers/members/transition',f.ids.manager,{centerId:f.center,id:current.id,version:current.version,action:'freeze',effectiveOn:f.today,reason:'Fictional privacy freeze',requestId:f.p+'_freeze'})).status,200);assert.deepEqual((await report(f)).body,{shared:false});
  assert.equal((await f.req('/api/centers/own/training/progress/share',f.ids.alice,grant(f,1,{enabled:false},'frozen_revoke'))).status,200);
  current=(await f.detail('alice')).body.member;assert.equal((await f.req('/api/centers/members/transition',f.ids.manager,{centerId:f.center,id:current.id,version:current.version,action:'resume',effectiveOn:f.today,requestId:f.p+'_resume'})).status,200);
  assert.equal((await f.req('/api/centers/own/training/progress/share',f.ids.alice,grant(f,2,undefined,'again'))).status,200);
  await f.db.platformTransaction(f.ids.root,client=>client.query('UPDATE centers.members SET account_uid=$2,version=version+1 WHERE id=$1',[f.members.alice,f.ids.technical]),f.center);assert.deepEqual((await report(f)).body,{shared:false});assert.equal((await f.req(own(f),f.ids.technical)).body.share.enabled,false);
  await f.db.platformTransaction(f.ids.root,client=>client.query("UPDATE centers.role_assignments SET revoked_at=clock_timestamp(),version=version+1 WHERE center_id=$1 AND account_uid=$2",[f.center,f.ids.trainer]),f.center);assert.ok([403,404].includes((await report(f)).status));
});
test('a failed share audit rolls back consent and command identity, unreadable JSON fails closed',async t=>{
  const f=await fixture(t),state=profile(f),command=grant(f);save(f,state);
  const database={transaction:(context,work)=>f.db.transaction(context,client=>work({query:(sql,args)=>{if(sql.startsWith('INSERT INTO centers.business_audit'))throw new Error('fictional share audit failure');return client.query(sql,args)}}))};
  await assert.rejects(changeProgressShare({database,user:{id:f.ids.alice},checkSession(){},accountLocks:{withAccounts:(_,run)=>run()},readOwnTraining:()=>state,lookupAccount:()=>({name:'Owner'})},command),/fictional share audit failure/);
  assert.equal((await f.req(own(f),f.ids.alice)).body.share.version,0);assert.equal((await f.req('/api/centers/own/training/progress/share',f.ids.alice,command)).status,200);
  save(f,'invalid profile');assert.equal((await report(f)).status,503);
  assert.equal((await f.req('/api/centers/own/training/progress/share',f.ids.alice,grant(f,1,{enabled:false},'unreadable_revoke'))).status,200,'revocation does not require reading the personal profile');
});

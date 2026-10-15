import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
import {commandHash} from '../../centers/services/commands.js';
const shift=(day,n)=>{const value=new Date(day+'T00:00:00Z');value.setUTCDate(value.getUTCDate()+n);return value.toISOString().slice(0,10)};
async function fixture(t,{instructors=0}={}){
  const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await db.close();await migrator.end()});
  const p='cls_'+randomBytes(5).toString('hex'),ids=Object.fromEntries(['root','manager','alice','bob','charlie','trainer','technical'].map(key=>[key,p+'_'+key]));
  const extra=Array.from({length:instructors},(_,index)=>({id:p+'_instructor_'+index,name:'Teacher '+index}));
  const h=await startHttp(t,{app,superadminUids:[ids.root],users:[...Object.entries(ids).map(([key,id])=>({id,name:id,...(key==='technical'?{admin:true}:{})})),...extra]});
  const req=async(path,uid,body)=>{const response=await fetch(h.base+path,{headers:h.headers(uid),...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}};
  const center=(await req('/api/platform/centers/create',ids.root,{name:p,managerUid:ids.manager,requestId:p+'_center'})).body.center.id;
  const other=(await req('/api/platform/centers/create',ids.root,{name:p+' other',managerUid:ids.root,requestId:p+'_other'})).body.center.id;
  assert.equal((await req('/api/centers/staff/assign',ids.manager,{centerId:center,version:1,accountUid:ids.trainer})).status,200);
  if(extra.length)await db.platformTransaction(ids.root,async client=>{for(const [i,account] of extra.entries())await client.query("INSERT INTO centers.role_assignments(id,center_id,account_uid,role) VALUES($1,$2,$3,'trainer')",[p+'_role_'+i,center,account.id])},center);
  const plan=(await req('/api/centers/plans/create',ids.manager,{centerId:center,name:'Classes fee',priceMinor:'1000',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:p+'_plan'})).body.plan;
  const members={};let today;
  const detail=key=>req('/api/centers/member?'+new URLSearchParams({centerId:center,id:members[key]}),ids.manager);
  for(const key of ['alice','bob','charlie']){
    const member=(await req('/api/centers/members/create',ids.manager,{centerId:center,name:'Fictional '+key,email:key+'@'+p+'.example',requestId:p+'_member_'+key})).body.member;members[key]=member.id;
    const invite=(await req('/api/centers/invitations/create',ids.manager,{centerId:center,kind:'member',memberId:member.id,accountUid:ids[key],requestId:p+'_invite_'+key})).body;
    assert.equal((await req('/api/centers/invitations/accept',ids[key],{token:invite.token})).status,200);
    const info=(await detail(key)).body;today=info.today;
    assert.equal((await req('/api/centers/subscriptions/create',ids.manager,{centerId:center,memberId:member.id,memberVersion:info.member.version,priceVersionId:plan.priceVersionId,effectiveOn:today,requestId:p+'_sub_'+key})).status,200);
  }
  const create=(suffix='one',extra={})=>req('/api/centers/classes/create',ids.manager,{centerId:center,fields:{name:'Fictional class '+suffix,date:shift(today,1),startTime:'10:00',endTime:'11:00',capacity:1,waitlistCapacity:2,cancelBeforeMinutes:0,eligiblePlanIds:[plan.id],...extra},requestId:p+'_class_'+suffix});
  const reserve=(event,key,suffix='one')=>req('/api/centers/own/classes/reserve',ids[key],{centerId:center,id:event.id,requestId:p+'_reserve_'+key+'_'+suffix});
  const cancel=(row,key,suffix='one')=>req('/api/centers/own/classes/cancel',ids[key],{centerId:center,id:row.id,version:row.version,requestId:p+'_cancel_'+key+'_'+suffix});
  const roster=event=>req('/api/centers/classes/roster?'+new URLSearchParams({centerId:center,id:event.id}),ids.manager);
  const own=(key,params={})=>req('/api/centers/own/classes?'+new URLSearchParams({centerId:center,...params}),ids[key]);
  return {db,app,p,h,req,ids,center,other,plan,members,today,detail,create,reserve,cancel,roster,own};
}
test('room scheduling serializes concurrent overlaps, preserves adjacent slots and releases canceled classes',async t=>{
  const f=await fixture(t);
  const responses=await Promise.all([f.create('room_a',{room:'Sala  A'}),f.create('room_b',{room:' sala a '})]);
  assert.equal(responses.filter(r=>r.status===200).length,1,JSON.stringify(responses));assert.equal(responses.find(r=>r.status!==200).body.code,'class-room-conflict');
  const winner=responses.find(r=>r.status===200).body.event;assert.ok(winner.room);
  const adjacent=await f.create('adjacent',{room:'SALA A',startTime:'11:00',endTime:'12:00'});assert.equal(adjacent.status,200,JSON.stringify(adjacent));
  assert.equal((await f.create('different_room',{room:'Sala B'})).status,200);
  const own=(await f.own('alice')).body.classes.find(r=>r.id===winner.id);assert.equal(own.room,winner.room);
  const canceled=await f.req('/api/centers/classes/cancel',f.ids.manager,{centerId:f.center,id:winner.id,version:winner.version,reason:'Fictional room freed',requestId:f.p+'_room_cancel'});assert.equal(canceled.status,200);
  assert.equal((await f.create('released',{room:'Sala A'})).status,200);
  const overlap=await f.create('partial',{room:'Sala A',startTime:'10:30',endTime:'11:30'});assert.equal(overlap.body.code,'class-room-conflict');
  const otherPlan=(await f.req('/api/centers/plans/create',f.ids.root,{centerId:f.other,name:'Other classes',priceMinor:'1000',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:f.p+'_other_plan'})).body.plan;
  const other=await f.req('/api/centers/classes/create',f.ids.root,{centerId:f.other,fields:{name:'Other center',room:'Sala A',date:winner.date,startTime:'10:00',endTime:'11:00',capacity:1,waitlistCapacity:0,cancelBeforeMinutes:0,eligiblePlanIds:[otherPlan.id]},requestId:f.p+'_other_room'});assert.equal(other.status,200,JSON.stringify(other));
  await assert.rejects(f.db.transaction({uid:f.ids.manager,centerId:f.center},client=>client.query('UPDATE centers.classes SET room=$2,version=version+1 WHERE id=$1',[adjacent.body.event.id,'Sala moved'])),{code:'42501'});
});

test('instructors come from current center staff, cover the class and cannot teach overlapping same-center classes',async t=>{
  const f=await fixture(t),path='/api/centers/classes/instructors?'+new URLSearchParams({centerId:f.center});
  const directory=await f.req(path,f.ids.manager);assert.equal(directory.status,200,JSON.stringify(directory));
  const teacher=directory.body.instructors.find(r=>r.role==='trainer');assert.ok(teacher);assert.equal(teacher.name,f.ids.trainer);
  assert.ok(!JSON.stringify(directory.body).includes('accountUid'));assert.equal((await f.req(path,f.ids.trainer)).status,403);assert.equal((await f.req(path,f.ids.alice)).status,403);
  assert.equal((await f.req(path+'&accountUid='+f.ids.root,f.ids.manager)).status,400);
  const foreign=(await f.req('/api/centers/classes/instructors?centerId='+f.other,f.ids.root)).body.instructors[0];
  assert.equal((await f.create('foreign_teacher',{instructorAssignmentId:foreign.id})).body.code,'class-instructor-unavailable');
  const responses=await Promise.all([f.create('teacher_a',{instructorAssignmentId:teacher.id}),f.create('teacher_b',{instructorAssignmentId:teacher.id})]);
  assert.equal(responses.filter(r=>r.status===200).length,1,JSON.stringify(responses));assert.equal(responses.find(r=>r.status!==200).body.code,'class-instructor-conflict');
  const winner=responses.find(r=>r.status===200).body.event;assert.equal(winner.instructorName,teacher.name);assert.equal(winner.instructorUid,undefined);
  const adjacent=await f.create('teacher_adjacent',{instructorAssignmentId:teacher.id,startTime:'11:00',endTime:'12:00'});assert.equal(adjacent.status,200);
  const dual=f.p+'_dual_role';await f.db.platformTransaction(f.ids.root,client=>client.query("INSERT INTO centers.role_assignments(id,center_id,account_uid,role) VALUES($1,$2,$3,'manager')",[dual,f.center,f.ids.trainer]),f.center);
  const dualDirectory=await f.req(path,f.ids.manager);assert.ok(dualDirectory.body.instructors.find(row=>row.id===dual),JSON.stringify(dualDirectory));
  assert.equal((await f.create('same_account_two_roles',{instructorAssignmentId:dual})).body.code,'class-instructor-conflict');
  assert.equal((await f.own('alice')).body.classes.find(r=>r.id===winner.id).instructorName,teacher.name);
  // A role that ends before class finish cannot authorize teaching that class.
  await f.db.platformTransaction(f.ids.root,client=>client.query('UPDATE centers.role_assignments SET valid_until=$2,version=version+1 WHERE id=$1',[teacher.id,winner.startsAt]),f.center);
  assert.equal((await f.create('teacher_ends',{instructorAssignmentId:teacher.id,startTime:'12:00',endTime:'13:00'})).body.code,'class-instructor-unavailable');
  const cancel=await f.req('/api/centers/classes/cancel',f.ids.manager,{centerId:f.center,id:winner.id,version:winner.version,reason:'Fictional teaching cancellation',requestId:f.p+'_teacher_cancel'});assert.equal(cancel.status,200);
  // Historical label stays intact after current staff authority changes.
  assert.equal((await f.roster(winner)).body.event.instructorName,teacher.name);
  const disabled=await f.req('/api/admin/user/disable',f.ids.technical,{id:f.ids.trainer,disabled:true});assert.equal(disabled.status,200,JSON.stringify(disabled));
  assert.ok(!(await f.req(path,f.ids.manager)).body.instructors.some(row=>row.id===teacher.id||row.id===dual));
  assert.equal((await f.create('disabled_teacher',{instructorAssignmentId:dual,startTime:'12:00',endTime:'13:00'})).body.code,'class-instructor-unavailable');
  const original=winner.name.endsWith('teacher_a')?'teacher_a':'teacher_b';const replay=await f.create(original,{instructorAssignmentId:teacher.id});assert.equal(replay.status,200);assert.equal(replay.body.event.id,winner.id);assert.equal(replay.body.event.instructorName,teacher.name);
});

test('instructor directory paginates actual staff without crossing actor or center scopes',async t=>{
  const f=await fixture(t,{instructors:51}),url='/api/centers/classes/instructors?';
  const first=await f.req(url+new URLSearchParams({centerId:f.center}),f.ids.manager);assert.equal(first.status,200);assert.equal(first.body.instructors.length,50);assert.ok(first.body.nextCursor);
  const last=await f.req(url+new URLSearchParams({centerId:f.center,cursor:first.body.nextCursor}),f.ids.manager);assert.equal(last.body.instructors.length,3);assert.equal(last.body.nextCursor,null);
  assert.equal(new Set([...first.body.instructors,...last.body.instructors].map(row=>row.id)).size,53);
  assert.equal((await f.req(url+new URLSearchParams({centerId:f.other,cursor:first.body.nextCursor}),f.ids.root)).status,400);
  assert.equal((await f.req(url+new URLSearchParams({centerId:f.center,cursor:first.body.nextCursor}),f.ids.root)).status,400);
});

test('one concurrent seat never oversells, FIFO promotion is atomic, and replay never resurrects a canceled reservation',async t=>{
  const f=await fixture(t),created=await f.create();assert.equal(created.status,200,JSON.stringify(created));const event=created.body.event;
  const keys=['alice','bob','charlie'],responses=await Promise.all(keys.map(key=>f.reserve(event,key)));
  assert.ok(responses.every(row=>row.status===200),JSON.stringify(responses));const rows=responses.map((row,index)=>({...row.body.reservation,key:keys[index]}));
  assert.equal(rows.filter(row=>row.state==='booked').length,1);assert.equal(rows.filter(row=>row.state==='waiting').length,2);
  const booked=rows.find(row=>row.state==='booked'),waiting=rows.filter(row=>row.state==='waiting').sort((a,b)=>Number(BigInt(a.queueOrder)-BigInt(b.queueOrder)));
  const personal=(await f.req('/api/data',f.ids.alice)).body;
  const canceled=await f.cancel(booked,booked.key);assert.equal(canceled.status,200,JSON.stringify(canceled));
  const roster=(await f.roster(event)).body;assert.equal(roster.event.booked,1);assert.equal(roster.event.waiting,1);
  assert.equal(roster.reservations.find(row=>row.id===waiting[0].id).state,'booked');assert.equal(roster.reservations.find(row=>row.id===waiting[1].id).state,'waiting');
  assert.equal((await f.reserve(event,booked.key)).body.reservation.state,'canceled');
  assert.deepEqual((await f.cancel(booked,booked.key)).body,canceled.body);
  const cancelEvent=await f.req('/api/centers/classes/cancel',f.ids.manager,{centerId:f.center,id:event.id,version:1,reason:'Fictional cancellation',requestId:f.p+'_cancel_event'});assert.equal(cancelEvent.status,200,JSON.stringify(cancelEvent));assert.equal(cancelEvent.body.event.booked,0);assert.equal(cancelEvent.body.event.waiting,0);
  assert.ok((await f.roster(event)).body.reservations.every(row=>row.state==='canceled'));
  assert.deepEqual((await f.req('/api/data',f.ids.alice)).body,personal);assert.ok(!JSON.stringify((await f.own('alice')).body).includes('bob@'));
});
test('waitlist promotion skips a membership ended for the class date and preserves finance',async t=>{
  const f=await fixture(t),event=(await f.create()).body.event;
  const alice=(await f.reserve(event,'alice')).body.reservation,bob=(await f.reserve(event,'bob')).body.reservation,charlie=(await f.reserve(event,'charlie')).body.reservation;
  const before=(await f.req('/api/centers/own/membership?centerId='+f.center,f.ids.alice)).body.summary;
  const member=(await f.detail('bob')).body.member;
  assert.equal((await f.req('/api/centers/members/transition',f.ids.manager,{centerId:f.center,id:member.id,version:member.version,action:'end',effectiveOn:event.date,reason:'Fictional end',requestId:f.p+'_end'})).status,200);
  assert.equal((await f.cancel(alice,'alice')).status,200);
  const roster=(await f.roster(event)).body;assert.equal(roster.reservations.find(row=>row.id===bob.id).state,'ineligible');assert.equal(roster.reservations.find(row=>row.id===charlie.id).state,'booked');assert.equal(roster.event.waiting,0);
  assert.equal((await f.reserve(event,'bob','new')).body.code,'class-ineligible');
  assert.deepEqual((await f.req('/api/centers/own/membership?centerId='+f.center,f.ids.alice)).body.summary,before);
});
test('capacity, selected center, current own identity, management roles and CSRF are enforced',async t=>{
  const f=await fixture(t),event=(await f.create('limited',{waitlistCapacity:0})).body.event;
  const results=await Promise.all([f.reserve(event,'alice'),f.reserve(event,'bob')]);assert.equal(results.filter(row=>row.status===200).length,1);assert.equal(results.find(row=>row.status!==200).body.code,'class-full');
  const row=results.find(r=>r.status===200).body.reservation;
  await assert.rejects(f.db.transaction({uid:f.ids.alice,centerId:f.center},client=>client.query('UPDATE centers.classes SET booked_count=999 WHERE id=$1',[event.id])),{code:'42501'});
  const hidden=await f.db.transaction({uid:f.ids.charlie,centerId:f.center},client=>client.query('SELECT id FROM centers.class_reservations WHERE class_id=$1',[event.id]));assert.equal(hidden.rows.length,0);
  assert.equal((await f.own('alice',{memberId:f.members.bob})).status,400);
  assert.equal((await f.req('/api/centers/own/classes?centerId='+f.other,f.ids.alice)).status,404);
  for(const uid of [f.ids.alice,f.ids.trainer,f.ids.technical])assert.ok([403,404].includes((await f.req('/api/centers/classes/roster?'+new URLSearchParams({centerId:f.center,id:event.id}),uid)).status));
  assert.equal((await f.req('/api/centers/classes/attendance',f.ids.manager,{centerId:f.center,id:row.id,version:row.version,state:'no-show',requestId:f.p+'_early'})).body.code,'class-not-ended');
  const token=f.h.headers(f.ids.alice).Authorization.slice(7);
  const response=await fetch(f.h.base+'/api/centers/own/classes/reserve',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'gymsid='+token+'; __Host-gymsid='+token,Origin:'https://foreign.example'},body:JSON.stringify({centerId:f.center,id:event.id,requestId:f.p+'_csrf'})});assert.equal(response.status,403);
});

test('class lists and historical rosters paginate with scoped cursors, keeping complete queues without contact fields',async t=>{
  const f=await fixture(t),events=[];
  for(let index=0;index<32;index++){const response=await f.create('page_'+index);assert.equal(response.status,200);events.push(response.body.event)}
  const first=await f.own('alice');assert.equal(first.status,200);assert.equal(first.body.classes.length,30);assert.ok(first.body.nextCursor);
  const next=await f.own('alice',{from:first.body.from,to:first.body.to,cursor:first.body.nextCursor});assert.equal(next.status,200,JSON.stringify(next));assert.equal(next.body.classes.length,2);
  assert.equal(new Set([...first.body.classes,...next.body.classes].map(event=>event.id)).size,32);
  assert.equal((await f.own('bob',{from:first.body.from,to:first.body.to,cursor:first.body.nextCursor})).status,400);
  for(let index=0;index<51;index++){const reserved=await f.reserve(events[0],'alice','history_'+index);assert.equal(reserved.status,200);assert.equal((await f.cancel(reserved.body.reservation,'alice','history_'+index)).status,200)}
  const roster=(await f.roster(events[0])).body;assert.equal(roster.reservations.length,50);assert.ok(roster.nextCursor);
  const last=await f.req('/api/centers/classes/roster?'+new URLSearchParams({centerId:f.center,id:events[0].id,cursor:roster.nextCursor}),f.ids.manager);assert.equal(last.status,200);assert.equal(last.body.reservations.length,1);
  assert.ok(!JSON.stringify(roster).includes('@'));assert.ok(!JSON.stringify(roster).includes('nationalDocument'));
  const foreign=await f.req('/api/centers/classes/roster?'+new URLSearchParams({centerId:f.center,id:events[1].id,cursor:roster.nextCursor}),f.ids.manager);assert.equal(foreign.status,400);
});
test('attendance and no-show are explicit immutable facts after the class, without a fine or QR inference',async t=>{
  const f=await fixture(t),url=new URL(f.app);assert.equal(url.hostname,'centers-ci-db');assert.equal(url.pathname,'/ft_gym_ci_centers_test');url.username='centers_bootstrap';url.password='fictional-bootstrap-test-only';
  const seed=new pg.Client({connectionString:url.href});await seed.connect();t.after(()=>seed.end());assert.equal((await seed.query('SELECT kind FROM centers.environment WHERE singleton')).rows[0].kind,'test');
  const classId='cl_'+commandHash(f.p+'_past').slice(0,32),rows=[];
  // New, explicitly past fictional rows only. Existing historical dates are never rewritten.
  // Replica mode is transaction-local solely to seed past reservations, which normal booking rejects.
  await seed.query('BEGIN');try{
    await seed.query("SET LOCAL session_replication_role='replica'");
    await seed.query(`INSERT INTO centers.classes(id,center_id,name,class_on,starts_at,ends_at,timezone,capacity,waitlist_capacity,cancel_before_minutes,booked_count,actor_uid)
      VALUES($1,$2,'Past fictional class',$3,statement_timestamp()-interval '2 hours',statement_timestamp()-interval '1 hour','Europe/Madrid',2,0,0,2,$4)`,[classId,f.center,f.today,f.ids.manager]);
    for(const [index,key] of ['alice','bob'].entries()){
      const id='rb_'+commandHash(f.p+'_'+key).slice(0,32);rows.push(id);
      await seed.query("INSERT INTO centers.class_reservations(id,center_id,class_id,member_id,actor_uid,queue_order,state) VALUES($1,$2,$3,$4,$5,$6,'booked')",[id,f.center,classId,f.members[key],f.ids[key],index+1]);
    }
    await seed.query('COMMIT');
  }catch(error){await seed.query('ROLLBACK');throw error}
  for(const [index,state] of ['attended','no-show'].entries()){
    const body={centerId:f.center,id:rows[index],version:1,state,requestId:f.p+'_'+state},response=await f.req('/api/centers/classes/attendance',f.ids.manager,body);
    assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.reservation.state,state);assert.deepEqual((await f.req('/api/centers/classes/attendance',f.ids.manager,body)).body,response.body);
  }
  assert.equal((await f.req('/api/centers/classes/attendance',f.ids.manager,{centerId:f.center,id:rows[1],version:2,state:'attended',requestId:f.p+'_overwrite'})).body.code,'class-reservation-ended');
  const money=await f.db.transaction({uid:f.ids.manager,centerId:f.center},client=>client.query('SELECT count(*)::integer AS n FROM centers.receipts WHERE center_id=$1',[f.center]));assert.equal(money.rows[0].n,0);
});

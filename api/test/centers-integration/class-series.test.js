import pg from 'pg';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,shift} from './class-fixture.mjs';
import {cancelClassSeries,createClassSeries} from '../../centers/services/class-series.js';
import {commandHash} from '../../centers/services/commands.js';

const source=f=>{const date=shift(f.today,1);return {centerId:f.center,timezone:'Europe/Madrid',fields:{name:'Fictional weekly class',date,startTime:'10:00',endTime:'11:00',capacity:1,waitlistCapacity:1,cancelBeforeMinutes:0,eligiblePlanIds:[f.plan.id]},rule:{until:shift(date,14),weekdays:[new Date(date+'T00:00:00Z').getUTCDay()],excludedDates:[]}}};
const preview=(f,input,actor=f.ids.manager)=>f.req('/api/centers/classes/series/preview',actor,input);
const create=(f,input,reviewHash,suffix='one',actor=f.ids.manager)=>f.req('/api/centers/classes/series/create',actor,{...input,reviewHash,requestId:f.p+'_series_'+suffix});
const counts=f=>f.db.transaction({uid:f.ids.manager,centerId:f.center},async client=>({series:(await client.query('SELECT count(*)::int AS n FROM centers.class_series WHERE center_id=$1',[f.center])).rows[0].n,classes:(await client.query('SELECT count(*)::int AS n FROM centers.classes WHERE center_id=$1',[f.center])).rows[0].n}));

test('weekly review creates nothing; concurrent commit creates one complete durable series and recovers inactive history',async t=>{
  const f=await fixture(t),input=source(f),review=await preview(f,input);assert.equal(review.status,200,JSON.stringify(review));assert.deepEqual(review.body.summary,{total:3,ready:3,excluded:0,errors:0});assert.deepEqual(await counts(f),{series:0,classes:0});
  const responses=await Promise.all([create(f,input,review.body.reviewHash),create(f,input,review.body.reviewHash)]);assert.ok(responses.every(r=>r.status===200),JSON.stringify(responses));assert.deepEqual(responses[0].body,responses[1].body);
  const result=responses[0].body;assert.equal(result.series.total,3);assert.deepEqual(result.classes.map(row=>row.seriesPosition),[1,2,3]);assert.ok(result.classes.every(row=>row.seriesId===result.series.id));assert.deepEqual(await counts(f),{series:1,classes:3});
  assert.equal((await f.own('alice')).body.classes.filter(row=>row.seriesId===result.series.id).length,3);
  assert.equal((await preview(f,input,f.ids.trainer)).status,403);assert.equal((await preview(f,input,f.ids.alice)).status,403);
  assert.equal((await f.req('/api/centers/classes/series/detail?'+new URLSearchParams({centerId:f.center,id:result.series.id}),f.ids.alice)).status,403);
  assert.equal((await f.req('/api/centers/classes/series/detail?'+new URLSearchParams({centerId:f.other,id:result.series.id}),f.ids.root)).status,404);
  await f.db.platformTransaction(f.ids.root,client=>client.query("UPDATE centers.centers SET state='inactive',version=version+1 WHERE id=$1",[f.center]),f.center);
  assert.equal((await create(f,input,review.body.reviewHash)).body.series.id,result.series.id);assert.equal((await create(f,input,review.body.reviewHash,'new')).body.code,'center-inactive');
  await assert.rejects(f.db.transaction({uid:f.ids.manager,centerId:f.center},client=>client.query("UPDATE centers.class_series SET name='changed' WHERE id=$1",[result.series.id])),{code:'42501'});
});

test('live conflicts force a fresh series review; excluding a date is explicit and the remaining classes stay atomic',async t=>{
  const f=await fixture(t),input=source(f);input.fields.room='Sala A';const old=(await preview(f,input)).body;
  assert.equal((await f.create('room_occupied',{date:input.fields.date,room:'sala a'})).status,200);
  assert.equal((await create(f,input,old.reviewHash)).body.code,'class-series-review-changed');assert.deepEqual(await counts(f),{series:0,classes:1});
  const fresh=(await preview(f,input)).body;assert.equal(fresh.rows[0].code,'class-room-conflict');assert.equal((await create(f,input,fresh.reviewHash,'invalid')).body.code,'class-series-invalid');
  input.rule.excludedDates=[input.fields.date];const checked=(await preview(f,input)).body;assert.deepEqual(checked.summary,{total:3,ready:2,excluded:1,errors:0});const created=await create(f,input,checked.reviewHash,'excluded');assert.equal(created.status,200,JSON.stringify(created));assert.equal(created.body.series.total,2);assert.ok(created.body.classes.every(row=>row.date!==input.fields.date));
  assert.equal((await preview(f,{...input,timezone:'UTC'})).body.code,'class-timezone-changed');
});

test('a late insertion failure rolls back all series rows, plans, audit and command identity',async t=>{
  const f=await fixture(t),input=source(f),review=(await preview(f,input)).body;let inserts=0;
  const database={transaction:(context,work)=>f.db.transaction(context,client=>work({query:(sql,args)=>{if(sql.startsWith('INSERT INTO centers.class_plans')&&++inserts===2)throw new Error('fictional second insert failure');return client.query(sql,args)}}))};
  const command={...input,reviewHash:review.reviewHash,requestId:f.p+'_series_atomic'};
  await assert.rejects(createClassSeries({database,user:{id:f.ids.manager},checkSession(){},lookupAccount:()=>null},command),/fictional second insert failure/);assert.deepEqual(await counts(f),{series:0,classes:0});
  const completed=await f.req('/api/centers/classes/series/create',f.ids.manager,command);assert.equal(completed.status,200,JSON.stringify(completed));assert.deepEqual(await counts(f),{series:1,classes:3});
  const fake='cs_'+commandHash(f.p+'_incomplete').slice(0,32);
  await assert.rejects(f.db.transaction({uid:f.ids.manager,centerId:f.center},client=>client.query("INSERT INTO centers.class_series(id,center_id,name,timezone,total,definition,actor_uid) VALUES($1,$2,'Incomplete','Europe/Madrid',2,'{}',$3)",[fake,f.center,f.ids.manager])),{code:'23514'});
});

test('series bounds, role scopes, DST ambiguity and exclusions are reviewed without silent time shifts',async t=>{
  const f=await fixture(t),input=source(f);input.rule.until=shift(input.fields.date,93);input.rule.weekdays=[0,1,2,3,4,5,6];
  const large=(await preview(f,input)).body;assert.equal(large.limitExceeded,true);assert.equal(large.summary.total,94);assert.equal((await create(f,input,large.reviewHash)).body.code,'class-series-invalid');
  input.rule.excludedDates=large.rows.slice(25).map(row=>row.date);const bounded=(await preview(f,input)).body;assert.equal(bounded.summary.ready,25);assert.equal((await create(f,input,bounded.reviewHash,'max')).status,200);
  const foldYear=Number(f.today.slice(0,4));let fold;for(let year=foldYear;year<=foldYear+1;year++){const d=new Date(Date.UTC(year,9,31));d.setUTCDate(d.getUTCDate()-d.getUTCDay());if(d.toISOString().slice(0,10)>f.today){fold=d.toISOString().slice(0,10);break}}
  const dst=source(f);dst.fields.date=fold;dst.fields.startTime='02:15';dst.fields.endTime='02:45';dst.rule={until:shift(fold,7),weekdays:[0],excludedDates:[]};
  const ambiguous=(await preview(f,dst)).body;assert.equal(ambiguous.rows[0].code,'class-time-ambiguous');assert.equal(ambiguous.summary.errors,1);
  dst.rule.excludedDates=[fold];const excluded=(await preview(f,dst)).body;assert.equal(excluded.summary.errors,0);assert.equal(excluded.summary.ready,1);
  assert.equal((await create(f,dst,excluded.reviewHash,'other_actor',f.ids.root)).body.code,'class-series-review-changed');
});

test('series list paginates more than thirty groups with actor-bound cursors and protects definitions in SQL',async t=>{
  const f=await fixture(t),input=source(f);input.rule.until=input.fields.date;const checked=(await preview(f,input)).body;
  for(let n=0;n<31;n++)assert.equal((await create(f,input,checked.reviewHash,'page_'+n)).status,200);
  const url='/api/centers/classes/series?centerId='+f.center,first=(await f.req(url,f.ids.manager)).body;assert.equal(first.series.length,30);assert.ok(first.nextCursor);
  const second=(await f.req(url+'&cursor='+encodeURIComponent(first.nextCursor),f.ids.manager)).body;assert.equal(second.series.length,1);assert.equal(second.nextCursor,null);assert.equal(new Set([...first.series,...second.series].map(row=>row.id)).size,31);
  assert.equal((await f.req(url+'&cursor='+encodeURIComponent(first.nextCursor),f.ids.root)).status,400);
  await f.db.transaction({uid:f.ids.alice,centerId:f.center},async client=>assert.equal((await client.query('SELECT * FROM centers.class_series WHERE center_id=$1',[f.center])).rows.length,0));
});

const cancellation=(f,id)=>f.req('/api/centers/classes/series/cancel/preview',f.ids.manager,{centerId:f.center,id});
test('reviewed series cancellation detects booking changes, cancels all future commitments once and preserves past classes',async t=>{
  const f=await fixture(t),id='cs_'+commandHash(f.p+'_historical').slice(0,32),dates=[shift(f.today,-7),shift(f.today,7),shift(f.today,14)],created={series:{id},classes:dates.map((date,n)=>({id:'cl_'+commandHash([f.p,'historical',n]).slice(0,32),date}))};
  const seed=await fictionalSeed(t,f);
  // Insert a new fictional historical group; never rewrite an existing class date.
  await seed.query('BEGIN');try{await seed.query("SET LOCAL session_replication_role='replica'");
    const input=source(f);input.fields.date=dates[0];input.rule.until=dates[2];input.rule.excludedDates=[f.today];
    await seed.query("INSERT INTO centers.class_series(id,center_id,name,timezone,total,definition,actor_uid) VALUES($1,$2,'Historical fictional series','Europe/Madrid',3,$3,$4)",[id,f.center,{definitionVersion:1,fields:input.fields,rule:input.rule},f.ids.manager]);
    for(const [n,event] of created.classes.entries()){
      await seed.query("INSERT INTO centers.classes(id,center_id,name,class_on,starts_at,ends_at,timezone,capacity,waitlist_capacity,cancel_before_minutes,actor_uid,series_id,series_position) VALUES($1,$2,'Historical fictional occurrence',$3,($3::date+time '10:00') AT TIME ZONE 'Europe/Madrid',($3::date+time '11:00') AT TIME ZONE 'Europe/Madrid','Europe/Madrid',1,1,0,$4,$5,$6)",[event.id,f.center,event.date,f.ids.manager,id,n+1]);
      await seed.query('INSERT INTO centers.class_plans(center_id,class_id,plan_id) VALUES($1,$2,$3)',[f.center,event.id,f.plan.id]);
    }await seed.query('COMMIT');
  }catch(e){await seed.query('ROLLBACK');throw e}
  const initial=(await cancellation(f,id)).body;assert.equal(initial.summary.classes,2);assert.equal(initial.summary.skipped,1);
  const seat=await f.reserve(created.classes[1],'alice','series_cancel'),waiting=await f.reserve(created.classes[1],'bob','series_cancel');assert.equal(seat.status,200);assert.equal(waiting.body.reservation.state,'waiting');
  const command={centerId:f.center,id,reason:'Fictional closure',reviewHash:initial.reviewHash,requestId:f.p+'_cancel_series'};
  assert.equal((await f.req('/api/centers/classes/series/cancel',f.ids.manager,command)).body.code,'class-series-review-changed');
  const updated=(await cancellation(f,id)).body;assert.deepEqual(updated.summary,{classes:2,booked:1,waiting:1,skipped:1});assert.ok(!JSON.stringify(updated).includes(f.members.alice));
  await f.cancel(seat.body.reservation,'alice','changed_occupant');await f.reserve(created.classes[1],'charlie','replacement_waiter');
  const sameCounts=(await cancellation(f,id)).body;assert.deepEqual(sameCounts.summary,updated.summary);assert.notEqual(sameCounts.reviewHash,updated.reviewHash,'swapping reservation identities invalidates review even when all counts match');
  assert.equal((await f.req('/api/centers/classes/series/cancel',f.ids.manager,{...command,reviewHash:updated.reviewHash})).body.code,'class-series-review-changed');
  assert.equal((await f.req('/api/centers/classes/series/cancel',f.ids.root,{...command,reviewHash:sameCounts.reviewHash})).body.code,'class-series-review-changed','reviews are scoped to the actor');
  command.reviewHash=sameCounts.reviewHash;
  assert.equal((await f.req('/api/centers/classes/series/cancel',f.ids.trainer,command)).status,403);assert.equal((await f.req('/api/centers/classes/series/cancel/preview',f.ids.alice,{centerId:f.center,id})).status,403);
  await f.db.platformTransaction(f.ids.root,client=>client.query("UPDATE centers.centers SET state='inactive',version=version+1 WHERE id=$1",[f.center]),f.center);
  const results=await Promise.all([f.req('/api/centers/classes/series/cancel',f.ids.manager,command),f.req('/api/centers/classes/series/cancel',f.ids.manager,command)]);assert.ok(results.every(row=>row.status===200),JSON.stringify(results));assert.deepEqual(results[0].body,results[1].body);
  assert.deepEqual(results[0].body.classes.map(row=>row.state),['scheduled','canceled','canceled']);const roster=(await f.roster(created.classes[1])).body;assert.ok(roster.reservations.every(row=>row.state==='canceled'));assert.equal(roster.event.booked,0);assert.equal(roster.event.waiting,0);
  const empty=(await cancellation(f,id)).body;assert.equal(empty.summary.classes,0);assert.equal((await f.req('/api/centers/classes/series/cancel',f.ids.manager,{...command,requestId:f.p+'_nothing',reviewHash:empty.reviewHash})).body.code,'class-series-invalid');
});
test('series cancellation rolls back earlier events and reservations when a later audit fails',async t=>{
  const f=await fixture(t),input=source(f),created=(await create(f,input,(await preview(f,input)).body.reviewHash)).body,id=created.series.id;
  await f.reserve(created.classes[0],'alice','rollback_series');const review=(await cancellation(f,id)).body,command={centerId:f.center,id,reason:'Fictional audit rollback',reviewHash:review.reviewHash,requestId:f.p+'_cancel_rollback'};let audits=0;
  const database={transaction:(context,work)=>f.db.transaction(context,client=>work({query:(sql,args)=>{if(sql.startsWith('INSERT INTO centers.business_audit')&&++audits===2)throw new Error('fictional second cancellation audit');return client.query(sql,args)}}))};
  await assert.rejects(cancelClassSeries({database,user:{id:f.ids.manager},checkSession(){},lookupAccount:()=>null},command),/fictional second cancellation audit/);
  const unchanged=(await cancellation(f,id)).body;assert.equal(unchanged.reviewHash,review.reviewHash);assert.equal(unchanged.classes[0].booked,1);assert.equal((await f.roster(created.classes[0])).body.reservations[0].state,'booked');
  assert.equal((await f.req('/api/centers/classes/series/cancel',f.ids.manager,command)).status,200);
});

async function fictionalSeed(t,f){
  const url=new URL(f.app);assert.equal(url.hostname,'centers-ci-db');assert.equal(url.pathname,'/ft_gym_ci_centers_test');url.username='centers_bootstrap';url.password='fictional-bootstrap-test-only';
  const seed=new pg.Client({connectionString:url.href});await seed.connect();t.after(()=>seed.end());assert.equal((await seed.query('SELECT kind FROM centers.environment WHERE singleton')).rows[0].kind,'test');
  return seed;
}

test('a queued series cancellation rechecks the future set after the center lock and does not partially cancel',async t=>{
  const f=await fixture(t),seed=await fictionalSeed(t,f),id='cs_'+commandHash(f.p+'_boundary').slice(0,32),events=[0,1].map(n=>'cl_'+commandHash([f.p,'boundary',n]).slice(0,32));
  await seed.query('BEGIN');try{await seed.query("SET LOCAL session_replication_role='replica'");
    await seed.query("INSERT INTO centers.class_series(id,center_id,name,timezone,total,definition,actor_uid) VALUES($1,$2,'Fictional time boundary','Europe/Madrid',2,'{}',$3)",[id,f.center,f.ids.manager]);
    for(const [n,event] of events.entries())await seed.query("INSERT INTO centers.classes(id,center_id,name,class_on,starts_at,ends_at,timezone,capacity,waitlist_capacity,cancel_before_minutes,actor_uid,series_id,series_position) VALUES($1,$2,'Fictional boundary',((clock_timestamp()+make_interval(secs=>$3)) AT TIME ZONE 'Europe/Madrid')::date,clock_timestamp()+make_interval(secs=>$3),clock_timestamp()+make_interval(secs=>$3+3600),'Europe/Madrid',1,0,0,$4,$5,$6)",[event,f.center,n?86400:3,f.ids.manager,id,n+1]);
    await seed.query('COMMIT');
  }catch(e){await seed.query('ROLLBACK');throw e}
  const review=(await cancellation(f,id)).body;assert.equal(review.summary.classes,2);
  let release,locked;const entered=new Promise(resolve=>locked=resolve),hold=new Promise(resolve=>release=resolve);
  const blocker=f.db.transaction({uid:f.ids.manager,centerId:f.center},async client=>{await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:'||$1))",[f.center]);locked();await hold});await entered;
  const waiting=f.req('/api/centers/classes/series/cancel',f.ids.manager,{centerId:f.center,id,reviewHash:review.reviewHash,reason:'Fictional queued cancellation',requestId:f.p+'_queued_cancel'});
  try{
    let queued=false;for(let attempt=0;attempt<100;attempt++){const {rows:[row]}=await seed.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='centers_app' AND wait_event='advisory') AS waiting");if(row.waiting){queued=true;break}await new Promise(resolve=>setTimeout(resolve,10))}assert.equal(queued,true,'request actually waits on the center lock');
    await seed.query('SELECT pg_sleep(3.2)');
  }finally{release();await blocker}
  const response=await waiting;assert.equal(response.status,409);assert.equal(response.body.code,'class-series-review-changed');
  const unchanged=(await cancellation(f,id)).body;assert.equal(unchanged.summary.classes,1);assert.ok(unchanged.classes.every(event=>event.state==='scheduled'),'the remaining future class is not partially canceled');
});

test('weekly instructors are checked on every date and completed creation survives a disabled identity without duplicate classes',async t=>{
  const f=await fixture(t),input=source(f),directory=(await f.req('/api/centers/classes/instructors?centerId='+f.center,f.ids.manager)).body,teacher=directory.instructors.find(row=>row.role==='trainer');input.fields.instructorAssignmentId=teacher.id;
  const initial=(await preview(f,input)).body;assert.equal(initial.summary.ready,3);
  await f.db.platformTransaction(f.ids.root,client=>client.query('UPDATE centers.role_assignments SET valid_until=$2,version=version+1 WHERE id=$1',[teacher.id,shift(input.fields.date,8)+'T12:00:00Z']),f.center);
  const partial=(await preview(f,input)).body;assert.equal(partial.summary.ready,2);assert.equal(partial.summary.errors,1);assert.equal(partial.rows[2].code,'class-instructor-unavailable');
  assert.equal((await create(f,input,initial.reviewHash)).body.code,'class-series-review-changed');assert.deepEqual(await counts(f),{series:0,classes:0});
  input.rule.excludedDates=[partial.rows[2].date];const bounded=(await preview(f,input)).body;assert.equal(bounded.summary.ready,2);const created=await create(f,input,bounded.reviewHash,'covered_teacher');assert.equal(created.status,200);assert.ok(created.body.classes.every(row=>row.instructorName===teacher.name));
  assert.equal((await f.req('/api/admin/user/disable',f.ids.technical,{id:f.ids.trainer,disabled:true})).status,200);
  const replay=await create(f,input,bounded.reviewHash,'covered_teacher');assert.equal(replay.status,200);assert.equal(replay.body.series.id,created.body.series.id);assert.ok(replay.body.classes.every(row=>row.instructorNeedsReview));assert.deepEqual(await counts(f),{series:1,classes:2});
  const unavailable=(await preview(f,input)).body;assert.equal(unavailable.summary.errors,2);assert.equal((await create(f,input,unavailable.reviewHash,'disabled_new')).body.code,'class-series-invalid');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,shift} from './class-fixture.mjs';
import {createClassSeries} from '../../centers/services/class-series.js';
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

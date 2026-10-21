import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
import {memberRecord} from '../../centers/services/member-records.js';
import {previewForContract} from '../../centers/services/billing-preview.js';
import {shiftBillingMonth} from '../../centers/domain/billing-calendar.js';

async function fixture(t,{futureSubscription=false,withEnd=true}={}){
  const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});
  const releases=[];let cleanup=async()=>{};
  t.after(async()=>{for(const release of releases)release();try{await cleanup()}finally{await db.close();await migrator.end()}});
  const p='clock_'+randomBytes(5).toString('hex'),uid=p+'_root';
  const h=await startHttp(t,{app,superadminUids:[uid],users:[{id:uid,name:uid}]});
  const response=await fetch(h.base+'/api/platform/centers/create',{method:'POST',headers:h.headers(uid),body:JSON.stringify({name:p,managerUid:uid,requestId:p+'_create'})});assert.equal(response.status,200);
  const center=(await response.json()).center.id,member=p+'_member',change=p+'_end',subscription=p+'_sub';
  cleanup=()=>db.platformTransaction(uid,client=>client.query("UPDATE centers.centers SET timezone='Europe/Madrid' WHERE id=$1",[center]),center);
  // A PostgreSQL POSIX zone with seconds places a real civil midnight three seconds
  // ahead. It is confined to this test center; no system clock or stored time is rewritten.
  const {rows:[clock]}=await migrator.query("SELECT date_trunc('second',clock_timestamp())+interval '3 seconds' AS boundary");
  const boundary=clock.boundary,zone='UTC+'+[boundary.getUTCHours(),boundary.getUTCMinutes(),boundary.getUTCSeconds()].map(n=>String(n).padStart(2,'0')).join(':');
  const {rows:[days]}=await migrator.query("SELECT ($1::timestamptz AT TIME ZONE $2)::date::text AS after_day,(($1::timestamptz AT TIME ZONE $2)::date-1)::text AS before_day",[boundary,zone]);
  const anchorDay=+days.after_day.slice(8),anchor=shiftBillingMonth(days.after_day,-1,anchorDay);
  await db.platformTransaction(uid,async client=>{
    await client.query('UPDATE centers.centers SET timezone=$2 WHERE id=$1',[center,zone]);
    await client.query("INSERT INTO centers.members(id,center_id,member_number,name,state,joined_on) VALUES($1,$2,'M-000001','Fictional boundary member','active',$3)",[member,center,anchor]);
    if(withEnd)await client.query("INSERT INTO centers.membership_changes(id,center_id,member_id,sequence,action,from_state,to_state,effective_on,reason,actor_uid) VALUES($1,$2,$3,1,'end','active','ended',$4,'Fictional midnight end',$5)",[change,center,member,days.after_day,uid]);
    await client.query('INSERT INTO centers.membership_plans(id,center_id) VALUES($1,$2)',[p+'_plan',center]);
    await client.query("INSERT INTO centers.membership_plan_versions(id,center_id,plan_id,revision,name,price_minor,currency,interval_months,price_includes_tax,tax_basis_points,proration,actor_uid) VALUES($1,$2,$3,1,'Fictional clock fee',1000,'EUR',1,true,0,'none',$4)",[p+'_price',center,p+'_plan',uid]);
    await client.query('INSERT INTO centers.subscriptions(id,center_id,member_id,plan_id,price_version_id,starts_on,billing_day,anchor_on,timezone,actor_uid) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[subscription,center,member,p+'_plan',p+'_price',futureSubscription?days.after_day:days.before_day,anchorDay,anchor,zone,uid]);
  },center);
  const afterBoundary=()=>migrator.query("SELECT pg_sleep(greatest(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.05)",[boundary]);
  return {db,migrator,p,uid,center,member,change,subscription,boundary,zone,days,afterBoundary,registerRelease:release=>releases.push(release)};
}
test('a transaction queued over civil midnight uses the current membership state and billing period after its center lock',async t=>{
  const f=await fixture(t);let unlock,locked;const held=new Promise(resolve=>unlock=resolve),entered=new Promise(resolve=>locked=resolve);f.registerRelease(unlock);
  const blocker=f.db.platformTransaction(f.uid,async client=>{await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:'||$1))",[f.center]);locked();await held},f.center);await entered;
  let started;const begun=new Promise(resolve=>started=resolve);
  const queued=f.db.platformTransaction(f.uid,async client=>{
    const {rows:[clock]}=await client.query('SELECT (transaction_timestamp() AT TIME ZONE $1)::date::text AS day',[f.zone]);started(clock.day);
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:'||$1))",[f.center]);
    const member=await memberRecord(client,f.center,f.member),quote=await previewForContract(client,f.center,f.member,f.subscription);
    return {state:member.state,today:member.local_today,periodStart:quote.periodStart};
  },f.center).then(result=>({result}),error=>({error}));
  assert.equal(await begun,f.days.before_day,'the transaction really begins before this fixture midnight');
  await f.afterBoundary();unlock();await blocker;
  const outcome=await queued;if(outcome.error)throw outcome.error;
  assert.deepEqual(outcome.result,{state:'ended',today:f.days.after_day,periodStart:f.days.after_day.slice(0,7)+'-01'});
});
test('a raw queued cancellation cannot cancel an end that became effective while waiting for its row lock',async t=>{
  const f=await fixture(t);let unlock,locked;const held=new Promise(resolve=>unlock=resolve),entered=new Promise(resolve=>locked=resolve);f.registerRelease(unlock);
  const blocker=f.db.platformTransaction(f.uid,async client=>{await client.query('SELECT id FROM centers.membership_changes WHERE id=$1 FOR UPDATE',[f.change]);locked();await held},f.center);await entered;
  let started;const begun=new Promise(resolve=>started=resolve);
  const queued=f.db.platformTransaction(f.uid,async client=>{
    const {rows:[clock]}=await client.query('SELECT (transaction_timestamp() AT TIME ZONE $1)::date::text AS day',[f.zone]);started(clock.day);
    return client.query('UPDATE centers.membership_changes SET canceled_at=clock_timestamp(),canceled_by=$2 WHERE id=$1',[f.change,f.uid]);
  },f.center).then(()=>({allowed:true}),error=>({code:error.code}));
  assert.equal(await begun,f.days.before_day);await f.afterBoundary();unlock();await blocker;
  assert.deepEqual(await queued,{code:'23514'});
});
test('a queued cancellation cannot cancel a subscription that started while waiting for its row lock',async t=>{
  const f=await fixture(t,{futureSubscription:true,withEnd:false});let unlock,locked;const held=new Promise(resolve=>unlock=resolve),entered=new Promise(resolve=>locked=resolve);f.registerRelease(unlock);
  const blocker=f.db.platformTransaction(f.uid,async client=>{await client.query('SELECT id FROM centers.subscriptions WHERE id=$1 FOR UPDATE',[f.subscription]);locked();await held},f.center);await entered;
  let started;const begun=new Promise(resolve=>started=resolve);
  const queued=f.db.platformTransaction(f.uid,async client=>{
    const {rows:[clock]}=await client.query('SELECT (transaction_timestamp() AT TIME ZONE $1)::date::text AS day',[f.zone]);started(clock.day);
    return client.query('UPDATE centers.subscriptions SET canceled_at=clock_timestamp(),canceled_by=$2,version=version+1 WHERE id=$1',[f.subscription,f.uid]);
  },f.center).then(()=>({allowed:true}),error=>({code:error.code}));
  assert.equal(await begun,f.days.before_day);await f.afterBoundary();unlock();await blocker;assert.deepEqual(await queued,{code:'23514'});
});

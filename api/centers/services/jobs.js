import {CentersError} from '../errors.js';
import {objectBody,idField,requestField} from '../domain/validation.js';
import {membershipDate} from '../domain/membership-transitions.js';
import {billingPeriodStartFor,shiftBillingMonth,membershipReceiptDueOn} from '../domain/billing-calendar.js';
import {businessTransaction} from './context.js';
import {businessAudit,commandHash,commandReplay,rememberCommand} from './commands.js';
import {issueReceipt} from './receipts.js';
import {startCentersWorker} from './worker-lifecycle.js';

const SYSTEM_UID='system_centers_billing';
const lock=(client,id)=>client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:' || $1))",[id]);
const settingsDto=row=>row?{enabled:row.enabled,fromOn:row.from_on,version:row.version}:{enabled:false,fromOn:null,version:0};

export function automationStatus(database,uid,centerId,{platform=false,workerEnabled=false}={}) {
  return businessTransaction(database,uid,centerId,'billing.read',async client=>{
    const {rows:clock}=await client.query("SELECT (statement_timestamp() AT TIME ZONE timezone)::date::text AS today FROM centers.centers WHERE id=$1",[centerId]);
    const {rows}=await client.query('SELECT enabled,from_on::text,version FROM centers.billing_automation WHERE center_id=$1',[centerId]);
    const {rows:counts}=await client.query('SELECT state,count(*)::text AS count FROM centers.job_runs WHERE center_id=$1 GROUP BY state',[centerId]);
    const {rows:jobs}=await client.query(`SELECT id,subscription_id,period_start::text,state,attempts,error_code,receipt_id FROM centers.job_runs WHERE center_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30`,[centerId]);
    const {rows:outbox}=await client.query("SELECT count(*)::text AS count FROM centers.outbox WHERE center_id=$1 AND state='pending'",[centerId]);
    return {settings:settingsDto(rows[0]),today:clock[0].today,workerEnabled,counts:Object.fromEntries(counts.map(row=>[row.state,row.count])),jobs:jobs.map(row=>({id:row.id,subscriptionId:row.subscription_id,periodStart:row.period_start,state:row.state,attempts:row.attempts,errorCode:row.error_code,receiptId:row.receipt_id})),pendingEvents:outbox[0].count};
  },{platform,allowInactive:true});
}
export function configureAutomation({database,user,checkSession},raw) {
  objectBody(raw,['centerId','enabled','fromOn','version','requestId']);
  const centerId=idField(raw.centerId),fromOn=membershipDate(raw.fromOn),requestId=requestField(raw.requestId),version=raw.version;
  if(typeof raw.enabled!=='boolean'||!Number.isSafeInteger(version)||version<0)throw new CentersError(400,'invalid-input','invalid automation settings');
  const operation='billing.automation',hash=commandHash({enabled:raw.enabled,fromOn,version});
  return businessTransaction(database,user.id,centerId,'billing.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const {rows}=await client.query('SELECT enabled,from_on::text,version FROM centers.billing_automation WHERE center_id=$1',[centerId]);
    if((rows[0]?.version||0)!==version)throw new CentersError(409,'version-conflict','automation changed; reload');
    // An activation floor is stable across restarts and off/on cycles. Never silently
    // move it forward and lose outstanding periods, or backward and back-bill history.
    if(rows.length&&rows[0].from_on!==fromOn)throw new CentersError(409,'automation-date-locked','initial automation date is immutable');
    const {rows:clock}=await client.query("SELECT (statement_timestamp() AT TIME ZONE timezone)::date::text AS today FROM centers.centers WHERE id=$1",[centerId]);
    const age=(Date.parse(clock[0].today+'T00:00:00Z')-Date.parse(fromOn+'T00:00:00Z'))/86400000;
    if(!rows.length&&(age<0||age>366))throw new CentersError(400,'invalid-input','initial date must be within the last 366 civil days');
    checkSession();
    const {rows:saved}=await client.query(`INSERT INTO centers.billing_automation(center_id,enabled,from_on,actor_uid) VALUES($1,$2,$3,$4)
      ON CONFLICT(center_id) DO UPDATE SET enabled=EXCLUDED.enabled,version=centers.billing_automation.version+1,actor_uid=EXCLUDED.actor_uid,updated_at=now()
      RETURNING enabled,from_on::text,version`,[centerId,raw.enabled,fromOn,user.id]);
    await businessAudit(client,centerId,user.id,'billing.automation',centerId,{enabled:raw.enabled,fromOn});
    const response={settings:settingsDto(saved[0])};await rememberCommand(client,centerId,user.id,operation,requestId,hash,response);checkSession();return response;
  },{platform:true});
}
export function retryBillingJob({database,user,checkSession},raw) {
  objectBody(raw,['centerId','id','requestId']);const centerId=idField(raw.centerId),id=idField(raw.id),requestId=requestField(raw.requestId),operation='billing.job.retry',hash=commandHash({id});
  return businessTransaction(database,user.id,centerId,'billing.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const {rows}=await client.query("UPDATE centers.job_runs SET state='pending',attempts=0,next_attempt_at=now(),error_code=NULL WHERE center_id=$1 AND id=$2 AND state='blocked' RETURNING id",[centerId,id]);
    if(!rows.length)throw new CentersError(409,'job-not-blocked','only a blocked job may be retried');
    await businessAudit(client,centerId,user.id,'billing.job.retry',id);const result={ok:true};await rememberCommand(client,centerId,user.id,operation,requestId,hash,result);checkSession();return result;
  },{platform:true});
}

// Caller-provided rows are read only from pinned SQL subscription terms. The floor
// applies to period starts; no earlier period is silently billed on activation.
export function pendingPeriods(row,fromOn,today,limit=3) {
  const lower=row.last_period?shiftBillingMonth(row.last_period,row.interval_months,row.billing_day):fromOn;
  let start=billingPeriodStartFor(lower,row.anchor_on,row.interval_months,row.billing_day);
  if(start<lower)start=shiftBillingMonth(start,row.interval_months,row.billing_day);
  const periods=[];
  while(periods.length<limit&&start<=today&&(!row.ends_on||start<row.ends_on)){
    periods.push({periodStart:start,dueOn:membershipReceiptDueOn(start)});
    start=shiftBillingMonth(start,row.interval_months,row.billing_day);
  }
  return periods;
}

async function scanCenter(database,centerId) {
  return database.platformTransaction(SYSTEM_UID,async client=>{
    await lock(client,centerId);
    const {rows:settings}=await client.query(`SELECT a.*,a.from_on::text,(statement_timestamp() AT TIME ZONE c.timezone)::date::text AS today
      FROM centers.billing_automation a JOIN centers.centers c ON c.id=a.center_id WHERE a.center_id=$1 AND a.enabled AND c.state='active'`,[centerId]);
    if(!settings.length)return;const setting=settings[0];
    const {rows}=await client.query(`SELECT s.id,s.member_id,s.starts_on::text,s.ends_on::text,s.anchor_on::text,s.billing_day,v.interval_months,
      (SELECT max(j.period_start)::text FROM centers.job_runs j WHERE j.center_id=s.center_id AND j.subscription_id=s.id) AS last_period
      FROM centers.subscriptions s JOIN centers.membership_plan_versions v ON (v.center_id,v.id)=(s.center_id,s.price_version_id)
      WHERE s.center_id=$1 AND s.id>$2 AND s.canceled_at IS NULL AND s.starts_on<=$3::date AND (s.ends_on IS NULL OR s.ends_on>$4::date)
      ORDER BY s.id LIMIT 10`,[centerId,setting.scan_after,setting.today,setting.from_on]);
    for(const row of rows)for(const period of pendingPeriods(row,setting.from_on,setting.today)){
      const id='jr_'+commandHash([centerId,row.id,period.periodStart]).slice(0,32);
      await client.query(`INSERT INTO centers.job_runs(id,center_id,member_id,subscription_id,period_start,due_on) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,[id,centerId,row.member_id,row.id,period.periodStart,period.dueOn]);
    }
    await client.query('UPDATE centers.billing_automation SET scan_after=$2,scanned_at=now() WHERE center_id=$1',[centerId,rows.length===10?rows.at(-1).id:'']);
  },centerId);
}
async function runOne(database,centerId) {
  return database.platformTransaction(SYSTEM_UID,async client=>{
    await lock(client,centerId);
    const {rows:active}=await client.query(`SELECT a.center_id FROM centers.billing_automation a JOIN centers.centers c ON c.id=a.center_id WHERE a.center_id=$1 AND a.enabled AND c.state='active'`,[centerId]);
    if(!active.length)return false;
    const {rows}=await client.query("SELECT *,period_start::text,due_on::text FROM centers.job_runs WHERE center_id=$1 AND state='pending' AND next_attempt_at<=now() ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",[centerId]);
    if(!rows.length)return false;const job=rows[0];
    await client.query('SAVEPOINT receipt_issue');
    try{
      // A canceled future contract may have been queued before a later cancellation.
      const {rows:subscriptions}=await client.query('SELECT canceled_at FROM centers.subscriptions WHERE center_id=$1 AND id=$2',[centerId,job.subscription_id]);
      const result=subscriptions[0]?.canceled_at?{skipped:true}:await issueReceipt(client,{centerId,memberId:job.member_id,subscriptionId:job.subscription_id,periodStart:job.period_start,dueOn:job.due_on,uid:SYSTEM_UID,automatic:true});
      await client.query("UPDATE centers.job_runs SET state=$2,receipt_id=$3,finished_at=now(),attempts=attempts+1,error_code=NULL WHERE id=$1",[job.id,result.skipped?'skipped':'done',result.receipt?.id||null]);
    }catch(error){
      await client.query('ROLLBACK TO SAVEPOINT receipt_issue');
      // Persist a bounded retry without retaining SQL text, DSNs or personal payloads.
      const transient=!(error instanceof CentersError),code=transient?'temporary-failure':error.code;
      await client.query("UPDATE centers.job_runs SET attempts=attempts+1,state=$2,error_code=$3,next_attempt_at=now()+interval '5 minutes' WHERE id=$1",[job.id,transient&&job.attempts<7?'pending':'blocked',code]);
    }
    return true;
  },centerId);
}
export async function billingTick(database) {
  // The database, rather than a timer cursor, chooses the oldest scan after restart.
  const centers=await database.platformTransaction(SYSTEM_UID,async client=>(await client.query(`SELECT a.center_id FROM centers.billing_automation a JOIN centers.centers c ON c.id=a.center_id WHERE a.enabled AND c.state='active' ORDER BY a.scanned_at NULLS FIRST,a.center_id LIMIT 4`)).rows);
  let processed=0;
  for(const {center_id:id} of centers){
    await scanCenter(database,id);
    for(let count=0;count<10&&await runOne(database,id);count++){processed++;await new Promise(resolve=>setImmediate(resolve))}
  }
  return {centers:centers.length,processed};
}
export function startBillingWorker(database,{enabled=false,intervalMs=60000,onError=()=>{},afterTick=async()=>{}}={}) {
  return startCentersWorker(()=>billingTick(database).then(afterTick),{enabled,intervalMs,onError});
}

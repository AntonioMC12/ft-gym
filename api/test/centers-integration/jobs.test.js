import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
import {billingTick} from '../../centers/services/jobs.js';

test('persistent billing jobs recover a rolled-back worker, deduplicate concurrent issuance and preserve transactional outbox',async t=>{
  const {app,migrator}=await isolatedDatabase(),database=createCentersDatabase({enabled:true,databaseUrl:app});let cleanupCenter;
  t.after(async()=>{try{if(cleanupCenter)await database.platformTransaction('fixture_cleanup',client=>client.query('UPDATE centers.billing_automation SET enabled=false WHERE center_id=$1',[cleanupCenter]),cleanupCenter)}finally{await database.close();await migrator.end()}});
  const p='jobs_'+randomBytes(5).toString('hex'),root=p+'_root',manager=p+'_manager',other=p+'_other',trainer=p+'_trainer';
  const h=await startHttp(t,{app,superadminUids:[root],users:[root,manager,other,trainer].map(id=>({id,name:id}))});
  const req=async(path,uid,body)=>{const response=await fetch(h.base+path,{headers:h.headers(uid),...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}};
  const center=(await req('/api/platform/centers/create',root,{name:p,managerUid:manager,requestId:p+'_center'})).body.center.id;
  cleanupCenter=center;
  const centerB=(await req('/api/platform/centers/create',root,{name:p+' isolated',managerUid:other,requestId:p+'_center_b'})).body.center.id;
  const member=(await req('/api/centers/members/create',manager,{centerId:center,name:'Fictional automation',requestId:p+'_member'})).body.member;
  const plan=(await req('/api/centers/plans/create',manager,{centerId:center,name:'Fictional monthly',priceMinor:'3100',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:p+'_plan'})).body.plan;
  const today=(await req(`/api/centers/member?centerId=${center}&id=${member.id}`,manager)).body.today;
  const contract=(await req('/api/centers/subscriptions/create',manager,{centerId:center,memberId:member.id,memberVersion:1,priceVersionId:plan.priceVersionId,effectiveOn:today,requestId:p+'_contract'})).body.subscriptions[0];
  const url='/api/centers/billing/automation?centerId='+center;
  assert.equal((await req(url,manager)).body.settings.enabled,false);
  const input={centerId:center,enabled:true,fromOn:contract.anchorOn,version:0,requestId:p+'_enable'};
  assert.equal((await req('/api/platform/centers/billing/automation',manager,input)).status,403);
  assert.equal((await req('/api/platform/centers/billing/automation',root,input)).status,200);
  assert.equal((await req('/api/platform/centers/billing/automation',root,input)).body.settings.version,1);
  assert.equal((await req('/api/platform/centers/billing/automation',root,{...input,requestId:p+'_stale'})).body.code,'version-conflict');
  assert.equal((await req('/api/platform/centers/billing/automation',root,{...input,fromOn:'2025-01-01',version:1,requestId:p+'_date'})).body.code,'automation-date-locked');
  // Interrupt after issue + outbox + job completion but before COMMIT. PostgreSQL
  // rolls all three back; a separate process subsequently discovers the same job.
  let interrupted=false;
  const crashing={platformTransaction(uid,work,id){return database.platformTransaction(uid,async client=>{
    const result=await work(client);
    if(id===center&&result===true&&!interrupted){interrupted=true;throw new Error('fictional interruption before commit')}
    return result;
  },id)}};
  await assert.rejects(billingTick(crashing),/fictional interruption/);
  const inspect=()=>database.platformTransaction(root,async client=>({
    receipts:(await client.query('SELECT id FROM centers.receipts WHERE center_id=$1',[center])).rows,
    events:(await client.query('SELECT payload FROM centers.outbox WHERE center_id=$1',[center])).rows,
    jobs:(await client.query('SELECT id,state,attempts FROM centers.job_runs WHERE center_id=$1',[center])).rows,
  }),center);
  let state=await inspect();assert.equal(state.receipts.length,0);assert.equal(state.events.length,0);assert.equal(state.jobs[0].state,'pending');
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--input-type=module','-e',`import {testUrls} from './test/centers-integration/helpers.mjs';import {createCentersDatabase} from './centers/db.js';import {startBillingWorker} from './centers/services/jobs.js';const db=createCentersDatabase({enabled:true,databaseUrl:testUrls().app}),worker=startBillingWorker(db,{enabled:true,intervalMs:25});try{let found=false;for(let n=0;n<100&&!found;n++){await new Promise(r=>setTimeout(r,25));found=await db.platformTransaction('fixture_probe',async c=>(await c.query('SELECT id FROM centers.receipts WHERE center_id=$1',[process.argv[1]])).rows.length>0,process.argv[1])}if(!found)throw new Error('startup recovery timeout')}finally{await worker.stop();await db.close()}`,center],{stdio:'ignore'});
    child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('restarted fixture worker failed')));
  });
  await Promise.all([billingTick(database),billingTick(database)]);
  state=await inspect();assert.equal(state.receipts.length,1);assert.equal(state.events.length,1);assert.equal(state.jobs[0].state,'done');assert.deepEqual(state.events[0].payload,{receiptId:state.receipts[0].id});
  const issued=await req('/api/centers/receipts/generate',manager,{centerId:center,memberId:member.id,subscriptionId:contract.id,periodStart:contract.anchorOn,dueOn:today,requestId:p+'_manual'});assert.equal(issued.status,200);assert.equal(issued.body.receipt.id,state.receipts[0].id);
  assert.equal((await inspect()).events.length,1);
  assert.equal((await req(url,other)).status,404);
  assert.equal((await database.transaction({uid:other,centerId:centerB},client=>client.query('SELECT id FROM centers.job_runs WHERE center_id=$1',[center]))).rows.length,0);
  assert.equal((await database.transaction({uid:manager,centerId:center},client=>client.query("UPDATE centers.job_runs SET state='pending' WHERE center_id=$1",[center]))).rowCount,0,'RLS prevents manager job mutation');
  const status=(await req(url,manager)).body;assert.equal(status.counts.done,'1');assert.equal(status.pendingEvents,'1');assert.equal(status.workerEnabled,false);
  // An explicitly disabled center automation never processes a queued row.
  await req('/api/platform/centers/billing/automation',root,{...input,enabled:false,version:1,requestId:p+'_disable'});
  await database.platformTransaction(root,client=>client.query("UPDATE centers.job_runs SET state='blocked',finished_at=NULL,receipt_id=NULL,error_code='fictional-policy-failure' WHERE center_id=$1",[center]),center);
  const retry={centerId:center,id:state.jobs[0].id,requestId:p+'_retry'};
  assert.equal((await req('/api/platform/centers/billing/jobs/retry',manager,retry)).status,403);
  assert.equal((await req('/api/platform/centers/billing/jobs/retry',root,retry)).status,200);
  assert.equal((await req('/api/platform/centers/billing/jobs/retry',root,retry)).status,200);
  await billingTick(database);assert.equal((await inspect()).jobs[0].state,'pending');
  await req('/api/platform/centers/billing/automation',root,{...input,version:2,requestId:p+'_reenable'});
  await Promise.all([billingTick(database),billingTick(database)]);assert.equal((await inspect()).jobs[0].state,'done');assert.equal((await inspect()).receipts.length,1);

  const addContract=async suffix=>{
    const created=(await req('/api/centers/members/create',manager,{centerId:center,name:'Fictional '+suffix,requestId:p+'_member_'+suffix})).body.member;
    const subscription=(await req('/api/centers/subscriptions/create',manager,{centerId:center,memberId:created.id,memberVersion:1,priceVersionId:plan.priceVersionId,effectiveOn:today,requestId:p+'_contract_'+suffix})).body.subscriptions[0];
    return {member:created,subscription};
  };
  const paused=await addContract('paused');
  assert.equal((await req('/api/centers/members/transition',manager,{centerId:center,id:paused.member.id,version:2,action:'freeze',effectiveOn:today,reason:'Fictional no charge',requestId:p+'_pause'})).status,200);
  await billingTick(database);
  assert.equal((await inspect()).jobs.find(job=>job.state==='skipped')?.attempts,1,'a fully frozen period is explicitly skipped');
  assert.equal((await inspect()).receipts.length,1);

  const recovering=await addContract('retry');let failed=false;
  const broken={platformTransaction(uid,work,id){return database.platformTransaction(uid,client=>work(new Proxy(client,{get(target,key){
    if(key==='query')return (sql,values)=>{
      if(id===center&&!failed&&sql.startsWith('INSERT INTO centers.receipts')&&values[2]===recovering.member.id){failed=true;return target.query('SELECT 1/0')}
      return target.query(sql,values);
    };
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }})),id)}};
  await billingTick(broken);state=await inspect();
  const waiting=state.jobs.find(job=>job.state==='pending');assert.ok(waiting);assert.equal(waiting.attempts,1);assert.equal(state.receipts.length,1);assert.equal(state.events.length,1,'failed SQL leaves neither receipt nor outbox event');
  await database.platformTransaction(root,client=>client.query('UPDATE centers.job_runs SET next_attempt_at=now() WHERE center_id=$1 AND id=$2',[center,waiting.id]),center);
  await billingTick(database);state=await inspect();assert.equal(state.jobs.find(job=>job.id===waiting.id).state,'done');assert.equal(state.receipts.length,2);assert.equal(state.events.length,2);
  for(let index=0;index<12;index++)await addContract('batch_'+index);
  const firstBatch=await billingTick(database);assert.ok(firstBatch.processed<=40,'one wake handles at most four centers times ten jobs');
  assert.ok((await inspect()).receipts.length<=12,'a center processes at most ten receipt jobs per wake');
  for(let index=0;index<5;index++)await billingTick(database);
  state=await inspect();assert.equal(state.receipts.length,14);assert.equal(state.events.length,14);assert.equal(state.jobs.length,15,'the persistent subscription cursor eventually visits the next page');
  await req('/api/platform/centers/billing/automation',root,{...input,enabled:false,version:3,requestId:p+'_stop'});
});

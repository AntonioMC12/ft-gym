import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
import {notificationTick,createNotificationCapture} from '../../centers/services/notification-worker.js';

test('own notice verification is separate from identity and receipt delivery is recoverable without reverting a payment',async t=>{
  const {app,migrator}=await isolatedDatabase(),database=createCentersDatabase({enabled:true,databaseUrl:app});let cleanupCenter;
  t.after(async()=>{try{if(cleanupCenter)await database.platformTransaction('fixture_cleanup',client=>client.query('UPDATE centers.notification_policies SET enabled=false WHERE center_id=$1',[cleanupCenter]),cleanupCenter)}finally{await database.close();await migrator.end()}});
  const p='mail_'+randomBytes(5).toString('hex'),root=p+'_root',manager=p+'_manager',alice=p+'_alice',bob=p+'_bob';
  const h=await startHttp(t,{app,notificationCapture:true,superadminUids:[root],users:[root,manager,alice,bob].map(id=>({id,name:id}))});
  const req=async(path,uid,body)=>{const response=await fetch(h.base+path,{headers:h.headers(uid),...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}};
  const center=(await req('/api/platform/centers/create',root,{name:p,managerUid:manager,requestId:p+'_center'})).body.center.id;cleanupCenter=center;
  const member=(await req('/api/centers/members/create',manager,{centerId:center,name:'Fictional recipient',email:'staff_contact@example.invalid',requestId:p+'_member'})).body.member;
  const invitation=(await req('/api/centers/invitations/create',manager,{centerId:center,kind:'member',memberId:member.id,accountUid:alice,requestId:p+'_invite'})).body;
  await req('/api/centers/invitations/accept',alice,{token:invitation.token});
  const own='/api/centers/own/notifications?centerId='+center;
  assert.equal((await req(own,alice)).body.contact.email,null,'staff contact is not an owned notice address');
  assert.equal((await req(own+'&accountUid='+alice,alice)).status,400);
  const policy={centerId:center,enabled:true,receipts:true,dueLeadDays:3,debtRepeatDays:7,priceNoticeDays:30,version:0,requestId:p+'_policy'};
  assert.equal((await req('/api/platform/centers/notifications/policy',manager,policy)).status,403);
  assert.equal((await req('/api/platform/centers/notifications/policy',root,policy)).status,200);
  const request={centerId:center,email:'Alice@example.invalid',requestId:p+'_contact'};
  assert.deepEqual((await req('/api/centers/own/notifications/request',alice,request)).body,{queued:true});
  assert.deepEqual((await req('/api/centers/own/notifications/request',alice,request)).body,{queued:true});
  const capture=createNotificationCapture(database),tick=()=>notificationTick(database,{transport:capture});await tick();
  const inspect=()=>database.platformTransaction(root,async client=>({deliveries:(await client.query('SELECT * FROM centers.notification_deliveries WHERE center_id=$1 ORDER BY kind,id',[center])).rows,sink:(await client.query('SELECT * FROM centers.notification_test_sink WHERE center_id=$1',[center])).rows}),center);
  let state=await inspect();assert.equal(state.sink.length,1);const token=state.sink[0].message.text.match(/[a-f0-9]{64}/)[0];
  assert.equal(state.deliveries[0].payload.token,undefined,'sent verification challenge is removed from delivery payload');
  const verify={centerId:center,token,requestId:p+'_verify'};
  assert.equal((await req('/api/centers/own/notifications/verify',bob,verify)).body.code,'account-activation-required');
  const confirmed=await req('/api/centers/own/notifications/verify',alice,verify);assert.equal(confirmed.status,200);assert.equal(confirmed.body.contact.verified,true);
  assert.equal((await req('/api/centers/own/notifications/verify',alice,{...verify,requestId:p+'_used'})).status,409);
  assert.equal((await req('/api/centers/own/notifications/verify',alice,verify)).body.contact.version,2);
  const info=(await req(`/api/centers/member?centerId=${center}&id=${member.id}`,manager)).body;
  const plan=(await req('/api/centers/plans/create',manager,{centerId:center,name:'Fictional notice fee',priceMinor:'3100',currency:'EUR',intervalMonths:3,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:p+'_plan'})).body.plan;
  const contract=(await req('/api/centers/subscriptions/create',manager,{centerId:center,memberId:member.id,memberVersion:info.member.version,priceVersionId:plan.priceVersionId,effectiveOn:info.today,requestId:p+'_contract'})).body.subscriptions[0];
  const receipt=(await req('/api/centers/receipts/generate',manager,{centerId:center,memberId:member.id,subscriptionId:contract.id,periodStart:contract.anchorOn,dueOn:'2099-01-01',requestId:p+'_receipt'})).body.receipt;
  assert.equal((await req('/api/centers/payments/record',manager,{centerId:center,memberId:member.id,amountMinor:'1000',currency:'EUR',paidOn:info.today,method:'cash',allocations:[{receiptId:receipt.id,amountMinor:'1000'}],requestId:p+'_payment'})).status,200);
  await notificationTick(database,{transport:{...capture,send:async()=>{throw new Error('fictional temporary failure')}}});
  state=await inspect();const pending=state.deliveries.find(row=>row.kind==='receipt');assert.equal(pending.state,'pending');assert.equal(pending.attempts,1);assert.equal(state.sink.length,1);
  assert.equal((await req('/api/centers/own/membership?centerId='+center,alice)).body.summary.outstandingMinor,'2100','mail failure never rolls back the committed payment');
  await database.platformTransaction(root,client=>client.query('UPDATE centers.notification_deliveries SET next_attempt_at=now() WHERE center_id=$1 AND id=$2',[center,pending.id]),center);
  await Promise.all([tick(),tick()]);state=await inspect();assert.equal(state.sink.length,2);assert.equal(state.deliveries.find(row=>row.id===pending.id).state,'sent');
  await database.platformTransaction(root,client=>client.query("UPDATE centers.notification_deliveries SET state='sending',claim_token='fictional_expired_lease',lease_until=now()-interval '1 second',finished_at=NULL WHERE center_id=$1 AND id=$2",[center,pending.id]),center);
  await tick();state=await inspect();assert.equal(state.sink.length,2,'acceptance before lost acknowledgement is deduplicated with the same persistent delivery key');assert.equal(state.deliveries.find(row=>row.id===pending.id).state,'sent');
  assert.equal(state.sink.find(row=>row.delivery_id===pending.id).recipient,'Alice@example.invalid');assert.ok(!JSON.stringify(state.sink.find(row=>row.delivery_id===pending.id).message).includes('3100'));
  const managerStatus=await req('/api/centers/notifications?centerId='+center,manager);assert.equal(managerStatus.status,200);assert.ok(!JSON.stringify(managerStatus.body).includes('Alice@'));assert.ok(!JSON.stringify(managerStatus.body).includes(token));
  assert.equal((await database.transaction({uid:manager,centerId:center},client=>client.query("SELECT id FROM centers.notification_deliveries WHERE center_id=$1 AND kind='verify'",[center]))).rows.length,0);
  assert.equal((await database.transaction({uid:manager,centerId:center},client=>client.query('SELECT email FROM centers.notification_contacts WHERE center_id=$1',[center]))).rows.length,0);
  // Synthetic imported ledger rows exercise grouped reminders without changing
  // the host clock or weakening immutable receipt/contract business commands.
  const legacy=async(suffix,month,due)=>{
    const id=p+'_'+suffix,periodStart=`2020-${String(month).padStart(2,'0')}-01`,periodEnd=`2020-${String(month+1).padStart(2,'0')}-01`;
    await database.platformTransaction(root,client=>client.query(`INSERT INTO centers.receipts(id,center_id,member_id,subscription_id,period_start,period_end,due_on,currency,net_minor,tax_minor,total_minor,snapshot,actor_uid)
      SELECT $2,center_id,member_id,subscription_id,$3::date,$4::date,$5::date,currency,net_minor,tax_minor,total_minor,snapshot||jsonb_build_object('periodStart',($3::date)::text,'periodEnd',($4::date)::text),centers.actor_uid() FROM centers.receipts WHERE id=$1`,[receipt.id,id,periodStart,periodEnd,due]),center);return id;
  };
  await legacy('due_a',1,info.today);await legacy('due_b',2,info.today);await legacy('debt_a',3,'2020-05-01');await legacy('debt_b',4,'2020-06-01');
  await tick();state=await inspect();assert.equal(state.deliveries.filter(row=>row.kind==='due').length,1,'one due notice per member and deadline');assert.equal(state.deliveries.filter(row=>row.kind==='debt').length,1,'one debt notice per member and repeat window');assert.equal(state.sink.length,4);
  await tick();assert.equal((await inspect()).sink.length,4,'repeated scan does not flood one recipient with reminders for every receipt');
  const plusDays=days=>{const date=new Date(info.today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)};
  const duePaid=await legacy('due_paid_before_dispatch',5,plusDays(1));let paidBeforeDispatch=false;
  await notificationTick(database,{transport:{...capture,async send(claim){
    if(claim.message.text.includes('próximo a vencer')&&!paidBeforeDispatch){paidBeforeDispatch=true;assert.equal((await req('/api/centers/payments/record',manager,{centerId:center,memberId:member.id,amountMinor:'3100',currency:'EUR',paidOn:info.today,method:'cash',allocations:[{receiptId:duePaid,amountMinor:'3100'}],requestId:p+'_settle_before_notice'})).status,200)}
    return capture.send(claim);
  }}});
  state=await inspect();assert.equal(state.sink.length,4);assert.ok(state.deliveries.some(row=>row.kind==='due'&&row.state==='skipped'),'payment between claim and capture cancels the obsolete reminder');
  const current=(await req(`/api/centers/member?centerId=${center}&id=${member.id}`,manager)).body.member;
  const change={centerId:center,memberId:member.id,memberVersion:current.version,id:contract.id,priceVersionId:plan.priceVersionId,effectiveOn:plusDays(1),requestId:p+'_change_too_soon'};
  assert.equal((await req('/api/centers/subscriptions/change',manager,change)).body.code,'price-notice-required');
  const changed=await req('/api/centers/subscriptions/change',manager,{...change,effectiveOn:plusDays(35),requestId:p+'_change'});assert.equal(changed.status,200);
  assert.equal((await req('/api/platform/centers/notifications/policy',root,{...policy,version:1,priceNoticeDays:90,requestId:p+'_policy_new'})).status,200);
  await tick();state=await inspect();const priceNotice=state.deliveries.find(row=>row.kind==='price');assert.equal(priceNotice.state,'sent');assert.equal(priceNotice.payload.noticeDays,30,'a later policy edit cannot rewrite the notice floor pinned to the contract change');assert.equal(state.sink.length,5);
  await database.platformTransaction(root,client=>client.query("UPDATE centers.notification_deliveries SET state='blocked',error_code='fictional_provider_rejected' WHERE center_id=$1 AND id=$2",[center,pending.id]),center);
  const bulkRetry={centerId:center,requestId:p+'_retry_blocked'};
  assert.equal((await req('/api/platform/centers/notifications/retry',manager,bulkRetry)).status,403);
  assert.equal((await req('/api/platform/centers/notifications/retry',root,bulkRetry)).body.retried,1);
  assert.equal((await req('/api/platform/centers/notifications/retry',root,bulkRetry)).body.retried,1);
  await tick();state=await inspect();assert.equal(state.sink.length,5);assert.equal(state.deliveries.find(row=>row.id===pending.id).state,'sent');
  // Keep the real isolated SQL marker unchanged. Override only the guard's read
  // in this adapter-state test; the carrier below is a function that never sends.
  const simulatedProduction={platformTransaction(uid,work,id){return database.platformTransaction(uid,client=>work(new Proxy(client,{get(target,key){
    if(key==='query')return (sql,values)=>sql==='SELECT kind FROM centers.environment WHERE singleton'?Promise.resolve({rows:[{kind:'production'}]}):target.query(sql,values);
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }})),id)}};
  let providerCalls=0;const uncertainCarrier={kind:'cloudflare',idempotent:false,centerIds:[center],send:async()=>{providerCalls++;throw Object.assign(new Error('fictional ambiguous provider outcome'),{ambiguous:true})}};
  await database.platformTransaction(root,client=>client.query("UPDATE centers.notification_deliveries SET state='pending',attempts=0,finished_at=NULL,next_attempt_at=now() WHERE center_id=$1 AND id=$2",[center,pending.id]),center);
  await notificationTick(simulatedProduction,{transport:uncertainCarrier});await notificationTick(simulatedProduction,{transport:uncertainCarrier});assert.equal(providerCalls,1);assert.equal((await inspect()).deliveries.find(row=>row.id===pending.id).state,'uncertain');
  assert.equal((await req('/api/platform/centers/notifications/retry',root,{centerId:center,requestId:p+'_do_not_retry_uncertain'})).body.retried,0);
  await database.platformTransaction(root,client=>client.query("UPDATE centers.notification_deliveries SET state='sending',claim_token='fictional_lost_provider_ack',lease_until=now()-interval '1 second',finished_at=NULL WHERE center_id=$1 AND id=$2",[center,pending.id]),center);
  await notificationTick(simulatedProduction,{transport:uncertainCarrier});assert.equal(providerCalls,1,'a non-idempotent carrier with an expired sending lease must be reviewed, never resent automatically');assert.equal((await inspect()).deliveries.find(row=>row.id===pending.id).state,'uncertain');
  const acceptedNotices=state.sink.length;
  assert.equal((await req('/api/centers/own/notifications/disable',alice,{centerId:center,version:2,requestId:p+'_disable'})).status,200);
  assert.equal((await req(own,alice)).body.contact.enabled,false);
  const personalBefore=(await req('/api/data',alice)).body;
  assert.equal((await req('/api/centers/own/notifications/request',alice,{...request,email:'Changed@example.invalid',requestId:p+'_changed'})).status,200);
  let contact=(await req(own,alice)).body.contact;assert.equal(contact.verified,false);
  assert.equal((await req('/api/centers/own/notifications/disable',alice,{centerId:center,version:contact.version,requestId:p+'_cancel_pending'})).status,200);
  await tick();assert.equal((await inspect()).sink.length,acceptedNotices,'opt-out before dispatch invalidates the pending verification');
  assert.equal((await req('/api/centers/own/notifications/request',alice,{...request,email:'Expired@example.invalid',requestId:p+'_expiry'})).status,200);
  state=await inspect();const expiring=state.deliveries.find(row=>row.state==='pending');assert.ok(expiring);
  await database.transaction({uid:alice,centerId:center},client=>client.query("UPDATE centers.notification_contacts SET challenge_expires_at=now()-interval '1 second' WHERE center_id=$1 AND account_uid=$2",[center,alice]));
  assert.equal((await req('/api/centers/own/notifications/verify',alice,{centerId:center,token:expiring.payload.token,requestId:p+'_expired_verify'})).body.code,'notification-code-invalid');
  await tick();assert.equal((await inspect()).sink.length,acceptedNotices);
  assert.equal((await req('/api/centers/own/notifications/request',alice,{...request,requestId:p+'_limited'})).status,429);
  assert.deepEqual((await req('/api/data',alice)).body,personalBefore,'notice settings never enter personal training sync');
});

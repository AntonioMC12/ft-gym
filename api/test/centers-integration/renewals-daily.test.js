import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,shift} from './class-fixture.mjs';
import {renewCash} from '../../centers/services/renewals.js';
import {registerPassDay} from '../../centers/services/pass-days.js';
const preview=(f,key='alice',extra={})=>f.req('/api/centers/renewals/preview',f.ids.manager,{centerId:f.center,memberId:f.members[key],...extra});
const command=(f,q,id='renew',key='alice')=>({centerId:f.center,memberId:f.members[key],quoteHash:q.quoteHash,requestId:f.p+'_'+id});
test('cash renewal reuses the calendar and atomically settles one receipt across actors/retries',async t=>{
 const f=await fixture(t),q=await preview(f);assert.equal(q.status,200,JSON.stringify(q));assert.equal(q.body.amountMinor,'1000');assert.ok(q.body.periodStart<=f.today&&q.body.periodEnd>f.today);
 const body=command(f,q.body),results=await Promise.all([f.req('/api/centers/renewals/cash',f.ids.manager,body),f.req('/api/centers/renewals/cash',f.ids.root,{...body,requestId:f.p+'_other'})]);assert.ok(results.every(r=>r.status===200),JSON.stringify(results));assert.equal(results.filter(r=>!r.body.alreadyCovered).length,1);
 const receipts=(await f.req('/api/centers/receipts?'+new URLSearchParams({centerId:f.center,memberId:f.members.alice}),f.ids.manager)).body.receipts;assert.equal(receipts.length,1);assert.equal(receipts[0].settlement.balanceMinor,'0');
 const payments=(await f.req('/api/centers/payments?'+new URLSearchParams({centerId:f.center,memberId:f.members.alice}),f.ids.manager)).body.payments;assert.equal(payments.length,1);assert.equal(payments[0].method,'cash');assert.equal(payments[0].amountMinor,'1000');
 const members=await f.req('/api/centers/members?centerId='+f.center,f.ids.manager);assert.equal(members.status,200,JSON.stringify(members));assert.equal(members.body.members.find(m=>m.id===f.members.alice).fee.name,'Classes fee');assert.equal(members.body.members.find(m=>m.id===f.members.alice).fee.status,'active');assert.equal((await preview(f)).body.alreadyCovered,true);assert.equal((await f.req('/api/centers/renewals/cash',f.ids.manager,body)).status,200);
 assert.ok([403,404].includes((await f.req('/api/centers/renewals/preview',f.ids.trainer,{centerId:f.center,memberId:f.members.alice})).status));
 assert.equal((await f.req('/api/centers/renewals/cash',f.ids.manager,{...body,centerId:f.other})).status,404);
});
test('first fee renews without manual dates and failures roll back subscription, receipt, payment and key',async t=>{
 const f=await fixture(t),m=(await f.req('/api/centers/members/create',f.ids.manager,{centerId:f.center,name:'Fictional no fee',requestId:f.p+'_new'})).body.member;
 const raw={centerId:f.center,memberId:m.id};assert.equal((await f.req('/api/centers/renewals/preview',f.ids.manager,raw)).body.code,'renewal-plan-required');
 const quote=await f.req('/api/centers/renewals/preview',f.ids.manager,{...raw,priceVersionId:f.plan.priceVersionId});assert.equal(quote.status,200,JSON.stringify(quote));const cmd={...raw,priceVersionId:f.plan.priceVersionId,quoteHash:quote.body.quoteHash,requestId:f.p+'_first'};
 const database={transaction:(context,work)=>f.db.transaction(context,client=>work({query:(sql,args)=>{if(sql.startsWith('INSERT INTO centers.business_audit')&&args[2]==='payment.recorded')throw Error('fictional audit failure');return client.query(sql,args)}}))};
 await assert.rejects(renewCash({database,user:{id:f.ids.manager},checkSession(){}},cmd),/fictional audit failure/);
 const before=await f.db.transaction({uid:f.ids.manager,centerId:f.center},client=>client.query('SELECT (SELECT count(*)::int FROM centers.subscriptions WHERE member_id=$1) AS subs,(SELECT count(*)::int FROM centers.payments WHERE member_id=$1) AS payments',[m.id]));assert.equal(before.rows[0].subs,0);assert.equal(before.rows[0].payments,0);
 const renewed=await f.req('/api/centers/renewals/cash',f.ids.manager,cmd);assert.equal(renewed.status,200,JSON.stringify(renewed));assert.equal(renewed.body.amountMinor,'1000');
 const changed={...cmd,requestId:f.p+'_changed',quoteHash:'0'.repeat(64)};assert.equal((await f.req('/api/centers/renewals/cash',f.ids.manager,changed)).body.alreadyCovered,true);
});
async function onlyPassMember(f){
 const m=(await f.req('/api/centers/members/create',f.ids.manager,{centerId:f.center,name:'Fictional pass person',requestId:f.p+'_pass_member'})).body.member;
 return m;
}
async function gift(f,m,credits=1,days=30,suffix='one'){
 const r=await f.req('/api/centers/passes/products/create',f.ids.manager,{centerId:f.center,fields:{name:'Fictional '+suffix,kind:'promotion',credits,validDays:days,priceMinor:'0',priceIncludesTax:true,taxBasisPoints:0},requestId:f.p+'_product_'+suffix});assert.equal(r.status,200,JSON.stringify(r));
 const raw={centerId:f.center,memberId:m.id,productId:r.body.product.id,startsOn:f.today},q=await f.req('/api/centers/passes/preview',f.ids.manager,raw);assert.equal(q.status,200,JSON.stringify(q));const b=await f.req('/api/centers/passes/purchase',f.ids.manager,{...raw,quoteHash:q.body.quoteHash,requestId:f.p+'_buy_'+suffix});assert.equal(b.status,200,JSON.stringify(b));return b.body.pass;
}
test('daily pass use is once per local day across actors and picks earliest expiry atomically',async t=>{
 const f=await fixture(t),m=await onlyPassMember(f),later=await gift(f,m,2,60,'later'),first=await gift(f,m,1,10,'first');
 const raw={centerId:f.center,memberId:m.id,requestId:f.p+'_day'};await assert.rejects(registerPassDay({database:f.db,user:{id:f.ids.manager},checkSession(){throw Error('stop-before-write')}},raw),/stop-before-write/);const results=await Promise.all([f.req('/api/centers/passes/day',f.ids.manager,raw),f.req('/api/centers/passes/day',f.ids.root,{...raw,requestId:f.p+'_root_day'})]);assert.ok(results.every(r=>r.status===200),JSON.stringify(results));assert.equal(results.filter(r=>!r.body.alreadyUsed).length,1);assert.ok(results.every(r=>r.body.passId===first.id));
 const summary=(await f.req('/api/centers/members?centerId='+f.center,f.ids.manager)).body.members.find(r=>r.id===m.id).fee;assert.equal(summary.passDayReason,'used-today');assert.equal(summary.passRemaining,2);
 const history=await f.req('/api/centers/passes/history?'+new URLSearchParams({centerId:f.center,status:'exhausted',query:'pass person'}),f.ids.manager);assert.equal(history.status,200,JSON.stringify(history));assert.equal(history.body.passes.length,1);assert.equal(history.body.passes[0].remaining,0);assert.equal(history.body.passes[0].used,1);
 const uses=await f.req('/api/centers/passes/history?'+new URLSearchParams({centerId:f.center,passId:first.id}),f.ids.manager);assert.equal(uses.body.uses.length,1);assert.equal(uses.body.uses[0].usedOn,f.today);assert.ok([f.ids.manager,f.ids.root].includes(uses.body.uses[0].actorUid));
 const active=await f.req('/api/centers/passes/history?'+new URLSearchParams({centerId:f.center,status:'active'}),f.ids.manager);assert.ok(active.body.passes.some(p=>p.id===later.id));
 assert.equal((await f.req('/api/centers/passes/day',f.ids.manager,{...raw,memberId:f.members.alice,requestId:f.p+'_monthly'})).body.code,'pass-unavailable');
 assert.ok([403,404].includes((await f.req('/api/centers/passes/history?centerId='+f.center,f.ids.alice)).status));
});
test('expired passes cannot be manually consumed; inactive records are an explicit conflict',async t=>{
 const f=await fixture(t),m=await onlyPassMember(f);const result=await f.req('/api/centers/passes/day',f.ids.manager,{centerId:f.center,memberId:m.id,requestId:f.p+'_empty'});assert.equal(result.body.code,'pass-member-inactive');
 const pass=await gift(f,m,1,1);const client=(await import('pg')).default;const {testUrls}=await import('./helpers.mjs');const connection=new client.Client({connectionString:testUrls().migration});await connection.connect();t.after(()=>connection.end());
 await historicalSeed(connection,['pass_purchases'],async()=>{assert.equal((await connection.query('UPDATE centers.pass_purchases SET starts_on=$2::date-2,ends_on=$2::date WHERE id=$1',[pass.id,f.today])).rowCount,1)});
 const expired=await f.req('/api/centers/passes/day',f.ids.manager,{centerId:f.center,memberId:m.id,requestId:f.p+'_expired'});assert.equal(expired.body.code,'pass-unavailable');
 assert.equal((await f.req('/api/centers/members?centerId='+f.center,f.ids.manager)).body.members.find(r=>r.id===m.id).fee.passDayReason,'expired');
 const history=await f.req('/api/centers/passes/history?'+new URLSearchParams({centerId:f.center,status:'expired'}),f.ids.manager);assert.equal(history.body.passes[0].id,pass.id);
});

test('live sessions lose private API access after grace and regain it through the same cash renewal',async t=>{
 const f=await fixture(t);const pg=(await import('pg')).default,{testUrls}=await import('./helpers.mjs'),{shiftBillingMonth}=await import('../../centers/domain/billing-calendar.js');const owner=new pg.Client({connectionString:testUrls().migration});await owner.connect();t.after(()=>owner.end());
 const raw=(await f.req('/api/centers/subscriptions?'+new URLSearchParams({centerId:f.center,memberId:f.members.alice}),f.ids.manager)).body.subscriptions[0];
 const setExpiry=async end=>{const day=+end.slice(8),anchor=shiftBillingMonth(end,-1,day);await historicalSeed(owner,['members','subscriptions'],async()=>{assert.equal((await owner.query('UPDATE centers.members SET joined_on=$2 WHERE id=$1',[f.members.alice,anchor])).rowCount,1);assert.equal((await owner.query('UPDATE centers.subscriptions SET starts_on=$2,anchor_on=$2,billing_day=$3 WHERE id=$1',[raw.id,anchor,day])).rowCount,1)})};
 await setExpiry(shift(f.today,-9));let access=await f.req('/api/centers/app-access',f.ids.alice);assert.equal(access.status,200,JSON.stringify(access));assert.equal(access.body.blocked,false);assert.equal(access.body.warnings[0].deadline,f.today);
 await setExpiry(shift(f.today,-10));access=await f.req('/api/centers/app-access',f.ids.alice);assert.equal(access.body.blocked,true);assert.equal((await f.req('/api/data',f.ids.alice)).body.code,'membership-renewal-required');assert.equal((await f.req('/api/centers/own/classes?centerId='+f.center,f.ids.alice)).body.code,'membership-renewal-required');
 const q=await preview(f);assert.equal(q.status,200,JSON.stringify(q));const paid=await f.req('/api/centers/renewals/cash',f.ids.manager,command(f,q.body));assert.equal(paid.status,200,JSON.stringify(paid));assert.equal((await f.req('/api/centers/app-access',f.ids.alice)).body.blocked,false);assert.notEqual((await f.req('/api/data',f.ids.alice)).status,403);
 assert.equal((await f.req('/api/centers/app-access',f.ids.manager)).body.blocked,false);assert.equal((await f.req('/api/centers/app-access',f.ids.technical)).body.blocked,false);
 assert.equal((await f.req('/api/logout',f.ids.alice,{})).status,200);
});

// Test-only historical fixtures, in the disposable CI database. FORCE RLS is restored before commit.
async function historicalSeed(owner,tables,work){
 assert.equal((await owner.query('SELECT kind FROM centers.environment WHERE singleton')).rows[0].kind,'test');
 await owner.query('BEGIN');try{for(const name of tables){assert.ok(['members','subscriptions','pass_purchases'].includes(name));await owner.query('ALTER TABLE centers.'+name+' NO FORCE ROW LEVEL SECURITY')}await work();for(const name of tables)await owner.query('ALTER TABLE centers.'+name+' FORCE ROW LEVEL SECURITY');await owner.query('COMMIT')}catch(e){await owner.query('ROLLBACK');throw e}
}

test('renewal reuses a partially settled receipt and records only the outstanding cash',async t=>{
 const f=await fixture(t),review=(await preview(f)).body;
 const issued=await f.req('/api/centers/receipts/generate',f.ids.manager,{centerId:f.center,memberId:f.members.alice,subscriptionId:review.subscriptionId,periodStart:review.periodStart,dueOn:f.today,requestId:f.p+'_receipt'});assert.equal(issued.status,200,JSON.stringify(issued));
 const paid=await f.req('/api/centers/payments/record',f.ids.manager,{centerId:f.center,memberId:f.members.alice,amountMinor:'300',currency:'EUR',paidOn:f.today,method:'cash',allocations:[{receiptId:issued.body.receipt.id,amountMinor:'300'}],requestId:f.p+'_partial'});assert.equal(paid.status,200,JSON.stringify(paid));
 const q=await preview(f);assert.equal(q.body.amountMinor,'700');const r=await f.req('/api/centers/renewals/cash',f.ids.manager,command(f,q.body));assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.receiptId,issued.body.receipt.id);const list=await f.req('/api/centers/payments?'+new URLSearchParams({centerId:f.center,memberId:f.members.alice}),f.ids.manager);assert.deepEqual(list.body.payments.map(p=>p.amountMinor).sort(),['300','700']);
});
test('an ended fee renews automatically while preserving its discount and earlier contracts',async t=>{
 const f=await fixture(t),info=(await f.detail('alice')).body,subs=(await f.req('/api/centers/subscriptions?'+new URLSearchParams({centerId:f.center,memberId:f.members.alice}),f.ids.manager)).body.subscriptions;
 const change=await f.req('/api/centers/subscriptions/change',f.ids.manager,{centerId:f.center,memberId:f.members.alice,memberVersion:info.member.version,id:subs[0].id,priceVersionId:f.plan.priceVersionId,effectiveOn:f.today,discountBasisPoints:2000,discountReason:'Fictional agreement',requestId:f.p+'_discount'});assert.equal(change.status,200,JSON.stringify(change));
 await f.db.platformTransaction(f.ids.root,client=>client.query('UPDATE centers.subscriptions SET ends_on=$2,version=version+1 WHERE id=$1',[change.body.subscriptions.find(s=>s.discountBasisPoints===2000).id,f.today]),f.center);
 const q=await preview(f);assert.equal(q.status,200,JSON.stringify(q));assert.equal(q.body.amountMinor,'800');const result=await f.req('/api/centers/renewals/cash',f.ids.manager,command(f,q.body));assert.equal(result.status,200,JSON.stringify(result));const after=(await f.req('/api/centers/subscriptions?'+new URLSearchParams({centerId:f.center,memberId:f.members.alice}),f.ids.manager)).body.subscriptions;assert.equal(after.length,3);assert.equal(after.find(s=>s.status==='active').discountBasisPoints,2000);
});
test('pass-only accounts stay admitted to the application and unfunded passes cannot consume',async t=>{
 const f=await fixture(t,{instructors:1}),m=await onlyPassMember(f),uid=f.p+'_instructor_0',invite=await f.req('/api/centers/invitations/create',f.ids.manager,{centerId:f.center,kind:'member',memberId:m.id,accountUid:uid,requestId:f.p+'_pass_link'});assert.equal(invite.status,200,JSON.stringify(invite));assert.equal((await f.req('/api/centers/invitations/accept',uid,{token:invite.body.token})).status,200);
 const product=await f.req('/api/centers/passes/products/create',f.ids.manager,{centerId:f.center,fields:{name:'Fictional paid pass',kind:'paid',credits:1,validDays:30,priceMinor:'500',priceIncludesTax:true,taxBasisPoints:0},requestId:f.p+'_paid_product'});
 const raw={centerId:f.center,memberId:m.id,productId:product.body.product.id,startsOn:f.today},q=await f.req('/api/centers/passes/preview',f.ids.manager,raw),pass=await f.req('/api/centers/passes/purchase',f.ids.manager,{...raw,quoteHash:q.body.quoteHash,requestId:f.p+'_paid_pass'});assert.equal(pass.status,200,JSON.stringify(pass));assert.equal(pass.body.pass.available,false);
 assert.equal((await f.req('/api/centers/app-access',uid)).body.blocked,false);assert.notEqual((await f.req('/api/data',uid)).status,403);
 const result=await f.req('/api/centers/passes/day',f.ids.manager,{centerId:f.center,memberId:m.id,requestId:f.p+'_unpaid_day'});assert.equal(result.body.code,'pass-unavailable');const stock=await f.req('/api/centers/passes?'+new URLSearchParams({centerId:f.center,memberId:m.id}),f.ids.manager);assert.equal(stock.body.passes[0].remaining,1);
 assert.equal((await f.req('/api/centers/members?centerId='+f.center,f.ids.manager)).body.members.find(r=>r.id===m.id).fee.passDayReason,'payment-required');
});
test('pass history has real cursor pages bound to filters and does not hide previous purchases',async t=>{
 const f=await fixture(t),m=await onlyPassMember(f),first=await gift(f,m,1,30),product=(await f.req('/api/centers/passes/products?centerId='+f.center,f.ids.manager)).body.products[0];
 await f.db.platformTransaction(f.ids.root,async client=>{for(let i=0;i<31;i++)await client.query('INSERT INTO centers.pass_purchases(id,center_id,member_id,product_id,starts_on,ends_on,actor_uid) VALUES($1,$2,$3,$4,$5,$6,$7)',[f.p+'_bulk_'+i,f.center,m.id,product.id,f.today,shift(f.today,30),f.ids.root])},f.center);
 const page=await f.req('/api/centers/passes/history?'+new URLSearchParams({centerId:f.center,query:'pass person'}),f.ids.manager);assert.equal(page.status,200,JSON.stringify(page));assert.equal(page.body.passes.length,30);assert.ok(page.body.nextCursor);
 const tail=await f.req('/api/centers/passes/history?'+new URLSearchParams({centerId:f.center,query:'pass person',cursor:page.body.nextCursor}),f.ids.manager);assert.equal(tail.body.passes.length,2);assert.ok(tail.body.passes.some(p=>p.id===first.id));
 assert.equal((await f.req('/api/centers/passes/history?'+new URLSearchParams({centerId:f.center,status:'expired',cursor:page.body.nextCursor}),f.ids.manager)).status,400);
});

test('daily eligibility explains exhausted, future and revoked passes using the same availability rules',async t=>{
 const f=await fixture(t),m=await onlyPassMember(f),pass=await gift(f,m,1,10,'explanation');
 const fee=async()=> (await f.req('/api/centers/members?centerId='+f.center,f.ids.manager)).body.members.find(r=>r.id===m.id).fee;
 assert.equal((await fee()).passDayReason,null);
 const {passDayAvailability}=await import('../../centers/services/pass-days.js');
 const eligible=day=>f.db.transaction({uid:f.ids.manager,centerId:f.center},async client=>{const {memberRecord}=await import('../../centers/services/member-records.js');const member=await memberRecord(client,f.center,m.id);return passDayAvailability(client,f.center,{...member,local_today:day})});
 assert.equal((await eligible(shift(f.today,-1))).reason,'member-inactive');
 await f.req('/api/centers/passes/day',f.ids.manager,{centerId:f.center,memberId:m.id,requestId:f.p+'_consume_explanation'});
 assert.equal((await eligible(shift(f.today,1))).reason,'exhausted');
 const another=await gift(f,m,1,30,'future');
 const pg=(await import('pg')).default,{testUrls}=await import('./helpers.mjs'),owner=new pg.Client({connectionString:testUrls().migration});await owner.connect();t.after(()=>owner.end());
 await historicalSeed(owner,['pass_purchases'],()=>owner.query('UPDATE centers.pass_purchases SET starts_on=$2,ends_on=$3 WHERE id=$1',[another.id,shift(f.today,2),shift(f.today,32)]));
 assert.equal((await eligible(shift(f.today,1))).reason,'not-started');
 const revoked=await f.req('/api/centers/passes/revoke',f.ids.manager,{centerId:f.center,id:another.id,reason:'Fictional test',requestId:f.p+'_revoke_explanation'});assert.equal(revoked.status,200,JSON.stringify(revoked));
 assert.equal((await eligible(shift(f.today,1))).reason,'exhausted');
});

test('mixed monthly and pass members expose both entitlements and consume only one pass credit',async t=>{
 const f=await fixture(t),m={id:f.members.alice},pass=await gift(f,m,2,30,'mixed');
 const summary=()=>f.req('/api/centers/members?centerId='+f.center,f.ids.manager);
 const before=(await summary()).body.members.find(r=>r.id===m.id).fee;assert.equal(before.hasContract,true);assert.equal(before.hasPass,true);assert.equal(before.passRemaining,2);assert.equal(before.passDayReason,null);
 const result=await f.req('/api/centers/passes/day',f.ids.manager,{centerId:f.center,memberId:m.id,requestId:f.p+'_mixed_use'});assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.body.passId,pass.id);assert.equal(result.body.remaining,1);
 const after=(await summary()).body.members.find(r=>r.id===m.id).fee;assert.equal(after.hasContract,true);assert.equal(after.subscriptionId,before.subscriptionId);assert.equal(after.expiresOn,before.expiresOn);assert.equal(after.passDayReason,'used-today');
 const repeated=await f.req('/api/centers/passes/day',f.ids.root,{centerId:f.center,memberId:m.id,requestId:f.p+'_mixed_again'});assert.equal(repeated.body.alreadyUsed,true);
 const payments=(await f.req('/api/centers/payments?'+new URLSearchParams({centerId:f.center,memberId:m.id}),f.ids.manager)).body.payments;assert.equal(payments.length,0);
});

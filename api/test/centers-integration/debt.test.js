import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
test('center debt/calendar/export derive the ledger, retain account access and isolate permissions',async t=>{
  const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await db.close();await migrator.end()});
  const p='debt_'+randomBytes(5).toString('hex'),root=p+'_root',manager=p+'_manager',trainer=p+'_trainer',elseManager=p+'_else';
  const h=await startHttp(t,{app,superadminUids:[root],users:[root,manager,trainer,elseManager].map(id=>({id,name:id}))});
  const req=async(path,uid,body)=>{const r=await fetch(h.base+path,{headers:h.headers(uid),...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
  const center=(await req('/api/platform/centers/create',root,{name:p,managerUid:manager,requestId:p+'_center'})).body.center.id;
  const elsewhere=(await req('/api/platform/centers/create',root,{name:p+'_else',managerUid:elseManager,requestId:p+'_elsecenter'})).body.center.id;
  const member=(await req('/api/centers/members/create',manager,{centerId:center,name:'=Synthetic CSV',requestId:p+'_member'})).body.member;
  const plan=(await req('/api/centers/plans/create',manager,{centerId:center,name:'Debt fixture',priceMinor:'1000',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:p+'_plan'})).body.plan;
  const today=(await req(`/api/centers/member?centerId=${center}&id=${member.id}`,manager)).body.today;
  const contract=(await req('/api/centers/subscriptions/create',manager,{centerId:center,memberId:member.id,memberVersion:1,priceVersionId:plan.priceVersionId,effectiveOn:today,requestId:p+'_contract'})).body.subscriptions[0];
  const receipt=(await req('/api/centers/receipts/generate',manager,{centerId:center,memberId:member.id,subscriptionId:contract.id,periodStart:contract.anchorOn,dueOn:today,requestId:p+'_receipt'})).body.receipt;
  // Synthetic historical receipts exercise boundary dates without backdating actual contracts.
  for(const [tag,days] of [['grace',-15],['late',-16],['future',1]])await db.platformTransaction(root,client=>client.query(`INSERT INTO centers.receipts(id,center_id,member_id,subscription_id,period_start,period_end,due_on,currency,net_minor,tax_minor,total_minor,snapshot,actor_uid)
    VALUES($1,$2,$3,$4,$5::date+$6::integer,$5::date+$6::integer+1,$5::date+$6::integer,'EUR',100,0,100,$7,$8)`,[p+'_'+tag,center,member.id,contract.id,today,days,JSON.stringify(receipt.snapshot),root]),center);
  const query='/api/centers/billing/debts?centerId='+center,calendar='/api/centers/billing/calendar?centerId='+center,exportQuery='/api/centers/billing/debts/export?centerId='+center;
  let debts=(await req(query,manager)).body;assert.equal(debts.today,today);assert.equal(debts.summary.outstandingMinor,'1300');assert.equal(debts.summary.overdueMinor,'100');assert.deepEqual(debts.receipts.map(r=>r.debt.status),['overdue','grace','not-due','not-due']);assert.ok(!JSON.stringify(debts).includes('nationalDocument'));
  const page=(await req(query+'&limit=1',manager)).body;assert.ok(page.nextCursor);assert.equal((await req(query+'&limit=1&cursor='+encodeURIComponent(page.nextCursor),manager)).body.receipts[0].debt.status,'grace');
  assert.equal((await req('/api/centers/billing/debts?centerId='+elsewhere+'&cursor='+encodeURIComponent(page.nextCursor),elseManager)).status,400);
  assert.equal((await req(query,elseManager)).status,404);assert.equal((await req(exportQuery,manager)).status,403);
  const assignment=(await req('/api/centers/staff?centerId='+center,root)).body.staff.find(r=>r.role==='manager');
  const grant={centerId:center,assignmentId:assignment.id,version:assignment.version,allowExport:true,requestId:p+'_grant'};
  assert.equal((await req('/api/platform/centers/role-capabilities',root,{...grant,allowRefund:true})).status,400);assert.equal((await req('/api/platform/centers/role-capabilities',root,grant)).status,200);
  const csv=(await req(exportQuery,manager)).body;assert.equal(csv.rowCount,4);assert.ok(csv.content.includes('"[text] =Synthetic CSV"'));assert.ok(csv.content.includes('"EUR"'));assert.ok(csv.fileName.endsWith('.csv'));
  const payment=(await req('/api/centers/payments/record',manager,{centerId:center,memberId:member.id,amountMinor:'1000',currency:'EUR',paidOn:today,method:'bank-transfer',allocations:[{receiptId:receipt.id,amountMinor:'1000'}],requestId:p+'_payment'})).body.payment;
  debts=(await req(query,manager)).body;assert.equal(debts.summary.outstandingMinor,'300');assert.equal(debts.summary.receiptCount,3);
  const cal=(await req(calendar+'&dueFrom='+receipt.dueOn+'&dueTo='+receipt.dueOn,manager)).body;assert.equal(cal.receipts.length,1);assert.equal(cal.receipts[0].debt.status,'settled');assert.equal(cal.summary.outstandingMinor,'0');
  assert.equal((await req('/api/centers/payments/refund',root,{centerId:center,memberId:member.id,paymentId:payment.id,receiptId:receipt.id,amountMinor:'100',refundedOn:today,reason:'Synthetic return',requestId:p+'_refund'})).status,200);
  debts=(await req(query,manager)).body;assert.equal(debts.summary.outstandingMinor,'400');assert.equal(debts.summary.overdueMinor,'100');
  const info=(await req('/api/centers/detail?centerId='+center,root)).body.center;await req('/api/centers/staff/assign',root,{centerId:center,version:info.version,accountUid:trainer});assert.equal((await req(query,trainer)).status,403);assert.equal((await req(exportQuery,trainer)).status,403);
  await db.platformTransaction(root,client=>client.query(`INSERT INTO centers.receipts(id,center_id,member_id,subscription_id,period_start,period_end,due_on,currency,net_minor,tax_minor,total_minor,snapshot,actor_uid)
    SELECT $1||'_bulk_'||n,$2,$3,$4,date '1990-01-01'+n,date '1990-01-01'+n+1,date '1990-01-01'+n,'EUR',1,0,1,$5,$6 FROM generate_series(1,4996) n`,[p,center,member.id,contract.id,JSON.stringify(receipt.snapshot),root]),center);
  assert.equal((await req(exportQuery,manager)).body.rowCount,5000,'exact boundary exports a complete snapshot');
  await db.platformTransaction(root,client=>client.query(`INSERT INTO centers.receipts(id,center_id,member_id,subscription_id,period_start,period_end,due_on,currency,net_minor,tax_minor,total_minor,snapshot,actor_uid)
    VALUES($1,$2,$3,$4,date '1990-01-01'+4997,date '1990-01-01'+4998,date '1990-01-01'+4997,'EUR',1,0,1,$5,$6)`,[p+'_bulk_4997',center,member.id,contract.id,JSON.stringify(receipt.snapshot),root]),center);
  const tooLarge=await req(exportQuery,manager);assert.equal(tooLarge.status,409);assert.equal(tooLarge.body.code,'export-too-large');assert.ok(!('content' in tooLarge.body));
  assert.equal((await req(exportQuery+'&dueFrom='+receipt.dueOn+'&dueTo='+receipt.dueOn,manager)).body.rowCount,1);
  assert.equal((await req('/api/platform/centers/role-capabilities',root,{...grant,version:assignment.version+1,allowExport:false,requestId:p+'_revoke'})).status,200);assert.equal((await req(exportQuery,manager)).status,403);
  const json=JSON.parse((await import('node:fs')).readFileSync(h.dir+'/db.json','utf8'));assert.ok(json.users.every(user=>!user.disabled),'debt does not suspend personal accounts');
  const audits=await db.platformTransaction(root,client=>client.query("SELECT details FROM centers.business_audit WHERE center_id=$1 AND action='debt.exported' ORDER BY created_at",[center]),center);assert.equal(audits.rows.length,3);assert.equal(audits.rows[0].details.count,4);assert.ok(!JSON.stringify(audits.rows).includes('Synthetic CSV'));
});

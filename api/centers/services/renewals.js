import {passDayAvailability} from './pass-days.js';
import {CentersError} from '../errors.js';
import {businessTransaction} from './context.js';
import {memberRecord} from './member-records.js';
import {subscriptionRows} from './subscriptions.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
import {objectBody,idField,requestField} from '../domain/validation.js';
import {billingAnchor} from '../domain/billing-calendar.js';
import {renewalPeriod,initialCoverage,feeAccess} from '../domain/renewals.js';
import {previewCharge} from '../domain/charge-preview.js';
import {previewForContract} from './billing-preview.js';
import {issueReceipt} from './receipts.js';
import {appendPayment,receiptBalance} from './payments.js';
const fail=code=>{throw new CentersError(409,code,'renewal requires review')};
async function coveredRenewalPeriod(client,c,memberId,today){
 const month=today.slice(0,7)+'-01';
 const {rows:done}=await client.query(`SELECT r.*,r.period_start::text,r.period_end::text FROM centers.renewals r JOIN centers.subscriptions s ON (s.center_id,s.id)=(r.center_id,r.subscription_id) JOIN centers.membership_plan_versions v ON (v.center_id,v.id)=(s.center_id,s.price_version_id) WHERE r.center_id=$1 AND r.member_id=$2 AND (r.renewal_month=$3 OR v.interval_months<>1 AND r.period_start<=$4 AND r.period_end>$4) ORDER BY r.period_end DESC LIMIT 1`,[c,memberId,month,today]);
 if(done.length){if(done[0].receipt_id&&(await receiptBalance(client,c,memberId,done[0].receipt_id)).balanceMinor!=='0')fail('receipt-review-required');return {alreadyCovered:true,periodStart:done[0].period_start,periodEnd:done[0].period_end,amountMinor:'0',today}}
 const {rows:paid}=await client.query("SELECT r.period_start::text,r.period_end::text FROM centers.receipts r JOIN centers.subscriptions s ON (s.center_id,s.id)=(r.center_id,r.subscription_id) JOIN centers.membership_plan_versions v ON (v.center_id,v.id)=(s.center_id,s.price_version_id) WHERE r.center_id=$1 AND r.member_id=$2 AND r.concept='membership' AND (v.interval_months=1 AND date_trunc('month',r.period_start)=$4::date OR v.interval_months<>1 AND r.period_start<=$3 AND r.period_end>$3) AND r.total_minor=coalesce((SELECT sum(a.amount_minor) FROM centers.payment_allocations a WHERE a.center_id=r.center_id AND a.receipt_id=r.id),0)-coalesce((SELECT sum(f.amount_minor) FROM centers.refunds f WHERE f.center_id=r.center_id AND f.receipt_id=r.id),0) ORDER BY r.period_end DESC LIMIT 1",[c,memberId,today,month]);
 if(paid.length)return {alreadyCovered:true,periodStart:paid[0].period_start,periodEnd:paid[0].period_end,amountMinor:'0',today};
 return null;
}
export async function feeSummary(client,c,member){
 const {rows:contracts}=await client.query('SELECT s.*,s.starts_on::text,s.ends_on::text,s.anchor_on::text,v.name,v.interval_months FROM centers.subscriptions s JOIN centers.membership_plan_versions v ON (v.center_id,v.id)=(s.center_id,s.price_version_id) WHERE s.center_id=$1 AND s.member_id=$2 AND s.canceled_at IS NULL ORDER BY (s.starts_on<=$3) DESC,s.starts_on DESC,s.created_at DESC LIMIT 1',[c,member.id,member.local_today]);const last=contracts[0];
 let renewalCovered=null,renewalUnavailableReason=null;
 try{renewalCovered=await coveredRenewalPeriod(client,c,member.id,member.local_today)}catch(error){if(error.code!=='receipt-review-required')throw error;renewalUnavailableReason=error.code}
 const renewal={renewalCovered,renewalUnavailableReason};
 const availability=await passDayAvailability(client,c,member),passes={hasPass:availability.hasPass,passRemaining:availability.remaining,passDayReason:availability.reason};
 if(!last)return {...renewal,hasContract:false,passOnly:availability.hasPass,...passes,today:member.local_today,...feeAccess(member.local_today,null)};
 const {rows}=await client.query(`SELECT max(CASE WHEN $5::boolean THEN (date_trunc('month',r.period_start)+interval '1 month')::date ELSE r.period_end END)::text AS until FROM centers.receipts r WHERE r.center_id=$1 AND r.member_id=$2 AND r.subscription_id=$3 AND r.period_start<=$4 AND r.total_minor=coalesce((SELECT sum(a.amount_minor) FROM centers.payment_allocations a WHERE a.center_id=r.center_id AND a.receipt_id=r.id),0)-coalesce((SELECT sum(f.amount_minor) FROM centers.refunds f WHERE f.center_id=r.center_id AND f.receipt_id=r.id),0)`,[c,member.id,last.id,member.local_today,last.interval_months===1]);
 const {rows:renewed}=await client.query(`SELECT max(CASE WHEN $5::boolean THEN (date_trunc('month',period_start)+interval '1 month')::date ELSE period_end END)::text AS until FROM centers.renewals WHERE center_id=$1 AND member_id=$2 AND subscription_id=$3 AND period_start<=$4 AND receipt_id IS NULL`,[c,member.id,last.id,member.local_today,last.interval_months===1]);
 let end=[initialCoverage({anchorOn:last.anchor_on,startsOn:last.starts_on,intervalMonths:last.interval_months,billingDay:last.billing_day}),rows[0].until,renewed[0].until].filter(Boolean).sort().at(-1);
 if(last.ends_on&&last.ends_on<end)end=last.ends_on;if(member.ends_on&&member.ends_on<end)end=member.ends_on;
 return {...renewal,hasContract:true,passOnly:false,...passes,name:last.name,subscriptionId:last.id,planId:last.plan_id,today:member.local_today,...feeAccess(member.local_today,end,{intervalMonths:last.interval_months}),...(last.starts_on>member.local_today?{status:'scheduled',blocked:false}:{})};
}
async function prepare(client,scope,memberId,priceVersionId){
 const c=scope.centerId,member=await memberRecord(client,c,memberId),today=member.local_today,month=today.slice(0,7)+'-01';
 const covered=await coveredRenewalPeriod(client,c,memberId,today);if(covered)return covered;
 if(!['active','preactive'].includes(member.state)||member.ends_on&&member.ends_on<=today)fail('renewal-member-inactive');
 const subs=await subscriptionRows(client,c,memberId,10000),existing=subs.find(s=>!s.canceled_at&&s.starts_on<=today&&(!s.ends_on||s.ends_on>today));
 if(subs.some(s=>!s.canceled_at&&s.starts_on>today))fail('pending-subscription');
 const last=existing||subs.find(s=>!s.canceled_at);let priceId=existing?.price_version_id||priceVersionId||last?.price_version_id;
 if(!existing&&!priceVersionId&&last){const {rows:current}=await client.query('SELECT v.id FROM centers.membership_plans p JOIN centers.membership_plan_versions v ON (v.center_id,v.plan_id,v.revision)=(p.center_id,p.id,p.current_revision) WHERE p.center_id=$1 AND p.id=$2 AND p.archived_at IS NULL',[c,last.plan_id]);priceId=current[0]?.id||null}
 if(!priceId)fail('renewal-plan-required');
 const {rows:prices}=await client.query('SELECT v.*,p.archived_at,p.current_revision FROM centers.membership_plan_versions v JOIN centers.membership_plans p ON (p.center_id,p.id)=(v.center_id,v.plan_id) WHERE v.center_id=$1 AND v.id=$2',[c,priceId]);
 const price=prices[0];if(!price||price.archived_at||!existing&&price.revision!==price.current_revision)fail('renewal-plan-required');
 const {rows:centers}=await client.query('SELECT billing_day,timezone FROM centers.centers WHERE id=$1',[c]);const calendar=centers[0];
 const contract=existing?{...existing,anchorOn:existing.anchor_on,billingDay:existing.billing_day,intervalMonths:existing.interval_months}:{id:'su_'+commandHash([c,memberId,month,priceId,'renewal']).slice(0,32),anchorOn:billingAnchor(today,calendar.billing_day,price.interval_months),billingDay:price.interval_months===1?1:calendar.billing_day,intervalMonths:price.interval_months};
 if(existing&&price.interval_months===1){
  const {rows:legacy}=await client.query("SELECT id FROM centers.receipts WHERE center_id=$1 AND member_id=$2 AND subscription_id=$3 AND concept='membership' AND date_trunc('month',period_start)=$4::date AND period_start<>$4::date",[c,memberId,existing.id,month]);
  if(legacy.length)fail('receipt-review-required');
 }
 const discountBasisPoints=existing?.discount_basis_points??(last&&last.plan_id===price.plan_id?last.discount_basis_points:0),discountReason=last&&last.plan_id===price.plan_id?last.discount_reason:null;
 const period=renewalPeriod(today,contract);
 const quote=existing?await previewForContract(client,c,memberId,existing.id,period.start):previewCharge({...contract,priceVersionId:price.id,discountBasisPoints,startsOn:today,endsOn:null,currency:price.currency,priceMinor:price.price_minor,priceIncludesTax:price.price_includes_tax,taxBasisPoints:price.tax_basis_points,proration:price.proration},period.start,{baseState:member.state,changes:member.state==='preactive'?[{effectiveOn:today,toState:'active'}]:[]});
 if(quote.activeDays===0)fail('renewal-member-inactive');
 const {rows:receipts}=await client.query("SELECT id FROM centers.receipts WHERE center_id=$1 AND member_id=$2 AND subscription_id=$3 AND period_start=$4 AND concept='membership'",[c,memberId,contract.id,period.start]);
 const receiptId=receipts[0]?.id||null,amountMinor=receiptId?(await receiptBalance(client,c,memberId,receiptId)).balanceMinor:quote.totalMinor;
 const review={memberId,memberVersion:member.version,name:price.name,periodStart:period.start,periodEnd:period.end,amountMinor,today,priceVersionId:price.id,subscriptionId:contract.id,receiptId};
 return {review,quote,member,existing,price,calendar,contract,month,discountBasisPoints,discountReason};
}
const reviewOf=p=>p.alreadyCovered?p:{...p.review,quoteHash:commandHash(p.review)};
export function previewRenewal({database,user,checkSession},raw,{platform=false}={}){
 objectBody(raw,['centerId','memberId','priceVersionId']);const c=idField(raw.centerId),m=idField(raw.memberId),p=raw.priceVersionId?idField(raw.priceVersionId):null;
 return businessTransaction(database,user.id,c,'billing.manage',async(client,scope)=>{if(!scope.capabilities.includes('payments.record'))throw new CentersError(403,'forbidden','forbidden');const result=reviewOf(await prepare(client,scope,m,p));checkSession();return result},{platform});
}
export function renewCash({database,user,checkSession},raw,{platform=false}={}){
 objectBody(raw,['centerId','memberId','priceVersionId','quoteHash','requestId']);const c=idField(raw.centerId),m=idField(raw.memberId),priceId=raw.priceVersionId?idField(raw.priceVersionId):null,requestId=requestField(raw.requestId),hash=commandHash({m,priceId,quoteHash:raw.quoteHash}),operation='membership.renew.cash';
 return businessTransaction(database,user.id,c,'billing.manage',async(client,scope)=>{
  if(!scope.capabilities.includes('payments.record'))throw new CentersError(403,'forbidden','forbidden');
  const replay=await commandReplay(client,c,user.id,operation,requestId,hash);if(replay){checkSession();return replay}
  const p=await prepare(client,scope,m,priceId);if(p.alreadyCovered){await rememberCommand(client,c,user.id,operation,requestId,hash,p);checkSession();return p}
  if(typeof raw.quoteHash!=='string'||raw.quoteHash!==commandHash(p.review))fail('quote-changed');checkSession();
  if(!p.existing){
   let activation=null;if(p.member.state==='preactive'){activation=p.contract.id+'_a';await client.query("INSERT INTO centers.membership_changes(id,center_id,member_id,sequence,action,from_state,to_state,effective_on,actor_uid) SELECT $1,$2,$3,coalesce(max(sequence),0)+1,'activate','preactive','active',$4,$5 FROM centers.membership_changes WHERE center_id=$2 AND member_id=$3",[activation,c,m,p.review.today,user.id])}
   await client.query('INSERT INTO centers.subscriptions(id,center_id,member_id,plan_id,price_version_id,starts_on,billing_day,anchor_on,timezone,actor_uid,activation_id,discount_basis_points,discount_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[p.contract.id,c,m,p.price.plan_id,p.price.id,p.review.today,p.contract.billingDay,p.contract.anchorOn,p.calendar.timezone,user.id,activation,p.discountBasisPoints,p.discountReason]);
   await client.query('UPDATE centers.members SET version=version+1,updated_at=clock_timestamp() WHERE center_id=$1 AND id=$2',[c,m]);
   await businessAudit(client,c,user.id,'subscription.create',p.contract.id,{memberId:m,renewal:true});
  }
  const issued=await issueReceipt(client,{centerId:c,memberId:m,subscriptionId:p.contract.id,periodStart:p.review.periodStart,dueOn:p.review.today,uid:user.id,automatic:true});
  const receiptId=issued.receipt?.id||null;let payment=null;
  if(receiptId){const balance=await receiptBalance(client,c,m,receiptId);if(BigInt(balance.balanceMinor)>0n)payment=await appendPayment(client,{id:'pay_'+commandHash([c,m,p.month,'renewal']).slice(0,32),centerId:c,memberId:m,uid:user.id,amountMinor:balance.balanceMinor,currency:'EUR',paidOn:p.review.today,method:'cash',reference:null,allocations:[{receiptId,amountMinor:balance.balanceMinor}]})}
  const id='rn_'+commandHash([c,m,p.month]).slice(0,32);
  await client.query('INSERT INTO centers.renewals(id,center_id,member_id,subscription_id,renewal_month,period_start,period_end,receipt_id,payment_id,actor_uid) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,c,m,p.contract.id,p.month,p.review.periodStart,p.review.periodEnd,receiptId,payment?.id||null,user.id]);
  await businessAudit(client,c,user.id,operation,id,{memberId:m,receiptId,paymentId:payment?.id||null});
  const response={...p.review,id,receiptId,paymentId:payment?.id||null,alreadyCovered:false};await rememberCommand(client,c,user.id,operation,requestId,hash,response);checkSession();return response;
 },{platform});
}

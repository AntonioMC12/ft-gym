import {CentersError} from '../errors.js';
import {businessTransaction} from './context.js';
import {memberRecord} from './member-records.js';
import {subscriptionRows,subscriptionDto} from './subscriptions.js';
import {receiptPage} from './receipts.js';
import {paymentPage} from './payments.js';
import {debtPolicy} from '../domain/debt.js';

export const ownSubscriptionDto=value=>Object.fromEntries(['id','name','priceMinor','currency','intervalMonths','startsOn','effectiveEndsOn','billingDay','discountBasisPoints','status','priceIncludesTax','taxBasisPoints','proration'].map(key=>[key,value[key]]));
export const ownPaymentDto=row=>({id:row.id,amountMinor:row.amountMinor,currency:row.currency,paidOn:row.paidOn,method:row.method,
  allocations:row.allocations.map(a=>({receiptId:a.receiptId,periodStart:a.periodStart,periodEnd:a.periodEnd,amountMinor:a.amountMinor,refundedMinor:a.refundedMinor})),
  refunds:row.refunds.map(f=>({id:f.id,amountMinor:f.amountMinor,refundedOn:f.refundedOn})),refundsTruncated:row.refundsTruncated});
export function ownPortalOptions(params) {
  if([...params.keys()].some(key=>!['centerId','limit','cursor'].includes(key)))throw new CentersError(400,'invalid-input','own portal does not accept member or account identifiers');
}
async function ownMember(client,uid,centerId) {
  const {rows}=await client.query('SELECT id FROM centers.members WHERE center_id=$1 AND account_uid=$2',[centerId,uid]);
  if(!rows.length)throw new CentersError(404,'not-found','not found');return memberRecord(client,centerId,rows[0].id);
}
export function ownMembership(database,uid,centerId) {
  return businessTransaction(database,uid,centerId,'membership.own.read',async client=>{
    const member=await ownMember(client,uid,centerId),terms=await subscriptionRows(client,centerId,member.id,101);
    const {rows:centers}=await client.query('SELECT id,name,state,timezone,policy FROM centers.centers WHERE id=$1',[centerId]),center=centers[0],policy=debtPolicy(center.policy);
    const {rows}=await client.query(`WITH balances AS(SELECT r.due_on,r.total_minor
      -coalesce((SELECT sum(a.amount_minor) FROM centers.payment_allocations a WHERE a.center_id=r.center_id AND a.receipt_id=r.id),0)
      +coalesce((SELECT sum(f.amount_minor) FROM centers.refunds f WHERE f.center_id=r.center_id AND f.receipt_id=r.id),0) AS balance
      FROM centers.receipts r WHERE r.center_id=$1 AND r.member_id=$2)
      SELECT coalesce(sum(balance),0)::text AS outstanding,coalesce(sum(balance) FILTER(WHERE due_on<$3::date-$4::integer),0)::text AS overdue FROM balances`,[centerId,member.id,member.local_today,policy.graceDays]);
    return {center:{id:center.id,name:center.name,state:center.state,timezone:center.timezone},today:member.local_today,
      member:{id:member.id,name:member.name,number:member.member_number,state:member.state,joinedOn:member.joined_on,endsOn:member.ends_on},
      subscriptions:terms.slice(0,100).map(row=>ownSubscriptionDto(subscriptionDto(row,member))),subscriptionsTruncated:terms.length>100,
      summary:{outstandingMinor:rows[0].outstanding,overdueMinor:rows[0].overdue,currency:'EUR',policy}};
  },{allowInactive:true});
}
export function ownReceipts(database,uid,centerId,options) {
  return businessTransaction(database,uid,centerId,'receipts.own.read',async client=>{
    const member=await ownMember(client,uid,centerId);return receiptPage(client,uid,centerId,member.id,options,'own-receipts');
  },{allowInactive:true});
}
export function ownPayments(database,uid,centerId,options) {
  return businessTransaction(database,uid,centerId,'receipts.own.read',async client=>{
    const member=await ownMember(client,uid,centerId),page=await paymentPage(client,uid,centerId,member.id,options,'own-payments');return {...page,payments:page.payments.map(ownPaymentDto)};
  },{allowInactive:true});
}

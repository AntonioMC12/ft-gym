import {CentersError} from '../errors.js';
import {idField,objectBody} from '../domain/validation.js';
import {membershipDate} from '../domain/membership-transitions.js';
import {billingPeriodStartFor,billingPeriod} from '../domain/billing-calendar.js';
import {previewCharge} from '../domain/charge-preview.js';
import {businessTransaction} from './context.js';

// Also reusable inside the receipt transaction in C19: no nested connection, no HTTP fields trusted.
export async function previewForContract(client,centerId,memberId,id,requestedStart) {
  const {rows}=await client.query(`SELECT s.*,s.starts_on::text AS starts_on,s.ends_on::text AS ends_on,s.anchor_on::text AS anchor_on,
    (CURRENT_TIMESTAMP AT TIME ZONE s.timezone)::date::text AS local_today,m.state AS base_state,
    v.price_minor,v.currency,v.interval_months,v.price_includes_tax,v.tax_basis_points,v.proration
    FROM centers.subscriptions s JOIN centers.members m ON (m.center_id,m.id)=(s.center_id,s.member_id)
    JOIN centers.membership_plan_versions v ON (v.center_id,v.id)=(s.center_id,s.price_version_id)
    WHERE s.center_id=$1 AND s.member_id=$2 AND s.id=$3`,[centerId,memberId,id]);
  if(!rows.length)throw new CentersError(404,'not-found','not found');const row=rows[0];
  const subscription={id:row.id,priceVersionId:row.price_version_id,canceled:!!row.canceled_at,startsOn:row.starts_on,endsOn:row.ends_on,
    anchorOn:row.anchor_on,billingDay:row.billing_day,intervalMonths:row.interval_months,priceMinor:row.price_minor,currency:row.currency,
    discountBasisPoints:row.discount_basis_points,priceIncludesTax:row.price_includes_tax,taxBasisPoints:row.tax_basis_points,proration:row.proration};
  const start=requestedStart??billingPeriodStartFor(row.local_today,row.anchor_on,row.interval_months,row.billing_day),period=billingPeriod(start,subscription);
  // One state per civil day plus the latest prior state bounds work to <=367 events, regardless of audit size.
  const {rows:events}=await client.query(`SELECT * FROM (
    (SELECT to_state,effective_on::text AS effective_on,sequence FROM centers.membership_changes WHERE center_id=$1 AND member_id=$2 AND canceled_at IS NULL AND effective_on<$3::date ORDER BY effective_on DESC,sequence DESC LIMIT 1)
    UNION ALL
    (SELECT DISTINCT ON(h.effective_on) h.to_state,h.effective_on::text AS effective_on,h.sequence FROM centers.membership_changes h WHERE h.center_id=$1 AND h.member_id=$2 AND h.canceled_at IS NULL AND h.effective_on>=$3::date AND h.effective_on<$4::date ORDER BY h.effective_on,h.sequence DESC)
  ) states ORDER BY effective_on,sequence`,[centerId,memberId,start,period.end]);
  return previewCharge(subscription,start,{baseState:row.base_state,changes:events.map(event=>({effectiveOn:event.effective_on,toState:event.to_state,sequence:event.sequence}))});
}
export function previewBilling({database,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','memberId','id','periodStart']);const centerId=idField(raw.centerId),memberId=idField(raw.memberId),id=idField(raw.id),periodStart=raw.periodStart==null?undefined:membershipDate(raw.periodStart);
  return businessTransaction(database,user.id,centerId,'billing.read',async client=>{const quote=await previewForContract(client,centerId,memberId,id,periodStart);checkSession();return {quote};},{platform,allowInactive:platform});
}

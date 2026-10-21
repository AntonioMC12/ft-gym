import {CentersError} from '../errors.js';
import {isPlatformUser} from '../authz.js';
import {metricsDto} from '../domain/metrics.js';
import {businessTransaction} from './context.js';

// One statement means all stocks and flows use one MVCC snapshot and one captured
// instant. Each center uses its own local calendar; no private member rows leave SQL.
const query=`WITH capture AS(SELECT statement_timestamp() AS at),centers AS(
  SELECT c.id,c.timezone,(capture.at AT TIME ZONE c.timezone)::date AS today,
    CASE WHEN c.policy->'version'='1'::jsonb AND c.policy->'automaticSuspension'='false'::jsonb THEN
      CASE WHEN jsonb_typeof(c.policy->'graceDays')='number' THEN
        CASE WHEN (c.policy->>'graceDays')::numeric BETWEEN 0 AND 365 AND trunc((c.policy->>'graceDays')::numeric)=(c.policy->>'graceDays')::numeric
          THEN ((c.policy->>'graceDays')::numeric)::integer END END END AS grace_days
  FROM centers.centers c CROSS JOIN capture WHERE ($1::text IS NULL OR c.id=$1)
),bounds AS(
  SELECT coalesce(max(c.today),(capture.at AT TIME ZONE 'UTC')::date) AS latest_today,
    coalesce($3::date,coalesce(max(c.today),(capture.at AT TIME ZONE 'UTC')::date)) AS period_to,
    coalesce($2::date,date_trunc('month',coalesce(max(c.today),(capture.at AT TIME ZONE 'UTC')::date))::date) AS period_from
  FROM capture LEFT JOIN centers c ON true GROUP BY capture.at
),member_rows AS(
  SELECT m.id,m.center_id,m.joined_on,c.today,
    CASE WHEN coalesce(ending.effective_on,m.ends_on)<=c.today THEN 'ended' WHEN m.joined_on>c.today THEN 'preactive' ELSE coalesce(e.to_state,m.state) END AS state
  FROM centers.members m JOIN centers c ON c.id=m.center_id
  LEFT JOIN LATERAL(SELECT h.to_state FROM centers.membership_changes h WHERE h.center_id=m.center_id AND h.member_id=m.id AND h.canceled_at IS NULL AND h.effective_on<=c.today ORDER BY h.effective_on DESC,h.sequence DESC LIMIT 1)e ON true
  LEFT JOIN LATERAL(SELECT h.effective_on FROM centers.membership_changes h WHERE h.center_id=m.center_id AND h.member_id=m.id AND h.canceled_at IS NULL AND h.action='end' ORDER BY h.sequence DESC LIMIT 1)ending ON true
),allocated AS(
  SELECT a.center_id,a.receipt_id,sum(a.amount_minor) AS amount FROM centers.payment_allocations a JOIN centers c ON c.id=a.center_id GROUP BY a.center_id,a.receipt_id
),returned AS(
  SELECT f.center_id,f.receipt_id,sum(f.amount_minor) AS amount FROM centers.refunds f JOIN centers c ON c.id=f.center_id GROUP BY f.center_id,f.receipt_id
),balances AS(
  SELECT r.center_id,r.id,r.due_on,c.today,c.grace_days,r.total_minor-coalesce(a.amount,0)+coalesce(f.amount,0) AS balance
  FROM centers.receipts r JOIN centers c ON c.id=r.center_id LEFT JOIN allocated a ON a.center_id=r.center_id AND a.receipt_id=r.id LEFT JOIN returned f ON f.center_id=r.center_id AND f.receipt_id=r.id
),receipt_flow AS(
  SELECT count(*)::text AS count,coalesce(sum(r.total_minor),0) AS total FROM centers.receipts r JOIN centers c ON c.id=r.center_id CROSS JOIN bounds b
  WHERE (r.created_at AT TIME ZONE c.timezone)::date BETWEEN b.period_from AND b.period_to AND (r.created_at AT TIME ZONE c.timezone)::date<=c.today
),collection_flow AS(
  SELECT coalesce(sum(p.amount_minor),0) AS total FROM centers.payments p JOIN centers c ON c.id=p.center_id CROSS JOIN bounds b WHERE p.paid_on BETWEEN b.period_from AND b.period_to AND p.paid_on<=c.today
),refund_flow AS(
  SELECT coalesce(sum(f.amount_minor),0) AS total FROM centers.refunds f JOIN centers c ON c.id=f.center_id CROSS JOIN bounds b WHERE f.refunded_on BETWEEN b.period_from AND b.period_to AND f.refunded_on<=c.today
),events AS(
  SELECT count(DISTINCT (h.center_id,h.member_id)) FILTER(WHERE h.action='activate')::text AS activations,
    count(DISTINCT (h.center_id,h.member_id)) FILTER(WHERE h.action='end')::text AS terminations
  FROM centers.membership_changes h JOIN centers c ON c.id=h.center_id CROSS JOIN bounds b WHERE h.canceled_at IS NULL AND h.effective_on BETWEEN b.period_from AND b.period_to AND h.effective_on<=c.today
),visit_metrics AS(SELECT centers.visit_metrics($1,b.period_from,b.period_to) AS attendance FROM bounds b),logged AS(
  INSERT INTO centers.business_audit(center_id,actor_uid,action,target_id)
    SELECT c.id,$4,'metrics.global.read',c.id FROM centers c WHERE $5::boolean RETURNING id
)
SELECT capture.at AS captured_at,b.period_from::text,b.period_to::text,b.latest_today::text,
  (SELECT count(*)::text FROM centers) AS center_count,
  (SELECT count(*)::text FROM member_rows) AS members,
  (SELECT count(*) FILTER(WHERE state='active')::text FROM member_rows) AS active_members,
  (SELECT count(*) FILTER(WHERE state='frozen')::text FROM member_rows) AS frozen_members,
  (SELECT count(*) FILTER(WHERE state='ended')::text FROM member_rows) AS ended_members,
  (SELECT count(*) FILTER(WHERE state='preactive')::text FROM member_rows) AS preactive_members,
  (SELECT count(*)::text FROM centers.subscriptions s JOIN member_rows m ON m.center_id=s.center_id AND m.id=s.member_id WHERE s.canceled_at IS NULL AND s.starts_on<=m.today AND (s.ends_on IS NULL OR s.ends_on>m.today) AND m.state<>'ended') AS subscriptions,
  (SELECT count(*)::text FROM member_rows m WHERE m.joined_on BETWEEN b.period_from AND b.period_to AND m.joined_on<=m.today) AS registered_members,
  visit_metrics.attendance,
  events.activations,events.terminations,receipt_flow.count AS receipts_issued,receipt_flow.total::text AS receipt_total_minor,
  collection_flow.total::text AS collections_minor,refund_flow.total::text AS refunds_minor,(collection_flow.total-refund_flow.total)::text AS net_collections_minor,
  (SELECT coalesce(sum(balance) FILTER(WHERE balance>0),0)::text FROM balances) AS outstanding_minor,
  (SELECT coalesce(sum(balance) FILTER(WHERE balance>0 AND due_on<today-grace_days),0)::text FROM balances) AS overdue_minor,
  (SELECT count(DISTINCT center_id)::text FROM balances WHERE balance>0 AND grace_days IS NULL) AS incomplete_policies
FROM capture CROSS JOIN bounds b CROSS JOIN events CROSS JOIN receipt_flow CROSS JOIN collection_flow CROSS JOIN refund_flow CROSS JOIN visit_metrics`;

export function centerMetrics(database,uid,centerId,options,{platform=false}={}){
  return businessTransaction(database,uid,centerId,'billing.read',async client=>metricsDto((await client.query(query,[centerId,options.from,options.to,uid,false])).rows[0]),{platform,allowInactive:true});
}
export function globalMetrics(database,config,user,options){
  if(!isPlatformUser(config,user))throw new CentersError(403,'forbidden','forbidden');
  return database.platformTransaction(user.id,async client=>metricsDto((await client.query(query,[null,options.from,options.to,user.id,true])).rows[0]));
}

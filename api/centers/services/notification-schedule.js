import {debtPolicy} from '../domain/debt.js';
import {commandHash} from './commands.js';
const balance=`r.total_minor-coalesce((SELECT sum(a.amount_minor) FROM centers.payment_allocations a WHERE a.center_id=r.center_id AND a.receipt_id=r.id),0)
  +coalesce((SELECT sum(f.amount_minor) FROM centers.refunds f WHERE f.center_id=r.center_id AND f.receipt_id=r.id),0)`;
const contacts=`JOIN centers.members m ON (m.center_id,m.id)=(r.center_id,r.member_id)
  JOIN centers.notification_contacts n ON n.center_id=m.center_id AND n.member_id=m.id AND n.account_uid=m.account_uid AND n.enabled AND n.verified_at IS NOT NULL`;
export async function noticeContext(client,centerId) {
  const {rows}=await client.query(`SELECT p.*,c.policy,(statement_timestamp() AT TIME ZONE c.timezone)::date::text AS today,
    ((statement_timestamp() AT TIME ZONE c.timezone)::date - mod((statement_timestamp() AT TIME ZONE c.timezone)::date-date '1970-01-01',p.debt_repeat_days))::text AS debt_window
    FROM centers.notification_policies p JOIN centers.centers c ON c.id=p.center_id WHERE p.center_id=$1 AND p.enabled AND c.state='active'`,[centerId]);return rows[0];
}
export async function scheduleReminders(client,centerId) {
  const policy=await noticeContext(client,centerId);if(!policy)return;
  const {graceDays}=debtPolicy(policy.policy);
  const due=(await client.query(`SELECT DISTINCT ON(r.member_id,r.due_on) r.id,r.member_id,r.due_on::text,n.account_uid,n.version
    FROM centers.receipts r ${contacts} WHERE r.center_id=$1 AND r.due_on BETWEEN $2::date AND $2::date+$3::integer AND (${balance})>0
    AND NOT EXISTS(SELECT 1 FROM centers.notification_deliveries d WHERE d.center_id=r.center_id AND d.kind='due' AND d.event_key=r.member_id||':'||r.due_on::text)
    ORDER BY r.member_id,r.due_on,r.id LIMIT 25`,[centerId,policy.today,policy.due_lead_days])).rows;
  const debt=(await client.query(`SELECT DISTINCT ON(r.member_id) r.id,r.member_id,n.account_uid,n.version
    FROM centers.receipts r ${contacts} WHERE r.center_id=$1 AND r.due_on<$2::date-$3::integer AND (${balance})>0
    AND NOT EXISTS(SELECT 1 FROM centers.notification_deliveries d WHERE d.center_id=r.center_id AND d.kind='debt' AND d.event_key=r.member_id||':'||$4::text)
    ORDER BY r.member_id,r.due_on,r.id LIMIT 25`,[centerId,policy.today,graceDays,policy.debt_window])).rows;
  const price=(await client.query(`SELECT s.id,s.member_id,s.notice_days,n.account_uid,n.version FROM centers.subscriptions s
    JOIN centers.members m ON (m.center_id,m.id)=(s.center_id,s.member_id)
    JOIN centers.notification_contacts n ON n.center_id=m.center_id AND n.member_id=m.id AND n.account_uid=m.account_uid AND n.enabled AND n.verified_at IS NOT NULL
    JOIN centers.notification_policies p ON p.center_id=s.center_id
    WHERE s.center_id=$1 AND s.replaces_id IS NOT NULL AND s.notice_days IS NOT NULL AND s.canceled_at IS NULL AND s.created_at>=n.verified_at AND s.created_at>=p.enabled_since
    AND NOT EXISTS(SELECT 1 FROM centers.notification_deliveries d WHERE d.center_id=s.center_id AND d.kind='price' AND d.event_key=s.id)
    ORDER BY s.created_at,s.id LIMIT 25`,[centerId])).rows;
  const insert=async(kind,row,key,payload)=>client.query(`INSERT INTO centers.notification_deliveries(id,center_id,member_id,account_uid,contact_version,kind,event_key,receipt_id,subscription_id,payload)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,['nd_'+commandHash([centerId,kind,key]).slice(0,32),centerId,row.member_id,row.account_uid,row.version,kind,key,kind==='price'?null:row.id,kind==='price'?row.id:null,JSON.stringify(payload)]);
  for(const row of due)await insert('due',row,row.member_id+':'+row.due_on,{dueOn:row.due_on});
  for(const row of debt)await insert('debt',row,row.member_id+':'+policy.debt_window,{window:policy.debt_window});
  for(const row of price)await insert('price',row,row.id,{noticeDays:row.notice_days});
}
export async function noticeDisposition(client,delivery) {
  if(!['due','debt','price'].includes(delivery.kind))return 'send';
  const policy=await noticeContext(client,delivery.center_id);if(!policy)return 'skip';
  if(delivery.kind==='price'){
    const {rows}=await client.query('SELECT canceled_at,starts_on>=$3::date+$4::integer AS timely FROM centers.subscriptions WHERE center_id=$1 AND id=$2',[delivery.center_id,delivery.subscription_id,policy.today,delivery.payload.noticeDays]);
    return !rows.length||rows[0].canceled_at?'skip':rows[0].timely?'send':'blocked';
  }
  const {graceDays}=debtPolicy(policy.policy);
  if(delivery.kind==='debt'&&delivery.payload.window!==policy.debt_window)return 'skip';
  const dateCondition=delivery.kind==='due'?'r.due_on=$4::date AND r.due_on BETWEEN $3::date AND $3::date+$5::integer':'r.due_on<$3::date-$4::integer';
  const params=delivery.kind==='due'?[delivery.center_id,delivery.member_id,policy.today,delivery.payload.dueOn,policy.due_lead_days]:[delivery.center_id,delivery.member_id,policy.today,graceDays];
  const {rows}=await client.query(`SELECT EXISTS(SELECT 1 FROM centers.receipts r WHERE r.center_id=$1 AND r.member_id=$2 AND ${dateCondition} AND (${balance})>0) AS needed`,params);
  return rows[0].needed?'send':'skip';
}

import {CentersError} from '../errors.js';
import {membershipDate} from '../domain/membership-transitions.js';
import {debtPolicy,debtState,debtCsv} from '../domain/debt.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';
import {businessTransaction} from './context.js';
import {businessAudit} from './commands.js';

export function debtListOptions(params,{calendar=false,exporting=false}={}) {
  const limit=Number(params.get('limit')||30),cursor=params.get('cursor')||null;
  const from=params.get('dueFrom')?membershipDate(params.get('dueFrom')):null,to=params.get('dueTo')?membershipDate(params.get('dueTo')):null;
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||cursor?.length>1024||!!from!==!!to||from&&from>to||from&&(Date.parse(to)-Date.parse(from))/86400000>366||exporting&&cursor)throw new CentersError(400,'invalid-input','invalid debt filters');
  return {limit,cursor,from,to,calendar};
}
const ledger=`WITH allocated AS (SELECT receipt_id,sum(amount_minor) AS amount FROM centers.payment_allocations WHERE center_id=$1 GROUP BY receipt_id),
  returned AS (SELECT receipt_id,sum(amount_minor) AS amount FROM centers.refunds WHERE center_id=$1 GROUP BY receipt_id),
  debt AS (SELECT r.id,r.center_id,r.member_id,m.member_number,m.name,r.period_start,r.period_end,r.due_on,r.currency,r.total_minor,
    coalesce(a.amount,0)-coalesce(f.amount,0) AS paid,coalesce(f.amount,0) AS refunded,
    r.total_minor-coalesce(a.amount,0)+coalesce(f.amount,0) AS balance
    FROM centers.receipts r JOIN centers.members m ON m.center_id=r.center_id AND m.id=r.member_id
    LEFT JOIN allocated a ON a.receipt_id=r.id LEFT JOIN returned f ON f.receipt_id=r.id WHERE r.center_id=$1)
  `;
const filtered=' FROM debt WHERE ($2::date IS NULL OR due_on BETWEEN $2::date AND $3::date) AND ($4::boolean OR balance>0)';
const projection="id,center_id,member_id,member_number,name,period_start::text,period_end::text,due_on::text,currency,total_minor,paid::text,refunded::text,balance::text,(due_on::timestamp AT TIME ZONE 'UTC')::text AS cursor_at";
const dto=(row,today,policy)=>({id:row.id,centerId:row.center_id,memberId:row.member_id,memberNumber:row.member_number,memberName:row.name,periodStart:row.period_start,periodEnd:row.period_end,dueOn:row.due_on,currency:row.currency,totalMinor:row.total_minor,paidMinor:row.paid,refundedMinor:row.refunded,balanceMinor:row.balance,debt:debtState(row.balance,row.due_on,today,policy.graceDays)});
async function policyContext(client,centerId,options) {
  const {rows}=await client.query("SELECT policy,(statement_timestamp() AT TIME ZONE timezone)::date::text AS today FROM centers.centers WHERE id=$1",[centerId]);
  const policy=debtPolicy(rows[0].policy),today=rows[0].today;
  let {from,to}=options;
  if(options.calendar&&!from){from=today.slice(0,7)+'-01';const date=new Date(from+'T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);to=date.toISOString().slice(0,10)}
  return {policy,today,from,to};
}
export function listDebt(database,uid,centerId,options,{platform=false}={}) {
  return businessTransaction(database,uid,centerId,'billing.read',async client=>{
    const context=await policyContext(client,centerId,options),{from,to,today,policy}=context;
    const scope=cursorScope(['debt',uid,centerId,options.calendar,from,to,today,policy]),after=readCursor(options.cursor,scope),values=[centerId,from,to,options.calendar];
    const {rows:summary}=await client.query(ledger+`SELECT count(*)::integer AS count,coalesce(sum(balance),0)::text AS outstanding,
      coalesce(sum(balance) FILTER(WHERE due_on<$5::date-$6::integer),0)::text AS overdue`+filtered,[...values,today,policy.graceDays]);
    const {rows}=await client.query(ledger+'SELECT '+projection+filtered+" AND ($5::timestamptz IS NULL OR (due_on,id)>(($5::timestamptz AT TIME ZONE 'UTC')::date,$6::text)) ORDER BY due_on,id LIMIT $7",[...values,after?.at||null,after?.id||null,options.limit+1]);
    const page=rows.slice(0,options.limit);
    return {today,policy,dueFrom:from,dueTo:to,summary:{receiptCount:summary[0].count,outstandingMinor:summary[0].outstanding,overdueMinor:summary[0].overdue,currency:'EUR'},receipts:page.map(row=>dto(row,today,policy)),nextCursor:rows.length>options.limit?nextCursor(scope,page.at(-1)):null};
  },{platform,allowInactive:platform});
}
export function exportDebt(database,uid,centerId,options,{platform=false}={}) {
  return businessTransaction(database,uid,centerId,'data.export',async client=>{
    const {today,policy,from,to}=await policyContext(client,centerId,{...options,calendar:false});
    const {rows}=await client.query(ledger+'SELECT '+projection+filtered+' ORDER BY due_on,id LIMIT 5001',[centerId,from,to,false]);
    if(rows.length>5000)throw new CentersError(409,'export-too-large','narrow the debt export date range');
    const receipts=rows.map(row=>dto(row,today,policy));
    await businessAudit(client,centerId,uid,'debt.exported',centerId,{count:rows.length,from,to});
    return {fileName:'centers-debt-'+centerId+'-'+today+'.csv',content:debtCsv(receipts),rowCount:rows.length,today,currency:'EUR'};
  },{platform,allowInactive:platform});
}

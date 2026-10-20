import {CentersError} from '../errors.js';
import {objectBody,idField,requestField} from '../domain/validation.js';
import {membershipReceiptDueOn} from '../domain/billing-calendar.js';
import {membershipDate} from '../domain/membership-transitions.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';
import {businessTransaction} from './context.js';
import {memberRecord} from './member-records.js';
import {previewForContract} from './billing-preview.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
import {receiptBalance} from './payments.js';

const projection='id,center_id,member_id,subscription_id,concept,period_start::text,period_end::text,due_on::text,currency,net_minor,tax_minor,total_minor,snapshot,created_at::text AS cursor_at';
const dto=row=>({id:row.id,centerId:row.center_id,memberId:row.member_id,subscriptionId:row.subscription_id,concept:row.concept,
  periodStart:row.period_start,periodEnd:row.period_end,dueOn:row.due_on,currency:row.currency,netMinor:row.net_minor,taxMinor:row.tax_minor,totalMinor:row.total_minor,snapshot:row.snapshot});
// Runs inside the caller's center lock/transaction. The scheduler shares the exact
// calendar, historical membership and natural receipt key with manual issuance.
export async function issueReceipt(client,{centerId,memberId,subscriptionId,periodStart,dueOn,uid,expectedQuoteHash=null,automatic=false}) {
  // Caller dates are legacy input only; new membership receipts always use the fixed rule.
  dueOn=membershipReceiptDueOn(periodStart);
  const member=await memberRecord(client,centerId,memberId);
  if(periodStart>member.local_today)throw new CentersError(400,'invalid-input','future receipt period');
  const {rows:existing}=await client.query(`SELECT ${projection} FROM centers.receipts WHERE center_id=$1 AND member_id=$2 AND subscription_id=$3 AND period_start=$4 AND concept='membership'`,[centerId,memberId,subscriptionId,periodStart]);
  if(existing.length){
    return {receipt:dto(existing[0]),alreadyExists:true};
  }
  const quote=await previewForContract(client,centerId,memberId,subscriptionId,periodStart);
  if(expectedQuoteHash!==null&&expectedQuoteHash!==commandHash(quote))throw new CentersError(409,'quote-changed','reload the charge preview');
  if(quote.totalMinor==='0')return {skipped:true,reason:'no-charge',subscriptionId,periodStart};
  const id='rc_'+commandHash([centerId,subscriptionId,periodStart,'membership']).slice(0,32),snapshot={...quote,memberNumber:member.member_number,memberName:member.name};
  const {rows}=await client.query(`INSERT INTO centers.receipts(id,center_id,member_id,subscription_id,period_start,period_end,due_on,currency,net_minor,tax_minor,total_minor,snapshot,actor_uid)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${projection}`,[id,centerId,memberId,subscriptionId,periodStart,quote.periodEnd,dueOn,quote.currency,quote.netMinor,quote.taxMinor,quote.totalMinor,JSON.stringify(snapshot),uid]);
  await businessAudit(client,centerId,uid,'receipt.created',id,{memberId,subscriptionId,periodStart,automatic});
  await client.query(`INSERT INTO centers.outbox(id,center_id,receipt_id,kind,payload) VALUES($1,$2,$3,'receipt.created',$4) ON CONFLICT DO NOTHING`,['ob_'+commandHash([centerId,id,'receipt.created']).slice(0,32),centerId,id,JSON.stringify({receiptId:id})]);
  return {receipt:dto(rows[0])};
}
export function generateReceipt({database,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','memberId','subscriptionId','periodStart','dueOn','requestId','expectedQuoteHash']);
  const centerId=idField(raw.centerId),memberId=idField(raw.memberId),subscriptionId=idField(raw.subscriptionId),periodStart=membershipDate(raw.periodStart),dueOn=raw.dueOn==null?membershipReceiptDueOn(periodStart):membershipDate(raw.dueOn),requestId=requestField(raw.requestId);
  if(dueOn<periodStart)throw new CentersError(400,'invalid-input','due date before period');
  const expectedQuoteHash=raw.expectedQuoteHash??null;
  if(expectedQuoteHash!==null&&(typeof expectedQuoteHash!=='string'||!/^[a-f0-9]{64}$/.test(expectedQuoteHash)))throw new CentersError(400,'invalid-input','invalid quote digest');
  const operation='receipt.generate',hash=commandHash({memberId,subscriptionId,periodStart,dueOn,expectedQuoteHash});
  return businessTransaction(database,user.id,centerId,'billing.manage',async(client,scope)=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const response=await issueReceipt(client,{centerId,memberId,subscriptionId,periodStart,dueOn,uid:user.id,expectedQuoteHash});
    await rememberCommand(client,centerId,user.id,operation,requestId,hash,response);checkSession();return response;
  },{platform});
}
export function receiptListOptions(params) {
  const limit=Number(params.get('limit')||30),cursor=params.get('cursor')||null;
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||cursor?.length>1024)throw new CentersError(400,'invalid-input','invalid receipt pagination');return {limit,cursor};
}
export function listReceipts(database,uid,centerId,memberId,{limit,cursor},{platform=false}={}) {
  return businessTransaction(database,uid,centerId,'billing.read',client=>receiptPage(client,uid,centerId,memberId,{limit,cursor}),{platform,allowInactive:platform});
}
export async function receiptPage(client,uid,centerId,memberId,{limit,cursor},kind='receipts') {
  const scope=cursorScope([kind,uid,centerId,memberId]),after=readCursor(cursor,scope);
    await memberRecord(client,centerId,memberId);
    const {rows}=await client.query(`SELECT ${projection} FROM centers.receipts WHERE center_id=$1 AND member_id=$2 AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::text)) ORDER BY created_at DESC,id DESC LIMIT $5`,[centerId,memberId,after?.at||null,after?.id||null,limit+1]);
    const page=rows.slice(0,limit),receipts=[];
    for(const row of page)receipts.push({...dto(row),settlement:await receiptBalance(client,centerId,memberId,row.id)});
    return {receipts,nextCursor:rows.length>limit?nextCursor(scope,page.at(-1)):null};
}

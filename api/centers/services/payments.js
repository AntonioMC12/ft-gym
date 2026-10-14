import {CentersError} from '../errors.js';
import {paymentInput,refundInput} from '../domain/payments.js';
import {idField,objectBody,versionField,requestField} from '../domain/validation.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';
import {businessTransaction} from './context.js';
import {memberRecord} from './member-records.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';

const missing=()=>{throw new CentersError(404,'not-found','not found')};
const conflict=code=>{throw new CentersError(409,code,'reload the ledger before recording this movement')};
export async function receiptBalance(client,centerId,memberId,receiptId) {
  const {rows}=await client.query(`SELECT r.id,r.currency,r.total_minor,
    coalesce((SELECT sum(a.amount_minor) FROM centers.payment_allocations a WHERE a.center_id=r.center_id AND a.receipt_id=r.id),0)::text AS allocated,
    coalesce((SELECT sum(f.amount_minor) FROM centers.refunds f WHERE f.center_id=r.center_id AND f.receipt_id=r.id),0)::text AS refunded
    FROM centers.receipts r WHERE r.center_id=$1 AND r.member_id=$2 AND r.id=$3`,[centerId,memberId,receiptId]);
  if(!rows.length)missing();const row=rows[0],paid=BigInt(row.allocated)-BigInt(row.refunded),balance=BigInt(row.total_minor)-paid;
  return {receiptId:row.id,currency:row.currency,totalMinor:row.total_minor,paidMinor:paid.toString(),refundedMinor:row.refunded,balanceMinor:balance.toString(),status:balance===0n?'paid':paid===0n?'unpaid':'partial'};
}
const paymentDto=row=>({id:row.id,centerId:row.center_id,memberId:row.member_id,amountMinor:row.amount_minor,currency:row.currency,paidOn:row.paid_on,method:row.method,reference:row.reference});
const refundDto=row=>({id:row.id,paymentId:row.payment_id,receiptId:row.receipt_id,amountMinor:row.amount_minor,refundedOn:row.refunded_on,reason:row.reason});
async function paymentDetail(client,centerId,memberId,id) {
  const {rows}=await client.query('SELECT *,paid_on::text FROM centers.payments WHERE center_id=$1 AND member_id=$2 AND id=$3',[centerId,memberId,id]);if(!rows.length)missing();
  const {rows:allocations}=await client.query(`SELECT a.receipt_id,a.amount_minor,r.period_start::text,r.period_end::text,
    coalesce((SELECT sum(f.amount_minor) FROM centers.refunds f WHERE f.center_id=a.center_id AND f.payment_id=a.payment_id AND f.receipt_id=a.receipt_id),0)::text AS refunded
    FROM centers.payment_allocations a JOIN centers.receipts r ON r.center_id=a.center_id AND r.id=a.receipt_id WHERE a.center_id=$1 AND a.payment_id=$2 ORDER BY a.receipt_id`,[centerId,id]);
  const {rows:refunds}=await client.query('SELECT *,refunded_on::text FROM centers.refunds WHERE center_id=$1 AND payment_id=$2 ORDER BY created_at DESC,id DESC LIMIT 101',[centerId,id]);
  return {...paymentDto(rows[0]),allocations:allocations.map(a=>({receiptId:a.receipt_id,periodStart:a.period_start,periodEnd:a.period_end,amountMinor:a.amount_minor,refundedMinor:a.refunded,refundableMinor:(BigInt(a.amount_minor)-BigInt(a.refunded)).toString()})),refunds:refunds.slice(0,100).map(refundDto),refundsTruncated:refunds.length>100};
}
// Shared atomic append for already-authorized services. Gateway callers must use
// the SQL-reserved payment ID; no browser payload can opt out of reservations.
export async function appendPayment(client,{id,centerId,memberId,uid,...body},{reservedAttemptId=null}={}) {
  const input=paymentInput({centerId,memberId,...body,requestId:id});
  const member=await memberRecord(client,centerId,memberId);if(input.paidOn>member.local_today)throw new CentersError(400,'invalid-input','future payment');
  const {rows:reserved}=await client.query("SELECT id,reserved_payment_id FROM centers.stripe_attempts WHERE center_id=$1 AND receipt_id=ANY($2::text[]) AND state IN ('creating','open','review')",[centerId,input.allocations.map(value=>value.receiptId)]);
  if(reserved.some(row=>row.id!==reservedAttemptId||row.reserved_payment_id!==id))throw new CentersError(409,'checkout-pending','receipt has an active checkout');
  if(reservedAttemptId&&!reserved.some(row=>row.id===reservedAttemptId&&row.reserved_payment_id===id))throw new CentersError(409,'stripe-reservation-missing','gateway reservation requires review');
  for(const allocation of input.allocations){const balance=await receiptBalance(client,centerId,memberId,allocation.receiptId);if(balance.currency!==input.currency||BigInt(allocation.amountMinor)>BigInt(balance.balanceMinor))conflict('payment-exceeds-balance');}
  await client.query('INSERT INTO centers.payments(id,center_id,member_id,amount_minor,currency,paid_on,method,reference,actor_uid) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,centerId,memberId,input.amountMinor,input.currency,input.paidOn,input.method,input.reference,uid]);
  for(const a of input.allocations)await client.query('INSERT INTO centers.payment_allocations(center_id,member_id,payment_id,receipt_id,amount_minor,actor_uid) VALUES($1,$2,$3,$4,$5,$6)',[centerId,memberId,id,a.receiptId,a.amountMinor,uid]);
  await businessAudit(client,centerId,uid,'payment.recorded',id,{memberId,receiptIds:input.allocations.map(a=>a.receiptId)});
  return paymentDetail(client,centerId,memberId,id);
}
export function recordPayment({database,user,checkSession},raw,{platform=false}={}) {
  const input=paymentInput(raw),{centerId,memberId,requestId,...body}=input,hash=commandHash({memberId,...body}),operation='payment.record';
  return businessTransaction(database,user.id,centerId,'payments.record',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const id='pay_'+commandHash([centerId,user.id,requestId]).slice(0,32);checkSession();
    const response={payment:await appendPayment(client,{id,centerId,memberId,uid:user.id,...body})};await rememberCommand(client,centerId,user.id,operation,requestId,hash,response);checkSession();return response;
  },{platform});
}
export function recordRefund({database,user,checkSession},raw,{platform=false}={}) {
  const input=refundInput(raw),{centerId,memberId,requestId,...body}=input,hash=commandHash({memberId,...body}),operation='payment.refund';
  return businessTransaction(database,user.id,centerId,'payments.refund',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const member=await memberRecord(client,centerId,memberId),payment=await paymentDetail(client,centerId,memberId,input.paymentId),allocation=payment.allocations.find(a=>a.receiptId===input.receiptId);
    if(!allocation)missing();if(input.refundedOn<payment.paidOn||input.refundedOn>member.local_today)throw new CentersError(400,'invalid-input','invalid refund date');
    if(BigInt(input.amountMinor)>BigInt(allocation.refundableMinor))conflict('refund-exceeds-payment');
    const id='ref_'+commandHash([centerId,user.id,requestId]).slice(0,32);checkSession();
    await client.query('INSERT INTO centers.refunds(id,center_id,member_id,payment_id,receipt_id,amount_minor,refunded_on,reason,actor_uid) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,centerId,memberId,input.paymentId,input.receiptId,input.amountMinor,input.refundedOn,input.reason,user.id]);
    await businessAudit(client,centerId,user.id,'payment.refunded',id,{memberId,paymentId:input.paymentId,receiptId:input.receiptId});
    const response={payment:await paymentDetail(client,centerId,memberId,input.paymentId),balance:await receiptBalance(client,centerId,memberId,input.receiptId)};
    await rememberCommand(client,centerId,user.id,operation,requestId,hash,response);checkSession();return response;
  },{platform});
}
export function listPayments(database,uid,centerId,memberId,{limit,cursor},{platform=false}={}) {
  return businessTransaction(database,uid,centerId,'billing.read',client=>paymentPage(client,uid,centerId,memberId,{limit,cursor}),{platform,allowInactive:platform});
}
export async function paymentPage(client,uid,centerId,memberId,{limit,cursor},kind='payments') {
  const scope=cursorScope([kind,uid,centerId,memberId]),after=readCursor(cursor,scope);
    await memberRecord(client,centerId,memberId);
    const {rows}=await client.query('SELECT id,created_at::text AS cursor_at FROM centers.payments WHERE center_id=$1 AND member_id=$2 AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::text)) ORDER BY created_at DESC,id DESC LIMIT $5',[centerId,memberId,after?.at||null,after?.id||null,limit+1]);
    const page=rows.slice(0,limit),payments=[];for(const row of page)payments.push(await paymentDetail(client,centerId,memberId,row.id));
    return {payments,nextCursor:rows.length>limit?nextCursor(scope,page.at(-1)):null};
}
export function updateRefundCapability({database,user,checkSession},raw) {
  objectBody(raw,['centerId','assignmentId','version','allowRefund','allowExport','requestId']);
  const centerId=idField(raw.centerId),assignmentId=idField(raw.assignmentId),version=versionField(raw.version),requestId=requestField(raw.requestId);
  const grantField=Object.hasOwn(raw,'allowRefund')?'allowRefund':'allowExport',capability=grantField==='allowRefund'?'payments.refund':'data.export',allowed=raw[grantField];
  if(typeof allowed!=='boolean'||Object.hasOwn(raw,'allowRefund')&&Object.hasOwn(raw,'allowExport'))throw new CentersError(400,'invalid-input','exactly one boolean grant required');
  const hash=commandHash({assignmentId,version,[grantField]:allowed}),operation=grantField==='allowRefund'?'role.refund-grant':'role.export-grant';
  return database.platformTransaction(user.id,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:' || $1))",[centerId]);
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const {rows}=await client.query("SELECT version,extra_capabilities FROM centers.role_assignments WHERE center_id=$1 AND id=$2 AND role='manager' AND revoked_at IS NULL AND valid_from<=CURRENT_TIMESTAMP AND (valid_until IS NULL OR valid_until>CURRENT_TIMESTAMP) FOR UPDATE",[centerId,assignmentId]);
    if(!rows.length)missing();if(rows[0].version!==version)conflict('version-conflict');
    const extras=rows[0].extra_capabilities.filter(c=>c!==capability);if(allowed)extras.push(capability);checkSession();
    await client.query('UPDATE centers.role_assignments SET extra_capabilities=$3,version=version+1 WHERE center_id=$1 AND id=$2',[centerId,assignmentId,extras]);
    await client.query('UPDATE centers.centers SET version=version+1,updated_at=now() WHERE id=$1',[centerId]);
    await businessAudit(client,centerId,user.id,operation,assignmentId,{allowed});
    const result={ok:true,version:version+1};await rememberCommand(client,centerId,user.id,operation,requestId,hash,result);checkSession();return result;
  },centerId);
}

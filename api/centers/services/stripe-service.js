import {CentersError} from '../errors.js';
import {objectBody,idField,requestField} from '../domain/validation.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';
import {stripeProfileFor} from '../stripe-config.js';
import {businessTransaction} from './context.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
import {prepareStripeAttempt} from './stripe-foundation.js';
import {claimStripeAttempt,runClaimedStripeAttempt} from './stripe-worker.js';
import {safeStripeCheckoutUrl} from './stripe-client.js';

const missing=()=>{throw new CentersError(404,'not-found','not found')};
export function stripeListOptions(params,{own=false}={}) {
  const allowed=['centerId','receiptId','attemptId','limit','cursor',...(own?[]:['memberId'])];
  if([...params.keys()].some(key=>!allowed.includes(key)))throw new CentersError(400,'invalid-input','invalid gateway selectors');
  const limit=Number(params.get('limit')||30),cursor=params.get('cursor')||null;
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||cursor?.length>1024)throw new CentersError(400,'invalid-input','invalid gateway page');
  const result={limit,cursor};for(const key of ['receiptId','attemptId',...(own?[]:['memberId'])])if(params.has(key))result[key]=idField(params.get(key));return result;
}
async function ownMemberId(client,uid,centerId){return (await client.query('SELECT id FROM centers.members WHERE center_id=$1 AND account_uid=$2',[centerId,uid])).rows[0]?.id||missing()}
async function stripeMode(client,config,centerId){return config.enabled&&stripeProfileFor(config,centerId)&&(await client.query('SELECT kind FROM centers.environment WHERE singleton')).rows[0]?.kind==='test'?'test':'off'}
function attemptDto(row,uid,{own,mode,canOpen}) {
  let checkoutUrl=null;
  if(canOpen&&mode==='test'&&row.state==='open'&&row.actor_uid===uid&&(!own||row.audience==='own')&&Date.parse(row.expires_at)>Date.now()&&row.checkout_url){try{checkoutUrl=safeStripeCheckoutUrl(row.checkout_url)}catch{}}
  const dto={id:row.id,receiptId:row.receipt_id,state:row.state,amountMinor:row.amount_minor,currency:row.currency,createdAt:row.created_at,expiresAt:row.expires_at,receivedMinor:row.received_minor,paymentId:row.payment_id,checkoutUrl};
  return own?dto:{...dto,memberId:row.member_id,errorCode:row.error_code};
}
export function stripeStatus(database,uid,config,centerId,{limit=30,cursor=null,memberId=null,receiptId=null,attemptId=null}={}, {platform=false,own=false}={}) {
  return businessTransaction(database,uid,centerId,own?'receipts.own.read':'billing.read',async(client,context)=>{
    if(own)memberId=await ownMemberId(client,uid,centerId);
    const mode=await stripeMode(client,config,centerId),scope=cursorScope(['stripe',own,uid,centerId,memberId,receiptId,attemptId]),after=readCursor(cursor,scope);
    if(receiptId&&!(await client.query('SELECT id FROM centers.receipts WHERE center_id=$1 AND id=$2 AND ($3::text IS NULL OR member_id=$3)',[centerId,receiptId,memberId])).rows.length)missing();
    const {rows}=await client.query(`SELECT *,created_at::text AS cursor_at FROM centers.stripe_attempts WHERE center_id=$1
      AND ($2::text IS NULL OR member_id=$2) AND ($3::text IS NULL OR receipt_id=$3) AND ($4::text IS NULL OR id=$4)
      AND ($5::timestamptz IS NULL OR (created_at,id)<($5::timestamptz,$6::text)) ORDER BY created_at DESC,id DESC LIMIT $7`,[centerId,memberId,receiptId,attemptId,after?.at||null,after?.id||null,limit+1]);
    if(attemptId&&!rows.length)missing();
    const {rows:reservations}=await client.query("SELECT EXISTS(SELECT 1 FROM centers.stripe_attempts WHERE center_id=$1 AND ($2::text IS NULL OR member_id=$2) AND ($3::text IS NULL OR receipt_id=$3) AND state IN ('creating','open','review')) AS reserved",[centerId,memberId,receiptId||(attemptId?rows[0].receipt_id:null)]);
    const canOpen=context.center.state==='active'&&context.capabilities.includes(own?'payments.own.create':'payments.record'),page=rows.slice(0,limit);return {mode,workerEnabled:!!config.jobsEnabled,hasReservation:reservations[0].reserved,attempts:page.map(row=>attemptDto(row,uid,{own,mode,canOpen})),nextCursor:rows.length>limit?nextCursor(scope,page.at(-1)):null};
  },{platform,allowInactive:true});
}
export async function checkoutStripe(context,raw,{platform=false,own=false,workerOptions={}}={}) {
  if(typeof raw?.expectedBalanceMinor!=='string')throw new CentersError(400,'invalid-input','expected balance assertion required');
  const prepared=await prepareStripeAttempt(context,raw,{platform,own});context.checkSession();
  const claim=await claimStripeAttempt(context.database,context.config,raw.centerId,{attemptId:prepared.attemptId});
  if(claim)await runClaimedStripeAttempt(context.database,context.config,claim,workerOptions);
  context.checkSession();
  // Reauthorize after the network boundary. An old role/link may not receive a URL.
  return stripeStatus(context.database,context.user.id,context.config,raw.centerId,{attemptId:prepared.attemptId},{platform,own});
}
export async function reconcileStripe(context,raw,{platform=false,workerOptions={}}={}) {
  objectBody(raw,['centerId','id','requestId']);const centerId=idField(raw.centerId),id=idField(raw.id),requestId=requestField(raw.requestId),operation='stripe.reconcile',hash=commandHash({id});
  const result=await businessTransaction(context.database,context.user.id,centerId,'payments.record',async client=>{
    if(await stripeMode(client,context.config,centerId)!=='test')throw new CentersError(503,'stripe-unavailable','test gateway is unavailable');
    const replay=await commandReplay(client,centerId,context.user.id,operation,requestId,hash);if(replay)return replay;
    if(!(await client.query('SELECT id FROM centers.stripe_attempts WHERE center_id=$1 AND id=$2',[centerId,id])).rows.length)missing();
    await client.query('INSERT INTO centers.stripe_reconcile_requests(center_id,attempt_id,requested_by) VALUES($1,$2,$3) ON CONFLICT(center_id,attempt_id) DO UPDATE SET requested_by=EXCLUDED.requested_by,requested_at=now()',[centerId,id,context.user.id]);
    const response={attemptId:id,queued:true};await rememberCommand(client,centerId,context.user.id,operation,requestId,hash,response);await businessAudit(client,centerId,context.user.id,operation,id);context.checkSession();return response;
  },{platform,allowInactive:true});
  context.checkSession();const claim=await claimStripeAttempt(context.database,context.config,centerId,{attemptId:result.attemptId});
  if(claim)await runClaimedStripeAttempt(context.database,context.config,claim,workerOptions);context.checkSession();
  return stripeStatus(context.database,context.user.id,context.config,centerId,{attemptId:id},{platform});
}

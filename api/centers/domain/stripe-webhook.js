import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
import {CentersError} from '../errors.js';
import {STRIPE_API_VERSION} from '../stripe-config.js';
const invalid=()=>{throw new CentersError(400,'stripe-signature-invalid','invalid gateway signature or event')};
export const stripeBodyHash=raw=>createHash('sha256').update(raw).digest('hex');
export function verifyStripeEvent(raw,header,secrets,{now=Math.floor(Date.now()/1000),tolerance=300}={}) {
  if(!Buffer.isBuffer(raw)||!raw.length||raw.length>65536||typeof header!=='string'||header.length>2048||!Array.isArray(secrets)||!secrets.length||secrets.length>2||!Number.isSafeInteger(now)||!Number.isSafeInteger(tolerance)||tolerance<1||tolerance>300)invalid();
  const fields=header.split(',').map(part=>part.split('=')),times=fields.filter(([kind])=>kind==='t'),signatures=fields.filter(([kind])=>kind==='v1');
  if(times.length!==1||times[0].length!==2||!/^\d{1,12}$/.test(times[0][1])||!signatures.length||signatures.length>8||signatures.some(pair=>pair.length!==2||!/^[a-f0-9]{64}$/i.test(pair[1])))invalid();
  const timestamp=Number(times[0][1]);if(!Number.isSafeInteger(timestamp)||Math.abs(now-timestamp)>tolerance)invalid();
  let matches=0;
  for(const secret of secrets){if(typeof secret!=='string'||!secret.startsWith('whsec_'))invalid();const expected=createHmac('sha256',secret).update(times[0][1]+'.').update(raw).digest();for(const [,signature] of signatures)matches|=Number(timingSafeEqual(expected,Buffer.from(signature,'hex')))}
  if(!matches)invalid();
  let event;try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))}catch{invalid()}
  if(!event||typeof event!=='object'||Array.isArray(event)||typeof event.id!=='string'||!/^evt_[a-zA-Z0-9_]{1,240}$/.test(event.id)||event.livemode!==false||event.api_version!==STRIPE_API_VERSION||typeof event.type!=='string'||event.type.length>120||!Number.isSafeInteger(event.created)||event.created<0||event.created>now+tolerance)invalid();
  return event;
}
export function checkoutEventProjection(event,profile) {
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type))return null;
  const session=event.data?.object,metadata=session?.metadata;
  if(event.account!=null&&event.account!==profile.accountId)invalid();
  if(!session||session.object!=='checkout.session'||session.livemode!==false||session.mode!=='payment'||typeof session.id!=='string'||!/^cs_test_[a-zA-Z0-9_]{1,240}$/.test(session.id)||!Number.isSafeInteger(session.amount_total)||session.amount_total<50||session.amount_total>99999999||session.currency!=='eur'||!['paid','unpaid','no_payment_required'].includes(session.payment_status)||!['open','complete','expired'].includes(session.status))invalid();
  const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(value);
  if(!metadata||!id(metadata.attempt_id)||!id(metadata.center_id)||!id(metadata.receipt_id)||!profile.centerIds.includes(metadata.center_id))invalid();
  const intent=session.payment_intent;if(session.payment_status==='paid'&&intent==null||intent!=null&&(typeof intent!=='string'||!/^pi_[a-zA-Z0-9_]{1,240}$/.test(intent)))invalid();
  return {eventId:event.id,eventType:event.type,created:event.created,attemptId:metadata.attempt_id,centerId:metadata.center_id,receiptId:metadata.receipt_id,sessionId:session.id,amountMinor:String(session.amount_total),currency:'EUR',paymentStatus:session.payment_status,status:session.status,paymentIntentId:intent||null};
}
export function readStripeBody(req) {
  return new Promise((resolve,reject)=>{
    let size=0,over=false;const chunks=[];
    req.on('data',chunk=>{size+=chunk.length;if(over){if(size>131072)req.destroy();return}if(size>65536){over=true;chunks.length=0;reject(new CentersError(413,'stripe-body-too-large','gateway body too large'));return}chunks.push(chunk)});
    const incomplete=()=>{const error=new CentersError(400,'stripe-body-incomplete','incomplete gateway body');error.clientGone=true;reject(error)};
    req.on('end',()=>{if(!over)resolve(Buffer.concat(chunks))});req.on('aborted',incomplete);req.on('error',incomplete);
  });
}

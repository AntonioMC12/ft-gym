import {STRIPE_API_VERSION} from '../stripe-config.js';
import {CentersError} from '../errors.js';
const unavailable=()=>new CentersError(503,'stripe-unavailable','test gateway is temporarily unavailable');
export function safeStripeCheckoutUrl(value) {
  try{const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||url.username||url.password||url.port||value.length>4096||!/^\/(?:c\/)?pay\/cs_test_[a-zA-Z0-9_]+$/.test(url.pathname))throw new Error();return url.href}catch{throw unavailable()}
}
export function createStripeTestClient(profile,{fetchImpl=globalThis.fetch}={}) {
  if(profile.mode!=='test'||!/^(?:sk|rk)_test_/.test(profile.apiKey))throw unavailable();
  const request=async(method,route,body,key)=>{
    let response;try{response=await fetchImpl('https://api.stripe.com/v1/'+route,{method,redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+profile.apiKey,'Stripe-Version':STRIPE_API_VERSION,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:body.toString()}:{})})}catch{throw unavailable()}
    if(!response.ok){await response.body?.cancel().catch(()=>{});throw unavailable()}
    try{const reader=response.body?.getReader();if(!reader)throw new Error();let size=0;const chunks=[];for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new Error()}chunks.push(Buffer.from(value))}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))}catch{throw unavailable()}
  };
  return {
    async verifyAccount(){const account=await request('GET','account');if(account.id!==profile.accountId||account.object!=='account')throw new CentersError(409,'stripe-account-mismatch','gateway account requires review');return true},
    async create(attempt){
      const amount=BigInt(attempt.amount_minor);if(amount<50n||amount>BigInt(profile.maxAmountMinor)||!profile.centerIds.includes(attempt.center_id))throw new CentersError(409,'stripe-limit','test gateway limit exceeded');
      const target=(attempt.return_origin||profile.returnOrigin)+'/#/'+(attempt.audience==='own'?'centers/membership?':'centers?')+new URLSearchParams({centerId:attempt.center_id,...(attempt.audience==='own'?{}:{pane:'billing'})}),metadata={attempt_id:attempt.id,center_id:attempt.center_id,receipt_id:attempt.receipt_id};
      const body=new URLSearchParams({mode:'payment','payment_method_types[0]':'card','line_items[0][price_data][currency]':'eur','line_items[0][price_data][unit_amount]':amount.toString(),'line_items[0][price_data][product_data][name]':'Recibo de centro (pruebas)','line_items[0][quantity]':'1',client_reference_id:attempt.id,success_url:target+'&checkout=return',cancel_url:target+'&checkout=cancel',expires_at:String(attempt.expires_at_seconds)});
      body.set('adaptive_pricing[enabled]','false');body.set('automatic_tax[enabled]','false');body.set('allow_promotion_codes','false');body.set('payment_intent_data[capture_method]','automatic');
      for(const [key,value] of Object.entries(metadata)){body.set('metadata['+key+']',value);body.set('payment_intent_data[metadata]['+key+']',value)}
      const session=await request('POST','checkout/sessions',body,'ft-gym-test-'+attempt.id);if(session.livemode!==false||session.mode!=='payment'||typeof session.id!=='string'||!/^cs_test_[a-zA-Z0-9_]{1,240}$/.test(session.id)||session.amount_total!==Number(amount)||session.currency!=='eur'||session.metadata?.attempt_id!==attempt.id||session.metadata?.center_id!==attempt.center_id||session.metadata?.receipt_id!==attempt.receipt_id||!['open','complete','expired'].includes(session.status)||!['paid','unpaid'].includes(session.payment_status))throw unavailable();
      const url=session.url==null?null:safeStripeCheckoutUrl(session.url);if(url&&!new URL(url).pathname.endsWith('/'+session.id)||session.status==='open'&&!url)throw unavailable();
      return {id:session.id,url,status:session.status,paymentStatus:session.payment_status};
    },
    retrieve(id){if(typeof id!=='string'||!/^cs_test_[a-zA-Z0-9_]{1,240}$/.test(id))throw unavailable();return request('GET','checkout/sessions/'+encodeURIComponent(id)+'?expand%5B%5D=payment_intent.latest_charge.balance_transaction')},
  };
}

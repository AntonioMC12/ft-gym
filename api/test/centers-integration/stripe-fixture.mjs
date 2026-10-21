import {randomBytes,createHmac} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
import {stripeProfiles,STRIPE_API_VERSION} from '../../centers/stripe-config.js';
import {prepareStripeAttempt,receiveStripeWebhook} from '../../centers/services/stripe-foundation.js';
import {claimStripeAttempt,runClaimedStripeAttempt} from '../../centers/services/stripe-worker.js';

export async function stripeFixture(t) {
  const {app,migrator}=await isolatedDatabase(),database=createCentersDatabase({enabled:true,databaseUrl:app});
  t.after(async()=>{await database.close();await migrator.end()});
  const prefix='sr_'+randomBytes(6).toString('hex'),root=prefix+'_root',manager=prefix+'_manager',other=prefix+'_other';
  const h=await startHttp(t,{app,superadminUids:[root],users:[root,manager,other].map(id=>({id,name:id}))});
  const req=async(path,uid,body)=>{const response=await fetch(h.base+path,{headers:h.headers(uid),...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}};
  const center=(await req('/api/platform/centers/create',root,{name:prefix,managerUid:manager,requestId:prefix+'_center'})).body.center.id;
  const centerB=(await req('/api/platform/centers/create',root,{name:prefix+' other',managerUid:other,requestId:prefix+'_center_b'})).body.center.id;
  const plan=(await req('/api/centers/plans/create',manager,{centerId:center,name:'Fictional Stripe reconciliation',priceMinor:'1000',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:prefix+'_plan'})).body.plan;
  let sequence=0;
  const bill=async()=>{
    const suffix=String(++sequence),member=(await req('/api/centers/members/create',manager,{centerId:center,name:'Fictional '+suffix,requestId:prefix+'_m_'+suffix})).body.member;
    const info=(await req(`/api/centers/member?centerId=${center}&id=${member.id}`,manager)).body;
    const contract=(await req('/api/centers/subscriptions/create',manager,{centerId:center,memberId:member.id,memberVersion:member.version,priceVersionId:plan.priceVersionId,effectiveOn:info.today,requestId:prefix+'_c_'+suffix})).body.subscriptions[0];
    const receipt=(await req('/api/centers/receipts/generate',manager,{centerId:center,memberId:member.id,subscriptionId:contract.id,periodStart:contract.anchorOn,dueOn:info.today,requestId:prefix+'_r_'+suffix})).body.receipt;
    return {member,receipt,today:info.today};
  };
  const secret='whsec_fictional_reconciliation_secret',config={enabled:true,stripeProfiles:stripeProfiles({CENTERS_STRIPE_PROFILES_JSON:JSON.stringify([{id:prefix,mode:'test',accountId:'acct_fictionaltest1234',apiKey:'sk_test_fictional_key_never_transmitted',webhookSecrets:[secret],centerIds:[center,centerB],maxAmountMinor:'1000',dailyLimitMinor:'100000',returnOrigin:'http://localhost:5178'}])})};
  const sessions=new Map(),created=new Map(),calls=[],sql=work=>database.platformTransaction(root,work,center);
  const clientFactory=()=>({
    async verifyAccount(){calls.push('account');return true},
    async create(attempt){calls.push('create:'+attempt.id);let id=created.get(attempt.id);if(!id){id='cs_test_'+attempt.id;created.set(attempt.id,id);sessions.set(id,{id,object:'checkout.session',mode:'payment',livemode:false,client_reference_id:attempt.id,amount_subtotal:Number(attempt.amount_minor),amount_total:Number(attempt.amount_minor),currency:'eur',metadata:{attempt_id:attempt.id,center_id:attempt.center_id,receipt_id:attempt.receipt_id},expires_at:Number(attempt.expires_at_seconds),automatic_tax:{enabled:false},adaptive_pricing:{enabled:false},payment_method_types:['card'],total_details:{amount_discount:0,amount_tax:0,amount_shipping:0},status:'open',payment_status:'unpaid',payment_intent:null,url:'https://checkout.stripe.com/c/pay/'+id,customer_details:{email:'not-recorded@example.invalid'}})}return {id,url:sessions.get(id).url}},
    async retrieve(id){calls.push('retrieve:'+id);return structuredClone(sessions.get(id))},
  });
  const prepare=async bill=>prepareStripeAttempt({database,config,user:{id:manager},checkSession:()=>{}},{centerId:center,memberId:bill.member.id,receiptId:bill.receipt.id,requestId:prefix+'_prepare_'+(++sequence)});
  const claim=async id=>claimStripeAttempt(database,config,center,{attemptId:id});
  const run=async(id,options={})=>runClaimedStripeAttempt(database,config,await claim(id),{clientFactory,...options});
  const ready=async id=>sql(client=>client.query("UPDATE centers.stripe_attempts SET sync_next_at=now()-interval '1 second' WHERE id=$1",[id]));
  const attempt=async id=>(await sql(client=>client.query('SELECT * FROM centers.stripe_attempts WHERE id=$1',[id]))).rows[0];
  const paid=id=>{
    const session=sessions.get(id),intentId='pi_'+id.slice(8),chargeId='ch_'+id.slice(8),now=Math.floor(Date.now()/1000);
    Object.assign(session,{status:'complete',payment_status:'paid',url:null,payment_intent:{id:intentId,object:'payment_intent',amount:session.amount_total,amount_received:session.amount_total,currency:'eur',livemode:false,status:'succeeded',capture_method:'automatic',metadata:session.metadata,client_secret:'never-store-this-secret',latest_charge:{id:chargeId,object:'charge',payment_intent:intentId,amount:session.amount_total,amount_captured:session.amount_total,amount_refunded:0,currency:'eur',livemode:false,paid:true,captured:true,status:'succeeded',disputed:false,refunded:false,balance_transaction:{id:'txn_'+id.slice(8),object:'balance_transaction',source:chargeId,type:'charge',amount:session.amount_total,currency:'eur',created:now},billing_details:{email:'never-store-this@example.invalid'}}}});
    return session;
  };
  const event=async(id,{type='checkout.session.completed',eventId='evt_'+prefix+'_'+(++sequence),session={}}={})=>{
    const original=sessions.get(id),object={...original,payment_intent:original.payment_intent?.id||null,...session},now=Math.floor(Date.now()/1000),value={id:eventId,api_version:STRIPE_API_VERSION,type,created:now,livemode:false,data:{object}},raw=Buffer.from(JSON.stringify(value)),header='t='+now+',v1='+createHmac('sha256',secret).update(String(now)+'.').update(raw).digest('hex');
    return receiveStripeWebhook({database,config},prefix,raw,header);
  };
  return {prefix,root,manager,other,database,migrator,h,req,center,centerB,config,bill,prepare,claim,run,ready,attempt,sql,sessions,created,calls,clientFactory,paid,event};
}

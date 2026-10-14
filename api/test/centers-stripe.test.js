import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {STRIPE_API_VERSION,stripeProfiles} from '../centers/stripe-config.js';
import {verifyStripeEvent,checkoutEventProjection,stripeBodyHash} from '../centers/domain/stripe-webhook.js';
import {createStripeTestClient,safeStripeCheckoutUrl} from '../centers/services/stripe-client.js';
const secret='whsec_fictional_signature_test_key',now=1800000000;
const rawProfile={id:'test_gateway',mode:'test',accountId:'acct_fictionaltest1234',apiKey:'sk_test_fictional_api_key_never_sent',webhookSecrets:[secret],centerIds:['center_a'],maxAmountMinor:'10000',dailyLimitMinor:'20000',returnOrigin:'http://localhost:5178'};
const profile=()=>stripeProfiles({CENTERS_STRIPE_PROFILES_JSON:JSON.stringify([rawProfile])})[0];
const event=()=>({id:'evt_fictional',api_version:STRIPE_API_VERSION,type:'checkout.session.completed',created:now,livemode:false,data:{object:{id:'cs_test_fictional',object:'checkout.session',mode:'payment',livemode:false,amount_total:1000,currency:'eur',payment_status:'paid',status:'complete',payment_intent:'pi_fictional',metadata:{attempt_id:'attempt_a',center_id:'center_a',receipt_id:'receipt_a'},customer_details:{email:'private@example.invalid'}}}});
const sign=(body,time=now,key=secret)=>'t='+time+',v1='+createHmac('sha256',key).update(String(time)+'.').update(body).digest('hex');
test('sandbox profiles reject live keys, ambiguous centers, unsafe return origins and incoherent limits without throwing secrets',()=>{
  assert.equal(profile().mode,'test');assert.deepEqual(stripeProfiles({}),[]);
  for(const change of [{apiKey:'sk_live_fictional_not_permitted'},{mode:'live'},{returnOrigin:'http://example.com'},{maxAmountMinor:'49'},{dailyLimitMinor:'1'},{webhookSecrets:['bad']}])assert.deepEqual(stripeProfiles({CENTERS_STRIPE_PROFILES_JSON:JSON.stringify([{...rawProfile,...change}])}),[]);
  assert.deepEqual(stripeProfiles({CENTERS_STRIPE_PROFILES_JSON:JSON.stringify([rawProfile,{...rawProfile,id:'other'}])}),[]);
});
test('webhook verification covers exact bytes, time bounds, rotated signatures and rejects live or wrong-version events',()=>{
  const body=Buffer.from(JSON.stringify(event()));assert.equal(verifyStripeEvent(body,sign(body),[secret],{now}).id,'evt_fictional');
  assert.throws(()=>verifyStripeEvent(Buffer.from(body+' '),sign(body),[secret],{now}),{code:'stripe-signature-invalid'});
  for(const time of [now-301,now+301])assert.throws(()=>verifyStripeEvent(body,sign(body,time),[secret],{now}),{code:'stripe-signature-invalid'});
  assert.equal(verifyStripeEvent(body,sign(body)+',v1='+'0'.repeat(64),['whsec_old_key',secret],{now}).id,'evt_fictional');
  for(const header of [sign(body)+',t='+now,'t='+now+',v1=bad','t='+now+',v1='+'0'.repeat(64),''])assert.throws(()=>verifyStripeEvent(body,header,[secret],{now}));
  for(const mutation of [{livemode:true},{api_version:'unknown'},{created:now+301}]){const bad=Buffer.from(JSON.stringify({...event(),...mutation}));assert.throws(()=>verifyStripeEvent(bad,sign(bad),[secret],{now}))}
  assert.equal(stripeBodyHash(body).length,64);
});
test('only allowlisted financial projection survives; profile/center mismatches and unsafe amounts fail closed',()=>{
  const projected=checkoutEventProjection(event(),profile());assert.equal(projected.amountMinor,'1000');assert.ok(!JSON.stringify(projected).includes('private@'));
  for(const mutation of [{livemode:true},{amount_total:1.5},{currency:'usd'},{metadata:{attempt_id:'attempt_a',center_id:'foreign',receipt_id:'receipt_a'}},{payment_intent:null}])assert.throws(()=>checkoutEventProjection({...event(),data:{object:{...event().data.object,...mutation}}},profile()));
  assert.equal(checkoutEventProjection({...event(),type:'unhandled.event'},profile()),null);
});
test('REST checkout creation is sandbox-only, idempotent and pins server amount/version/return origin',async()=>{
  let call;const attempt={id:'attempt_a',center_id:'center_a',receipt_id:'receipt_a',amount_minor:'1000',expires_at_seconds:now+3600};
  const client=createStripeTestClient(profile(),{fetchImpl:async(url,options)=>{call={url,options};const form=new URLSearchParams(options.body);return new Response(JSON.stringify({id:'cs_test_fictional',object:'checkout.session',mode:'payment',livemode:false,amount_total:Number(form.get('line_items[0][price_data][unit_amount]')),currency:'eur',metadata:{attempt_id:'attempt_a',center_id:'center_a',receipt_id:'receipt_a'},url:'https://checkout.stripe.com/c/pay/cs_test_fictional',status:'open',payment_status:'unpaid'}))}});
  assert.equal(call,undefined);const result=await client.create(attempt);assert.equal(result.url,'https://checkout.stripe.com/c/pay/cs_test_fictional');assert.equal(call.options.headers['Stripe-Version'],STRIPE_API_VERSION);assert.equal(call.options.headers['Idempotency-Key'],'ft-gym-test-attempt_a');assert.equal(call.options.redirect,'error');const fields=new URLSearchParams(call.options.body);assert.equal(fields.get('line_items[0][price_data][unit_amount]'),'1000');assert.ok(fields.get('success_url').startsWith('http://localhost:5178/#/centers?'));
  assert.throws(()=>createStripeTestClient({...profile(),apiKey:'sk_live_no'}),{code:'stripe-unavailable'});
  await assert.rejects(client.create({...attempt,amount_minor:'10001'}),{code:'stripe-limit'});
  for(const url of ['https://evil.example/c/pay/cs_test_x','http://checkout.stripe.com/c/pay/cs_test_x','https://checkout.stripe.com/redirect?to=cs_test_x'])assert.throws(()=>safeStripeCheckoutUrl(url));
});

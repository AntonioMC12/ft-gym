// Explicit, disposable HTTP harness only. Never connects to Stripe, never loaded
// by server.js or the preview. SQL marker + temp marker + exact fake key required.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createCentersDatabase} from '../../centers/db.js';
const directory=process.env.CENTERS_STRIPE_TEST_FIXTURE;
if(!directory||!fs.realpathSync(directory).startsWith(path.join(fs.realpathSync(os.tmpdir()),'gym-centers-stripe-fixture-'))||fs.readFileSync(path.join(directory,'fixture'),'utf8')!=='fictional-disposable-only')throw new Error('refusing non-fictional Stripe fixture');
const profiles=JSON.parse(process.env.CENTERS_STRIPE_PROFILES_JSON||'[]'),key='sk_test_fictional_http_fixture_never_sent';
if(!profiles.length||profiles.some(value=>value.apiKey!==key||value.mode!=='test'||value.accountId!=='acct_fictionalhttp1234')||process.env.CENTERS_JOBS_ENABLED!=='0')throw new Error('fixture cannot inherit provider credentials or automatic jobs');
const database=createCentersDatabase({enabled:true,databaseUrl:process.env.CENTERS_DATABASE_URL});
try{await database.status();if((await database.platformTransaction('fictional_http_fixture',client=>client.query('SELECT kind FROM centers.environment WHERE singleton'))).rows[0]?.kind!=='test')throw new Error('fixture requires isolated test SQL')}finally{await database.close()}
const original=globalThis.fetch,statePath=path.join(directory,'provider.json');
globalThis.fetch=async(input,options={})=>{
  const url=new URL(input);if(url.hostname!=='api.stripe.com')return original(input,options);
  if(url.origin!=='https://api.stripe.com'||options.headers?.Authorization!=='Bearer '+key)throw new Error('unexpected provider request in fixture');
  const state=JSON.parse(fs.readFileSync(statePath,'utf8')),method=options.method||'GET',form=new URLSearchParams(options.body||''),requestKey=options.headers?.['Idempotency-Key'];
  state.calls.push({method,path:url.pathname,key:requestKey||null});let value,status=200;
  if(method==='GET'&&url.pathname==='/v1/account')value={object:'account',id:'acct_fictionalhttp1234'};
  else if(method==='POST'&&url.pathname==='/v1/checkout/sessions'){
    const previous=state.keys[requestKey];
    if(previous&&previous.body!==options.body){value={error:'fictional idempotency conflict'};status=409}
    else {
      const attempt=form.get('metadata[attempt_id]'),id=previous?.id||'cs_test_'+attempt;
      if(!previous){state.keys[requestKey]={id,body:options.body};state.sessions[id]={id,object:'checkout.session',livemode:false,mode:'payment',client_reference_id:attempt,metadata:{attempt_id:attempt,center_id:form.get('metadata[center_id]'),receipt_id:form.get('metadata[receipt_id]')},amount_subtotal:Number(form.get('line_items[0][price_data][unit_amount]')),amount_total:Number(form.get('line_items[0][price_data][unit_amount]')),currency:'eur',expires_at:Number(form.get('expires_at')),automatic_tax:{enabled:false},adaptive_pricing:{enabled:false},payment_method_types:['card'],total_details:{amount_discount:0,amount_tax:0,amount_shipping:0},status:'open',payment_status:'unpaid',payment_intent:null,url:'https://checkout.stripe.com/c/pay/'+id,customer_details:{email:'fixture-private@example.invalid'}}}
      value=state.sessions[id];
    }
  }else if(method==='GET'&&url.pathname.startsWith('/v1/checkout/sessions/')){value=state.sessions[url.pathname.slice('/v1/checkout/sessions/'.length)];if(!value){value={error:'fictional missing session'};status=404}}
  else {value={error:'unexpected fictional endpoint'};status=404}
  fs.writeFileSync(statePath,JSON.stringify(state));return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
};

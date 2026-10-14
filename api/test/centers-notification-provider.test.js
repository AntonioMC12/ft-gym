import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notificationProfiles,notificationMode} from '../centers/notification-config.js';
import {centersConfig,publicCentersConfig} from '../centers/config.js';
import {createCloudflareEmailTransport} from '../centers/services/notification-cloudflare.js';
import {notificationTick} from '../centers/services/notification-worker.js';
const raw={provider:'cloudflare',accountId:'a'.repeat(32),token:'fictional-api-token-never-sent',from:'notice@example.invalid',name:'Fictional Center',centerIds:['center_a']};
const profiles=()=>notificationProfiles({CENTERS_MAIL_PROFILES_JSON:JSON.stringify([raw])});
const claim={key:'delivery_a',centerId:'center_a',recipient:'Alice@example.invalid',message:{subject:'Notice',text:'Read your portal.',html:'<p>Read your portal.</p>'}};
const response=result=>new Response(JSON.stringify({success:true,result}),{status:200});
test('server mail profiles fail closed and never reach the public centers config',()=>{
  assert.deepEqual(notificationProfiles({}),[]);
  for(const value of ['bad','{}',JSON.stringify([{...raw,token:'short'}]),JSON.stringify([{...raw,from:'a@example.invalid\r\nBcc:b@example.invalid'}]),JSON.stringify([raw,raw])])assert.deepEqual(notificationProfiles({CENTERS_MAIL_PROFILES_JSON:value}),[]);
  const cfg=centersConfig({CENTERS_ENABLED:'1',CENTERS_MAIL_PROFILES_JSON:JSON.stringify([raw])});assert.equal(notificationMode(cfg,'center_a'),'cloudflare');assert.equal(notificationMode(cfg,'center_b'),'off');assert.equal(notificationMode({...cfg,notificationTestCapture:true},'center_a'),'test-capture');assert.ok(!JSON.stringify(publicCentersConfig(cfg)).includes(raw.token));assert.ok(Object.isFrozen(cfg.mailProfiles[0]));
});
test('optional REST adapter has no constructor I/O and sends only to its bound center with fixed endpoint',async()=>{
  let sent;const transport=createCloudflareEmailTransport(profiles(),{fetchImpl:async(url,options)=>{sent={url,options};return response({delivered:[claim.recipient],queued:[],permanent_bounces:[]})}});
  assert.equal(sent,undefined);assert.equal(transport.idempotent,false);await assert.rejects(transport.send({...claim,centerId:'other'}),{permanent:true});assert.equal(sent,undefined);
  assert.deepEqual(await transport.send(claim),{accepted:true});assert.equal(sent.url,'https://api.cloudflare.com/client/v4/accounts/'+raw.accountId+'/email/sending/send');assert.equal(sent.options.redirect,'error');assert.equal(sent.options.headers.Authorization,'Bearer '+raw.token);
  assert.deepEqual(JSON.parse(sent.options.body),{to:claim.recipient,from:{address:raw.from,name:raw.name},subject:claim.message.subject,text:claim.message.text,html:claim.message.html});assert.ok(!Object.keys(sent.options.headers).some(key=>/idempotency/i.test(key)));
});
test('provider acceptance, queueing, hard bounce and unknown outcome remain distinct',async()=>{
  const send=body=>createCloudflareEmailTransport(profiles(),{fetchImpl:async()=>response(body)}).send(claim);
  assert.deepEqual(await send({delivered:[],queued:[claim.recipient],permanent_bounces:[]}),{accepted:true});
  await assert.rejects(send({delivered:[],queued:[],permanent_bounces:[claim.recipient]}),{permanent:true});
  await assert.rejects(send({delivered:[],queued:[],permanent_bounces:[]}),{ambiguous:true});
  await assert.rejects(send({delivered:[claim.recipient],queued:[],permanent_bounces:[claim.recipient]}),{ambiguous:true});
});
test('only an explicit throttle rejection is retriable; network and server ambiguity are sanitized',async()=>{
  const send=fetchImpl=>createCloudflareEmailTransport(profiles(),{fetchImpl}).send(claim);
  await assert.rejects(send(async()=>new Response('',{status:429})),{retryable:true});
  await assert.rejects(send(async()=>new Response('secret upstream response',{status:401})),error=>error.permanent&&!error.message.includes('secret'));
  for(const fn of [async()=>{throw new Error('secret token in network stack')},async()=>new Response('upstream failed',{status:500}),async()=>new Response('bad JSON',{status:200})])await assert.rejects(send(fn),error=>error.ambiguous&&!error.message.includes('secret'));
});
test('a real adapter cannot send from the isolated test database even if server profiles were supplied',async()=>{
  let sent=false;const database={platformTransaction:async(uid,work)=>work({query:async()=>({rows:[{kind:'test'}]})})};
  const transport=createCloudflareEmailTransport(profiles(),{fetchImpl:async()=>{sent=true;throw new Error()}});
  await assert.rejects(notificationTick(database,{transport}),/explicitly configured production database/);assert.equal(sent,false);
});

import {notificationAddress} from '../domain/notifications.js';
const rejected=()=>Object.assign(new Error('email provider rejected delivery'),{permanent:true});
const unknown=()=>Object.assign(new Error('email delivery outcome unknown'),{ambiguous:true});
// REST reference: https://developers.cloudflare.com/email-service/api/send-emails/rest-api/
// It documents recipient outcomes, not an idempotency-key guarantee. Do not invent
// exactly-once provider delivery or retry an ambiguous acceptance automatically.
export function createCloudflareEmailTransport(profiles,{fetchImpl=globalThis.fetch}={}) {
  const byCenter=new Map();for(const profile of profiles)for(const id of profile.centerIds){if(byCenter.has(id))throw new Error('ambiguous mail profile');byCenter.set(id,profile)}
  return {kind:'cloudflare',idempotent:false,centerIds:[...byCenter.keys()],async send(claim){
    const profile=byCenter.get(claim.centerId);if(!profile)throw rejected();
    let recipient;try{recipient=notificationAddress(claim.recipient)}catch{throw rejected()}
    if(!claim.message||typeof claim.message.subject!=='string'||/[\r\n]/.test(claim.message.subject)||typeof claim.message.text!=='string'||typeof claim.message.html!=='string')throw rejected();
    let response;
    try{response=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${profile.accountId}/email/sending/send`,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+profile.token,'Content-Type':'application/json'},
      body:JSON.stringify({to:recipient,from:{address:profile.from,name:profile.name},subject:claim.message.subject,text:claim.message.text,html:claim.message.html}),
    })}catch{throw unknown()}
    if(response.status===429){await response.body?.cancel().catch(()=>{});throw Object.assign(new Error('email provider throttled delivery'),{retryable:true})}
    if([400,401,403,404,413,422].includes(response.status)){await response.body?.cancel().catch(()=>{});throw rejected()}
    // A 5xx/timeout can arrive after provider acceptance; without a provider
    // idempotency guarantee its safe outcome is review, not blind resubmission.
    if(!response.ok){await response.body?.cancel().catch(()=>{});throw unknown()}
    let result;
    try{const text=await response.text();if(text.length>65536)throw new Error();const data=JSON.parse(text);if(data.success!==true)throw new Error();result=data.result}catch{throw unknown()}
    if(!result||!['delivered','queued','permanent_bounces'].every(key=>Array.isArray(result[key])))throw unknown();
    const accepted=result.delivered.includes(recipient)||result.queued.includes(recipient),bounced=result.permanent_bounces.includes(recipient);
    if(accepted&&!bounced)return {accepted:true};if(bounced&&!accepted)throw rejected();throw unknown();
  }};
}

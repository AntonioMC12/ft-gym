import {affiliations} from './identity.js';
import {memberRecord} from './member-records.js';
import {feeSummary} from './renewals.js';
import {isPlatformUser} from '../authz.js';
// No client role/center selector is accepted. All linked memberships are resolved server-side.
export async function applicationAccess(database,config,user){
 if(!config.enabled||user.admin||isPlatformUser(config,user))return {blocked:false,warnings:[]};
 const linked=await affiliations(database,config,user);
 if(linked.centers.some(c=>c.capabilities.includes('center.read')))return {blocked:false,warnings:[]};
 if(!linked.centers.some(c=>c.capabilities.includes('membership.own.read')))return {blocked:true,reason:'activation-pending',registrationCenterId:user.registrationCenterId||null,warnings:[]};
 const terms=[];
 for(const center of linked.centers){
  if(!center.capabilities.includes('membership.own.read'))continue;
  const fee=await database.transaction({uid:user.id,centerId:center.id},async client=>{
   await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:'||$1))",[center.id]);
   const {rows}=await client.query('SELECT id FROM centers.members WHERE center_id=$1 AND account_uid=$2',[center.id,user.id]);
   if(!rows.length)return null;return feeSummary(client,center.id,await memberRecord(client,center.id,rows[0].id));
  });if(fee?.hasContract)terms.push({...fee,centerId:center.id,centerName:center.name});
 }
 return {blocked:terms.length>0&&terms.every(t=>t.blocked),warnings:terms.filter(t=>t.status==='grace'),memberships:terms};
}
export function renewalGateExempt(key){
 return /^(GET \/api\/(health|config|me|centers\/app-access)|POST \/api\/logout(?:\/all)?)$/.test(key)||/^(GET|POST) \/api\/(login|register|device-link|pair)\//.test(key)||key==='GET /api/centers/me'||key==='GET /api/centers/activation/status'||key==='POST /api/centers/activation/request'||key==='POST /api/centers/invitations/inspect'||key==='GET /api/centers/join'||key==='POST /api/centers/invitations/accept';
}

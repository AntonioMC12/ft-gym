import { CentersError } from '../errors.js';
import { requireCenter } from '../authz.js';
import { PLATFORM_CAPABILITIES } from '../domain/policies.js';

// platform is supplied only by routes after checking the explicit account allowlist.
// Every business query still receives a selected center; global access is audited.
export function businessTransaction(database,uid,centerId,capability,work,{platform=false,allowInactive=false}={}) {
  const execute=async client=>{
    let context;
    if(platform){
      if(!PLATFORM_CAPABILITIES.includes(capability))throw new CentersError(403,'forbidden','forbidden');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:' || $1))",[centerId]);
      const {rows}=await client.query('SELECT id,name,state,version,timezone FROM centers.centers WHERE id=$1',[centerId]);
      if(!rows.length)throw new CentersError(404,'not-found','not found');
      if(!allowInactive&&rows[0].state!=='active')throw new CentersError(409,'center-inactive','center is not active');
      context={uid,centerId,center:rows[0],capabilities:PLATFORM_CAPABILITIES};
      await client.query('INSERT INTO centers.business_audit(center_id,actor_uid,action,target_id) VALUES($1,$2,$3,$1)',[centerId,uid,'platform.'+capability]);
    }else{
      try{context=await requireCenter(client,uid,centerId,capability,{lock:true,allowInactive});}
      catch(error){
        if(capability!=='members.read'||error.status!==403)throw error;
        context=await requireCenter(client,uid,centerId,'members.operational.read',{lock:true,allowInactive});
      }
    }
    return work(client,context);
  };
  return platform?database.platformTransaction(uid,execute,centerId):database.transaction({uid,centerId},execute);
}

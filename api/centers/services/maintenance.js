import {businessAudit} from './commands.js';
import {startCentersWorker} from './worker-lifecycle.js';
const SYSTEM_UID='system_centers_maintenance';
export async function maintenanceTick(database){
  // Discovery reveals only center IDs; each batch locks exactly one center.
  const centers=await database.platformTransaction(SYSTEM_UID,async client=>(await client.query('SELECT center_id FROM centers.expired_import_centers(4)')).rows);
  let expired=0;
  for(const row of centers){
    expired+=await database.platformTransaction(SYSTEM_UID,async client=>{
      const {rows:[result]}=await client.query('SELECT centers.expire_member_imports($1,100) AS expired',[row.center_id]);
      if(result.expired)await businessAudit(client,row.center_id,SYSTEM_UID,'members.import.expired',row.center_id,{expired:result.expired});
      return result.expired;
    },row.center_id);
  }
  return {centers:centers.length,expired};
}
export function startMaintenanceWorker(database,{enabled=false,intervalMs=60000,onError=()=>{},onResult=()=>{}}={}){
  return startCentersWorker(()=>maintenanceTick(database).then(onResult),{enabled,intervalMs,onError});
}

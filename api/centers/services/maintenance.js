import {businessAudit} from './commands.js';
import {startCentersWorker} from './worker-lifecycle.js';
const SYSTEM_UID='system_centers_maintenance';
export async function maintenanceTick(database,{afterCenter=null}={}){
  // Discovery reveals only center IDs; each batch locks exactly one center.
  const centers=await database.platformTransaction(SYSTEM_UID,async client=>(await client.query('SELECT center_id FROM centers.expired_import_centers(4,$1)',[afterCenter])).rows);
  let expired=0,failed=0;
  for(const row of centers){
    try{expired+=await database.platformTransaction(SYSTEM_UID,async client=>{
      const {rows:[result]}=await client.query('SELECT centers.expire_member_imports($1,100) AS expired',[row.center_id]);
      if(result.expired)await businessAudit(client,row.center_id,SYSTEM_UID,'members.import.expired',row.center_id,{expired:result.expired});
      return result.expired;
    },row.center_id)}catch{failed++}
  }
  // Only counts leave the service, apart from the private in-memory paging key.
  // No exception text, row contents or DSN is propagated on a partial failure.
  return {centers:centers.length,expired,failed,nextCenter:centers.at(-1)?.center_id||null};
}
export function startMaintenanceWorker(database,{enabled=false,intervalMs=60000,onError=()=>{},onResult=()=>{}}={}){
  let afterCenter=null;
  return startCentersWorker(async()=>{
    const result=await maintenanceTick(database,{afterCenter});afterCenter=result.nextCenter;
    const {nextCenter,...counts}=result;await onResult(counts);
    if(result.failed)await onError('centers-maintenance-partial');
  },{enabled,intervalMs,onError});
}

import {createHash} from 'node:crypto';
import {CentersError} from '../errors.js';
export const commandHash=body=>createHash('sha256').update(JSON.stringify(body)).digest('hex');
export async function commandReplay(client,centerId,uid,operation,requestId,bodyHash) {
  const {rows}=await client.query('SELECT body_hash,result FROM centers.idempotency_records WHERE center_id=$1 AND actor_uid=$2 AND operation=$3 AND request_id=$4',[centerId,uid,operation,requestId]);
  if(!rows.length)return null;
  if(rows[0].body_hash!==bodyHash)throw new CentersError(409,'idempotency-conflict','requestId was used with different content');
  return rows[0].result;
}
export const rememberCommand=(client,centerId,uid,operation,requestId,bodyHash,result)=>client.query('INSERT INTO centers.idempotency_records(center_id,actor_uid,operation,request_id,body_hash,result) VALUES($1,$2,$3,$4,$5,$6)',[centerId,uid,operation,requestId,bodyHash,JSON.stringify(result)]);
export const businessAudit=(client,centerId,uid,action,target,details={})=>client.query('INSERT INTO centers.business_audit(center_id,actor_uid,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[centerId,uid,action,target,JSON.stringify(details)]);

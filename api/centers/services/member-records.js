import { CentersError } from '../errors.js';
export const MEMBER_PROJECTION=`id,center_id,account_uid,member_number,name,state,version,email,phone,national_document,
  joined_on::text AS joined_on,ends_on::text AS ends_on`;

// Only called with a client already authorized for the selected center.
export async function memberRecord(client,centerId,id,{version}={}) {
  if(version!==undefined){
    const {rows}=await client.query('SELECT version FROM centers.members WHERE center_id=$1 AND id=$2 FOR UPDATE',[centerId,id]);
    if(!rows.length)throw new CentersError(404,'not-found','not found');
    if(rows[0].version!==version)throw new CentersError(409,'version-conflict','member changed; reload it');
  }
  const {rows}=await client.query(`SELECT ${MEMBER_PROJECTION},local_today::text AS local_today FROM centers.member_profiles WHERE center_id=$1 AND id=$2`,[centerId,id]);
  if(!rows.length)throw new CentersError(404,'not-found','not found');
  return rows[0];
}

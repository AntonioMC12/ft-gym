import {CentersError} from '../errors.js';
import {businessTransaction} from './context.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';

export function trainingRosterOptions(params){
  if([...params.keys()].some(key=>!['centerId','query','limit','cursor'].includes(key)))throw new CentersError(400,'invalid-input','invalid roster selectors');
  const query=(params.get('query')||'').trim(),limit=Number(params.get('limit')||20),cursor=params.get('cursor')||null;
  if(query.length>120||!Number.isSafeInteger(limit)||limit<1||limit>50||cursor?.length>1024)throw new CentersError(400,'invalid-input','invalid roster page');
  return {query,limit,cursor};
}
export function trainingRoster(database,uid,centerId,{query='',limit=20,cursor=null}={}, {platform=false}={}){
  const scope=cursorScope(['training-roster',uid,centerId,query]),after=readCursor(cursor,scope);
  return businessTransaction(database,uid,centerId,'training.assign',async client=>{
    const pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
    // Acceptance belongs to an exact account/version. Relinking must never expose the
    // previous account's assignments on the new member link. No training JSON is read here.
    const {rows}=await client.query(`SELECT m.id,m.name,m.member_number,m.created_at::text AS cursor_at,
      count(DISTINCT v.proposal_id)::int AS plans,max(a.accepted_at) AS assigned_at
      FROM centers.member_profiles m
      JOIN centers.training_versions v ON v.center_id=m.center_id AND v.member_id=m.id AND v.recipient_uid=m.account_uid
      JOIN centers.training_acceptances a ON a.version_id=v.id AND a.recipient_uid=v.recipient_uid
      WHERE m.center_id=$1 AND ($2='' OR m.name ILIKE $3 ESCAPE '\\' OR m.member_number ILIKE $3 ESCAPE '\\')
      AND ($4::timestamptz IS NULL OR (m.created_at,m.id)<($4::timestamptz,$5::text))
      GROUP BY m.id,m.name,m.member_number,m.created_at ORDER BY m.created_at DESC,m.id DESC LIMIT $6`,
    [centerId,query,pattern,after?.at||null,after?.id||null,limit+1]);
    const page=rows.slice(0,limit);
    return {members:page.map(row=>({id:row.id,name:row.name,number:row.member_number,plans:row.plans,assignedAt:row.assigned_at})),nextCursor:rows.length>limit?nextCursor(scope,page.at(-1)):null};
  },{platform,allowInactive:true});
}

import {CentersError} from '../errors.js';
import {objectBody,idField,requestField} from '../domain/validation.js';
import {retentionFields,retentionActionFields} from '../domain/retention.js';
import {businessTransaction} from './context.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';
const conflict=code=>{throw new CentersError(409,code,'inactivity review changed; reload')};
const policyDto=row=>row?{enabled:row.enabled,daysWithoutVisit:row.days_without_visit,includeNeverVisited:row.include_never_visited,version:row.version}:{enabled:false,daysWithoutVisit:null,includeNeverVisited:false,version:0};
async function contextInfo(client,centerId){const {rows:[row]}=await client.query("SELECT state,timezone,(statement_timestamp() AT TIME ZONE timezone)::date::text AS today FROM centers.centers WHERE id=$1",[centerId]);return row}
async function policy(client,centerId){return policyDto((await client.query('SELECT * FROM centers.retention_policies WHERE center_id=$1',[centerId])).rows[0])}
const episodeId=(centerId,row)=>'ra_'+commandHash([centerId,row.id,row.episode_key]).slice(0,32);
const candidateQuery=`WITH candidates AS(
  SELECT m.id,m.name,m.member_number,m.joined_on,coalesce(v.id,'joined:'||m.joined_on) AS episode_key,
    coalesce((v.visited_at AT TIME ZONE $5)::date,m.joined_on) AS anchor_on,(v.visited_at AT TIME ZONE $5)::date AS last_visit_on
  FROM centers.member_profiles m LEFT JOIN LATERAL(
    SELECT a.id,a.visited_at FROM centers.access_visits a WHERE a.center_id=m.center_id AND a.member_id=m.id AND a.visited_at<=statement_timestamp() ORDER BY a.visited_at DESC,a.id DESC LIMIT 1
  )v ON true
  WHERE m.center_id=$1 AND m.state='active' AND m.joined_on<=$2::date AND (m.ends_on IS NULL OR m.ends_on>$2::date) AND ($4::text IS NULL OR m.id=$4)
),eligible AS(
  SELECT *,($2::date-anchor_on) AS days_without_visit FROM candidates WHERE ($6::boolean OR last_visit_on IS NOT NULL) AND $2::date-anchor_on>=$3
)`;
const candidateArgs=(centerId,info,config,memberId=null)=>[centerId,info.today,config.daysWithoutVisit,memberId,info.timezone,config.includeNeverVisited];
const alertDto=(centerId,row)=>({id:episodeId(centerId,row),memberId:row.id,name:row.name,number:row.member_number,lastVisitOn:row.last_visit_on?String(row.last_visit_on).slice(0,10):null,daysWithoutVisit:row.days_without_visit,neverVisited:row.last_visit_on==null});
const actionDto=row=>({id:row.id,memberId:row.member_id,name:row.name,number:row.member_number,outcome:row.outcome,note:row.note,createdAt:new Date(row.created_at).toISOString()});
async function actionRecord(client,centerId,id){const {rows:[row]}=await client.query('SELECT a.*,m.name,m.member_number FROM centers.retention_actions a JOIN centers.members m ON m.center_id=a.center_id AND m.id=a.member_id WHERE a.center_id=$1 AND a.id=$2',[centerId,id]);if(!row)throw new CentersError(404,'not-found','not found');return actionDto(row)}
export function listRetention(database,userId,centerId,options,{platform=false}={}){
  return businessTransaction(database,userId,centerId,'members.manage',async client=>{
    const info=await contextInfo(client,centerId),config=await policy(client,centerId),scope=cursorScope(['retention',userId,centerId,options.view,...(options.view==='open'?[config.version,info.today,info.timezone]:[])]),after=readCursor(options.cursor,scope);
    const result={policy:config,today:info.today,timezone:info.timezone,active:info.state==='active',view:options.view,items:[],nextCursor:null};
    if(options.view==='history'){
      const {rows}=await client.query('SELECT a.*,m.name,m.member_number,a.created_at::text AS cursor_at FROM centers.retention_actions a JOIN centers.members m ON m.center_id=a.center_id AND m.id=a.member_id WHERE a.center_id=$1 AND ($2::timestamptz IS NULL OR (a.created_at,a.id)<($2::timestamptz,$3::text)) ORDER BY a.created_at DESC,a.id DESC LIMIT 31',[centerId,after?.at||null,after?.id||null]);
      const page=rows.slice(0,30);return {...result,items:page.map(actionDto),nextCursor:rows.length>30?nextCursor(scope,page.at(-1)):null};
    }
    if(!config.enabled||!result.active)return result;
    const {rows}=await client.query(candidateQuery+` SELECT *,anchor_on::text AS anchor_on,last_visit_on::text AS last_visit_on,(anchor_on::timestamp AT TIME ZONE 'UTC')::text AS cursor_at FROM eligible e
      WHERE NOT EXISTS(SELECT 1 FROM centers.retention_actions a WHERE a.center_id=$1 AND a.member_id=e.id AND a.episode_key=e.episode_key)
      AND ($7::timestamptz IS NULL OR (anchor_on,id)>(($7::timestamptz AT TIME ZONE 'UTC')::date,$8::text)) ORDER BY e.anchor_on,e.id LIMIT 31`,[...candidateArgs(centerId,info,config),after?.at||null,after?.id||null]);
    const page=rows.slice(0,30);return {...result,items:page.map(row=>alertDto(centerId,row)),nextCursor:rows.length>30?nextCursor(scope,page.at(-1)):null};
  },{platform,allowInactive:true});
}
export function configureRetention({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','version','fields','requestId']);const centerId=idField(raw.centerId),version=raw.version,fields=retentionFields(raw.fields),requestId=requestField(raw.requestId),hash=commandHash({version,fields}),operation='retention.policy';
  if(!Number.isSafeInteger(version)||version<0)throw new CentersError(400,'invalid-input','policy revision required');
  return businessTransaction(database,user.id,centerId,'members.manage',async(client,context)=>{
    const old=await policy(client,centerId);if(await commandReplay(client,centerId,user.id,operation,requestId,hash)){checkSession();return {policy:old}}
    if(old.version!==version)conflict('version-conflict');if(fields.enabled&&context.center.state!=='active')conflict('center-inactive');checkSession();
    if(version===0)await client.query('INSERT INTO centers.retention_policies(center_id,enabled,days_without_visit,include_never_visited,actor_uid) VALUES($1,$2,$3,$4,$5)',[centerId,fields.enabled,fields.daysWithoutVisit,fields.includeNeverVisited,user.id]);
    else await client.query('UPDATE centers.retention_policies SET enabled=$2,days_without_visit=$3,include_never_visited=$4,actor_uid=$5,version=version+1,updated_at=clock_timestamp() WHERE center_id=$1',[centerId,fields.enabled,fields.daysWithoutVisit,fields.includeNeverVisited,user.id]);
    await businessAudit(client,centerId,user.id,operation,centerId,{enabled:fields.enabled});await rememberCommand(client,centerId,user.id,operation,requestId,hash,{});checkSession();return {policy:await policy(client,centerId)};
  },{platform,allowInactive:true});
}
export function reviewRetention({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','memberId','alertId','policyVersion','outcome','note','requestId']);const centerId=idField(raw.centerId),memberId=idField(raw.memberId),alertId=idField(raw.alertId),policyVersion=raw.policyVersion,fields=retentionActionFields(raw),requestId=requestField(raw.requestId),hash=commandHash({memberId,alertId,policyVersion,...fields}),operation='retention.review';
  if(!Number.isSafeInteger(policyVersion)||policyVersion<1)throw new CentersError(400,'invalid-input','reviewed policy revision required');
  return businessTransaction(database,user.id,centerId,'members.manage',async(client,context)=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay){checkSession();return {action:await actionRecord(client,centerId,replay.id)}}
    const config=await policy(client,centerId);if(!config.enabled||context.center.state!=='active')conflict('retention-unavailable');if(config.version!==policyVersion)conflict('version-conflict');
    const info=await contextInfo(client,centerId),{rows:[row]}=await client.query(candidateQuery+' SELECT * FROM eligible',candidateArgs(centerId,info,config,memberId));
    if(!row||episodeId(centerId,row)!==alertId)conflict('retention-alert-changed');
    const handled=await client.query('SELECT id FROM centers.retention_actions WHERE center_id=$1 AND member_id=$2 AND episode_key=$3',[centerId,memberId,row.episode_key]);if(handled.rows.length)conflict('retention-already-reviewed');checkSession();
    await client.query('INSERT INTO centers.retention_actions(id,center_id,member_id,episode_key,outcome,note,actor_uid) VALUES($1,$2,$3,$4,$5,$6,$7)',[alertId,centerId,memberId,row.episode_key,fields.outcome,fields.note,user.id]);
    await businessAudit(client,centerId,user.id,operation,alertId,{outcome:fields.outcome,policyVersion});await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id:alertId});checkSession();return {action:await actionRecord(client,centerId,alertId)};
  },{platform,allowInactive:true});
}

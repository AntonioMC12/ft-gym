import {CentersError} from '../errors.js';
import {objectBody,idField,requestField} from '../domain/validation.js';
import {classFields} from '../domain/classes.js';
import {classSeriesInput,SERIES_MAX_CLASSES} from '../domain/class-series.js';
import {businessTransaction} from './context.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
import {classDto,insertScheduledClass,instructorReviewFlags} from './classes.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';

const conflict=code=>{throw new CentersError(409,code,'review class series again')};
const seriesDto=row=>({id:row.id,name:row.name,timezone:row.timezone,total:row.total,definition:row.definition,createdAt:new Date(row.created_at).toISOString()});

async function reviewSeries(client,centerId,uid,input,lookupAccount){
  const {rows:[center]}=await client.query("SELECT timezone,(statement_timestamp() AT TIME ZONE timezone)::date::text AS today FROM centers.centers WHERE id=$1",[centerId]);
  if(center.timezone!==input.timezone)conflict('class-timezone-changed');
  if(input.fields.date<center.today)conflict('class-closed');
  const {rows:plans}=await client.query('SELECT id FROM centers.membership_plans WHERE center_id=$1 AND id=ANY($2::text[]) AND archived_at IS NULL',[centerId,input.fields.eligiblePlanIds]);
  let teacher=null,account=null;
  if(input.fields.instructorAssignmentId){
    const {rows}=await client.query('SELECT account_uid FROM centers.role_assignments WHERE center_id=$1 AND id=$2',[centerId,input.fields.instructorAssignmentId]);
    teacher=rows[0]?.account_uid||null;account=teacher?lookupAccount(teacher):null;
  }
  const enabled=!!account&&!account.disabled&&typeof account.name==='string'&&account.name.trim().length>0&&account.name.trim().length<=120&&!/[\u0000-\u001f\u007f]/.test(account.name);
  const instructorName=enabled?account.name.trim():null,entries=[];
  const rows=input.dates.map(({date,excluded})=>{
    if(excluded)return {date,status:'excluded'};
    try{
      const fields=classFields({...input.fields,date},{timezone:center.timezone});
      const row={date,status:'ready',startsAt:fields.startsAt,endsAt:fields.endsAt,room:fields.room||null,instructorName};entries.push({row,fields});return row;
    }catch(error){if(!(error instanceof CentersError))throw error;return {date,status:'error',code:error.code}}
  });
  if(entries.length){
    const {rows:checks}=await client.query(`SELECT i.date,CASE
      WHEN i."startsAt"<=clock_timestamp() THEN 'class-closed'
      WHEN NOT $6::boolean THEN 'class-plan-required'
      WHEN $4::text IS NOT NULL AND (NOT $7::boolean OR NOT EXISTS(SELECT 1 FROM centers.role_assignments r WHERE r.center_id=$1 AND r.id=$4 AND r.account_uid=$5
        AND r.revoked_at IS NULL AND r.valid_from<=clock_timestamp() AND (r.valid_until IS NULL OR r.valid_until>=i."endsAt"))) THEN 'class-instructor-unavailable'
      WHEN $3::text IS NOT NULL AND EXISTS(SELECT 1 FROM centers.classes c WHERE c.center_id=$1 AND c.state='scheduled'
        AND c.room_key=lower(btrim(regexp_replace($3,'[[:space:]]+',' ','g'))) AND c.starts_at<i."endsAt" AND c.ends_at>i."startsAt") THEN 'class-room-conflict'
      WHEN $5::text IS NOT NULL AND EXISTS(SELECT 1 FROM centers.classes c WHERE c.center_id=$1 AND c.state='scheduled' AND c.instructor_uid=$5
        AND c.starts_at<i."endsAt" AND c.ends_at>i."startsAt") THEN 'class-instructor-conflict'
      ELSE NULL END AS code
      FROM jsonb_to_recordset($2::jsonb)i(date text,"startsAt" timestamptz,"endsAt" timestamptz)`,
    [centerId,JSON.stringify(entries.map(({row})=>row)),input.fields.room||null,input.fields.instructorAssignmentId||null,teacher,plans.length===input.fields.eligiblePlanIds.length,enabled]);
    const byDate=new Map(checks.map(row=>[row.date,row.code]));for(const entry of entries){const code=byDate.get(entry.row.date);if(code){entry.row.status='error';entry.row.code=code}}
  }
  const summary={total:rows.length,ready:rows.filter(row=>row.status==='ready').length,excluded:rows.filter(row=>row.status==='excluded').length,errors:rows.filter(row=>row.status==='error').length};
  const limitExceeded=summary.ready>SERIES_MAX_CLASSES;
  const reviewHash=commandHash({definitionVersion:1,uid,centerId,fields:input.fields,rule:input.rule,timezone:input.timezone,teacher,rows,limitExceeded});
  return {dto:{definitionVersion:1,timezone:input.timezone,rows,summary,limitExceeded,reviewHash},entries,instructorName,teacher};
}

export function previewClassSeries({database,user,checkSession,lookupAccount},raw,{platform=false}={}){
  objectBody(raw,['centerId','fields','rule','timezone']);const centerId=idField(raw.centerId),input=classSeriesInput(raw.fields,raw.rule,raw.timezone);
  return businessTransaction(database,user.id,centerId,'classes.manage',async client=>{const review=await reviewSeries(client,centerId,user.id,input,lookupAccount);checkSession();return review.dto},{platform});
}

async function seriesDetails(client,centerId,id,lookupAccount){
  const {rows:[series]}=await client.query('SELECT * FROM centers.class_series WHERE center_id=$1 AND id=$2',[centerId,id]);
  if(!series)throw new CentersError(404,'not-found','not found');
  const {rows}=await client.query('SELECT *,class_on::text FROM centers.classes WHERE center_id=$1 AND series_id=$2 ORDER BY series_position',[centerId,id]);
  const reviews=await instructorReviewFlags(client,centerId,rows,lookupAccount);
  const {rows:[center]}=await client.query("SELECT id,name,state,timezone,(statement_timestamp() AT TIME ZONE timezone)::date::text AS today FROM centers.centers WHERE id=$1",[centerId]);
  return {series:seriesDto(series),classes:rows.map(row=>({...classDto(row),instructorNeedsReview:reviews.get(row.id)||false})),center:{id:center.id,name:center.name,state:center.state,timezone:center.timezone},today:center.today,from:series.definition.fields.date,to:series.definition.rule.until,nextCursor:null};
}

export async function createClassSeries({database,user,checkSession,lookupAccount,accountLocks},raw,{platform=false}={}){
  objectBody(raw,['centerId','fields','rule','timezone','reviewHash','requestId']);
  const centerId=idField(raw.centerId),input=classSeriesInput(raw.fields,raw.rule,raw.timezone),requestId=requestField(raw.requestId),reviewHash=raw.reviewHash;
  if(typeof reviewHash!=='string'||!/^[a-f0-9]{64}$/.test(reviewHash))throw new CentersError(400,'invalid-input','valid series review required');
  const operation='class.series.create',hash=commandHash({input,reviewHash});let teacher=null;
  if(input.fields.instructorAssignmentId)teacher=await businessTransaction(database,user.id,centerId,'classes.manage',async client=>{
    const {rows}=await client.query('SELECT account_uid FROM centers.role_assignments WHERE center_id=$1 AND id=$2',[centerId,input.fields.instructorAssignmentId]);return rows[0]?.account_uid||conflict('class-instructor-unavailable');
  },{platform,allowInactive:true});
  const execute=()=>businessTransaction(database,user.id,centerId,'classes.manage',async(client,context)=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return seriesDetails(client,centerId,replay.id,lookupAccount);
    if(context.center.state!=='active')conflict('center-inactive');
    const review=await reviewSeries(client,centerId,user.id,input,lookupAccount);
    if(review.teacher!==teacher)conflict('class-series-review-changed');
    if(review.dto.reviewHash!==reviewHash)conflict('class-series-review-changed');
    if(review.dto.summary.errors||review.dto.limitExceeded||!review.dto.summary.ready)conflict('class-series-invalid');
    checkSession();const id='cs_'+commandHash([centerId,user.id,requestId]).slice(0,32),definition={definitionVersion:1,fields:input.fields,rule:input.rule};
    await client.query('INSERT INTO centers.class_series(id,center_id,name,timezone,total,definition,actor_uid) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,centerId,input.fields.name,input.timezone,review.dto.summary.ready,definition,user.id]);
    let position=0;for(const entry of review.entries){if(entry.row.status!=='ready')continue;checkSession();
      await insertScheduledClass(client,{centerId,userId:user.id,id:'cl_'+commandHash([id,entry.row.date]).slice(0,32),fields:entry.fields,instructorName:review.instructorName,seriesId:id,seriesPosition:++position});
    }
    await businessAudit(client,centerId,user.id,'class.series.created',id,{classes:position,excluded:review.dto.summary.excluded});
    await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id});checkSession();return seriesDetails(client,centerId,id,lookupAccount);
  },{platform,allowInactive:true});
  return teacher?accountLocks.withAccounts([user.id,teacher],execute):execute();
}

export function classSeriesPageOptions(params,{detail=false}={}){
  if([...params.keys()].some(key=>!(detail?['centerId','id']:['centerId','cursor']).includes(key))||(params.get('cursor')||'').length>2000)throw new CentersError(400,'invalid-input','invalid series selectors');
  return detail?{id:idField(params.get('id'))}:{cursor:params.get('cursor')||null};
}
export function getClassSeries(database,uid,centerId,id,{platform=false,lookupAccount}={}){
  return businessTransaction(database,uid,centerId,'classes.manage',client=>seriesDetails(client,centerId,id,lookupAccount),{platform,allowInactive:true});
}
export function listClassSeries(database,uid,centerId,options,{platform=false}={}){
  const scope=cursorScope(['class-series',uid,centerId]),after=readCursor(options.cursor,scope);
  return businessTransaction(database,uid,centerId,'classes.manage',async client=>{
    const {rows}=await client.query('SELECT *,created_at::text AS cursor_at FROM centers.class_series WHERE center_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::text)) ORDER BY created_at DESC,id DESC LIMIT 31',[centerId,after?.at||null,after?.id||null]);
    const page=rows.slice(0,30);return {series:page.map(seriesDto),nextCursor:rows.length>30?nextCursor(scope,page.at(-1)):null};
  },{platform,allowInactive:true});
}

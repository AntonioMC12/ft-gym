import {CentersError} from '../errors.js';
import {objectBody,idField,versionField,requestField,textField} from '../domain/validation.js';
import {membershipDate} from '../domain/membership-transitions.js';
import {classFields} from '../domain/classes.js';
import {businessTransaction} from './context.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';

const conflict=code=>{throw new CentersError(409,code,'class or reservation changed; reload')};
const missing=()=>{throw new CentersError(404,'not-found','not found')};
const reservationDto=row=>({id:row.id,classId:row.class_id,memberId:row.member_id,state:row.state,version:row.version,reason:row.reason,queueOrder:String(row.queue_order)});
const classDto=row=>({id:row.id,name:row.name,date:row.class_on,startsAt:new Date(row.starts_at).toISOString(),endsAt:new Date(row.ends_at).toISOString(),timezone:row.timezone,
  capacity:row.capacity,waitlistCapacity:row.waitlist_capacity,cancelBeforeMinutes:row.cancel_before_minutes,booked:row.booked_count,waiting:row.waiting_count,state:row.state,version:row.version,cancelReason:row.cancel_reason,room:row.room||null});
async function ownMember(client,centerId,uid){const {rows}=await client.query('SELECT id FROM centers.members WHERE center_id=$1 AND account_uid=$2',[centerId,uid]);return rows[0]?.id||missing()}
async function eventRecord(client,centerId,id){const {rows}=await client.query('SELECT *,class_on::text FROM centers.classes WHERE center_id=$1 AND id=$2',[centerId,id]);return rows[0]||missing()}
async function reservationRecord(client,centerId,id){const {rows}=await client.query('SELECT * FROM centers.class_reservations WHERE center_id=$1 AND id=$2',[centerId,id]);return rows[0]||missing()}
async function ownProjection(client,event,memberId,uid){
  const {rows:[flags]}=await client.query(`SELECT centers.class_eligible($1,$2) AS eligible,clock_timestamp()<$3::timestamptz AS open,
    clock_timestamp()<$3::timestamptz-make_interval(mins=>$4) AS can_cancel`,[event.id,memberId,event.starts_at,event.cancel_before_minutes]);
  const {rows}=await client.query('SELECT * FROM centers.class_reservations WHERE center_id=$1 AND class_id=$2 AND member_id=$3 AND actor_uid=$4 ORDER BY queue_order DESC LIMIT 1',[event.center_id,event.id,memberId,uid]);
  return {eligible:flags.eligible,bookingOpen:flags.open,canCancel:flags.can_cancel,ownReservation:rows[0]?reservationDto(rows[0]):null};
}
export function classListOptions(params,{detail=false}={}){
  if([...params.keys()].some(key=>!['centerId',...(detail?['id','cursor']:['from','to','cursor'])].includes(key)))throw new CentersError(400,'invalid-input','invalid class selectors');
  if(detail)return {id:idField(params.get('id')),cursor:params.get('cursor')||null};
  const from=params.get('from'),to=params.get('to');if(!!from!==!!to)throw new CentersError(400,'invalid-input','both class dates required');
  if(from){membershipDate(from);membershipDate(to);if(to<from||Date.parse(to)-Date.parse(from)>93*86400000)throw new CentersError(400,'invalid-input','bounded class date range required')}
  return {from,to,cursor:params.get('cursor')||null};
}
export function listClasses(database,uid,centerId,options,{platform=false,own=false}={}){
  return businessTransaction(database,uid,centerId,own?'classes.own.read':'classes.read',async(client,context)=>{
    const {rows:[clock]}=await client.query("SELECT timezone,(statement_timestamp() AT TIME ZONE timezone)::date::text AS today,((statement_timestamp() AT TIME ZONE timezone)::date-7)::text AS from_on,((statement_timestamp() AT TIME ZONE timezone)::date+30)::text AS to_on FROM centers.centers WHERE id=$1",[centerId]);
    const from=options.from||clock.from_on,to=options.to||clock.to_on,scope=cursorScope({kind:'classes',uid,centerId,from,to,own}),after=readCursor(options.cursor,scope),memberId=own?await ownMember(client,centerId,uid):null;
    const {rows}=await client.query(`SELECT c.*,c.class_on::text,c.starts_at::text AS cursor_at,
      CASE WHEN $8::boolean THEN centers.class_eligible(c.id,$6) ELSE NULL END AS eligible,
      clock_timestamp()<c.starts_at AS booking_open,clock_timestamp()<c.starts_at-make_interval(mins=>c.cancel_before_minutes) AS can_cancel,
      row_to_json(own_row) AS own_reservation
      FROM centers.classes c LEFT JOIN LATERAL (SELECT r.id,r.class_id,r.member_id,r.state,r.version,r.reason,r.queue_order::text
        FROM centers.class_reservations r WHERE $8::boolean AND r.center_id=c.center_id AND r.class_id=c.id AND r.member_id=$6 AND r.actor_uid=$7 ORDER BY r.queue_order DESC LIMIT 1)own_row ON true
      WHERE c.center_id=$1 AND c.class_on BETWEEN $2::date AND $3::date
      AND ($4::timestamptz IS NULL OR (c.starts_at,c.id)>($4::timestamptz,$5)) ORDER BY c.starts_at,c.id LIMIT 31`,[centerId,from,to,after?.at||null,after?.id||null,memberId,uid,own]);
    const page=rows.slice(0,30),classes=page.map(row=>({...classDto(row),...(own?{eligible:row.eligible,bookingOpen:row.booking_open,canCancel:row.can_cancel,ownReservation:row.own_reservation?reservationDto(row.own_reservation):null}:{})}));
    return {center:{id:centerId,name:context.center.name,state:context.center.state,timezone:clock.timezone},today:clock.today,from,to,classes,nextCursor:rows.length>30?nextCursor(scope,page.at(-1)):null};
  },{platform,allowInactive:true});
}
export function classRoster(database,uid,centerId,options,{platform=false}={}){
  return businessTransaction(database,uid,centerId,'classes.manage',async client=>{
    const event=await eventRecord(client,centerId,options.id),scope=cursorScope({kind:'class-roster',uid,centerId,id:event.id});let after='0';
    if(options.cursor){try{const value=JSON.parse(Buffer.from(options.cursor,'base64url').toString('utf8'));if(value.scope!==scope||typeof value.after!=='string'||! /^[1-9][0-9]{0,18}$/.test(value.after)||BigInt(value.after)>9223372036854775807n)throw new Error();after=value.after}catch{throw new CentersError(400,'invalid-input','invalid class roster cursor')}}
    const {rows}=await client.query(`SELECT r.*,m.name,m.member_number FROM centers.class_reservations r JOIN centers.members m ON (m.center_id,m.id)=(r.center_id,r.member_id)
      WHERE r.center_id=$1 AND r.class_id=$2 AND r.queue_order>$3::bigint ORDER BY r.queue_order LIMIT 51`,[centerId,event.id,after]);
    const page=rows.slice(0,50),{rows:plans}=await client.query('SELECT plan_id FROM centers.class_plans WHERE center_id=$1 AND class_id=$2 ORDER BY plan_id',[centerId,event.id]);
    const {rows:[clock]}=await client.query('SELECT clock_timestamp()>=$1::timestamptz AS started,clock_timestamp()>=$2::timestamptz AS ended',[event.starts_at,event.ends_at]);
    return {event:{...classDto(event),eligiblePlanIds:plans.map(row=>row.plan_id),attendanceOpen:clock.started,noShowOpen:clock.ended,canCancelClass:event.state==='scheduled'&&!clock.started},reservations:page.map(row=>({...reservationDto(row),name:row.name,number:row.member_number})),nextCursor:rows.length>50?Buffer.from(JSON.stringify({scope,after:String(page.at(-1).queue_order)})).toString('base64url'):null};
  },{platform,allowInactive:true});
}
export function createClass({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','fields','requestId']);const centerId=idField(raw.centerId),requestId=requestField(raw.requestId),operation='class.create';
  return businessTransaction(database,user.id,centerId,'classes.manage',async client=>{
    const {rows:[center]}=await client.query('SELECT timezone FROM centers.centers WHERE id=$1',[centerId]),fields=classFields(raw.fields,{timezone:center.timezone}),hash=commandHash(fields);
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return {event:classDto(await eventRecord(client,centerId,replay.id))};
    const {rows:[clock]}=await client.query('SELECT $1::timestamptz>clock_timestamp() AS future',[fields.startsAt]);if(!clock.future)conflict('class-closed');
    const {rows:plans}=await client.query('SELECT id FROM centers.membership_plans WHERE center_id=$1 AND id=ANY($2::text[]) AND archived_at IS NULL',[centerId,fields.eligiblePlanIds]);if(plans.length!==fields.eligiblePlanIds.length)conflict('class-plan-required');
    const id='cl_'+commandHash([centerId,user.id,requestId]).slice(0,32);checkSession();
    await client.query('INSERT INTO centers.classes(id,center_id,name,class_on,starts_at,ends_at,timezone,capacity,waitlist_capacity,cancel_before_minutes,actor_uid,room) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,centerId,fields.name,fields.date,fields.startsAt,fields.endsAt,fields.timezone,fields.capacity,fields.waitlistCapacity,fields.cancelBeforeMinutes,user.id,fields.room||null]);
    await client.query('INSERT INTO centers.class_plans(center_id,class_id,plan_id) SELECT $1,$2,p FROM unnest($3::text[])p',[centerId,id,fields.eligiblePlanIds]);
    await businessAudit(client,centerId,user.id,'class.created',id,{startsAt:fields.startsAt,endsAt:fields.endsAt,capacity:fields.capacity,waitlistCapacity:fields.waitlistCapacity,cancelBeforeMinutes:fields.cancelBeforeMinutes});
    await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id});checkSession();return {event:classDto(await eventRecord(client,centerId,id))};
  },{platform});
}
export function reserveClass({database,user,checkSession},raw){
  objectBody(raw,['centerId','id','requestId']);const centerId=idField(raw.centerId),id=idField(raw.id),requestId=requestField(raw.requestId),hash=commandHash({id}),operation='class.reserve';
  return businessTransaction(database,user.id,centerId,'classes.own.reserve',async(client,context)=>{
    const memberId=await ownMember(client,centerId,user.id),event=await eventRecord(client,centerId,id),replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);
    if(replay)return {reservation:reservationDto(await reservationRecord(client,centerId,replay.id))};
    if(context.center.state!=='active')conflict('center-inactive');
    const flags=await ownProjection(client,event,memberId,user.id);if(!flags.eligible)conflict('class-ineligible');if(!flags.bookingOpen)conflict('class-closed');
    if(flags.ownReservation&&['booked','waiting','attended'].includes(flags.ownReservation.state))conflict('class-already-booked');
    if(event.booked_count>=event.capacity&&event.waiting_count>=event.waitlist_capacity)conflict('class-full');checkSession();
    const reservationId='rb_'+commandHash([centerId,user.id,requestId]).slice(0,32);
    const {rows}=await client.query('INSERT INTO centers.class_reservations(id,center_id,class_id,member_id,actor_uid) VALUES($1,$2,$3,$4,$5) RETURNING *',[reservationId,centerId,id,memberId,user.id]);
    await businessAudit(client,centerId,user.id,'class.reserved',reservationId,{classId:id,state:rows[0].state});await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id:reservationId});checkSession();return {reservation:reservationDto(rows[0])};
  },{allowInactive:true});
}
export function cancelClassReservation({database,user,checkSession},raw){
  objectBody(raw,['centerId','id','version','requestId']);const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version),requestId=requestField(raw.requestId),hash=commandHash({id,version}),operation='class.reservation.cancel';
  return businessTransaction(database,user.id,centerId,'classes.own.reserve',async(client,context)=>{
    const row=await reservationRecord(client,centerId,id),memberId=await ownMember(client,centerId,user.id);if(row.actor_uid!==user.id||row.member_id!==memberId)missing();
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return {reservation:reservationDto(row)};
    if(context.center.state!=='active')conflict('center-inactive');
    if(row.version!==version)conflict('version-conflict');if(!['booked','waiting'].includes(row.state))conflict('class-reservation-ended');
    const event=await eventRecord(client,centerId,row.class_id),flags=await ownProjection(client,event,memberId,user.id);if(!flags.canCancel)conflict('class-cancel-closed');
    checkSession();await client.query('SELECT centers.cancel_own_class_reservation($1,$2)',[id,version]);await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id});checkSession();return {reservation:reservationDto(await reservationRecord(client,centerId,id))};
  },{allowInactive:true});
}
export function cancelClass({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','id','version','reason','requestId']);const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version),reason=textField(raw.reason,250,{required:true}),requestId=requestField(raw.requestId),hash=commandHash({id,version,reason}),operation='class.cancel';
  return businessTransaction(database,user.id,centerId,'classes.manage',async client=>{
    const event=await eventRecord(client,centerId,id),replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return {event:classDto(event)};
    if(event.version!==version)conflict('version-conflict');const {rows:[clock]}=await client.query('SELECT $1::timestamptz>clock_timestamp() AS future',[event.starts_at]);if(event.state!=='scheduled'||!clock.future)conflict('class-closed');checkSession();
    await client.query("UPDATE centers.classes SET state='canceled',cancel_reason=$3,version=version+1 WHERE center_id=$1 AND id=$2",[centerId,id,reason]);
    await client.query("UPDATE centers.class_reservations SET state='canceled',reason=$3,version=version+1 WHERE center_id=$1 AND class_id=$2 AND state IN ('booked','waiting')",[centerId,id,reason]);
    await businessAudit(client,centerId,user.id,'class.canceled',id);await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id});checkSession();return {event:classDto(await eventRecord(client,centerId,id))};
  },{platform,allowInactive:true});
}
export function classAttendance({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','id','version','state','requestId']);const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version),requestId=requestField(raw.requestId),state=raw.state,hash=commandHash({id,version,state}),operation='class.attendance';
  if(!['attended','no-show'].includes(state))throw new CentersError(400,'invalid-input','explicit class attendance required');
  return businessTransaction(database,user.id,centerId,'classes.manage',async client=>{
    const row=await reservationRecord(client,centerId,id),replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return {reservation:reservationDto(row)};
    if(row.version!==version)conflict('version-conflict');if(row.state!=='booked')conflict('class-reservation-ended');
    const event=await eventRecord(client,centerId,row.class_id),{rows:[clock]}=await client.query('SELECT clock_timestamp()>=$1::timestamptz AS started,clock_timestamp()>=$2::timestamptz AS ended',[event.starts_at,event.ends_at]);
    if(!clock.started||state==='no-show'&&!clock.ended)conflict('class-not-ended');checkSession();
    const {rows}=await client.query('UPDATE centers.class_reservations SET state=$3,version=version+1 WHERE center_id=$1 AND id=$2 RETURNING *',[centerId,id,state]);
    await businessAudit(client,centerId,user.id,'class.'+state,id,{classId:event.id});await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id});checkSession();return {reservation:reservationDto(rows[0])};
  },{platform,allowInactive:true});
}

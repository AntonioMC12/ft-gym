import {CentersError} from '../errors.js';
import {objectBody,idField,versionField,requestField,textField} from '../domain/validation.js';
import {membershipDate} from '../domain/membership-transitions.js';
import {billingAnchor} from '../domain/billing-calendar.js';
import {businessTransaction} from './context.js';
import {memberRecord} from './member-records.js';
import {membershipHistory} from './membership-lifecycle.js';
import {memberDto} from '../authz.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';

const conflict=code=>new CentersError(409,code,'subscription conflicts with current contract');
async function terms(client,centerId,id) {
  const {rows}=await client.query(`SELECT v.*,p.archived_at,p.current_revision FROM centers.membership_plan_versions v JOIN centers.membership_plans p ON (p.center_id,p.id)=(v.center_id,v.plan_id) WHERE v.center_id=$1 AND v.id=$2`,[centerId,id]);
  if(!rows.length)throw new CentersError(404,'not-found','not found');
  if(rows[0].archived_at)throw conflict('plan-archived');if(rows[0].revision!==rows[0].current_revision)throw conflict('price-version-changed');return rows[0];
}
async function rowsFor(client,centerId,memberId) {
  const {rows}=await client.query(`SELECT s.*,s.starts_on::text AS starts_on,s.ends_on::text AS ends_on,s.anchor_on::text AS anchor_on,
    v.name,v.price_minor,v.currency,v.interval_months,v.price_includes_tax,v.tax_basis_points,v.proration
    FROM centers.subscriptions s JOIN centers.membership_plan_versions v ON (v.center_id,v.id)=(s.center_id,s.price_version_id)
    WHERE s.center_id=$1 AND s.member_id=$2 ORDER BY (s.canceled_at IS NULL) DESC,s.starts_on DESC,s.created_at DESC LIMIT 100`,[centerId,memberId]);return rows;
}
function dto(row,member) {
  const end=member.ends_on&&(row.ends_on===null||member.ends_on<row.ends_on)?member.ends_on:row.ends_on;
  return {id:row.id,centerId:row.center_id,memberId:row.member_id,planId:row.plan_id,priceVersionId:row.price_version_id,name:row.name,
    startsOn:row.starts_on,endsOn:row.ends_on,effectiveEndsOn:end,billingDay:row.billing_day,anchorOn:row.anchor_on,timezone:row.timezone,
    priceMinor:row.price_minor,currency:row.currency,intervalMonths:row.interval_months,priceIncludesTax:row.price_includes_tax,taxBasisPoints:row.tax_basis_points,proration:row.proration,
    discountBasisPoints:row.discount_basis_points,discountReason:row.discount_reason,version:row.version,canceled:!!row.canceled_at,
    status:row.canceled_at?'canceled':end&&end<=member.local_today?'ended':row.starts_on>member.local_today?'scheduled':member.state==='frozen'?'frozen':'active',
    canCancel:!row.canceled_at&&row.starts_on>member.local_today};
}
async function result(client,context,memberId,{bump=false}={}) {
  if(bump)await client.query('UPDATE centers.members SET version=version+1,updated_at=NOW() WHERE center_id=$1 AND id=$2',[context.centerId,memberId]);
  const member=await memberRecord(client,context.centerId,memberId),rows=await rowsFor(client,context.centerId,memberId);
  return {member:memberDto(member,context.capabilities),...await membershipHistory(client,context,member),subscriptions:rows.map(row=>dto(row,member))};
}
function input(raw,change) {
  objectBody(raw,['centerId','memberId','memberVersion','priceVersionId','effectiveOn','discountBasisPoints','discountReason','requestId',...(change?['id']:[])]);
  const centerId=idField(raw.centerId),memberId=idField(raw.memberId),memberVersion=versionField(raw.memberVersion),priceVersionId=idField(raw.priceVersionId),effectiveOn=membershipDate(raw.effectiveOn),requestId=requestField(raw.requestId);
  const discountBasisPoints=raw.discountBasisPoints??0,discountReason=textField(raw.discountReason,250,{required:discountBasisPoints!==0});
  if(!Number.isSafeInteger(discountBasisPoints)||discountBasisPoints<0||discountBasisPoints>10000)throw new CentersError(400,'invalid-input','invalid discount');
  return {centerId,memberId,memberVersion,priceVersionId,effectiveOn,requestId,discountBasisPoints,discountReason,...(change?{id:idField(raw.id)}:{})};
}
async function write(context,raw,change,{platform=false}={}) {
  const values=input(raw,change),{centerId,memberId,memberVersion,priceVersionId,effectiveOn,requestId,discountBasisPoints,discountReason}=values,operation=change?'subscription.change':'subscription.create';
  const {requestId:ignored,...content}=values,hash=commandHash(content);
  return businessTransaction(context.database,context.user.id,centerId,'billing.manage',async(client,scope)=>{
    const replay=await commandReplay(client,centerId,context.user.id,operation,requestId,hash);if(replay)return replay;
    const member=await memberRecord(client,centerId,memberId,{version:memberVersion});
    if(member.state==='ended')throw conflict('invalid-transition');
    if(effectiveOn<member.local_today||effectiveOn<member.joined_on)throw new CentersError(400,'invalid-input','retroactive subscription');
    if(member.ends_on&&effectiveOn>=member.ends_on)throw conflict('subscription-ended');
    const price=await terms(client,centerId,priceVersionId),existing=await rowsFor(client,centerId,memberId),id='su_'+commandHash([centerId,context.user.id,requestId]).slice(0,32);
    let previous=null,activationId=null;
    if(change){
      previous=existing.find(row=>row.id===values.id&&!row.canceled_at);
      if(!previous)throw new CentersError(404,'not-found','not found');
      if(previous.starts_on>effectiveOn||previous.ends_on&&previous.ends_on<=effectiveOn||existing.some(row=>!row.canceled_at&&row.starts_on>member.local_today))throw conflict('pending-subscription');
      await client.query('UPDATE centers.subscriptions SET ends_on=$3,version=version+1 WHERE center_id=$1 AND id=$2',[centerId,previous.id,effectiveOn]);
    }else{
      if(existing.some(row=>!row.canceled_at&&(!row.ends_on||row.ends_on>effectiveOn)))throw conflict('subscription-overlap');
      if(member.state==='preactive'){
        const {rows:pending}=await client.query('SELECT id FROM centers.membership_changes WHERE center_id=$1 AND member_id=$2 AND canceled_at IS NULL AND effective_on>$3',[centerId,memberId,member.local_today]);
        if(pending.length)throw conflict('pending-transition');
        activationId=id+'_a';
        await client.query(`INSERT INTO centers.membership_changes(id,center_id,member_id,sequence,action,from_state,to_state,effective_on,actor_uid)
          SELECT $1,$2,$3,COALESCE(MAX(sequence),0)+1,'activate','preactive','active',$4,$5 FROM centers.membership_changes WHERE center_id=$2 AND member_id=$3`,[activationId,centerId,memberId,effectiveOn,context.user.id]);
      }
    }
    const {rows:centers}=await client.query('SELECT billing_day,timezone FROM centers.centers WHERE id=$1',[centerId]);
    const calendar=centers[0];context.checkSession();
    await client.query(`INSERT INTO centers.subscriptions(id,center_id,member_id,plan_id,price_version_id,starts_on,ends_on,billing_day,anchor_on,timezone,discount_basis_points,discount_reason,replaces_id,previous_ends_on,activation_id,actor_uid)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[id,centerId,memberId,price.plan_id,priceVersionId,effectiveOn,previous?.ends_on||null,calendar.billing_day,billingAnchor(effectiveOn,calendar.billing_day),calendar.timezone,discountBasisPoints,discountReason,previous?.id||null,previous?.ends_on||null,activationId,context.user.id]);
    await businessAudit(client,centerId,context.user.id,operation,id,{memberId,priceVersionId,effectiveOn,replacesId:previous?.id||null});
    const response=await result(client,scope,memberId,{bump:true});await rememberCommand(client,centerId,context.user.id,operation,requestId,hash,response);context.checkSession();return response;
  },{platform});
}
export const createSubscription=(context,raw,options)=>write(context,raw,false,options);
export const changeSubscription=(context,raw,options)=>write(context,raw,true,options);
export async function cancelSubscription({database,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','memberId','memberVersion','id','requestId']);
  const centerId=idField(raw.centerId),memberId=idField(raw.memberId),memberVersion=versionField(raw.memberVersion),id=idField(raw.id),requestId=requestField(raw.requestId),hash=commandHash({memberId,memberVersion,id}),operation='subscription.cancel';
  return businessTransaction(database,user.id,centerId,'billing.manage',async(client,scope)=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const member=await memberRecord(client,centerId,memberId,{version:memberVersion});
    const {rows}=await client.query('SELECT *,starts_on::text AS starts_on,previous_ends_on::text AS previous_ends_on FROM centers.subscriptions WHERE center_id=$1 AND member_id=$2 AND id=$3 FOR UPDATE',[centerId,memberId,id]);
    if(!rows.length)throw new CentersError(404,'not-found','not found');
    const row=rows[0];if(row.canceled_at||row.starts_on<=member.local_today)throw conflict('invalid-transition');checkSession();
    await client.query('UPDATE centers.subscriptions SET canceled_at=NOW(),canceled_by=$3,version=version+1 WHERE center_id=$1 AND id=$2',[centerId,id,user.id]);
    if(row.replaces_id)await client.query('UPDATE centers.subscriptions SET ends_on=$3,version=version+1 WHERE center_id=$1 AND id=$2',[centerId,row.replaces_id,row.previous_ends_on]);
    if(row.activation_id)await client.query('UPDATE centers.membership_changes SET canceled_at=NOW(),canceled_by=$4 WHERE center_id=$1 AND member_id=$2 AND id=$3',[centerId,memberId,row.activation_id,user.id]);
    await businessAudit(client,centerId,user.id,operation,id,{memberId,restoredId:row.replaces_id});
    const response=await result(client,scope,memberId,{bump:true});await rememberCommand(client,centerId,user.id,operation,requestId,hash,response);checkSession();return response;
  },{platform});
}
export const listSubscriptions=(database,uid,centerId,memberId,options)=>businessTransaction(database,uid,centerId,'billing.read',(client,scope)=>result(client,scope,memberId),{...options,allowInactive:options?.platform});

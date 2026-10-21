import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
export const shift=(day,n)=>{const value=new Date(day+'T00:00:00Z');value.setUTCDate(value.getUTCDate()+n);return value.toISOString().slice(0,10)};
export async function fixture(t,{instructors=0}={}){
  const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await db.close();await migrator.end()});
  const p='cls_'+randomBytes(5).toString('hex'),ids=Object.fromEntries(['root','manager','alice','bob','charlie','trainer','technical'].map(key=>[key,p+'_'+key]));
  const extra=Array.from({length:instructors},(_,index)=>({id:p+'_instructor_'+index,name:'Teacher '+index}));
  const h=await startHttp(t,{app,superadminUids:[ids.root],users:[...Object.entries(ids).map(([key,id])=>({id,name:id,...(key==='technical'?{admin:true}:{})})),...extra]});
  const req=async(path,uid,body)=>{const response=await fetch(h.base+path,{headers:h.headers(uid),...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}};
  const center=(await req('/api/platform/centers/create',ids.root,{name:p,managerUid:ids.manager,requestId:p+'_center'})).body.center.id;
  const other=(await req('/api/platform/centers/create',ids.root,{name:p+' other',managerUid:ids.root,requestId:p+'_other'})).body.center.id;
  assert.equal((await req('/api/centers/staff/assign',ids.manager,{centerId:center,version:1,accountUid:ids.trainer})).status,200);
  if(extra.length)await db.platformTransaction(ids.root,async client=>{for(const [i,account] of extra.entries())await client.query("INSERT INTO centers.role_assignments(id,center_id,account_uid,role) VALUES($1,$2,$3,'trainer')",[p+'_role_'+i,center,account.id])},center);
  const plan=(await req('/api/centers/plans/create',ids.manager,{centerId:center,name:'Classes fee',priceMinor:'1000',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:p+'_plan'})).body.plan;
  const members={};let today;
  const detail=key=>req('/api/centers/member?'+new URLSearchParams({centerId:center,id:members[key]}),ids.manager);
  for(const key of ['alice','bob','charlie']){
    const member=(await req('/api/centers/members/create',ids.manager,{centerId:center,name:'Fictional '+key,email:key+'@'+p+'.example',requestId:p+'_member_'+key})).body.member;members[key]=member.id;
    const invite=(await req('/api/centers/invitations/create',ids.manager,{centerId:center,kind:'member',memberId:member.id,accountUid:ids[key],requestId:p+'_invite_'+key})).body;
    assert.equal((await req('/api/centers/invitations/accept',ids[key],{token:invite.token})).status,200);
    const info=(await detail(key)).body;today=info.today;
    assert.equal((await req('/api/centers/subscriptions/create',ids.manager,{centerId:center,memberId:member.id,memberVersion:info.member.version,priceVersionId:plan.priceVersionId,effectiveOn:today,requestId:p+'_sub_'+key})).status,200);
  }
  const create=(suffix='one',extra={})=>req('/api/centers/classes/create',ids.manager,{centerId:center,fields:{name:'Fictional class '+suffix,date:shift(today,1),startTime:'10:00',endTime:'11:00',capacity:1,waitlistCapacity:2,cancelBeforeMinutes:0,eligiblePlanIds:[plan.id],...extra},requestId:p+'_class_'+suffix});
  const reserve=(event,key,suffix='one')=>req('/api/centers/own/classes/reserve',ids[key],{centerId:center,id:event.id,requestId:p+'_reserve_'+key+'_'+suffix});
  const cancel=(row,key,suffix='one')=>req('/api/centers/own/classes/cancel',ids[key],{centerId:center,id:row.id,version:row.version,requestId:p+'_cancel_'+key+'_'+suffix});
  const roster=event=>req('/api/centers/classes/roster?'+new URLSearchParams({centerId:center,id:event.id}),ids.manager);
  const own=(key,params={})=>req('/api/centers/own/classes?'+new URLSearchParams({centerId:center,...params}),ids[key]);
  return {db,app,p,h,req,ids,center,other,plan,members,today,detail,create,reserve,cancel,roster,own};
}

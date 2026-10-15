import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
import {requireCenter} from '../../centers/authz.js';

async function fixture(t){
  const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await db.close();await migrator.end()});
  const p='rt_'+randomBytes(5).toString('hex'),root=p+'_root',manager=p+'_manager';
  const h=await startHttp(t,{app,users:[{id:root,name:root},{id:manager,name:manager}],superadminUids:[root]});
  const response=await fetch(h.base+'/api/platform/centers/create',{method:'POST',headers:h.headers(root),body:JSON.stringify({name:p,managerUid:manager,requestId:p+'_create'})});assert.equal(response.status,200);const center=(await response.json()).center.id;
  await db.platformTransaction(root,client=>client.query("INSERT INTO centers.role_assignments(id,center_id,account_uid,role) VALUES($1,$2,$3,'manager')",[p+'_backup',center,root]),center);
  return {db,root,manager,center};
}
// No sleeps, system clock changes or public-role overrides: hold the shared lock,
// start the waiting transaction, then change only this fixture's validity instant.
async function afterWaiting(db,root,manager,center,change,work){
  let held,release,started;const ready=new Promise(resolve=>held=resolve),unlock=new Promise(resolve=>release=resolve),begun=new Promise(resolve=>started=resolve);
  const holding=db.platformTransaction(root,async client=>{await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:'||$1))",[center]);held(client);await unlock},center);
  const holder=await ready;
  const pending=db.transaction({uid:manager,centerId:center},async client=>{await client.query('SELECT transaction_timestamp()');started();await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:'||$1))",[center]);return work?work(client):requireCenter(client,manager,center,'members.manage',{lock:true})}).then(value=>({value}),error=>({error}));
  try{await begun;await change(holder)}finally{release()}
  await holding;return pending;
}
test('a role that expires while waiting for the center lock cannot authorize the queued transaction',async t=>{
  const {db,root,manager,center}=await fixture(t);
  const result=await afterWaiting(db,root,manager,center,client=>client.query("UPDATE centers.role_assignments SET valid_until=clock_timestamp(),version=version+1 WHERE center_id=$1 AND account_uid=$2 AND role='manager' AND revoked_at IS NULL",[center,manager]));
  assert.equal(result.error?.status,404,'authorization must use the decision instant after the lock, not transaction start');
});
test('a role activated while waiting is evaluated after the lock rather than at the old transaction start',async t=>{
  const {db,root,manager,center}=await fixture(t);
  await db.platformTransaction(root,client=>client.query("UPDATE centers.role_assignments SET valid_from=clock_timestamp()+interval '1 hour',version=version+1 WHERE center_id=$1 AND account_uid=$2 AND role='manager' AND revoked_at IS NULL",[center,manager]),center);
  const result=await afterWaiting(db,root,manager,center,client=>client.query("UPDATE centers.role_assignments SET valid_from=clock_timestamp(),version=version+1 WHERE center_id=$1 AND account_uid=$2 AND role='manager' AND revoked_at IS NULL",[center,manager]));
  assert.equal(result.error,undefined);assert.ok(result.value.capabilities.includes('members.manage'));
});
test('RLS and explicit refund grants also reject a role expired after transaction start',async t=>{
  const {db,root,manager,center}=await fixture(t);
  await db.platformTransaction(root,async client=>{
    await client.query("UPDATE centers.role_assignments SET extra_capabilities=ARRAY['payments.refund'] WHERE center_id=$1 AND account_uid=$2 AND role='manager'",[center,manager]);
    await client.query("INSERT INTO centers.members(id,center_id,member_number,name) VALUES($1,$2,'M-000001','Private fixture member')",[manager+'_member',center]);
  },center);
  const result=await afterWaiting(db,root,manager,center,client=>client.query("UPDATE centers.role_assignments SET valid_until=clock_timestamp(),version=version+1 WHERE center_id=$1 AND account_uid=$2 AND role='manager' AND revoked_at IS NULL",[center,manager]),
    async client=>(await client.query("SELECT centers.has_role($1,ARRAY['manager']) AS manager,centers.can_refund($1) AS refund,(SELECT count(*)::text FROM centers.members WHERE center_id=$1) AS visible",[center])).rows[0]);
  assert.equal(result.error,undefined);assert.deepEqual(result.value,{manager:false,refund:false,visible:'0'});
});

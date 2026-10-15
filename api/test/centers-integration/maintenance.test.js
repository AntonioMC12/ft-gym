import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
import {maintenanceTick} from '../../centers/services/maintenance.js';
import {commandHash} from '../../centers/services/commands.js';

test('expired CSV payloads are cleared in bounded concurrent batches, preserving live reviews, results and replay identity',async t=>{
  const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await db.close();await migrator.end()});
  // Only this fixed, explicitly fictional Compose database allows backdated fixture INSERTs.
  // No existing row's historical timestamps are rewritten and no runtime privilege is widened.
  const url=new URL(app);assert.equal(url.hostname,'centers-ci-db');assert.equal(url.pathname,'/ft_gym_ci_centers_test');
  url.username='centers_bootstrap';url.password='fictional-bootstrap-test-only';
  const fixture=new pg.Client({connectionString:url.href});await fixture.connect();t.after(()=>fixture.end());
  assert.equal((await fixture.query('SELECT kind FROM centers.environment WHERE singleton')).rows[0].kind,'test');
  const p='ret_'+randomBytes(5).toString('hex'),uid=p+'_root';
  const h=await startHttp(t,{app,superadminUids:[uid],users:[{id:uid,name:uid}]});
  const req=async(path,body)=>{const response=await fetch(h.base+path,{headers:h.headers(uid),...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}};
  const centers=[];for(let index=0;index<2;index++)centers.push((await req('/api/platform/centers/create',{name:p+index,managerUid:uid,requestId:p+'_center_'+index})).body.center.id);
  const csv='name,email\nFictional pending,retention@example.test',inputHash=commandHash({csv,duplicatePolicy:'skip'}),record=[{record:1,line:2,fields:{name:'Fictional pending',email:'retention@example.test',phone:null,nationalDocument:null},error:null}];
  const ids=[];
  for(const [index,center] of centers.entries()){
    const count=index===0?203:2;
    const values=Array.from({length:count},(_,number)=>{const request=p+'_expired_'+index+'_'+number,id='mi_'+commandHash([center,uid,request]).slice(0,32);ids.push(id);return {id,request}});
    await fixture.query(`INSERT INTO centers.member_import_jobs(id,center_id,actor_uid,request_id,input_hash,records,created_at,expires_at)
      SELECT r.id,$1,$2,r.request,$3,$4,statement_timestamp()-interval '25 hours',statement_timestamp()-interval '1 hour'
      FROM jsonb_to_recordset($5::jsonb)r(id text,request text)`,[center,uid,inputHash,JSON.stringify(record),JSON.stringify(values)]);
  }
  const center=centers[0],prepare=await req('/api/centers/members/imports/prepare',{centerId:center,csv,duplicatePolicy:'skip',requestId:p+'_live'});assert.equal(prepare.status,200);
  const doneReview=(await req('/api/centers/members/imports/prepare',{centerId:center,csv:'name\nCompleted fictional',duplicatePolicy:'skip',requestId:p+'_done'})).body;
  const doneCommand={centerId:center,id:doneReview.id,reviewHash:doneReview.reviewHash},done=await req('/api/centers/members/imports/commit',doneCommand);assert.equal(done.status,200);
  const expiredId=ids[0],detail='/api/centers/members/imports/detail?'+new URLSearchParams({centerId:center,id:expiredId});
  const logical=await req(detail);assert.equal(logical.body.state,'expired');assert.deepEqual(logical.body.rows,[]);assert.ok(!JSON.stringify(logical).includes('retention@example.test'),'expired review is never projected even before physical cleanup');
  await assert.rejects(db.transaction({uid,centerId:center},client=>client.query('SELECT centers.expire_member_imports($1,100)',[center])),{code:'42501'});
  await assert.rejects(db.platformTransaction(uid,client=>client.query('SELECT centers.expire_member_imports($1,100)',[center]),centers[1]),{code:'42501'});
  await assert.rejects(db.platformTransaction(uid,client=>client.query('SELECT centers.expired_import_centers(NULL)')),{code:'22023'});
  await assert.rejects(db.transaction({uid,centerId:center},client=>client.query("UPDATE centers.member_import_jobs SET state='expired',records=NULL WHERE id=$1",[prepare.body.id])),{code:'23514'});
  await db.platformTransaction(uid,client=>client.query("UPDATE centers.centers SET state='inactive',version=version+1 WHERE id=$1",[centers[1]]),centers[1]);
  const failedAudit={platformTransaction:(actor,work,selected)=>db.platformTransaction(actor,client=>work({query:(sql,params)=>{
    if(sql.startsWith('INSERT INTO centers.business_audit'))throw new Error('fixture audit failure');
    return client.query(sql,params);
  }}),selected)};
  await assert.rejects(maintenanceTick(failedAudit),/fixture audit failure/);
  assert.equal((await fixture.query("SELECT count(*)::integer AS n FROM centers.member_import_jobs WHERE id=ANY($1::text[]) AND state='prepared'",[ids])).rows[0].n,205,'payload cleanup rolls back if its audit cannot be saved');
  const concurrent=await Promise.all([maintenanceTick(db),maintenanceTick(db)]);assert.ok(concurrent.every(result=>result.expired<=400));
  const remaining=await maintenanceTick(db);assert.equal(concurrent.reduce((n,result)=>n+result.expired,0)+remaining.expired,205);
  const purged=await fixture.query('SELECT count(*)::integer AS n FROM centers.member_import_jobs WHERE id=ANY($1::text[]) AND state=$2 AND records IS NULL',[ids,'expired']);assert.equal(purged.rows[0].n,205);
  assert.equal((await req('/api/centers/members/imports/detail?'+new URLSearchParams({centerId:center,id:prepare.body.id}))).body.state,'prepared');
  assert.deepEqual((await req('/api/centers/members/imports/commit',doneCommand)).body,done.body);
  assert.equal((await req('/api/centers/members/imports/commit',{centerId:center,id:expiredId,reviewHash:'a'.repeat(64)})).body.code,'import-expired');
  assert.equal((await req('/api/centers/members/imports/prepare',{centerId:center,csv,duplicatePolicy:'skip',requestId:p+'_expired_0_0'})).body.state,'expired');
  const personal=await req('/api/data');assert.ok(!JSON.stringify(personal).includes('retention@example.test'));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';

async function fixture(t){
  const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await db.close();await migrator.end()});
  const p='ci_'+randomBytes(5).toString('hex'),ids=Object.fromEntries(['root','manager','other','trainer','technical'].map(role=>[role,p+'_'+role]));
  const h=await startHttp(t,{app,superadminUids:[ids.root],users:Object.entries(ids).map(([role,id])=>({id,name:id,...(role==='technical'?{admin:true}:{})}))});
  const req=async(path,uid,body)=>{const response=await fetch(h.base+path,{headers:h.headers(uid),...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}};
  const create=async(name,manager)=>{const result=await req('/api/platform/centers/create',ids.root,{name,managerUid:manager,requestId:name+'_center'});assert.equal(result.status,200);return result.body.center.id};
  const center=await create(p,ids.manager),other=await create(p+'_other',ids.other);
  assert.equal((await req('/api/centers/staff/assign',ids.manager,{centerId:center,version:1,accountUid:ids.trainer})).status,200);
  const prepare=(csv,suffix='job')=>req('/api/centers/members/imports/prepare',ids.manager,{centerId:center,csv,duplicatePolicy:'skip',requestId:p+'_'+suffix});
  const detail=(id,uid=ids.manager,centerId=center)=>req('/api/centers/members/imports/detail?'+new URLSearchParams({centerId,id}),uid);
  const commit=job=>req('/api/centers/members/imports/commit',ids.manager,{centerId:center,id:job.id,reviewHash:job.reviewHash});
  return {db,h,ids,p,req,center,other,prepare,detail,commit};
}

test('socio export confirms all source data atomically, preserves internal numbering and restricts private source detail',async t=>{
  const {db,ids,p,req,center,other,prepare,detail,commit}=await fixture(t);
  const header='Marca temporal,Nº ABONADO,Nombre Completo,DNI,Dirección,Fecha Nacimiento,Teléfono,"Condiciones de Inscripción y protección de datos\r\n\r\n1. Condiciones ficticias; no configurar pagos."';
  const csv=header+'\r\n\r\n\r\n\r\n15/10/2026 10:00:00,0007,"Nombre, Prueba",00000001A,Calle ficticia 1,5/10/1990,001234567,Acepto las condiciones\r\n';
  const response=await prepare(csv);assert.equal(response.status,200,JSON.stringify(response));const job=response.body;
  assert.deepEqual(job.summary,{total:1,ready:1,skipped:0,errors:0});const source=job.rows[0].sourceRegistration;
  assert.equal(source.birthDate,'1990-10-05');assert.equal(source.subscriberNumber,'0007');assert.match(source.conditionsText,/Condiciones ficticias/);
  const completed=await commit(job);assert.equal(completed.status,200,JSON.stringify(completed));const id=completed.body.result.rows[0].memberId;
  const url='/api/centers/member?'+new URLSearchParams({centerId:center,id});
  const member=(await req(url,ids.manager)).body.member;assert.equal(member.number,'M-000001');assert.deepEqual(member.sourceRegistration,source);
  assert.equal(member.phone,'001234567');assert.equal(member.accountLinked,false);
  assert.equal((await req(url,ids.root)).body.member.sourceRegistration.subscriberNumber,'0007');
  assert.equal((await req(url,ids.trainer)).body.member.sourceRegistration,undefined);
  assert.equal((await req(url,ids.other)).status,404);
  assert.equal((await req('/api/centers/members?'+new URLSearchParams({centerId:center}),ids.manager)).body.members[0].sourceRegistration,undefined);
  const edited=await req('/api/centers/members/update',ids.manager,{centerId:center,id,version:member.version,name:'Edited',phone:member.phone,nationalDocument:member.nationalDocument});assert.equal(edited.status,200);
  assert.deepEqual((await req(url,ids.manager)).body.member.sourceRegistration,source,'normal edits retain the source snapshot');
  assert.deepEqual((await detail(job.id)).body,completed.body);assert.ok(!JSON.stringify(completed.body).includes('Calle ficticia'));
  const again=await prepare(csv,'duplicate');assert.equal(again.body.summary.skipped,1);
  const invalid=await prepare(csv.replace('5/10/1990','31/02/1990'),'bad-date');assert.equal(invalid.body.summary.errors,1);assert.equal((await commit(invalid.body)).body.code,'import-invalid-rows');
  await db.transaction({uid:ids.manager,centerId:center},async client=>{
    assert.equal((await client.query('SELECT count(*)::int AS n FROM centers.consents WHERE center_id=$1',[center])).rows[0].n,0);
    assert.equal((await client.query('SELECT source_registration FROM centers.members WHERE center_id=$1',[other])).rows.length,0);
  });
  await assert.rejects(db.transaction({uid:ids.manager,centerId:center},client=>client.query("UPDATE centers.members SET source_registration='[]' WHERE id=$1",[id])),{code:'23514'});
});

test('CSV review creates no members, skips SQL-normalized duplicates and confirms exactly once under concurrent retries',async t=>{
  const {db,ids,p,req,center,prepare,detail,commit}=await fixture(t);
  const existing=await req('/api/centers/members/create',ids.manager,{centerId:center,name:'Existing',email:'existing@example.com',nationalDocument:'AB-123',requestId:p+'_existing'});assert.equal(existing.status,200);
  const beforePersonal=(await req('/api/data',ids.manager)).body;
  const csv='name,email,phone,nationalDocument\r\nExisting duplicate,EXISTING@example.com,,\r\nDocument duplicate,other@example.com,,a b123\r\nNew unique,new@example.com,,CD-456\r\nDuplicate in file,NEW@example.com,,EF-789\r\nNo identity key,,+34111,\r\nNo identity key,,+34222,\r\n';
  const response=await prepare(csv);assert.equal(response.status,200,JSON.stringify(response));const review=response.body;
  assert.deepEqual(review.summary,{total:6,ready:3,skipped:3,errors:0});assert.equal(review.rows[0].reason,'duplicate-existing');assert.equal(review.rows[1].reason,'duplicate-existing');assert.equal(review.rows[3].reason,'duplicate-file');
  const count=()=>db.transaction({uid:ids.manager,centerId:center},async client=>(await client.query('SELECT count(*)::integer AS n FROM centers.members WHERE center_id=$1',[center])).rows[0].n);
  assert.equal(await count(),1);assert.equal((await prepare(csv)).body.id,review.id);
  assert.equal((await prepare(csv+'Extra,extra@example.com,,\r\n')).status,409);
  const results=await Promise.all([commit(review),commit(review)]);assert.ok(results.every(r=>r.status===200),JSON.stringify(results));assert.deepEqual(results[0].body,results[1].body);
  assert.equal(results[0].body.result.imported,3);assert.equal(await count(),4);assert.ok(!JSON.stringify(results[0].body).includes('new@example.com'));
  const rows=await db.transaction({uid:ids.manager,centerId:center},async client=>(await client.query('SELECT member_number,m.state,account_uid,joined_on::text,(statement_timestamp() AT TIME ZONE c.timezone)::date::text AS today FROM centers.members m JOIN centers.centers c ON c.id=m.center_id WHERE m.center_id=$1 ORDER BY member_number',[center])).rows);
  assert.deepEqual(rows.map(r=>r.member_number),['M-000001','M-000002','M-000003','M-000004']);assert.ok(rows.every(r=>r.state==='preactive'&&r.account_uid===null&&r.joined_on===r.today));
  const stored=await db.transaction({uid:ids.manager,centerId:center},async client=>(await client.query('SELECT records,result FROM centers.member_import_jobs WHERE id=$1',[review.id])).rows[0]);assert.equal(stored.records,null);
  assert.deepEqual((await detail(review.id)).body,results[0].body);
  assert.equal((await commit({...review,reviewHash:'b'.repeat(64)})).body.code,'idempotency-conflict');assert.equal(await count(),4);
  assert.deepEqual((await req('/api/data',ids.manager)).body,beforePersonal,'administrative imports do not modify personal training');
  await db.transaction({uid:ids.manager,centerId:center},async client=>{assert.equal((await client.query('SELECT count(*)::text AS n FROM centers.subscriptions WHERE center_id=$1',[center])).rows[0].n,'0');assert.equal((await client.query('SELECT count(*)::text AS n FROM centers.receipts WHERE center_id=$1',[center])).rows[0].n,'0')});
  await assert.rejects(db.transaction({uid:ids.manager,centerId:center},client=>client.query("UPDATE centers.member_import_jobs SET state='completed' WHERE id=$1",[review.id])),{code:'23514'});
  await assert.rejects(db.transaction({uid:ids.manager,centerId:center},client=>client.query('DELETE FROM centers.member_import_jobs WHERE id=$1',[review.id])),{code:'42501'});
});

test('inactive centers preserve completed retry results but cannot apply a pending import',async t=>{
  const {db,ids,center,prepare,detail,commit}=await fixture(t);
  const done=(await prepare('name,email\nDone,done@example.com','done')).body,completed=await commit(done);assert.equal(completed.status,200);
  const pending=(await prepare('name,email\nPending,pending@example.com','pending')).body;
  await db.platformTransaction(ids.root,client=>client.query("UPDATE centers.centers SET state='inactive',version=version+1 WHERE id=$1",[center]),center);
  assert.deepEqual((await commit(done)).body,completed.body);assert.equal((await commit(pending)).body.code,'center-inactive');assert.equal((await detail(pending.id)).body.state,'prepared');
});

test('CSV errors block the entire job; prepared private data is scoped to current actor, center and management role',async t=>{
  const {db,h,ids,req,center,other,prepare,detail,commit}=await fixture(t);
  const response=await prepare('name,email\nGood,good@example.com\nBad,invalid');assert.equal(response.status,200);const job=response.body;assert.equal(job.summary.errors,1);
  assert.equal((await commit(job)).body.code,'import-invalid-rows');assert.equal((await detail(job.id)).body.state,'prepared');
  const count=await db.transaction({uid:ids.manager,centerId:center},async client=>(await client.query('SELECT count(*)::text AS n FROM centers.members WHERE center_id=$1',[center])).rows[0].n);assert.equal(count,'0');
  for(const uid of [ids.root,ids.other,ids.trainer,ids.technical])assert.ok([403,404].includes((await detail(job.id,uid)).status));
  assert.equal((await detail(job.id,ids.manager,other)).status,404);
  assert.equal((await req('/api/centers/members/imports/detail?'+new URLSearchParams({centerId:center,id:job.id,memberId:'foreign'}),ids.manager)).status,400);
  const token=h.headers(ids.manager).Authorization.slice(7);
  for(const path of ['/api/centers/members/imports/prepare','/api/centers/members/imports/commit']){
    const response=await fetch(h.base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:'gymsid='+token+'; __Host-gymsid='+token,Origin:'https://foreign.example'},body:JSON.stringify({centerId:center})});assert.equal(response.status,403,'CSV mutations retain normal cookie CSRF protection');
  }
  const raw=await db.transaction({uid:ids.trainer,centerId:center},client=>client.query('SELECT records FROM centers.member_import_jobs WHERE center_id=$1',[center]));assert.equal(raw.rows.length,0);
  for(const uid of [ids.trainer,ids.technical])assert.ok([403,404].includes((await req('/api/centers/members/imports/prepare',uid,{centerId:center,csv:'name\nA',duplicatePolicy:'skip',requestId:'forbidden_job'})).status));
  assert.equal((await prepare('name,role\nA,manager','unknown_headers')).status,400);
  await assert.rejects(db.transaction({uid:ids.manager,centerId:center},client=>client.query("UPDATE centers.member_import_jobs SET expires_at=clock_timestamp()+interval '1 day' WHERE id=$1",[job.id])),{code:'42501'});
  await assert.rejects(db.transaction({uid:ids.manager,centerId:center},client=>client.query("UPDATE centers.member_import_jobs SET records='[]' WHERE id=$1",[job.id])),{code:'23514'});
});

test('a changed duplicate set requires a fresh explicit review and role revocation prevents a prepared import from applying',async t=>{
  const {db,ids,p,req,center,prepare,detail,commit}=await fixture(t);
  const old=(await prepare('name,email\nReviewed,changed@example.com')).body;
  assert.equal((await req('/api/centers/members/create',ids.root,{centerId:center,name:'Created meanwhile',email:'changed@example.com',requestId:p+'_race'})).status,200);
  assert.equal((await commit(old)).body.code,'import-review-changed');const fresh=(await detail(old.id)).body;assert.equal(fresh.summary.skipped,1);assert.notEqual(fresh.reviewHash,old.reviewHash);assert.equal((await commit(fresh)).body.result.imported,0);
  const pending=(await prepare('name,email\nPending,pending@example.com','revoked')).body;
  await db.platformTransaction(ids.root,async client=>{await client.query("INSERT INTO centers.role_assignments(id,center_id,account_uid,role) VALUES($1,$2,$3,'manager')",[p+'_replacement',center,ids.other]);await client.query("UPDATE centers.role_assignments SET revoked_at=clock_timestamp(),version=version+1 WHERE center_id=$1 AND account_uid=$2 AND role='manager' AND revoked_at IS NULL",[center,ids.manager])},center);
  assert.equal((await commit(pending)).status,404);assert.equal((await detail(pending.id)).status,404);
});

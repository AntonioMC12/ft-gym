import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase,SCHEMA_VERSION} from '../../centers/db.js';
import {applyMigrations,migrationFiles} from '../../centers/migrate.js';
import {drillUrl,backupClient,emptyRestoreTarget,pgTool,makeManifest,verifyManifest,logicalSnapshot,verifyRestoredIdentity,hash} from './recovery-support.mjs';

test('C24: two-center pilot survives a coordinated JSON/PostgreSQL restore and rejects inconsistent candidates',async t=>{
  const app=process.env.CENTERS_TEST_DATABASE_URL,target=process.env.CENTERS_RECOVERY_TARGET_DATABASE_URL,targetMigration=process.env.CENTERS_RECOVERY_TARGET_MIGRATION_URL;
  drillUrl(app,'source','centers_app');drillUrl(process.env.CENTERS_TEST_MIGRATION_DATABASE_URL,'source','centers_migrator');drillUrl(target,'target','centers_app');drillUrl(targetMigration,'target','centers_migrator');
  const sourceBackup=await backupClient(app,'source'),targetBackup=await backupClient(target,'target');t.after(async()=>{await sourceBackup.end();await targetBackup.end()});
  let restored;
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'gym-centers-recovery-'));t.after(async()=>{await restored?.stop();fs.rmSync(work,{recursive:true,force:true})});
  const {migrator}=await isolatedDatabase();t.after(()=>migrator.end());
  const users=['pilot_root','pilot_manager_a','pilot_manager_b','pilot_alice','pilot_bob','pilot_trainer'].map(id=>({id,name:id,admin:id==='pilot_root'}));
  const source=await startHttp(t,{app,users,superadminUids:['pilot_root'],attached:true});
  const request=(h,path,uid,body,method)=>fetch(h.base+path,{headers:h.headers(uid),...(body?{method:method||'POST',body:JSON.stringify(body)}:{})}).then(async response=>({status:response.status,body:await response.json()}));
  const req=(...args)=>request(source,...args),centers=[],members=[],receipts=[],payments=[];
  for(const [suffix,manager,account] of [['a','pilot_manager_a','pilot_alice'],['b','pilot_manager_b','pilot_bob']]){
    const center=(await req('/api/platform/centers/create','pilot_root',{name:'Fictional pilot '+suffix,managerUid:manager,requestId:'pilot_center_'+suffix})).body.center.id;centers.push(center);
    let member=(await req('/api/centers/members/create',manager,{centerId:center,name:'Fictional '+account,requestId:'pilot_member_'+suffix})).body.member;members.push(member.id);
    const invitation=(await req('/api/centers/invitations/create',manager,{centerId:center,kind:'member',memberId:member.id,accountUid:account,requestId:'pilot_invite_'+suffix})).body;
    assert.equal((await req('/api/centers/invitations/accept',account,{token:invitation.token})).status,200);
    const info=(await req('/api/centers/member?'+new URLSearchParams({centerId:center,id:member.id}),manager)).body;member=info.member;
    const plan=(await req('/api/centers/plans/create',manager,{centerId:center,name:'Pilot monthly fee',priceMinor:'3100',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:'pilot_plan_'+suffix})).body.plan;
    const contract=(await req('/api/centers/subscriptions/create',manager,{centerId:center,memberId:member.id,memberVersion:member.version,priceVersionId:plan.priceVersionId,effectiveOn:info.today,requestId:'pilot_subscription_'+suffix})).body.subscriptions[0];
    const receipt=(await req('/api/centers/receipts/generate',manager,{centerId:center,memberId:member.id,subscriptionId:contract.id,periodStart:contract.anchorOn,dueOn:info.today,requestId:'pilot_receipt_'+suffix})).body.receipt;receipts.push(receipt);
    const body={centerId:center,memberId:member.id,amountMinor:'1000',currency:'EUR',paidOn:info.today,method:'cash',allocations:[{receiptId:receipt.id,amountMinor:'1000'}],requestId:'pilot_payment_'+suffix};payments.push(body);
    const payment=await req('/api/centers/payments/record',manager,body);assert.equal(payment.status,200);
    if(suffix==='a')assert.equal((await req('/api/centers/payments/refund','pilot_root',{centerId:center,memberId:member.id,paymentId:payment.body.payment.id,receiptId:receipt.id,amountMinor:'200',refundedOn:info.today,reason:'Fictional rehearsal refund',requestId:'pilot_refund_a'})).status,200);
    assert.equal((await req('/api/data',account,{state:{routines:[],workouts:[],unit:suffix==='a'?'kg':'lb'},baseRev:0},'PUT')).status,200);
  }
  const ownPath='/api/centers/own/membership?centerId='+centers[0],ownBefore=(await req(ownPath,'pilot_alice')).body;
  assert.equal(ownBefore.summary.outstandingMinor,'2300');assert.equal((await req('/api/centers/own/membership?centerId='+centers[1],'pilot_alice')).status,404);
  const personalBefore=(await req('/api/data','pilot_alice')).body;assert.ok(!JSON.stringify(personalBefore).includes('outstandingMinor'));
  assert.equal((await req('/api/platform/centers/reconciliation','pilot_root')).body.orphanedAccounts.length,0);
  const personalHash=hash(fs.readFileSync(path.join(source.dir,'state-pilot_alice.json')));
  await source.stop(); // Quiesce the single JSON identity/training writer before either backup.
  const sourceSnapshot=await logicalSnapshot(sourceBackup),bundle=path.join(work,'bundle');fs.mkdirSync(bundle,{mode:0o700});fs.cpSync(source.dir,path.join(bundle,'json'),{recursive:true});
  fs.writeFileSync(path.join(bundle,'json','recovery-fixture'),'fictional-disposable-only',{mode:0o600});
  // Include extension definitions: a schema-only selection omits btree_gist even
  // though the subscription exclusion constraint depends on its operator classes.
  // public contains only the disposable target/source guard, never application data.
  await pgTool('pg_dump',app,['--format=custom','--exclude-schema=public','--file',path.join(bundle,'centers.dump')]);
  const manifest=await makeManifest(bundle);fs.writeFileSync(path.join(bundle,'manifest.json'),JSON.stringify(manifest),{mode:0o600});await verifyManifest(bundle,manifest);
  const dump=path.join(bundle,'centers.dump'),original=fs.readFileSync(dump);fs.appendFileSync(dump,'corrupt');await assert.rejects(verifyManifest(bundle,manifest),/hash mismatch/);fs.writeFileSync(dump,original);
  await assert.rejects(verifyManifest(bundle,{...manifest,migrations:[]}),/migration manifest/);
  await emptyRestoreTarget(targetBackup);await pgTool('pg_restore',target,['--single-transaction','--role=centers_migrator',dump]);
  assert.deepEqual(await logicalSnapshot(targetBackup),sourceSnapshot,'all SQL tables preserve exact historical rows and metadata');
  await assert.rejects(emptyRestoreTarget(targetBackup),/must have an empty/,'rehearsal never overwrites a populated target');
  const targetMigrator=new pg.Client({connectionString:targetMigration});await targetMigrator.connect();t.after(()=>targetMigrator.end());assert.deepEqual(await applyMigrations(targetMigrator,{kind:'test'}),[]);
  const expected=(await migrationFiles()).find(file=>file.version===SCHEMA_VERSION);
  await targetMigrator.query('UPDATE centers.schema_migrations SET checksum=$1 WHERE version=$2',['0'.repeat(64),SCHEMA_VERSION]);await assert.rejects(applyMigrations(targetMigrator,{kind:'test'}),/applied migrations differ/);await targetMigrator.query('UPDATE centers.schema_migrations SET checksum=$1 WHERE version=$2',[expected.checksum,SCHEMA_VERSION]);
  const restoredData=path.join(work,'restored-data');fs.cpSync(path.join(bundle,'json'),restoredData,{recursive:true});
  const marker=path.join(restoredData,'centers-attached');fs.renameSync(marker,marker+'.held');await assert.rejects(verifyRestoredIdentity(targetBackup,restoredData),/durable centers marker/);fs.renameSync(marker+'.held',marker);
  const identity=path.join(restoredData,'db.json'),json=fs.readFileSync(identity);const missing=JSON.parse(json);missing.users=missing.users.filter(u=>u.id!=='pilot_alice');fs.writeFileSync(identity,JSON.stringify(missing));await assert.rejects(verifyRestoredIdentity(targetBackup,restoredData),/orphaned account/);fs.writeFileSync(identity,json);
  const verification=await verifyRestoredIdentity(targetBackup,restoredData);assert.equal(verification.referencedAccounts,4);
  assert.equal(hash(fs.readFileSync(path.join(restoredData,'state-pilot_alice.json'))),personalHash,'training file preserved byte-for-byte');
  restored=await startHttp(t,{app:target,savedData:restoredData,superadminUids:['pilot_root']});const after=(...args)=>request(restored,...args);
  assert.deepEqual((await after(ownPath,'pilot_alice')).body,ownBefore);assert.deepEqual((await after('/api/data','pilot_alice')).body,personalBefore);
  assert.equal((await after('/api/centers/own/membership?centerId='+centers[1],'pilot_alice')).status,404);
  assert.equal((await after('/api/centers/members?centerId='+centers[1],'pilot_manager_a')).status,404);
  const replay=await after('/api/centers/payments/record','pilot_manager_a',payments[0]);assert.equal(replay.status,200);assert.equal((await after('/api/centers/payments?'+new URLSearchParams({centerId:centers[0],memberId:members[0]}),'pilot_manager_a')).body.payments.length,1);
  assert.equal((await after('/api/admin/user/delete','pilot_root',{id:'pilot_alice'})).status,409);
  assert.equal((await after('/api/platform/centers/reconciliation','pilot_root')).body.orphanedAccounts.length,0);
  const runtime=createCentersDatabase({enabled:true,databaseUrl:target});t.after(()=>runtime.close());assert.deepEqual(await runtime.status(),{available:true,schemaVersion:SCHEMA_VERSION});
  assert.equal((await runtime.transaction({uid:'pilot_manager_a',centerId:centers[1]},client=>client.query('SELECT id FROM centers.receipts WHERE center_id=$1',[centers[1]]))).rows.length,0,'restored RLS remains active');
  await assert.rejects(runtime.platformTransaction('pilot_root',client=>client.query('UPDATE centers.receipts SET total_minor=1 WHERE id=$1',[receipts[0].id]),centers[0]),{code:'42501'});
  console.log('C24 recovery verified: 2 centers; JSON/training + SQL restored; hashes, migration drift, orphan/marker refusal, RLS and idempotency checked.');
});

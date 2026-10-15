import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase,SCHEMA_VERSION} from '../../centers/db.js';
import {applyMigrations,migrationFiles} from '../../centers/migrate.js';
import {createHmac} from 'node:crypto';
import {stripeProfiles,STRIPE_API_VERSION} from '../../centers/stripe-config.js';
import {prepareStripeAttempt,receiveStripeWebhook} from '../../centers/services/stripe-foundation.js';
import {maintenanceTick} from '../../centers/services/maintenance.js';
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
  const request=(h,path,uid,body,method,headers={})=>fetch(h.base+path,{headers:{...h.headers(uid),...headers},...(body?{method:method||'POST',body:JSON.stringify(body)}:{})}).then(async response=>({status:response.status,body:await response.json()}));
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
  const trainingMember=(await req('/api/centers/member?'+new URLSearchParams({centerId:centers[0],id:members[0]}),'pilot_manager_a')).body.member;
  const trainingInput={centerId:centers[0],memberId:members[0],memberVersion:trainingMember.version,bundle:{opengym_plan:1,name:'Fictional recovery plan',unit:'kg',routines:[{id:'source',name:'Recovery push',ex:[{id:'0025',sets:3,reps:8,weight:60}]}],week:{1:['source']},customEx:[]},requestId:'pilot_training_propose'};
  const trainingCreated=await req('/api/centers/training/propose','pilot_manager_a',trainingInput);assert.equal(trainingCreated.status,200,JSON.stringify(trainingCreated));
  const trainingCommand={centerId:centers[0],id:trainingCreated.body.proposal.id,versionId:trainingCreated.body.proposal.versionId,requestId:'pilot_training_accept'};
  const trainingAccepted=await req('/api/centers/own/training/accept','pilot_alice',trainingCommand);assert.equal(trainingAccepted.status,200);const trainingBefore=trainingAccepted.body.proposal;
  const accessCenter=(await req('/api/centers/detail?centerId='+centers[0],'pilot_root')).body.center;
  assert.equal((await req('/api/platform/centers/update','pilot_root',{centerId:centers[0],version:accessCenter.version,name:accessCenter.name,timezone:accessCenter.timezone,openingHours:Object.fromEntries(Array.from({length:7},(_,day)=>[day,[['00:00','24:00']]]))})).status,200);
  assert.equal((await req('/api/centers/access/policy','pilot_manager_a',{centerId:centers[0],version:0,policy:{enabled:true,requireSubscription:true,denyOverdue:false,graceDays:15},requestId:'pilot_access_policy'})).status,200);
  const accessDevice=(await req('/api/centers/access/devices/create','pilot_manager_a',{centerId:centers[0],name:'Fictional recovery reception',requestId:'pilot_access_device'})).body;
  const firstQr=(await req('/api/centers/own/access/token','pilot_alice',{centerId:centers[0],requestId:'pilot_access_first'})).body;
  const firstScan={centerId:centers[0],deviceId:accessDevice.device.id,token:firstQr.token,requestId:'pilot_access_scan'},deviceHeader={'X-Center-Device-Key':accessDevice.credential};
  const firstAdmission=await req('/api/centers/access/consume','pilot_manager_a',firstScan,'POST',deviceHeader);assert.equal(firstAdmission.status,200);assert.equal(firstAdmission.body.admitted,true);
  const pendingQrCommand={centerId:centers[0],requestId:'pilot_access_pending'},pendingQr=(await req('/api/centers/own/access/token','pilot_alice',pendingQrCommand)).body;assert.ok(pendingQr.token);
  const heldMember=(await req('/api/centers/member?'+new URLSearchParams({centerId:centers[1],id:members[1]}),'pilot_manager_b')).body.member;
  const heldAccess=await req('/api/centers/access/holds/create','pilot_manager_b',{centerId:centers[1],memberId:members[1],memberVersion:heldMember.version,reason:'Fictional preserved manual hold',requestId:'pilot_access_preserved_hold'});assert.equal(heldAccess.status,200);
  const csvCompletedReview=await req('/api/centers/members/imports/prepare','pilot_manager_a',{centerId:centers[0],csv:'Nombre Completo,correo,Dirección,Fecha Nacimiento,Nº ABONADO,Condiciones de Inscripción y protección de datos\nRestored CSV member,csv-completed@example.test,Calle ficticia,5/10/1990,0007,Aceptado en origen',duplicatePolicy:'skip',requestId:'pilot_csv_completed'});assert.equal(csvCompletedReview.status,200);
  const csvCompletedCommand={centerId:centers[0],id:csvCompletedReview.body.id,reviewHash:csvCompletedReview.body.reviewHash},csvCompleted=await req('/api/centers/members/imports/commit','pilot_manager_a',csvCompletedCommand);assert.equal(csvCompleted.status,200);
  const sourceMemberId=csvCompleted.body.result.rows[0].memberId;
  const sourceMemberPath='/api/centers/member?'+new URLSearchParams({centerId:centers[0],id:sourceMemberId});
  const sourceRegistration=(await req(sourceMemberPath,'pilot_manager_a')).body.member.sourceRegistration;assert.equal(sourceRegistration.subscriberNumber,'0007');
  const csvPending=await req('/api/centers/members/imports/prepare','pilot_manager_a',{centerId:centers[0],csv:'name,email\nPending restored CSV,csv-pending@example.test',duplicatePolicy:'skip',requestId:'pilot_csv_pending'});assert.equal(csvPending.status,200);
  const expiredImportId='mi_'+hash('pilot_expired_csv_review').slice(0,32);
  await sourceBackup.query(`INSERT INTO centers.member_import_jobs(id,center_id,actor_uid,request_id,input_hash,records,created_at,expires_at)
    VALUES($1,$2,'pilot_manager_a','pilot_expired_csv_review',$3,$4,statement_timestamp()-interval '25 hours',statement_timestamp()-interval '1 hour')`,
    [expiredImportId,centers[0],hash('fictional expired CSV'),JSON.stringify([{record:1,line:2,fields:{name:'Expired personal payload',email:'expired@example.test'}}])]);
  const retentionDb=createCentersDatabase({enabled:true,databaseUrl:app});try{assert.equal((await maintenanceTick(retentionDb)).expired,1)}finally{await retentionDb.close()}
  const freezeDate=offset=>{const date=new Date(ownBefore.today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10)};
  const classPlans=(await req('/api/centers/plans?centerId='+centers[0],'pilot_manager_a')).body.plans;
  const instructorDirectory=(await req('/api/centers/classes/instructors?centerId='+centers[0],'pilot_manager_a')).body;
  const teacherId=instructorDirectory.instructors[0].id;
  const classCreated=await req('/api/centers/classes/create','pilot_manager_a',{centerId:centers[0],fields:{name:'Recovered fictional class',room:'Sala restaurada',instructorAssignmentId:teacherId,date:freezeDate(1),startTime:'10:00',endTime:'11:00',capacity:1,waitlistCapacity:1,cancelBeforeMinutes:0,eligiblePlanIds:[classPlans[0].id]},requestId:'pilot_class_create'});assert.equal(classCreated.status,200,JSON.stringify(classCreated));
  const classCommand={centerId:centers[0],id:classCreated.body.event.id,requestId:'pilot_class_reservation'},classReserved=await req('/api/centers/own/classes/reserve','pilot_alice',classCommand);assert.equal(classReserved.status,200,JSON.stringify(classReserved));
  const pastClassId='cl_'+hash('pilot_past_attendance').slice(0,32),pastReservationId='rb_'+hash('pilot_past_reservation').slice(0,32);
  assert.equal((await sourceBackup.query('SELECT kind FROM centers.environment WHERE singleton')).rows[0].kind,'test');
  await sourceBackup.query('BEGIN');try{
    await sourceBackup.query("SET LOCAL session_replication_role='replica'");
    await sourceBackup.query(`INSERT INTO centers.classes(id,center_id,name,class_on,starts_at,ends_at,timezone,capacity,waitlist_capacity,cancel_before_minutes,booked_count,actor_uid)
      VALUES($1,$2,'Past recovery attendance',((statement_timestamp()-interval '2 hours') AT TIME ZONE 'Europe/Madrid')::date,statement_timestamp()-interval '2 hours',statement_timestamp()-interval '1 hour','Europe/Madrid',1,0,0,1,'pilot_manager_a')`,[pastClassId,centers[0]]);
    await sourceBackup.query("INSERT INTO centers.class_reservations(id,center_id,class_id,member_id,actor_uid,queue_order,state) VALUES($1,$2,$3,$4,'pilot_alice',1,'attended')",[pastReservationId,centers[0],pastClassId,members[0]]);
    await sourceBackup.query('COMMIT');
  }catch(error){await sourceBackup.query('ROLLBACK');throw error}
  const attendanceCommand={centerId:centers[0],id:pastReservationId,version:1,attendanceRevision:0,state:'no-show',reason:'Fictional recovery attendance correction',requestId:'pilot_attendance_correction'};
  const attendanceCorrected=await req('/api/centers/classes/attendance/correct','pilot_manager_a',attendanceCommand);assert.equal(attendanceCorrected.status,200,JSON.stringify(attendanceCorrected));
  let freezeCommand,freezeResult;
  for(const [index,manager,uid] of [[0,'pilot_manager_a','pilot_alice'],[1,'pilot_manager_b','pilot_bob']]){
    const config={enabled:true,minDays:1,maxDays:15,noticeDays:0,maxDaysPerYear:30,billingEffect:'contract-proration'};
    assert.equal((await req('/api/centers/freezes/policy',manager,{centerId:centers[index],config,version:0,requestId:'pilot_freeze_policy_'+index})).status,200);
    const pending=await req('/api/centers/own/freezes/request',uid,{centerId:centers[index],effectiveOn:freezeDate(3),resumeOn:freezeDate(5),reason:'Fictional recovery freeze',requestId:'pilot_freeze_request_'+index});assert.equal(pending.status,200,JSON.stringify(pending));
    if(index===0){const member=(await req('/api/centers/member?'+new URLSearchParams({centerId:centers[index],id:members[index]}),manager)).body.member;
      freezeCommand={centerId:centers[index],id:pending.body.request.id,version:1,memberVersion:member.version,action:'approved',requestId:'pilot_freeze_approve'};
      const approved=await req('/api/centers/freezes/decide',manager,freezeCommand);assert.equal(approved.status,200,JSON.stringify(approved));freezeResult=approved.body;
    }
  }
  const metricsPath='/api/centers/metrics?'+new URLSearchParams({centerId:centers[0],from:ownBefore.today,to:ownBefore.today}),metricsBefore=await req(metricsPath,'pilot_manager_a');assert.equal(metricsBefore.status,200);assert.equal(metricsBefore.body.current.outstandingMinor,'2300');
  const personalBefore=(await req('/api/data','pilot_alice')).body;assert.ok(!JSON.stringify(personalBefore).includes('outstandingMinor'));
  assert.equal((await req('/api/platform/centers/reconciliation','pilot_root')).body.orphanedAccounts.length,0);
  const personalHash=hash(fs.readFileSync(path.join(source.dir,'state-pilot_alice.json')));
  await source.stop(); // Quiesce the single JSON identity/training writer before either backup.
  const gatewayDb=createCentersDatabase({enabled:true,databaseUrl:app}),secret='whsec_fictional_recovery_signature_key';let gatewayAttempt;
  try{
    const config={enabled:true,stripeProfiles:stripeProfiles({CENTERS_STRIPE_PROFILES_JSON:JSON.stringify([{id:'pilot_gateway',mode:'test',accountId:'acct_fictionalpilot1234',apiKey:'sk_test_fictional_recovery_never_sent',webhookSecrets:[secret],centerIds:[centers[0]],maxAmountMinor:'3100',dailyLimitMinor:'10000',returnOrigin:'http://localhost:5178'}])})};
    gatewayAttempt=(await prepareStripeAttempt({database:gatewayDb,config,user:{id:'pilot_manager_a'},checkSession:()=>{}},{centerId:centers[0],memberId:members[0],receiptId:receipts[0].id,requestId:'pilot_gateway_prepare',expectedBalanceMinor:'2300'})).attemptId;
    const now=Math.floor(Date.now()/1000),event={id:'evt_pilot_gateway',api_version:STRIPE_API_VERSION,type:'checkout.session.completed',created:now,livemode:false,data:{object:{id:'cs_test_pilot_gateway',object:'checkout.session',mode:'payment',livemode:false,amount_total:2300,currency:'eur',payment_status:'paid',status:'complete',payment_intent:'pi_pilot_gateway',metadata:{attempt_id:gatewayAttempt,center_id:centers[0],receipt_id:receipts[0].id}}}},raw=Buffer.from(JSON.stringify(event));
    await receiveStripeWebhook({database:gatewayDb,config},'pilot_gateway',raw,'t='+now+',v1='+createHmac('sha256',secret).update(String(now)+'.').update(raw).digest('hex'));
  }finally{await gatewayDb.close()}
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
  assert.deepEqual((await after('/api/centers/freezes/decide','pilot_manager_a',freezeCommand)).body,freezeResult,'approved freeze stays idempotent after restore');
  assert.equal((await after('/api/centers/own/freezes?centerId='+centers[1],'pilot_bob')).body.requests[0].state,'pending','pending approval survives restore');
  const expiredImport=await after('/api/centers/members/imports/detail?'+new URLSearchParams({centerId:centers[0],id:expiredImportId}),'pilot_manager_a');
  assert.equal(expiredImport.body.state,'expired');assert.deepEqual(expiredImport.body.rows,[]);assert.ok(!JSON.stringify(expiredImport).includes('expired@example.test'),'restore does not resurrect cleared CSV content');
  assert.deepEqual((await after('/api/centers/own/classes/reserve','pilot_alice',classCommand)).body,classReserved.body,'class reservation replays after restoring');
  const restoredClass=(await after('/api/centers/own/classes?centerId='+centers[0],'pilot_alice')).body.classes.find(event=>event.id===classCommand.id);
  assert.equal(restoredClass.room,'Sala restaurada');assert.equal(restoredClass.instructorName,classCreated.body.event.instructorName);
  assert.equal(restoredClass.booked,1);assert.equal(restoredClass.ownReservation.id,classReserved.body.reservation.id,'seat counters and owner survive restore');
  assert.deepEqual((await after(ownPath,'pilot_alice')).body,ownBefore);assert.deepEqual((await after('/api/data','pilot_alice')).body,personalBefore);
  const metricsAfter=await after(metricsPath,'pilot_manager_a');assert.equal(metricsAfter.status,200);assert.deepEqual(metricsAfter.body.current,metricsBefore.body.current);assert.deepEqual(metricsAfter.body.period,metricsBefore.body.period,'contract/financial aggregates recompute from the restored ledger without a cached personal-state projection');
  assert.deepEqual((await after('/api/centers/classes/attendance/correct','pilot_manager_a',attendanceCommand)).body,attendanceCorrected.body,'attendance replay does not append after restore');
  const correctionHistory=await after('/api/centers/classes/attendance/history?'+new URLSearchParams({centerId:centers[0],id:pastReservationId}),'pilot_manager_a');assert.equal(correctionHistory.body.corrections.length,1);assert.equal(correctionHistory.body.reservation.originalState,'attended');assert.equal(correctionHistory.body.reservation.state,'no-show');
  const restoredCsv=await after('/api/centers/members/imports/detail?'+new URLSearchParams({centerId:centers[0],id:csvPending.body.id}),'pilot_manager_a');assert.equal(restoredCsv.status,200);assert.equal(restoredCsv.body.reviewHash,csvPending.body.reviewHash);
  assert.deepEqual((await after('/api/centers/members/imports/commit','pilot_manager_a',csvCompletedCommand)).body,csvCompleted.body,'a restored completed import returns its old member IDs and does not run twice');
  assert.deepEqual((await after(sourceMemberPath,'pilot_manager_a')).body.member.sourceRegistration,sourceRegistration,'restored source registration retains all private historical fields');
  const resumedCsv=await after('/api/centers/members/imports/commit','pilot_manager_a',{centerId:centers[0],id:csvPending.body.id,reviewHash:restoredCsv.body.reviewHash});assert.equal(resumedCsv.status,200);assert.equal(resumedCsv.body.result.imported,1);
  const restoredVisits=(await after('/api/centers/own/access/visits?centerId='+centers[0],'pilot_alice')).body;assert.equal(restoredVisits.visits.length,1);assert.equal(restoredVisits.visits[0].id,firstAdmission.body.visitId);
  const preservedHold=await after('/api/centers/access/member?'+new URLSearchParams({centerId:centers[1],memberId:members[1]}),'pilot_manager_b');assert.equal(preservedHold.body.hold.id,heldAccess.body.hold.id);assert.equal(preservedHold.body.hold.releasedAt,null,'restoration and the financial ledger cannot release a manual hold');
  const repeatedAdmission=await after('/api/centers/access/consume','pilot_manager_a',firstScan,'POST',deviceHeader);assert.equal(repeatedAdmission.body.admitted,false);assert.equal(repeatedAdmission.body.replayed,true,'restored idempotency cannot authorize another admission');
  assert.equal((await after('/api/centers/own/access/token','pilot_alice',pendingQrCommand)).body.code,'access-token-expired','restart changes the QR generation even with the restored session secret');
  const oldCapture=await after('/api/centers/access/consume','pilot_manager_a',{...firstScan,token:pendingQr.token,requestId:'pilot_access_old_capture'},'POST',deviceHeader);assert.equal(oldCapture.status,200);assert.equal(oldCapture.body.admitted,false,'an unconsumed pre-restore QR cannot be resurrected');
  const freshQr=(await after('/api/centers/own/access/token','pilot_alice',{centerId:centers[0],requestId:'pilot_access_fresh_after_restore'})).body;assert.ok(freshQr.token);const freshAdmission=await after('/api/centers/access/consume','pilot_manager_a',{...firstScan,token:freshQr.token,requestId:'pilot_access_fresh_scan'},'POST',deviceHeader);assert.equal(freshAdmission.body.admitted,true);
  const trainingRecovered=await after('/api/centers/own/training/accept','pilot_alice',trainingCommand);assert.equal(trainingRecovered.status,200);assert.deepEqual(trainingRecovered.body.proposal,trainingBefore,'accepted delivery map and intention survive recovery without changing personal training');
  assert.equal((await after('/api/centers/own/training/ack','pilot_alice',{...trainingCommand,requestId:'pilot_training_ack'})).body.code,'training-not-synced');
  const destination=trainingBefore.routineIds.source,delivered={routines:[{...trainingBefore.bundle.routines[0],id:destination}],workouts:[],unit:'kg',planDeliveries:[{id:trainingBefore.deliveryKey,acceptedAt:Date.parse(trainingBefore.acceptedAt),routineIds:[destination]}]};
  assert.equal((await after('/api/data','pilot_alice',{state:delivered,stamped:true},'PUT')).status,200);
  const trainingAck=await after('/api/centers/own/training/ack','pilot_alice',{...trainingCommand,requestId:'pilot_training_ack'});assert.equal(trainingAck.status,200);assert.equal(trainingAck.body.proposal.deliveryResult,'applied');
  assert.equal((await after('/api/centers/own/membership?centerId='+centers[1],'pilot_alice')).status,404);
  assert.equal((await after('/api/centers/members?centerId='+centers[1],'pilot_manager_a')).status,404);
  const replay=await after('/api/centers/payments/record','pilot_manager_a',payments[0]);assert.equal(replay.status,200);assert.equal((await after('/api/centers/payments?'+new URLSearchParams({centerId:centers[0],memberId:members[0]}),'pilot_manager_a')).body.payments.length,1);
  const gatewayHistory=(await after('/api/centers/own/stripe?centerId='+centers[0],'pilot_alice')).body;assert.equal(gatewayHistory.mode,'off','restoration does not configure an external provider');assert.equal(gatewayHistory.attempts[0].id,gatewayAttempt);assert.equal(gatewayHistory.attempts[0].state,'creating');assert.equal(gatewayHistory.hasReservation,true);
  assert.equal((await after('/api/centers/payments/record','pilot_manager_a',{...payments[0],amountMinor:'1',allocations:[{receiptId:receipts[0].id,amountMinor:'1'}],requestId:'pilot_after_restore_reserved'})).body.code,'checkout-pending');
  assert.equal((await targetBackup.query("SELECT count(*)::integer AS count FROM centers.stripe_inbox WHERE event_id='evt_pilot_gateway' AND state='pending'")).rows[0].count,1,'durable notification survives without prematurely applying a payment');
  assert.equal((await after('/api/admin/user/delete','pilot_root',{id:'pilot_alice'})).status,409);
  assert.equal((await after('/api/platform/centers/reconciliation','pilot_root')).body.orphanedAccounts.length,0);
  const runtime=createCentersDatabase({enabled:true,databaseUrl:target});t.after(()=>runtime.close());assert.deepEqual(await runtime.status(),{available:true,schemaVersion:SCHEMA_VERSION});
  assert.equal((await runtime.transaction({uid:'pilot_manager_a',centerId:centers[1]},client=>client.query('SELECT id FROM centers.receipts WHERE center_id=$1',[centers[1]]))).rows.length,0,'restored RLS remains active');
  await assert.rejects(runtime.platformTransaction('pilot_root',client=>client.query('UPDATE centers.receipts SET total_minor=1 WHERE id=$1',[receipts[0].id]),centers[0]),{code:'42501'});
  console.log('C24 recovery verified: 2 centers; JSON/training + SQL restored; hashes, migration drift, orphan/marker refusal, RLS and idempotency checked.');
});

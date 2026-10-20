import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash,generateKeyPairSync} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';

async function fixture(t){
 const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await db.close();await migrator.end()});
 const p='ac_'+randomBytes(5).toString('hex'),ids=Object.fromEntries(['root','manager','other','trainer','member','second'].map(k=>[k,p+'_'+k]));
 const extra=Array.from({length:23},(_,i)=>p+'_candidate_'+String(i).padStart(2,'0'));
 const h=await startHttp(t,{app,passwordLogin:true,inviteOnly:true,superadminUids:[ids.root],users:[...Object.values(ids),...extra].map(id=>({id,name:id,email:id+'@example.com'}))});
 const req=async(url,uid,body)=>{const r=await fetch(h.base+url,{headers:uid?h.headers(uid):{'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
 const create=async(suffix,manager)=>{const r=await req('/api/platform/centers/create',ids.root,{name:p+suffix,managerUid:manager,requestId:p+suffix});assert.equal(r.status,200,JSON.stringify(r));return r.body.center.id};
 const center=await create('_center',ids.manager),other=await create('_other',ids.other);
 assert.equal((await req('/api/centers/staff/assign',ids.manager,{centerId:center,version:1,accountUid:ids.trainer})).status,200);
 const makeMember=async(name='Imported',centerId=center)=>{const r=await req('/api/centers/members/create',ids.root,{centerId,name,requestId:p+'_'+randomBytes(5).toString('hex')});assert.equal(r.status,200,JSON.stringify(r));return r.body.member};
 const queue=async(uid=ids.manager,centerId=center)=>req('/api/centers/activations?'+new URLSearchParams({centerId}),uid);
 const request=async(uid=ids.member,centerId=center)=>req('/api/centers/activation/request',uid,{centerId});
 const decide=async(row,member,extra={})=>req('/api/centers/activations/decide',ids.manager,{centerId:center,id:row.id,version:row.version,memberId:member.id,memberVersion:member.version,requestId:p+'_decision',...extra});
 return {db,h,p,ids,extra,req,center,other,makeMember,queue,request,decide};
}

test('registration requests admission to one active center; private training is blocked until the manager links the imported member',async t=>{
 const f=await fixture(t),{req,ids,center,other,h,queue,decide,makeMember,db}=f;
 const config=await req('/api/config');assert.equal(config.body.invite_only,false);assert.equal(config.body.centers.enabled,true);
 const invalid=await req('/api/register/password',null,{name:f.p+'_new',password:'Fictional-Access-2026!'});assert.equal(invalid.body.code,'registration-center-required');
 const join=await req('/api/centers/join?centerId='+center);assert.equal(join.status,200);assert.deepEqual(Object.keys(join.body.center).sort(),['id','name']);
 const signed=await req('/api/register/password',null,{name:f.p+'_new',password:'Fictional-Access-2026!',nationalDocument:'12345678Z',centerId:center,email:f.p+'@example.com'});assert.equal(signed.status,200,JSON.stringify(signed));const uid=signed.body.user.id;
 assert.equal(signed.body.user.admin,false);
 const login=await req('/api/login/password',null,{name:f.p+'_new',password:'Fictional-Access-2026!'});assert.equal(login.status,200);assert.equal(login.body.user.id,uid);
 for(const id of [ids.member,uid]){
  const denied=await req('/api/data',id);assert.equal(denied.status,403);assert.equal(denied.body.code,'account-activation-required');
  assert.equal((await fetch(h.base+'/api/data',{method:'PUT',headers:h.headers(id),body:JSON.stringify({state:{routines:[]},baseRev:0})})).status,403);
  assert.equal((await req('/api/centers/app-access',id)).body.reason,'activation-pending');
 }
 const rows=(await queue()).body.requests;assert.equal(rows.length,1);assert.equal(rows[0].accountUid,uid);assert.equal((await queue(ids.other,other)).body.requests.length,0);
 const member=await makeMember();const approved=await decide(rows[0],member);assert.equal(approved.status,200,JSON.stringify(approved));assert.equal(approved.body.status,'approved');assert.deepEqual(await decide(rows[0],member),approved,'same command replay is harmless');
 assert.equal((await req('/api/centers/members?'+new URLSearchParams({centerId:center,unlinked:'true'}),ids.manager)).body.members.length,0);
 assert.equal((await req('/api/data',uid)).status,200);assert.equal((await req('/api/centers/activation/status',uid)).body.requests[0].status,'approved');
 await db.transaction({uid:ids.manager,centerId:center},async c=>{
  const linked=(await c.query('SELECT state,account_uid,version FROM centers.members WHERE id=$1',[member.id])).rows[0];assert.equal(linked.account_uid,uid);assert.equal(linked.state,'preactive');assert.equal(linked.version,member.version+1);
  for(const table of ['subscriptions','receipts','payments'])assert.equal((await c.query('SELECT count(*)::int n FROM centers.'+table+' WHERE center_id=$1',[center])).rows[0].n,0);
 });
 const account=JSON.parse(fs.readFileSync(path.join(h.dir,'db.json'))).users.find(a=>a.id===uid);assert.equal(account.registrationCenterId,center);assert.equal(account.admin,undefined);
});

test('passkey signup binds the center in its challenge and also requires manager activation',async t=>{
 const {req,center,queue,p}=await fixture(t);
 const options=await req('/api/register/options',null,{name:p+'_passkey',centerId:center,nationalDocument:'X1234567L'});assert.equal(options.status,200);
 const publicKey=generateKeyPairSync('ec',{namedCurve:'P-256'}).publicKey.export({format:'jwk'}),raw=randomBytes(16),id=raw.toString('base64url');
 const cose=Buffer.concat([Buffer.from([0xa5,0x01,0x02,0x03,0x26,0x20,0x01,0x21,0x58,0x20]),Buffer.from(publicKey.x,'base64url'),Buffer.from([0x22,0x58,0x20]),Buffer.from(publicKey.y,'base64url')]);
 const data=Buffer.concat([createHash('sha256').update('localhost').digest(),Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),Buffer.from([0,raw.length]),raw,cose]);
 const head=(major,n)=>n<24?Buffer.from([(major<<5)|n]):n<256?Buffer.from([(major<<5)|24,n]):Buffer.from([(major<<5)|25,n>>8,n&255]);
 const text=s=>Buffer.concat([head(3,Buffer.byteLength(s)),Buffer.from(s)]);
 const attestation=Buffer.concat([Buffer.from([0xa3]),text('fmt'),text('none'),text('attStmt'),Buffer.from([0xa0]),text('authData'),head(2,data.length),data]);
 const credential={id,rawId:id,type:'public-key',clientExtensionResults:{},authenticatorAttachment:'platform',response:{clientDataJSON:Buffer.from(JSON.stringify({type:'webauthn.create',challenge:options.body.options.challenge,origin:'http://localhost:8080',crossOrigin:false})).toString('base64url'),attestationObject:attestation.toString('base64url'),transports:['internal']}};
 const signed=await req('/api/register/verify',null,{cid:options.body.cid,credential});assert.equal(signed.status,200,JSON.stringify(signed));assert.equal(signed.body.user.admin,false);
 assert.equal((await req('/api/data',signed.body.user.id)).body.code,'account-activation-required');assert.equal((await queue()).body.requests[0].accountUid,signed.body.user.id);
});

test('pending queue keyset pagination is bound to the actor, center and name/email search',async t=>{
 const {req,ids,extra,center,other,request,queue}=await fixture(t);for(const uid of extra)assert.equal((await request(uid)).status,200);
 const first=(await queue()).body;assert.equal(first.requests.length,20);assert.ok(first.nextCursor);
 const page=(await req('/api/centers/activations?'+new URLSearchParams({centerId:center,cursor:first.nextCursor}),ids.manager)).body;assert.equal(page.requests.length,3);assert.equal(page.nextCursor,null);assert.equal(new Set([...first.requests,...page.requests].map(r=>r.id)).size,23);
 for(const params of [{centerId:other,cursor:first.nextCursor},{centerId:center,query:'changed',cursor:first.nextCursor}])assert.equal((await req('/api/centers/activations?'+new URLSearchParams(params),ids.manager)).status,400);
 const filtered=(await req('/api/centers/activations?'+new URLSearchParams({centerId:center,query:extra[0]+'@example.com'}),ids.manager)).body;assert.equal(filtered.requests.length,1);assert.equal(filtered.requests[0].accountUid,extra[0]);
});

test('queue and activation mutations enforce current center management, own status privacy, CSRF, optimistic versions and no cross-center links',async t=>{
 const {db,h,ids,req,center,other,request,queue,makeMember,decide}=await fixture(t);assert.equal((await request()).status,200);assert.equal((await request()).status,200);
 const row=(await queue()).body.requests[0],member=await makeMember(),foreign=await makeMember('Foreign',other);
 assert.equal(await db.hasAccountReferences(ids.root,ids.member),true);
 for(const uid of [ids.trainer,ids.other,ids.member])assert.notEqual((await queue(uid)).status,200);
 assert.equal((await req('/api/centers/activation/status',ids.second)).body.requests.length,0);
 assert.equal((await decide(row,foreign)).status,404);
 assert.equal((await decide(row,{...member,version:99})).body.code,'version-conflict');
 const token=h.headers(ids.manager).Authorization.slice(7),csrf=await fetch(h.base+'/api/centers/activations/decide',{method:'POST',headers:{Cookie:'gymsid='+token+'; __Host-gymsid='+token,Origin:'https://foreign.example','Content-Type':'application/json'},body:JSON.stringify({centerId:center})});assert.equal(csrf.status,403);
 assert.equal((await queue()).body.requests[0].status,undefined);
 const hidden=await db.accountTransaction(ids.second,c=>c.query('SELECT * FROM centers.activation_requests WHERE id=$1',[row.id]));assert.equal(hidden.rows.length,0);
 await assert.rejects(db.accountTransaction(ids.member,c=>c.query("UPDATE centers.activation_requests SET status='rejected',decided_at=clock_timestamp(),decided_by=$2 WHERE id=$1 RETURNING id",[row.id,ids.member])).then(r=>{assert.equal(r.rows.length,1)}));
 assert.equal((await decide(row,member,{reject:true,requestId:'reject_request'})).body.status,'rejected');
 assert.equal((await req('/api/data',ids.member)).body.code,'account-activation-required');assert.equal((await request()).body.status,'rejected');assert.equal(await db.hasAccountReferences(ids.root,ids.member),false);
});

test('concurrent activation cannot bind two accounts to the same member; staff retains access and direct SQL cannot forge requests',async t=>{
 const {db,ids,req,center,request,queue,makeMember,decide}=await fixture(t);
 for(const uid of [ids.root,ids.manager,ids.trainer])assert.equal((await req('/api/data',uid)).status,200);
 await request();await request(ids.second);const rows=(await queue()).body.requests,member=await makeMember();
 const results=await Promise.all(rows.map((row,i)=>decide(row,member,{requestId:'concurrent_'+i})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await queue()).body.requests.length,1);
 await assert.rejects(db.accountTransaction(ids.member,c=>c.query('INSERT INTO centers.activation_requests(id,center_id,account_uid) VALUES($1,$2,$3)',['forged_request',center,ids.second])),{code:'42501'});
});

test('CSV review and commit accept 1000 records and reject the 1001st before importing anything',async t=>{
 const {ids,p,req,center}=await fixture(t);const csv='name,email\n'+Array.from({length:1000},(_,i)=>'Import '+i+','+p+i+'@example.com').join('\n');
 const prepare=csv=>req('/api/centers/members/imports/prepare',ids.manager,{centerId:center,csv,duplicatePolicy:'skip',requestId:p+'_csv'});
 assert.equal((await prepare(csv+'\nToo many,extra@example.com')).status,400);
 const prepared=await prepare(csv);assert.equal(prepared.status,200,JSON.stringify(prepared.body));assert.equal(prepared.body.summary.ready,1000);
 const committed=await req('/api/centers/members/imports/commit',ids.manager,{centerId:center,id:prepared.body.id,reviewHash:prepared.body.reviewHash});assert.equal(committed.status,200,JSON.stringify(committed.body));assert.equal(committed.body.result.imported,1000);
});


test('signup requires a valid DNI/NIE; exact center-scoped document matching is private, unique and rechecked on activation',async t=>{
 const {req,ids,center,other,queue,db,p}=await fixture(t)
 for(const nationalDocument of [undefined,'','12345678A','X1234567A',42]){
  const r=await req('/api/register/password',null,{name:p+'_invalid',password:'Fictional-Access-2026!',centerId:center,nationalDocument})
  assert.equal(r.status,400);assert.equal(r.body.code,'national-document-invalid')
  const passkey=await req('/api/register/options',null,{name:p+'_invalid',centerId:center,nationalDocument});assert.equal(passkey.body.code,'national-document-invalid')
 }
 const make=async(name,document,centerId=center)=>{
  const r=await req('/api/centers/members/create',ids.root,{centerId,name,nationalDocument:document,requestId:p+'_'+randomBytes(5).toString('hex')});assert.equal(r.status,200,JSON.stringify(r));return r.body.member
 }
 const matching=await make('Imported identity','12.345.678-z'),wrong=await make('Other identity','87654321X')
 await make('Foreign identity','12345678Z',other)
 const registered=await req('/api/register/password',null,{name:p+'_dni',password:'Fictional-Access-2026!',centerId:center,nationalDocument:' 12.345.678-z '})
 assert.equal(registered.status,200,JSON.stringify(registered))
 assert.equal(JSON.stringify(registered.body).includes('12345678'),false)
 const row=(await queue()).body.requests.find(r=>r.accountUid===registered.body.user.id)
 assert.equal(row.documentMatch,'unique');assert.equal(row.matchedMember.id,matching.id)
 assert.equal(JSON.stringify(row).includes('12345678'),false)
 const command=(member,key)=>req('/api/centers/activations/decide',ids.manager,{centerId:center,id:row.id,version:row.version,memberId:member.id,memberVersion:member.version,requestId:key})
 assert.equal((await command(wrong,p+'_wrong')).body.code,'activation-document-changed')
 const duplicate=await make('Duplicate document','12345678Z')
 assert.equal((await queue()).body.requests[0].documentMatch,'duplicate')
 assert.equal((await command(matching,p+'_dup')).body.code,'activation-document-changed')
 const edited=await req('/api/centers/members/update',ids.manager,{centerId:center,id:duplicate.id,version:duplicate.version,name:duplicate.name,nationalDocument:'X1234567L'})
 assert.equal(edited.status,200,JSON.stringify(edited))
 assert.equal((await command(matching,p+'_ok')).status,200)
 const another=await req('/api/register/password',null,{name:p+'_dni2',password:'Fictional-Access-2026!',centerId:center,nationalDocument:'12345678Z'})
 assert.equal(another.status,200)
 const linked=(await queue()).body.requests[0];assert.equal(linked.documentMatch,'linked');assert.equal(linked.matchedMember,null)
 assert.equal((await req('/api/centers/activations?centerId='+center,ids.trainer)).status,403)
 const hidden=await db.accountTransaction(ids.second,c=>c.query('SELECT national_document FROM centers.activation_requests WHERE id=$1',[linked.id]));assert.equal(hidden.rows.length,0)
 assert.equal((await req('/api/centers/activation/status',another.body.user.id)).body.requests[0].nationalDocument,undefined)
})


test('global pending summary is platform-only, minimal and includes all active centers',async t=>{
 const {req,ids,center,other,request,db}=await fixture(t)
 const url='/api/platform/centers/activations/summary'
 assert.equal((await req(url)).status,401)
 for(const uid of [ids.manager,ids.other,ids.trainer,ids.member])assert.equal((await req(url,uid)).status,403)
 assert.equal((await req(url+'?centerId='+center,ids.root)).status,400)
 const before=(await req(url,ids.root)).body
 await request(ids.member,center);await request(ids.second,other)
 const result=await req(url,ids.root);assert.equal(result.status,200)
 assert.equal(result.body.total,before.total+2)
 assert.deepEqual(Object.keys(result.body).sort(),['center','total']);assert.deepEqual(Object.keys(result.body.center).sort(),['id','name'])
 const expected=await db.platformTransaction(ids.root,async c=>(await c.query(`SELECT a.center_id,c.name FROM centers.activation_requests a JOIN centers.centers c ON c.id=a.center_id WHERE a.status='pending' AND c.state='active' ORDER BY a.created_at,a.id LIMIT 1`)).rows[0])
 assert.deepEqual(result.body.center,{id:expected.center_id,name:expected.name})
 await db.platformTransaction(ids.root,c=>c.query("UPDATE centers.centers SET state='inactive',version=version+1 WHERE id=$1",[other]))
 assert.equal((await req(url,ids.root)).body.total,before.total+1)
})

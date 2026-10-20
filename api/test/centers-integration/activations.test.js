import {hashPassword} from '../../password.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash,generateKeyPairSync} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';

async function fixture(t,options={}){
 const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await db.close();await migrator.end()});
 const p='ac_'+randomBytes(5).toString('hex'),ids=Object.fromEntries(['root','manager','other','trainer','member','second'].map(k=>[k,p+'_'+k]));
 const extra=Array.from({length:23},(_,i)=>p+'_candidate_'+String(i).padStart(2,'0'));
 const h=await startHttp(t,{app,passwordLogin:true,inviteOnly:true,superadminUids:[ids.root],users:[...Object.values(ids),...extra].map(id=>({id,name:id,email:id+'@example.com',...(id===ids.member&&options.passwordHash?{pw:{h:options.passwordHash}}:{})}))});
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
 const invalid=await req('/api/register/password',null,{name:'Nuevo Socio',username:f.p+'_new',password:'Fictional-Access-2026!'});assert.equal(invalid.body.code,'registration-center-required');
 const join=await req('/api/centers/join?centerId='+center);assert.equal(join.status,200);assert.deepEqual(Object.keys(join.body.center).sort(),['id','name']);
 const signed=await req('/api/register/password',null,{name:'Nuevo Socio',username:f.p+'_new',password:'Fictional-Access-2026!',nationalDocument:'12345678Z',centerId:center,email:f.p+'@example.com'});assert.equal(signed.status,200,JSON.stringify(signed));const uid=signed.body.user.id;
 assert.equal(signed.body.user.admin,false);
 const login=await req('/api/login/password',null,{nationalDocument:'12345678Z',password:'Fictional-Access-2026!'});assert.equal(login.status,200);assert.equal(login.body.user.id,uid);
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

test('center installations require password authentication and refuse passkey ceremonies',async t=>{
 const {req,center,p}=await fixture(t);
 for(const route of ['/api/register/options','/api/register/verify','/api/login/options','/api/login/verify']){
  const result=await req(route,null,{name:p,centerId:center});assert.equal(result.status,404);assert.equal(result.body.code,'password-only');
 }
 const config=(await req('/api/config')).body;assert.equal(config.document_login,true);assert.equal(config.password_login,true);assert.equal(config.passkeys,false);
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
  const r=await req('/api/register/password',null,{name:'Nombre Completo',username:p+'_invalid',password:'Fictional-Access-2026!',centerId:center,nationalDocument})
  assert.equal(r.status,400);assert.equal(r.body.code,'national-document-invalid')
  const passkey=await req('/api/register/options',null,{name:'Nombre Completo',username:p+'_invalid',centerId:center,nationalDocument});assert.equal(passkey.body.code,'password-only')
 }
 const make=async(name,document,centerId=center)=>{
  const r=await req('/api/centers/members/create',ids.root,{centerId,name,nationalDocument:document,requestId:p+'_'+randomBytes(5).toString('hex')});assert.equal(r.status,200,JSON.stringify(r));return r.body.member
 }
 const matching=await make('Imported identity','12.345.678-z'),wrong=await make('Other identity','87654321X')
 await make('Foreign identity','12345678Z',other)
 const registered=await req('/api/register/password',null,{name:'Nombre Completo',username:p+'_dni',password:'Fictional-Access-2026!',centerId:center,nationalDocument:' 12.345.678-z '})
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
 const another=await req('/api/register/password',null,{name:'Nombre Completo',password:'Fictional-Access-2026!',centerId:center,nationalDocument:'12345678Z'});
 assert.equal(another.status,409);assert.equal(another.body.code,'document-taken');
 assert.equal((await req('/api/centers/activations?centerId='+center,ids.trainer)).status,403);

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

test('DNI/NIE uniquely identifies accounts across centers and concurrent signups; full names can repeat',async t=>{
 const f=await fixture(t),{req,center,other,p,h,queue}=f;
 const sign=(nationalDocument,extra={})=>req('/api/register/password',null,{name:'Ana Garcia Lopez',password:'Acceso-Ficticio-2026!',centerId:center,nationalDocument,...extra});
 assert.equal((await sign('12345678A')).body.code,'national-document-invalid');
 assert.equal((await sign('12345678Z',{name:'Ana'})).body.code,'full-name-required');
 const first=await sign('12345678Z');assert.equal(first.status,200,JSON.stringify(first));
 assert.equal((await sign(' 12.345.678-z ')).body.code,'document-taken');assert.equal((await sign('12345678Z',{centerId:other})).status,409);
 assert.equal((await req('/api/centers/activation/request',first.body.user.id,{centerId:other,nationalDocument:'87654321X'})).body.code,'national-document-invalid');
 assert.equal((await req('/api/centers/activation/request',first.body.user.id,{centerId:other,nationalDocument:'12345678Z'})).status,200);
 const second=await sign('87654321X');assert.equal(second.status,200);assert.equal(first.body.user.name,second.body.user.name);assert.notEqual(first.body.user.id,second.body.user.id);
 assert.equal(JSON.stringify(first.body).includes('12345678'),false);assert.equal(first.body.user.username,undefined);
 assert.ok([400,401].includes((await req('/api/login/password',null,{name:'Ana Garcia Lopez',password:'Acceso-Ficticio-2026!'})).status));
 assert.equal((await req('/api/login/password',null,{nationalDocument:' 12.345.678-z ',password:'Acceso-Ficticio-2026!'})).status,200);
 assert.equal((await req('/api/login/password',null,{nationalDocument:'12345678Z',password:'Incorrecta-Ficticia!'})).status,401);
 const own=await req('/api/account/password',first.body.user.id);assert.equal(own.body.documentSet,true);assert.equal(own.body.username,undefined);
 const both=await Promise.all([sign('X1234567L'),sign('x-1234567-l')]);assert.deepEqual(both.map(r=>r.status).sort(),[200,409]);
 const stored=JSON.parse(fs.readFileSync(path.join(h.dir,'db.json')));assert.equal(stored.users.filter(u=>u.documentKey).length,3);assert.equal(new Set(stored.users.filter(u=>u.documentKey).map(u=>u.documentKey)).size,3);assert.equal(JSON.stringify(stored).includes('12345678Z'),false);
 assert.ok((await queue()).body.requests.every(row=>stored.users.some(u=>u.id===row.accountUid)));
});

test('center recovery is linked-account scoped, private, single use, preserves history and revokes old sessions',async t=>{
 const f=await fixture(t),{req,ids,center,p,h,queue,decide}=f;
 const registered=await req('/api/register/password',null,{username:p+'_recover',name:'Socio Recuperacion',password:'Acceso-Ficticio-2026!',centerId:center,nationalDocument:'12345678Z'});
 assert.equal(registered.status,200,JSON.stringify(registered));const uid=registered.body.user.id;
 const imported=await f.makeMember('Socio Recuperacion');const row=(await queue()).body.requests.find(r=>r.accountUid===uid);
 assert.equal((await decide(row,imported)).status,200);
 const history=JSON.stringify({routines:[],workouts:[{id:'preserved',d:'2026-10-01',entries:[]}]});fs.writeFileSync(path.join(h.dir,'state-'+uid+'.json'),history);
 const issue=(actor,extra={})=>req('/api/centers/members/recovery',actor,{centerId:center,memberId:imported.id,confirmed:true,...extra});
 assert.equal((await issue(null)).status,401);assert.equal((await issue(ids.trainer)).status,403);assert.ok([403,404].includes((await issue(ids.other)).status));
 assert.equal((await issue(ids.manager,{confirmed:false})).status,400);
 const first=await issue(ids.manager);assert.equal(first.status,200,JSON.stringify(first));assert.deepEqual(Object.keys(first.body).sort(),['code','expires']);assert.ok(first.body.expires<Date.now()+31*60*1000);
 assert.equal((await req('/api/me',uid)).status,401);
 const second=await issue(ids.manager);assert.equal(second.status,200);
 const reset=code=>req('/api/login/password-reset',null,{nationalDocument:'12345678Z',code,next:'Nueva-Clave-Ficticia-2026!'});
 assert.equal((await reset(first.body.code)).body.code,'reset-invalid');
 const response=await fetch(h.base+'/api/login/password-reset',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:8080'},body:JSON.stringify({nationalDocument:'12345678Z',code:second.body.code,next:'Nueva-Clave-Ficticia-2026!'})});
 assert.equal(response.status,200,await response.clone().text());const result=await response.json();assert.equal(result.user.id,uid);assert.equal(result.user.username,undefined);
 const own=await fetch(h.base+'/api/account/password',{headers:{Cookie:response.headers.get('set-cookie').split(';')[0]}});assert.equal((await own.json()).documentSet,true);
 assert.equal((await reset(second.body.code)).body.code,'reset-invalid');assert.equal(fs.readFileSync(path.join(h.dir,'state-'+uid+'.json'),'utf8'),history);
 const stored=JSON.parse(fs.readFileSync(path.join(h.dir,'db.json'))).users.find(u=>u.id===uid);assert.equal(stored.pwReset,undefined);assert.equal(JSON.stringify(stored).includes(second.body.code),false);
 assert.equal((await req('/api/login/password',null,{nationalDocument:'12345678Z',password:'Nueva-Clave-Ficticia-2026!'})).status,200);
});

test('a manager cannot recover a linked account with a staff role in another center',async t=>{
 const f=await fixture(t),{db,ids,center,req}=f;const member=await f.makeMember('Staff at another center');
 await db.platformTransaction(ids.root,c=>c.query('UPDATE centers.members SET account_uid=$3 WHERE center_id=$1 AND id=$2',[center,member.id,ids.other]));
 const body={centerId:center,memberId:member.id,confirmed:true};
 assert.equal((await req('/api/centers/members/recovery',ids.manager,body)).status,403);
 assert.equal((await req('/api/centers/members/recovery',ids.root,body)).status,200);
});

test('legacy document conflicts are reserved globally and need explicit recovery before assigning either account',async t=>{
 const {req,ids,center,other,db,makeMember}=await fixture(t);
 const first=await makeMember('Legacy One'),second=await makeMember('Legacy Two',other);
 await db.platformTransaction(ids.root,async c=>{
  await c.query('UPDATE centers.members SET account_uid=$3,national_document=$4 WHERE center_id=$1 AND id=$2',[center,first.id,ids.member,'12.345.678-z']);
  await c.query('UPDATE centers.members SET account_uid=$3,national_document=$4 WHERE center_id=$1 AND id=$2',[other,second.id,ids.second,'12345678Z']);
 });
 const before=await req('/api/account/password',ids.member);assert.equal(before.body.documentRequired,true);
 assert.equal((await req('/api/account/password',ids.second)).body.documentSet,false);
 assert.equal((await req('/api/register/password',null,{centerId:center,name:'Another Person',nationalDocument:'12345678Z',password:'Fictional-Access-2026!'})).body.code,'document-taken');
 const recovery=await req('/api/admin/user/password-reset',ids.root,{id:ids.member});assert.equal(recovery.status,200);
 const reset=await req('/api/login/password-reset',null,{nationalDocument:'12345678Z',code:recovery.body.code,next:'New-Fictional-Access-2026!'});assert.equal(reset.status,200,JSON.stringify(reset));assert.equal(reset.body.user.id,ids.member);
 assert.equal((await req('/api/account/password',ids.second)).body.documentSet,false);
 const otherCode=await req('/api/admin/user/password-reset',ids.root,{id:ids.second});assert.equal(otherCode.status,200);
 assert.equal((await req('/api/login/password-reset',null,{nationalDocument:'12345678Z',code:otherCode.body.code,next:'New-Fictional-Access-2026!'})).body.code,'reset-invalid');
});

test('an existing password owner can configure a missing document, but cannot claim a document twice or change identity by name',async t=>{
 const password='Existing-Fictional-Access-2026!';const {req,ids,h}=await fixture(t,{passwordHash:await hashPassword(password)});
 assert.equal((await req('/api/account/password',ids.member)).body.documentRequired,true);
 assert.equal((await req('/api/account/document',ids.member,{nationalDocument:'12345678A',current:password})).body.code,'national-document-invalid');
 assert.equal((await req('/api/account/document',ids.member,{nationalDocument:'12345678Z',current:'Wrong-Fictional-Access!'})).body.code,'current-wrong');
 assert.equal((await req('/api/account/document',ids.member,{nationalDocument:'12345678Z',current:password})).status,200);
 assert.equal((await req('/api/account/document',ids.second,{nationalDocument:'12.345.678-z',current:password})).status,409);
 assert.equal((await req('/api/account/document',ids.member,{nationalDocument:'87654321X',current:password})).status,409);
 const login=await req('/api/login/password',null,{nationalDocument:'12345678Z',password});assert.equal(login.status,200);assert.equal(login.body.user.id,ids.member);
 const stored=fs.readFileSync(path.join(h.dir,'db.json'),'utf8');assert.equal(stored.includes('12345678Z'),false);assert.ok(fs.existsSync(path.join(h.dir,'document-secret')));
});

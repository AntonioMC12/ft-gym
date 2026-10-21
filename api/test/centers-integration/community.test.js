import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {communityRead as readService} from '../../centers/services/community.js';
import {fixture,shift} from './class-fixture.mjs';
const read=(f,kind,user='alice',params={})=>f.req('/api/community?'+new URLSearchParams({centerId:f.center,kind,...params}),f.ids[user]);
let seq=0;
const cmd=(f,action,fields,user='alice',requestId=f.p+'_command_'+(++seq))=>f.req('/api/community/command',f.ids[user],{centerId:f.center,action,fields,requestId});
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.body};
const state=f=>({unit:'kg',workouts:Array.from({length:10},(_,i)=>({id:'workout_'+i,name:'Saved session',d:shift(f.today,-i*3),start:1000+i,end:2000+i,entries:[{id:'0025',sets:[{done:true,w:40,r:10}]}],prs:i===5?['0025']:[],note:'SECRET'})),bodyweight:[{v:99}],active:{note:'PRIVATE'}});
const save=(f,s)=>fs.writeFileSync(path.join(f.h.dir,'state-'+f.ids.alice+'.json'),JSON.stringify(s));
test('community private queries enforce RLS, role delegation, read receipts and serialized transitions',async t=>{
 const f=await fixture(t);
 const meta=ok(await read(f,'meta'));assert.ok(meta.capabilities.includes('community.own'));assert.equal(meta.unread,0);
 assert.equal((await read(f,'meta','trainer')).status,403);assert.equal((await read(f,'meta','manager')).status,403);assert.equal((await read(f,'meta','technical')).status,403);
 const requestId=f.p+'_create_once',created=ok(await cmd(f,'create',{title:'Question',body:'Private question'},'alice',requestId));assert.deepEqual(ok(await cmd(f,'create',{title:'Question',body:'Private question'},'alice',requestId)),created);
 assert.equal((await read(f,'thread','bob',{id:created.id})).status,404);
 assert.equal((await read(f,'threads','alice',{view:'team'})).status,403);
 const hidden=await f.db.transaction({uid:f.ids.bob,centerId:f.center},c=>c.query('SELECT * FROM centers.community_messages WHERE thread_id=$1',[created.id]));assert.equal(hidden.rowCount,0);
 let detail=ok(await read(f,'thread','root',{id:created.id}));assert.equal(detail.thread.state,'pending');assert.equal(detail.items[0].body,'Private question');
 assert.ok(ok(await read(f,'meta','root')).unread>=1);
 ok(await cmd(f,'read',{id:created.id,lastSeq:detail.thread.lastSeq},'root'));assert.equal(ok(await read(f,'threads','root',{view:'team'})).items.find(x=>x.id===created.id).unread,0);
 ok(await cmd(f,'reply',{id:created.id,version:detail.thread.version,body:'Team answer'},'root'));
 detail=ok(await read(f,'thread','alice',{id:created.id}));assert.equal(detail.thread.state,'answered');assert.equal(ok(await read(f,'meta')).unread,1);
 ok(await cmd(f,'read',{id:created.id,lastSeq:detail.thread.lastSeq}));assert.equal(ok(await read(f,'meta')).unread,0);
 const simultaneous=await Promise.all(['A','B'].map(body=>cmd(f,'reply',{id:created.id,version:detail.thread.version,body})));assert.deepEqual(simultaneous.map(x=>x.status).sort(),[200,409]);
 detail=ok(await read(f,'thread','alice',{id:created.id}));assert.equal(detail.thread.state,'pending');
 ok(await cmd(f,'state',{id:created.id,version:detail.thread.version,state:'closed'}));detail=ok(await read(f,'thread','alice',{id:created.id}));
 assert.equal((await cmd(f,'reply',{id:created.id,version:detail.thread.version,body:'Closed'})).body.code,'community-closed');
 ok(await cmd(f,'state',{id:created.id,version:detail.thread.version,state:'pending'}));
 ok(await cmd(f,'grant',{accountUid:f.ids.trainer,version:0,respond:true,manage:false,revoked:false,validUntil:null},'root'));
 assert.ok(ok(await read(f,'meta','trainer')).capabilities.includes('community.respond'));
 assert.equal(ok(await read(f,'threads','trainer',{view:'team'})).items.length,1);
 ok(await cmd(f,'grant',{accountUid:f.ids.trainer,version:1,respond:true,manage:false,revoked:true,validUntil:null},'root'));
 assert.equal((await read(f,'thread','trainer',{id:created.id})).status,403);
 const foreign=await f.req('/api/community?'+new URLSearchParams({centerId:f.other,kind:'thread',id:created.id}),f.ids.alice);assert.equal(foreign.status,403);
});
test('notice versions, schedules and reads are explicit; old detail does not acknowledge a later edit',async t=>{
 const f=await fixture(t),fields={title:'Notice',body:'Official notice',state:'draft',pinned:true,startsOn:f.today,endsOn:null};
 const n=ok(await cmd(f,'notice',fields,'root'));assert.equal(ok(await read(f,'notices')).items.length,0);
 ok(await cmd(f,'notice',{...fields,id:n.id,version:1,state:'published'},'root'));let rows=ok(await read(f,'notices')).items;assert.equal(rows.length,1);assert.equal(rows[0].read,false);
 ok(await cmd(f,'notice-read',{id:n.id,version:2}));assert.equal(ok(await read(f,'notices')).items[0].read,true);
 ok(await cmd(f,'notice',{...fields,id:n.id,version:2,state:'published',body:'Changed'},'root'));
 assert.equal((await cmd(f,'notice-read',{id:n.id,version:2})).status,409);assert.equal(ok(await read(f,'notices')).items[0].read,false);
 assert.equal((await cmd(f,'notice',fields,'alice')).status,403);
 const future=ok(await cmd(f,'notice',{...fields,title:'Future',state:'published',startsOn:shift(f.today,1)},'root'));assert.ok(!ok(await read(f,'notices')).items.some(x=>x.id===future.id));
});
test('workout context is explicit, minimal, immutable and owned; editing messages leaves a trace',async t=>{
 const f=await fixture(t);save(f,state(f));
 assert.equal((await cmd(f,'create',{title:'Session',body:'Context',workoutId:'workout_0',includeLoads:false,contextConsent:false})).status,400);
 const q=ok(await cmd(f,'create',{title:'Session',body:'Context',workoutId:'workout_0',includeLoads:false,contextConsent:true}));
 let detail=ok(await read(f,'thread','root',{id:q.id}));assert.deepEqual(Object.keys(detail.thread.context).sort(),['date','title','workoutId']);assert.ok(!JSON.stringify(detail).includes('SECRET'));
 const m=detail.items[0];ok(await cmd(f,'edit-message',{id:q.id,messageId:m.id,version:m.version,body:'Corrected'}));
 const history=await f.db.transaction({uid:f.ids.alice,centerId:f.center},c=>c.query('SELECT body FROM centers.community_message_history WHERE message_id=$1',[m.id]));assert.equal(history.rows[0].body,'Context');
 save(f,{unit:'kg',workouts:[]});detail=ok(await read(f,'thread','root',{id:q.id}));assert.equal(detail.thread.context.workoutId,'workout_0');assert.equal((await cmd(f,'create',{title:'Gone',body:'Body',workoutId:'workout_0',includeLoads:false,contextConsent:true})).status,409);
});
test('achievements stay private until consent plus publication; reactions are idempotent and revocation cannot be replayed',async t=>{
 const f=await fixture(t);save(f,state(f));ok(await cmd(f,'reconcile',{}));let awards=ok(await read(f,'achievements'));assert.equal(awards.preference.enabled,false);assert.ok(awards.items.length>=3);assert.equal(ok(await read(f,'feed','bob')).items.length,0);
 const a=awards.items.find(a=>a.badge==='first-session');assert.equal((await cmd(f,'publish',{id:a.id,version:a.version,nickname:'Visible name',consent:true})).status,403);
 ok(await cmd(f,'preference',{version:0,enabled:true}));assert.equal(ok(await read(f,'feed','bob')).items.length,0);
 const p=ok(await cmd(f,'publish',{id:a.id,version:a.version,nickname:'Visible name',consent:true}));let feed=ok(await read(f,'feed','bob'));assert.equal(feed.items.length,1);assert.ok(!JSON.stringify(feed).includes('SECRET'));assert.ok(!JSON.stringify(feed).includes('recipient_uid'));
 const key=f.p+'_reaction_once';ok(await cmd(f,'reaction',{id:p.id,kind:'strength',active:true},'bob',key));ok(await cmd(f,'reaction',{id:p.id,kind:'strength',active:true},'bob',key));feed=ok(await read(f,'feed','bob'));assert.equal(feed.items[0].reactions.find(x=>x.kind==='strength').count,1);
 ok(await cmd(f,'congratulate',{id:p.id,body:'Well done'},'bob'));assert.equal(ok(await read(f,'feed','alice')).items[0].comments.length,1);
 ok(await cmd(f,'hide',{id:p.id,hidden:true},'bob'));assert.equal(ok(await read(f,'feed','bob')).items.length,0);assert.equal(ok(await read(f,'feed','alice')).items.length,1);
 ok(await cmd(f,'preference',{version:1,enabled:false}));assert.equal(ok(await read(f,'feed','alice')).items.length,0);
 ok(await cmd(f,'reaction',{id:p.id,kind:'strength',active:true},'bob',key));assert.equal(ok(await read(f,'feed','bob')).items.length,0,'idempotent retry does not re-enable a publication');
 ok(await cmd(f,'preference',{version:2,enabled:true}));assert.equal(ok(await read(f,'feed','alice')).items.length,0,'opting in again does not republish history');
 ok(await cmd(f,'publish',{id:a.id,version:a.version,nickname:'Visible name',consent:true}));save(f,{unit:'kg',workouts:[]});assert.equal(ok(await read(f,'feed','alice')).items.length,0,'deleted source records invalidate public projection');ok(await cmd(f,'reconcile',{}));awards=ok(await read(f,'achievements'));assert.equal(awards.items.filter(x=>x.active).length,0);
});


test('assigned teachers follow current delegation and reassignment, with team fallback after revocation',async t=>{
 const f=await fixture(t);
 for(const key of ['trainer','manager'])ok(await cmd(f,'grant',{accountUid:f.ids[key],version:0,respond:true,manage:false,revoked:false,validUntil:null},'root'));
 ok(await cmd(f,'assign',{memberId:f.members.alice,trainerUid:f.ids.trainer,version:0},'root'));
 const q=ok(await cmd(f,'create',{title:'Assigned question',body:'For trainer'}));assert.equal(ok(await read(f,'meta')).trainerName,f.ids.trainer);
 const foreignAssignments=await f.db.transaction({uid:f.ids.trainer,centerId:f.other},c=>c.query('SELECT member_id FROM centers.community_assignments'));assert.equal(foreignAssignments.rowCount,0);
 assert.equal(ok(await read(f,'thread','trainer',{id:q.id})).thread.id,q.id);assert.equal((await read(f,'thread','manager',{id:q.id})).status,404);
 const disabledFallback=await readService({database:f.db,user:{id:f.ids.manager},config:{superadminUids:[f.ids.root]},lookupAccount:id=>({id,name:id,disabled:id===f.ids.trainer}),disabledAccountIds:[f.ids.trainer],checkSession:()=>{}},f.center,'thread',new URLSearchParams({id:q.id}));assert.equal(disabledFallback.thread.id,q.id);
 ok(await cmd(f,'assign',{memberId:f.members.alice,trainerUid:f.ids.manager,version:1},'root'));
 assert.equal((await read(f,'thread','trainer',{id:q.id})).status,404);ok(await read(f,'thread','manager',{id:q.id}));
 ok(await cmd(f,'grant',{accountUid:f.ids.manager,version:1,respond:true,manage:false,revoked:true,validUntil:null},'root'));
 assert.equal(ok(await read(f,'meta')).trainerName,null);ok(await read(f,'thread','trainer',{id:q.id}));
 // Link changes immediately remove the former owner's conversation access, independently of the UI.
 await f.db.platformTransaction(f.ids.root,c=>c.query('UPDATE centers.members SET account_uid=NULL WHERE id=$1',[f.members.alice]),f.center);
 const hidden=await f.db.transaction({uid:f.ids.alice,centerId:f.center},c=>c.query('SELECT id FROM centers.community_threads WHERE id=$1',[q.id]));assert.equal(hidden.rowCount,0);
});

test('five-row pagination is cursor scoped, pinned notices precede recent ordinary notices and read queries are inert',async t=>{
 const f=await fixture(t);
 for(let i=0;i<7;i++)ok(await cmd(f,'create',{title:'Question '+i,body:'Private'}));
 const first=ok(await read(f,'threads','alice',{limit:5}));assert.equal(first.items.length,5);assert.ok(first.nextCursor);
 const second=ok(await read(f,'threads','alice',{limit:5,cursor:first.nextCursor}));assert.equal(second.items.length,2);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,7);
 assert.equal((await read(f,'threads','alice',{query:'different',cursor:first.nextCursor})).status,400);assert.equal((await read(f,'threads','bob',{cursor:first.nextCursor})).status,400);
 const pinned=ok(await cmd(f,'notice',{title:'Old pinned',body:'Pinned first',pinned:true,state:'published',startsOn:f.today,endsOn:f.today},'root'));
 for(let i=0;i<6;i++)ok(await cmd(f,'notice',{title:'Ordinary '+i,body:'Official',pinned:false,state:'published',startsOn:f.today,endsOn:null},'root'));
 const notices=ok(await read(f,'notices','alice',{limit:5}));assert.equal(notices.items[0].id,pinned.id);assert.equal(notices.items.length,5);assert.equal(notices.items.every(n=>!n.read),true);
 const remaining=ok(await read(f,'notices','alice',{cursor:notices.nextCursor,limit:5}));assert.equal(remaining.items.length,2);assert.equal(new Set([...notices.items,...remaining.items].map(x=>x.id)).size,7);
 assert.equal(ok(await read(f,'meta')).unread,7);await read(f,'notices');assert.equal(ok(await read(f,'meta')).unread,7);
});

test('publication moderation is permanent, direct SQL cannot impersonate message side and altered retries are rejected',async t=>{
 const f=await fixture(t);save(f,state(f));const key=f.p+'_intent';const q=ok(await cmd(f,'create',{title:'Private',body:'Member'},'alice',key));
 assert.equal((await cmd(f,'create',{title:'Changed',body:'Member'},'alice',key)).status,409);
 await assert.rejects(f.db.transaction({uid:f.ids.alice,centerId:f.center},c=>c.query("INSERT INTO centers.community_messages(id,center_id,thread_id,author_uid,side,seq,body) VALUES($1,$2,$3,$4,'team',2,'spoof')",[f.p+'_spoof',f.center,q.id,f.ids.alice])),e=>e.code==='42501');
 ok(await cmd(f,'reconcile',{}));const a=ok(await read(f,'achievements')).items.find(a=>a.badge==='first-session');ok(await cmd(f,'preference',{version:0,enabled:true}));
 const publication=ok(await cmd(f,'publish',{id:a.id,version:a.version,nickname:'Fictional',consent:true}));let feed=ok(await read(f,'feed','bob'));assert.equal(feed.items.length,1);
 ok(await cmd(f,'reaction',{id:publication.id,kind:'clap',active:true},'bob'));ok(await cmd(f,'reaction',{id:publication.id,kind:'heart',active:true},'bob'));ok(await cmd(f,'reaction',{id:publication.id,kind:'clap',active:false},'bob'));
 feed=ok(await read(f,'feed','bob'));assert.equal(feed.items[0].reactions.find(r=>r.kind==='clap').count,0);assert.equal(feed.items[0].reactions.find(r=>r.kind==='heart').count,1);
 assert.equal((await cmd(f,'remove',{id:publication.id,version:feed.items[0].version},'bob')).status,403);
 ok(await cmd(f,'remove',{id:publication.id,version:feed.items[0].version},'root'));assert.equal(ok(await read(f,'feed')).items.length,0);assert.equal((await cmd(f,'publish',{id:a.id,version:a.version,nickname:'Again',consent:true})).status,403);
});


test('community keeps authentication and browser CSRF, throttles distinct writes and allows exact replay after the limit',async t=>{
 const f=await fixture(t),q=ok(await cmd(f,'create',{title:'Budget',body:'Message'}));
 const unauthorized=await fetch(f.h.base+'/api/community?'+new URLSearchParams({centerId:f.center,kind:'meta'}));assert.equal(unauthorized.status,401);
 const token=f.h.headers(f.ids.alice).Authorization.slice(7);
 const csrf=await fetch(f.h.base+'/api/community/command',{method:'POST',headers:{Cookie:'gymsid='+token,Origin:'https://attacker.invalid','Sec-Fetch-Site':'cross-site','Content-Type':'application/json'},body:JSON.stringify({centerId:f.center,action:'read',fields:{id:q.id,lastSeq:1},requestId:f.p+'_csrf'})});assert.equal(csrf.status,403);
 const replay=f.p+'_replay';ok(await cmd(f,'read',{id:q.id,lastSeq:1},'alice',replay));for(let i=0;i<38;i++)ok(await cmd(f,'read',{id:q.id,lastSeq:1}));
 assert.equal((await cmd(f,'read',{id:q.id,lastSeq:1})).status,429);ok(await cmd(f,'read',{id:q.id,lastSeq:1},'alice',replay));
});

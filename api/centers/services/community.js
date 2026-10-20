import {affiliations} from './identity.js';
import {randomUUID,createHash} from 'node:crypto';
import {idField,requestField,versionField,objectBody} from '../domain/validation.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';
import {fail,text,boolean,day,BADGES,REACTIONS,achievementMetrics,workoutSnapshot} from '../domain/community.js';
const uid=()=>randomUUID();
const hash=body=>createHash('sha256').update(JSON.stringify(body)).digest('hex');
const own=c=>{if(!c.member)fail('forbidden',403)};
const team=c=>{if(!c.respond)fail('forbidden',403)};
const manage=c=>{if(!c.manage)fail('forbidden',403)};
const one=async(client,sql,args=[])=> (await client.query(sql,args)).rows[0];
const audit=(client,c,action,id)=>client.query('INSERT INTO centers.community_audit(id,center_id,actor_uid,action,target_id) VALUES($1,$2,$3,$4,$5)',[uid(),c.id,c.uid,action,id]);
export async function communityRun(ctx,centerId,work){
 const id=idField(centerId),{database,user,config,checkSession=()=>{}}=ctx,platform=(config.superadminUids||[]).includes(user.id);
 const run=async client=>{
  await client.query("SELECT set_config('centers.community_disabled',$1,true)",[JSON.stringify(ctx.disabledAccountIds||[])]);
  await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:'||$1))",[id]);await client.query('SELECT centers.lock_my_roles($1)',[id]);
  const row=await one(client,`SELECT id,name,timezone,(clock_timestamp() AT TIME ZONE timezone)::date::text AS today,centers.community_access(id) AS allowed,centers.community_manage(id) AS manage,centers.community_staff_for(id,$2) AS respond FROM centers.centers WHERE id=$1 AND state='active'`,[id,user.id]);
  if(!row?.allowed)fail('forbidden',403);const member=await one(client,"SELECT id,version FROM centers.members WHERE center_id=$1 AND account_uid=$2 AND state<>'ended'",[id,user.id]);
  const c={...row,uid:user.id,platform,respond:platform||row.respond,member:member||null};checkSession();const result=await work(client,c);checkSession();return result;
 };return platform?database.platformTransaction(user.id,run,id):database.transaction({uid:user.id,centerId:id},run);
}
async function thread(client,c,id){const row=await one(client,'SELECT * FROM centers.community_threads WHERE center_id=$1 AND id=$2 FOR UPDATE',[c.id,idField(id)]);if(!row)fail('not-found',404);return row}
function page(params,scope){const limit=Number(params.get('limit')||5);if(!Number.isInteger(limit)||limit<1||limit>50)fail();return {limit,after:readCursor(params.get('cursor'),cursorScope(scope)),scope:cursorScope(scope)}}
const paged=(rows,p,project=x=>x)=>({items:rows.slice(0,p.limit).map(project),nextCursor:rows.length>p.limit?nextCursor(p.scope,rows[p.limit-1]):null});
const threadDto=(r,c)=>({id:r.id,title:r.title,state:r.state,version:r.version,lastSeq:r.last_seq,updatedAt:r.updated_at,unread:r.unread||0,own:r.recipient_uid===c.uid,recipient:r.recipient_uid,context:r.context});
export async function communityRead(ctx,centerId,kind,params){
 const allowed=['centerId','kind','id','view','query','status','limit','cursor'];if([...params.keys()].some(k=>!allowed.includes(k)))fail();
 return communityRun(ctx,centerId,async(client,c)=>{
  if(kind==='meta'){
   const unread=await one(client,`SELECT count(*)::int AS n FROM centers.community_threads t LEFT JOIN centers.community_reads r ON r.thread_id=t.id AND r.account_uid=$2 WHERE t.center_id=$1 AND EXISTS(SELECT 1 FROM centers.community_messages m WHERE m.thread_id=t.id AND m.author_uid<>$2 AND m.seq>coalesce(r.last_seq,0))`,[c.id,c.uid]);
   const notices=await one(client,`SELECT count(*)::int AS n FROM centers.community_notices n LEFT JOIN centers.community_notice_reads r ON r.notice_id=n.id AND r.account_uid=$2 WHERE n.center_id=$1 AND n.state='published' AND n.starts_on<=$3::date AND (n.ends_on IS NULL OR n.ends_on>=$3::date) AND coalesce(r.version,0)<n.version`,[c.id,c.uid,c.today]);
   const assigned=c.member?await one(client,'SELECT trainer_uid FROM centers.community_assignments WHERE center_id=$1 AND member_id=$2',[c.id,c.member.id]):null;
   const usable=assigned?.trainer_uid&&ctx.lookupAccount(assigned.trainer_uid)&&!ctx.lookupAccount(assigned.trainer_uid).disabled&&(await one(client,'SELECT centers.community_staff_for($1,$2) AS ok',[c.id,assigned.trainer_uid])).ok;
   return {center:{id:c.id,name:c.name},today:c.today,capabilities:[...(c.member?['community.own']:[]),...(c.respond?['community.respond']:[]),...(c.manage?['community.manage']:[])],unread:unread.n+notices.n,memberId:c.member?.id||null,trainerName:usable?String(ctx.lookupAccount(assigned.trainer_uid).name):null};
  }
  if(kind==='threads'){
   const view=params.get('view')||'own';if(view==='team')team(c);else if(view!=='own')fail();else own(c);
   const query=text(params.get('query')||'',120,false),status=params.get('status')||'all';if(!['all','pending','answered','closed'].includes(status))fail();
   const p=page(params,[c.uid,c.id,kind,view,query,status]);const rows=(await client.query(`SELECT t.*,t.updated_at::text AS cursor_at,(SELECT left(CASE WHEN deleted THEN '' ELSE body END,180) FROM centers.community_messages WHERE thread_id=t.id ORDER BY seq DESC LIMIT 1) AS preview,(SELECT count(*)::int FROM centers.community_messages m WHERE m.thread_id=t.id AND m.author_uid<>$2 AND m.seq>coalesce(r.last_seq,0)) AS unread FROM centers.community_threads t LEFT JOIN centers.community_reads r ON r.thread_id=t.id AND r.account_uid=$2 WHERE t.center_id=$1 AND ($3='team' OR t.recipient_uid=$2) AND ($4='all' OR t.state=$4) AND ($5='' OR position(lower($5) in lower(t.title))>0) AND ($6::timestamptz IS NULL OR (t.updated_at,t.id)<($6::timestamptz,$7::text)) ORDER BY t.updated_at DESC,t.id DESC LIMIT $8`,[c.id,c.uid,view,status,query,p.after?.at||null,p.after?.id||null,p.limit+1])).rows;
   return paged(rows,p,r=>({...threadDto(r,c),name:String(ctx.lookupAccount(r.recipient_uid)?.name||''),preview:r.preview}));
  }
  if(kind==='thread'){
   const row=await thread(client,c,params.get('id')),p=page(params,[c.uid,c.id,kind,row.id]);
   const rows=(await client.query('SELECT *,created_at::text AS cursor_at FROM centers.community_messages WHERE center_id=$1 AND thread_id=$2 AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::text)) ORDER BY created_at DESC,id DESC LIMIT $5',[c.id,row.id,p.after?.at||null,p.after?.id||null,p.limit+1])).rows;
   return {...paged(rows,p,r=>({id:r.id,body:r.deleted?'':r.body,deleted:r.deleted,seq:r.seq,version:r.version,own:r.author_uid===c.uid,side:r.side,name:String(ctx.lookupAccount(r.author_uid)?.name||''),createdAt:r.created_at})),thread:threadDto(row,c)};
  }
  if(kind==='notices'){
   const p=page(params,[c.uid,c.id,kind]);if(p.after&&typeof p.after.pinned!=='boolean')fail();
   const rows=(await client.query(`SELECT n.*,n.starts_on::text AS starts,n.ends_on::text AS ends,n.created_at::text AS cursor_at,coalesce(r.version,0)>=n.version AS read FROM centers.community_notices n LEFT JOIN centers.community_notice_reads r ON r.notice_id=n.id AND r.account_uid=$2 WHERE n.center_id=$1 AND ($3::timestamptz IS NULL OR (n.pinned,n.created_at,n.id)<($4::boolean,$3::timestamptz,$5::text)) ORDER BY n.pinned DESC,n.created_at DESC,n.id DESC LIMIT $6`,[c.id,c.uid,p.after?.at||null,p.after?.pinned??false,p.after?.id||null,p.limit+1])).rows;
   const result=paged(rows,p,r=>({id:r.id,title:r.title,body:r.body,state:r.state,pinned:r.pinned,startsOn:r.starts,endsOn:r.ends,version:r.version,read:r.read,author:String(ctx.lookupAccount(r.author_uid)?.name||''),createdAt:r.created_at}));
   if(result.nextCursor){const last=rows[p.limit-1];result.nextCursor=Buffer.from(JSON.stringify({scope:p.scope,at:last.cursor_at,id:last.id,pinned:last.pinned})).toString('base64url')}return result;
  }
  if(kind==='achievements'){
   own(c);return {items:(await client.query('SELECT id,badge,earned_on::text AS date,active,version FROM centers.community_achievements WHERE center_id=$1 AND recipient_uid=$2 ORDER BY created_at',[c.id,c.uid])).rows,preference:await one(client,'SELECT enabled,version FROM centers.community_preferences WHERE center_id=$1 AND recipient_uid=$2',[c.id,c.uid])||{enabled:false,version:0}};
  }
  if(kind==='feed'){
   const p=page(params,[c.uid,c.id,kind]);const rows=(await client.query(`SELECT p.*,p.created_at::text AS cursor_at,b.badge,b.earned_on::text AS date FROM centers.community_publications p CROSS JOIN LATERAL centers.community_badge(p.center_id,p.achievement_id,p.id) b WHERE p.center_id=$1 AND centers.community_public(p.center_id,p.id) AND NOT EXISTS(SELECT 1 FROM centers.community_hidden h WHERE h.publication_id=p.id AND h.account_uid=$2 AND h.hidden) AND ($3::timestamptz IS NULL OR (p.created_at,p.id)<($3::timestamptz,$4::text)) ORDER BY p.created_at DESC,p.id DESC LIMIT $5`,[c.id,c.uid,p.after?.at||null,p.after?.id||null,p.limit+1])).rows;
   // Publication consent authorizes only this projection. Invalidated declared records disappear immediately even before the owner refreshes awards.
   const items=[];for(const r of rows.slice(0,p.limit)){
    const account=ctx.lookupAccount(r.recipient_uid);if(!account||account.disabled)continue;
    const metrics=achievementMetrics(ctx.readOwnTraining(r.recipient_uid),c.today);if(!metrics.earned[r.badge])continue;
    const reactions=(await client.query('SELECT kind,account_uid FROM centers.community_reactions WHERE publication_id=$1 AND active',[r.id])).rows;
    const comments=(await client.query('SELECT id,body,account_uid,version FROM centers.community_congratulations WHERE publication_id=$1 AND NOT deleted ORDER BY created_at DESC LIMIT 10',[r.id])).rows;
    items.push({id:r.id,nickname:r.nickname,badge:r.badge,date:r.date,own:r.recipient_uid===c.uid,version:r.version,reactions:REACTIONS.map(kind=>({kind,count:reactions.filter(x=>x.kind===kind).length,mine:reactions.some(x=>x.kind===kind&&x.account_uid===c.uid),names:reactions.filter(x=>x.kind===kind).slice(0,20).map(x=>String(ctx.lookupAccount(x.account_uid)?.name||''))})),comments:comments.map(x=>({id:x.id,body:x.body,name:String(ctx.lookupAccount(x.account_uid)?.name||''),own:x.account_uid===c.uid,version:x.version}))});
   }return {...paged(rows,p),items};
  }
  if(kind==='members'){
   manage(c);const query=text(params.get('query')||'',120,false),p=page(params,[c.uid,c.id,kind,query]);const rows=(await client.query(`SELECT m.id,m.name,m.member_number AS number,m.created_at::text AS cursor_at,a.trainer_uid,a.version AS assignment_version FROM centers.members m LEFT JOIN centers.community_assignments a ON a.center_id=m.center_id AND a.member_id=m.id WHERE m.center_id=$1 AND m.account_uid IS NOT NULL AND ($2='' OR position(lower($2) in lower(m.name||' '||m.member_number))>0) AND ($3::timestamptz IS NULL OR (m.created_at,m.id)<($3::timestamptz,$4::text)) ORDER BY m.created_at DESC,m.id DESC LIMIT $5`,[c.id,query,p.after?.at||null,p.after?.id||null,p.limit+1])).rows;return paged(rows,p,r=>({id:r.id,name:r.name,number:r.number,trainerUid:r.trainer_uid,version:r.assignment_version||0}));
  }
  if(kind==='staff'){
   manage(c);const rows=(await client.query(`SELECT DISTINCT r.account_uid AS id,coalesce(g.respond,false) AS respond,coalesce(g.manage,false) AS manage,coalesce(g.revoked,true) AS revoked,coalesce(g.version,0) AS version,g.valid_until AS "validUntil" FROM centers.role_assignments r LEFT JOIN centers.community_grants g ON g.center_id=r.center_id AND g.account_uid=r.account_uid WHERE r.center_id=$1 AND r.role IN ('manager','trainer') AND r.revoked_at IS NULL AND r.valid_from<=clock_timestamp() AND (r.valid_until IS NULL OR r.valid_until>clock_timestamp()) ORDER BY id`,[c.id])).rows;return {items:rows.filter(r=>ctx.lookupAccount(r.id)&&!ctx.lookupAccount(r.id).disabled).map(r=>({...r,name:String(ctx.lookupAccount(r.id).name)}))};
  }
  fail();
 });
}
async function reconcile(client,c,state){
 own(c);const metrics=achievementMetrics(state,c.today);
 for(const badge of BADGES){const existing=await one(client,'SELECT id FROM centers.community_achievements WHERE center_id=$1 AND recipient_uid=$2 AND badge=$3',[c.id,c.uid,badge]);
  if(metrics.earned[badge])await client.query(`INSERT INTO centers.community_achievements(id,center_id,member_id,recipient_uid,badge,earned_on,source_hash) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(center_id,recipient_uid,badge) DO UPDATE SET active=true,earned_on=EXCLUDED.earned_on,source_hash=EXCLUDED.source_hash,version=community_achievements.version+CASE WHEN community_achievements.active=false OR community_achievements.earned_on<>EXCLUDED.earned_on THEN 1 ELSE 0 END`,[existing?.id||uid(),c.id,c.member.id,c.uid,badge,metrics.earned[badge],metrics.sourceHash]);
  else if(existing)await client.query('UPDATE centers.community_achievements SET active=false,version=version+1 WHERE id=$1 AND active',[existing.id]);
 }return metrics;
}
export async function communityCommand(ctx,raw){
 objectBody(raw,['centerId','action','requestId','fields']);const centerId=idField(raw.centerId),action=text(raw.action,40),requestId=requestField(raw.requestId),f=raw.fields||{};
 return communityRun(ctx,centerId,async(client,c)=>{
  const bodyHash=hash({action,fields:f}),old=await one(client,'SELECT body_hash,result FROM centers.community_commands WHERE center_id=$1 AND actor_uid=$2 AND request_id=$3',[c.id,c.uid,requestId]);if(old){if(old.body_hash!==bodyHash)fail('idempotency-conflict',409);return old.result}
  const rate=await one(client,"SELECT count(*)::int n FROM centers.community_commands WHERE center_id=$1 AND actor_uid=$2 AND created_at>clock_timestamp()-interval '1 minute'",[c.id,c.uid]);if(rate.n>=40)fail('community-rate-limit',429);
  const result=await command(client,c,ctx,action,f);ctx.checkSession();await client.query('INSERT INTO centers.community_commands(center_id,actor_uid,request_id,body_hash,result) VALUES($1,$2,$3,$4,$5)',[c.id,c.uid,requestId,bodyHash,JSON.stringify(result)]);await audit(client,c,action,result.id||c.member?.id||c.id);return result;
 });
}
async function command(client,c,ctx,action,f){
 const version=row=>{if(row.version!==versionField(f.version))fail('version-conflict',409)};
 if(action==='create'){
  own(c);objectBody(f,['title','body','workoutId','includeLoads','contextConsent']);const title=text(f.title,120),body=text(f.body,1000);let snapshot={};
  if(f.workoutId){if(f.contextConsent!==true)fail();snapshot=workoutSnapshot(ctx.readOwnTraining(c.uid),idField(f.workoutId),boolean(f.includeLoads),c.today)}
  const a=await one(client,'SELECT trainer_uid FROM centers.community_assignments WHERE center_id=$1 AND member_id=$2',[c.id,c.member.id]);let trainer=a?.trainer_uid||null;
  if(trainer&&(!ctx.lookupAccount(trainer)||ctx.lookupAccount(trainer).disabled||!(await one(client,'SELECT centers.community_staff_for($1,$2) ok',[c.id,trainer])).ok))trainer=null;
  const id=uid();await client.query('INSERT INTO centers.community_threads(id,center_id,member_id,recipient_uid,trainer_uid,title,context) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,c.id,c.member.id,c.uid,trainer,title,JSON.stringify(snapshot)]);
  await client.query("INSERT INTO centers.community_messages(id,center_id,thread_id,author_uid,side,seq,body) VALUES($1,$2,$3,$4,'member',1,$5)",[uid(),c.id,id,c.uid,body]);await client.query('UPDATE centers.community_threads SET last_seq=1 WHERE id=$1',[id]);return {id};
 }
 if(['reply','state','read','edit-message','delete-message'].includes(action)){
  const keys={reply:['id','version','body'],state:['id','version','state'],read:['id','lastSeq'],'edit-message':['id','messageId','version','body'],'delete-message':['id','messageId','version','reason']};objectBody(f,keys[action]);
  const row=await thread(client,c,f.id),isOwner=row.recipient_uid===c.uid;if(!isOwner)team(c);
  if(action==='read'){const seq=Number(f.lastSeq);if(!Number.isSafeInteger(seq)||seq<0||seq>row.last_seq)fail();await client.query('INSERT INTO centers.community_reads(center_id,thread_id,account_uid,last_seq) VALUES($1,$2,$3,$4) ON CONFLICT(thread_id,account_uid) DO UPDATE SET last_seq=greatest(community_reads.last_seq,EXCLUDED.last_seq)',[c.id,row.id,c.uid,seq]);return {id:row.id}}
  if(action==='reply'||action==='state')version(row);
  if(action==='reply'){
   if(row.state==='closed')fail('community-closed',409);const body=text(f.body,1000);
   await client.query('INSERT INTO centers.community_messages(id,center_id,thread_id,author_uid,side,seq,body) VALUES($1,$2,$3,$4,$5,$6,$7)',[uid(),c.id,row.id,c.uid,isOwner?'member':'team',row.last_seq+1,body]);
   await client.query('UPDATE centers.community_threads SET state=$2,last_seq=last_seq+1,version=version+1,updated_at=clock_timestamp() WHERE id=$1',[row.id,isOwner?'pending':'answered']);
  }else if(action==='state'){
   if(!['closed','pending'].includes(f.state))fail();if(f.state==='pending'&&row.state!=='closed')fail('version-conflict',409);
   await client.query('UPDATE centers.community_threads SET state=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1',[row.id,f.state]);
  }else{
   const m=await one(client,'SELECT * FROM centers.community_messages WHERE center_id=$1 AND thread_id=$2 AND id=$3 FOR UPDATE',[c.id,row.id,idField(f.messageId)]);if(!m)fail('not-found',404);version(m);
   if(m.author_uid!==c.uid){manage(c);if(action==='edit-message')fail('forbidden',403)}if(m.deleted)fail('version-conflict',409);
   const reason=action==='delete-message'?text(f.reason,200):'author-edit';
   await client.query('INSERT INTO centers.community_message_history(id,center_id,thread_id,message_id,actor_uid,version,body,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[uid(),c.id,row.id,m.id,c.uid,m.version,m.body,reason]);
   await client.query('UPDATE centers.community_messages SET body=$2,deleted=$3,version=version+1 WHERE id=$1',[m.id,action==='delete-message'?'':text(f.body,1000),action==='delete-message']);
  }return {id:row.id};
 }
 if(action==='notice'){
  manage(c);objectBody(f,['id','version','title','body','state','pinned','startsOn','endsOn']);const title=text(f.title,120),body=text(f.body,3000),pinned=boolean(f.pinned),from=day(f.startsOn),to=f.endsOn?day(f.endsOn):null;if(to&&to<from||!['draft','published','archived'].includes(f.state))fail();
  const id=f.id?idField(f.id):uid();if(f.id){const old=await one(client,'SELECT version FROM centers.community_notices WHERE center_id=$1 AND id=$2 FOR UPDATE',[c.id,id]);if(!old)fail('not-found',404);version(old);await client.query('UPDATE centers.community_notices SET title=$2,body=$3,state=$4,pinned=$5,starts_on=$6,ends_on=$7,version=version+1 WHERE id=$1',[id,title,body,f.state,pinned,from,to])}
  else await client.query('INSERT INTO centers.community_notices(id,center_id,author_uid,title,body,state,pinned,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,c.id,c.uid,title,body,f.state,pinned,from,to]);return {id};
 }
 if(action==='notice-read'){
  objectBody(f,['id','version']);const n=await one(client,'SELECT id,version FROM centers.community_notices WHERE center_id=$1 AND id=$2',[c.id,idField(f.id)]);if(!n)fail('not-found',404);version(n);await client.query('INSERT INTO centers.community_notice_reads(center_id,notice_id,account_uid,version) VALUES($1,$2,$3,$4) ON CONFLICT(notice_id,account_uid) DO UPDATE SET version=EXCLUDED.version',[c.id,n.id,c.uid,n.version]);return {id:n.id};
 }
 if(action==='grant'){
  if(!c.platform)fail('forbidden',403);objectBody(f,['accountUid','version','respond','manage','revoked','validUntil']);const account=idField(f.accountUid),target=ctx.lookupAccount(account);if(!target||target.disabled)fail('not-found',404);
  const role=await one(client,"SELECT id FROM centers.role_assignments WHERE center_id=$1 AND account_uid=$2 AND role IN ('trainer','manager') AND revoked_at IS NULL AND valid_from<=clock_timestamp() AND (valid_until IS NULL OR valid_until>clock_timestamp())",[c.id,account]);if(!role)fail('forbidden',403);
  const old=await one(client,'SELECT version FROM centers.community_grants WHERE center_id=$1 AND account_uid=$2 FOR UPDATE',[c.id,account]);if((old?.version||0)!==f.version)fail('version-conflict',409);
  if(f.validUntil&&(!Number.isFinite(Date.parse(f.validUntil))||Date.parse(f.validUntil)<=Date.now()))fail();
  await client.query('INSERT INTO centers.community_grants(center_id,account_uid,respond,manage,revoked,valid_until) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(center_id,account_uid) DO UPDATE SET respond=EXCLUDED.respond,manage=EXCLUDED.manage,revoked=EXCLUDED.revoked,valid_until=EXCLUDED.valid_until,version=community_grants.version+1',[c.id,account,boolean(f.respond),boolean(f.manage),boolean(f.revoked),f.validUntil||null]);return {id:account};
 }
 if(action==='assign'){
  manage(c);objectBody(f,['memberId','trainerUid','version']);const member=idField(f.memberId),trainer=f.trainerUid?idField(f.trainerUid):null;
  if(trainer&&(!(await one(client,'SELECT centers.community_staff_for($1,$2) ok',[c.id,trainer])).ok||!ctx.lookupAccount(trainer)||ctx.lookupAccount(trainer).disabled))fail('forbidden',403);
  const old=await one(client,'SELECT version FROM centers.community_assignments WHERE center_id=$1 AND member_id=$2 FOR UPDATE',[c.id,member]);if((old?.version||0)!==f.version)fail('version-conflict',409);
  await client.query('INSERT INTO centers.community_assignments(center_id,member_id,trainer_uid) VALUES($1,$2,$3) ON CONFLICT(center_id,member_id) DO UPDATE SET trainer_uid=EXCLUDED.trainer_uid,version=community_assignments.version+1',[c.id,member,trainer]);return {id:member};
 }
 if(action==='reconcile'){objectBody(f,[]);await reconcile(client,c,ctx.readOwnTraining(c.uid));return {id:c.member.id}}
 if(action==='preference'){
  own(c);objectBody(f,['version','enabled']);const enabled=boolean(f.enabled),old=await one(client,'SELECT version FROM centers.community_preferences WHERE center_id=$1 AND recipient_uid=$2',[c.id,c.uid]);if((old?.version||0)!==f.version)fail('version-conflict',409);
  await client.query('INSERT INTO centers.community_preferences(center_id,member_id,recipient_uid,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(center_id,recipient_uid) DO UPDATE SET enabled=EXCLUDED.enabled,version=community_preferences.version+1',[c.id,c.member.id,c.uid,enabled]);if(!enabled)await client.query('UPDATE centers.community_publications SET active=false,version=version+1 WHERE center_id=$1 AND recipient_uid=$2 AND active',[c.id,c.uid]);return {id:c.member.id};
 }
 if(action==='publish'){
  own(c);objectBody(f,['id','version','nickname','consent']);if(f.consent!==true)fail();await reconcile(client,c,ctx.readOwnTraining(c.uid));const pref=await one(client,'SELECT enabled FROM centers.community_preferences WHERE center_id=$1 AND recipient_uid=$2',[c.id,c.uid]);if(!pref?.enabled)fail('forbidden',403);
  const a=await one(client,'SELECT id,version FROM centers.community_achievements WHERE center_id=$1 AND id=$2 AND recipient_uid=$3 AND active',[c.id,idField(f.id),c.uid]);if(!a)fail('not-found',404);version(a);const id=uid();
  const old=await one(client,'SELECT id,removed FROM centers.community_publications WHERE achievement_id=$1',[a.id]);if(old?.removed)fail('forbidden',403);if(old)await client.query('UPDATE centers.community_publications SET active=true,nickname=$2,version=version+1 WHERE id=$1',[old.id,text(f.nickname,40)]);else await client.query('INSERT INTO centers.community_publications(id,center_id,achievement_id,member_id,recipient_uid,nickname) VALUES($1,$2,$3,$4,$5,$6)',[id,c.id,a.id,c.member.id,c.uid,text(f.nickname,40)]);return {id:old?.id||id};
 }
 if(['withdraw','remove','hide','reaction','congratulate','delete-congratulation'].includes(action)){
  const keys={withdraw:['id','version'],remove:['id','version'],hide:['id','hidden'],reaction:['id','kind','active'],congratulate:['id','body'],'delete-congratulation':['id','commentId','version']};objectBody(f,keys[action]);const p=await one(client,'SELECT * FROM centers.community_publications WHERE center_id=$1 AND id=$2',[c.id,idField(f.id)]);if(!p)fail('not-found',404);
  if(['withdraw','remove'].includes(action)){version(p);if(action==='remove')manage(c);else if(p.recipient_uid!==c.uid)fail('forbidden',403);await client.query('UPDATE centers.community_publications SET active=false,removed=$2,version=version+1 WHERE id=$1',[p.id,action==='remove']);return {id:p.id}}
  if(!(await one(client,'SELECT centers.community_public($1,$2) ok',[c.id,p.id])).ok)fail('not-found',404);
  if(action==='hide')await client.query('INSERT INTO centers.community_hidden(center_id,publication_id,account_uid,hidden) VALUES($1,$2,$3,$4) ON CONFLICT(publication_id,account_uid) DO UPDATE SET hidden=EXCLUDED.hidden',[c.id,p.id,c.uid,boolean(f.hidden)]);
  if(action==='reaction'){if(!REACTIONS.includes(f.kind))fail();await client.query('INSERT INTO centers.community_reactions(center_id,publication_id,account_uid,kind,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(publication_id,account_uid,kind) DO UPDATE SET active=EXCLUDED.active',[c.id,p.id,c.uid,f.kind,boolean(f.active)])}
  if(action==='congratulate')await client.query('INSERT INTO centers.community_congratulations(id,center_id,publication_id,account_uid,body) VALUES($1,$2,$3,$4,$5)',[uid(),c.id,p.id,c.uid,text(f.body,280)]);
  if(action==='delete-congratulation'){const m=await one(client,'SELECT account_uid,version FROM centers.community_congratulations WHERE center_id=$1 AND publication_id=$2 AND id=$3',[c.id,p.id,idField(f.commentId)]);if(!m)fail('not-found',404);version(m);if(m.account_uid!==c.uid)manage(c);await client.query('UPDATE centers.community_congratulations SET deleted=true,version=version+1 WHERE id=$1',[f.commentId])}return {id:p.id};
 }
 fail();
}

export async function communitySummary(ctx){
 if((ctx.config.superadminUids||[]).includes(ctx.user.id)){
  const rows=await ctx.database.platformTransaction(ctx.user.id,async client=>(await client.query('SELECT * FROM centers.community_platform_summary()')).rows);ctx.checkSession();return {available:true,total:rows.reduce((n,r)=>n+Number(r.unread),0),target:rows[0]?{id:rows[0].center_id,name:rows[0].name}:null};
 }
 const me=await affiliations(ctx.database,ctx.config,ctx.user),rows=[];for(const center of me.centers){try{const meta=await communityRead(ctx,center.id,'meta',new URLSearchParams());rows.push({id:center.id,name:center.name,unread:meta.unread})}catch(e){if(![403,404].includes(e.status))throw e}}
 ctx.checkSession();rows.sort((a,b)=>b.unread-a.unread||a.id.localeCompare(b.id));return {available:rows.length>0,total:rows.reduce((n,r)=>n+r.unread,0),target:rows[0]?{id:rows[0].id,name:rows[0].name}:null};
}

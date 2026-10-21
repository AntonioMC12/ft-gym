// Fictional community QA only; refuses every persistent or external database/data path.
import fs from 'node:fs';
import {createCentersDatabase} from '../../centers/db.js';
import {createAccountLocks} from '../../centers/account-links.js';
import {createMember} from '../../centers/services/members.js';
import {createMembershipPlan} from '../../centers/services/membership-plans.js';
import {createSubscription} from '../../centers/services/subscriptions.js';
import {communityCommand,communityRead} from '../../centers/services/community.js';
const url=process.env.CENTERS_TEST_DATABASE_URL,dir='/tmp/ft-gym-centers-preview-data';
if(!url||new URL(url).hostname!=='centers-ci-db'||!url.endsWith('/ft_gym_ci_centers_test')||process.env.CENTERS_PREVIEW_ORIGIN!=='http://localhost:5179')throw new Error('isolated community preview required');
const file=dir+'/db.json',data=JSON.parse(fs.readFileSync(file,'utf8')),root=data.users.find(u=>u.id==='preview_platform');
const actor={...root,id:'preview_community_member',name:'Socio Comunidad',admin:false};if(!data.users.some(u=>u.id===actor.id)){data.users.push(actor);fs.writeFileSync(file,JSON.stringify(data))}
const lookupAccount=id=>data.users.find(u=>u.id===id),database=createCentersDatabase({enabled:true,databaseUrl:url});
const ctx={database,user:root,config:{superadminUids:[root.id]},lookupAccount,checkSession:()=>{},accountLocks:createAccountLocks(lookupAccount),readOwnTraining:id=>JSON.parse(fs.readFileSync(dir+'/state-'+id+'.json','utf8'))};
try{
 const center=(await database.platformTransaction(root.id,c=>c.query("SELECT c.id FROM centers.centers c WHERE EXISTS(SELECT 1 FROM centers.role_assignments r WHERE r.center_id=c.id AND r.account_uid='preview_manager') ORDER BY c.created_at DESC LIMIT 1"))).rows[0].id;
 let member=(await database.platformTransaction(root.id,c=>c.query('SELECT id,version FROM centers.members WHERE center_id=$1 AND account_uid=$2',[center,actor.id]),center)).rows[0];
 if(!member){member=(await createMember(ctx,{centerId:center,name:'Socio ficticio de comunidad',requestId:'community_preview_member'},{platform:true})).member;
 await database.platformTransaction(root.id,c=>c.query('UPDATE centers.members SET account_uid=$2 WHERE center_id=$1 AND id=$3',[center,actor.id,member.id]),center);
 const plan=(await createMembershipPlan(ctx,{centerId:center,name:'Plan ficticio QA',priceMinor:'0',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:'community_preview_plan'},{platform:true})).plan;
 const today=(await database.platformTransaction(root.id,c=>c.query("SELECT (clock_timestamp() AT TIME ZONE timezone)::date::text AS today FROM centers.centers WHERE id=$1",[center]),center)).rows[0].today;
 await createSubscription(ctx,{centerId:center,memberId:member.id,memberVersion:member.version,priceVersionId:plan.priceVersionId,effectiveOn:today,requestId:'community_preview_subscription'},{platform:true});
 }
 const training={unit:'kg',workouts:[{id:'qa_community_workout',name:'Fuerza · día A',d:'2026-10-19',start:1000,end:2000,entries:[{id:'0025',sets:[{done:true,w:40,r:10},{done:true,w:40,r:8}]}],prs:['0025']}],routines:[],bodyweight:[]};fs.writeFileSync(dir+'/state-'+actor.id+'.json',JSON.stringify(training));
 const command=(context,action,fields,key)=>communityCommand(context,{centerId:center,action,fields,requestId:'community_preview_'+key});
 const memberCtx={...ctx,user:actor};const q=await command(memberCtx,'create',{title:'¿Cómo progresar en mi próxima sesión?',body:'He completado las series previstas. ¿Mantengo el peso o aumento las repeticiones?',workoutId:'qa_community_workout',includeLoads:false,contextConsent:true},'question');
 await command(ctx,'notice',{title:'Bienvenido a la comunidad',body:'Consulta tus dudas con el equipo y revisa aquí los avisos del centro. Esta es una demostración con datos ficticios.',state:'published',pinned:true,startsOn:'2026-10-19',endsOn:null},'notice');
 await command(memberCtx,'reconcile',{},'reconcile');await command(memberCtx,'preference',{version:0,enabled:true},'preference');
 const badge=(await communityRead(memberCtx,center,'achievements',new URLSearchParams())).items.find(a=>a.badge==='first-session');
 await command(memberCtx,'publish',{id:badge.id,version:badge.version,nickname:'Socio de prueba',consent:true},'publish');
 console.log(JSON.stringify({centerId:center,threadId:q.id,account:actor.name,synthetic:true}));
}finally{await database.close()}

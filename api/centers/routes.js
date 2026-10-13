import { CentersError } from './errors.js';
import { requireCenter, recordId, isPlatformUser } from './authz.js';
import { affiliations } from './services/identity.js';
import { listPlatformCenters, createCenter, updateCenter, assignRole, revokeRole, listStaff, centerDto } from './services/centers.js';
import { createMember, updateMember, listMembers, getMember } from './services/members.js';
import { memberListOptions } from './domain/member-validation.js';
import { transitionMember,cancelMemberTransition } from './services/membership-lifecycle.js';
import {createInvitation,listInvitations,revokeInvitation,inspectInvitation,acceptInvitation} from './services/invitations.js';
import {createMembershipPlan,reviseMembershipPlan,duplicateMembershipPlan,archiveMembershipPlan,listMembershipPlans,getMembershipPlan,planListOptions} from './services/membership-plans.js';
import {createSubscription,changeSubscription,cancelSubscription,listSubscriptions} from './services/subscriptions.js';

// Inject the same session and response helpers used by the rest of node:http.
export function centersRoutes({ config, database, json, readSession, readBody, accountLocks, lookupAccount,
  accountIds = () => [], accountDirectory = () => [] }) {
  const guard = (req, res) => {
    if (!config.enabled) { json(res, 404, { error: 'not found' }); return null; }
    const user = readSession(req);
    if (!user) { json(res, 401, { error: 'not signed in' }); return null; }
    return user;
  };
  const failure = (res, error) => {
    if (error instanceof CentersError) return json(res, error.status, { error: error.message, code: error.code });
    if (error.code === '23505') return json(res, 409, { error: 'duplicate resource', code: 'duplicate' });
    if (error.code === '23P01') return json(res,409,{error:'subscription periods overlap',code:'subscription-overlap'});
    if (error.code === '23514' || error.code === '23503') return json(res, 409, { error: 'invalid business relation or state', code: 'invalid-state' });
    return json(res, 503, { error: 'centers are temporarily unavailable', code: 'centers-unavailable' });
  };
  const current = (req, user, sv) => readSession(req) === user && (user.sv || 0) === sv;
  const mutate = (platform, operation) => async (req,res) => {
    const user=guard(req,res);if(!user)return;
    const sv=user.sv||0;
    if(platform&&!isPlatformUser(config,user))return json(res,403,{error:'forbidden',code:'forbidden'});
    const checkSession=()=>{if(!current(req,user,sv))throw new CentersError(401,'not-signed-in','not signed in');};
    try{
      const body=await readBody(req);checkSession();
      const result=await operation({database,accountLocks,lookupAccount,user,checkSession,config},body,{platform});
      checkSession();return json(res,200,result);
    }catch(error){return failure(res,error);}
  };
  return {
    'POST /api/centers/subscriptions/create': mutate(false,(context,body)=>createSubscription(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/subscriptions/change': mutate(false,(context,body)=>changeSubscription(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/subscriptions/cancel': mutate(false,(context,body)=>cancelSubscription(context,body,{platform:isPlatformUser(config,context.user)})),
    'GET /api/centers/subscriptions': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0;
      const params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId'),memberId=params.get('memberId');
      if(!recordId(centerId)||!recordId(memberId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await listSubscriptions(database,user.id,centerId,memberId,{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'POST /api/centers/plans/create': mutate(false,(context,body)=>createMembershipPlan(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/plans/revise': mutate(false,(context,body)=>reviseMembershipPlan(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/plans/duplicate': mutate(false,(context,body)=>duplicateMembershipPlan(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/plans/archive': mutate(false,(context,body)=>archiveMembershipPlan(context,body,{platform:isPlatformUser(config,context.user)})),
    'GET /api/centers/plans': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0;
      const params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await listMembershipPlans(database,user.id,centerId,planListOptions(params),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'GET /api/centers/plan': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0;
      const params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId'),id=params.get('id');
      if(!recordId(centerId)||!recordId(id))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await getMembershipPlan(database,user.id,centerId,id,{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'POST /api/centers/invitations/create': mutate(false,(context,body)=>createInvitation(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/invitations/revoke': mutate(false,(context,body)=>revokeInvitation(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/invitations/inspect': mutate(false,inspectInvitation),
    'POST /api/centers/invitations/accept': mutate(false,acceptInvitation),
    'GET /api/centers/invitations': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0;
      const params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId'),kind=params.get('kind')||'member',memberId=params.get('memberId');
      if(!recordId(centerId)||memberId&&!recordId(memberId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await listInvitations(database,user.id,centerId,kind,memberId,{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'POST /api/centers/members/transition': mutate(false,(context,body)=>transitionMember(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/members/transition/cancel': mutate(false,(context,body)=>cancelMemberTransition(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/members/create': mutate(false,(context,body)=>createMember(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/members/update': mutate(false,(context,body)=>updateMember(context,body,{platform:isPlatformUser(config,context.user)})),
    'GET /api/centers/members': async (req,res) => {
      const user=guard(req,res);if(!user)return;const sv=user.sv||0;
      const params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await listMembers(database,user.id,centerId,memberListOptions(params),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}
      catch(error){return failure(res,error);}
    },
    'GET /api/centers/detail': async (req,res) => {
      const user=guard(req,res);if(!user)return;const sv=user.sv||0;
      const centerId=new URL(req.url,'http://x').searchParams.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      const platform=isPlatformUser(config,user);
      const work=async client=>{
        if(!platform)await requireCenter(client,user.id,centerId,'center.read',{allowInactive:true,lock:true});
        const {rows}=await client.query('SELECT * FROM centers.centers WHERE id=$1',[centerId]);
        if(!rows.length)throw new CentersError(404,'not-found','not found');
        const center=centerDto(rows[0]);
        if(!platform){
          const context=await requireCenter(client,user.id,centerId,'center.read',{allowInactive:true,lock:true});
          if(!context.capabilities.includes('center.update'))return {center:{id:center.id,name:center.name,state:center.state,timezone:center.timezone,capacity:center.capacity,openingHours:center.openingHours,version:center.version}};
        }
        return {center};
      };
      try{const result=await (platform?database.platformTransaction(user.id,work,centerId):database.transaction({uid:user.id,centerId},work));if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}
      catch(error){return failure(res,error);}
    },
    'GET /api/platform/centers': async (req,res) => {
      const user=guard(req,res);if(!user)return;const sv=user.sv||0;
      if(!isPlatformUser(config,user))return json(res,403,{error:'forbidden',code:'forbidden'});
      try{const result=await listPlatformCenters(database,user.id);if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}
      catch(error){return failure(res,error);}
    },
    'GET /api/platform/centers/accounts': async (req,res) => {
      const user=guard(req,res);if(!user)return;
      if(!isPlatformUser(config,user))return json(res,403,{error:'forbidden',code:'forbidden'});
      const query=(new URL(req.url,'http://x').searchParams.get('query')||'').trim().toLowerCase();
      if(query.length<2||query.length>128)return json(res,200,{accounts:[]});
      const accounts=accountDirectory().filter(a=>a.id.toLowerCase()===query||a.name.toLowerCase().startsWith(query)).slice(0,20);
      return json(res,200,{accounts});
    },
    'GET /api/centers/staff': async (req,res) => {
      const user=guard(req,res);if(!user)return;const sv=user.sv||0;
      const centerId=new URL(req.url,'http://x').searchParams.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await listStaff(database,user.id,centerId,{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}
      catch(error){return failure(res,error);}
    },
    'POST /api/platform/centers/create': mutate(true,createCenter),
    'POST /api/platform/centers/update': mutate(true,updateCenter),
    'POST /api/platform/centers/assign-manager': mutate(true,(context,body)=>{
      if(body?.role&&body.role!=='manager')throw new CentersError(403,'forbidden','forbidden');
      return assignRole(context,{...body,role:'manager'},{platform:true});
    }),
    'POST /api/platform/centers/revoke-role': mutate(true,(context,body)=>revokeRole(context,body,{platform:true})),
    'POST /api/centers/update': mutate(false,updateCenter),
    'POST /api/centers/staff/assign': mutate(false,(context,body)=>{
      if(body?.role&&body.role!=='trainer')throw new CentersError(403,'forbidden','forbidden');
      return assignRole(context,{...body,role:'trainer'},{platform:isPlatformUser(config,context.user)});
    }),
    'POST /api/centers/staff/revoke': mutate(false,revokeRole),
    'GET /api/centers/me': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const sv = user.sv || 0;
      try {
        const result = await affiliations(database, config, user);
        if (!current(req, user, sv)) return json(res, 401, { error: 'not signed in' });
        return json(res, 200, result);
      } catch (error) { return failure(res, error); }
    },
    'GET /api/centers/member': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const sv = user.sv || 0;
      const params = new URL(req.url, 'http://x').searchParams;
      const centerId = params.get('centerId'), id = params.get('id');
      if (!recordId(centerId) || !recordId(id)) return json(res, 404, { error: 'not found', code: 'not-found' });
      try {
        const result = await getMember(database,user.id,centerId,id,{platform:isPlatformUser(config,user)});
        if (!current(req, user, sv)) return json(res, 401, { error: 'not signed in' });
        return json(res, 200, result);
      } catch (error) { return failure(res, error); }
    },
    'GET /api/platform/centers/reconciliation': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const sv = user.sv || 0;
      if (!isPlatformUser(config, user)) return json(res, 403, { error: 'forbidden', code: 'forbidden' });
      try {
        const result = await database.platformTransaction(user.id, async client => {
          const { rows } = await client.query('SELECT DISTINCT account_uid FROM centers.account_references WHERE centers.has_account_references(account_uid) ORDER BY account_uid');
          const known = new Set(accountIds());
          return { referencedAccounts: rows.length, orphanedAccounts: rows.filter(r => !known.has(r.account_uid)).map(r => r.account_uid) };
        });
        if (!current(req, user, sv)) return json(res, 401, { error: 'not signed in' });
        return json(res, 200, result);
      } catch (error) { return failure(res, error); }
    },
    'GET /api/centers/status': async (req, res) => {
      if (!config.enabled) return json(res, 404, { error: 'not found' });
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const sv = user.sv || 0;
      let status;
      try { status = await database.status(); }
      catch {
        return json(res, 503, { error: 'centers are temporarily unavailable', code: 'centers-unavailable' });
      }
      // The SQL check awaited: logout-all or disabling may have revoked this identity meanwhile.
      if (readSession(req) !== user || (user.sv || 0) !== sv) return json(res, 401, { error: 'not signed in' });
      return json(res, 200, { enabled: true, stage: 'centers', ...status });
    },
  };
}

import {previewRenewal,renewCash} from './services/renewals.js';
import {registerPassDay,passHistory,passHistoryOptions} from './services/pass-days.js';
import {applicationAccess} from './services/application-access.js';
import {passOptions} from './domain/passes.js';
import {listPassProducts,createPassProduct,revisePassProduct,archivePassProduct,previewPassPurchase,buyPass,listPasses,revokePass} from './services/passes.js';
import {listRetention,configureRetention,reviewRetention} from './services/retention.js';
import {retentionOptions} from './domain/retention.js';
import {progressSelectors,ownProgressShare,changeProgressShare,readSharedProgress} from './services/shared-progress.js';
import {previewClassSeriesCancellation,cancelClassSeries,previewClassSeries,createClassSeries,classSeriesPageOptions,getClassSeries,listClassSeries} from './services/class-series.js';
import { CentersError } from './errors.js';
import {notificationMode} from './notification-config.js';
import {notificationStatus,configureNotificationPolicy,ownNotificationContact,requestNotificationContact,verifyNotificationContact,disableNotificationContact,retryBlockedNotifications} from './services/notification-contacts.js';
import {automationStatus,configureAutomation,retryBillingJob} from './services/jobs.js';
import { requireCenter, recordId, isPlatformUser } from './authz.js';
import { affiliations } from './services/identity.js';
import { listPlatformCenters, platformCenterListOptions, createCenter, updateCenter, assignRole, revokeRole, listStaff, centerDto } from './services/centers.js';
import { createMember, updateMember, listMembers, getMember } from './services/members.js';
import { memberListOptions } from './domain/member-validation.js';
import { transitionMember,cancelMemberTransition } from './services/membership-lifecycle.js';
import {createInvitation,listInvitations,revokeInvitation,inspectInvitation,acceptInvitation} from './services/invitations.js';
import {createMembershipPlan,reviseMembershipPlan,duplicateMembershipPlan,archiveMembershipPlan,listMembershipPlans,getMembershipPlan,planListOptions} from './services/membership-plans.js';
import {createSubscription,changeSubscription,cancelSubscription,listSubscriptions} from './services/subscriptions.js';
import {previewBilling} from './services/billing-preview.js';
import {generateReceipt,listReceipts,receiptListOptions} from './services/receipts.js';
import {recordPayment,recordRefund,listPayments,updateRefundCapability} from './services/payments.js';
import {listDebt,exportDebt,debtListOptions} from './services/debt.js';
import {ownMembership,ownReceipts,ownPayments,ownPortalOptions} from './services/member-portal.js';
import {stripeStatus,stripeListOptions,checkoutStripe,reconcileStripe} from './services/stripe-service.js';
import {receiveStripeWebhook} from './services/stripe-foundation.js';
import {readStripeBody} from './domain/stripe-webhook.js';
import {proposeTraining,withdrawTraining,trainingListOptions,listTraining,getTraining,acceptTraining,acknowledgeTraining} from './services/training-proposals.js';
import {configureAccess,accessStatus,accessPageOptions,createAccessDevice,changeAccessDevice,issueAccessToken,consumeAccessToken,accessMember,setAccessHold,releaseAccessHold,accessVisits} from './services/access.js';
import {metricsOptions} from './domain/metrics.js';
import {centerMetrics,globalMetrics} from './services/metrics.js';
import {accountDirectoryPage} from './domain/account-directory.js';
import {prepareMemberImport,getMemberImport,commitMemberImport} from './services/member-imports.js';
import {configureFreezePolicy,freezePageOptions,listFreezeRequests,requestFreeze,decideFreeze} from './services/freeze-requests.js';
import {attendanceHistoryOptions,classAttendanceHistory,correctClassAttendance,classInstructorOptions,classInstructors,classListOptions,listClasses,classRoster,createClass,reserveClass,cancelClassReservation,cancelClass,classAttendance} from './services/classes.js';

// Inject the same session and response helpers used by the rest of node:http.
export function centersRoutes({ config, database, json, readSession, readBody, accountLocks, lookupAccount, readOwnTraining, hasTrainingExercise, mintAccessCredential,
  accountIds = () => [], accountDirectory = () => [] }) {
  const guard = (req, res) => {
    if (!config.enabled) { json(res, 404, { error: 'not found' }); return null; }
    const user = readSession(req);
    if (!user) { json(res, 401, { error: 'not signed in' }); return null; }
    return user;
  };
  const failure = (res, error) => {
    if (error instanceof CentersError) return json(res, error.status, { error: error.message, code: error.code });
    if(error.code==='23514'&&error.constraint==='class_series_review')return json(res,409,{error:'class series review changed',code:'class-series-review-changed'});
    if(error.code==='23514'&&error.constraint==='class_attendance_revision')return json(res,409,{error:'attendance revision changed',code:'version-conflict'});
    if(error.code==='23514'&&error.constraint==='class_instructor_available')return json(res,409,{error:'instructor assignment unavailable',code:'class-instructor-unavailable'});
    if(error.code==='23514'&&error.constraint==='class_instructor_schedule')return json(res,409,{error:'instructor schedule conflict',code:'class-instructor-conflict'});
    if (error.code === '23514' && error.constraint === 'class_room_schedule') return json(res, 409, { error: 'class room schedule conflict', code: 'class-room-conflict' });
    if (error.code === '23505') return json(res, 409, { error: 'duplicate resource', code: 'duplicate' });
    if (error.code === '23P01') return json(res,409,{error:'subscription periods overlap',code:'subscription-overlap'});
    if (error.code === '23514' || error.code === '23503') return json(res, 409, { error: 'invalid business relation or state', code: 'invalid-state' });
    return json(res, 503, { error: 'centers are temporarily unavailable', code: 'centers-unavailable' });
  };
  const current = (req, user, sv) => readSession(req) === user && (user.sv || 0) === sv;
  const readClasses=(own,detail=false)=>async(req,res)=>{
    const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
    if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
    try{const options=classListOptions(params,{detail}),result=await (detail?classRoster:listClasses)(database,user.id,centerId,options,{own,platform:!own&&isPlatformUser(config,user),lookupAccount});
      if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(error){return failure(res,error)}
  };
  const readFreezes=own=>async(req,res)=>{
    const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
    if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
    try{const result=await listFreezeRequests(database,user.id,centerId,freezePageOptions(params,{own}),{own,platform:!own&&isPlatformUser(config,user)});
      if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(error){return failure(res,error)}
  };
  const mutate = (platform, operation) => async (req,res) => {
    const user=guard(req,res);if(!user)return;
    const sv=user.sv||0;
    if(platform&&!isPlatformUser(config,user))return json(res,403,{error:'forbidden',code:'forbidden'});
    const checkSession=()=>{if(!current(req,user,sv))throw new CentersError(401,'not-signed-in','not signed in');};
    try{
      const body=await readBody(req);checkSession();
      const result=await operation({database,accountLocks,lookupAccount,readOwnTraining,hasTrainingExercise,mintAccessCredential,deviceKey:req.headers?.['x-center-device-key'],user,checkSession,config},body,{platform});
      checkSession();return json(res,200,result);
    }catch(error){return failure(res,error);}
  };
  const readTraining=(own,detail=false)=>async(req,res)=>{
    const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
    if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
    try{
      let result;
      if(detail){
        const id=params.get('id'),versionId=params.get('versionId');
        if(!recordId(id)||(versionId!==null&&!recordId(versionId)))return json(res,404,{error:'not found',code:'not-found'});
        if([...params.keys()].some(key=>!['centerId','id','versionId'].includes(key)))throw new CentersError(400,'invalid-input','invalid training selectors');
        result=await getTraining(database,user.id,centerId,id,{own,platform:isPlatformUser(config,user),versionId});
      }else result=await listTraining(database,user.id,centerId,trainingListOptions(params,{own}),{own,platform:isPlatformUser(config,user)});
      if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);
    }catch(error){return failure(res,error)}
  };
  const readAccess=({own=false,visits=false,member=false}={})=>async(req,res)=>{
    const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
    if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
    try{
      let result;
      if(member){
        if([...params.keys()].some(key=>!['centerId','memberId'].includes(key))||!recordId(params.get('memberId')))throw new CentersError(400,'invalid-input','member selector required');
        result=await accessMember(database,user.id,centerId,params.get('memberId'),{platform:isPlatformUser(config,user)});
      }else{
        if(own&&!visits&&[...params.keys()].some(key=>key!=='centerId'))throw new CentersError(400,'invalid-input','own access does not accept selectors');
        const options=accessPageOptions(params,{own,devices:!visits}),access=visits?accessVisits:accessStatus;
        result=await access(database,user.id,centerId,options,{own,platform:isPlatformUser(config,user)});
      }
      if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);
    }catch(error){return failure(res,error)}
  };
  return {
    'POST /api/centers/members/imports/prepare':mutate(false,(context,body)=>prepareMemberImport(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/members/imports/commit':mutate(false,(context,body)=>commitMemberImport(context,body,{platform:isPlatformUser(config,context.user)})),
    'GET /api/centers/members/imports/detail':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams;
      if([...params.keys()].some(key=>!['centerId','id'].includes(key)))return json(res,400,{code:'invalid-input',error:'invalid selectors'});
      if(!recordId(params.get('centerId'))||!recordId(params.get('id')))return json(res,404,{code:'not-found',error:'not found'});
      try{const result=await getMemberImport(database,user.id,params.get('centerId'),params.get('id'),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(error){return failure(res,error)}
    },
    'GET /api/centers/metrics':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await centerMetrics(database,user.id,centerId,metricsOptions(params),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(error){return failure(res,error)}
    },
    'GET /api/platform/centers/metrics':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0;if(!isPlatformUser(config,user))return json(res,403,{error:'forbidden',code:'forbidden'});
      try{const result=await globalMetrics(database,config,user,metricsOptions(new URL(req.url,'http://x').searchParams,{global:true}));if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(error){return failure(res,error)}
    },
    'GET /api/centers/access':readAccess(),
    'GET /api/centers/access/member':readAccess({member:true}),
    'GET /api/centers/access/visits':readAccess({visits:true}),
    'GET /api/centers/own/access':readAccess({own:true}),
    'GET /api/centers/own/access/visits':readAccess({own:true,visits:true}),
    'POST /api/centers/access/policy':mutate(false,(context,body)=>configureAccess(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/access/devices/create':mutate(false,(context,body)=>createAccessDevice(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/access/devices/rotate':mutate(false,(context,body)=>changeAccessDevice(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/access/devices/revoke':mutate(false,(context,body)=>changeAccessDevice(context,body,{platform:isPlatformUser(config,context.user),revoke:true})),
    'POST /api/centers/access/holds/create':mutate(false,(context,body)=>setAccessHold(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/access/holds/release':mutate(false,(context,body)=>releaseAccessHold(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/own/access/token':mutate(false,issueAccessToken),
    'POST /api/centers/access/consume':mutate(false,(context,body)=>consumeAccessToken(context,body,{platform:isPlatformUser(config,context.user)})),
    'GET /api/centers/classes/attendance/history':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await classAttendanceHistory(database,user.id,centerId,attendanceHistoryOptions(params),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(error){return failure(res,error)}
    },
    'POST /api/centers/classes/attendance/correct':mutate(false,(context,body)=>correctClassAttendance(context,body,{platform:isPlatformUser(config,context.user)})),
    'GET /api/centers/classes/instructors':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await classInstructors(database,user.id,centerId,classInstructorOptions(params),{platform:isPlatformUser(config,user),lookupAccount});
        if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(error){return failure(res,error)}
    },
    'GET /api/centers/classes/series':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await listClassSeries(database,user.id,centerId,classSeriesPageOptions(params),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(error){return failure(res,error)}
    },
    'GET /api/centers/classes/series/detail':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const options=classSeriesPageOptions(params,{detail:true}),result=await getClassSeries(database,user.id,centerId,options.id,{platform:isPlatformUser(config,user),lookupAccount});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(error){return failure(res,error)}
    },
    'POST /api/centers/classes/series/cancel/preview':mutate(false,(context,body)=>previewClassSeriesCancellation(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/classes/series/cancel':mutate(false,(context,body)=>cancelClassSeries(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/classes/series/preview':mutate(false,(context,body)=>previewClassSeries(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/classes/series/create':mutate(false,(context,body)=>createClassSeries(context,body,{platform:isPlatformUser(config,context.user)})),

    'POST /api/centers/passes/products/create':mutate(false,(context,body)=>createPassProduct(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/passes/products/revise':mutate(false,(context,body)=>revisePassProduct(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/passes/products/archive':mutate(false,(context,body)=>archivePassProduct(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/passes/preview':mutate(false,(context,body)=>previewPassPurchase(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/passes/purchase':mutate(false,(context,body)=>buyPass(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/passes/revoke':mutate(false,(context,body)=>revokePass(context,body,{platform:isPlatformUser(config,context.user)})),
    'GET /api/centers/passes/products':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const options=passOptions(params,{own:false,products:true});const result=await listPassProducts(database,user.id,centerId,options,{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(e){return failure(res,e)}
    },
    'GET /api/centers/passes':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const options=passOptions(params,{own:false,products:false});if(!recordId(params.get('memberId')))throw new CentersError(400,'invalid-input','member required');const result=await listPasses(database,user.id,centerId,params.get('memberId'),options,{own:false,platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(e){return failure(res,e)}
    },
    'GET /api/centers/own/passes':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const options=passOptions(params,{own:true,products:false});const result=await listPasses(database,user.id,centerId,null,options,{own:true,platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(e){return failure(res,e)}
    },
    'GET /api/centers/retention':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await listRetention(database,user.id,centerId,retentionOptions(params),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(e){return failure(res,e)}
    },
    'POST /api/centers/retention/policy':mutate(false,(context,body)=>configureRetention(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/retention/review':mutate(false,(context,body)=>reviewRetention(context,body,{platform:isPlatformUser(config,context.user)})),
    'GET /api/centers/own/training/progress/share':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      const checkSession=()=>{if(!current(req,user,sv))throw new CentersError(401,'not-signed-in','not signed in')};
      try{progressSelectors(params,{own:true});const result=await ownProgressShare({database,user,checkSession},centerId);checkSession();return json(res,200,result)}catch(e){return failure(res,e)}
    },
    'POST /api/centers/own/training/progress/share':mutate(false,changeProgressShare),
    'GET /api/centers/training/progress':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      const checkSession=()=>{if(!current(req,user,sv))throw new CentersError(401,'not-signed-in','not signed in')};
      try{const {memberId}=progressSelectors(params),result=await readSharedProgress({database,user,checkSession,accountLocks,readOwnTraining,lookupAccount},centerId,memberId,{platform:isPlatformUser(config,user)});checkSession();return json(res,200,result)}catch(e){return failure(res,e)}
    },
    'GET /api/centers/classes':readClasses(false),
    'GET /api/centers/own/classes':readClasses(true),
    'GET /api/centers/classes/roster':readClasses(false,true),
    'POST /api/centers/classes/create':mutate(false,(context,body)=>createClass(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/classes/cancel':mutate(false,(context,body)=>cancelClass(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/classes/attendance':mutate(false,(context,body)=>classAttendance(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/own/classes/reserve':mutate(false,reserveClass),
    'POST /api/centers/own/classes/cancel':mutate(false,cancelClassReservation),
    'GET /api/centers/freezes':readFreezes(false),
    'GET /api/centers/own/freezes':readFreezes(true),
    'POST /api/centers/freezes/policy':mutate(false,(context,body)=>configureFreezePolicy(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/own/freezes/request':mutate(false,requestFreeze),
    'POST /api/centers/own/freezes/withdraw':mutate(false,(context,body)=>decideFreeze(context,body,{own:true})),
    'POST /api/centers/freezes/decide':mutate(false,(context,body)=>decideFreeze(context,body,{platform:isPlatformUser(config,context.user)})),
    'GET /api/centers/training':readTraining(false),
    'GET /api/centers/own/training':readTraining(true),
    'GET /api/centers/training/proposal':readTraining(false,true),
    'GET /api/centers/own/training/proposal':readTraining(true,true),
    'POST /api/centers/training/propose':mutate(false,(context,body)=>proposeTraining(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/training/revise':mutate(false,(context,body)=>proposeTraining(context,body,{platform:isPlatformUser(config,context.user),revise:true})),
    'POST /api/centers/training/withdraw':mutate(false,(context,body)=>withdrawTraining(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/own/training/accept':mutate(false,acceptTraining),
    'POST /api/centers/own/training/ack':mutate(false,acknowledgeTraining),
    'POST /api/centers/stripe/webhook': async(req,res)=>{
      if(!config.enabled)return json(res,404,{error:'not found'});
      const params=new URL(req.url,'http://x').searchParams,profileId=params.get('profileId');
      if([...params.keys()].some(key=>key!=='profileId')||!recordId(profileId)||!config.stripeProfiles?.some(profile=>profile.id===profileId))return json(res,404,{error:'not found'});
      if(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity')return json(res,400,{error:'unsupported gateway encoding',code:'stripe-signature-invalid'});
      try{const raw=await readStripeBody(req);return json(res,200,await receiveStripeWebhook({database,config},profileId,raw,req.headers['stripe-signature']))}catch(error){if(error.clientGone)return;return failure(res,error)}
    },
    'GET /api/centers/stripe': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await stripeStatus(database,user.id,config,centerId,stripeListOptions(params),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(error){return failure(res,error)}
    },
    'GET /api/centers/own/stripe': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await stripeStatus(database,user.id,config,centerId,stripeListOptions(params,{own:true}),{own:true});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(error){return failure(res,error)}
    },
    'POST /api/centers/stripe/checkout': mutate(false,(context,body)=>checkoutStripe(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/own/stripe/checkout': mutate(false,(context,body)=>checkoutStripe(context,body,{own:true})),
    'POST /api/centers/stripe/reconcile': mutate(false,(context,body)=>reconcileStripe(context,body,{platform:isPlatformUser(config,context.user)})),
    'GET /api/centers/notifications': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,centerId=new URL(req.url,'http://x').searchParams.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await notificationStatus(database,user.id,centerId,{platform:isPlatformUser(config,user),config});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'POST /api/platform/centers/notifications/policy': mutate(true,configureNotificationPolicy),
    'POST /api/platform/centers/notifications/retry': mutate(true,retryBlockedNotifications),
    'GET /api/centers/own/notifications': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{ownPortalOptions(params);const result=await ownNotificationContact(database,user.id,centerId,{config});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'POST /api/centers/own/notifications/request': mutate(false,(context,body)=>{
      if(notificationMode(config,body?.centerId)==='off')throw new CentersError(503,'notification-not-configured','notification transport is not configured');return requestNotificationContact(context,body);
    }),
    'POST /api/centers/own/notifications/verify': mutate(false,verifyNotificationContact),
    'POST /api/centers/own/notifications/disable': mutate(false,disableNotificationContact),
    'GET /api/centers/billing/automation': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,centerId=new URL(req.url,'http://x').searchParams.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await automationStatus(database,user.id,centerId,{platform:isPlatformUser(config,user),workerEnabled:!!config.jobsEnabled});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'POST /api/platform/centers/billing/automation': mutate(true,configureAutomation),
    'POST /api/platform/centers/billing/jobs/retry': mutate(true,retryBillingJob),
    'GET /api/centers/own/membership': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{ownPortalOptions(params);const result=await ownMembership(database,user.id,centerId);if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'GET /api/centers/own/receipts': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{ownPortalOptions(params);const result=await ownReceipts(database,user.id,centerId,receiptListOptions(params));if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'GET /api/centers/own/payments': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{ownPortalOptions(params);const result=await ownPayments(database,user.id,centerId,receiptListOptions(params));if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'GET /api/centers/billing/debts': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await listDebt(database,user.id,centerId,debtListOptions(params),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'GET /api/centers/billing/calendar': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await listDebt(database,user.id,centerId,debtListOptions(params,{calendar:true}),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'GET /api/centers/billing/debts/export': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId');
      if(!recordId(centerId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await exportDebt(database,user.id,centerId,debtListOptions(params,{exporting:true}),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'POST /api/centers/payments/record': mutate(false,(context,body)=>recordPayment(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/centers/payments/refund': mutate(false,(context,body)=>recordRefund(context,body,{platform:isPlatformUser(config,context.user)})),
    'POST /api/platform/centers/role-capabilities': mutate(true,updateRefundCapability),
    'GET /api/centers/payments': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0;
      const params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId'),memberId=params.get('memberId');
      if(!recordId(centerId)||!recordId(memberId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await listPayments(database,user.id,centerId,memberId,receiptListOptions(params),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'POST /api/centers/receipts/generate': mutate(false,(context,body)=>generateReceipt(context,body,{platform:isPlatformUser(config,context.user)})),
    'GET /api/centers/receipts': async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0;
      const params=new URL(req.url,'http://x').searchParams,centerId=params.get('centerId'),memberId=params.get('memberId');
      if(!recordId(centerId)||!recordId(memberId))return json(res,404,{error:'not found',code:'not-found'});
      try{const result=await listReceipts(database,user.id,centerId,memberId,receiptListOptions(params),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}catch(error){return failure(res,error);}
    },
    'POST /api/centers/billing/preview': mutate(false,(context,body)=>previewBilling(context,body,{platform:isPlatformUser(config,context.user)})),
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
      try{const result=await listPlatformCenters(database,user.id,platformCenterListOptions(new URL(req.url,'http://x').searchParams));if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result);}
      catch(error){return failure(res,error);}
    },
    'GET /api/platform/centers/accounts': async (req,res) => {
      const user=guard(req,res);if(!user)return;
      if(!isPlatformUser(config,user))return json(res,403,{error:'forbidden',code:'forbidden'});
      try{return json(res,200,accountDirectoryPage(accountDirectory(),user.id,new URL(req.url,'http://x').searchParams))}catch(error){return failure(res,error)}
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
    'POST /api/centers/renewals/preview':mutate(false,(ctx,body)=>previewRenewal(ctx,body,{platform:isPlatformUser(config,ctx.user)})),
    'POST /api/centers/renewals/cash':mutate(false,(ctx,body)=>renewCash(ctx,body,{platform:isPlatformUser(config,ctx.user)})),
    'POST /api/centers/passes/day':mutate(false,(ctx,body)=>registerPassDay(ctx,body,{platform:isPlatformUser(config,ctx.user)})),
    'GET /api/centers/passes/history':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0,params=new URL(req.url,'http://x').searchParams,c=params.get('centerId');if(!recordId(c))return json(res,404,{code:'not-found'});
      try{const result=await passHistory(database,user.id,c,passHistoryOptions(params),{platform:isPlatformUser(config,user)});if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(e){return failure(res,e)}
    },
    'GET /api/centers/app-access':async(req,res)=>{
      const user=guard(req,res);if(!user)return;const sv=user.sv||0;
      try{const result=await applicationAccess(database,config,user);if(!current(req,user,sv))return json(res,401,{error:'not signed in'});return json(res,200,result)}catch(e){return failure(res,e)}
    },
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

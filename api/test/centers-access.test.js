import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accessPolicy,DEFAULT_ACCESS_POLICY,localAccessClock,centerIsOpen,decideAccess,accessToken,deviceCredential,tokenIsCurrent,ACCESS_TOKEN_LIFETIME_MS} from '../centers/domain/access.js';

const now=Date.parse('2026-10-15T10:00:00Z');
const input=()=>({policy:{enabled:true,requireSubscription:true,denyOverdue:true,graceDays:15},center:{state:'active',timezone:'Europe/Madrid',openingHours:{4:[['08:00','14:00'],['16:00','22:00']]}},member:{state:'active',joinedOn:'2026-10-01',endsOn:null},hasSubscription:true,hasOverdue:false,manualHold:false,now});
test('access policy requires an explicit bounded decision and defaults disabled',()=>{
  assert.equal(DEFAULT_ACCESS_POLICY.enabled,false);assert.deepEqual(accessPolicy(DEFAULT_ACCESS_POLICY),DEFAULT_ACCESS_POLICY);
  for(const value of [{enabled:true},{...DEFAULT_ACCESS_POLICY,graceDays:366},{...DEFAULT_ACCESS_POLICY,denyOverdue:'false'},{...DEFAULT_ACCESS_POLICY,memberId:'foreign'}])assert.throws(()=>accessPolicy(value),{status:400});
  assert.equal(decideAccess({...input(),policy:DEFAULT_ACCESS_POLICY}).reason,'not-configured');
});
test('access separates membership, explicit manual hold, contract and financial policy',()=>{
  const a=input();assert.deepEqual(decideAccess(a),{allowed:true,reason:null});
  for(const state of ['preactive','frozen','ended'])assert.equal(decideAccess({...a,member:{...a.member,state}}).reason,'membership-inactive');
  assert.equal(decideAccess({...a,member:{...a.member,joinedOn:'2026-10-16'}}).allowed,false);
  assert.equal(decideAccess({...a,member:{...a.member,endsOn:'2026-10-15'}}).allowed,false);
  assert.equal(decideAccess({...a,center:{...a.center,state:'inactive'}}).reason,'center-inactive');
  assert.equal(decideAccess({...a,manualHold:true,hasOverdue:false}).reason,'manual-hold','a payment cannot clear an independent manual hold');
  assert.equal(decideAccess({...a,hasSubscription:false}).reason,'no-current-subscription');
  assert.equal(decideAccess({...a,hasOverdue:true}).reason,'account-review');
  assert.equal(decideAccess({...a,hasOverdue:undefined}).allowed,false);
  assert.equal(decideAccess({...a,policy:{...a.policy,denyOverdue:false},hasOverdue:true}).allowed,true);
  assert.equal(decideAccess({...a,policy:{...a.policy,requireSubscription:false},hasSubscription:false}).allowed,true);
});
test('opening intervals are half-open, center-local, and fail closed when malformed or absent',()=>{
  const hours={4:[['08:00','14:00'],['16:00','24:00']]};
  for(const [minute,open] of [[479,false],[480,true],[839,true],[840,false],[959,false],[960,true],[1439,true]])assert.equal(centerIsOpen(hours,{day:4,minute}),open);
  for(const hours of [null,{},[],{4:[['22:00','08:00']]},{4:[['08:00','14:00'],['13:00','16:00']]},{4:[['08:90','14:00']]},{4:[['08:00']]}])assert.equal(centerIsOpen(hours,{day:4,minute:600}),false);
  assert.deepEqual(localAccessClock(Date.parse('2026-10-15T22:05:00Z'),'Europe/Madrid'),{today:'2026-10-16',day:5,minute:5});
  assert.equal(decideAccess({...input(),now:Date.parse('2026-10-15T13:00:00Z')}).reason,'closed');
});
test('DST gap/fold follow actual instants while expiry is always absolute',()=>{
  const zone='Europe/Madrid',before=localAccessClock(Date.parse('2026-03-29T00:59:00Z'),zone),after=localAccessClock(Date.parse('2026-03-29T01:00:00Z'),zone);
  assert.equal(before.minute,119);assert.equal(after.minute,180);
  const a=localAccessClock(Date.parse('2026-10-25T00:30:00Z'),zone),b=localAccessClock(Date.parse('2026-10-25T01:30:00Z'),zone);assert.deepEqual(a,b);assert.equal(centerIsOpen({0:[['02:00','03:00']]},a),true);
  const token={issuedAt:now,expiresAt:now+ACCESS_TOKEN_LIFETIME_MS};assert.equal(tokenIsCurrent(token,now+44999),true);assert.equal(tokenIsCurrent(token,now+45000),false);assert.equal(tokenIsCurrent(token,now-1),false);
  for(const patch of [{consumedAt:now+1},{invalidatedAt:now+1},{expiresAt:now+90000},{issuedAt:NaN}])assert.equal(tokenIsCurrent({...token,...patch},now+2),false);
});
test('QR and reception credentials are distinct opaque bounded formats with no identity payload',()=>{
  const random='a'.repeat(43);assert.equal(accessToken('gqr1_'+random),'gqr1_'+random);assert.equal(deviceCredential('gdev1_'+random),'gdev1_'+random);
  for(const value of ['gqr1_short','gqr1_'+random+'x','https://example.invalid/'+random,'gdev1_'+random,'gqr1_'+random+'\n'])assert.equal(accessToken(value),null);
  assert.equal(deviceCredential('gqr1_'+random),null);
});

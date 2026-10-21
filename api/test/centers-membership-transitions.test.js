import {test} from 'node:test';
import assert from 'node:assert/strict';
import {membershipDate,planMembershipTransition} from '../centers/domain/membership-transitions.js';
const member=state=>({state,joinedOn:'2024-01-01',accountUid:'unchanged',version:1});
const now={today:'2026-10-13'};
test('membership dates reject impossible days and preserve leap-year boundaries',()=>{
  assert.equal(membershipDate('2024-02-29'),'2024-02-29');
  for(const value of ['2026-02-29','2026-04-31','2026-13-01','2026-10-13T00:00:00Z','13/10/2026',null])assert.throws(()=>membershipDate(value),{status:400});
});
test('termination is planned separately from account identity and future effects',()=>{
  for(const state of ['preactive','active','frozen']){
    const source=member(state),before=structuredClone(source);
    const plan=planMembershipTransition(source,{action:'end',effectiveOn:'2026-11-01',reason:'Synthetic reason'},now);
    assert.equal(plan.toState,'ended');assert.equal(plan.fromState,state);assert.equal(plan.scheduled,true);
    assert.deepEqual(source,before);assert.equal('accountUid'in plan,false);assert.equal(Object.isFrozen(plan),true);
  }
});
test('freeze and resume only permit valid source states and ordered dates',()=>{
  const frozen=planMembershipTransition(member('active'),{action:'freeze',effectiveOn:'2026-10-13',resumeOn:'2026-10-31',reason:'Synthetic pause'},now);
  assert.equal(frozen.toState,'frozen');assert.equal(frozen.scheduled,false);
  const resumed=planMembershipTransition(member('frozen'),{action:'resume',effectiveOn:'2026-10-13'},now);
  assert.equal(resumed.toState,'active');assert.equal(resumed.reason,null);
  for(const [state,action]of [['preactive','freeze'],['active','resume'],['ended','end'],['preactive','activate'],['active','constructor'],['constructor','end']]){
    assert.throws(()=>planMembershipTransition(member(state),{action,effectiveOn:'2026-10-13',reason:'Synthetic'},now),{status:409});
  }
});
test('retroactivity, privilege fields and invalid resumption dates are rejected',()=>{
  const valid={action:'freeze',effectiveOn:'2026-10-13',reason:'Synthetic'};
  for(const change of [{effectiveOn:'2026-10-12'},{resumeOn:'2026-10-13'},{resumeOn:'2026-10-01'},{reason:''},{accountUid:'other'},{state:'active'}]){
    assert.throws(()=>planMembershipTransition(member('active'),{...valid,...change},now),{status:400});
  }
  assert.throws(()=>planMembershipTransition(member('active'),{...valid,action:'end',resumeOn:'2026-11-01'},now),{status:400});
  assert.throws(()=>planMembershipTransition({...member('active'),joinedOn:'2026-10-20'},valid,now),{status:400});
});

import { CentersError } from '../errors.js';
import { objectBody, textField } from './validation.js';

const invalid=message=>{throw new CentersError(400,'invalid-input',message);};
export function membershipDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1000-01-01')invalid('ISO membership date required');
  const date=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)invalid('invalid calendar date');
  return value;
}

// Pure planning only. The caller supplies "today" in the center's zone and must persist
// scheduled events transactionally. No account disabling, SQL mutation or billing here.
// Activation of a preactive member belongs to the subscription workflow, not this endpoint.
export function planMembershipTransition(member,raw,{today}) {
  objectBody(raw,['action','effectiveOn','resumeOn','reason']);
  if(typeof raw.action!=='string'||!member||typeof member.state!=='string')invalid('membership action and state required');
  membershipDate(today);
  const effectiveOn=membershipDate(raw.effectiveOn),joinedOn=membershipDate(member.joinedOn);
  if(effectiveOn<today||effectiveOn<joinedOn)invalid('retroactive membership transition');
  const transitions={end:{preactive:'ended',active:'ended',frozen:'ended'},freeze:{active:'frozen'},resume:{frozen:'active'}};
  const target=Object.hasOwn(transitions,raw.action)&&Object.hasOwn(transitions[raw.action],member.state)?transitions[raw.action][member.state]:null;
  if(!target)throw new CentersError(409,'invalid-transition','membership transition is not allowed');
  const reason=textField(raw.reason,250,{required:raw.action!=='resume'});
  const resumeOn=raw.resumeOn==null?null:membershipDate(raw.resumeOn);
  if(resumeOn&&(raw.action!=='freeze'||resumeOn<=effectiveOn))invalid('invalid resumption date');
  return Object.freeze({action:raw.action,fromState:member.state,toState:target,effectiveOn,resumeOn,reason,scheduled:effectiveOn>today});
}

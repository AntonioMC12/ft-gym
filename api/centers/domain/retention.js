import {CentersError} from '../errors.js';
import {objectBody,textField} from './validation.js';
const invalid=()=>{throw new CentersError(400,'invalid-retention-policy','explicit inactivity settings required')};
export function retentionFields(raw){
  objectBody(raw,['enabled','daysWithoutVisit','includeNeverVisited']);if(typeof raw.enabled!=='boolean'||typeof raw.includeNeverVisited!=='boolean')invalid();
  const days=raw.daysWithoutVisit??null;if(days!==null&&(!Number.isSafeInteger(days)||days<1||days>3650)||raw.enabled&&days===null)invalid();
  return {enabled:raw.enabled,daysWithoutVisit:days,includeNeverVisited:raw.includeNeverVisited};
}
export function retentionActionFields(raw){
  if(!['reviewed','contacted','dismissed'].includes(raw.outcome))throw new CentersError(400,'invalid-retention-action','explicit review outcome required');
  const note=textField(raw.note,500);if(note&&/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note))throw new CentersError(400,'invalid-retention-action','invalid review note');if(raw.outcome==='dismissed'&&!note)throw new CentersError(400,'invalid-retention-action','dismissal reason required');
  return {outcome:raw.outcome,note};
}
export function retentionOptions(params){
  if([...params.keys()].some(key=>!['centerId','cursor','view'].includes(key))||(params.get('cursor')||'').length>2000||!['open','history'].includes(params.get('view')||'open'))throw new CentersError(400,'invalid-input','invalid retention selectors');
  return {view:params.get('view')||'open',cursor:params.get('cursor')||null};
}

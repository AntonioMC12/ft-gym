import {CentersError} from '../errors.js';
import {membershipDate} from './membership-transitions.js';

export function metricsOptions(params,{global=false}={}){
  if([...params.keys()].some(key=>!['from','to',...(global?[]:['centerId'])].includes(key)))throw new CentersError(400,'invalid-input','invalid metrics selectors');
  const from=params.get('from'),to=params.get('to');
  if((from===null)!==(to===null))throw new CentersError(400,'invalid-metrics-period','both period bounds required');
  if(from===null)return {from:null,to:null};
  try{membershipDate(from);membershipDate(to)}catch{throw new CentersError(400,'invalid-metrics-period','valid business dates required')}
  if(from>to||(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000>365)throw new CentersError(400,'invalid-metrics-period','period must contain at most366days');
  return {from,to};
}
// Counts and money travel as exact integer strings, including negative net cash
// in a period that refunds an older payment. No rates/occupancy are inferred.
export function metricsDto(row){
  if(row.period_to>row.latest_today)throw new CentersError(400,'invalid-metrics-period','future reporting period is not available');
  return {definitionVersion:1,currency:'EUR',capturedAt:row.captured_at,dateBasis:'center-local-calendar',centerCount:row.center_count,
    period:{from:row.period_from,to:row.period_to,registeredMembers:row.registered_members,activations:row.activations,terminations:row.terminations,
      receiptsIssued:row.receipts_issued,receiptTotalMinor:row.receipt_total_minor,collectionsMinor:row.collections_minor,refundsMinor:row.refunds_minor,netCollectionsMinor:row.net_collections_minor},
    current:{members:row.members,active:row.active_members,frozen:row.frozen_members,ended:row.ended_members,preactive:row.preactive_members,subscriptions:row.subscriptions,
      outstandingMinor:row.outstanding_minor,overdueMinor:row.incomplete_policies==='0'?row.overdue_minor:null,overduePolicyComplete:row.incomplete_policies==='0'}};
}

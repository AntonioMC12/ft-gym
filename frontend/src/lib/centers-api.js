import { api } from './api.js'

export const centersMe = () => api('/api/centers/me')
export const centerMetrics=(centerId,options={},global=false)=>api((global?'/api/platform/centers/metrics':'/api/centers/metrics')+'?'+new URLSearchParams({...(!global?{centerId}:{}),...options}))
export function metricsErrorKey(error){return (error?.data?.code||error?.code)==='invalid-metrics-period'?'Check the reporting period (up to 366 days).':centersErrorKey(error)}
export const centerAccess=(centerId,options={},own=false)=>api('/api/centers/'+(own?'own/':'')+'access?'+new URLSearchParams({centerId,...options}))
export const centerAccessVisits=(centerId,options={},own=false)=>api('/api/centers/'+(own?'own/':'')+'access/visits?'+new URLSearchParams({centerId,...options}))
export const centerAccessMember=(centerId,memberId)=>api('/api/centers/access/member?'+new URLSearchParams({centerId,memberId}))
export const consumeCenterAccess=(body,key)=>api('/api/centers/access/consume',{method:'POST',headers:{'X-Center-Device-Key':key},body:JSON.stringify(body)})
export function accessErrorKey(error){
  const code=error?.data?.code||error?.code
  if(['access-unavailable','access-token-expired'].includes(code))return 'Access is unavailable. Reload or generate another QR.'
  if(['access-device-invalid','access-device-changed'].includes(code))return 'Activate this reception device again.'
  if(['access-rate-limited','access-device-limit'].includes(code))return 'Access limit reached. Wait before trying again.'
  if(['invalid-access-policy','invalid-input'].includes(code))return 'Check the access settings and opening hours.'
  if(code==='access-hold-exists')return 'This member already has a manual access hold.'
  return centersErrorKey(error)
}
export const centerTraining=(centerId,options={},own=false)=>api('/api/centers/'+(own?'own/':'')+'training?'+new URLSearchParams({centerId,...options}))
export const centerTrainingProposal=(centerId,id,own=false,versionId=null)=>api('/api/centers/'+(own?'own/':'')+'training/proposal?'+new URLSearchParams({centerId,id,...(versionId?{versionId}:{})}))
export function trainingErrorKey(error){
  const code=error?.data?.code||error?.code
  if(code==='invalid-training-plan')return 'Check the proposed routines. Only catalogue exercises are supported.'
  if(['training-not-synced','training-state-unavailable'].includes(code))return 'Sync your training, then retry delivery.'
  if(['training-member-inactive','training-account-required','training-proposal-unavailable','training-not-accepted'].includes(code))return 'This training proposal is not available. Reload it.'
  return centersErrorKey(error)
}
export const platformCenters = (options={}) => api('/api/platform/centers'+(Object.keys(options).length?'?'+new URLSearchParams(options):''))
export const centerDetail = id => api('/api/centers/detail?centerId=' + encodeURIComponent(id))
export const centerStaff = id => api('/api/centers/staff?centerId=' + encodeURIComponent(id))
export const centerAutomation=id=>api('/api/centers/billing/automation?'+new URLSearchParams({centerId:id}))
export const centerNotifications=id=>api('/api/centers/notifications?'+new URLSearchParams({centerId:id}))
export const ownCenterNotifications=id=>api('/api/centers/own/notifications?'+new URLSearchParams({centerId:id}))
export function notificationErrorKey(error){
  const code=error?.data?.code||error?.code
  if(code==='notification-code-invalid')return 'Check the verification code or request a new one.'
  if(code==='notification-rate-limited')return 'Wait before requesting another verification code.'
  if(code==='notification-not-configured')return 'Email notices are not configured.'
  if(code==='price-notice-required')return 'Respect the configured price notice period.'
  return centersErrorKey(error)
}
export const centerAccounts = (query='',options={}) => api('/api/platform/centers/accounts?' + new URLSearchParams({query,...options}))
export const centerMemberImport = (centerId,id)=>api('/api/centers/members/imports/detail?'+new URLSearchParams({centerId,id}))
export function memberImportErrorKey(error){const code=error?.data?.code||error?.code;return code==='invalid-member-csv'?'Check the CSV headers, quoting and file limits.':code==='import-review-changed'?'Reload the review before confirming.':code==='import-expired'?'Choose the CSV file again to start a new review.':code==='import-invalid-rows'?'Fix invalid rows before importing.':membersErrorKey(error)}
export const centerCommand = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) })
export const centerMembers = (centerId, options = {}) => api('/api/centers/members?' + new URLSearchParams({centerId,...options}))
export const centerMember = (centerId, id) => api('/api/centers/member?' + new URLSearchParams({centerId,id}))
export const centerPlans = (centerId, options={}) => api('/api/centers/plans?'+new URLSearchParams({centerId,...options}))
export const centerPlan = (centerId,id) => api('/api/centers/plan?'+new URLSearchParams({centerId,id}))
export const centerSubscriptions = (centerId,memberId) => api('/api/centers/subscriptions?'+new URLSearchParams({centerId,memberId}))
export const centerReceipts = (centerId,memberId,options={}) => api('/api/centers/receipts?'+new URLSearchParams({centerId,memberId,...options}))
export function receiptsErrorKey(error) {
  const code=error?.data?.code||error?.code
  if(code==='quote-changed')return 'The amount changed. Preview it again before creating the receipt.'
  if(code==='receipt-exists')return 'A receipt already exists for this period with a different due date.'
  if(code==='billing-policy-required')return 'Tax and proration must be configured before calculating charges.'
  if(code==='invalid-input')return 'Check the billing period and due date.'
  return centersErrorKey(error)
}
export const centerPayments=(centerId,memberId,options={})=>api('/api/centers/payments?'+new URLSearchParams({centerId,memberId,...options}))
export const ownCenterMembership=centerId=>api('/api/centers/own/membership?'+new URLSearchParams({centerId}))
export const ownCenterReceipts=(centerId,options={})=>api('/api/centers/own/receipts?'+new URLSearchParams({centerId,...options}))
export const ownCenterPayments=(centerId,options={})=>api('/api/centers/own/payments?'+new URLSearchParams({centerId,...options}))
export const centerStripe=(centerId,options={})=>api('/api/centers/stripe?'+new URLSearchParams({centerId,...options}))
export const ownCenterStripe=(centerId,options={})=>api('/api/centers/own/stripe?'+new URLSearchParams({centerId,...options}))
export function stripeErrorKey(error){
  const code=error?.data?.code||error?.code
  if(code==='checkout-pending')return 'An active checkout reserves this receipt.'
  if(code==='stripe-rate-limited')return 'Wait before preparing another checkout.'
  if(code==='stripe-limit')return 'The test payment limit was reached.'
  if(code==='stripe-unavailable')return 'Test payments are unavailable.'
  return centersErrorKey(error)
}
export const centerDebt=(centerId,{calendar=false,...options}={})=>api('/api/centers/billing/'+(calendar?'calendar':'debts')+'?'+new URLSearchParams({centerId,...options}))
export const centerDebtExport=(centerId,options={})=>api('/api/centers/billing/debts/export?'+new URLSearchParams({centerId,...options}))
export function debtErrorKey(error) {
  const code=error?.data?.code||error?.code
  if(code==='debt-policy-required')return 'Debt policy is not configured.'
  if(code==='export-too-large')return 'Narrow the date range before exporting.'
  if(code==='invalid-input')return 'Check the due date range.'
  return centersErrorKey(error)
}
export function paymentsErrorKey(error) {
  const code=error?.data?.code||error?.code
  if(code==='checkout-pending')return stripeErrorKey(error)
  if(code==='payment-exceeds-balance')return 'The payment exceeds the outstanding balance. Reload the receipts.'
  if(code==='refund-exceeds-payment')return 'The refund exceeds the available payment. Reload the payments.'
  if(code==='invalid-input'||error?.message==='invalid price')return 'Check the amount, date and payment details.'
  return centersErrorKey(error)
}
export function subscriptionsErrorKey(error) {
  const code=error?.data?.code||error?.code
  if(code==='price-notice-required')return notificationErrorKey(error)
  if(['subscription-overlap','pending-subscription','pending-transition'].includes(code))return 'Cancel the pending change before adding another.'
  if(code==='price-version-changed')return 'Center changed. Reload and try again.'
  if(code==='invalid-transition'||code==='subscription-ended')return 'Membership change is not allowed.'
  return plansErrorKey(error)
}
export function plansErrorKey(error) {
  if((error?.data?.code||error?.code)==='plan-archived')return 'Archived plans'
  if((error?.data?.code||error?.code)==='invalid-input'||error?.message==='invalid price')return 'Check the membership plan details.'
  return centersErrorKey(error)
}
export const centerInvitations = (centerId, kind, memberId) => api('/api/centers/invitations?' + new URLSearchParams({centerId,kind,...(memberId?{memberId}:{})}))
export const inspectCenterInvitation = token => centerCommand('/api/centers/invitations/inspect',{token})
export const acceptCenterInvitation = token => centerCommand('/api/centers/invitations/accept',{token})

export function invitationErrorKey(error) {
  const code=error?.data?.code||error?.code
  if(code==='duplicate')return 'An invitation is already pending.'
  if(code==='account-linked')return 'Account linked'
  if(code==='invitation-expired'||error?.status===410)return 'Invitation expired'
  if(error?.status===404||error?.status===403)return 'This invitation is not available for this account.'
  return centersErrorKey(error)
}

export function membersErrorKey(error) {
  const code=error?.data?.code||error?.code
  if(code==='invalid-transition')return 'Membership change is not allowed.'
  if(code==='pending-transition')return 'Cancel the pending change before adding another.'
  if(code==='version-conflict'||code==='idempotency-conflict')return 'Member changed. Reload and try again.'
  if(code==='duplicate')return 'Duplicate member in this center.'
  if(code==='invalid-input')return 'Check the member details.'
  return centersErrorKey(error)
}

export function centersErrorKey(error) {
  const code = error?.data?.code || error?.code
  if (code === 'version-conflict' || code === 'account-busy' || code === 'idempotency-conflict') return 'Center changed. Reload and try again.'
  if (code === 'last-manager') return 'Assign a replacement before removing the last manager.'
  if (code === 'duplicate') return 'This assignment already exists.'
  if (code === 'invalid-input' || code === 'invalid-state') return 'Check the center details.'
  if (error?.status === 403 || error?.status === 401) return 'You do not have access to this center.'
  return 'Centers are unavailable. Try again.'
}

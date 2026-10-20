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
  if(code==='training-account-required')return 'Link this member to an account before proposing routines.'
  if(code==='training-member-inactive')return 'Training proposals require an active member.'
  if(['training-proposal-unavailable','training-not-accepted'].includes(code))return 'This training proposal is not available. Reload it.'
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

export const centerFreezes=(centerId,{own=false,...options}={})=>api('/api/centers/'+(own?'own/':'')+'freezes?'+new URLSearchParams({centerId,...options}))
export function freezeErrorKey(error){
  const code=error?.data?.code||error?.code
  if(code==='freeze-disabled')return 'Freeze requests are disabled.'
  if(code==='freeze-limits'||code==='invalid-input')return 'Check the freeze dates and configured limits.'
  if(code==='freeze-policy-changed'||code==='freeze-decided'||code==='freeze-owner-changed')return 'Center changed. Reload and try again.'
  if(code==='freeze-pending')return 'Cancel the pending change before adding another.'
  return membersErrorKey(error)
}
export const centerClasses=(centerId,{own=false,...options}={})=>api('/api/centers/'+(own?'own/':'')+'classes?'+new URLSearchParams({centerId,...options}))
export const centerClassRoster=(centerId,id,options={})=>api('/api/centers/classes/roster?'+new URLSearchParams({centerId,id,...options}))
export function classesErrorKey(error){
  const code=error?.data?.code||error?.code
  if(code==='class-full')return 'This class is full.'
  if(code==='class-ineligible')return 'Your membership or plan does not allow this class.'
  if(code==='class-series-review-changed')return 'Review this series again after changes.'
  if(code==='class-timezone-changed')return 'The center time zone changed. Reload before scheduling.'
  if(code==='invalid-class-series'||code==='class-series-invalid')return 'Review the series dates, limits and conflicts.'
  if(code==='class-attendance-unchanged')return 'Attendance already has that state.'
  if(code==='class-instructor-conflict')return 'This instructor already has a class at that time.'
  if(code==='class-instructor-unavailable')return 'The instructor assignment does not cover this class.'
  if(code==='class-room-conflict')return 'This room already has a class at that time.'
  if(code==='class-time-ambiguous')return 'Choose the first or second occurrence of this repeated hour.'
  if(code==='class-time-missing'||code==='class-plan-required'||code==='invalid-input'||code==='invalid-state')return 'Check the class schedule, plans and limits.'
  if(['class-closed','class-cancel-closed','class-not-ended','class-reservation-ended'].includes(code))return 'Booking or cancellation is closed.'
  if(code==='class-already-booked')return 'Booked'
  return centersErrorKey(error)
}

export function centersErrorKey(error) {
  const code = error?.data?.code || error?.code
  if (['version-conflict','account-busy','idempotency-conflict','activation-changed','activation-document-changed','activation-account-unavailable','account-linked'].includes(code)) return 'Center changed. Reload and try again.'
  if (code === 'last-manager') return 'Assign a replacement before removing the last manager.'
  if (code === 'duplicate') return 'This assignment already exists.'
  if (code === 'invalid-input' || code === 'invalid-state') return 'Check the center details.'
  if (error?.status === 403 || error?.status === 401) return 'You do not have access to this center.'
  return 'Centers are unavailable. Try again.'
}

export const centerClassInstructors=(centerId,options={})=>api('/api/centers/classes/instructors?'+new URLSearchParams({centerId,...options}))

export const centerAttendanceHistory=(centerId,id,options={})=>api('/api/centers/classes/attendance/history?'+new URLSearchParams({centerId,id,...options}))

export const centerClassSeriesList=(centerId,options={})=>api('/api/centers/classes/series?'+new URLSearchParams({centerId,...options}))
export const centerClassSeries=(centerId,id)=>api('/api/centers/classes/series/detail?'+new URLSearchParams({centerId,id}))

export const centerProgressShare=centerId=>api('/api/centers/own/training/progress/share?'+new URLSearchParams({centerId}))
export const centerSharedProgress=(centerId,memberId)=>api('/api/centers/training/progress?'+new URLSearchParams({centerId,memberId}))
export function progressErrorKey(error){const code=error?.data?.code||error?.code;if(['invalid-progress-share','progress-routines-unavailable'].includes(code))return 'Check the selected routines and logged-date period (up to 366 days).';if(code==='training-state-unavailable')return 'Training data is unavailable. Reload or sync your profile.';if(['training-member-inactive','training-account-required','center-inactive'].includes(code))return 'An active center and membership are required to share progress.';return centersErrorKey(error)}

export const centerRetention=(centerId,options={})=>api('/api/centers/retention?'+new URLSearchParams({centerId,...options}))
export function retentionErrorKey(error){const code=error?.data?.code||error?.code;if(code==='invalid-retention-policy')return 'Choose explicit inactivity days (1–3650) and whether to include never-visited memberships.';if(code==='invalid-retention-action')return 'Choose a review outcome; dismissing requires a reason.';if(['retention-alert-changed','retention-already-reviewed','retention-unavailable'].includes(code))return 'This inactivity notice changed or was already reviewed. Reload it.';return centersErrorKey(error)}

export const centerPassProducts=(centerId,options={})=>api('/api/centers/passes/products?'+new URLSearchParams({centerId,...options}))
export const centerPasses=(centerId,options={},own=false)=>api('/api/centers/'+(own?'own/':'')+'passes?'+new URLSearchParams({centerId,...options}))
export function passesErrorKey(error){const code=error?.data?.code||error?.code;if(code==='invalid-pass')return 'Check pass credits, validity, price and tax policy.';if(['pass-unavailable','pass-member-inactive','pass-revoked','quote-changed'].includes(code))return 'The pass or its terms changed. Reload the preview.';return centersErrorKey(error)}

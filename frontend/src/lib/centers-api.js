import { api } from './api.js'

export const centersMe = () => api('/api/centers/me')
export const platformCenters = () => api('/api/platform/centers')
export const centerDetail = id => api('/api/centers/detail?centerId=' + encodeURIComponent(id))
export const centerStaff = id => api('/api/centers/staff?centerId=' + encodeURIComponent(id))
export const centerAccounts = query => api('/api/platform/centers/accounts?query=' + encodeURIComponent(query))
export const centerCommand = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) })
export const centerMembers = (centerId, options = {}) => api('/api/centers/members?' + new URLSearchParams({centerId,...options}))
export const centerMember = (centerId, id) => api('/api/centers/member?' + new URLSearchParams({centerId,id}))

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

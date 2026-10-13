import {MOBILE} from './mobile.js'
import {loadRemote} from './remote.js'
import {appBase} from './app-base.js'

export async function centerInvitationLink(token) {
  const base=MOBILE?(await loadRemote())?.base:location.origin+appBase().replace(/\/$/,'')
  if(!base||!/^https?:\/\//.test(base))throw new Error('invitation server unavailable')
  return base.replace(/\/$/,'')+'/#/centers/invite?'+new URLSearchParams({token})
}

import {api} from './api.js'
export const communityRead=(centerId,kind,options={})=>api('/api/community?'+new URLSearchParams({centerId,kind,...options}))
export const communityCommand=(centerId,action,fields,requestId)=>api('/api/community/command',{method:'POST',body:JSON.stringify({centerId,action,fields,requestId})})
export const communitySummary=()=>api('/api/community/summary')
export const communityError=e=>e?.data?.code==='community-closed'?'This conversation is closed. Reopen it to reply.':e?.status===429?'Please wait before sending again.':e?.status===409?'Center changed. Reload and try again.':e?.status===403?'You do not have permission.':'Could not load community. Try again.'
export const badgeLabel=key=>({'first-session':'First workout','ten-sessions':'Ten workouts','four-weeks':'Four weeks of consistency','first-record':'First personal record'}[key]||key)

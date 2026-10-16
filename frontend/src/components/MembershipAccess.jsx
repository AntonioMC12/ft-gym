import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'
import {useStore} from '../store/useStore.js'
import {useUI} from '../store/useUI.js'
import {Button} from './ui.jsx'
import {confirmSheet} from '../sheets.jsx'
import {t} from '../lib/i18n.js'
export function useMembershipAccess(user,config){
 const [state,setState]=useState(null),[revision,setRevision]=useState(0)
 useEffect(()=>{
  if(!user||!config?.centers?.enabled){setState(null);return}
  let current=true,pending=false;const uid=user.id
  const refresh=async()=>{if(pending||document.visibilityState==='hidden')return;pending=true;try{const result=await api('/api/centers/app-access');if(current&&useStore.getState().user?.id===uid)setState({uid,...result})}catch(e){if(current&&useStore.getState().user?.id===uid)setState({uid,error:e})}finally{pending=false}}
  const refused=()=>{if(current)refresh()}
  refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);window.addEventListener('membership-renewal-required',refused);const timer=setInterval(refresh,30000)
  return()=>{current=false;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('membership-renewal-required',refused)}
 },[user?.id,config?.centers?.enabled,revision])
 const enabled=!!user&&(config==null||!!config.centers?.enabled)
 return {allowed:!enabled||!!(state?.uid===user.id&&!state.error&&!state.blocked),blocked:state?.uid===user?.id&&state?.blocked,error:state?.uid===user?.id&&state?.error,warnings:state?.uid===user?.id?state?.warnings||[]:[],retry:()=>setRevision(n=>n+1)}
}
export function MembershipAccessScreen({access}){
 const [busy,setBusy]=useState(false)
 const logout=()=>confirmSheet({title:t('Sign out'),message:t('The changes your server has not seen are kept on this device, and added back when it connects as this account again.'),confirmText:t('Sign out'),onConfirm:async()=>{setBusy(true);try{const r=await useStore.getState().signOut({force:true});if(r?.owed&&!r.stashed)useUI.getState().toast(t('Couldn’t sign out. You’re still signed in.'))}finally{setBusy(false)}}})
 return <section className="card membership-access-screen"><h1>{t(access.blocked?'RENEW YOUR FEE TO CONTINUE USING THE APPLICATION':access.error?'Centers are unavailable. Try again.':'Loading centers')}</h1>{access.blocked&&<p>{t('Ask your gym manager to renew your fee and record your cash payment. Access returns after renewal.')}</p>}<Button variant="primary" onClick={access.retry}>{t('Reload centers')}</Button><Button disabled={busy} onClick={logout}>{t('Sign out')}</Button></section>
}
export function MembershipGraceNotice({warnings}){if(!warnings.length)return null;return <aside className="card membership-grace-notice" role="status"><strong>{t('Renewal grace period')}</strong>{warnings.map(w=><p key={w.centerId}>{w.centerName} · {t('Renew by')}: {w.deadline}</p>)}</aside>}

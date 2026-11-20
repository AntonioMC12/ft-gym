import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'
import {useStore} from '../store/useStore.js'
import {useUI} from '../store/useUI.js'
import {Button} from './ui.jsx'
import {confirmSheet} from '../sheets.jsx'
import {t} from '../lib/i18n.js'
import {registrationCenterId} from '../lib/registration-center.js'
import {isTransientError} from '../lib/transient-error.js'
export function useMembershipAccess(user,config){
 const [state,setState]=useState(null),[revision,setRevision]=useState(0)
 const server=useStore(s=>s.sync?.server||'')
 useEffect(()=>{
  if(!user||!config?.centers?.enabled){setState(null);return}
  let current=true,pending=false,queued=false,version=0,failures=0,timer;const uid=user.id
  const valid=()=>current&&useStore.getState().user?.id===uid&&(useStore.getState().sync?.server||'')===server
  const schedule=delay=>{clearTimeout(timer);timer=setTimeout(refresh,delay)}
  const refresh=async()=>{
   if(!current||pending)return
   if(document.visibilityState==='hidden'){schedule(30000);return}
   clearTimeout(timer);pending=true;const request=version
   try{
    const result=await api('/api/centers/app-access')
    if(typeof result?.blocked!=='boolean')throw Object.assign(new Error('Invalid access response'),{status:200})
    if(valid()&&request===version){failures=0;setState({uid,server,...result})}
   }catch(error){
    if(valid()&&request===version){
     failures++
     setState(previous=>isTransientError(error)&&previous?.uid===uid&&previous?.server===server&&typeof previous.blocked==='boolean'
      ?{...previous,connectionError:error}:{uid,server,error})
    }
   }finally{
    pending=false
    if(current){if(queued){queued=false;refresh()}else schedule(failures?Math.min(30000,2000*2**Math.min(failures-1,4))+Math.floor(Math.random()*500):30000)}
   }
  }
  // A refusal is authoritative even when an older successful check is in flight.
  const refused=event=>{
   version++;const access=event.detail?.access
   setState({uid,server,blocked:true,...(access?.blocked===true?access:{})})
   if(pending)queued=true;else refresh()
  }
  refresh();window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);window.addEventListener('membership-renewal-required',refused)
  return()=>{current=false;clearTimeout(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('membership-renewal-required',refused)}
 },[user?.id,server,config?.centers?.enabled,revision])
 const enabled=!!user&&(config==null||!!config.centers?.enabled)
 const own=state?.uid===user?.id&&state?.server===server?state:null
 return {allowed:!enabled||!!(own&&!own.error&&own.blocked===false),blocked:own?.blocked,error:own?.error,connectionError:own?.connectionError,reason:own?.reason,registrationCenterId:own?.registrationCenterId,warnings:own?.warnings||[],retry:()=>setRevision(n=>n+1)}
}
export function MembershipConnectionNotice({access}){
 if(!access.connectionError)return null
 return <aside className="card membership-grace-notice" role="status"><span>{t('Centers are unavailable. Try again.')}</span> <Button onClick={access.retry}>{t('Reload centers')}</Button></aside>
}
export function MembershipAccessScreen({access}){
 const [busy,setBusy]=useState(false),[requests,setRequests]=useState([]),[requestError,setRequestError]=useState(false)
 const uid=useStore(s=>s.user?.id)
 useEffect(()=>{let current=true;setRequests([]);setRequestError(false);if(access.reason==='activation-pending')api('/api/centers/activation/status').then(r=>{if(current)setRequests(r.requests)}).catch(()=>{if(current)setRequestError(true)});return()=>{current=false}},[uid,access.reason])
 const request=async()=>{setBusy(true);try{const centerId=access.registrationCenterId||registrationCenterId();if(!centerId)return;await api('/api/centers/activation/request',{method:'POST',body:JSON.stringify({centerId})});const status=await api('/api/centers/activation/status');setRequests(status.requests);access.retry()}catch{setRequestError(true)}finally{setBusy(false)}}
 const recheck=async()=>{access.retry();if(access.reason!=='activation-pending')return;try{const status=await api('/api/centers/activation/status');if(useStore.getState().user?.id===uid){setRequests(status.requests);setRequestError(false)}}catch{if(useStore.getState().user?.id===uid)setRequestError(true)}}
 const logout=()=>confirmSheet({title:t('Sign out'),message:t('The changes your server has not seen are kept on this device, and added back when it connects as this account again.'),confirmText:t('Sign out'),onConfirm:async()=>{setBusy(true);try{const r=await useStore.getState().signOut({force:true});if(r?.owed&&!r.stashed)useUI.getState().toast(t('Couldn’t sign out. You’re still signed in.'))}finally{setBusy(false)}}})
 if(access.reason==='activation-pending')return <section className="card membership-access-screen"><h1>{t('Pending activation by the center manager')}</h1><p>{t('Your account is registered. The manager must link it to your member record before you can use the application.')}</p>{requests.some(r=>r.status==='rejected')&&<p role="status">{t('Your activation request was rejected. Contact the center manager.')}</p>}{!requests.length&&<p>{t('Ask your center manager for the registration link.')}</p>}{requestError&&<p role="alert">{t('Centers are unavailable. Try again.')}</p>}<Button variant="primary" onClick={recheck}>{t('Check activation')}</Button>{!requests.length&&(access.registrationCenterId||registrationCenterId())&&<Button disabled={busy} onClick={request}>{t('Request activation')}</Button>}<Button disabled={busy} onClick={logout}>{t('Sign out')}</Button></section>
 return <section className="card membership-access-screen"><h1>{t(access.blocked?'RENEW YOUR FEE TO CONTINUE USING THE APPLICATION':access.error?'Centers are unavailable. Try again.':'Loading centers')}</h1>{access.blocked&&<p>{t('Ask your gym manager to renew your fee and record your cash payment. Access returns after renewal.')}</p>}<Button variant="primary" onClick={access.retry}>{t('Reload centers')}</Button><Button disabled={busy} onClick={logout}>{t('Sign out')}</Button></section>
}
export function MembershipGraceNotice({warnings}){if(!warnings.length)return null;return <aside className="card membership-grace-notice" role="status"><strong>{t('Renewal grace period')}</strong>{warnings.map(w=><p key={w.centerId}>{w.centerName} · {t('Renew by')}: {w.deadline}</p>)}</aside>}

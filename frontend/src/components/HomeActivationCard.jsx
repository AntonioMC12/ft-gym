import {useEffect,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {api} from '../lib/api.js'
import {centersErrorKey} from '../lib/centers-api.js'
import {Row,Button} from './ui.jsx'
import {t} from '../lib/i18n.js'

export default function HomeActivationCard(){
 const uid=useStore(s=>s.user?.id),enabled=useStore(s=>s.config?.centers?.enabled)
 const state=useCenters(),nav=useNavigate()
 const allowed=!!uid&&!!enabled&&state.ownerUid===uid&&state.status==='ready'&&state.platformCapabilities.includes('centers.manage')
 const [result,setResult]=useState(null),[error,setError]=useState(null),[retry,setRetry]=useState(0)
 useEffect(()=>{
  let alive=true,pending=false;setResult(null);setError(null)
  if(!allowed)return
  const refresh=async()=>{
   if(pending)return;pending=true
   try{
    const summary=await api('/api/platform/centers/activations/summary')
    if(alive&&useStore.getState().user?.id===uid){setResult({uid,...summary});setError(null)}
   }catch(e){if(alive&&useStore.getState().user?.id===uid){setError(e);if([401,403].includes(e.status))useCenters.getState().revokeOn(e)}}finally{pending=false}
  }
  const visible=()=>{if(document.visibilityState!=='hidden')refresh()}
  refresh();window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);const timer=setInterval(visible,60000)
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible)}
 },[uid,allowed,retry])
 if(!allowed||result?.uid!==uid||!result.total||!result.center)return null
 return <section className="card home-training-card home-activation-card has-updates" aria-label={t('Pending activations')}>
  <Row icon="clock" iconTint="var(--orange)" title={t('Pending activations')} subtitle={error?t(centersErrorKey(error)):result.total+' · '+result.center.name} value="●" accessory="chevron" onClick={()=>nav('/centers?'+new URLSearchParams({centerId:result.center.id,pane:'activations'}))}/>
  {error&&<Button size="sm" onClick={()=>setRetry(n=>n+1)}>{t('Retry')}</Button>}
 </section>
}

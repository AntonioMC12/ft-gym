import Passes from './Passes.jsx'
import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button} from '../../components/ui.jsx'
import QrCanvas from '../../components/QrCanvas.jsx'
import {centerAccess,centerAccessVisits,centerCommand,accessErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {centerDateTime} from '../../lib/center-time.js'
import {t} from '../../lib/i18n.js'

export default function OwnAccess({centerId,ownerUid,active=true,timezone='UTC',revision:parentRevision=0}){
  const [status,setStatus]=useState(null),[visits,setVisits]=useState([]),[cursor,setCursor]=useState(null),[token,setToken]=useState(null),[now,setNow]=useState(0),[expired,setExpired]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(null),[revision,setRevision]=useState(0)
  const [selectedPass,setSelectedPass]=useState(null)
  const choice=useRef(null)
  const life=useRef(0),pending=useRef(false),intent=useRef(null)
  const current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const failure=e=>{setError(e);useCenters.getState().revokeOn(e)}
  useEffect(()=>{
    const epoch=++life.current;pending.current=true;setBusy(true);setStatus(null);setVisits([]);setCursor(null);setToken(null);setExpired(false);setError(null);setSelectedPass(null);choice.current=null;intent.current=null
    Promise.all([centerAccess(centerId,{},true),centerAccessVisits(centerId,{},true)]).then(([data,page])=>{if(current(epoch)){setStatus(data);setVisits(page.visits);setCursor(page.nextCursor)}}).catch(e=>{if(current(epoch))failure(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,ownerUid,active,revision,parentRevision])
  useEffect(()=>{
    if(!token)return
    const tick=()=>{const next=performance.now();setNow(next);if(next>=token.deadline||document.visibilityState==='hidden'){setToken(null);setExpired(true)}}
    tick();const timer=setInterval(tick,250);document.addEventListener('visibilitychange',tick)
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick)}
  },[token])
  const issue=async()=>{
    if(!current(life.current)||pending.current||!active||!(selectedPass?selectedPass.canUse&&status?.allowPasses:status?.allowed)||document.visibilityState==='hidden')return;const epoch=life.current,started=performance.now(),chosen=selectedPass?.id||null;pending.current=true;setBusy(true);setError(null);setToken(null)
    if(!intent.current)intent.current=crypto.randomUUID();const used=intent.current
    try{
      const data=await centerCommand('/api/centers/own/access/token',{centerId,requestId:used,...(selectedPass?{passId:selectedPass.id}:{})});if(!current(epoch)||choice.current!==chosen)return
      if(intent.current===used)intent.current=null
      if(typeof data.token!=='string'||!/^gqr1_[A-Za-z0-9_-]{43}$/.test(data.token)||!Number.isSafeInteger(data.remainingMs)||data.remainingMs<=0||data.remainingMs>45000||document.visibilityState==='hidden')throw {code:'access-token-expired'}
      const deadline=started+data.remainingMs;if(deadline<=performance.now())throw {code:'access-token-expired'}
      setExpired(false);setNow(performance.now());setToken({value:data.token,deadline,centerId,ownerUid,passId:chosen})
    }catch(e){if(current(epoch)){if((e?.data?.code||e?.code)==='access-token-expired')intent.current=null;failure(e)}}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const more=async()=>{
    if(pending.current||!cursor)return;const epoch=life.current;pending.current=true;setBusy(true)
    try{const page=await centerAccessVisits(centerId,{cursor},true);if(current(epoch)){setVisits(old=>[...old,...page.visits]);setCursor(page.nextCursor)}}catch(e){if(current(epoch))failure(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const moreRef=useAutoMore(more)
  return <><Passes centerId={centerId} ownerUid={ownerUid} own revision={revision+parentRevision} active={active} selectedId={selectedPass?.id||''} onSelect={status?.allowPasses?row=>{choice.current=row?.id||null;setSelectedPass(row);setToken(null);intent.current=null}:undefined}/>{(!status||status.enabled||visits.length>0||error)&&<Section title={t('Center access')}><div className="centers-form">
    {status?.enabled&&!status.allowed&&<p role="status">{t('Access is unavailable. Reload or generate another QR.')}</p>}
    {token&&token.passId===(selectedPass?.id||null)&&token.centerId===centerId&&token.ownerUid===ownerUid&&useStore.getState().user?.id===ownerUid&&active&&document.visibilityState!=='hidden'&&token.deadline>now&&<><QrCanvas value={token.value}/><Row title={t('QR validity (seconds)')} value={Math.max(0,Math.ceil((token.deadline-now)/1000))}/></>}
    {expired&&<p role="status">{t('Access QR expired. Generate another.')}</p>}
    {selectedPass&&<p>{t('One credit is consumed only when reception validates this QR.')}</p>}
    {active&&(selectedPass?status?.allowPasses&&selectedPass.canUse:status?.allowed)&&<Button disabled={busy} onClick={issue}>{t(selectedPass?'Show pass access QR':'Show access QR')}</Button>}
    {visits.length>0&&<h3>{t('Verified visits')}</h3>}{visits.map(visit=><Row key={visit.id} title={centerDateTime(visit.visitedAt,timezone)}/>)}
    {cursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}
    <Button disabled={busy} onClick={()=>setRevision(n=>n+1)}>{t('Reload centers')}</Button>
    {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(accessErrorKey(error))}</p>}
  </div></Section>}</>
}

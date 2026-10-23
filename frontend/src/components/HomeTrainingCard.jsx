import {useEffect,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {Row,Button} from './ui.jsx'
import {centerTraining,trainingErrorKey} from '../lib/centers-api.js'
import {sha256Hex} from '../lib/sha256.js'
import {t} from '../lib/i18n.js'

// Only a digest of reviewed states is remembered, per account/device. Never persist
// proposal names, IDs, centers, permissions or bundles in personal training state.
const reviewKey=uid=>'gym_training_review_'+encodeURIComponent(uid)
function readReview(uid){try{return localStorage.getItem(reviewKey(uid))||''}catch{return ''}}
export default function HomeTrainingCard(){
 const uid=useStore(s=>s.user?.id),enabled=useStore(s=>s.config?.centers?.enabled),state=useCenters()
 const centers=state.ownerUid===uid&&state.status==='ready'?state.centers.filter(c=>c.capabilities?.includes('membership.own.read')):[]
 const scope=JSON.stringify(centers.map(c=>c.id).sort())
 const [result,setResult]=useState(null),[error,setError]=useState(null),[retry,setRetry]=useState(0),[seen,setSeen]=useState('')
 const nav=useNavigate()
 useEffect(()=>{
  let alive=true,pending=false;setResult(null);setError(null);setSeen(uid?readReview(uid):'')
  if(!uid||!enabled||!centers.length)return
  const refresh=async()=>{
   if(pending)return;pending=true
   try{
    const rows=[]
    for(const center of centers){let cursor=null;do{const page=await centerTraining(center.id,{limit:50,...(cursor?{cursor}:{})},true);if(!alive||useStore.getState().user?.id!==uid)return;rows.push(...page.proposals.map(p=>({...p,centerId:center.id})));cursor=page.nextCursor}while(cursor)}
    const available=rows.filter(p=>!(p.acceptedAt&&new Set((p.retirements||[]).map(r=>r.routineId)).size>=p.routineCount))
    const snapshots=rows.map(p=>[p.centerId,p.id,p.versionId,p.state,p.proposalState,p.acceptedAt,p.deliveryResult,p.retirements||[]]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
    const digest=await sha256Hex(new TextEncoder().encode(JSON.stringify(snapshots)))
    if(alive&&useStore.getState().user?.id===uid){setSeen(readReview(uid));setResult({uid,scope,digest,target:available.find(p=>p.state==='offered'&&p.proposalState==='offered'&&!p.acceptedAt)||available.find(p=>p.acceptedAt&&!p.deliveryResult)||null,total:available.length,resume:available.filter(p=>p.acceptedAt&&!p.deliveryResult).length,pending:available.filter(p=>p.state==='offered'&&p.proposalState==='offered'&&!p.acceptedAt).length});setError(null)}
   }catch(e){if(alive&&useStore.getState().user?.id===uid){setError({uid,scope,cause:e});if([401,403].includes(e.status))useCenters.getState().revokeOn(e)}}finally{pending=false}
  }
  const visible=()=>{if(document.visibilityState!=='hidden')refresh()}
  refresh();window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);const timer=setInterval(visible,60000)
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible)}
 },[uid,enabled,scope,retry])
 if(!uid||!enabled||!centers.length)return null
 const current=result?.uid===uid&&result.scope===scope?result:null,problem=error?.uid===uid&&error.scope===scope?error.cause:null
 const changed=!!current&&current.digest!==seen&&(current.total>0||!!seen),highlight=!!current&&(current.pending>0||current.resume>0||changed)
 const open=()=>{
  if(current&&!problem){try{localStorage.setItem(reviewKey(uid),current.digest)}catch{}setSeen(current.digest)}
  nav('/centers/membership?'+new URLSearchParams({pane:'training',...(current?.target&&!problem?{centerId:current.target.centerId,proposalId:current.target.id,versionId:current.target.versionId}:centers.length===1?{centerId:centers[0].id}:{})}))
 }
 return <section className={'card home-training-card'+(highlight?' has-updates':'')} aria-label={t('Training proposals')}>
  <Row icon="clipboard" iconTint="var(--acc)" title={t('Training proposals')} subtitle={problem?t(trainingErrorKey(problem)):!current?t('Loading…'):current.pending?t('Pending acceptance')+' · '+current.pending:current.resume?t('Retry delivery')+' · '+current.resume:changed?t('Status changed'):current.total?t('My centers'):t('No training proposals')} value={highlight?'●':null} accessory="chevron" onClick={open}/>
  {problem&&<Button size="sm" onClick={()=>setRetry(n=>n+1)}>{t('Retry')}</Button>}
 </section>
}

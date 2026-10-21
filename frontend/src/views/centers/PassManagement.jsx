import {useEffect,useRef,useState} from 'react'
import {Section,Button,Row,SearchField,Segmented} from '../../components/ui.jsx'
import {centerMembers,centerMember,centersErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {t} from '../../lib/i18n.js'
import {useCenterNavigation} from './NavigationGuard.jsx'
import Passes from './Passes.jsx'
import PassProducts from './PassProducts.jsx'
import PassHistory from './PassHistory.jsx'
export default function PassManagement({centerId,ownerUid,capabilities,active}){
 const canRead=capabilities.includes('billing.read'),canManage=capabilities.includes('billing.manage'),canCatalog=capabilities.includes('plans.manage'),canMembers=capabilities.includes('members.read')
 const [tab,setTab]=useState(canRead?(canMembers?'members':'history'):'catalog'),[member,setMember]=useState(null),[today,setToday]=useState(''),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[retry,setRetry]=useState(0)
 const navigate=useCenterNavigation(),life=useRef(0),pending=useRef(false),detail=useRef(0)
 const current=e=>life.current===e&&useStore.getState().user?.id===ownerUid
 useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),250);return()=>clearTimeout(timer)},[query])
 useEffect(()=>{const e=++life.current;detail.current++;setRows([]);setCursor(null);setError(null);setMember(null);setBusy(false);pending.current=false
  if(tab==='members'&&canRead&&canMembers){pending.current=true;setBusy(true);centerMembers(centerId,{query:search}).then(r=>{if(current(e)){setRows(r.members);setCursor(r.nextCursor)}}).catch(err=>{if(current(e))setError(err)}).finally(()=>{if(current(e)){pending.current=false;setBusy(false)}})}
  return()=>{life.current++;detail.current++;pending.current=false}
 },[centerId,ownerUid,tab,search,canRead,canMembers,retry])
 const more=async()=>{if(!cursor||pending.current)return;const e=life.current;pending.current=true;setBusy(true);try{const r=await centerMembers(centerId,{query:search,cursor});if(current(e)){setRows(old=>[...new Map([...old,...r.members].map(m=>[m.id,m])).values()]);setCursor(r.nextCursor)}}catch(err){if(current(e))setError(err)}finally{if(current(e)){pending.current=false;setBusy(false)}}}
 const moreRef=useAutoMore(more)
 const select=async m=>{const e=life.current,d=++detail.current;setBusy(true);setError(null);try{const r=await centerMember(centerId,m.id);if(current(e)&&detail.current===d){setMember(r.member);setToday(r.today)}}catch(err){if(current(e)&&detail.current===d)setError(err)}finally{if(current(e)&&detail.current===d)setBusy(false)}}
 const options=[...(canRead&&canMembers?[{value:'members',label:t('Members')}]:[]),...(canRead?[{value:'history',label:t('Pass history')}]:[]),...(canCatalog?[{value:'catalog',label:t('Pass products')}]:[])]
 return <div className="centers-pass-management"><Segmented options={options} value={tab} onChange={value=>navigate(()=>{setMember(null);setTab(value)})}/>
  {member?<><div className="centers-pass-management-heading"><Button icon="chevronLeft" onClick={()=>navigate(()=>{setMember(null);setRetry(n=>n+1)})}>{t('Back')}</Button><h3>{member.name} <small className="muted">{member.number}</small></h3></div><Passes key={member.id} centerId={centerId} memberId={member.id} ownerUid={ownerUid} today={today} active={active&&['active','preactive'].includes(member.state)} readOnly={!canManage} canConsume={canManage&&member.state==='active'} changed={()=>select(member)}/></>:
   tab==='catalog'&&canCatalog?<PassProducts centerId={centerId} ownerUid={ownerUid}/>:
   tab==='history'&&canRead?<PassHistory centerId={centerId} ownerUid={ownerUid} onManage={canManage&&canMembers?select:undefined}/>:
   tab==='members'&&canRead&&canMembers?<Section title={t('Visit passes')}><div className="centers-form"><SearchField aria-label={t('Search members')} placeholder={t('Search members')} value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/>{rows.map(m=><Row key={m.id} title={m.name} subtitle={m.number} value={m.fee?.hasPass?m.fee.passRemaining+' '+t('Credits remaining'):t('No passes available.')} accessory="chevron" onClick={()=>select(m)} disabled={busy}/>)}{!busy&&!rows.length&&!error&&<p>{t('No members available')}</p>}{cursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}</div></Section>:null}
  {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(centersErrorKey(error))}</p>}
 </div>
}

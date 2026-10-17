import CenterChoices from './CenterChoices.jsx'
import {writePlanView} from '../lib/plan-view.js'
import {useEffect,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {Button,Row} from './ui.jsx'
import Icon from './Icon.jsx'
import {centerDetail,centersErrorKey} from '../lib/centers-api.js'
import {t} from '../lib/i18n.js'
import {tappable} from '../lib/use-sheet-keyboard.js'

// Only a navigation preference (the ID) is persisted, scoped to the account.
// Names, lists and permissions are fetched afresh and never enter personal S.
const preferenceKey=uid=>'gym_home_center_'+encodeURIComponent(uid)
function readPreference(uid){try{return localStorage.getItem(preferenceKey(uid))||''}catch{return ''}}
function writePreference(uid,id){try{if(id)localStorage.setItem(preferenceKey(uid),id);else localStorage.removeItem(preferenceKey(uid))}catch{/* Storage may be unavailable. The shortcut still works for this visit. */}}

export default function HomeGymCard(){
  const nav=useNavigate(),user=useStore(s=>s.user),enabled=useStore(s=>s.config?.centers?.enabled),checkIn=useStore(s=>s.S.checkIn)
  const {ownerUid,platformCapabilities}=useCenters()
  if(enabled&&user&&ownerUid===user.id&&platformCapabilities.includes('centers.manage'))return <><section className="card"><Row icon="clipboard" title={t('Routines')} subtitle={t('Training plans')} accessory="chevron" onClick={()=>{writePlanView('routines');nav('/plan')}}/></section><CenterShortcut key={user.id} uid={user.id}/></>
  if(checkIn===false)return null
  return <div className="card tappable" style={{cursor:'pointer'}} {...tappable(()=>nav('/checkin'))}>
    <div className="row between"><div className="row" style={{gap:9}}><span className="lrow-i" style={{background:'var(--blue)'}}><Icon name="qr"/></span><div><div className="lbl2">{t('At the gym')}</div><div className="ttl">{t('Check in')}</div></div></div><Icon name="chevronRight" className="chev"/></div>
  </div>
}

function CenterShortcut({uid}){
  const nav=useNavigate(),[id,setId]=useState(()=>readPreference(uid)),[center,setCenter]=useState(null),[error,setError]=useState(null),[retry,setRetry]=useState(0),[choosing,setChoosing]=useState(false)
  useEffect(()=>{
    let current=true;setCenter(null);setError(null)
    if(id)centerDetail(id).then(r=>{if(current)setCenter(r.center)}).catch(e=>{if(!current)return;if(e.status===404){writePreference(uid,'');setId('');setChoosing(true)}else{setError(e);if([401,403].includes(e.status))useCenters.getState().revokeOn(e)}})
    return()=>{current=false}
  },[id,uid,retry])
  const choose=center=>{writePreference(uid,center.id);setId(center.id);setChoosing(false)}
  return <section className="card home-center-shortcut" aria-label={t('Manage centers')}>
    <div className="row" style={{gap:10}}><span className="lrow-i"><Icon name="house"/></span><div><div className="lbl2">{t('Manage centers')}</div><div className="ttl">{center?.name||t(id?'Loading centers':'Choose center')}</div></div></div>
    <div className="home-center-shortcut-actions">
      {center&&<Button type="button" variant="primary" trailingIcon="chevronRight" onClick={()=>nav('/centers?'+new URLSearchParams({centerId:center.id}))}>{t('Open center')}</Button>}
      <Button type="button" aria-expanded={choosing} onClick={()=>setChoosing(v=>!v)}>{t(choosing?'Cancel':id?'Change center':'Choose center')}</Button>
    </div>
    {error&&<><p role="alert">{t(centersErrorKey(error))}</p><Button type="button" onClick={()=>setRetry(n=>n+1)}>{t('Retry')}</Button></>}
    {choosing&&<CenterChoices ownerUid={uid} selectedId={id} choose={choose}/>}
  </section>
}


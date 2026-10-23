import HomeActivationCard from './HomeActivationCard.jsx'
import CenterChoices from './CenterChoices.jsx'
import {useEffect,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {Button,Row} from './ui.jsx'
import Icon from './Icon.jsx'
import {centerDetail,centersErrorKey} from '../lib/centers-api.js'
import {t} from '../lib/i18n.js'

// Only a navigation preference (the ID) is persisted, scoped to the account.
// Names, lists and permissions are fetched afresh and never enter personal S.
const preferenceKey=uid=>'gym_home_center_'+encodeURIComponent(uid)
function readPreference(uid){try{return localStorage.getItem(preferenceKey(uid))||''}catch{return ''}}
function writePreference(uid,id){try{if(id)localStorage.setItem(preferenceKey(uid),id);else localStorage.removeItem(preferenceKey(uid))}catch{/* Storage may be unavailable. The shortcut still works for this visit. */}}

export default function HomeGymCard(){
  const nav=useNavigate(),user=useStore(s=>s.user),enabled=useStore(s=>s.config?.centers?.enabled)
  const {ownerUid,status,platformCapabilities}=useCenters()
  if(enabled&&user&&ownerUid===user.id&&status==='ready'&&platformCapabilities.includes('centers.manage'))return <><CenterShortcut key={user.id} uid={user.id}/><HomeActivationCard/><section className="card home-routines-shortcut"><Row icon="dumbbell" iconTint="var(--purple)" title={t('Routines')} subtitle={t('Training plans')} accessory="chevron" onClick={()=>nav('/training-admin')}/></section><section className="card"><Row icon="chart" title={t('Member progress')} subtitle={t('Progress & history')} accessory="chevron" onClick={()=>nav('/member-progress')}/></section></>
  return null
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
    <div className="home-center-shortcut-header">
      <span className="lrow-i home-center-shortcut-icon" style={{'--tint':'var(--blue)'}}><Icon name="house"/></span>
      <div className="home-center-shortcut-heading"><div className="home-center-shortcut-label">{t('Manage centers')}</div><h2>{center?.name||t(id?'Loading centers':'Choose center')}</h2></div>
    </div>
    <div className="home-center-shortcut-actions">
      {center&&<Button type="button" variant="primary" trailingIcon="chevronRight" onClick={()=>nav('/centers?'+new URLSearchParams({centerId:center.id}))}>{t('Open center')}</Button>}
      <Button type="button" variant={center?'plain':'tinted'} aria-expanded={choosing} onClick={()=>setChoosing(v=>!v)}>{t(choosing?'Cancel':id?'Change center':'Choose center')}</Button>
    </div>
    {error&&<><p role="alert">{t(centersErrorKey(error))}</p><Button type="button" onClick={()=>setRetry(n=>n+1)}>{t('Retry')}</Button></>}
    {choosing&&<CenterChoices ownerUid={uid} selectedId={id} choose={choose}/>}
  </section>
}

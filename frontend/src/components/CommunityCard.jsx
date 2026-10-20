import {useEffect,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {communitySummary,communityError} from '../lib/community-api.js'
import {Row,Button} from './ui.jsx'
import {t} from '../lib/i18n.js'
export default function CommunityCard(){
 const uid=useStore(s=>s.user?.id),enabled=useStore(s=>s.config?.centers?.enabled),centers=useCenters(),nav=useNavigate()
 const ready=uid&&enabled&&centers.ownerUid===uid&&centers.status==='ready'
 const [data,setData]=useState(null),[error,setError]=useState(null),[retry,setRetry]=useState(0)
 useEffect(()=>{let alive=true,busy=false;setData(null);setError(null);if(!ready)return
  const load=async()=>{if(busy||document.visibilityState==='hidden')return;busy=true;try{const r=await communitySummary();if(alive&&useStore.getState().user?.id===uid){setData({uid,...r});setError(null)}}catch(e){if(alive){setError(e);if([401,403].includes(e.status))useCenters.getState().revokeOn(e)}}finally{busy=false}}
  load();window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);const timer=setInterval(load,60000);return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load)}
 },[uid,ready,retry])
 if(!ready)return null
 if(error&&data?.uid!==uid)return <section className="card community-home-card"><Row icon="chat" iconTint="var(--blue)" title={t('Community')} subtitle={t(communityError(error))}/><Button onClick={()=>setRetry(n=>n+1)}>{t('Retry')}</Button></section>
 if(data?.uid!==uid||!data.available)return null
 return <section className={'card home-training-card community-home-card'+(data.total?' has-updates':'')} aria-label={t('Community')}><Row icon="chat" iconTint="var(--blue)" title={t('Community')} subtitle={error?t(communityError(error)):data.total?t('Unread updates')+' · '+data.total:t('Questions, news and achievements')} value={data.total?'●':null} accessory="chevron" onClick={()=>nav('/community'+(data.target?'?'+new URLSearchParams({centerId:data.target.id}):''))}/>{error&&<Button onClick={()=>setRetry(n=>n+1)}>{t('Retry')}</Button>}</section>
}

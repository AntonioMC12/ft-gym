import {useEffect,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {api} from '../lib/api.js'
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {Button,Row,SearchField} from '../components/ui.jsx'
import {useAutoMore} from '../lib/use-auto-more.js'
import {t} from '../lib/i18n.js'
import Stats from './Stats.jsx'
export default function MemberProgress(){
 const [params,setParams]=useSearchParams(),uid=useStore(s=>s.user?.id),server=useStore(s=>s.sync?.server || ''),centers=useCenters(),[query,setQuery]=useState(''),[page,setPage]=useState(null),[detail,setDetail]=useState(null),[error,setError]=useState(false),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0)
 const allowed=centers.ownerUid===uid&&centers.status==='ready'&&centers.platformCapabilities.includes('centers.manage'),centerId=params.get('centerId'),memberId=params.get('memberId'),scope=JSON.stringify([uid,server,allowed,query,centerId,memberId,retry])
 useEffect(()=>{let alive=true;setPage(null);setDetail(null);setError(false);if(!allowed)return;setBusy(true)
 const path=memberId?'/api/platform/progress/member?'+new URLSearchParams({centerId,memberId}):'/api/platform/progress/members?'+new URLSearchParams({query})
 api(path).then(result=>{if(alive){if(memberId)setDetail({scope,...result});else setPage({scope,...result})}}).catch(e=>{if(alive){setError(true);if([401,403].includes(e.status))useCenters.getState().revokeOn(e)}}).finally(()=>{if(alive)setBusy(false)})
 return()=>{alive=false}
 },[scope])
 const current=page?.scope===scope?page:null,selected=detail?.scope===scope?detail:null
 const more=async()=>{if(busy||!current?.nextCursor)return;setBusy(true);try{const result=await api('/api/platform/progress/members?'+new URLSearchParams({query,cursor:current.nextCursor}));if(useStore.getState().user?.id===uid)setPage(old=>old?.scope===scope?{...old,members:[...old.members,...result.members],nextCursor:result.nextCursor}:old)}catch{setError(true)}finally{setBusy(false)}}
 const moreRef=useAutoMore(more)
 return <>
 {!allowed?<div className="card">{t(centers.status==='loading'?'Loading…':'Forbidden')}</div>:<>
 {!memberId&&<><h1 style={{marginBottom:20}}>{t('Member progress')}</h1><div style={{marginBottom:16}}><SearchField value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('Search…')} aria-label={t('Search…')}/></div>{current?.members.map(m=><section className="card" key={m.centerId+m.id}><Row title={m.name} subtitle={m.centerName+' · '+m.lastOn+' · '+m.workouts+' '+t('Workouts')} accessory="chevron" onClick={()=>setParams({centerId:m.centerId,memberId:m.id})}/></section>)}{current&&!current.members.length&&!current.nextCursor&&<div className="card">{t('No training data')}</div>}{current?.nextCursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}</>}
 {selected&&<Stats key={scope} progress={selected.progress} memberName={selected.member.name}/>}
 {busy&&<div className="card">{t('Loading…')}</div>}{error&&<div className="card">{t('Could not load member progress')}<Button onClick={()=>setRetry(v=>v+1)}>{t('Retry')}</Button></div>}
 </> }</>
}

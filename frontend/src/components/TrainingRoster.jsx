import {useEffect,useRef,useState} from 'react'
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {centerTrainingMembers,centerAssignedProgress,trainingErrorKey,progressErrorKey} from '../lib/centers-api.js'
import {routineTrend} from '../lib/training-trend.js'
import {useAutoMore} from '../lib/use-auto-more.js'
import {t} from '../lib/i18n.js'
import {Button,Row,SearchField} from './ui.jsx'
import Icon from './Icon.jsx'
import TrainingProposals from '../views/centers/TrainingProposals.jsx'
import ExerciseWeeklyProgress from './ExerciseWeeklyProgress.jsx'

function Evolution({centerId,ownerUid,member,onBack}){
 const [data,setData]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(true),[revision,setRevision]=useState(0),[plansOpen,setPlansOpen]=useState(false)
 useEffect(()=>{let live=true;setData(null);setError(null);setBusy(true)
  centerAssignedProgress(centerId,member.id).then(result=>{if(live&&useStore.getState().user?.id===ownerUid)setData(result)}).catch(e=>{if(live&&useStore.getState().user?.id===ownerUid){setError(e);useCenters.getState().revokeOn(e)}}).finally(()=>{if(live&&useStore.getState().user?.id===ownerUid)setBusy(false)})
  return()=>{live=false}
 },[centerId,ownerUid,member.id,revision])
 const routines=data?.report?.routines||[],last=routines.map(row=>row.lastSessionOn).filter(Boolean).sort().at(-1)
 return <div className="training-evolution">
  <Button icon="chevronLeft" onClick={onBack}>{t('Back to members')}</Button>
  <header className="training-evolution-header"><span className="training-roster-avatar" aria-hidden="true"><Icon name="person"/></span><div><h2>{member.name}</h2><p className="small muted">{member.number}</p></div><Button size="sm" disabled={busy} onClick={()=>setRevision(n=>n+1)}>{t('Refresh members')}</Button></header>
  <div className="training-evolution-stats"><div><span>{t('Accepted plans')}</span><strong>{member.plans}</strong></div><div><span>{t('Assigned routines')}</span><strong>{data?.shared?routines.length:'—'}</strong></div><div><span>{t('Last logged day')}</span><strong className="training-evolution-date">{last||'—'}</strong></div></div>
  {busy&&<p role="status">{t('Loading…')}</p>}
  {error&&<div className="training-roster-notice" role="alert"><Icon name="info"/><p>{t(progressErrorKey(error))}</p><Button disabled={busy} onClick={()=>setRevision(n=>n+1)}>{t('Retry')}</Button></div>}
  {data&&!data.shared&&<div className="training-roster-notice" role="status"><Icon name="info"/><div><h3>{t('Training evolution')}</h3><p className="small muted">{t('Training data is unavailable. Reload or sync your profile.')}</p></div></div>}
  {data?.shared&&<>
   <div className="training-evolution-period"><h3>{t('Training evolution')}</h3><span className="small muted">{data.report.period.from} → {data.report.period.to}</span></div>
   <p className="small muted">{t('Saved sessions are records, not proof of completed exercise.')}</p>
   {!routines.length&&<div className="training-roster-notice" role="status"><Icon name="info"/><p>{t('No assigned routines are available in this period.')}</p></div>}
   {routines.map((row,index)=>{const points=routineTrend(row,data.report.period),peak=Math.max(1,...points.map(point=>point.sessions));return <article className="training-routine-trend" key={index}>
    <div className="training-trend-heading"><h3>{row.name||t('Deleted routine')}</h3><span className="tag">{t('Saved sessions')} · {row.sessions}</span></div>
    <p className="small muted">{t('Logged days')} · {row.days} <span aria-hidden="true"> / </span> {t('Last logged day')} · {row.lastSessionOn||'—'}</p>
    {Array.isArray(row.exercises)&&<ExerciseWeeklyProgress exercises={row.exercises} period={data.report.period} unit={data.report.unit}/>}
    <details open={!Array.isArray(row.exercises)} className="training-attendance"><summary>{t('Sessions by week')}</summary><div className="training-trend-chart" role="img" aria-label={t('Sessions by week')+' · '+(row.name||t('Deleted routine'))}>
     {points.map(point=><div className="training-trend-column" key={point.from} title={t('Week of {0}: {1} saved sessions',point.from,point.sessions)}><span style={{height:point.sessions?Math.max(8,point.sessions/peak*100)+'%':'3px'}} className={point.sessions?'has-sessions':''}/></div>)}
    </div><div className="training-trend-axis small muted"><span>{points[0]?.from}</span><span>{t('Sessions by week')}</span><span>{points.at(-1)?.from}</span></div>
    {row.sessions===0&&<p className="small muted">{t('No saved sessions in this period.')}</p>}
    <details><summary>{t('View weekly breakdown')}</summary>{points.map(point=><Row key={point.from} title={point.from} value={String(point.sessions)}/>)}</details></details>
   </article>})}
  </>}
  <details className="training-roster-proposals" onToggle={event=>setPlansOpen(event.currentTarget.open)}><summary>{t('Plans and proposals')}</summary>{plansOpen&&<TrainingProposals centerId={centerId} member={member} ownerUid={ownerUid} canAssign active/>}</details>
 </div>
}

export default function TrainingRoster({centerId,ownerUid}){
 const [rows,setRows]=useState([]),[query,setQuery]=useState(''),[cursor,setCursor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[selected,setSelected]=useState(null),[revision,setRevision]=useState(0)
 const life=useRef(0),pending=useRef(false),current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
 useEffect(()=>{const epoch=++life.current;setRows([]);setCursor(null);setError(null);setBusy(true);pending.current=true
  const timer=setTimeout(()=>{centerTrainingMembers(centerId,{query}).then(result=>{if(current(epoch)){setRows(result.members);setCursor(result.nextCursor)}}).catch(e=>{if(current(epoch)){setError(e);useCenters.getState().revokeOn(e)}}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})},query?250:0)
  return()=>{clearTimeout(timer);life.current++;pending.current=false}
 },[centerId,ownerUid,query,revision])
 const more=async()=>{if(pending.current||!cursor)return;pending.current=true;setBusy(true);const epoch=life.current
  try{const result=await centerTrainingMembers(centerId,{query,cursor});if(current(epoch)){setRows(old=>[...old,...result.members]);setCursor(result.nextCursor)}}catch(e){if(current(epoch)){setError(e);useCenters.getState().revokeOn(e)}}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
 }
 const moreRef=useAutoMore(more)
 if(selected)return <Evolution key={selected.id} centerId={centerId} ownerUid={ownerUid} member={selected} onBack={()=>setSelected(null)}/>
 return <div className="training-roster">
  <p className="small muted">{t('Members with accepted plans. Open a member to see their training evolution.')}</p>
  <SearchField aria-label={t('Search members')} placeholder={t('Search members')} value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/>
  <div className="training-recipient-heading"><h3>{t('Members with routines')}</h3><Button size="sm" disabled={busy} onClick={()=>setRevision(n=>n+1)}>{t('Refresh members')}</Button></div>
  {rows.map(member=><div className="training-roster-member" key={member.id}><Row title={member.name} subtitle={member.number+' · '+t('Accepted plans')+': '+member.plans} accessory="chevron" onClick={()=>setSelected(member)}/></div>)}
  {busy&&<p role="status">{t('Loading…')}</p>}
  {error&&<div className="training-roster-notice" role="alert"><Icon name="info"/><p>{t(trainingErrorKey(error))}</p><Button onClick={()=>setRevision(n=>n+1)}>{t('Retry')}</Button></div>}
  {!busy&&!error&&!rows.length&&<div className="training-roster-notice" role="status"><Icon name="info"/><p>{t(query?'No members match this search.':'No members have accepted a training plan yet.')}</p></div>}
  {cursor&&!error&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}
 </div>
}

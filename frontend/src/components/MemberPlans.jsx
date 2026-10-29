import {useEffect,useRef,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {Button,TextField} from './ui.jsx'
import Icon from './Icon.jsx'
import {OriginBadge} from './RoutineOriginBadge.jsx'
import SwipeRow from './SwipeRow.jsx'
import {workoutControls} from '../lib/workout-controls.js'
import {t,dateLocale} from '../lib/i18n.js'
import {fmtDate} from '../lib/format.js'
import {plansOf,routinesForPlan,createTrainingPlan,removeTrainingPlan,favoriteTrainingPlan,deliveryForPlan,archiveTrainingPlan,recoverDeliveredPlans,moveRoutineToPlan} from '../lib/training-plans.js'
import {confirmSheet,menuSheet} from '../sheets.jsx'

export default function MemberPlans({S,update,renderRoutines}){
 const [query,setQuery]=useSearchParams(),id=query.get('plan'),plans=plansOf(S),selected=plans.find(p=>p.id===id)
 const [editing,setEditing]=useState(false),[creating,setCreating]=useState(false),[name,setName]=useState(''),[error,setError]=useState('')
 const heading=useRef(null)
 useEffect(()=>{heading.current?.focus({preventScroll:true})},[id])
 useEffect(()=>{if((S.routines||[]).some(r=>r.planId===undefined&&(S.planDeliveries||[]).some(d=>d.routineIds?.includes(r.id))))update(recoverDeliveredPlans)},[S.routines,S.planDeliveries,update])
 const open=value=>{setError('');setCreating(false);setQuery(q=>{const next=new URLSearchParams(q);if(value)next.set('plan',value);else next.delete('plan');return next})}
 const run=fn=>{try{update(fn);setError('');return true}catch(e){setError(t(e.message));return false}}
 const info=p=>{
  const delivery=deliveryForPlan(S,p.id),at=delivery?.acceptedAt||p.acceptedAt
  return <><p className="ss">{t(p.archivedAt?'Archived':'Active')}<OriginBadge trainer={!!delivery}/>{at?' · '+new Date(at).toLocaleString(dateLocale()):''}</p>{(p.startsOn||p.endsOn)&&<p className="ss">{[p.startsOn,p.endsOn].filter(Boolean).map(d=>fmtDate(d,false,true)).join(' – ')}</p>}</>
 }
 const toggle=p=>confirmSheet({title:t(p.archivedAt?'Reactivate plan':'Archive plan'),message:t('Routines, scheduling and workout history are preserved. Archived plans do not appear in pending workouts.'),confirmText:t(p.archivedAt?'Reactivate plan':'Archive plan'),onConfirm:()=>run(s=>archiveTrainingPlan(s,p.id,!p.archivedAt))})
 const remove=p=>confirmSheet({title:t('Delete plan'),message:t('Deleting this plan keeps its routines in No plan. Assignments and workout history are preserved.'),danger:true,confirmText:t('Delete plan'),onConfirm:()=>{if(run(s=>removeTrainingPlan(s,p.id))&&id===p.id)open(null)}})
 const favorite=p=>run(s=>favoriteTrainingPlan(s,p.id))
 const favoriteAction=p=>({label:t(S.favoriteTrainingPlanId===p.id?'Remove favorite plan':'Favorite plan'),icon:S.favoriteTrainingPlanId===p.id?'starFill':'star',onClick:()=>run(s=>favoriteTrainingPlan(s,S.favoriteTrainingPlanId===p.id?null:p.id))})
 const cards=rows=><div className="list routine-list member-plan-list">{[...rows].sort((a,b)=>Number(b.id===S.favoriteTrainingPlanId)-Number(a.id===S.favoriteTrainingPlanId)).map(p=>{
  const count=routinesForPlan(S,p.id).length,delivery=deliveryForPlan(S,p.id),at=delivery?.acceptedAt||p.acceptedAt
  const details=[t(count===1?'{0} routine':'{0} routines',count),t(p.archivedAt?'Archived':'Active'),at?new Date(at).toLocaleString(dateLocale()):null,(p.startsOn||p.endsOn)?[p.startsOn,p.endsOn].filter(Boolean).map(d=>fmtDate(d,false,true)).join(' – '):null].filter(Boolean).join(' · ')
  const row=<div key={p.id} className="item member-plan-row"><button className="member-plan-open" onClick={()=>open(p.id)}><span className={'lrow-i'+(S.favoriteTrainingPlanId===p.id?' member-plan-favorite':'')}><Icon name={S.favoriteTrainingPlanId===p.id?'starFill':'clipboard'}/></span><span className="grow"><span className="tt">{p.name==='Assigned plan'?t(p.name):p.name}{S.favoriteTrainingPlanId===p.id&&<span className="sr-only"> · {t('Favorite plan')}</span>}<OriginBadge trainer={!!delivery}/></span><span className="ss">{details}</span></span>{!editing&&<Icon name="chevronRight" className="chev"/>}</button>{editing&&!p.archivedAt&&<button className="iconbtn" aria-label={favoriteAction(p).label} aria-pressed={S.favoriteTrainingPlanId===p.id} onClick={favoriteAction(p).onClick}><Icon name={S.favoriteTrainingPlanId===p.id?'starFill':'star'}/></button>}{editing&&<button className="plan-minus" aria-label={t('Delete {0}',p.name)} title={t('Delete plan')} onClick={()=>remove(p)}><Icon name="minus"/></button>}{editing&&<Button size="sm" onClick={()=>toggle(p)}>{t(p.archivedAt?'Reactivate plan':'Archive plan')}</Button>}</div>
  return workoutControls(S).swipeSets&&!editing?<SwipeRow key={p.id} className="swrow-item" deleteLabel={t('Delete plan')} onDelete={()=>remove(p)} copyIcon="starFill" copyLabel={t('Favorite plan')} onCopy={p.archivedAt?undefined:()=>favorite(p)}>{row}</SwipeRow>:row
 })}</div>
 const unfiled=routinesForPlan(S,null)
 return <section className="member-plans" aria-label={t('My plans')}>
  {id?<>
   <Button className="member-plan-back" size="sm" icon="chevronLeft" onClick={()=>open(null)}>{t('Back to my plans')}</Button>
   {id==='unfiled'?<><h2 ref={heading} tabIndex={-1}>{t('Routines without a plan')}</h2>{renderRoutines(null)}</>:selected?<>
    <header className="member-plan-header"><div><h2 ref={heading} tabIndex={-1}>{selected.name==='Assigned plan'?t(selected.name):selected.name}</h2>{info(selected)}</div><button className="iconbtn" aria-label={t('Plan options')} onClick={()=>menuSheet({title:selected.name,items:[...(!selected.archivedAt?[favoriteAction(selected)]:[]),{label:t(selected.archivedAt?'Reactivate plan':'Archive plan'),onClick:()=>toggle(selected)},{label:t('Delete plan'),icon:'trash',onClick:()=>remove(selected)},...(!selected.archivedAt&&plans.some(p=>p.id!==id&&!p.archivedAt)?[{label:t('Archive a previous plan'),onClick:()=>menuSheet({title:t('Archive a previous plan'),items:plans.filter(p=>p.id!==id&&!p.archivedAt).map(p=>({label:p.name,onClick:()=>toggle(p)}))})}]:[])]})}><Icon name="more"/></button></header>
    <h3>{t('Routines in {0}',t(selected.name))}</h3>
    {!selected.archivedAt&&unfiled.length>0&&<Button icon="plus" onClick={()=>menuSheet({title:t('Add existing routine'),items:unfiled.map(r=>({label:r.name,onClick:()=>run(s=>moveRoutineToPlan(s,r.id,id))}))})}>{t('Add existing routine')}</Button>}
    {renderRoutines(id,!!selected.archivedAt)}
   </>:<p role="status">{t('Plan unavailable')}</p>}
  </>:<>
   <div className="row between plan-sec-h plan-routines-bar"><button className="plan-textbtn" aria-pressed={editing} disabled={!plans.length} onClick={()=>setEditing(v=>!v)}>{t(editing?'Done':'Edit')}</button><Button size="sm" variant="tinted" icon="plus" onClick={()=>setCreating(true)}>{t('New plan')}</Button></div>
   {cards(plans.filter(p=>!p.archivedAt))}
   {!plans.some(p=>!p.archivedAt)&&<p className="empty">{t('No active plans. Create your own plan or accept one from your trainer.')}</p>}
   {!!plans.some(p=>p.archivedAt)&&<details><summary>{t('Archived plans')} ({plans.filter(p=>p.archivedAt).length})</summary>{cards(plans.filter(p=>p.archivedAt))}</details>}
   {!!unfiled.length&&<details><summary>{t('Routines without a plan')} ({unfiled.length})</summary><p className="ss">{t('Existing routines are preserved. Open a personal plan to organize them.')}</p><Button onClick={()=>open('unfiled')}>{t('View routines')}</Button></details>}
  </>}
  {creating&&<form onSubmit={e=>{e.preventDefault();let created;if(run(s=>{created=createTrainingPlan(s,name)})){setName('');open(created)}}}><label className="centers-field"><span>{t('Plan name')}</span><TextField autoFocus required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><Button type="submit" variant="primary">{t('Create plan')}</Button><Button type="button" onClick={()=>setCreating(false)}>{t('Cancel')}</Button></form>}
  {error&&<p role="alert">{error}</p>}
 </section>
}

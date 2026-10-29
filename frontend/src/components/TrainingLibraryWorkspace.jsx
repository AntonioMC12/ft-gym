import {useEffect,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {Button,SearchField,Check,Segmented} from './ui.jsx'
import Icon from './Icon.jsx'
import RoutineOriginBadge from './RoutineOriginBadge.jsx'
import TrainingPlanLibrary from './TrainingPlanLibrary.jsx'
import {useUnsavedCenterForm,useCenterNavigation} from '../views/centers/NavigationGuard.jsx'
import {t} from '../lib/i18n.js'
import {uid} from '../lib/format.js'
import {planOf,planFolder,routinesForPlan,moveRoutineToPlan,reorderPlanRoutine} from '../lib/training-plans.js'
import {deleteRoutine} from '../lib/routines.js'
import {confirmSheet} from '../sheets.jsx'

export const routineCount=n=>t(n===1?'{0} routine':'{0} routines',n)
export const exerciseCount=n=>t(n===1?'{0} exercise':'{0} exercises',n)

function PlanRoutines({S,update,plan,onEdit}){
 const [adding,setAdding]=useState(false),[query,setQuery]=useState(''),[chosen,setChosen]=useState([]),[error,setError]=useState(''),[reordering,setReordering]=useState(false)
 const form=useUnsavedCenterForm(adding&&chosen.length?JSON.stringify(chosen):null)
 const rows=routinesForPlan(S,plan.id)
 const apply=action=>{try{update(action);setError('');return true}catch(e){setError(t(e.message));return false}}
 const create=()=>{const id=uid();if(apply(s=>{if(!s.trainingPlans?.[plan.id])throw new Error('Plan unavailable');s.routines.push({id,name:t('New routine'),emoji:'dumbbell',ex:[],planId:plan.id})}))onEdit(id)}
 const add=e=>{e.preventDefault();const selected=(S.routines||[]).filter(r=>chosen.includes(r.id)&&planOf(S,r)!==plan.id)
  const expected=new Map(selected.map(r=>[r.id,planOf(S,r)]))
  const commit=()=>{if(apply(s=>{
   if(!s.trainingPlans?.[plan.id])throw new Error('Plan unavailable')
   for(const r of selected){const current=s.routines.find(x=>x.id===r.id);if(!current||planOf(s,current)!==expected.get(r.id))throw new Error('The library changed. Review your selection and try again.')}
   for(const r of selected)moveRoutineToPlan(s,r.id,plan.id)
  })){setAdding(false);setChosen([]);setQuery('')}}
  if(selected.some(r=>planOf(S,r)))confirmSheet({title:t('Move routines to this plan?'),message:t('Each routine can belong to one plan. These routines will leave their current plans and move to {0}. Exercises and history are preserved.',plan.name),confirmText:t('Move'),onConfirm:commit})
  else commit()
 }
 const unlink=r=>confirmSheet({title:t('Remove from plan'),message:t('Remove {0} from {1}? The routine and its exercises remain in the Routines library. Assignments and history are preserved.',r.name,plan.name),confirmText:t('Remove from plan'),onConfirm:()=>apply(s=>{const current=s.routines.find(x=>x.id===r.id);if(current&&planOf(s,current)===plan.id)moveRoutineToPlan(s,r.id,null)})})
 const destroy=r=>confirmRoutineDeletion(r,()=>apply(s=>deleteRoutine(s,r.id)))
 const candidates=(S.routines||[]).filter(r=>r.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
 return <div className="plan-detail-routines">
  <div className="row between"><h3>{t('Routines in {0}',plan.name)}</h3>{rows.length>1&&<Button onClick={()=>setReordering(!reordering)}>{t(reordering?'Done':'Reorder routines')}</Button>}</div>
  <div className="training-plan-actions"><Button variant="tinted" icon="plus" disabled={adding} onClick={create}>{t('Create routine')}</Button><Button icon="plus" onClick={()=>{setAdding(!adding);setChosen([])}}>{t('Add existing routine')}</Button></div>
  {!rows.length&&<div className="plan-library-empty"><Icon name="dumbbell"/><p>{t('This plan has no routines yet.')}</p></div>}
  {adding&&<form className="plan-routine-picker" ref={form} onSubmit={add}><h4>{t('Add existing routine')}</h4><p className="ss">{t('Each routine belongs to one plan. Selecting a routine from another plan will move it after confirmation.')}</p><SearchField aria-label={t('Search routines')} placeholder={t('Search routines')} value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/>
   <div className="plan-picker-list">{candidates.map(r=>{const current=planOf(S,r),already=current===plan.id;return <div className="plan-picker-row" key={r.id}>{already?<Icon name="check"/>:<Check label={t('Select {0}',r.name)} checked={chosen.includes(r.id)} onChange={on=>setChosen(ids=>on?[...new Set([...ids,r.id])]:ids.filter(id=>id!==r.id))}/>}<span><strong>{r.name}</strong><small>{exerciseCount(r.ex?.length||0)} · {already?t('Already in this plan'):current?S.trainingPlans[current].name:t('No plan')}</small></span></div>})}{!candidates.length&&<p>{t('No matching routines.')}</p>}</div>
   <div className="training-plan-actions"><Button variant="primary" type="submit" disabled={!chosen.some(id=>S.routines.some(r=>r.id===id&&planOf(S,r)!==plan.id))}>{t('Add selected routines')}</Button><Button type="button" onClick={()=>{setAdding(false);setChosen([])}}>{t('Cancel')}</Button></div>
  </form>}
  <div className="plan-contained-list">{rows.map((r,index)=><article className="plan-contained-routine" key={r.id}><div className="plan-routine-main"><button className="plan-routine-open" onClick={()=>onEdit(r.id)}><span className="plan-type-icon"><Icon name="dumbbell"/></span><span><strong>{r.name}</strong><small>{exerciseCount(r.ex?.length||0)}{routineDays(S,r.id)?' · '+routineDays(S,r.id):''}</small><RoutineOriginBadge state={S} routine={r}/></span><Icon name="chevronRight"/></button><RoutineMenu routine={r} onEdit={()=>onEdit(r.id)} onRemove={()=>unlink(r)} onDelete={()=>destroy(r)}/></div>{reordering&&<div className="training-plan-actions plan-order-actions"><Button icon="arrowUp" aria-label={t('Move {0} up',r.name)} disabled={index===0} onClick={()=>apply(s=>reorderPlanRoutine(s,plan.id,r.id,-1))}>{t('Move up')}</Button><Button icon="arrowDown" aria-label={t('Move {0} down',r.name)} disabled={index===rows.length-1} onClick={()=>apply(s=>reorderPlanRoutine(s,plan.id,r.id,1))}>{t('Move down')}</Button></div>}</article>)}</div>
  {error&&<p role="alert">{error}</p>}
 </div>
}

const routineDays=(S,id)=>[1,2,3,4,5,6,0].filter(day=>[].concat(S.week?.[day]||[]).includes(id)).map(day=>t(['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day])).join(', ')
function confirmRoutineDeletion(r,onConfirm){confirmSheet({title:t('Delete routine'),message:t('Delete {0} from the library and its plan? Its exercises and calendar links will be removed from this library. Previously sent proposals, accepted assignments and saved workouts are preserved. Use Remove from plan to keep the routine.',r.name),danger:true,confirmText:t('Delete routine'),onConfirm})}
function RoutineMenu({routine,onEdit,onRemove,onDelete}){return <details className="training-action-menu"><summary aria-label={t('Actions for {0}',routine.name)}><Icon name="more"/></summary><div onClick={e=>e.currentTarget.parentElement.removeAttribute('open')}><Button icon="pencil" onClick={onEdit}>{t('Edit routine')}</Button>{onRemove&&<Button onClick={onRemove}>{t('Remove from plan')}</Button>}<Button icon="trash" onClick={onDelete}>{t('Delete routine')}</Button></div></details>}

export default function TrainingLibraryWorkspace({S,update,nav,onAssign}){
 const [params,setParams]=useSearchParams(),navigate=useCenterNavigation(),[error,setError]=useState('')
 const tab=params.get('libraryTab')==='routines'?'routines':'plans',planId=params.get('plan'),plan=tab==='plans'?S.trainingPlans?.[planId]:null
 const location=params.get('folder')||(plan?(planFolder(S,plan)||'unorganized'):'root'),query=params.get('routineQuery')||'',filter=params.get('routineFilter')==='unassigned'?'unassigned':'all'
 const change=(fn,options)=>{const next=new URLSearchParams(params);fn(next);setParams(next,options)}
 const selectPlan=(id,destination)=>change(next=>{if(id)next.set('plan',id);else next.delete('plan');if(!next.has('folder'))next.set('folder',location);if(destination)next.set('folder',destination);next.set('libraryTab','plans')})
 const openRoutine=id=>navigate(()=>nav('/training-admin/r/'+id+'?'+params.toString()))
 const rows=S.routines.filter(r=>(filter==='all'||!planOf(S,r))&&r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()))
 const deleteGlobal=r=>confirmRoutineDeletion(r,()=>{try{update(s=>deleteRoutine(s,r.id));setError('')}catch(e){setError(t(e.message))}})
 useEffect(()=>{if(planId&&planId!=='*'&&!S.trainingPlans?.[planId]){const next=new URLSearchParams(params);next.delete('plan');setParams(next,{replace:true})}},[planId,S.trainingPlans])
 return <div className="training-library-workspace">
  {!plan&&<Segmented label={t('Training library')} value={tab} options={[{value:'plans',label:t('Plans'),icon:'folder'},{value:'routines',label:t('Routines'),icon:'dumbbell'}]} onChange={value=>navigate(()=>change(next=>{next.set('libraryTab',value);next.delete('plan')}))}/>}
  {tab==='plans'?<TrainingPlanLibrary S={S} update={update} value={plan?planId:null} onChange={selectPlan} canAssign onAssign={onAssign} location={location} onLocationChange={id=>change(next=>{next.set('folder',id);next.delete('plan')})}>{plan&&<PlanRoutines key={planId} S={S} update={update} plan={{...plan,id:planId}} onEdit={openRoutine}/>}</TrainingPlanLibrary>:<section className="training-plan-library training-global-routines"><div className="row between"><div><h2>{t('Routine library')}</h2><p className="ss">{t('Independent routines and their current plan.')}</p></div><Button variant="tinted" icon="plus" onClick={()=>{const id=uid();try{update(s=>s.routines.push({id,name:t('New routine'),emoji:'dumbbell',ex:[]}));openRoutine(id)}catch(e){setError(t(e.message))}}}>{t('Create routine')}</Button></div>
   <SearchField aria-label={t('Search routines')} placeholder={t('Search routines')} value={query} onChange={e=>change(next=>next.set('routineQuery',e.target.value),{replace:true})} onClear={()=>change(next=>next.delete('routineQuery'),{replace:true})}/><Segmented label={t('Filter routines')} value={filter} options={[{value:'all',label:t('All')},{value:'unassigned',label:t('No plan')}]} onChange={value=>change(next=>next.set('routineFilter',value))}/>
   <p className="ss">{routineCount(rows.length)}</p><div className="plan-contained-list">{rows.map(r=><article key={r.id} className="plan-contained-routine"><div className="plan-routine-main"><button className="plan-routine-open" onClick={()=>openRoutine(r.id)}><span className="plan-type-icon"><Icon name="dumbbell"/></span><span><strong>{r.name}</strong><small>{exerciseCount(r.ex?.length||0)} · {planOf(S,r)?S.trainingPlans[r.planId].name:t('No plan')}</small><RoutineOriginBadge state={S} routine={r}/></span><Icon name="chevronRight"/></button><RoutineMenu routine={r} onEdit={()=>openRoutine(r.id)} onDelete={()=>deleteGlobal(r)}/></div></article>)}</div>{!rows.length&&<p className="plan-library-empty">{t('No matching routines.')}</p>}{error&&<p role="alert">{error}</p>}
  </section>}
 </div>
}

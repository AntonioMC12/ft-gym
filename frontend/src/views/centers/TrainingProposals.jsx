import {nav} from '../../lib/nav.js'
import {useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'
import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button,TextField,MultiSelectRow,Switch,SelectRow} from '../../components/ui.jsx'
import {centerTraining,centerTrainingProposal,centerCommand,trainingErrorKey} from '../../lib/centers-api.js'
import {buildTrainingProposal} from '../../lib/plan-share.js'
import {applyPlanDelivery} from '../../lib/plan-delivery.js'
import {exLine} from '../../lib/history.js'
import {POLICY_NAME} from '../../lib/progression.js'
import {EXIDX} from '../../lib/exercises.js'
import {isSharedEx} from '../../lib/exercises.js'
import {exerciseNameFor,t} from '../../lib/i18n.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {confirmSheet} from '../../sheets.jsx'

export default function TrainingProposals({centerId,member,ownerUid,own=false,active=true,canAssign=false,onLinkAccount,initialProposalId=null,initialVersionId=null,onCloseProposal}){
  const centerState=useCenters(),[assignmentFilter,setAssignmentFilter]=useState('active')
  const platform=centerState.ownerUid===ownerUid&&centerState.status==='ready'&&centerState.platformCapabilities.includes('centers.manage')
  const S=useStore(s=>s.S),[rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[detail,setDetail]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0)
  const [selected,setSelected]=useState([]),[name,setName]=useState(''),[schedule,setSchedule]=useState(false)
  const accountRequired=!own&&(member?.accountLinked===false||(error?.data?.code||error?.code)==='training-account-required')
  const canOffer=canAssign&&active&&member?.state==='active'
  const draftDirty=!!(selected.length||name||schedule)
  const saveForm=useUnsavedCenterForm(draftDirty?JSON.stringify([selected,name,schedule]):null,busy,{saveable:canOffer&&!accountRequired&&!own})
  const life=useRef(0),pending=useRef(false),intent=useRef(null)
  const requestNavigation=useCenterNavigation()
  const clearDraft=()=>{life.current++;setSelected([]);setName('');setSchedule(false);setError(null);intent.current=null}
  useEffect(()=>{clearDraft()},[centerId,member?.id,member?.version,ownerUid,own,active,canAssign])
  const current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const failure=e=>{setError(e);useCenters.getState().revokeOn(e)}
  const options=own?{}:{memberId:member.id}
  useEffect(()=>{
    const epoch=++life.current;pending.current=true;setBusy(true);setRows([]);setCursor(null);setDetail(null);setError(null);setSchedule(false)
    centerTraining(centerId,options,own).then(async data=>{if(!current(epoch))return;setRows(data.proposals);setCursor(data.nextCursor);if(own&&initialProposalId){const result=await centerTrainingProposal(centerId,initialProposalId,true,initialVersionId);if(current(epoch))setDetail(result.proposal)}}).catch(e=>{if(current(epoch))failure(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,member?.id,member?.version,ownerUid,own,active,canAssign,revision,initialProposalId,initialVersionId])
  const more=async()=>{
    if(pending.current||!cursor)return;const epoch=life.current;pending.current=true;setBusy(true)
    try{const data=await centerTraining(centerId,{...options,cursor},own);if(current(epoch)){setRows(old=>[...old,...data.proposals]);setCursor(data.nextCursor)}}catch(e){if(current(epoch))failure(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const moreRef=useAutoMore(more)
  const open=async row=>{
    if(pending.current)return;const epoch=life.current;pending.current=true;setBusy(true);setError(null)
    try{const data=await centerTrainingProposal(centerId,row.id,own,row.versionId);if(current(epoch)){setDetail(data.proposal);setSchedule(false)}}catch(e){if(current(epoch))failure(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const command=async(path,body)=>{
    const signature=JSON.stringify([path,body]);if(intent.current?.signature!==signature)intent.current={signature,id:crypto.randomUUID()}
    const used=intent.current,result=await centerCommand(path,{...body,requestId:used.id});if(intent.current===used)intent.current=null;return result
  }
  const retireRoutine=row=>confirmSheet({title:t('Retire assignment?'),message:(member?.name||'')+' · '+row.name+' · '+t('Saved workouts and the current session are kept. Removal applies when the member synchronizes.'),confirmText:t('Retire assignment'),danger:true,onConfirm:async()=>{
   const epoch=life.current;if(!current(epoch)||pending.current||!platform)return;pending.current=true;setBusy(true)
   try{await command('/api/centers/training/retire',{centerId,versionId:detail.versionId,routineId:detail.routineIds[row.id]});if(current(epoch)){setDetail(null);setRevision(n=>n+1)}}catch(e){if(current(epoch))failure(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }})
  const archived=row=>new Set((row.retirements||[]).map(r=>r.routineId)).size>=row.routineCount
  const visibleRows=rows.filter(row=>assignmentFilter==='all'||(assignmentFilter==='archived'?archived(row):!archived(row)))
  const offer=(revise=false)=>{
    const epoch=life.current;if(!canAssign||!active||accountRequired||pending.current||!selected.length)return
    let bundle
    try{
      const source=useStore.getState().S,chosen=new Set(selected),week=Object.fromEntries(Object.entries(source.week||{}).map(([day,ids])=>[day,[].concat(ids).filter(id=>chosen.has(id))]).filter(([,ids])=>ids.length))
      bundle=buildTrainingProposal({...source,routines:source.routines.filter(row=>chosen.has(row.id)),week},name)
    }catch(e){failure(e);return}
    const previous=detail,body=revise?{centerId,id:previous.id,version:previous.version,bundle}:{centerId,memberId:member.id,memberVersion:member.version,bundle}
    confirmSheet({title:t(revise?'New proposal version':'Propose routines'),message:member.name+' · '+bundle.routines.map(row=>row.name).join(', '),confirmText:t('Propose routines'),onConfirm:async()=>{
      if(!current(epoch)||pending.current||!canAssign||!active)return;pending.current=true;setBusy(true);setError(null)
      try{await command('/api/centers/training/'+(revise?'revise':'propose'),body);if(current(epoch)){setSelected([]);setName('');setRevision(n=>n+1)}}catch(e){if(current(epoch))failure(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
    }})
  }
  const deliver=()=>{
    const epoch=life.current,proposal=detail,replaceWeek=schedule;if(!own||!proposal||pending.current||(!proposal.acceptedAt&&(!active||proposal.state!=='offered'||proposal.proposalState!=='offered')))return
    confirmSheet({title:t(proposal.acceptedAt?'Retry delivery':'Accept routines'),message:proposal.name+' · '+t(replaceWeek?'Replaces your current Mon–Sun assignments.':'These are added as new routines. Nothing you already have is touched.'),confirmText:t('Add to my plan'),onConfirm:async()=>{
      if(!current(epoch)||pending.current)return;pending.current=true;setBusy(true);setError(null)
      try{
        const body={centerId,id:proposal.id,versionId:proposal.versionId},result=await command('/api/centers/own/training/accept',body)
        if(!current(epoch))return;setDetail(result.proposal)
        useStore.getState().update(state=>applyPlanDelivery(state,result.proposal,{schedule:replaceWeek}))
        await useStore.getState().syncNow();if(!current(epoch))return
        // The API verifies durable personal state, even if syncNow reported an error.
        await command('/api/centers/own/training/ack',body);if(current(epoch))setRevision(n=>n+1)
      }catch(e){if(current(epoch))failure(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
    }})
  }
  const withdraw=()=>{
    const epoch=life.current,proposal=detail;if(!canAssign||!active||!proposal||proposal.acceptedAt||pending.current)return
    confirmSheet({title:t('Withdraw proposal'),message:proposal.name,confirmText:t('Withdraw proposal'),danger:true,onConfirm:async()=>{
      if(!current(epoch)||pending.current)return;pending.current=true;setBusy(true);setError(null)
      try{await command('/api/centers/training/withdraw',{centerId,id:proposal.id,version:proposal.version});if(current(epoch))setRevision(n=>n+1)}catch(e){if(current(epoch))failure(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
    }})
  }
  const sourceRoutines=S?.routines||[]
  return <Section className={own?'own-training-proposals':''} title={t('Training proposals')}><div className="centers-form">
    {detail?<>
      <Row title={detail.name||t('Plan')} subtitle={t('Proposal version')+' '+detail.revision} value={detail.unit}/>
      {detail.bundle.routines.map(row=><details className="training-proposal-routine" key={row.id}><summary><strong>{row.name}</strong><span className="small muted">{row.ex.length} {t('Exercises')}</span></summary>{(detail.retirements||[]).filter(r=>r.routineId===detail.routineIds?.[row.id]).map(r=><p key={r.reason} className="small muted">{t(r.reason==='platform'?'Withdrawn by superadmin':'Removed by member')}{r.at?' · '+new Date(r.at).toLocaleDateString():''}{r.pending?' · '+t('Pending synchronization'):''}</p>)}{platform&&detail.acceptedAt&&!(detail.retirements||[]).some(r=>r.routineId===detail.routineIds?.[row.id]&&r.reason==='platform')&&<Button className="training-retire-action" size="sm" variant="tinted" disabled={busy} onClick={()=>retireRoutine(row)}>{t('Retire assignment')}</Button>}{row.prog&&<p className="small muted">{t('Progression')}: {t(POLICY_NAME[row.prog]||'Off')}</p>}{row.ex.map((ex,index)=><div key={index}>
        <Row title={exerciseNameFor(EXIDX[ex.id])} subtitle={exLine(ex,detail.bundle.unit,S?.speedUnit)}/>
        {ex.note&&<p className="small">{ex.note}</p>}
        {ex.restSec>0&&<Row title={t('Rest (s)')} value={ex.restSec}/>}{ex.warmupSets>0&&<Row title={t('Warm-up sets')} value={ex.warmupSets}/>}
        {ex.prog&&<Row title={t('Progression')} value={t(POLICY_NAME[ex.prog]||'Off')}/>}
        {ex.pyramidWeight?.some(w=>w>0)&&<p className="small muted">{ex.pyramidWeight.map(w=>w||'–').join(' · ')} {detail.bundle.unit}</p>}
        {ex.intensifier?.type==='dropset'&&<p className="small muted">{t('Every set becomes a drop-set: after the main set, {0} drop(s) with no rest, each about {1}% lighter.',ex.intensifier.count,ex.intensifier.pct)}</p>}
        {ex.intensifier?.type==='restpause'&&<p className="small muted">{t('Every set becomes rest-pause: {0} reps to start, then {1} more split into short bursts, {2}s rest before each, roughly halving each time.',ex.reps||0,ex.intensifier.totalReps,ex.intensifier.restSec)}</p>}
      </div>)}</details>)}
      {detail.acceptedAt&&<p className="tag acc training-state-label" role="status">{t('Proposal accepted')}</p>}{detail.deliveryResult&&<p className="tag training-state-label" role="status">{t('Delivery confirmed')}</p>}
      {!detail.acceptedAt&&(detail.state!=='offered'||detail.proposalState!=='offered')&&<p role="status">{t('This training proposal is not available. Reload it.')}</p>}
      {own&&!detail.deliveryResult&&!archived(detail)&&<>
        {!detail.acceptedAt&&detail.bundle.week&&Object.keys(detail.bundle.week).length>0&&<Row title={t('Use this weekly schedule')} subtitle={t('Replaces your current Mon–Sun assignments.')} value={<Switch checked={schedule} aria-label={t('Use this weekly schedule')} onChange={setSchedule}/>}/>}
        {(detail.acceptedAt||active&&detail.state==='offered'&&detail.proposalState==='offered')&&<Button variant="primary" disabled={busy} onClick={deliver}>{t(detail.acceptedAt?'Retry delivery':'Accept routines')}</Button>}
      </>}
      {canOffer&&detail.proposalState==='offered'&&!detail.acceptedAt&&<Button disabled={busy} onClick={withdraw}>{t('Withdraw proposal')}</Button>}
      <Button disabled={busy} onClick={()=>{life.current++;setDetail(null);setSchedule(false);if(own&&initialProposalId)onCloseProposal?.()}}>{t('Back')}</Button>
    </>:<>
      <SelectRow title={t('Assignments')} value={assignmentFilter} options={[{value:'active',label:t('Active assignments')},{value:'archived',label:t('Archived assignments')},{value:'all',label:t('All')}]} onChange={setAssignmentFilter}/>
      {visibleRows.map(row=><Row className="centers-entity-row" key={row.versionId} title={row.name} subtitle={t('Proposal version')+' '+row.revision+(row.acceptedAt?' · '+t('Proposal accepted'):'')+(archived(row)?' · '+t('Archived'):(row.retirements||[]).length?' · '+t('Partially archived'):'')} value={t(archived(row)?'Archived':row.deliveryResult?'Delivery confirmed':row.acceptedAt?'Retry delivery':row.state==='offered'&&row.proposalState==='offered'?'Pending acceptance':'This training proposal is not available. Reload it.')} accessory="chevron" onClick={()=>open(row)}/>)}
      {!visibleRows.length&&!busy&&!error&&<p className="muted">{t('No training proposals')}</p>}
      {cursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}
    </>}
    {canOffer&&accountRequired&&<div className="centers-import-notice" role="status"><p>{t('Link this member to an account before proposing routines.')}</p>{onLinkAccount&&<Button type="button" variant="tinted" onClick={onLinkAccount}>{t('Member details')}</Button>}</div>}
    {canOffer&&!accountRequired&&(!detail||detail.proposalState==='offered')&&<details className="training-proposal-compose" open={draftDirty}><summary>{t(detail?'New proposal version':'Propose routines')}</summary><form ref={saveForm} aria-label={t('Training proposals')} onSubmit={e=>{e.preventDefault();offer(!!detail)}}>
      <p className="small muted">{t('Choose your routines to offer to this member. Their training stays unchanged until acceptance.')}</p>
      <label className="centers-field"><span>{t('Plan name')}</span><TextField value={name} onChange={e=>setName(e.target.value)} maxLength={120}/></label>
      <MultiSelectRow title={t('Routines')} values={selected} options={sourceRoutines.map(row=>({value:row.id,label:row.name}))} onToggle={id=>setSelected(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id])}/>
      <Button type="submit" disabled={busy||!selected.length||selected.length>20}>{t(detail?'New proposal version':'Propose routines')}</Button>
    </form></details>}
    {draftDirty&&<Button type="button" disabled={busy} onClick={()=>requestNavigation(clearDraft)}>{t('Cancel')}</Button>}
    {own?<Button variant="primary" icon="play" disabled={busy} onClick={()=>requestNavigation(()=>nav('/workout'))}>{t('Start training')}</Button>:<Button size="sm" variant="ghost" disabled={busy} onClick={()=>setRevision(n=>n+1)}>{t('Refresh proposals')}</Button>}
    {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(trainingErrorKey(error))}</p>}
  </div></Section>
}

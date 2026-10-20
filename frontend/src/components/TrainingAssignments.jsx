import {useCenterNavigation,useUnsavedCenterForm} from '../views/centers/NavigationGuard.jsx'
import Icon from './Icon.jsx'
import Invitations from '../views/centers/Invitations.jsx'
import Activations from '../views/centers/Activations.jsx'
import ActionReason from './ActionReason.jsx'
import CenterChoices from './CenterChoices.jsx'
import {useUI} from '../store/useUI.js'
import {useEffect,useRef,useState} from 'react'
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {Section,Button,Row,SelectRow,MultiSelectRow,SearchField} from './ui.jsx'
import {platformCenters,centerMembers,centerMember,centerCommand,trainingErrorKey} from '../lib/centers-api.js'
import {buildPlanBundle} from '../lib/plan-share.js'
import TrainingProposals from '../views/centers/TrainingProposals.jsx'
import {t} from '../lib/i18n.js'
export default function TrainingAssignments({routineIds,planName,mode='all',onManageAccounts,planPicker}){
 const uid=useStore(s=>s.user?.id),state=useCenters(),platform=state.ownerUid===uid&&state.platformCapabilities.includes('centers.manage')
 const [centers,setCenters]=useState([]),[center,setCenter]=useState(''),[members,setMembers]=useState([]),[selected,setSelected]=useState([]),[query,setQuery]=useState(''),[cursor,setCursor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[message,setMessage]=useState(''),[member,setMember]=useState(null),[linking,setLinking]=useState(false)
 const [expandedMembers,setExpandedMembers]=useState(false)
 const memberNames=useRef(new Map())
 const [loadingCenters,setLoadingCenters]=useState(true),[retry,setRetry]=useState(0)
 const [chosenRoutines,setChosenRoutines]=useState(routineIds)
 useEffect(()=>{setSelected([]);setMessage('')},[mode])
 const signature=JSON.stringify(routineIds)
 useEffect(()=>setChosenRoutines(routineIds),[signature])
 const routines=useStore(s=>s.S.routines)
 const linkRef=useRef(null),searchRef=useRef(null),modeRef=useRef(mode);modeRef.current=mode
 useEffect(()=>{if(linking){linkRef.current?.focus({preventScroll:true});linkRef.current?.scrollIntoView?.({block:'start'})}},[linking,member?.id,mode])
 const navigate=useCenterNavigation()
 const life=useRef(0),sending=useRef(false),requests=useRef(new Map())
 useEffect(()=>{let current=true;setLoadingCenters(true);setCenters([]);setCenter('');setError(null);(platform?platformCenters():Promise.resolve({centers:state.centers.filter(c=>c.capabilities?.includes('training.assign'))})).then(r=>{if(current){setCenters(r.centers);setCenter(r.centers[0]?.id||'')}}).catch(e=>{if(current)setError(e)}).finally(()=>{if(current)setLoadingCenters(false)});return()=>{current=false}},[uid,platform,retry])
 useEffect(()=>{const epoch=++life.current;setMembers([]);setExpandedMembers(false);setMessage('');setCursor(null);setError(null);if(!center||mode==='accounts'){setBusy(false);return}setBusy(true);const timer=setTimeout(()=>{centerMembers(center,{query}).then(r=>{if(epoch===life.current){setMembers(r.members);setCursor(r.nextCursor)}}).catch(e=>{if(epoch===life.current)setError(e)}).finally(()=>{if(epoch===life.current)setBusy(false)})},query?250:0);return()=>{clearTimeout(timer);life.current++}},[center,query,uid,mode])
 useEffect(()=>{setMember(null);setLinking(false);setSelected([]);memberNames.current.clear()},[center,uid])
 useEffect(()=>{for(const m of members)memberNames.current.set(m.id,m.name)},[members])
 const more=async()=>{if(busy||!cursor)return;const epoch=life.current;setBusy(true);try{const r=await centerMembers(center,{query,cursor});if(epoch===life.current){setMembers(rows=>[...rows,...r.members]);setCursor(r.nextCursor)}}catch(e){if(epoch===life.current)setError(e)}finally{if(epoch===life.current)setBusy(false)}}
 const assign=async()=>{if(busy||sending.current||!selected.length||!chosenRoutines.length)return;sending.current=true;const epoch=life.current;setBusy(true);setError(null);setMessage('');try{
  const source=useStore.getState().S,ids=new Set(chosenRoutines),routines=source.routines.filter(r=>ids.has(r.id)),week={}
  for(const [day,rows] of Object.entries(source.week||{})){const kept=[].concat(rows).filter(id=>ids.has(id));if(kept.length)week[day]=kept}
  const bundle=buildPlanBundle({...source,routines,week},planName)
  for(const id of selected){if(epoch!==life.current||useStore.getState().user?.id!==uid)return
   const detail=await centerMember(center,id);if(epoch!==life.current||useStore.getState().user?.id!==uid)return;const key=JSON.stringify([center,id,bundle]);if(!requests.current.has(key))requests.current.set(key,crypto.randomUUID())
   await centerCommand('/api/centers/training/propose',{centerId:center,memberId:id,memberVersion:detail.member.version,bundle,requestId:requests.current.get(key)})
   if(epoch===life.current){setSelected(old=>old.filter(x=>x!==id));setMessage(t('Training proposals saved. Each recipient must accept the proposal.'))}
  }
 }catch(e){if(epoch===life.current)setError(e)}finally{sending.current=false;if(epoch===life.current)setBusy(false)}}
 const inspect=async(id,link=false)=>{if(!id){setLinking(false);return setMember(null)}const epoch=life.current,requestedMode=modeRef.current;setBusy(true);try{const r=await centerMember(center,id);if(epoch===life.current&&modeRef.current===requestedMode){setMember(r.member);setLinking(link);return true}}catch(e){if(epoch===life.current)setError(e)}finally{if(epoch===life.current)setBusy(false)}}
 const openCenters=()=>useUI.getState().openSheet(close=><>
  <h3>{t('Centers')}</h3>
  <CenterChoices ownerUid={uid} selectedId={center} available={platform?undefined:state.centers.filter(c=>c.capabilities?.includes('training.assign'))} choose={row=>{
   if(useStore.getState().user?.id!==uid)return
   close();navigate(()=>{setCenters(rows=>rows.some(c=>c.id===row.id)?rows:[...rows,row]);setCenter(row.id)})
  }}/>
 </>)
 const reloadMembers=async()=>{
  if(busy||!center)return;const epoch=life.current;setBusy(true);setError(null)
  try{
   const [list,detail]=await Promise.all([centerMembers(center,{query}),member?centerMember(center,member.id):Promise.resolve(null)])
   if(epoch!==life.current||useStore.getState().user?.id!==uid)return
   setMembers(list.members);setCursor(list.nextCursor);if(detail){setMember(detail.member);if(detail.member.accountLinked)setLinking(false)}
  }catch(e){if(epoch===life.current)setError(e)}finally{if(epoch===life.current)setBusy(false)}
 }
 const canLink=state.ownerUid===uid&&(platform||state.centers.some(c=>c.id===center&&c.capabilities?.includes('members.manage')))
 const isEligible=m=>m.state==='active'&&m.accountLinked!==false
 const toggleMember=id=>{if(!busy)setSelected(rows=>rows.includes(id)?rows.filter(x=>x!==id):[...rows,id])}
 const number=m=>m.number||m.memberNumber||''
 const blockedReason=m=>[m.state!=='active'?t('Training proposals require an active member.'):null,m.accountLinked===false?t('Link this member to an account before proposing routines.'):null].filter(Boolean).join(' ')
 const proposalPicker=mode==='proposals'
 const showAssign=mode==='all'||mode==='assign',showProposals=mode==='all'||mode==='proposals',showAccounts=mode==='all'||mode==='accounts'
 const formRef=useUnsavedCenterForm(showAssign&&selected.length?JSON.stringify([selected,chosenRoutines,center]):null,sending.current)
 const reason=busy?t(sending.current?'Saving…':'Loading…'):!chosenRoutines.length?t('Choose your routines to offer to this member. Their training stays unchanged until acceptance.'):!selected.length?t('Select at least one member to continue.'):null
 if(mode==='accounts')return <>
  <Section><div className="centers-form"><Row className={'select-field'+(center?' has-selection':'')} title={t('Centers')} value={centers.find(c=>c.id===center)?.name||center} accessory="dropdown" disabled={loadingCenters} onClick={openCenters}/>{loadingCenters&&<p role="status">{t('Loading centers')}</p>}{!loadingCenters&&!center&&!error&&<p>{t('No centers available')}</p>}{error&&<><p role="alert">{t(trainingErrorKey(error))}</p><Button onClick={()=>setRetry(n=>n+1)}>{t('Retry')}</Button></>}</div></Section>
  {center&&<Activations key={uid+':'+center} centerId={center} ownerUid={uid}/>}
 </>
 return <Section className="training-assignments" title={t(mode==='accounts'?'Link account':mode==='proposals'?'Sent proposals':'Send plan')}><div ref={formRef} className="centers-form">
  {showAssign&&<p className="small muted">{t('Choose your routines to offer to this member. Their training stays unchanged until acceptance.')}</p>}
  <Row className={'select-field'+(center?' has-selection':'')} title={t('Centers')} value={centers.find(c=>c.id===center)?.name||center} accessory="dropdown" disabled={busy||loadingCenters} onClick={openCenters}/>
  {showAssign&&<>{planPicker||planName&&<Row title={t('Plan')} value={planName}/>}
  <div className="training-routine-choice"><MultiSelectRow title={t('Routines')} values={chosenRoutines} options={routines.filter(r=>routineIds.includes(r.id)).map(r=>({value:r.id,label:r.name}))} onToggle={id=>{if(!busy)setChosenRoutines(rows=>rows.includes(id)?rows.filter(x=>x!==id):[...rows,id])}}/></div></>}
  <SearchField ref={searchRef} aria-label={t('Search members')} placeholder={t('Search members')} value={query} readOnly={sending.current} aria-busy={busy} onChange={e=>{if(!sending.current)setQuery(e.target.value)}} onClear={()=>{if(!sending.current){setQuery('');searchRef.current?.focus()}}}/>
  {(showAssign||proposalPicker)&&<div className="training-recipient-picker">
   <div className="training-recipient-heading"><h3>{t('Members')}</h3><span className="small muted" role="status">{t('Selected')} · {proposalPicker?(member?1:0):selected.length}</span></div>
   <p className="small muted">{t(proposalPicker?'Choose a member to view their sent proposals.':'Select one or more members. Search keeps your selection.')}</p>
   {proposalPicker&&member&&<div className="training-recipient-selection" aria-label={t('Selected')}><Button size="sm" disabled={busy} aria-label={t('Remove')+' · '+member.name} onClick={()=>navigate(()=>inspect(''))}>{member.name} ×</Button></div>}
   {showAssign&&selected.length>0&&<div className="training-recipient-selection" aria-label={t('Selected')}>{selected.map(id=><Button key={id} size="sm" disabled={busy} aria-label={t('Remove')+' · '+(memberNames.current.get(id)||id)} onClick={()=>toggleMember(id)}>{memberNames.current.get(id)||id} ×</Button>)}</div>}
   <div className="training-recipient-list" aria-busy={busy}>
    {(expandedMembers?members:members.slice(0,5)).map(m=>{const available=proposalPicker||isEligible(m),chosen=proposalPicker?member?.id===m.id:selected.includes(m.id);return <div key={m.id} data-member-id={m.id} className={'training-recipient'+(chosen?' is-selected':'')+(!available?' is-blocked':'')}>
     <Row title={m.name} subtitle={number(m)} disabled={busy} aria-pressed={available?chosen:undefined} onClick={available?()=>proposalPicker?navigate(()=>inspect(m.id)):toggleMember(m.id):undefined}>
      {available&&<span className={'training-recipient-mark'+(chosen?' on':'')} aria-hidden="true">{chosen&&<Icon name="check"/>}</span>}
     </Row>
     {!available&&<div className="training-recipient-reason"><p className="small muted">{blockedReason(m)}</p>{m.accountLinked===false&&canLink&&<Button size="sm" aria-label={t('Link account')+' · '+m.name} disabled={busy} onClick={async()=>{const ready=await inspect(m.id,true);if(ready&&useStore.getState().user?.id===uid)onManageAccounts?.()}}>{t('Link account')} · {m.name}</Button>}</div>}
    </div>})}
   </div>
   {(members.length>5||cursor||expandedMembers)&&<div className="training-recipient-more">{!expandedMembers?<Button disabled={busy} aria-expanded={false} onClick={()=>{setExpandedMembers(true);if(members.length<=5&&cursor)more()}}>{t('View all members')}</Button>:<><Button disabled={busy} aria-expanded={true} onClick={()=>setExpandedMembers(false)}>{t('Show less')}</Button>{cursor&&<Button disabled={busy} onClick={more}>{t('Show more')}</Button>}</>}</div>}
  </div>}
  {!showAssign&&!proposalPicker&&cursor&&<Button disabled={busy} onClick={more}>{t('Show more')}</Button>}
  {!members.length&&!busy&&<p>{t('No members available')}</p>}
  {mode==='accounts'?<div className="training-member-results"><p className="small muted">{t('Choose a center member, with or without a linked account.')}</p><div className="centers-accounts-list">{members.map(m=><Row key={m.id} title={m.name} subtitle={number(m)+' · '+t(m.accountLinked?'Account linked':'No linked account')} value={member?.id===m.id?t('Selected'):null} accessory={member?.id===m.id?'check':'chevron'} disabled={busy} onClick={()=>navigate(()=>inspect(m.id,true))}/>)}</div><div className="training-member-toolbar"><Button variant="plain" disabled={busy||!center} onClick={reloadMembers}>{t('Refresh members')}</Button></div></div>:<Button className="training-refresh-members" disabled={busy||!center} onClick={reloadMembers}>{t('Refresh members')}</Button>}
  {!loadingCenters&&!centers.length&&!error&&<p role="status">{t('No centers available')}</p>}
  {(busy||loadingCenters)&&<p role="status">{t('Loading…')}</p>}
  {showAssign&&<div className="centers-form-actions training-assignment-actions" data-center-form-actions><ActionReason reason={reason}><Button variant="primary" disabled={!!reason} onClick={assign}>{t(sending.current?'Saving…':'Send plan')}{selected.length>0?' · '+selected.length:''}</Button></ActionReason></div>}
  {message&&<p role="status">{message}</p>}{error&&<><p role="alert">{t(trainingErrorKey(error))}</p><Button disabled={busy} onClick={()=>setRetry(n=>n+1)}>{t('Retry')}</Button></>}
  {(showProposals||showAccounts)&&mode!=='accounts'&&!proposalPicker&&<SelectRow variant="field" title={t(showAccounts&&!showProposals?'Members':'Training proposals')} value={member?.id||''} disabled={busy} options={[{value:'',label:t('Members')},...members.map(m=>({value:m.id,label:m.name}))]} onChange={id=>inspect(id,mode==='accounts')}/>}
  {showProposals&&member&&<TrainingProposals key={center+':'+member.id} centerId={center} member={member} ownerUid={uid} canAssign active/>}
  {showProposals&&mode!=='all'&&member?.accountLinked===false&&canLink&&<Button onClick={()=>{setLinking(true);onManageAccounts?.()}}>{t('Link account')}</Button>}
  {mode==='accounts'&&member?.accountLinked&&<Row title={member.name} value={t('Account linked')}/>}
  {showAccounts&&member?.accountLinked===false&&canLink&&<>
   {!linking&&<Button disabled={busy} onClick={()=>setLinking(true)}>{t('Link account')} · {member.name}</Button>}
   {linking&&<div className="training-link-editor" ref={linkRef} tabIndex={-1}><h3>{member.name}</h3><Invitations key={center+':'+member.id} inline={mode==='accounts'} onCancel={()=>{setLinking(false);setMember(null)}} canSearchAccounts={platform} centerId={center} ownerUid={uid} memberId={member.id} linked={false}/></div>}
  </>}
 </div></Section>
}

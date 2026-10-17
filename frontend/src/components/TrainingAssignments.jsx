import Invitations from '../views/centers/Invitations.jsx'
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
export default function TrainingAssignments({routineIds,planName}){
 const uid=useStore(s=>s.user?.id),state=useCenters(),platform=state.ownerUid===uid&&state.platformCapabilities.includes('centers.manage')
 const [centers,setCenters]=useState([]),[center,setCenter]=useState(''),[members,setMembers]=useState([]),[selected,setSelected]=useState([]),[query,setQuery]=useState(''),[cursor,setCursor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[message,setMessage]=useState(''),[member,setMember]=useState(null),[linking,setLinking]=useState(false)
 const [loadingCenters,setLoadingCenters]=useState(true),[retry,setRetry]=useState(0)
 const [chosenRoutines,setChosenRoutines]=useState(routineIds)
 const signature=JSON.stringify(routineIds)
 useEffect(()=>setChosenRoutines(routineIds),[signature])
 const routines=useStore(s=>s.S.routines)
 const linkRef=useRef(null),searchRef=useRef(null)
 useEffect(()=>{if(linking){linkRef.current?.focus({preventScroll:true});linkRef.current?.scrollIntoView?.({block:'start'})}},[linking,member?.id])
 const life=useRef(0),sending=useRef(false),requests=useRef(new Map())
 useEffect(()=>{let current=true;setLoadingCenters(true);setCenters([]);setCenter('');setError(null);(platform?platformCenters():Promise.resolve({centers:state.centers.filter(c=>c.capabilities?.includes('training.assign'))})).then(r=>{if(current){setCenters(r.centers);setCenter(r.centers[0]?.id||'')}}).catch(e=>{if(current)setError(e)}).finally(()=>{if(current)setLoadingCenters(false)});return()=>{current=false}},[uid,platform,retry])
 useEffect(()=>{const epoch=++life.current;setMembers([]);setSelected([]);setMember(null);setLinking(false);setMessage('');setCursor(null);setError(null);if(!center){setBusy(false);return}setBusy(true);const timer=setTimeout(()=>{centerMembers(center,{query}).then(r=>{if(epoch===life.current){setMembers(r.members);setCursor(r.nextCursor)}}).catch(e=>{if(epoch===life.current)setError(e)}).finally(()=>{if(epoch===life.current)setBusy(false)})},query?250:0);return()=>{clearTimeout(timer);life.current++}},[center,query,uid])
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
 const inspect=async(id,link=false)=>{if(!id){setLinking(false);return setMember(null)}const epoch=life.current;setBusy(true);try{const r=await centerMember(center,id);if(epoch===life.current){setMember(r.member);setLinking(link)}}catch(e){if(epoch===life.current)setError(e)}finally{if(epoch===life.current)setBusy(false)}}
 const openCenters=()=>useUI.getState().openSheet(close=><>
  <h3>{t('Centers')}</h3>
  <CenterChoices ownerUid={uid} selectedId={center} available={platform?undefined:state.centers.filter(c=>c.capabilities?.includes('training.assign'))} choose={row=>{
   if(useStore.getState().user?.id!==uid)return
   close();setCenters(rows=>rows.some(c=>c.id===row.id)?rows:[...rows,row]);setCenter(row.id)
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
 const eligible=members.filter(m=>m.state==='active'&&m.accountLinked!==false)
 const blocked=members.filter(m=>m.state!=='active'||m.accountLinked===false)
 const number=m=>m.number||m.memberNumber||''
 const blockedReason=m=>[m.state!=='active'?t('Training proposals require an active member.'):null,m.accountLinked===false?t('Link this member to an account before proposing routines.'):null].filter(Boolean).join(' ')
 const reason=busy?t('Saving…'):!chosenRoutines.length?t('Choose your routines to offer to this member. Their training stays unchanged until acceptance.'):!selected.length?t('Select at least one member to continue.'):null
 return <Section className="training-assignments" title={t(planName?'Assign plan':'Assign routines')}><div className="centers-form">
  <p className="small muted">{t('Choose your routines to offer to this member. Their training stays unchanged until acceptance.')}</p>
  <Row className={'select-field'+(center?' has-selection':'')} title={t('Centers')} value={centers.find(c=>c.id===center)?.name||center} accessory="dropdown" disabled={busy||loadingCenters} onClick={openCenters}/>
  {planName&&<Row title={t('Plan')} value={planName}/>}
  <MultiSelectRow title={t('Routines')} values={chosenRoutines} options={routines.filter(r=>routineIds.includes(r.id)).map(r=>({value:r.id,label:r.name}))} onToggle={id=>{if(!busy)setChosenRoutines(rows=>rows.includes(id)?rows.filter(x=>x!==id):[...rows,id])}}/>
  <SearchField ref={searchRef} aria-label={t('Search members')} placeholder={t('Search members')} value={query} readOnly={sending.current} aria-busy={busy} onChange={e=>{if(!sending.current)setQuery(e.target.value)}} onClear={()=>{if(!sending.current){setQuery('');searchRef.current?.focus()}}}/>
  <MultiSelectRow title={t('Members')} values={selected} options={eligible.map(m=>({value:m.id,label:m.name+' · '+number(m)}))} onToggle={id=>{if(!busy)setSelected(rows=>rows.includes(id)?rows.filter(x=>x!==id):[...rows,id])}}/>
  {cursor&&<Button disabled={busy} onClick={more}>{t('Show more')}</Button>}
  {!members.length&&!busy&&<p>{t('No members available')}</p>}
  {blocked.length>0&&<details className="training-assignment-blocked" open={!eligible.length}>
   <summary>{t('Members not ready for assignment')} · {blocked.length}</summary>
   {blocked.map(m=><div key={m.id}><Row title={m.name} subtitle={number(m)} value={t(m.accountLinked===false?'No linked account':m.state==='frozen'?'Frozen member':m.state==='ended'?'Ended member':m.state==='active'?'Active member':'Pending activation')}/><p className="small muted">{blockedReason(m)}</p>{m.accountLinked===false&&canLink&&<Button disabled={busy} onClick={()=>inspect(m.id,true)}>{t('Link account')} · {m.name}</Button>}</div>)}
  </details>}
  <Button disabled={busy||!center} onClick={reloadMembers}>{t('Refresh members')}</Button>
  {!loadingCenters&&!centers.length&&!error&&<p role="status">{t('No centers available')}</p>}
  {(busy||loadingCenters)&&<p role="status">{t('Loading…')}</p>}
  <ActionReason reason={reason}><Button variant="primary" disabled={!!reason} onClick={assign}>{t(busy?'Saving…':planName?'Assign plan':'Propose routines')}</Button></ActionReason>
  {message&&<p role="status">{message}</p>}{error&&<><p role="alert">{t(trainingErrorKey(error))}</p><Button disabled={busy} onClick={()=>setRetry(n=>n+1)}>{t('Retry')}</Button></>}
  <SelectRow variant="field" title={t('Training proposals')} value={member?.id||''} disabled={busy} options={[{value:'',label:t('Members')},...members.map(m=>({value:m.id,label:m.name}))]} onChange={inspect}/>
  {member&&<TrainingProposals key={center+':'+member.id} centerId={center} member={member} ownerUid={uid} canAssign active/>}
  {member?.accountLinked===false&&canLink&&<>
   {!linking&&<Button disabled={busy} onClick={()=>setLinking(true)}>{t('Link account')} · {member.name}</Button>}
   {linking&&<div ref={linkRef} tabIndex={-1}><Row title={t('Link account')} value={member.name}/><Invitations key={center+':'+member.id} canSearchAccounts={platform} centerId={center} ownerUid={uid} memberId={member.id} linked={false}/><Button disabled={busy} onClick={reloadMembers}>{t('Refresh members')}</Button><Button onClick={()=>setLinking(false)}>{t('Cancel')}</Button></div>}
  </>}
 </div></Section>
}

import {useEffect,useRef,useState} from 'react'
import {useStore} from '../store/useStore.js'
import {useCenters} from '../store/useCenters.js'
import {Section,Button,SelectRow,MultiSelectRow,SearchField} from './ui.jsx'
import {platformCenters,centerMembers,centerMember,centerCommand,trainingErrorKey} from '../lib/centers-api.js'
import {buildPlanBundle} from '../lib/plan-share.js'
import TrainingProposals from '../views/centers/TrainingProposals.jsx'
import {t} from '../lib/i18n.js'
export default function TrainingAssignments({routineIds,planName}){
 const uid=useStore(s=>s.user?.id),state=useCenters(),platform=state.ownerUid===uid&&state.platformCapabilities.includes('centers.manage')
 const [centers,setCenters]=useState([]),[center,setCenter]=useState(''),[members,setMembers]=useState([]),[selected,setSelected]=useState([]),[query,setQuery]=useState(''),[cursor,setCursor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[message,setMessage]=useState(''),[member,setMember]=useState(null)
 const [loadingCenters,setLoadingCenters]=useState(true),[retry,setRetry]=useState(0)
 const [chosenRoutines,setChosenRoutines]=useState(routineIds),[centerCursor,setCenterCursor]=useState(null)
 const signature=JSON.stringify(routineIds)
 useEffect(()=>setChosenRoutines(routineIds),[signature])
 const routines=useStore(s=>s.S.routines)
 const life=useRef(0),sending=useRef(false),requests=useRef(new Map())
 useEffect(()=>{let current=true;setLoadingCenters(true);setCenters([]);setCenter('');setError(null);(platform?platformCenters():Promise.resolve({centers:state.centers.filter(c=>c.capabilities?.includes('training.assign'))})).then(r=>{if(current){setCenters(r.centers);setCenterCursor(r.nextCursor||null);setCenter(r.centers[0]?.id||'')}}).catch(e=>{if(current)setError(e)}).finally(()=>{if(current)setLoadingCenters(false)});return()=>{current=false}},[uid,platform,retry])
 useEffect(()=>{const epoch=++life.current;setMembers([]);setSelected([]);setMember(null);setMessage('');setCursor(null);setError(null);if(!center){setBusy(false);return}setBusy(true);const timer=setTimeout(()=>{centerMembers(center,{query}).then(r=>{if(epoch===life.current){setMembers(r.members);setCursor(r.nextCursor)}}).catch(e=>{if(epoch===life.current)setError(e)}).finally(()=>{if(epoch===life.current)setBusy(false)})},query?250:0);return()=>{clearTimeout(timer);life.current++}},[center,query,uid])
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
 const inspect=async id=>{if(!id)return setMember(null);const epoch=life.current;setBusy(true);try{const r=await centerMember(center,id);if(epoch===life.current)setMember(r.member)}catch(e){if(epoch===life.current)setError(e)}finally{if(epoch===life.current)setBusy(false)}}
 const eligible=members.filter(m=>m.state==='active'&&m.accountLinked!==false)
 return <Section title={t('Assign routines')}><div className="centers-form">
  <p className="small muted">{t('Training proposals require an active member.')+' '+t('Link this member to an account before proposing routines.')}</p>
  <SelectRow variant="field" title={t('Centers')} value={center} disabled={busy} options={centers.map(c=>({value:c.id,label:c.name}))} onChange={setCenter}/>
  {centerCursor&&<Button disabled={busy} aria-label={t('Centers')+' · '+t('Show more')} onClick={async()=>{const epoch=life.current;setBusy(true);try{const r=await platformCenters({cursor:centerCursor});if(epoch===life.current){setCenters(rows=>[...rows,...r.centers]);setCenterCursor(r.nextCursor)}}catch(e){if(epoch===life.current)setError(e)}finally{if(epoch===life.current)setBusy(false)}}}>{t('Show more')}</Button>}
  <MultiSelectRow title={t('Routines')} values={chosenRoutines} options={routines.filter(r=>routineIds.includes(r.id)).map(r=>({value:r.id,label:r.name}))} onToggle={id=>{if(!busy)setChosenRoutines(rows=>rows.includes(id)?rows.filter(x=>x!==id):[...rows,id])}}/>
  <SearchField aria-label={t('Search members')} placeholder={t('Search members')} value={query} disabled={busy} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/>
  <MultiSelectRow title={t('Members')} values={selected} options={eligible.map(m=>({value:m.id,label:m.name+' · '+m.memberNumber}))} onToggle={id=>{if(!busy)setSelected(rows=>rows.includes(id)?rows.filter(x=>x!==id):[...rows,id])}}/>
  {cursor&&<Button disabled={busy} onClick={more}>{t('Show more')}</Button>}
  {!eligible.length&&!busy&&<p>{t('No members available')}</p>}
  {!loadingCenters&&!centers.length&&!error&&<p role="status">{t('No centers available')}</p>}
  {(busy||loadingCenters)&&<p role="status">{t('Loading…')}</p>}
  <Button variant="primary" disabled={busy||!selected.length||!chosenRoutines.length} onClick={assign}>{t(busy?'Saving…':'Propose routines')}</Button>
  {message&&<p role="status">{message}</p>}{error&&<><p role="alert">{t(trainingErrorKey(error))}</p><Button disabled={busy} onClick={()=>setRetry(n=>n+1)}>{t('Retry')}</Button></>}
  <SelectRow variant="field" title={t('Training proposals')} value={member?.id||''} disabled={busy} options={[{value:'',label:t('Members')},...members.map(m=>({value:m.id,label:m.name}))]} onChange={inspect}/>
  {member&&<TrainingProposals key={center+':'+member.id} centerId={center} member={member} ownerUid={uid} canAssign active/>}
 </div></Section>
}

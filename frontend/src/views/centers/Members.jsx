import Passes from './Passes.jsx'
import SharedProgress from './SharedProgress.jsx'
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Section, Row, SearchField, TextField } from '../../components/ui.jsx'
import { useAutoMore } from '../../lib/use-auto-more.js'
import { centerMembers, centerMember, centerCommand, membersErrorKey } from '../../lib/centers-api.js'
import { t } from '../../lib/i18n.js'
import { useStore } from '../../store/useStore.js'
import { useCenters } from '../../store/useCenters.js'
import { useUI } from '../../store/useUI.js'
import MembershipActions from './MembershipActions.jsx'
import Invitations from './Invitations.jsx'
import Subscriptions from './Subscriptions.jsx'
import Receipts from './Receipts.jsx'
import Payments from './Payments.jsx'
import TrainingProposals from './TrainingProposals.jsx'
import MemberAccess from './MemberAccess.jsx'
import {useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'
import CsvImport from './CsvImport.jsx'
import FreezeRequests from './FreezeRequests.jsx'
import SourceRegistration from './SourceRegistration.jsx'

const stateText=state=>state==='active'?t('Active member'):state==='frozen'?t('Frozen member'):state==='ended'?t('Ended member'):t('Pending activation')
const fieldsOf=member=>({name:member?.name||'',email:member?.email||'',phone:member?.phone||'',nationalDocument:member?.nationalDocument||''})

function MemberForm({centerId,member,lifecycle,ownerUid,close,saved,canBilling,capabilities,active}) {
  const [fields,setFields]=useState(()=>fieldsOf(member)),[busy,setBusy]=useState(false),[error,setError]=useState(null)
  const [currentMember,setCurrentMember]=useState(member),[info,setInfo]=useState(lifecycle)
  const [requestId]=useState(()=>crypto.randomUUID())
  const [receiptsRevision,setReceiptsRevision]=useState(0)
  const requestNavigation=useCenterNavigation()
  useUnsavedCenterForm(JSON.stringify(fields)!==JSON.stringify(fieldsOf(currentMember))?JSON.stringify(fields):null,busy)
  const input=(key,label,type='text')=><label className="centers-field"><span>{label}</span><TextField type={type} disabled={busy} value={fields[key]} required={key==='name'} onChange={e=>setFields({...fields,[key]:e.target.value})}/></label>
  const submit=async e=>{
    e.preventDefault();if(busy)return;setBusy(true);setError(null)
    try {
      const result=await centerCommand(currentMember?'/api/centers/members/update':'/api/centers/members/create',{centerId,...fields,...(currentMember?{id:currentMember.id,version:currentMember.version}:{requestId})})
      if(useStore.getState().user?.id!==ownerUid)return
      useUI.getState().toast(t('Saved'));saved(result.member)
    }catch(e){setError(e);if(useStore.getState().user?.id===ownerUid)useCenters.getState().revokeOn(e)}
    finally{setBusy(false)}
  }
  return <><Section title={currentMember?t('Member details'):t('New member')}><form className="centers-form" onSubmit={submit}>
    {currentMember&&<p>{t('Member number')}: {currentMember.number} · {stateText(currentMember.state)}</p>}
    <div className="centers-fields">{input('name',t('Member name'))}{input('email',t('Contact email'),'email')}{input('phone',t('Phone'))}{input('nationalDocument',t('National document'))}</div>
    {error&&<p role="alert">{t(membersErrorKey(error))}</p>}
    <div className="centers-actions"><Button type="button" disabled={busy} onClick={()=>requestNavigation(close)}>{t('Back')}</Button><Button type="submit" variant="primary" disabled={busy||!fields.name.trim()}>{t('Save')}</Button></div>
  </form></Section>{currentMember?.sourceRegistration&&<Section title={t('Source registration (CSV)')}><SourceRegistration value={currentMember.sourceRegistration}/></Section>}{currentMember&&info?.today&&<MembershipActions key={currentMember.version} centerId={centerId} member={currentMember} info={info} ownerUid={ownerUid} changed={result=>{setCurrentMember(result.member);setInfo({today:result.today,changes:result.changes})}}/>}
    {currentMember&&info?.today&&<FreezeRequests centerId={centerId} ownerUid={ownerUid} memberId={currentMember.id} memberVersion={currentMember.version} today={info.today} active={active} changed={result=>{setCurrentMember(result.member);setInfo({today:result.today,changes:result.changes})}}/>}
    {currentMember&&<Invitations centerId={centerId} ownerUid={ownerUid} memberId={currentMember.id} linked={currentMember.accountLinked}/>}
    {currentMember&&capabilities.includes('training.shared.read')&&<SharedProgress centerId={centerId} member={currentMember} ownerUid={ownerUid}/>}
    {currentMember&&capabilities.includes('training.assign')&&<TrainingProposals key={'training:'+currentMember.id} centerId={centerId} member={currentMember} ownerUid={ownerUid} canAssign active={active}/>}
    {currentMember&&capabilities.includes('access.manage')&&<MemberAccess key={'access:'+currentMember.id} centerId={centerId} memberId={currentMember.id} ownerUid={ownerUid} canManage/>}
    {currentMember&&canBilling&&<><Passes centerId={centerId} memberId={currentMember.id} ownerUid={ownerUid} today={info?.today} active={active&&currentMember.state==='active'} revision={receiptsRevision} changed={()=>setReceiptsRevision(value=>value+1)}/><Subscriptions key={currentMember.id} centerId={centerId} member={currentMember} ownerUid={ownerUid} changed={result=>{setCurrentMember(result.member);setInfo({today:result.today,changes:result.changes})}} receiptCreated={()=>setReceiptsRevision(value=>value+1)}/><Receipts key={currentMember.id} centerId={centerId} memberId={currentMember.id} ownerUid={ownerUid} revision={receiptsRevision} canRecord={capabilities.includes('payments.record')} today={info?.today} changed={()=>setReceiptsRevision(value=>value+1)}/><Payments centerId={centerId} memberId={currentMember.id} ownerUid={ownerUid} revision={receiptsRevision} canRefund={capabilities.includes('payments.refund')} today={info?.today} changed={()=>setReceiptsRevision(value=>value+1)}/></>}</>
}

export default function Members({centerId,ownerUid,capabilities,active=true,centerState,onDetails,importId,onImport}) {
  const importReason=useId()
  const manage=capabilities.includes('members.manage')
  const permissionKey=capabilities.join('|')
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[rows,setRows]=useState([]),[cursor,setCursor]=useState(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(null),[editing,setEditing]=useState(null),[revision,setRevision]=useState(0)
  const [lifecycle,setLifecycle]=useState(null)
  const [importing,setImporting]=useState(false)
  const epoch=useRef(0),detailEpoch=useRef(0),pending=useRef(false)
  const current=id=>epoch.current===id&&useStore.getState().user?.id===ownerUid
  const failure=e=>{setError(e);if(useStore.getState().user?.id===ownerUid)useCenters.getState().revokeOn(e)}
  useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),250);return()=>clearTimeout(timer)},[query])
  useEffect(()=>{
    const id=++epoch.current;detailEpoch.current++;pending.current=true;setBusy(true);setRows([]);setCursor(null);setError(null);setEditing(null);setLifecycle(null)
    centerMembers(centerId,{query:search}).then(result=>{if(current(id)){setRows(result.members);setCursor(result.nextCursor)}}).catch(e=>{if(current(id))failure(e)}).finally(()=>{if(current(id)){pending.current=false;setBusy(false)}})
    return()=>{epoch.current++;pending.current=false}
  },[centerId,ownerUid,permissionKey,search,revision])
  const more=async()=>{
    if(!cursor||pending.current)return;const id=epoch.current;pending.current=true;setBusy(true)
    try{const result=await centerMembers(centerId,{query:search,cursor});if(current(id)){setRows(previous=>[...previous,...result.members]);setCursor(result.nextCursor)}}
    catch(e){if(current(id))failure(e)}finally{if(current(id)){pending.current=false;setBusy(false)}}
  }
  const moreRef=useAutoMore(more)
  const open=async member=>{
    const id=epoch.current,detail=++detailEpoch.current;setError(null)
    try{const result=await centerMember(centerId,member.id);if(current(id)&&detailEpoch.current===detail){setEditing(result.member);setLifecycle({today:result.today,changes:result.changes})}}catch(e){if(current(id)&&detailEpoch.current===detail)failure(e)}
  }
  if(manage&&(importing||importId))return <CsvImport key={centerId+':'+ownerUid} centerId={centerId} ownerUid={ownerUid} active={active} jobId={importId} onJob={onImport} close={()=>{setImporting(false);onImport?.(null)}} changed={()=>setRevision(r=>r+1)}/>
  if(editing)return manage?<MemberForm key={editing.id||'new'} centerId={centerId} member={editing.id?editing:null} lifecycle={lifecycle} ownerUid={ownerUid} capabilities={capabilities} active={active} canBilling={capabilities.includes('billing.manage')} close={()=>{setEditing(null);setRevision(r=>r+1)}} saved={()=>{setEditing(null);setRevision(r=>r+1)}}/>:
    <><Section title={t('Member details')}><Row title={editing.name} subtitle={stateText(editing.state)} value={editing.number}/><Button onClick={()=>setEditing(null)}>{t('Back')}</Button></Section>{capabilities.includes('training.shared.read')&&<SharedProgress centerId={centerId} member={editing} ownerUid={ownerUid}/>}{capabilities.includes('training.assign')&&<TrainingProposals key={'training:'+editing.id} centerId={centerId} member={editing} ownerUid={ownerUid} canAssign active={active}/>}</>
  return <Section title={t('Members')}><div className="centers-form">
    <div className="centers-actions"><SearchField aria-label={t('Search members')} placeholder={t('Search members')} value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/>{manage&&<Button onClick={()=>{setLifecycle(null);setEditing({})}}>{t('New member')}</Button>}{manage&&<Button variant="tinted" disabled={!active} aria-describedby={!active?importReason:undefined} onClick={()=>setImporting(true)}>{t('Import members (CSV)')}</Button>}</div>
    {manage&&!active&&<div className="centers-import-notice"><p id={importReason}>{t(centerState==='draft'?'Assign a manager to activate this draft before importing members.':'Activate the center before importing members.')}</p>{onDetails&&<Button type="button" variant="tinted" onClick={onDetails}>{t('Center details')}</Button>}</div>}
    {rows.map(member=><Row key={member.id} title={member.name} subtitle={stateText(member.state)} value={member.number} accessory="chevron" onClick={()=>open(member)}/>)}
    {!busy&&!rows.length&&!error&&<p className="muted">{t('No members available')}</p>}
    {busy&&<p role="status" className="muted">{t('Loading…')}</p>}
    {error&&<p role="alert">{t(membersErrorKey(error))}</p>}
    {cursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}
  </div></Section>
}

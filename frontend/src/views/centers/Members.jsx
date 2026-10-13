import { useEffect, useRef, useState } from 'react'
import { Button, Section, Row, SearchField, TextField } from '../../components/ui.jsx'
import { useAutoMore } from '../../lib/use-auto-more.js'
import { centerMembers, centerMember, centerCommand, membersErrorKey } from '../../lib/centers-api.js'
import { t } from '../../lib/i18n.js'
import { useStore } from '../../store/useStore.js'
import { useCenters } from '../../store/useCenters.js'
import { useUI } from '../../store/useUI.js'
import MembershipActions from './MembershipActions.jsx'
import Invitations from './Invitations.jsx'

const stateText=state=>state==='active'?t('Active member'):state==='frozen'?t('Frozen member'):state==='ended'?t('Ended member'):t('Pending activation')
const fieldsOf=member=>({name:member?.name||'',email:member?.email||'',phone:member?.phone||'',nationalDocument:member?.nationalDocument||''})

function MemberForm({centerId,member,lifecycle,ownerUid,close,saved}) {
  const [fields,setFields]=useState(()=>fieldsOf(member)),[busy,setBusy]=useState(false),[error,setError]=useState(null)
  const [currentMember,setCurrentMember]=useState(member),[info,setInfo]=useState(lifecycle)
  const [requestId]=useState(()=>crypto.randomUUID())
  const input=(key,label,type='text')=><label className="centers-field"><span>{label}</span><TextField type={type} value={fields[key]} required={key==='name'} onChange={e=>setFields({...fields,[key]:e.target.value})}/></label>
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
    <div className="centers-actions"><Button type="button" disabled={busy} onClick={close}>{t('Back')}</Button><Button type="submit" variant="primary" disabled={busy||!fields.name.trim()}>{t('Save')}</Button></div>
  </form></Section>{currentMember&&info?.today&&<MembershipActions key={currentMember.version} centerId={centerId} member={currentMember} info={info} ownerUid={ownerUid} changed={result=>{setCurrentMember(result.member);setInfo({today:result.today,changes:result.changes})}}/>}
    {currentMember&&<Invitations centerId={centerId} ownerUid={ownerUid} memberId={currentMember.id} linked={currentMember.accountLinked}/>}</>
}

export default function Members({centerId,ownerUid,capabilities}) {
  const manage=capabilities.includes('members.manage')
  const permissionKey=capabilities.join('|')
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[rows,setRows]=useState([]),[cursor,setCursor]=useState(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(null),[editing,setEditing]=useState(null),[revision,setRevision]=useState(0)
  const [lifecycle,setLifecycle]=useState(null)
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
  if(editing)return manage?<MemberForm key={editing.id||'new'} centerId={centerId} member={editing.id?editing:null} lifecycle={lifecycle} ownerUid={ownerUid} close={()=>{setEditing(null);setRevision(r=>r+1)}} saved={()=>{setEditing(null);setRevision(r=>r+1)}}/>:
    <Section title={t('Member details')}><Row title={editing.name} subtitle={stateText(editing.state)} value={editing.number}/><Button onClick={()=>setEditing(null)}>{t('Back')}</Button></Section>
  return <Section title={t('Members')}><div className="centers-form">
    <div className="centers-actions"><SearchField aria-label={t('Search members')} placeholder={t('Search members')} value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/>{manage&&<Button onClick={()=>{setLifecycle(null);setEditing({})}}>{t('New member')}</Button>}</div>
    {rows.map(member=><Row key={member.id} title={member.name} subtitle={stateText(member.state)} value={member.number} accessory="chevron" onClick={()=>open(member)}/>)}
    {!busy&&!rows.length&&!error&&<p className="muted">{t('No members available')}</p>}
    {busy&&<p role="status" className="muted">{t('Loading…')}</p>}
    {error&&<p role="alert">{t(membersErrorKey(error))}</p>}
    {cursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}
  </div></Section>
}

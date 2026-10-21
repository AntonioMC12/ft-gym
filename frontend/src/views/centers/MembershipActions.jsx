import {useUnsavedCenterForm} from './NavigationGuard.jsx'
import {useEffect,useRef,useState} from 'react'
import {Button,Section,Row,TextField,TextArea,SelectRow} from '../../components/ui.jsx'
import {confirmSheet} from '../../sheets.jsx'
import {centerCommand,membersErrorKey} from '../../lib/centers-api.js'
import {fmtDate} from '../../lib/format.js'
import {t} from '../../lib/i18n.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {useUI} from '../../store/useUI.js'

const actionText=action=>action==='freeze'?t('Freeze membership'):action==='resume'?t('Resume membership'):action==='end'?t('End membership'):t('Active member')
export default function MembershipActions({centerId,member,info,ownerUid,changed}) {
  const choices=member.state==='active'?['freeze','end']:member.state==='frozen'?['resume','end']:member.state==='preactive'?['end']:[]
  const [action,setAction]=useState(choices[0]||'end'),[effectiveOn,setEffectiveOn]=useState(info.today),[resumeOn,setResumeOn]=useState(''),[reason,setReason]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(null),[requestId]=useState(()=>crypto.randomUUID())
  const saveForm=useUnsavedCenterForm(reason||resumeOn||effectiveOn!==info.today||action!==(choices[0]||'end')?JSON.stringify([action,effectiveOn,resumeOn,reason]):null,busy)
  const alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  const cancellationIds=useRef(new Map())
  const pending=(info.changes||[]).some(change=>change.canCancel)
  const run=async(path,body)=>{
    if(!alive.current||busy||useStore.getState().user?.id!==ownerUid)return
    setBusy(true);setError(null)
    try{const result=await centerCommand(path,body);if(!alive.current||useStore.getState().user?.id!==ownerUid)return;useUI.getState().toast(t('Saved'));changed(result)}
    catch(e){if(alive.current&&useStore.getState().user?.id===ownerUid){setError(e);useCenters.getState().revokeOn(e)}}finally{if(alive.current)setBusy(false)}
  }
  const submit=e=>{
    e.preventDefault()
    confirmSheet({title:t('Confirm membership change'),message:member.name+' · '+actionText(action)+' · '+fmtDate(effectiveOn,false,true),confirmText:t('Save'),danger:action==='end',
      onConfirm:()=>run('/api/centers/members/transition',{centerId,id:member.id,version:member.version,action,effectiveOn,resumeOn:action==='freeze'?(resumeOn||null):null,reason:reason||null,requestId})})
  }
  const cancel=change=>{
    if(!cancellationIds.current.has(change.id))cancellationIds.current.set(change.id,crypto.randomUUID())
    confirmSheet({title:t('Cancel scheduled change'),message:member.name+' · '+fmtDate(change.effectiveOn,false,true),confirmText:t('Confirm'),
      onConfirm:()=>run('/api/centers/members/transition/cancel',{centerId,id:member.id,version:member.version,changeId:change.id,requestId:cancellationIds.current.get(change.id)})})
  }
  return <Section title={t('Membership changes')}><div className="centers-form">
    {(info.changes||[]).map(change=><Row className="centers-change-row" key={change.id} title={change.automatic?t('Automatic resumption'):actionText(change.action)}
      subtitle={fmtDate(change.effectiveOn,false,true)+(change.reason?' · '+change.reason:'')} value={change.canceled?t('Canceled'):change.effectiveOn>info.today?t('Scheduled'):t('Applied')}>
      {change.canCancel&&<Button type="button" disabled={busy} onClick={()=>cancel(change)}>{t('Cancel scheduled change')}</Button>}
    </Row>)}
    {pending&&<p className="muted">{t('Cancel the pending change before adding another.')}</p>}
    {choices.length>0&&!pending&&<form ref={saveForm} aria-label={t('Membership changes')} onSubmit={submit}><fieldset disabled={busy} className="centers-lifecycle-fields">
      <SelectRow title={t('Membership change')} value={action} options={choices.map(value=>({value,label:actionText(value)}))} onChange={setAction}/>
      <div className="centers-fields"><label className="centers-field"><span>{t('Effective date')}</span><TextField type="date" required min={info.today} value={effectiveOn} onChange={e=>setEffectiveOn(e.target.value)}/></label>
        {action==='freeze'&&<label className="centers-field"><span>{t('Resumption date')}</span><TextField type="date" min={effectiveOn} value={resumeOn} onChange={e=>setResumeOn(e.target.value)}/></label>}
        <label className="centers-field"><span>{t('Reason')}</span><TextArea required={action!=='resume'} maxLength={250} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      </div><Button type="submit" variant={action==='end'?'danger':'primary'} disabled={busy||!effectiveOn||(action!=='resume'&&!reason.trim())}>{actionText(action)}</Button>
    </fieldset></form>}
    {error&&<p role="alert">{t(membersErrorKey(error))}</p>}
  </div></Section>
}

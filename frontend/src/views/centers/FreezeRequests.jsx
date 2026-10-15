import {useEffect,useRef,useState} from 'react'
import {Button,Section,Row,TextField,TextArea,NumberField,Switch} from '../../components/ui.jsx'
import {centerFreezes,centerCommand,freezeErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'
import {confirmSheet} from '../../sheets.jsx'
import {fmtDate} from '../../lib/format.js'
import {t} from '../../lib/i18n.js'

const policyOf=data=>({enabled:data?.enabled||false,minDays:data?.minDays??null,maxDays:data?.maxDays??null,noticeDays:data?.noticeDays??null,maxDaysPerYear:data?.maxDaysPerYear??null,billingEffect:'contract-proration'})
const stateLabel=state=>({pending:'Pending approval',approved:'Approved',rejected:'Rejected',withdrawn:'Withdrawn'})[state]
const effectText='Contract proration applies; issued receipts and existing debt stay unchanged.'
export default function FreezeRequests({centerId,ownerUid,memberId,memberVersion,own=false,active=true,canRequest=true,today,changed}){
  const requestNavigation=useCenterNavigation()
  const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[revision,setRevision]=useState(0)
  const [editingPolicy,setEditingPolicy]=useState(false),[policy,setPolicy]=useState(()=>policyOf()),[dates,setDates]=useState({effectiveOn:'',resumeOn:'',reason:''}),[rejectReasons,setRejectReasons]=useState({})
  const life=useRef(0),pending=useRef(false),retry=useRef(null),latest=useRef(null),callbacks=useRef({changed});callbacks.current={changed}
  latest.current={data,dates,policy,rejectReasons}
  const current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  const policyDirty=!!data&&JSON.stringify(policy)!==JSON.stringify(policyOf(data.policy.config))
  const dirty=own?Object.values(dates).some(Boolean):policyDirty||Object.values(rejectReasons).some(Boolean)
  useUnsavedCenterForm(dirty?JSON.stringify([dates,policy,rejectReasons]):null,busy)
  useEffect(()=>{
    const epoch=++life.current;pending.current=true;retry.current=null;setBusy(true);setData(null);setError(null);setDates({effectiveOn:'',resumeOn:'',reason:''});setRejectReasons({});setEditingPolicy(false)
    centerFreezes(centerId,{own,...(own?{}:{memberId})}).then(result=>{if(current(epoch)){setData(result);setPolicy(policyOf(result.policy.config))}}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,ownerUid,memberId,memberVersion,own,active,canRequest,revision])
  const run=async(path,body,epoch=life.current)=>{
    if(!current(epoch)||pending.current)return
    pending.current=true;setBusy(true);setError(null)
    const content={centerId,...body},signature=JSON.stringify([path,content]);if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()}
    try{const result=await centerCommand(path,{...content,requestId:retry.current.id});if(current(epoch)){retry.current=null;setRevision(v=>v+1);if(result.lifecycle)callbacks.current.changed?.(result.lifecycle)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const decide=(row,action)=>{
    const epoch=life.current,reason=action==='rejected'?rejectReasons[row.id]?.trim():null
    confirmSheet({title:t(action==='approved'?'Approve request':action==='rejected'?'Reject request':'Withdraw request'),message:fmtDate(row.effectiveOn,false,true)+' → '+fmtDate(row.resumeOn,false,true)+' · '+t(effectText),confirmText:t('Confirm'),onConfirm:()=>{
      const latestRow=latest.current.data?.requests.find(r=>r.id===row.id)
      if(!current(epoch)||!latestRow||latestRow.version!==row.version||latestRow.state!=='pending'||action==='rejected'&&latest.current.rejectReasons[row.id]?.trim()!==reason)return
      run('/api/centers/'+(own?'own/freezes/withdraw':'freezes/decide'),{id:row.id,version:row.version,action,reason,...(action==='approved'?{memberVersion}:{})},epoch)
    }})
  }
  const more=async()=>{
    if(pending.current||!data?.nextCursor)return;const epoch=life.current;pending.current=true;setBusy(true);setError(null)
    try{const result=await centerFreezes(centerId,{own,...(own?{}:{memberId}),cursor:data.nextCursor});if(current(epoch))setData(previous=>({...previous,requests:[...previous.requests,...result.requests],nextCursor:result.nextCursor}))}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const moreRef=useAutoMore(more)
  const pendingRequest=data?.requests.some(row=>row.state==='pending')
  return <Section title={t('Freeze requests')}><div className="centers-form">
    {data&&<>
      <p className="small muted">{t(effectText)}</p>
      {!data.policy.config.enabled&&<p role="status">{t('Freeze requests are disabled.')}</p>}
      {own&&data.policy.config.enabled&&<div className="centers-freeze-policy-summary">{[['Minimum days','minDays'],['Maximum days','maxDays'],['Notice days','noticeDays'],['Annual day limit','maxDaysPerYear']].map(([label,key])=><Row key={key} title={t(label)} value={data.policy.config[key]}/>)}</div>}
      {!own&&<><Button type="button" disabled={busy} onClick={()=>setEditingPolicy(value=>!value)}>{t('Freeze policy')}</Button>{editingPolicy&&<form onSubmit={e=>{e.preventDefault();run('/api/centers/freezes/policy',{config:policy,version:data.policy.version})}}>
        <fieldset disabled={busy||!active} className="centers-lifecycle-fields"><Row title={t('Allow freeze requests')}><Switch type="button" aria-label={t('Allow freeze requests')} checked={policy.enabled} onChange={enabled=>setPolicy(p=>({...p,enabled}))}/></Row>
        <div className="centers-fields">{[['Minimum days','minDays',1],['Maximum days','maxDays',1],['Notice days','noticeDays',0],['Annual day limit','maxDaysPerYear',1]].map(([label,key,min])=><label key={key} className="centers-field"><span>{t(label)}</span><NumberField className="field" nullable decimal={false} required min={min} max={366} aria-label={t(label)} value={policy[key]} onChange={value=>setPolicy(p=>({...p,[key]:value}))}/></label>)}</div>
        <div className="centers-actions"><Button type="button" disabled={busy} onClick={()=>{setPolicy(policyOf(data.policy.config));setEditingPolicy(false)}}>{t('Cancel')}</Button><Button type="submit" variant="primary" disabled={busy||!active||['minDays','maxDays','noticeDays','maxDaysPerYear'].some(key=>policy[key]==null)}>{t('Save')}</Button></div></fieldset>
      </form>}</>}
      {data.requests.map(row=><div key={row.id} className="centers-freeze-request"><Row title={fmtDate(row.effectiveOn,false,true)+' → '+fmtDate(row.resumeOn,false,true)} subtitle={row.reason} value={t(stateLabel(row.state))}/>{row.decisionReason&&<p>{row.decisionReason}</p>}
        {row.state==='pending'&&(own?<Button type="button" disabled={busy} onClick={()=>decide(row,'withdrawn')}>{t('Withdraw request')}</Button>:<><label className="centers-field"><span>{t('Reason')}</span><TextArea maxLength={250} disabled={busy} value={rejectReasons[row.id]||''} onChange={e=>setRejectReasons(previous=>({...previous,[row.id]:e.target.value}))}/></label><div className="centers-actions"><Button type="button" variant="tinted" disabled={busy||policyDirty||!rejectReasons[row.id]?.trim()} onClick={()=>decide(row,'rejected')}>{t('Reject request')}</Button><Button type="button" variant="primary" disabled={busy||policyDirty||!active} onClick={()=>decide(row,'approved')}>{t('Approve request')}</Button></div></>)}
      </div>)}
      {own&&data.policy.config.enabled&&!pendingRequest&&canRequest&&active&&<form onSubmit={e=>{e.preventDefault();run('/api/centers/own/freezes/request',dates)}}><fieldset disabled={busy} className="centers-lifecycle-fields"><div className="centers-fields">
        <label className="centers-field"><span>{t('Effective date')}</span><TextField type="date" required min={today} value={dates.effectiveOn} onChange={e=>setDates(p=>({...p,effectiveOn:e.target.value}))}/></label>
        <label className="centers-field"><span>{t('Resumption date')}</span><TextField type="date" required min={dates.effectiveOn||today} value={dates.resumeOn} onChange={e=>setDates(p=>({...p,resumeOn:e.target.value}))}/></label>
        <label className="centers-field"><span>{t('Reason')}</span><TextArea required maxLength={250} value={dates.reason} onChange={e=>setDates(p=>({...p,reason:e.target.value}))}/></label>
      </div><Button type="submit" variant="primary" disabled={busy||!dates.effectiveOn||!dates.resumeOn||!dates.reason.trim()}>{t('Request freeze')}</Button></fieldset></form>}
      {data.nextCursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}
    </>}
    {busy&&<p role="status">{t('Loading…')}</p>}
    {error&&<p role="alert">{t(freezeErrorKey(error))}</p>}
    <Button type="button" disabled={busy} onClick={()=>requestNavigation(()=>setRevision(v=>v+1))}>{t('Reload centers')}</Button>
  </div></Section>
}

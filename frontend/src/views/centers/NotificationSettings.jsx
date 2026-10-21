import {useEffect,useRef,useState} from 'react'
import HelpLabel from '../../components/HelpLabel.jsx'
import {debtHelp} from './debt-help.js'
import {Section,Row,Button,Switch,NumberField} from '../../components/ui.jsx'
import {centerNotifications,centerCommand,notificationErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {confirmSheet} from '../../sheets.jsx'
import {t} from '../../lib/i18n.js'
import {useUnsavedCenterForm} from './NavigationGuard.jsx'
const empty={enabled:false,receipts:true,dueLeadDays:3,debtRepeatDays:7,priceNoticeDays:30,version:0}
const fields=[['dueLeadDays','Due reminder lead (days)'],['debtRepeatDays','Debt reminder interval (days)'],['priceNoticeDays','Price notice lead (days)']]
const states={pending:'Pending job',sending:'Sending notice',sent:'Sent notice',blocked:'Blocked job',uncertain:'Delivery needs review',skipped:'Skipped job'}
export default function NotificationSettings({centerId,ownerUid,platform=false,active=true}) {
  const [data,setData]=useState(null),[draft,setDraft]=useState(empty),[error,setError]=useState(null),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0)
  const saveForm=useUnsavedCenterForm(data&&JSON.stringify(draft)!==JSON.stringify(data.policy||empty)?JSON.stringify(draft):null,!!data&&busy)
  const life=useRef(0),pending=useRef(false),retry=useRef(null),current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  useEffect(()=>{
    const epoch=++life.current;pending.current=true;retry.current=null;setData(null);setBusy(true);setError(null)
    centerNotifications(centerId).then(result=>{if(current(epoch)){setData(result);setDraft(result.policy||empty)}}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,ownerUid,platform,active,revision])
  const execute=async(action,body,epoch)=>{
    if(!current(epoch)||pending.current||!platform||!active)return;pending.current=true;setBusy(true);setError(null)
    const path='/api/platform/centers/notifications/'+action,content={centerId,...body},signature=JSON.stringify([path,content]);if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()}
    try{await centerCommand(path,{...content,requestId:retry.current.id});if(current(epoch))setRevision(value=>value+1)}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const save=e=>{e.preventDefault();const epoch=life.current,body={...draft};confirmSheet({title:t('Email notices'),message:fields.map(([key,label])=>t(label)+': '+body[key]).join(' · '),confirmText:t('Save'),onConfirm:()=>execute('policy',body,epoch)})}
  return <Section className="centers-billing-tools" title={t('Email notices')}><div className="centers-form">
    <div className="centers-billing-heading"><HelpLabel title="Email notices" help={debtHelp.notices}/></div>
    {data&&<>
      {data.transport==='off'?<p className="centers-billing-status" role="status">{t('Email notices are not configured.')}</p>:data.transport==='test-capture'&&<p className="centers-billing-status" role="status">{t('Local test: no emails are sent.')}</p>}
      {platform?<form ref={saveForm} aria-label={t('Email notices')} onSubmit={save}>
        <label className="centers-actions"><span>{t('Enable email notices')}</span><Switch type="button" aria-label={t('Enable email notices')} checked={draft.enabled} disabled={busy||!active||data.transport==='off'} onChange={enabled=>setDraft(value=>({...value,enabled}))}/></label>
        <label className="centers-actions"><span>{t('Receipt notices')}</span><Switch type="button" aria-label={t('Receipt notices')} checked={draft.receipts} disabled={busy||!active} onChange={receipts=>setDraft(value=>({...value,receipts}))}/></label>
        {fields.map(([key,label])=><div className="centers-field" key={key}><HelpLabel title={label} help={debtHelp.notices}/><NumberField aria-label={t(label)} className="field" decimal={false} value={draft[key]} disabled={busy||!active} onChange={number=>setDraft(value=>({...value,[key]:number}))}/></div>)}
        <div className="centers-form-actions" data-center-form-actions><Button type="submit" variant="primary" disabled={busy||!active}>{t('Save')}</Button></div>
      </form>:<>{fields.map(([key,label])=><Row key={key} title={t(label)} value={data.policy?.[key]??t('Not configured')}/>)}<Row title={t('Email notices')} value={t(data.policy?.enabled?'On':'Off')}/></>}
      <div className="centers-job-stats">{Object.entries(states).map(([state,label])=><article key={state}><span>{t(label)}</span><strong>{data.counts[state]||'0'}</strong></article>)}</div>
      {platform&&data.counts.blocked!=='0'&&data.counts.blocked&&<Button disabled={busy||!active} onClick={()=>execute('retry',{},life.current)}>{t('Retry blocked notices')}</Button>}
    </>}
    <div className="centers-debt-toolbar"><Button variant="tinted" disabled={busy} onClick={()=>setRevision(value=>value+1)}>{t('Reload centers')}</Button></div>
    {error&&<p role="alert">{t(notificationErrorKey(error))}</p>}
  </div></Section>
}

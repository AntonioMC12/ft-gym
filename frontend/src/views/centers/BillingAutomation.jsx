import {useEffect,useRef,useState} from 'react'
import HelpLabel from '../../components/HelpLabel.jsx'
import {debtHelp} from './debt-help.js'
import {Section,Row,Button,Switch,TextField} from '../../components/ui.jsx'
import {centerAutomation,centerCommand,centersErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {confirmSheet} from '../../sheets.jsx'
import {t} from '../../lib/i18n.js'
const labels={pending:'Pending job',done:'Completed job',skipped:'Skipped job',blocked:'Blocked job'}
export default function BillingAutomation({centerId,ownerUid,platform=false,active=true}) {
  const [data,setData]=useState(null),[fromOn,setFromOn]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(null),[revision,setRevision]=useState(0)
  const life=useRef(0),pending=useRef(false),retry=useRef(null),current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  useEffect(()=>{
    const epoch=++life.current;pending.current=true;retry.current=null;setData(null);setBusy(true);setError(null)
    centerAutomation(centerId).then(result=>{if(current(epoch)){setData(result);setFromOn(result.settings.fromOn||result.today)}}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,ownerUid,platform,active,revision])
  const execute=async(path,body,epoch)=>{
    if(!current(epoch)||pending.current||!platform||!active)return;pending.current=true;setBusy(true);setError(null)
    const signature=JSON.stringify([path,body]);if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()}
    try{await centerCommand(path,{...body,requestId:retry.current.id});if(current(epoch))setRevision(value=>value+1)}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const toggle=enabled=>{
    if(!data||busy)return;const epoch=life.current,body={centerId,enabled,fromOn,version:data.settings.version}
    confirmSheet({title:t('Automatic receipts'),message:t('Issue receipt records automatically; no payments are collected.')+' '+t('First eligible period')+': '+fromOn,confirmText:t('Confirm'),onConfirm:()=>execute('/api/platform/centers/billing/automation',body,epoch)})
  }
  return <Section className="centers-billing-tools" title={t('Automatic receipts')}><div className="centers-form">
    <div className="centers-billing-heading"><HelpLabel title="Automatic receipts" help={debtHelp.automation}/><p className="small muted">{t('Issue receipt records automatically; no payments are collected.')}</p></div>
    {data&&<>
      {!data.workerEnabled&&<div className="centers-billing-status" role="status"><span className="centers-member-status">{t('Disabled')}</span><span>{t('The executor is disabled on this server.')}</span></div>}
      {platform?<><div className="centers-field"><HelpLabel title="First eligible period" help={debtHelp.start}/><TextField aria-label={t('First eligible period')} type="date" value={fromOn} disabled={busy||data.settings.version>0||!active} onChange={e=>setFromOn(e.target.value)}/></div>
        <label className="centers-actions"><span>{t('Automatic receipts')}</span><Switch type="button" aria-label={t('Automatic receipts')} checked={data.settings.enabled} disabled={busy||!fromOn||!active} onChange={toggle}/></label>
        {data.settings.version>0&&<p className="small muted">{t('The initial date is locked after saving.')}</p>}</>:<Row title={t('Automatic receipts')} value={t(data.settings.enabled?'On':'Off')}/>}
      <div className="centers-job-stats">{Object.entries(labels).map(([state,label])=><article key={state}><HelpLabel title={label} help={debtHelp.jobs}/><strong>{data.counts[state]||'0'}</strong></article>)}</div>
      <Row title={<HelpLabel title="Pending events" help={debtHelp.events}/>} value={data.pendingEvents}/>
      <details className="centers-billing-details" open={data.jobs.some(job=>job.state==='blocked')}><summary>{t('Recent jobs (30 maximum)')}</summary>
      {data.jobs.map(job=><div key={job.id}><Row title={job.periodStart} subtitle={t(labels[job.state])} value={String(job.attempts)}/>{platform&&active&&job.state==='blocked'&&<Button disabled={busy} onClick={()=>execute('/api/platform/centers/billing/jobs/retry',{centerId,id:job.id},life.current)}>{t('Retry blocked job')}</Button>}</div>)}
      {!data.jobs.length&&<p className="small muted">{t('No data yet')}</p>}</details>
    </>}
    <div className="centers-debt-toolbar"><Button variant="tinted" disabled={busy} onClick={()=>setRevision(value=>value+1)}>{t('Reload centers')}</Button></div>
    {error&&<p role="alert">{t(centersErrorKey(error))}</p>}
  </div></Section>
}

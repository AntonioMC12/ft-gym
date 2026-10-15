import {useEffect,useRef,useState} from 'react'
import {Button,Section,Row,TextField} from '../../components/ui.jsx'
import {centerCommand,centerMemberImport,memberImportErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {confirmSheet} from '../../sheets.jsx'
import {t} from '../../lib/i18n.js'
import {useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'

export default function CsvImport({centerId,ownerUid,active=true,jobId,onJob,close,changed}){
  const [csv,setCsv]=useState(''),[name,setName]=useState(''),[job,setJob]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null)
  const life=useRef(0),pending=useRef(false),retry=useRef(null),latestJob=useRef(job),callbacks=useRef({onJob,changed})
  latestJob.current=job;callbacks.current={onJob,changed}
  const requestNavigation=useCenterNavigation(),current=id=>life.current===id&&useStore.getState().user?.id===ownerUid
  useUnsavedCenterForm(csv&&!job?csv:null,busy)
  useEffect(()=>{life.current++;setJob(null);setCsv('');setName('');setBusy(false);setError(null);retry.current=null;pending.current=false;return()=>{life.current++;pending.current=false}},[centerId,ownerUid,active])
  const accept=data=>{if(data.definitionVersion!==1)throw new Error('unsupported import definition');setJob(data);latestJob.current=data;return data}
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  const load=async id=>{
    if(!id||pending.current)return;const epoch=life.current;pending.current=true;setBusy(true);setError(null)
    try{const data=await centerMemberImport(centerId,id);if(current(epoch))accept(data)}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  useEffect(()=>{if(jobId&&latestJob.current?.id!==jobId){
    const epoch=++life.current;
    pending.current=true;setBusy(true);setError(null);setJob(null);latestJob.current=null
    centerMemberImport(centerId,jobId).then(data=>{if(current(epoch))accept(data)}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{if(life.current===epoch){life.current++;pending.current=false}}
  }else if(!pending.current)setBusy(false)},[jobId,centerId,ownerUid,active])
  const fileChanged=async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file||pending.current||!active)return
    const epoch=++life.current;pending.current=true;setBusy(true);setError(null);setJob(null);setCsv('');setName(file.name);retry.current=null;callbacks.current.onJob?.(null)
    try{
      if(file.size>256*1024)throw {code:'invalid-member-csv'}
      const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(!text.trim())throw {code:'invalid-member-csv'};if(current(epoch))setCsv(text)
    }catch{if(current(epoch))setError({code:'invalid-member-csv'})}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const prepare=async()=>{
    if(pending.current||!csv||!active)return;const epoch=life.current;pending.current=true;setBusy(true);setError(null)
    if(!retry.current||retry.current.csv!==csv)retry.current={csv,id:crypto.randomUUID()}
    try{const data=await centerCommand('/api/centers/members/imports/prepare',{centerId,csv,duplicatePolicy:'skip',requestId:retry.current.id});if(current(epoch)){accept(data);callbacks.current.onJob?.(data.id)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const commit=()=>{
    const epoch=life.current,snapshot=latestJob.current;if(pending.current||!active||snapshot?.state!=='prepared'||snapshot.summary.errors)return
    confirmSheet({title:t('Confirm import'),message:t('Import creates pending members, without accounts, contracts or payments.')+' '+t('Ready to import')+': '+snapshot.summary.ready+' · '+t('Skipped duplicates')+': '+snapshot.summary.skipped,confirmText:t('Confirm import'),onConfirm:async()=>{
      if(!current(epoch)||pending.current||latestJob.current?.reviewHash!==snapshot.reviewHash)return
      pending.current=true;setBusy(true);setError(null)
      try{const data=await centerCommand('/api/centers/members/imports/commit',{centerId,id:snapshot.id,reviewHash:snapshot.reviewHash});if(current(epoch)){accept(data);setCsv('');callbacks.current.changed?.()}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
    }})
  }
  const template=()=>{
    const url=URL.createObjectURL(new Blob(['\uFEFFname,email,phone,nationalDocument\r\n'],{type:'text/csv;charset=utf-8'})),anchor=document.createElement('a');anchor.href=url;anchor.download='members-template.csv';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  const done=job?.state==='completed',counts=done?job.result:job?.summary
  const details=fields=>fields?[[t('Contact email'),fields.email],[t('Phone'),fields.phone],[t('National document'),fields.nationalDocument]].filter(([,value])=>value).map(([label,value])=>label+': '+value).join(' · '):undefined
  return <Section title={t('Import members (CSV)')}><div className="centers-form">
    <p className="small muted">{t('Use UTF-8 CSV, up to 200 rows and 256 KiB.')}</p>
    <p className="small muted">{t('Duplicates match email or document; names alone are not merged.')}</p>
    <p className="small muted">{t('Import creates pending members, without accounts, contracts or payments.')}</p>
    <Button type="button" variant="tinted" onClick={template}>{t('Download CSV template')}</Button>
    <label className="centers-field"><span>{t('CSV file')}</span><TextField type="file" accept=".csv,text/csv" disabled={busy||!active} onChange={fileChanged}/></label>
    {name&&<p className="small muted">{name}</p>}
    {csv&&!job&&<Button type="button" variant="primary" disabled={busy||!active} onClick={prepare}>{t('Review import')}</Button>}
    {job&&<>
      {done&&<p role="status">{t('Import completed')}</p>}
      {counts&&<div className="centers-import-summary"><Row title={t('Members')} value={String(counts.total)}/><Row title={done?t('Import completed'):t('Ready to import')} value={String(done?counts.imported:counts.ready)}/><Row title={t('Skipped duplicates')} value={String(counts.skipped)}/>{!done&&<Row title={t('Invalid rows')} value={String(counts.errors)}/>}</div>}
      {job.state==='expired'&&<p role="alert">{t('Choose the CSV file again to start a new review.')}</p>}
      {!done&&counts?.errors>0&&<p role="alert">{t('Fix invalid rows before importing.')}</p>}
      {!done&&<Button type="button" disabled={busy} onClick={()=>load(job.id)}>{t('Review import')}</Button>}
      <div className="centers-import-rows">{(done?job.result.rows:job.rows).map(row=><Row key={row.record} className={row.status==='error'?'centers-import-error':''} title={t('Line')+' '+row.line+(row.fields?' · '+row.fields.name:'')} subtitle={details(row.fields)}
        value={row.status==='error'?t('Check the member details.'):row.status==='ready'?t('Ready to import'):row.status==='imported'?t('Import completed'):t('Skipped duplicates')}/>)}</div>
      {!done&&<Button type="button" variant="primary" disabled={busy||!active||job.state!=='prepared'||!!job.summary.errors} onClick={commit}>{t('Confirm import')}</Button>}
    </>}
    {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(memberImportErrorKey(error))}</p>}
    {error&&jobId&&!job&&<Button type="button" onClick={()=>load(jobId)} disabled={busy}>{t('Retry')}</Button>}
    <Button type="button" disabled={busy} onClick={()=>requestNavigation(close)}>{t('Back')}</Button>
  </div></Section>
}

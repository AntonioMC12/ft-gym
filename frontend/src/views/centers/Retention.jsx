import Icon from '../../components/Icon.jsx'
import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button,NumberField,TextArea,Switch,SelectRow,Segmented} from '../../components/ui.jsx'
import {centerRetention,centerCommand,retentionErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'
import {confirmSheet} from '../../sheets.jsx'
import {centerDateTime} from '../../lib/center-time.js'
import {t} from '../../lib/i18n.js'
const policyFields=policy=>({enabled:policy.enabled,daysWithoutVisit:policy.daysWithoutVisit,includeNeverVisited:policy.includeNeverVisited})
const outcomes={reviewed:'Review recorded',contacted:'Contact recorded',dismissed:'Dismissed'}
function Content({centerId,ownerUid}){
  const [data,setData]=useState(null),[view,setView]=useState('open'),[draft,setDraft]=useState({enabled:false,daysWithoutVisit:null,includeNeverVisited:false}),[baseline,setBaseline]=useState(''),[editing,setEditing]=useState(false),[selected,setSelected]=useState(null),[outcome,setOutcome]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState(null),[revision,setRevision]=useState(0)
  const life=useRef(0),pending=useRef(false),intent=useRef(null),latest=useRef(''),navigate=useCenterNavigation()
  const current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid,policyDirty=baseline&&JSON.stringify(draft)!==baseline
  latest.current=JSON.stringify({draft,selected: selected?.id,outcome,note,version:data?.policy.version,view});const form=useUnsavedCenterForm(policyDirty||selected&&(outcome||note)?latest.current:null,busy)
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  useEffect(()=>{const epoch=++life.current;pending.current=true;setBusy(true);setError(null);setData(null);setBaseline('');setSelected(null);setOutcome('');setNote('');setEditing(false);intent.current=null
    centerRetention(centerId,{view}).then(result=>{if(current(epoch)){setData(result);const fields=policyFields(result.policy);setDraft(fields);setBaseline(JSON.stringify(fields))}}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,ownerUid,view,revision])
  const command=async(path,body,epoch)=>{
    if(!current(epoch)||pending.current)return;pending.current=true;setBusy(true);setError(null);const signature=JSON.stringify([path,body]);if(intent.current?.signature!==signature)intent.current={signature,id:crypto.randomUUID()}
    try{await centerCommand(path,{...body,requestId:intent.current.id});if(current(epoch)){intent.current=null;setRevision(value=>value+1)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const confirm=(title,path,body,message)=>{const epoch=life.current,origin=latest.current;confirmSheet({title:t(title),message,confirmText:t('Confirm'),onConfirm:()=>{if(current(epoch)&&latest.current===origin)command(path,body,epoch)}})}
  const savePolicy=()=>{if(!data||pending.current||!policyDirty||draft.enabled&&(!data.active||draft.daysWithoutVisit==null))return;confirm('Configure inactivity alerts','/api/centers/retention/policy',{centerId,version:data.policy.version,fields:draft},t('Days without a validated admission')+': '+(draft.daysWithoutVisit??'—')+' · '+t('Include memberships with no validated admissions')+': '+t(draft.includeNeverVisited?'Enabled':'Disabled')+' · '+t('Recording a contact does not send a message.')+' · '+t('No automatic fees or penalties.'))}
  const record=()=>{if(!selected||!data||pending.current||policyDirty||!outcome||outcome==='dismissed'&&!note.trim())return;confirm('Record retention review','/api/centers/retention/review',{centerId,memberId:selected.memberId,alertId:selected.id,policyVersion:data.policy.version,outcome,note:note.trim()||null},selected.name+' · '+selected.number+' · '+t(outcomes[outcome])+' · '+t('Recording a contact does not send a message.'))}
  const more=async()=>{if(!data?.nextCursor||pending.current)return;const epoch=life.current;pending.current=true;setBusy(true);setError(null)
    try{const result=await centerRetention(centerId,{view,cursor:data.nextCursor});if(current(epoch))setData(old=>({...old,...result,items:[...old.items,...result.items]}))}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const moreRef=useAutoMore(more)
  return <Section title={t('Inactivity review')} className="centers-retention"><div className="centers-form" ref={form}>
    {data&&<><div className="centers-retention-heading"><div><strong>{t('Inactivity alerts')}</strong><span className="small muted">{t('Business date')}: {data.today}</span></div><span className={'centers-member-status'+(data.policy.enabled?' centers-retention-enabled':'')}>{t(data.policy.enabled?'Enabled':'Disabled')}</span></div>
      {!selected&&!editing&&<div className="centers-retention-toolbar">{data.policy.enabled&&<p className="small muted">{t('Days without a validated admission')}: <strong>{data.policy.daysWithoutVisit}</strong></p>}<Button type="button" variant="tinted" disabled={busy} onClick={()=>setEditing(true)}>{t('Configure inactivity alerts')}</Button></div>}
      {editing&&!selected&&<fieldset disabled={busy} className="centers-lifecycle-fields">
        <Row title={t('Enable inactivity alerts')}><Switch aria-label={t('Enable inactivity alerts')} checked={draft.enabled} disabled={!data.active&&!draft.enabled} onChange={enabled=>setDraft(old=>({...old,enabled}))}/></Row>
        <label className="centers-field"><span>{t('Days without a validated admission')}</span><NumberField className="field" nullable decimal={false} min={1} max={3650} aria-label={t('Days without a validated admission')} value={draft.daysWithoutVisit} onChange={value=>setDraft(old=>({...old,daysWithoutVisit:value}))}/></label>
        <Row title={t('Include memberships with no validated admissions')}><Switch aria-label={t('Include memberships with no validated admissions')} checked={draft.includeNeverVisited} onChange={includeNeverVisited=>setDraft(old=>({...old,includeNeverVisited}))}/></Row>
        <div className="centers-form-actions" data-center-form-actions><Button type="button" disabled={busy} onClick={()=>navigate(()=>{setDraft(policyFields(data.policy));setEditing(false)})}>{t('Cancel')}</Button><Button type="button" variant="primary" disabled={busy||!policyDirty||draft.enabled&&(!data.active||draft.daysWithoutVisit==null)} onClick={savePolicy}>{t('Save')}</Button></div>
      </fieldset>}
      <fieldset disabled={busy} className="centers-lifecycle-fields"><Segmented label={t('Inactivity review')} value={view} options={[{value:'open',label:t('Open notices')},{value:'history',label:t('Review history')}]} onChange={next=>navigate(()=>setView(next))}/></fieldset>
      {selected?<div className="centers-card centers-retention-notice"><h3>{selected.name}</h3><p>{selected.number}</p><SelectRow variant="field" disabled={busy} title={t('Review outcome')} value={outcome} options={[{value:'',label:t('Not configured')},...Object.entries(outcomes).map(([value,label])=>({value,label:t(label)}))]} onChange={setOutcome}/>
        <label className="centers-field"><span>{t('Reason')}</span><TextArea maxLength={500} disabled={busy} value={note} onChange={e=>setNote(e.target.value)}/></label><p className="small muted">{t('Recording a contact does not send a message.')}</p>
        <div className="centers-form-actions" data-center-form-actions><Button type="button" disabled={busy} onClick={()=>navigate(()=>{setSelected(null);setOutcome('');setNote('')})}>{t('Back')}</Button><Button type="button" variant="primary" disabled={busy||!outcome||outcome==='dismissed'&&!note.trim()} onClick={record}>{t('Record retention review')}</Button></div>
      </div>:<>
        {data.items.map(item=><div key={item.id} className="centers-card centers-retention-notice"><h3>{item.name}</h3><p>{item.number}</p>{view==='open'?<>
          <Row title={t('Last validated admission')} value={item.lastVisitOn||t('No validated admissions')}/><Row title={t('Days without a validated admission')} value={String(item.daysWithoutVisit)}/>
          <Button type="button" variant="tinted" disabled={busy||!!policyDirty} onClick={()=>{setSelected(item);setOutcome('');setNote('')}}>{t('Review notice')}</Button>
        </>:<><Row title={t(outcomes[item.outcome])} value={centerDateTime(item.createdAt,data.timezone)}/>{item.note&&<p className="centers-import-notice">{item.note}</p>}</>}</div>)}
        {!data.items.length&&<div className="centers-metric-empty"><Icon name="info"/><div><strong>{t(view==='open'?'Open notices':'Review history')}</strong><p>{t(view==='open'&&!data.policy.enabled?'Inactivity alerts are disabled until you configure a rule.':view==='open'?'No open inactivity notices.':'No retention reviews recorded.')}</p></div></div>}
        {data.nextCursor&&<Button type="button" ref={moreRef} disabled={busy||!!policyDirty} onClick={more}>{t('Show more')}</Button>}
      </>}
    </>}
    {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(retentionErrorKey(error))}</p>}
    <div className="centers-retention-footer"><p className="small muted">{t('Uses validated admissions, not workout activity or live occupancy.')}</p><Button type="button" variant="tinted" disabled={busy} onClick={()=>navigate(()=>setRevision(value=>value+1))}>{t('Reload centers')}</Button></div>
  </div></Section>
}
export default function Retention(props){return <Content key={JSON.stringify([props.centerId,props.ownerUid])} {...props}/>}

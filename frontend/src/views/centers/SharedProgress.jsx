import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button,TextField,MultiSelectRow} from '../../components/ui.jsx'
import {centerProgressShare,centerSharedProgress,centerCommand,progressErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {confirmSheet} from '../../sheets.jsx'
import {useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'
import {t} from '../../lib/i18n.js'
const empty={routineIds:[],from:'',to:''}
const draftFor=data=>({routineIds:data.share.routineIds,from:data.share.from||data.today,to:data.share.to||data.today})
function Content({centerId,ownerUid,member,own=false,centerName=''}){
  const S=useStore(s=>s.S),[data,setData]=useState(null),[draft,setDraft]=useState(empty),[baseline,setBaseline]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState(null),[revision,setRevision]=useState(0)
  const life=useRef(0),pending=useRef(false),intent=useRef(null),latest=useRef(''),navigate=useCenterNavigation()
  const current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  latest.current=JSON.stringify({draft,version:data?.share?.version});useUnsavedCenterForm(own&&baseline&&JSON.stringify(draft)!==baseline?latest.current:null,busy)
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  const adopt=result=>{setData(result);if(own){const next=draftFor(result);setDraft(next);setBaseline(JSON.stringify(next))}}
  useEffect(()=>{const epoch=++life.current;pending.current=true;setBusy(true);setError(null);setData(null);setBaseline('');setDraft(empty);intent.current=null
    ;(own?centerProgressShare(centerId):centerSharedProgress(centerId,member.id)).then(result=>{if(current(epoch))adopt(result)}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,ownerUid,member?.id,member?.version,own,revision])
  const change=(key,value)=>setDraft(old=>({...old,[key]:value}))
  const available=(S?.routines||[]).filter(row=>!(Number(S?.deleted?.routines?.[row.id])>0)).map(row=>({value:row.id,label:row.name}))
  const options=[...available,...draft.routineIds.filter(id=>!available.some(row=>row.value===id)).map(id=>({value:id,label:t('Deleted routine')}))]
  const commit=enabled=>{
    if(pending.current||!data||enabled&&!data.canEnable)return
    const epoch=life.current,origin=latest.current,fields=enabled?{enabled:true,...draft}:{enabled:false},body={centerId,version:data.share.version,fields},signature=JSON.stringify(body)
    confirmSheet({title:t(enabled?'Share selected progress':'Stop sharing progress'),message:centerName+' · '+t('Only selected routine names and saved-session counts are shared. No loads, notes, photos or body data.')+(enabled?' · '+draft.from+' → '+draft.to+' · '+options.filter(row=>draft.routineIds.includes(row.value)).map(row=>row.label).join(', '):''),confirmText:t('Confirm'),danger:!enabled,onConfirm:async()=>{
      if(!current(epoch)||pending.current||latest.current!==origin)return
      pending.current=true;setBusy(true);setError(null);if(intent.current?.signature!==signature)intent.current={signature,id:crypto.randomUUID()}
      try{if(enabled){await useStore.getState().syncNow();if(!current(epoch)||latest.current!==origin)return}
        const result=await centerCommand('/api/centers/own/training/progress/share',{...body,requestId:intent.current.id});
        if(current(epoch)){adopt({...data,share:result.share});intent.current=null}
      }catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
    }})
  }
  return <Section title={t('Shared training progress')}><div className="centers-form">
    {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(progressErrorKey(error))}</p>}
    {own&&data&&<>
      <Row title={t('Progress sharing')} value={t(data.share.enabled?'Enabled':'Disabled')}/>
      <p className="small muted">{t('Only selected routine names and saved-session counts are shared. No loads, notes, photos or body data.')}</p>
      <p className="small muted">{t('Sharing stays active until you revoke it and only covers the chosen logged dates.')}</p>
      <fieldset disabled={busy||!data.canEnable} className="centers-lifecycle-fields">
        <MultiSelectRow title={t('Routines to share')} options={options} values={draft.routineIds} onToggle={id=>{if(!pending.current)setDraft(old=>({...old,routineIds:old.routineIds.includes(id)?old.routineIds.filter(value=>value!==id):[...old.routineIds,id]}))}}/>
        <p className="small muted">{t('Routines to share')}: {draft.routineIds.length}/20</p><div className="centers-fields">{['from','to'].map(key=><label key={key} className="centers-field"><span>{t(key==='from'?'From':'To')}</span><TextField type="date" required max={data.today} value={draft[key]} onChange={e=>change(key,e.target.value)}/></label>)}</div>
        <Button type="button" variant="primary" disabled={busy||!data.canEnable||!draft.routineIds.length||draft.routineIds.length>20||!draft.from||!draft.to||draft.from>draft.to} onClick={()=>commit(true)}>{t('Share selected progress')}</Button>
      </fieldset>
      {!data.canEnable&&<p>{t('An active center and membership are required to share progress.')}</p>}
      {data.share.enabled&&<Button type="button" variant="tinted" disabled={busy} onClick={()=>commit(false)}>{t('Stop sharing progress')}</Button>}
    </>}
    {!own&&data&&(!data.shared?<p>{t('This member is not sharing training progress with this center.')}</p>:<>
      <Row title={t('Reporting period')} value={data.report.period.from+' → '+data.report.period.to}/><p className="small muted">{t('Saved sessions are records, not proof of completed exercise.')}</p>
      {data.report.routines.map((row,index)=><div className="centers-class-card" key={index}><h3>{row.name||t('Deleted routine')}</h3><Row title={t('Saved sessions')} value={String(row.sessions)}/><Row title={t('Logged days')} value={String(row.days)}/><Row title={t('Last logged day')} value={row.lastSessionOn||t('Not configured')}/>
        {row.weeks.length>0&&<details><summary>{t('Sessions by week')}</summary>{row.weeks.map(week=><Row key={week.from} title={week.from} value={String(week.sessions)}/>)}</details>}
      </div>)}
    </>)}
    <Button type="button" disabled={busy} onClick={()=>navigate(()=>setRevision(value=>value+1))}>{t('Reload centers')}</Button>
  </div></Section>
}
export default function SharedProgress(props){return <Content key={JSON.stringify([props.centerId,props.ownerUid,!!props.own,props.member?.id])} {...props}/>}

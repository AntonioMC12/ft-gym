import {useEffect,useRef,useState} from 'react'
import {Button,Section,Row,TextField,TextArea,NumberField,Check,SelectRow} from '../../components/ui.jsx'
import TimeField from '../../components/TimeField.jsx'
import {centerClasses,centerClassRoster,centerPlans,centerCommand,classesErrorKey} from '../../lib/centers-api.js'
import {classSchedule} from '../../lib/class-display.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'
import {confirmSheet} from '../../sheets.jsx'
import {t,dateLocale} from '../../lib/i18n.js'

const status=state=>({booked:'Booked',waiting:'Waiting list',canceled:'Canceled',ineligible:'Ineligible',attended:'Attended','no-show':'No-show'})[state]
const initial=()=>({name:'',room:'',date:'',startTime:'',endTime:'',capacity:null,waitlistCapacity:null,cancelBeforeMinutes:null,eligiblePlanIds:[],disambiguation:null})
function ClassEditor({centerId,ownerUid,timezone,today,close,saved}){
  const [fields,setFields]=useState(initial),[plans,setPlans]=useState([]),[cursor,setCursor]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(null),[busy,setBusy]=useState(false)
  const [planRevision,setPlanRevision]=useState(0)
  const life=useRef(0),pending=useRef(false),fetching=useRef(false),retry=useRef(null),current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  useUnsavedCenterForm(JSON.stringify(fields)!==JSON.stringify(initial())?JSON.stringify(fields):null,busy)
  useEffect(()=>{const epoch=++life.current;fetching.current=true;setPlans([]);setCursor(null);setLoading(true);setError(null)
    centerPlans(centerId).then(result=>{if(current(epoch)){setPlans(result.plans);setCursor(result.nextCursor)}}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){fetching.current=false;setLoading(false)}})
    return()=>{life.current++;pending.current=false;fetching.current=false}
  },[centerId,ownerUid,planRevision])
  const more=async()=>{if(fetching.current||!cursor)return;const epoch=life.current;fetching.current=true;setLoading(true)
    try{const result=await centerPlans(centerId,{cursor});if(current(epoch)){setPlans(previous=>[...previous,...result.plans]);setCursor(result.nextCursor)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){fetching.current=false;setLoading(false)}}
  }
  const moreRef=useAutoMore(more),navigate=useCenterNavigation(),update=(key,value)=>setFields(previous=>({...previous,[key]:value}))
  const submit=async e=>{
    e.preventDefault();if(pending.current)return;const epoch=life.current;pending.current=true;setBusy(true);setError(null)
    const signature=JSON.stringify(fields);if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()}
    try{await centerCommand('/api/centers/classes/create',{centerId,fields,requestId:retry.current.id});if(current(epoch))saved()}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const ambiguous=(error?.data?.code||error?.code)==='class-time-ambiguous'
  return <Section title={t('New class')}><form className="centers-form" onSubmit={submit}>
    <p className="small muted">{t('Time zone')}: {timezone} · {t('No automatic fees or penalties.')}</p>
    <fieldset disabled={busy} className="centers-lifecycle-fields"><div className="centers-fields">
      <label className="centers-field"><span>{t('Class name')}</span><TextField required maxLength={120} value={fields.name} onChange={e=>update('name',e.target.value)}/></label>
      <label className="centers-field"><span>{t('Class room (optional)')}</span><TextField maxLength={120} value={fields.room} onChange={e=>update('room',e.target.value)}/></label>
      <label className="centers-field"><span>{t('Date')}</span><TextField type="date" required min={today} value={fields.date} onChange={e=>update('date',e.target.value)}/></label>
      <label className="centers-field"><span>{t('From')}</span><TimeField disabled={busy} required aria-label={t('From')} value={fields.startTime} onChange={value=>update('startTime',value)}/></label>
      <label className="centers-field"><span>{t('To')}</span><TimeField disabled={busy} required allowEnd aria-label={t('To')} value={fields.endTime} onChange={value=>update('endTime',value)}/></label>
      {[['Capacity','capacity',1,1000],['Waiting list capacity','waitlistCapacity',0,1000],['Cancellation notice (minutes)','cancelBeforeMinutes',0,10080]].map(([label,key,min,max])=><label key={key} className="centers-field"><span>{t(label)}</span><NumberField className="field" required nullable decimal={false} min={min} max={max} aria-label={t(label)} value={fields[key]} onChange={value=>update(key,value)}/></label>)}
    </div><h3>{t('Eligible plans')}</h3><div className="centers-class-plans">{plans.filter(plan=>!plan.archived).map(plan=><div key={plan.id}><Check label={plan.name} checked={fields.eligiblePlanIds.includes(plan.id)} onChange={checked=>update('eligiblePlanIds',checked?[...fields.eligiblePlanIds,plan.id]:fields.eligiblePlanIds.filter(id=>id!==plan.id))}/><span>{plan.name}</span></div>)}</div>
    {loading&&<p role="status">{t('Loading…')}</p>}{cursor&&<Button type="button" ref={moreRef} disabled={loading} onClick={more}>{t('Show more')}</Button>}
    {!loading&&!plans.length&&<p>{t('No membership plans available')}</p>}
    {(ambiguous||Object.values(fields.disambiguation||{}).some(Boolean))&&<><p>{t('Choose the first or second occurrence of this repeated hour.')}</p>{['start','end'].map(part=><SelectRow key={part} title={t(part==='start'?'From':'To')} value={fields.disambiguation?.[part]||''} options={[{value:'',label:t('Not configured')},{value:'earlier',label:t('First occurrence')},{value:'later',label:t('Second occurrence')}]} onChange={value=>update('disambiguation',{...(fields.disambiguation||{}),[part]:value||null})}/>)}</>}
    </fieldset>{error&&<><p role="alert">{t(classesErrorKey(error))}</p>{!plans.length&&<Button type="button" disabled={busy||loading} onClick={()=>setPlanRevision(value=>value+1)}>{t('Retry')}</Button>}</>}
    <div className="centers-actions"><Button type="button" disabled={busy} onClick={()=>navigate(close)}>{t('Back')}</Button><Button type="submit" variant="primary" disabled={busy||!fields.name.trim()||!fields.date||!fields.startTime||!fields.endTime||!fields.eligiblePlanIds.length||['capacity','waitlistCapacity','cancelBeforeMinutes'].some(key=>fields[key]==null)}>{t('Create class')}</Button></div>
  </form></Section>
}
function Content({centerId,ownerUid,own=false,canManage=false}){
  const [mode,setMode]=useState('list'),[data,setData]=useState(null),[dataCenter,setDataCenter]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[revision,setRevision]=useState(0)
  const [filters,setFilters]=useState({from:'',to:''}),[applied,setApplied]=useState(null),[reason,setReason]=useState('')
  const life=useRef(0),pending=useRef(false),retry=useRef(null),latest=useRef(null),navigate=useCenterNavigation()
  const changeMode=next=>{setData(null);setMode(next)}
  latest.current={data,reason,mode};const current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  useUnsavedCenterForm(reason?reason:null,busy)
  useEffect(()=>{
    const epoch=++life.current;pending.current=true;retry.current=null;setBusy(true);setData(null);setError(null);setReason('')
    if(mode==='create'){pending.current=false;setBusy(false);return()=>{life.current++}}
    const request=mode==='list'?centerClasses(centerId,{own,...(applied||{})}):centerClassRoster(centerId,mode.slice(7))
    request.then(result=>{if(current(epoch)){setData(result);if(mode==='list'){setDataCenter({...result.center,today:result.today});setFilters({from:result.from,to:result.to})}}}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,ownerUid,own,canManage,mode,applied,revision])
  const run=async(path,body,epoch=life.current)=>{
    if(!current(epoch)||pending.current)return;pending.current=true;setBusy(true);setError(null)
    const content={centerId,...body},signature=JSON.stringify([path,content]);if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()}
    try{await centerCommand(path,{...content,requestId:retry.current.id});if(current(epoch)){retry.current=null;setRevision(value=>value+1)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const confirm=(title,event,path,body)=>{
    const epoch=life.current,origin=latest.current
    confirmSheet({title:t(title),message:event.name+' · '+classSchedule(event,dateLocale())+' · '+t('No automatic fees or penalties.'),confirmText:t('Confirm'),danger:path==='/api/centers/classes/cancel',onConfirm:()=>{
      if(!current(epoch)||latest.current.mode!==origin.mode||latest.current.data!==origin.data||latest.current.reason!==origin.reason)return
      run(path,body,epoch)
    }})
  }
  const more=async()=>{
    if(pending.current||!data?.nextCursor)return;const epoch=life.current;pending.current=true;setBusy(true);setError(null)
    try{const result=mode==='list'?await centerClasses(centerId,{own,from:data.from,to:data.to,cursor:data.nextCursor}):await centerClassRoster(centerId,mode.slice(7),{cursor:data.nextCursor});if(current(epoch))setData(previous=>({...previous,...result,[mode==='list'?'classes':'reservations']:[...previous[mode==='list'?'classes':'reservations'],...result[mode==='list'?'classes':'reservations']]}))}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const moreRef=useAutoMore(more)
  if(mode==='create'&&canManage&&!own)return <ClassEditor key={centerId+':'+ownerUid} centerId={centerId} ownerUid={ownerUid} timezone={dataCenter?.timezone} today={dataCenter?.today} close={()=>changeMode('list')} saved={()=>{changeMode('list');setRevision(value=>value+1)}}/>
  return <Section title={t(mode==='list'?'Classes':'Class roster')}><div className="centers-form">
    <p className="small muted">{t('No automatic fees or penalties.')}</p>
    {mode==='list'&&<>
      {dataCenter&&<p className="small muted">{t('Time zone')}: {dataCenter.timezone}</p>}
      {dataCenter&&dataCenter.state!=='active'&&<p role="status">{t('Inactive center')}</p>}
      <form onSubmit={e=>{e.preventDefault();setApplied(filters.from&&filters.to?{...filters}:null);setRevision(value=>value+1)}}><div className="centers-fields">{['from','to'].map(key=><label key={key} className="centers-field"><span>{t(key==='from'?'From':'To')}</span><TextField type="date" required disabled={busy} value={filters[key]} onChange={e=>setFilters(previous=>({...previous,[key]:e.target.value}))}/></label>)}</div><Button type="submit" disabled={busy}>{t('Apply')}</Button></form>
      {canManage&&!own&&<Button type="button" variant="primary" disabled={busy||!dataCenter||dataCenter.state!=='active'} onClick={()=>changeMode('create')}>{t('New class')}</Button>}
      {data?.classes.map(event=>{const reservation=event.ownReservation,held=reservation&&['booked','waiting','attended'].includes(reservation.state),available=event.booked<event.capacity,eventActive=event.state==='scheduled',centerActive=data.center.state==='active';return <article key={event.id} className="centers-class-card"><h3>{event.name}</h3><p>{classSchedule(event,dateLocale())}</p>{event.room&&<p>{t('Class room')}: {event.room}</p>}<p className="small muted">{t('Capacity')}: {event.booked}/{event.capacity} · {t('Waiting list')}: {event.waiting}/{event.waitlistCapacity}</p>
        {event.cancelReason&&<p>{t('Canceled')}: {event.cancelReason}</p>}{reservation&&<Row title={t(status(reservation.state))}/>}
        {own&&eventActive&&event.bookingOpen&&!held&&<><Button type="button" variant={available?'primary':'tinted'} disabled={busy||!centerActive||!event.eligible||!available&&event.waiting>=event.waitlistCapacity} onClick={()=>confirm(available?'Reserve place':'Join waiting list',event,'/api/centers/own/classes/reserve',{id:event.id})}>{t(available?'Reserve place':'Join waiting list')}</Button>{!event.eligible&&<p className="small muted">{t('Your membership or plan does not allow this class.')}</p>}{!available&&event.waiting>=event.waitlistCapacity&&<p>{t('This class is full.')}</p>}</>}
        {own&&eventActive&&reservation&&['booked','waiting'].includes(reservation.state)&&<><Button type="button" variant="tinted" disabled={busy||!centerActive||!event.canCancel} onClick={()=>confirm('Cancel reservation',event,'/api/centers/own/classes/cancel',{id:reservation.id,version:reservation.version})}>{t('Cancel reservation')}</Button>{!event.canCancel&&<p className="small muted">{t('Booking or cancellation is closed.')}</p>}</>}
        {canManage&&!own&&<Button type="button" disabled={busy} onClick={()=>changeMode('roster:'+event.id)}>{t('Class roster')}</Button>}
      </article>})}{data&&!data.classes.length&&<p>{t('No classes available.')}</p>}
    </>}
    {mode.startsWith('roster:')&&data&&<><h3>{data.event.name}</h3><p>{classSchedule(data.event,dateLocale())}</p>{data.event.room&&<p>{t('Class room')}: {data.event.room}</p>}<Button type="button" disabled={busy} onClick={()=>navigate(()=>changeMode('list'))}>{t('Back')}</Button>
      {data.reservations.map(row=><div key={row.id} className="centers-class-reservation"><Row title={row.name} subtitle={row.number} value={t(status(row.state))}/>{row.state==='booked'&&<div className="centers-actions"><Button type="button" variant="tinted" disabled={busy||!!reason||!data.event.attendanceOpen} onClick={()=>confirm('Attended',data.event,'/api/centers/classes/attendance',{id:row.id,version:row.version,state:'attended'})}>{t('Attended')}</Button><Button type="button" variant="ghost" disabled={busy||!!reason||!data.event.noShowOpen} onClick={()=>confirm('No-show',data.event,'/api/centers/classes/attendance',{id:row.id,version:row.version,state:'no-show'})}>{t('No-show')}</Button></div>}</div>)}
      {!data.reservations.length&&<p>{t('No reservations available.')}</p>}
      {data.event.canCancelClass&&<form onSubmit={e=>{e.preventDefault();confirm('Cancel class',data.event,'/api/centers/classes/cancel',{id:data.event.id,version:data.event.version,reason:reason.trim()})}}><label className="centers-field"><span>{t('Reason')}</span><TextArea required maxLength={250} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="centers-actions"><Button type="button" disabled={busy} onClick={()=>setReason('')}>{t('Cancel')}</Button><Button type="submit" variant="danger" disabled={busy||!reason.trim()}>{t('Cancel class')}</Button></div></form>}
    </>}
    {data?.nextCursor&&<Button ref={moreRef} type="button" disabled={busy} onClick={more}>{t('Show more')}</Button>}
    {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(classesErrorKey(error))}</p>}
    <Button type="button" disabled={busy} onClick={()=>navigate(()=>setRevision(value=>value+1))}>{t('Reload centers')}</Button>
  </div></Section>
}
export default function Classes(props){return <Content key={JSON.stringify([props.centerId,props.ownerUid,!!props.own,!!props.canManage])} {...props}/>}

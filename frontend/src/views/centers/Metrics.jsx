import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button,TextField} from '../../components/ui.jsx'
import {centerMetrics,metricsErrorKey} from '../../lib/centers-api.js'
import {minorToPrice} from '../../lib/membership-price.js'
import {centerDateTime} from '../../lib/center-time.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {t} from '../../lib/i18n.js'

const signedPrice=value=>typeof value==='string'&&value.startsWith('-')?'−'+minorToPrice(value.slice(1)):minorToPrice(value)
export default function Metrics({centerId,ownerUid,global=false,timezone='UTC',period,onPeriod}){
  const [report,setReport]=useState(null),[from,setFrom]=useState(''),[to,setTo]=useState(''),[query,setQuery]=useState({}),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(null)
  const life=useRef(0),current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const applied=period||query
  useEffect(()=>{
    const epoch=++life.current;setReport(null);setBusy(true);setError(null)
    centerMetrics(centerId,applied,global).then(data=>{if(current(epoch)){if(data.definitionVersion!==1)throw new Error('unsupported metrics definition');setReport(data);setFrom(data.period.from);setTo(data.period.to)}}).catch(e=>{if(current(epoch)){setError(e);useCenters.getState().revokeOn(e)}}).finally(()=>{if(current(epoch))setBusy(false)})
    return()=>{life.current++}
  },[centerId,ownerUid,global,applied.from,applied.to,revision])
  const submit=e=>{e.preventDefault();if(busy||!current(life.current))return;if(!!from!==!!to){setError({code:'invalid-metrics-period'});return}const next=from?{from,to}:{};if(onPeriod)onPeriod(next);else setQuery(next)}
  const money=(key,label,value)=> <Row key={key} title={t(label)} value={value==null?t('Not configured'):signedPrice(value)+' '+report.currency}/>
  return <><Section title={t(global?'Global center metrics':'Center metrics')}><div className="centers-form">
    <p className="small muted">{t('Business dates use each center’s time zone.')}</p>
    <form className="centers-form" onSubmit={submit}><div className="centers-fields">
      <label className="centers-field"><span>{t('From')}</span><TextField type="date" value={from} disabled={busy} onChange={e=>setFrom(e.target.value)}/></label>
      <label className="centers-field"><span>{t('To')}</span><TextField type="date" value={to} disabled={busy} onChange={e=>setTo(e.target.value)}/></label>
    </div><Button type="submit" disabled={busy}>{t('Apply')}</Button></form>
    <Button disabled={busy} onClick={()=>setRevision(n=>n+1)}>{t('Reload centers')}</Button>
    {report&&<Row title={t('Snapshot time')} value={centerDateTime(report.capturedAt,timezone)+' '+timezone}/>}
    {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(metricsErrorKey(error))}</p>}
  </div></Section>
  {report&&<>
    <Section title={t('Current membership totals')}>
      {global&&<Row title={t('Centers')} value={report.centerCount}/>}
      {[['members','Members'],['active','Active memberships'],['frozen','Frozen memberships'],['ended','Ended memberships'],['preactive','Pending activation'],['subscriptions','Current contracts']].map(([key,label])=><Row key={key} title={t(label)} value={report.current[key]}/>)}
      {money('outstanding','Outstanding balance',report.current.outstandingMinor)}{money('overdue','Overdue balance',report.current.overdueMinor)}
    </Section>
    {report.attendance&&<Section title={t('Visit metrics')}><div className="centers-form">
      {[['admissions','Validated admissions'],['visitingMemberships','Visiting center memberships'],['memberDays','Membership visit days'],['centerDaysWithVisits','Days with visits per center']].map(([key,label])=><Row key={key} title={t(label)} value={report.attendance[key]}/>)}
      <p className="small muted">{t('Live occupancy is unavailable because exits are not recorded.')}</p>
      {report.attendance.admissions==='0'?<p>{t('No admissions in this period.')}</p>:<>
        <details><summary>{t('Admissions by date')}</summary>{report.attendance.days.map(day=><Row key={day.date} title={day.date} value={day.admissions} subtitle={t('Visiting center memberships')+': '+day.memberships}/>)}</details>
        <details><summary>{t('Admissions by local hour')}</summary>{report.attendance.hours.filter(hour=>hour.admissions!=='0').map(hour=><Row key={hour.hour} title={String(hour.hour).padStart(2,'0')+':00'} value={hour.admissions}/>)}</details>
      </>}
    </div></Section>}
    <Section title={t('Contract and payment metrics')}><div className="centers-form">
      <Row title={t('Reporting period')} value={report.period.from+' → '+report.period.to}/>
      {[['registeredMembers','New member records'],['activations','Membership activations'],['terminations','Membership terminations'],['receiptsIssued','Issued receipts']].map(([key,label])=><Row key={key} title={t(label)} value={report.period[key]}/>)}
      {[['receiptTotalMinor','Receipt total'],['collectionsMinor','Registered collections'],['refundsMinor','Registered refunds'],['netCollectionsMinor','Net registered collections']].map(([key,label])=>money(key,label,report.period[key]))}
    </div></Section>
  </>}
  </>
}

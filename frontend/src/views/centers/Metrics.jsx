import {useEffect,useMemo,useRef,useState} from 'react'
import LineChart from '../../components/LineChart.jsx'
import {Section,Row,Button,TextField} from '../../components/ui.jsx'
import {centerMetrics,metricsErrorKey} from '../../lib/centers-api.js'
import {minorToPrice} from '../../lib/membership-price.js'
import {centerDateTime} from '../../lib/center-time.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {t} from '../../lib/i18n.js'

const signedPrice=value=>typeof value==='string'&&value.startsWith('-')?'−'+minorToPrice(value.slice(1)):minorToPrice(value)
export default function Metrics({centerId,ownerUid,global=false,timezone='UTC',period,onPeriod,onNavigate,canViewMembers=false}){
  const [report,setReport]=useState(null),[from,setFrom]=useState(''),[to,setTo]=useState(''),[query,setQuery]=useState({}),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(null)
  const life=useRef(0),current=epoch=>life.current===epoch&&useStore.getState().user?.id===ownerUid
  const applied=period||query
  useEffect(()=>{
    const epoch=++life.current;setReport(null);setBusy(true);setError(null)
    centerMetrics(centerId,applied,global).then(data=>{if(current(epoch)){if(data.definitionVersion!==1)throw new Error('unsupported metrics definition');setReport(data);setFrom(data.period.from);setTo(data.period.to)}}).catch(e=>{if(current(epoch)){setError(e);useCenters.getState().revokeOn(e)}}).finally(()=>{if(current(epoch))setBusy(false)})
    return()=>{life.current++}
  },[centerId,ownerUid,global,applied.from,applied.to,revision])
  const submit=e=>{e.preventDefault();if(busy||!current(life.current))return;if(!!from!==!!to){setError({code:'invalid-metrics-period'});return}const next=from?{from,to}:{};if(onPeriod)onPeriod(next);else setQuery(next)}
  const states=report?[['active','Active memberships','var(--acc)'],['frozen','Frozen memberships','var(--yellow)'],['preactive','Pending activation','var(--blue)'],['ended','Ended memberships','var(--label-2)']]:[]
  const share=(value,total)=>{try{const n=BigInt(value||'0'),d=BigInt(total||'0');return d>0n?Number(n*10000n/d)/100:0}catch{return 0}}
  const points=useMemo(()=>{
    if(!report?.attendance)return []
    const counts=new Map(report.attendance.days.map(d=>[d.date,d.admissions])),result=[]
    const start=Date.parse(report.period.from+'T12:00:00Z'),end=Date.parse(report.period.to+'T12:00:00Z')
    for(let at=start;at<=end&&result.length<366;at+=86400000){const d=new Date(at).toISOString().slice(0,10),y=Number(counts.get(d)||'0');if(!Number.isSafeInteger(y))return [];result.push({t:at,d,y})}
    return result
  },[report])
  const amount=value=>value==null?t('Not configured'):signedPrice(value)+' '+report.currency
  const stat=(label,value,tone,subtitle)=><article className="centers-metric-stat" style={{'--metric-tone':tone}}><span className="small muted">{t(label)}</span><strong className="centers-metric-number">{value}</strong>{subtitle&&<span className="small muted">{subtitle}</span>}</article>
  const money=(key,label,value)=> <Row key={key} title={t(label)} value={value==null?t('Not configured'):signedPrice(value)+' '+report.currency}/>
  return <><Section title={t(global?'Global center metrics':'Center metrics')}><div className="centers-form">
    <p className="small muted">{t('Business dates use each center’s time zone.')}</p>
    <form className="centers-metrics-filter" onSubmit={submit}><div className="centers-fields">
      <label className="centers-field"><span>{t('From')}</span><TextField type="date" value={from} disabled={busy} onChange={e=>setFrom(e.target.value)}/></label>
      <label className="centers-field"><span>{t('To')}</span><TextField type="date" value={to} disabled={busy} onChange={e=>setTo(e.target.value)}/></label>
    </div><Button type="submit" variant="primary" disabled={busy}>{t('Apply')}</Button></form>
    <div className="centers-metrics-links"><Button variant="tinted" disabled={busy} onClick={()=>setRevision(n=>n+1)}>{t('Reload centers')}</Button></div>
    {report&&<Row title={t('Snapshot time')} value={centerDateTime(report.capturedAt,timezone)+' '+timezone}/>}
    {busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(metricsErrorKey(error))}</p>}
  </div></Section>
  {report&&<div className="centers-metrics-dashboard">
    <div className="centers-metric-stats">
      {stat('Active memberships',report.current.active,'var(--acc)',share(report.current.active,report.current.members)+'% · '+report.current.members+' '+t('Members'))}
      {stat('Net registered collections',amount(report.period.netCollectionsMinor),'var(--blue)',report.period.from+' → '+report.period.to)}
      {stat('Outstanding balance',amount(report.current.outstandingMinor),'var(--yellow)',t('Current membership totals'))}
      {stat('Overdue balance',amount(report.current.overdueMinor),'var(--red)',t('Current membership totals'))}
    </div>
    {onNavigate&&<div className="centers-metrics-links">{canViewMembers&&<Button variant="tinted" onClick={()=>onNavigate('members')}>{t('Members')}</Button>}<Button variant="tinted" onClick={()=>onNavigate('billing')}>{t('Debt and calendar')}</Button></div>}
    <div className="centers-metrics-columns">
      <div className="centers-metrics-column">
      <Section title={t('Current membership totals')}><div className="centers-form">
        <div className="centers-member-distribution">
          <div className="centers-member-donut" aria-hidden="true" style={{background:(()=>{let edge=0;return 'conic-gradient('+states.map(([key,,color])=>{const start=edge;edge+=share(report.current[key],report.current.members);return color+' '+start+'% '+edge+'%'}).join(',')+')'})()}}><div><strong>{report.current.members}</strong><span>{t('Members')}</span></div></div>
          <div className="centers-member-legend">{states.map(([key,label,color])=><div key={key}><span className="centers-metric-dot" style={{background:color}}/><span>{t(label)}</span><strong>{report.current[key]}</strong><span className="small muted">{share(report.current[key],report.current.members)}%</span></div>)}</div>
        </div>
        {global&&<Row title={t('Centers')} value={report.centerCount}/>}
        <Row title={t('Current contracts')} value={report.current.subscriptions}/>
      </div></Section>
    {report.attendance&&<Section title={t('Visit metrics')}><div className="centers-form">
      <div className="centers-metric-mini-stats">{[['admissions','Validated admissions'],['visitingMemberships','Visiting center memberships'],['memberDays','Membership visit days'],['centerDaysWithVisits','Days with visits per center']].map(([key,label])=><div key={key}><strong>{report.attendance[key]}</strong><span className="small muted">{t(label)}</span></div>)}</div>
      <p className="small muted">{t('Live occupancy is unavailable because exits are not recorded.')}</p>
      {report.attendance.admissions==='0'?<p>{t('No admissions in this period.')}</p>:<>
        <div className="centers-metric-panels">
          <div><h3>{t('Admissions by date')}</h3><div className="chart" role="img" aria-label={t('Admissions by date')}><LineChart points={points} h={190} unit={t('Validated admissions')}/></div></div>
          <div><h3>{t('Admissions by local hour')}</h3><div className="centers-hour-bars">{report.attendance.hours.filter(hour=>hour.admissions!=='0').map(hour=><div key={hour.hour}><span>{String(hour.hour).padStart(2,'0')+':00'}</span><div className="centers-metric-track" aria-hidden="true"><span style={{width:share(hour.admissions,report.attendance.hours.reduce((max,h)=>BigInt(h.admissions)>BigInt(max)?h.admissions:max,'0'))+'%'}}/></div><strong>{hour.admissions}</strong></div>)}</div></div>
        </div>
        <details className="centers-metric-detail"><summary>{t('Admissions by date')}</summary>{report.attendance.days.map(day=><Row key={day.date} title={day.date} value={day.admissions} subtitle={t('Visiting center memberships')+': '+day.memberships}/>)}</details>
      </>}
    </div></Section>}
      </div>
      <div className="centers-metrics-column">
      <Section title={t('Contract and payment metrics')}><div className="centers-form">
        <p className="small muted">{t('Reporting period')}: {report.period.from+' → '+report.period.to}</p>
        <div className="centers-money-bars">{(()=>{
          const items=[['receiptTotalMinor','Receipt total','var(--label-2)'],['collectionsMinor','Registered collections','var(--acc)'],['refundsMinor','Registered refunds','var(--red)']]
          const max=items.reduce((n,[key])=>{const v=BigInt(report.period[key]||'0');return v>n?v:n},0n)
          return items.map(([key,label,color])=><div key={key}><div><span>{t(label)}</span><strong>{amount(report.period[key])}</strong></div><div className="centers-metric-track" aria-hidden="true"><span style={{width:share(report.period[key],max.toString())+'%',background:color}}/></div></div>)
        })()}</div>
        {money('netCollectionsMinor','Net registered collections',report.period.netCollectionsMinor)}
        <div className="centers-metric-mini-stats">{[['registeredMembers','New member records'],['activations','Membership activations'],['terminations','Membership terminations'],['receiptsIssued','Issued receipts']].map(([key,label])=><div key={key}><strong>{report.period[key]}</strong><span className="small muted">{t(label)}</span></div>)}</div>
      </div></Section>
      </div>
    </div>
  </div>}
  </>
}

import {useEffect,useRef,useState} from 'react'
import HelpLabel from '../../components/HelpLabel.jsx'
import {debtHelp} from './debt-help.js'
import Icon from '../../components/Icon.jsx'
import {Section,Row,Button,TextField,Segmented} from '../../components/ui.jsx'
import {centerDebt,centerDebtExport,debtErrorKey} from '../../lib/centers-api.js'
import {minorToPrice} from '../../lib/membership-price.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {t} from '../../lib/i18n.js'
import ManualMovement from './ManualMovement.jsx'
import {afterScrollRestore} from '../../components/Modals.jsx'

export const debtLabel=status=>status==='not-due'?t('Not due yet'):status==='due'?t('Due today'):status==='grace'?t('Within grace period'):status==='overdue'?t('Overdue'):t('Settled')
const empty={dueFrom:'',dueTo:''}
const filterOptions=value=>value.dueFrom&&value.dueTo?value:{}
export default function DebtCalendar({centerId,ownerUid,canExport=false,canRecord=false}) {
  const [mode,setMode]=useState('debts'),[draft,setDraft]=useState(empty),[filters,setFilters]=useState(empty),[revision,setRevision]=useState(0)
  const [data,setData]=useState(null),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null)
  const life=useRef(0),pending=useRef(false),current=epoch=>epoch===life.current&&useStore.getState().user?.id===ownerUid
  const detail=useRef(null)
  useEffect(()=>{if(!selected)return;const epoch=life.current;return afterScrollRestore(()=>{if(current(epoch)&&detail.current){detail.current.focus({preventScroll:true});detail.current.scrollIntoView?.({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}})},[selected])
  const fail=e=>{setError(e);useCenters.getState().revokeOn(e)}
  useEffect(()=>{setMode('debts');setDraft(empty);setFilters(empty)},[centerId,ownerUid])
  useEffect(()=>{
    const epoch=++life.current;pending.current=true;setBusy(true);setData(null);setSelected(null);setError(null)
    centerDebt(centerId,{calendar:mode==='calendar',...filterOptions(filters)}).then(result=>{if(current(epoch)){setData(result);if(mode==='calendar'&&!filters.dueFrom)setDraft({dueFrom:result.dueFrom,dueTo:result.dueTo})}}).catch(e=>{if(current(epoch))fail(e)}).finally(()=>{if(current(epoch)){pending.current=false;setBusy(false)}})
    return()=>{life.current++;pending.current=false}
  },[centerId,ownerUid,mode,filters,revision,canExport])
  const more=async()=>{
    if(!data?.nextCursor||pending.current)return;const epoch=life.current;pending.current=true;setBusy(true)
    try{const result=await centerDebt(centerId,{calendar:mode==='calendar',...filterOptions(filters),cursor:data.nextCursor});if(current(epoch))setData(previous=>({...result,receipts:[...previous.receipts,...result.receipts]}))}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const moreRef=useAutoMore(more)
  const apply=e=>{e.preventDefault();if(pending.current)return;if(!!draft.dueFrom!==!!draft.dueTo||draft.dueFrom>draft.dueTo){setError({code:'invalid-input'});return}setFilters({...draft});setRevision(value=>value+1)}
  const quickRange=offset=>{
    if(pending.current||!data)return
    let range=empty
    if(offset!==null){const start=new Date(data.today+'T00:00:00Z');start.setUTCDate(1);start.setUTCMonth(start.getUTCMonth()+offset);const end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);range={dueFrom:start.toISOString().slice(0,10),dueTo:end.toISOString().slice(0,10)}}
    setDraft(range);setFilters(range);setError(null);setRevision(value=>value+1)
  }
  const download=async()=>{
    if(!canExport||pending.current)return;const epoch=life.current;pending.current=true;setBusy(true);setError(null)
    try{const result=await centerDebtExport(centerId,filterOptions(filters));if(current(epoch)){const url=URL.createObjectURL(new Blob([result.content],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=result.fileName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const money=value=>minorToPrice(value)+' EUR'
  const receiptCard=row=><article key={row.id} className={'centers-card centers-debt-receipt centers-debt-'+row.debt.status}>
    <div className="centers-debt-receipt-top"><span className="centers-member-status">{debtLabel(row.debt.status)}</span><span className="small muted">#{row.id.slice(-8)}</span></div>
    <Row title={row.memberName} subtitle={row.memberNumber+' · '+row.periodStart+' → '+row.periodEnd} value={money(row.balanceMinor)} accessory="chevron" onClick={()=>setSelected(row)}/>
    <p className="small muted">{t('Due date')}: <time dateTime={row.dueOn}>{row.dueOn}</time></p>
  </article>
  if(selected)return <Section title={t(canRecord&&BigInt(selected.balanceMinor)>0n?'Record payment':'Receipt details')} className="centers-debt"><div ref={detail} tabIndex={-1} className="centers-form"><div className="centers-debt-toolbar"><Button icon="chevronLeft" onClick={()=>setSelected(null)}>{t('Back')}</Button><span className="centers-member-status">{debtLabel(selected.debt.status)}</span></div><Row title={selected.memberName} value={selected.memberNumber}/><p className="small muted">{selected.id}</p>{canRecord&&BigInt(selected.balanceMinor)>0n&&<ManualMovement key={selected.id} centerId={centerId} memberId={selected.memberId} receiptId={selected.id} availableMinor={selected.balanceMinor} today={data.today} ownerUid={ownerUid} close={()=>setSelected(null)} changed={()=>{setSelected(null);setRevision(value=>value+1)}}/>}<Row title={t('Due date')} value={selected.dueOn}/><Row title={selected.periodStart+' → '+selected.periodEnd} value={debtLabel(selected.debt.status)}/><Row title={t('Total amount')} value={money(selected.totalMinor)}/><Row title={<HelpLabel title="Paid amount" help={debtHelp.paid}/>} value={money(selected.paidMinor)}/><Row title={t('Refunded amount')} value={money(selected.refundedMinor)}/><Row title={<HelpLabel title="Outstanding balance" help={debtHelp.outstanding}/>} value={money(selected.balanceMinor)}/></div></Section>
  const groups=data?[...data.receipts.reduce((map,row)=>{if(!map.has(row.dueOn))map.set(row.dueOn,[]);map.get(row.dueOn).push(row);return map},new Map())]:[]
  return <Section title={t('Debt and calendar')} className="centers-debt"><div className="centers-form">
    <Segmented label={t('Debt and calendar')} value={mode} options={[{value:'debts',label:t('Outstanding receipts')},{value:'calendar',label:t('Billing calendar')}]} onChange={value=>{setMode(value);setDraft(empty);setFilters(empty)}}/>
    <div className="centers-debt-description"><HelpLabel title={mode==='calendar'?'Billing calendar':'Outstanding receipts'} help={mode==='calendar'?debtHelp.calendar:debtHelp.outstanding}/><p className="small muted">{t('Only issued receipts are shown.')}</p></div>
    <div className="centers-debt-quick-dates"><Button variant="tinted" disabled={busy||!data} onClick={()=>quickRange(0)}>{t('This month')}</Button><Button variant="tinted" disabled={busy||!data} onClick={()=>quickRange(-1)}>{t('Previous month')}</Button>{mode==='debts'&&<Button disabled={busy||!data} onClick={()=>quickRange(null)}>{t('All dates')}</Button>}</div>
    <form className="centers-debt-filter" onSubmit={apply}><div className="centers-fields"><div className="centers-field"><HelpLabel title="From" help={debtHelp.calendar}/><TextField aria-label={t('From')} type="date" disabled={busy} value={draft.dueFrom} onChange={e=>setDraft({...draft,dueFrom:e.target.value})}/></div><label className="centers-field"><span>{t('To')}</span><TextField type="date" disabled={busy} value={draft.dueTo} onChange={e=>setDraft({...draft,dueTo:e.target.value})}/></label></div><Button type="submit" variant="primary" disabled={busy}>{t('Apply filters')}</Button></form>
    {data&&<><div className="centers-debt-summary">
      <article><HelpLabel title="Outstanding balance" help={debtHelp.outstanding}/><strong>{money(data.summary.outstandingMinor)}</strong></article>
      <article className="centers-debt-overdue"><HelpLabel title="Overdue balance" help={debtHelp.overdue}/><strong>{money(data.summary.overdueMinor)}</strong></article>
      <article><span>{t('Receipts')}</span><strong>{data.summary.receiptCount}</strong></article>{data.renewals&&<article className="centers-renewals-pending"><span>{t('Pending renewals')}</span><strong>{data.renewals.memberCount}</strong><span className="small muted">{data.renewals.month.slice(0,7)}</span><p className="small muted">{t('Active monthly members who paid last month and have not fully paid this month, including unissued receipts. Independent of date filters.')}</p></article>}
    </div><div className="centers-debt-context"><span>{t('Business date')}: {data.today}</span><HelpLabel title="Grace period (days)" help={debtHelp.overdue}>{': '+data.policy.graceDays}</HelpLabel></div></>}
    <div className="centers-debt-list">{mode==='calendar'?groups.map(([day,receipts])=><div key={day} className="centers-debt-day"><h3><time dateTime={day}>{day}</time></h3>{receipts.map(receiptCard)}</div>):data?.receipts.map(receiptCard)}</div>
    {data&&!data.receipts.length&&!busy&&!error&&<div className="centers-metric-empty"><Icon name="info"/><p>{t('No receipts in this view.')}</p></div>}{busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(debtErrorKey(error))}</p>}
    <div className="centers-debt-toolbar">{data?.nextCursor&&<Button ref={moreRef} variant="tinted" disabled={busy} onClick={more}>{t('Show more')}</Button>}{canExport&&mode==='debts'&&data&&<Button variant="tinted" disabled={busy} onClick={download}>{t('Export debts (CSV)')}</Button>}</div>
  </div></Section>
}

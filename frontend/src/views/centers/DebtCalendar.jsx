import {useEffect,useRef,useState} from 'react'
import {Section,Row,Button,TextField,Segmented} from '../../components/ui.jsx'
import {centerDebt,centerDebtExport,debtErrorKey} from '../../lib/centers-api.js'
import {minorToPrice} from '../../lib/membership-price.js'
import {useAutoMore} from '../../lib/use-auto-more.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {t} from '../../lib/i18n.js'

export const debtLabel=status=>status==='not-due'?t('Not due yet'):status==='due'?t('Due today'):status==='grace'?t('Within grace period'):status==='overdue'?t('Overdue'):t('Settled')
const empty={dueFrom:'',dueTo:''}
const filterOptions=value=>value.dueFrom&&value.dueTo?value:{}
export default function DebtCalendar({centerId,ownerUid,canExport=false}) {
  const [mode,setMode]=useState('debts'),[draft,setDraft]=useState(empty),[filters,setFilters]=useState(empty),[revision,setRevision]=useState(0)
  const [data,setData]=useState(null),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null)
  const life=useRef(0),pending=useRef(false),current=epoch=>epoch===life.current&&useStore.getState().user?.id===ownerUid
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
  const download=async()=>{
    if(!canExport||pending.current)return;const epoch=life.current;pending.current=true;setBusy(true);setError(null)
    try{const result=await centerDebtExport(centerId,filterOptions(filters));if(current(epoch)){const url=URL.createObjectURL(new Blob([result.content],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=result.fileName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}}catch(e){if(current(epoch))fail(e)}finally{if(current(epoch)){pending.current=false;setBusy(false)}}
  }
  const money=value=>minorToPrice(value)+' EUR'
  if(selected)return <Section title={t('Receipt details')}><div className="centers-form"><Row title={selected.memberName} value={selected.memberNumber}/><Row title={t('Due date')} value={selected.dueOn}/><Row title={selected.periodStart+' → '+selected.periodEnd} value={debtLabel(selected.debt.status)}/><Row title={t('Total amount')} value={money(selected.totalMinor)}/><Row title={t('Paid amount')} value={money(selected.paidMinor)}/><Row title={t('Refunded amount')} value={money(selected.refundedMinor)}/><Row title={t('Outstanding balance')} value={money(selected.balanceMinor)}/><Button onClick={()=>setSelected(null)}>{t('Back')}</Button></div></Section>
  return <Section title={t('Debt and calendar')}><div className="centers-form">
    <Segmented value={mode} options={[{value:'debts',label:t('Outstanding receipts')},{value:'calendar',label:t('Billing calendar')}]} onChange={value=>{setMode(value);setDraft(empty);setFilters(empty)}}/>
    <form onSubmit={apply}><div className="centers-fields"><label className="centers-field"><span>{t('From')}</span><TextField type="date" disabled={busy} value={draft.dueFrom} onChange={e=>setDraft({...draft,dueFrom:e.target.value})}/></label><label className="centers-field"><span>{t('To')}</span><TextField type="date" disabled={busy} value={draft.dueTo} onChange={e=>setDraft({...draft,dueTo:e.target.value})}/></label></div><Button type="submit" disabled={busy}>{t('Apply filters')}</Button></form>
    {data&&<><p className="small muted">{data.today+' · '+t('Grace period (days)')+': '+data.policy.graceDays}</p><Row title={t('Outstanding balance')} value={money(data.summary.outstandingMinor)}/><Row title={t('Overdue balance')} value={money(data.summary.overdueMinor)}/><p className="small muted">{t('Receipts')+': '+data.summary.receiptCount}</p></>}
    <p className="small muted">{t('Only issued receipts are shown.')}</p>
    {data?.receipts.map(row=><Row key={row.id} title={row.memberName+' · '+row.memberNumber} subtitle={row.dueOn+' · '+debtLabel(row.debt.status)} value={money(row.balanceMinor)} accessory="chevron" onClick={()=>setSelected(row)}/>)}
    {data&&!data.receipts.length&&!busy&&!error&&<p className="muted">{t('No receipts in this view.')}</p>}{busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(debtErrorKey(error))}</p>}
    {data?.nextCursor&&<Button ref={moreRef} disabled={busy} onClick={more}>{t('Show more')}</Button>}{canExport&&mode==='debts'&&data&&<Button disabled={busy} onClick={download}>{t('Export debts (CSV)')}</Button>}
  </div></Section>
}
